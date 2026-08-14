import crypto from 'node:crypto';
import QRCode from 'qrcode';

import { config } from './config.js';
import { orders } from './db.js';
import { KicbError } from './kicb.js';
import { cancelOrder, createOrder, publicOrder, resendTicket, syncOrder } from './orders.js';
import { publicTariffs } from './tariffs.js';

/**
 * Простое окно запросов на IP. Своего лимитера хватает: нагрузка — десятки
 * заказов в день, а лишняя зависимость на VPS никому не нужна.
 */
function rateLimiter({ limit, windowMs }) {
  const hits = new Map();

  return function check(ip) {
    const now = Date.now();
    const bucket = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    bucket.push(now);
    hits.set(ip, bucket);

    // Подчищаем на каждом сотом обращении, чтобы карта не росла вечно.
    if (hits.size > 100 && Math.random() < 0.01) {
      for (const [key, times] of hits) {
        if (times.every((t) => now - t >= windowMs)) hits.delete(key);
      }
    }

    return bucket.length <= limit;
  };
}

const limitCreate = rateLimiter({ limit: 10, windowMs: 10 * 60_000 });
const limitPoll = rateLimiter({ limit: 600, windowMs: 5 * 60_000 });
// Подбор пароля к админке: 20 неудач за 15 минут с одного адреса — предел.
const limitAdminAuth = rateLimiter({ limit: 20, windowMs: 15 * 60_000 });

/**
 * Пускает в админку по токену из ADMIN_TOKEN. Сравнение постоянного времени —
 * иначе по задержке ответа пароль подбирается посимвольно.
 * Возвращает true, если можно продолжать; иначе ответ уже отправлен.
 */
function adminAllowed(req, reply) {
  if (!config.adminToken) {
    reply.code(503).send({
      error: 'admin_disabled',
      message: 'Админка выключена: в .env не задан ADMIN_TOKEN',
    });
    return false;
  }

  const header = req.headers.authorization || '';
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const expected = Buffer.from(config.adminToken);
  const ok = given.length === expected.length && crypto.timingSafeEqual(given, expected);

  if (!ok) {
    if (!limitAdminAuth(req.ip)) {
      reply.code(429).send({ error: 'rate_limited', message: 'Слишком много попыток входа' });
      return false;
    }
    req.log.warn({ ip: req.ip }, 'неудачный вход в админку');
    reply.code(401).send({ error: 'unauthorized', message: 'Неверный пароль' });
    return false;
  }

  return true;
}

/**
 * Заказ для админки: то же, что видит покупатель, плюс служебные поля —
 * статус на стороне банка, время проверки и последняя ошибка.
 */
function adminOrder(order) {
  return {
    ...publicOrder(order),
    createdAt: order.created_at,
    paidAt: order.paid_at,
    kicbStatus: order.kicb_status,
    lastCheckedAt: order.last_checked_at,
    lastError: order.last_error,
    mailAttempts: order.mail_attempts,
    mailSentAt: order.mail_sent_at,
  };
}

function notFound(reply) {
  return reply.code(404).send({ error: 'not_found', message: 'Заказ не найден' });
}

