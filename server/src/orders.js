import crypto from 'node:crypto';

import { config } from './config.js';
import { orders } from './db.js';
import { kicb, KicbError, QR_STATUS, QR_STATUS_NAME } from './kicb.js';
import { sendTicket } from './mailer.js';
import { priceCart, CURRENCY } from './tariffs.js';

/** Не дёргаем банк чаще, чем раз в 1.5 с на заказ — фронт опрашивает нас чаще. */
const CHECK_THROTTLE_MS = 1500;
/** Статус 0 (NotFound) сразу после создания — банк ещё не разнёс QR. Ждём. */
const NOT_FOUND_GRACE_MS = 60_000;
/**
 * Сколько ещё ждём заказ, который на момент истечения QR был в InProgress:
 * человек уже подтверждает списание в приложении банка, и отмена в этот момент
 * рискует снять деньги без билета.
 */
const IN_FLIGHT_GRACE_MS = 5 * 60_000;

const TERMINAL_STATUSES = new Set(['paid', 'failed', 'expired', 'cancelled']);

/** id заказа уходит в банк как есть, ограничение — MAX(36) (раздел 3.1). */
function newOrderId() {
  return `aim-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

/** Код билета для человека: без похожих символов, читается вслух по телефону. */
function newTicketCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (n) =>
    Array.from(crypto.randomBytes(n), (b) => alphabet[b % alphabet.length]).join('');
  return `AIM-${pick(4)}-${pick(4)}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function normaliseEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    const err = new Error('Некорректный e-mail');
    err.statusCode = 400;
    throw err;
  }
  return email;
}

/**
 * Создаёт заказ и получает QR у банка. Сумму считает `priceCart` — из тела
 * запроса берутся только id тарифов и количества.
 */
export async function createOrder({ items, email, lang }) {
  const cart = priceCart(items);
  const address = normaliseEmail(email);

  // Простой предохранитель от накрутки: не больше 5 живых заказов на адрес.
  if (orders.openCountForEmail(address, 10 * 60_000) >= 5) {
    const err = new Error('Слишком много незавершённых заказов. Завершите или отмените их.');
    err.statusCode = 429;
    throw err;
  }

  const now = Date.now();
  const id = newOrderId();

  // Сумма уходит в банк в сомах: decimal NUMERIC(10,2).
  const link = await kicb.getLink({ id, amount: cart.amount / 100 });

  return orders.insert({
    id,
    created_at: now,
    updated_at: now,
    expires_at: now + config.orderTtlMs,
    status: 'pending',
    amount: cart.amount,
    currency: link.currency || CURRENCY,
    seats: cart.seats,
    items: cart.items,
    email: address,
    lang: ['ru', 'ky', 'en'].includes(lang) ? lang : 'ru',
    qr_link: link.qrLink,
  });
}

/**
 * Приводит локальный статус заказа в соответствие с банком.
 * Вызывается и из запроса браузера, и из фонового поллера.
 */
