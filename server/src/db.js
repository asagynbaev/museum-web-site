import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

import { config } from './config.js';

mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Схема. Заказ — единственная сущность: он же корзина, он же платёж, он же
 * билет после оплаты. Суммы — в тыйынах (целые), время — в ms epoch.
 *
 * status: pending → processing → paid
 *                 ↘ failed | expired | cancelled
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id              TEXT PRIMARY KEY,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    expires_at      INTEGER NOT NULL,
    status          TEXT    NOT NULL,
    kicb_status     INTEGER,
    amount          INTEGER NOT NULL,
    currency        TEXT    NOT NULL,
    seats           INTEGER NOT NULL,
    items           TEXT    NOT NULL,
    email           TEXT    NOT NULL,
    lang            TEXT    NOT NULL DEFAULT 'ru',
    qr_link         TEXT,
    ticket_code     TEXT UNIQUE,
    paid_at         INTEGER,
    mail_sent_at    INTEGER,
    mail_attempts   INTEGER NOT NULL DEFAULT 0,
    last_checked_at INTEGER,
    last_error      TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_orders_open   ON orders (status, expires_at);
  CREATE INDEX IF NOT EXISTS idx_orders_ticket ON orders (ticket_code);
  CREATE INDEX IF NOT EXISTS idx_orders_mail   ON orders (status, mail_sent_at);
`);

const stmts = {
  insert: db.prepare(`
    INSERT INTO orders (id, created_at, updated_at, expires_at, status, amount, currency,
                        seats, items, email, lang, qr_link)
    VALUES (@id, @created_at, @updated_at, @expires_at, @status, @amount, @currency,
            @seats, @items, @email, @lang, @qr_link)
  `),
  byId: db.prepare('SELECT * FROM orders WHERE id = ?'),
  byTicket: db.prepare('SELECT * FROM orders WHERE ticket_code = ?'),
  countRecentByEmail: db.prepare(
    "SELECT COUNT(*) AS n FROM orders WHERE email = ? AND created_at > ? AND status IN ('pending','processing')"
  ),
  markChecked: db.prepare('UPDATE orders SET last_checked_at = ?, updated_at = ? WHERE id = ?'),
  setStatus: db.prepare(`
    UPDATE orders SET status = @status, kicb_status = @kicb_status, last_error = @last_error,
                      last_checked_at = @now, updated_at = @now
    WHERE id = @id
  `),
  markPaid: db.prepare(`
    UPDATE orders SET status = 'paid', kicb_status = 2, ticket_code = @ticket_code,
                      paid_at = @now, last_checked_at = @now, updated_at = @now
    WHERE id = @id AND status <> 'paid'
  `),
  markMailSent: db.prepare('UPDATE orders SET mail_sent_at = ?, updated_at = ? WHERE id = ?'),
  bumpMailAttempts: db.prepare(
    'UPDATE orders SET mail_attempts = mail_attempts + 1, last_error = ?, updated_at = ? WHERE id = ?'
  ),
  openOrders: db.prepare(
    "SELECT * FROM orders WHERE status IN ('pending','processing') ORDER BY created_at LIMIT 200"
  ),
  pendingMail: db.prepare(
    "SELECT * FROM orders WHERE status = 'paid' AND mail_sent_at IS NULL AND mail_attempts < 5 LIMIT 50"
  ),

  // ── Админка ─────────────────────────────────────────────────────────────
  recentOrders: db.prepare(`
    SELECT * FROM orders
    WHERE (@status IS NULL OR status = @status)
    ORDER BY created_at DESC
    LIMIT @limit
  `),
  searchOrders: db.prepare(`
    SELECT * FROM orders
    WHERE id LIKE @like OR email LIKE @like OR ticket_code LIKE @likeUpper
    ORDER BY created_at DESC
    LIMIT @limit
  `),
  statusCounts: db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status'),
  paidSince: db.prepare(`
    SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS amount, COALESCE(SUM(seats), 0) AS seats
    FROM orders WHERE status = 'paid' AND paid_at >= ?
  `),
};

/** Разворачивает строку БД в объект с распарсенной корзиной. */
export function hydrate(row) {
  if (!row) return null;
  return { ...row, items: JSON.parse(row.items) };
}

export const orders = {
  insert(order) {
    stmts.insert.run({ ...order, items: JSON.stringify(order.items) });
    return hydrate(stmts.byId.get(order.id));
  },

  byId: (id) => hydrate(stmts.byId.get(id)),
  byTicket: (code) => hydrate(stmts.byTicket.get(code)),

  /** Сколько незакрытых заказов этот email создал за последние `windowMs`. */
  openCountForEmail(email, windowMs) {
    return stmts.countRecentByEmail.get(email, Date.now() - windowMs).n;
  },

  touchChecked(id) {
    const now = Date.now();
    stmts.markChecked.run(now, now, id);
  },

  setStatus(id, status, { kicbStatus = null, error = null } = {}) {
    stmts.setStatus.run({
      id,
      status,
      kicb_status: kicbStatus,
      last_error: error,
      now: Date.now(),
    });
    return hydrate(stmts.byId.get(id));
  },

  /**
   * Переводит заказ в paid. Возвращает `true` только тому вызову, который
   * реально совершил переход — так письмо уходит ровно один раз, даже если
   * фоновой поллер и запрос из браузера пришли одновременно.
   */
  markPaid(id, ticketCode) {
    const res = stmts.markPaid.run({ id, ticket_code: ticketCode, now: Date.now() });
    return res.changes === 1;
  },

  markMailSent(id) {
    stmts.markMailSent.run(Date.now(), Date.now(), id);
  },

  bumpMailAttempts(id, error) {
    stmts.bumpMailAttempts.run(String(error).slice(0, 500), Date.now(), id);
  },

  openOrders: () => stmts.openOrders.all().map(hydrate),
  pendingMail: () => stmts.pendingMail.all().map(hydrate),

  /** Лента для админки: последние заказы, при желании только одного статуса. */
  recent({ status = null, limit = 50 } = {}) {
    return stmts.recentOrders.all({ status, limit }).map(hydrate);
  },

  /** Поиск по номеру заказа, коду билета или почте — по куску строки. */
  search(query, limit = 50) {
    const like = `%${query}%`;
    return stmts.searchOrders.all({ like, likeUpper: like.toUpperCase(), limit }).map(hydrate);
  },

  /** Сводка: сколько заказов в каждом статусе и что оплачено с момента `since`. */
  stats(since) {
    const byStatus = Object.fromEntries(stmts.statusCounts.all().map((r) => [r.status, r.n]));
    return { byStatus, paidSince: stmts.paidSince.get(since) };
  },
};
