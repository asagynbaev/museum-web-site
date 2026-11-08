import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

import { config } from './config.js';

mkdirSync(dirname(config.dbPath), { recursive: true });

/**
 * Код билета без дефисов, пробелов и регистра — так его понимает и турникет
 * (сканирует как есть в поле «Card No.»), и старые коды с дефисами из писем,
 * выпущенных до смены формата (см. `REPLACE(ticket_code, '-', '')` ниже).
 */
export function normaliseCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

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

/**
 * Миграция: счётчик входов по билету (турникет). `seats` — сколько человек
 * билет пускает (семейный = 4), `entries_used` — сколько уже прошло. Колонку
 * добавляем только если её ещё нет — так же безопасно для свежей базы и для
 * боевой с уже купленными билетами.
 */
const orderColumns = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
if (!orderColumns.includes('entries_used')) {
  db.exec('ALTER TABLE orders ADD COLUMN entries_used INTEGER NOT NULL DEFAULT 0');
}

/**
 * Миграция: сеанс посещения. `slot` — начало часа входа по Бишкеку строкой
 * `YYYY-MM-DDTHH:00` (см. src/slots.js). Строки сравниваются как время, так что
 * диапазоны дат — обычные `>=`/`<` по тексту. У билетов, купленных до сеансов,
 * и у тестовых заказов из админки slot = NULL: они пускают в любое время и
 * лимит мест не занимают.
 */
if (!orderColumns.includes('slot')) {
  db.exec('ALTER TABLE orders ADD COLUMN slot TEXT');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_orders_slot ON orders (slot, status)');

/**
 * Какие заказы держат места в сеансе: оплаченные и те, по которым ещё висит
 * QR. Неоплаченный QR занимает места до тех пор, пока фоновая сверка не
 * переведёт его в expired/cancelled/failed — иначе два человека могли бы
 * одновременно оплатить последние места.
 */
const HOLDING = "('paid','pending','processing')";

const stmts = {
  insert: db.prepare(`
    INSERT INTO orders (id, created_at, updated_at, expires_at, status, amount, currency,
                        seats, items, email, lang, qr_link, slot)
    VALUES (@id, @created_at, @updated_at, @expires_at, @status, @amount, @currency,
            @seats, @items, @email, @lang, @qr_link, @slot)
  `),
  setQrLink: db.prepare(
    'UPDATE orders SET qr_link = @qr_link, currency = @currency, updated_at = @now WHERE id = @id'
  ),

  // ── Сеансы ──────────────────────────────────────────────────────────────
  seatsInSlot: db.prepare(
    `SELECT COALESCE(SUM(seats), 0) AS n FROM orders WHERE slot = ? AND status IN ${HOLDING}`
  ),
  slotLoad: db.prepare(`
    SELECT slot,
           COALESCE(SUM(CASE WHEN status = 'paid' THEN seats END), 0) AS paid,
           COALESCE(SUM(CASE WHEN status <> 'paid' THEN seats END), 0) AS held,
           COALESCE(SUM(CASE WHEN status = 'paid' THEN entries_used END), 0) AS entered
    FROM orders
    WHERE slot >= @from AND slot < @to AND status IN ${HOLDING}
    GROUP BY slot
  `),
  byId: db.prepare('SELECT * FROM orders WHERE id = ?'),
  // Без дефисов с обеих сторон: коды, выпущенные до смены формата (с AIM-XXXX-XXXX),
  // продолжают находиться по голому коду с турникета, новые коды дефисов и не имеют.
  byTicket: db.prepare("SELECT * FROM orders WHERE REPLACE(ticket_code, '-', '') = ?"),
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

  /**
   * Турникет: списывает `count` входов одним атомарным UPDATE. Условие
   * `entries_used + @count <= seats` — это и есть вся защита от повторного
   * прохода: better-sqlite3 синхронный, так что между проверкой и записью
   * не может влезть параллельный запрос (в отличие от «прочитать → решить →
   * записать» в три шага, где гонка была бы возможна).
   */
  gateCheckIn: db.prepare(`
    UPDATE orders
    SET entries_used = entries_used + @count, updated_at = @now
    WHERE REPLACE(ticket_code, '-', '') = @ticket_code
      AND status = 'paid' AND entries_used + @count <= seats
  `),

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

/**
 * Проверка остатка и запись заказа — одна транзакция. better-sqlite3
 * синхронный, а сервер — один процесс, так что между «посчитали занятые
 * места» и «записали заказ» второй запрос влезть не может: последнее место
 * достанется ровно одному покупателю.
 */
const reserveTx = db.transaction((order, capacity) => {
  const taken = stmts.seatsInSlot.get(order.slot).n;
  if (taken + order.seats > capacity) return { ok: false, remaining: Math.max(0, capacity - taken) };
  stmts.insert.run({ ...order, items: JSON.stringify(order.items) });
  return { ok: true, order: hydrate(stmts.byId.get(order.id)) };
});

export const orders = {
  insert(order) {
    stmts.insert.run({ slot: null, ...order, items: JSON.stringify(order.items) });
    return hydrate(stmts.byId.get(order.id));
  },

  /** Записывает заказ на сеанс, если в нём хватает мест. */
  reserve: (order, capacity) => reserveTx(order, capacity),

  setQrLink(id, qrLink, currency) {
    stmts.setQrLink.run({ id, qr_link: qrLink, currency, now: Date.now() });
    return hydrate(stmts.byId.get(id));
  },

  /**
   * Загрузка сеансов в диапазоне `[from, to)` (строки слотов):
   * Map slot → { paid, held, entered }.
   */
  slotLoad(from, to) {
    return new Map(
      stmts.slotLoad.all({ from, to }).map((r) => [r.slot, { paid: r.paid, held: r.held, entered: r.entered }])
    );
  },

  byId: (id) => hydrate(stmts.byId.get(id)),
  byTicket: (code) => hydrate(stmts.byTicket.get(normaliseCode(code))),

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

  /** Возвращает true, только если этот вызов реально списал вход(ы). */
  gateCheckIn(ticketCode, count) {
    const res = stmts.gateCheckIn.run({
      ticket_code: normaliseCode(ticketCode),
      count,
      now: Date.now(),
    });
    return res.changes === 1;
  },

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
