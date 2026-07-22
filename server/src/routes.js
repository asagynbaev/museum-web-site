import QRCode from 'qrcode';

import { orders } from './db.js';
import { KicbError } from './kicb.js';
import { cancelOrder, createOrder, publicOrder, syncOrder } from './orders.js';
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
