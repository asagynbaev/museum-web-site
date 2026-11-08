/**
 * Сеансы на фронте. Сеанс приходит с сервера строкой `YYYY-MM-DDTHH:00` —
 * это уже время по Бишкеку, поэтому показываем его как есть, без пересчёта
 * в часовой пояс браузера (турист из другого пояса должен видеть время музея).
 */

const BISHKEK_OFFSET_MS = 6 * 60 * 60_000;

/** Разбирает 'YYYY-MM-DD' в числа, день недели — 0 (вс) … 6 (сб). */
export function parseDay(date) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** «вторник, 10 ноября» по шаблону языка (см. checkout.dateFmt). */
export function formatDay(date, c) {
  const { m, d, weekday } = parseDay(date);
  return c.dateFmt
    .replace('{wd}', c.weekdays[weekday])
    .replace('{d}', String(d))
    .replace('{m}', c.monthsOf[m - 1]);
}

/** «вторник, 10 ноября · 14:00». */
export function formatSlot(slot, c) {
  if (!slot) return '';
  return `${formatDay(slot.slice(0, 10), c)} · ${slot.slice(11, 16)}`;
}

/** HH:MM по Бишкеку для момента времени. */
export function bishkekTime(ms) {
  return new Date(ms + BISHKEK_OFFSET_MS).toISOString().slice(11, 16);
}

/** «Вход с 13:45 до 15:00» — окно турникета, если сервер его прислал. */
export function formatEntry(from, until, c) {
  if (!from || !until) return '';
  return c.entryNote.replace('{from}', bishkekTime(from)).replace('{until}', bishkekTime(until));
}