export async function registerRoutes(app) {
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/tariffs', async () => ({ tariffs: publicTariffs() }));

  // ── Создание заказа ─────────────────────────────────────────────────────
  app.post('/api/orders', async (req, reply) => {
    if (!limitCreate(req.ip)) {
      return reply.code(429).send({ error: 'rate_limited', message: 'Слишком много попыток. Подождите немного.' });
    }

    const { items, email, lang } = req.body || {};
    const order = await createOrder({ items, email, lang });

    req.log.info({ orderId: order.id, amount: order.amount }, 'заказ создан');
    return reply.code(201).send({ order: publicOrder(order) });
  });

  // ── Статус заказа (фронт опрашивает его, пока идёт оплата) ──────────────
  app.get('/api/orders/:id', async (req, reply) => {
    if (!limitPoll(req.ip)) {
      return reply.code(429).send({ error: 'rate_limited', message: 'Слишком частые запросы' });
    }

    const existing = orders.byId(req.params.id);
    if (!existing) return notFound(reply);

    const order = await syncOrder(existing);
    return { order: publicOrder(order) };
  });

  // ── QR для оплаты. Картинкой, чтобы фронту не тащить генератор ──────────
  app.get('/api/orders/:id/qr.svg', async (req, reply) => {
    const order = orders.byId(req.params.id);
    if (!order?.qr_link) return notFound(reply);

    const svg = await QRCode.toString(order.qr_link, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#141009', light: '#0000' },
    });

    return reply
      .type('image/svg+xml')
      // Ссылка на QR неизменна всю жизнь заказа, но заказ живёт минуты.
      .header('Cache-Control', 'private, max-age=60')
      .send(svg);
  });

  // ── Отмена ──────────────────────────────────────────────────────────────
  app.post('/api/orders/:id/cancel', async (req, reply) => {
    const existing = orders.byId(req.params.id);
    if (!existing) return notFound(reply);

    const order = await cancelOrder(existing);
    return { order: publicOrder(order) };
  });

  // ── Админка: лента заказов и ручная сверка с банком ─────────────────────
  app.get('/api/admin/orders', async (req, reply) => {
    if (!adminAllowed(req, reply)) return undefined;

    const { status = '', q = '', limit } = req.query || {};
    const take = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);
    const query = String(q).trim();

    const rows = query
      ? orders.search(query, take)
      : orders.recent({ status: status || null, limit: take });

    // Сводка за сегодня — от полуночи по времени сервера.
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const stats = orders.stats(midnight.getTime());

    return {
      orders: rows.map(adminOrder),
      stats: {
        byStatus: stats.byStatus,
        today: {
          paid: stats.paidSince.n,
          amount: stats.paidSince.amount / 100,
          seats: stats.paidSince.seats,
        },
      },
    };
  });

  // Кнопка «проверить в банке»: спрашиваем KICB прямо сейчас, не дожидаясь
  // фоновой сверки. Полезно, когда человек говорит «я оплатил, а билета нет».
  app.post('/api/admin/orders/:id/sync', async (req, reply) => {
    if (!adminAllowed(req, reply)) return undefined;

    const existing = orders.byId(req.params.id);
    if (!existing) return notFound(reply);

    const order = await syncOrder(existing);
    req.log.info({ orderId: order.id, status: order.status }, 'ручная сверка из админки');
    return { order: adminOrder(order) };
  });

  // Кнопка «отправить письмо ещё раз» — для случая «оплатил, а билет не пришёл».
  app.post('/api/admin/orders/:id/resend', async (req, reply) => {
    if (!adminAllowed(req, reply)) return undefined;

    const existing = orders.byId(req.params.id);
    if (!existing) return notFound(reply);

    const order = await resendTicket(existing);
    req.log.info({ orderId: order.id, email: order.email }, 'билет отправлен повторно');
    return { order: adminOrder(order) };
  });

  // ── Проверка билета: по этой ссылке ведёт QR из письма ──────────────────
  app.get('/api/tickets/:code', async (req, reply) => {
    const order = orders.byTicket(String(req.params.code).toUpperCase());
    if (!order || order.status !== 'paid') {
      return reply.code(404).send({ error: 'not_found', message: 'Билет не найден' });
    }

    return {
      ticket: {
        code: order.ticket_code,
        items: order.items.map((i) => ({ tariff: i.tariff, qty: i.qty })),
        seats: order.seats,
        amount: order.amount / 100,
        currency: order.currency,
        paidAt: order.paid_at,
      },
    };
  });
}

/** Единая обработка ошибок: наружу — понятный текст, в лог — подробности. */
export function errorHandler(err, req, reply) {
  if (err instanceof KicbError) {
    req.log.error({ err, code: err.code }, 'ошибка KICB');
    return reply.code(502).send({
      error: 'bank_unavailable',
      message: 'Банк временно недоступен. Попробуйте ещё раз через минуту.',
    });
  }

  const status = err.statusCode ?? 500;
  if (status >= 500) {
    req.log.error({ err }, 'внутренняя ошибка');
    return reply.code(status).send({ error: 'internal', message: 'Внутренняя ошибка сервера' });
  }

  return reply.code(status).send({ error: 'bad_request', message: err.message });
}