export async function syncOrder(order) {
  if (!order || TERMINAL_STATUSES.has(order.status)) return order;

  // Время QR вышло — гасим его в банке, чтобы не оплатили просроченный.
  // Но не тогда, когда банк уже говорит «платёж идёт»: человек стоит в
  // приложении банка и подтверждает списание, обрывать его на полпути нельзя —
  // деньги могут уйти, а билета не будет. Такому заказу даём отдельный запас.
  const inFlight = order.kicb_status === QR_STATUS.IN_PROGRESS;
  const deadline = order.expires_at + (inFlight ? IN_FLIGHT_GRACE_MS : 0);

  if (Date.now() > deadline) {
    try {
      await kicb.abortPayment(order.id);
    } catch (err) {
      // QR мог уже протухнуть на стороне банка — это не повод падать.
      if (!(err instanceof KicbError)) throw err;
    }
    if (inFlight) {
      console.warn(`Заказ ${order.id}: платёж висел в InProgress дольше запаса, гасим QR`);
    }
    return orders.setStatus(order.id, 'expired', { kicbStatus: order.kicb_status });
  }

  if (order.last_checked_at && Date.now() - order.last_checked_at < CHECK_THROTTLE_MS) {
    return order;
  }

  let state;
  try {
    state = await kicb.checkStatus(order.id);
  } catch (err) {
    // Банк недоступен — оставляем статус как есть, фронт продолжит опрашивать.
    orders.touchChecked(order.id);
    return orders.setStatus(order.id, order.status, {
      kicbStatus: order.kicb_status,
      error: err.message,
    });
  }

  // Историю платежа в БД не храним — достаточно следа в журнале: по нему потом
  // видно, дошёл ли банк до Success и на каком шаге всё встало.
  if (state.status !== order.kicb_status) {
    const was = QR_STATUS_NAME[order.kicb_status] ?? order.kicb_status ?? '—';
    console.info(`Заказ ${order.id}: банк ${was} → ${QR_STATUS_NAME[state.status] ?? state.status}`);
  }

  switch (state.status) {
    case QR_STATUS.SUCCESS: {
      const code = newTicketCode();
      // markPaid отдаёт true только тому, кто реально совершил переход, —
      // письмо уходит один раз даже при гонке поллера и браузера.
      if (orders.markPaid(order.id, code)) {
        deliverTicket(orders.byId(order.id));
      }
      return orders.byId(order.id);
    }

    case QR_STATUS.FAILED:
      return orders.setStatus(order.id, 'failed', {
        kicbStatus: state.status,
        error: state.description,
      });

    case QR_STATUS.IN_PROGRESS:
      return orders.setStatus(order.id, 'processing', { kicbStatus: state.status });

    case QR_STATUS.NOT_FOUND:
      // Молодой заказ — банк ещё не успел; старый — QR потерян, это провал.
      if (Date.now() - order.created_at > NOT_FOUND_GRACE_MS) {
        return orders.setStatus(order.id, 'failed', {
          kicbStatus: state.status,
          error: 'QR не найден на стороне банка',
        });
      }
      orders.touchChecked(order.id);
      return orders.byId(order.id);

    default:
      return orders.setStatus(order.id, 'pending', { kicbStatus: state.status });
  }
}

/** Отмена по кнопке «закрыть». Оплаченный заказ отменить нельзя. */
export async function cancelOrder(order) {
  if (order.status === 'paid') return order;
  if (TERMINAL_STATUSES.has(order.status)) return order;

  try {
    await kicb.abortPayment(order.id);
  } catch (err) {
    if (!(err instanceof KicbError)) throw err;
  }
  return orders.setStatus(order.id, 'cancelled', { kicbStatus: QR_STATUS.FAILED });
}

/** Отправка билета в фоне: оплата не должна ждать SMTP. */
function deliverTicket(order) {
  if (!order?.ticket_code) return;

  sendTicket(order)
    .then(() => orders.markMailSent(order.id))
    .catch((err) => {
      console.error(`Не удалось отправить билет ${order.ticket_code}:`, err.message);
      orders.bumpMailAttempts(order.id, err.message);
    });
}

/**
 * Фоновая сверка. Нужна, потому что вебхуков у KICB нет: если человек оплатил
 * и закрыл вкладку, узнать об этом можно только опросив банк самим.
 * Заодно повторяет неотправленные письма.
 */
export function startReconciler({ intervalMs = 5000 } = {}) {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const order of orders.openOrders()) {
        await syncOrder(order).catch((err) =>
          console.error(`Сверка заказа ${order.id} не удалась:`, err.message)
        );
      }
      for (const order of orders.pendingMail()) {
        deliverTicket(order);
      }
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** То, что можно показывать браузеру: без внутренних полей и ошибок банка. */
export function publicOrder(order) {
  return {
    id: order.id,
    status: order.status,
    amount: order.amount / 100,
    currency: order.currency,
    items: order.items.map((i) => ({ tariff: i.tariff, qty: i.qty, price: i.price / 100 })),
    seats: order.seats,
    email: order.email,
    qrLink: order.status === 'pending' || order.status === 'processing' ? order.qr_link : null,
    expiresAt: order.expires_at,
    ticketCode: order.ticket_code ?? null,
    mailSent: Boolean(order.mail_sent_at),
  };
}
