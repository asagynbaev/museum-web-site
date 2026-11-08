import nodemailer from 'nodemailer';
import QRCode from 'qrcode';

import { config } from './config.js';
import { entryWindow } from './slots.js';

/**
 * Отправка билетов. Если SMTP не настроен — письмо не теряется молча, а
 * печатается в консоль: так можно гонять весь сценарий до получения доступов.
 */

const transport = config.smtp
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
    })
  : null;

export const mailerReady = Boolean(transport);

/**
 * Проверка связи с почтовым сервером: логин, пароль, порт, TLS.
 * Используется командой `npm run mail:test` — лучше узнать о неверном пароле
 * из терминала, чем по жалобе покупателя без билета.
 */
export async function verifyMailer() {
  if (!transport) throw new Error('SMTP не настроен: SMTP_HOST в .env пуст');
  return transport.verify();
}

/** Тексты письма. Держим их здесь, а не в i18n фронта: письмо шлёт сервер. */
const STRINGS = {
  ru: {
    subject: (code) => `Ваш билет в AI Museum · ${code}`,
    hi: 'Спасибо за покупку!',
    intro: 'Ваш билет в AI Museum готов. Покажите этот QR на входе — распечатывать не нужно.',
    visitLabel: 'Сеанс',
    entryNote: (from, until) => `Вход по билету — с ${from} до ${until}. Внутри можно оставаться сколько угодно.`,
    weekdays: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
    months: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    visitDate: (wd, d, m) => `${wd}, ${d} ${m}`,
    footerSlot: 'Билет действителен на одно посещение в выбранный сеанс. Вопросы — просто ответьте на это письмо.',
    codeLabel: 'Код билета',
    orderLabel: 'Заказ',
    totalLabel: 'Итого',
    ticketsLabel: 'Билеты',
    whereLabel: 'Где',
    where: 'просп. Чуй, 265/1, здание ПВТ, Бишкек',
    hoursLabel: 'Часы работы',
    hours: 'Вт–Пт 10:00–20:00 · Сб–Вс 10:00–21:00 · Пн — выходной',
    openLink: 'Открыть билет на сайте',
    footer: 'Билет действителен на одно посещение. Вопросы — просто ответьте на это письмо.',
    tariffs: { adult: 'Взрослый', reduced: 'Детский / студент', family: 'Семейный (2+2)' },
    familyNote: (seats) =>
      `Этот билет на ${seats} человек. На входе показывайте QR по одному разу на каждого — ` +
      'не нужно проходить всей группой за один показ.',
  },
  ky: {
    subject: (code) => `AI Museum билетиңиз · ${code}`,
    hi: 'Сатып алганыңыз үчүн рахмат!',
    intro: 'AI Museum билетиңиз даяр. Кирүүдө ушул QR кодду көрсөтүңүз — басып чыгаруунун кажети жок.',
    visitLabel: 'Сеанс',
    entryNote: (from, until) => `Билет менен кирүү убактысы: ${from}–${until}. Ичинде каалаганча калсаңыз болот.`,
    weekdays: ['жекшемби', 'дүйшөмбү', 'шейшемби', 'шаршемби', 'бейшемби', 'жума', 'ишемби'],
    months: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
    visitDate: (wd, d, m) => `${d}-${m}, ${wd}`,
    footerSlot: 'Билет тандалган сеанска бир жолу баруу үчүн жарактуу. Суроолор боюнча — ушул катка жооп жазыңыз.',
    codeLabel: 'Билеттин коду',
    orderLabel: 'Буйрутма',
    totalLabel: 'Жалпы',
    ticketsLabel: 'Билеттер',
    whereLabel: 'Кайда',
    where: 'Чүй проспекти, 265/1, ЖТП имараты, Бишкек',
    hoursLabel: 'Иштөө убактысы',
    hours: 'Шш–Жм 10:00–20:00 · Иш–Жк 10:00–21:00 · Дш — дем алыш',
    openLink: 'Билетти сайттан ачуу',
    footer: 'Билет бир жолу баруу үчүн жарактуу. Суроолор боюнча — ушул катка жооп жазыңыз.',
    tariffs: { adult: 'Чоңдор', reduced: 'Балдар / студент', family: 'Үй-бүлөлүк (2+2)' },
    familyNote: (seats) =>
      `Бул билет ${seats} адамга жарактуу. Кирүүдө QR кодду ар бир адамга өзүнчө бир ` +
      'жолудан көрсөтүңүз — баары бирге бир көрсөтүүдө өтпөйт.',
  },
  en: {
    subject: (code) => `Your AI Museum ticket · ${code}`,
    hi: 'Thank you for your purchase!',
    intro: 'Your AI Museum ticket is ready. Show this QR at the entrance — no need to print it.',
    visitLabel: 'Time slot',
    entryNote: (from, until) => `Entry with this ticket from ${from} to ${until}. Once inside, stay as long as you like.`,
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    visitDate: (wd, d, m) => `${wd}, ${d} ${m}`,
    footerSlot: 'Valid for a single visit in the chosen time slot. Any questions — just reply to this email.',
    codeLabel: 'Ticket code',
    orderLabel: 'Order',
    totalLabel: 'Total',
    ticketsLabel: 'Tickets',
    whereLabel: 'Where',
    where: 'Chuy Ave 265/1, HTP building, Bishkek',
    hoursLabel: 'Opening hours',
    hours: 'Tue–Fri 10:00–20:00 · Sat–Sun 10:00–21:00 · Mon closed',
    openLink: 'Open ticket on the website',
    footer: 'Valid for a single visit. Any questions — just reply to this email.',
    tariffs: { adult: 'Adult', reduced: 'Child / student', family: 'Family (2+2)' },
    familyNote: (seats) =>
      `This ticket admits ${seats} people. At the entrance, scan the QR once per person — ` +
      'not once for the whole group.',
  },
};

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replaceAll(/[&<>"']/g, (c) => ESCAPE[c]);
const som = (minor) => `${(minor / 100).toLocaleString('ru-RU')} KGS`;

/** Время HH:MM по Бишкеку (UTC+6) для момента `ms`. */
const bishkekTime = (ms) => new Date(ms + 6 * 3600_000).toISOString().slice(11, 16);

/**
 * Сеанс словами: «вторник, 10 ноября · 14:00» и окно входа. Без Intl —
 * кыргызской локали в ICU у Node может не оказаться, а письмо должно читаться.
 */
function describeVisit(order, s) {
  if (!order.slot) return null;
  const [y, m, d] = order.slot.slice(0, 10).split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const { from, until } = entryWindow(order.slot);
  return {
    when: `${s.visitDate(s.weekdays[weekday], d, s.months[m - 1])} · ${order.slot.slice(11)}`,
    note: s.entryNote(bishkekTime(from), bishkekTime(until)),
  };
}

function renderHtml(order, s, verifyUrl) {
  const visit = describeVisit(order, s);
  const rows = order.items
    .map(
      (i) => `<tr>
        <td style="padding:9px 0;border-bottom:1px solid #1d2230;color:#a9adb8">
          ${esc(s.tariffs[i.tariff] || i.tariff)} × ${i.qty}
        </td>
        <td style="padding:9px 0;border-bottom:1px solid #1d2230;text-align:right;color:#6fd8cd">
          ${esc(som(i.price * i.qty))}
        </td>
      </tr>`
    )
    .join('');

  const line = (label, value) => `<tr>
      <td style="padding:9px 0;border-bottom:1px solid #1d2230;color:#a9adb8">${esc(label)}</td>
      <td style="padding:9px 0;border-bottom:1px solid #1d2230;text-align:right;color:#f2f2f2">${esc(value)}</td>
    </tr>`;

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#05060a;
    font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#f2f2f2">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;
         background:#0b0d14;border:1px solid #1d2230;border-radius:14px">
    <tr><td style="padding:34px 32px 8px">
      <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#38b4aa">AI Museum · Бишкек</div>
      <h1 style="margin:14px 0 8px;font-size:24px;font-weight:700;letter-spacing:-.01em">${esc(s.hi)}</h1>
      <p style="margin:0;color:#a9adb8;font-size:15px;line-height:1.55">${esc(s.intro)}</p>
      ${
        visit
          ? `<p style="margin:16px 0 0;padding:14px 16px;background:#0f1a1a;border:1px solid #1f3a38;border-radius:10px">
               <span style="display:block;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#38b4aa">${esc(s.visitLabel)}</span>
               <span style="display:block;margin-top:6px;font-size:18px;font-weight:700;color:#f2f2f2">${esc(visit.when)}</span>
               <span style="display:block;margin-top:6px;font-size:13px;line-height:1.5;color:#a9adb8">${esc(visit.note)}</span>
             </p>`
          : ''
      }
      ${
        order.seats > 1
          ? `<p style="margin:14px 0 0;padding:12px 14px;background:#1a1f1a;border:1px solid #2a3a2a;
               border-radius:10px;color:#f2be67;font-size:13px;line-height:1.5">${esc(s.familyNote(order.seats))}</p>`
          : ''
      }
    </td></tr>

    <tr><td style="padding:26px 32px 6px" align="center">
      <div style="display:inline-block;background:#ffffff;padding:16px;border-radius:12px">
        <img src="cid:ticket-qr" width="216" height="216" alt="${esc(s.codeLabel)}" style="display:block">
      </div>
      <div style="margin-top:16px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7f8592">
        ${esc(s.codeLabel)}
      </div>
      <div style="margin-top:6px;font-size:22px;font-weight:700;letter-spacing:.16em;color:#6fd8cd">
        ${esc(order.ticket_code)}
      </div>
    </td></tr>

    <tr><td style="padding:22px 32px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
        ${rows}
        <tr>
          <td style="padding:13px 0;color:#f2f2f2;font-weight:600">${esc(s.totalLabel)}</td>
          <td style="padding:13px 0;text-align:right;color:#6fd8cd;font-weight:700;font-size:16px">
            ${esc(som(order.amount))}
          </td>
        </tr>
        ${visit ? line(s.visitLabel, visit.when) : ''}
        ${line(s.whereLabel, s.where)}
        ${line(s.hoursLabel, s.hours)}
        ${line(s.orderLabel, order.id)}
      </table>
    </td></tr>

    <tr><td style="padding:24px 32px 34px">
      <a href="${esc(verifyUrl)}" style="display:block;padding:14px;border-radius:999px;background:#ff7d5a;
         color:#05060a;text-align:center;text-decoration:none;font-weight:600;font-size:14px">${esc(s.openLink)}</a>
      <p style="margin:18px 0 0;color:#737885;font-size:12px;line-height:1.6;text-align:center">${esc(visit ? s.footerSlot : s.footer)}</p>
    </td></tr>
  </table>
</body></html>`;
}

function renderText(order, s, verifyUrl) {
  const visit = describeVisit(order, s);
  const lines = order.items.map((i) => `  ${s.tariffs[i.tariff] || i.tariff} × ${i.qty} — ${som(i.price * i.qty)}`);
  return [
    s.hi,
    '',
    s.intro,
    ...(visit ? ['', `${s.visitLabel}: ${visit.when}`, visit.note] : []),
    ...(order.seats > 1 ? ['', s.familyNote(order.seats)] : []),
    '',
    `${s.codeLabel}: ${order.ticket_code}`,
    '',
    `${s.ticketsLabel}:`,
    ...lines,
    `${s.totalLabel}: ${som(order.amount)}`,
    '',
    `${s.whereLabel}: ${s.where}`,
    `${s.hoursLabel}: ${s.hours}`,
    `${s.orderLabel}: ${order.id}`,
    '',
    `${s.openLink}: ${verifyUrl}`,
    '',
    visit ? s.footerSlot : s.footer,
  ].join('\n');
}

/**
 * Шлёт билет покупателю. Бросает исключение при неудаче — вызывающий код
 * считает попытку и повторит позже.
 */
export async function sendTicket(order) {
  const s = STRINGS[order.lang] || STRINGS.ru;
  // Открыть билет на сайте — отдельная ссылка для человека (кнопка в письме),
  // не то, что лежит в QR.
  const verifyUrl = `${config.publicUrl}/ticket/${order.ticket_code}`;

  // QR несёт голый код билета, без URL и обвязки: турникетный считыватель
  // кладёт весь скан как есть в поле «Card No.» и ругается на что угодно,
  // кроме букв и цифр — так что отдаём ровно то, что ему нужно.
  const qrPng = await QRCode.toBuffer(order.ticket_code, {
    type: 'png',
    width: 432,
    margin: 1,
    color: { dark: '#05060a', light: '#ffffff' },
  });

  const message = {
    from: config.mailFrom,
    to: order.email,
    subject: s.subject(order.ticket_code),
    text: renderText(order, s, verifyUrl),
    html: renderHtml(order, s, verifyUrl),
    attachments: [{ filename: 'ticket.png', content: qrPng, cid: 'ticket-qr' }],
  };

  if (!transport) {
    console.log(
      `\n──── SMTP не настроен, письмо не отправлено ────\n` +
        `Кому:  ${message.to}\nТема:  ${message.subject}\n\n${message.text}\n` +
        `───────────────────────────────────────────────\n`
    );
    return { mocked: true };
  }

  return transport.sendMail(message);
}
