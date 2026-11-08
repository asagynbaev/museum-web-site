import { config } from './config.js';
import { orders } from './db.js';

/**
 * Сеансы посещения — как в teamLab: билет продаётся на дату и час входа,
 * в каждом часе ограниченное число мест.
 *
 * Сеанс называется строкой `YYYY-MM-DDTHH:00` — это начало часа входа по
 * Бишкеку. Строка и есть ключ в БД (`orders.slot`): её можно сравнивать как
 * текст, а показывать без всякой арифметики с часовыми поясами.
 *
 * Бишкек живёт в UTC+6 круглый год (летнего времени нет с 2005-го), поэтому
 * смещение — константа, а не tz-база. Часовой пояс самого VPS ни на что не влияет.
 */

const TZ_OFFSET = '+06:00';
const TZ_OFFSET_MS = 6 * 60 * 60_000;
const MINUTE = 60_000;

const SLOT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):00$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n) => String(n).padStart(2, '0');

/** Сколько мест осталось, чтобы показать «мало мест». */
const FEW_SEATS = 5;

/** Дата по Бишкеку (YYYY-MM-DD) для момента `ms`. */
export function localDate(ms = Date.now()) {
  return new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** Начало сеанса — момент времени (ms epoch). */
export function slotStart(slot) {
  return Date.parse(`${slot}:00${TZ_OFFSET}`);
}

/** Окно, в которое турникет пускает по билету этого сеанса. */
export function entryWindow(slot) {
  const start = slotStart(slot);
  return {
    from: start - config.slots.gateEarlyMin * MINUTE,
    until: start + config.slots.gateLateMin * MINUTE,
  };
}

function parseDate(date) {
  const m = DATE_RE.exec(String(date ?? ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = new Date(Date.UTC(y, mo - 1, d));
  // 2026-02-30 → Date молча превратит в 2 марта; такую дату не принимаем.
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d) return null;
  return utc;
}

function addDays(date, n) {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Последний день, на который уже продаём: сегодня + BOOKING_HORIZON_MONTHS. */
export function lastBookableDate(now = Date.now()) {
  const today = parseDate(localDate(now));
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + config.slots.horizonMonths;
  // 30 ноября + 3 месяца — это 28 февраля, а не 2 марта.
  const lastDayOfMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(today.getUTCDate(), lastDayOfMonth))).toISOString().slice(0, 10);
}

/** Работает ли музей в этот день. */
export function isOpenDay(date) {
  const d = parseDate(date);
  if (!d) return false;
  return !config.slots.closedWeekdays.includes(d.getUTCDay()) && !config.slots.closedDates.includes(date);
}

/** Сеансы дня по расписанию, без учёта проданных мест. */
export function scheduleFor(date) {
  if (!isOpenDay(date)) return [];
  const out = [];
  for (let h = config.slots.firstHour; h <= config.slots.lastHour; h += 1) {
    out.push(`${date}T${pad(h)}:00`);
  }
  return out;
}

/** Продаётся ли ещё сеанс по времени (без учёта мест). */
function onSale(slot, now) {
  return now < slotStart(slot) + config.slots.salesCloseMin * MINUTE;
}

function inHorizon(date, now) {
  return date >= localDate(now) && date <= lastBookableDate(now);
}

function slotView(slot, load, now) {
  const { paid = 0, held = 0 } = load.get(slot) || {};
  const capacity = config.slots.capacity;
  const remaining = Math.max(0, capacity - paid - held);

  let status = 'open';
  if (!onSale(slot, now)) status = 'past';
  else if (remaining === 0) status = 'full';
  else if (remaining <= FEW_SEATS) status = 'few';

  return { slot, time: slot.slice(11), capacity, remaining: status === 'past' ? 0 : remaining, status };
}

function loadForDates(from, toInclusive) {
  return orders.slotLoad(`${from}T00:00`, `${addDays(toInclusive, 1)}T00:00`);
}

/**
 * Сеансы одного дня с остатком мест — для выбора времени на сайте.
 * Дата вне горизонта или выходной — пустой список.
 */
export function slotsForDate(date, now = Date.now()) {
  if (!parseDate(date) || !inHorizon(date, now)) return [];
  const schedule = scheduleFor(date);
  if (schedule.length === 0) return [];
  const load = loadForDates(date, date);
  return schedule.map((slot) => slotView(slot, load, now));
}

/**
 * Календарь продаж: каждый день от сегодня до конца горизонта и его статус —
 * open / few / full / closed (выходной) / past (сегодняшние сеансы кончились).
 */
export function calendar(now = Date.now()) {
  const first = localDate(now);
  const last = lastBookableDate(now);
  const load = loadForDates(first, last);

  const days = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    const schedule = scheduleFor(date);
    if (schedule.length === 0) {
      days.push({ date, status: 'closed', remaining: 0 });
      continue;
    }

    const views = schedule.map((slot) => slotView(slot, load, now));
    const selling = views.filter((v) => v.status !== 'past');
    const remaining = selling.reduce((sum, v) => sum + v.remaining, 0);

    let status = 'open';
    if (selling.length === 0) status = 'past';
    else if (remaining === 0) status = 'full';
    else if (selling.every((v) => v.status === 'full' || v.status === 'few')) status = 'few';

    days.push({ date, status, remaining });
  }

  return { from: first, to: last, capacity: config.slots.capacity, days };
}

/** Загрузка сеансов дня для кассы: сколько оплачено, сколько держат QR, сколько прошло. */
export function adminSlotsForDate(date, now = Date.now()) {
  if (!parseDate(date)) return [];
  const load = loadForDates(date, date);
  return scheduleFor(date).map((slot) => {
    const { paid = 0, held = 0, entered = 0 } = load.get(slot) || {};
    return {
      ...slotView(slot, load, now),
      paid,
      held,
      entered,
    };
  });
}

/**
 * Проверяет сеанс из запроса покупателя. Бросает 400, если такого сеанса нет
 * в расписании или он вне горизонта, и 409, если его продажа уже закрыта.
 */
export function assertBookable(slot, now = Date.now()) {
  const m = SLOT_RE.exec(String(slot ?? ''));
  const date = m ? `${m[1]}-${m[2]}-${m[3]}` : null;

  if (!m || !parseDate(date) || !scheduleFor(date).includes(slot) || !inHorizon(date, now)) {
    throw httpError(400, 'slot_invalid', 'Выберите дату и время посещения');
  }
  if (!onSale(slot, now)) {
    throw httpError(409, 'slot_closed', 'Продажа на этот сеанс уже закрыта');
  }
  return slot;
}

export function httpError(statusCode, code, message, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.publicCode = code;
  Object.assign(err, extra);
  return err;
}
