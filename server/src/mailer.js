import nodemailer from 'nodemailer';
import QRCode from 'qrcode';

import { config } from './config.js';

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

/** Тексты письма. Держим их здесь, а не в i18n фронта: письмо шлёт сервер. */
const STRINGS = {
  ru: {
    subject: (code) => `Ваш билет в AI Museum · ${code}`,
    hi: 'Спасибо за покупку!',
    intro: 'Ваш билет в AI Museum готов. Покажите этот QR на входе — распечатывать не нужно.',
    codeLabel: 'Код билета',
    orderLabel: 'Заказ',
    totalLabel: 'Итого',
    ticketsLabel: 'Билеты',
    whereLabel: 'Где',
    where: 'Парк высоких технологий, Бишкек',
    hoursLabel: 'Часы работы',
    hours: 'Вт–Пт 10:00–20:00 · Сб–Вс 10:00–21:00 · Пн — выходной',
    openLink: 'Открыть билет на сайте',
    footer: 'Билет действителен на одно посещение. Вопросы — просто ответьте на это письмо.',
    tariffs: { adult: 'Взрослый', reduced: 'Детский / студент', family: 'Семейный (2+2)' },
  },
  ky: {
    subject: (code) => `AI Museum билетиңиз · ${code}`,
    hi: 'Сатып алганыңыз үчүн рахмат!',
    intro: 'AI Museum билетиңиз даяр. Кирүүдө ушул QR кодду көрсөтүңүз — басып чыгаруунун кажети жок.',
    codeLabel: 'Билеттин коду',
    orderLabel: 'Буйрутма',
    totalLabel: 'Жалпы',
    ticketsLabel: 'Билеттер',
    whereLabel: 'Кайда',
    where: 'Жогорку технологиялар паркы, Бишкек',
    hoursLabel: 'Иштөө убактысы',
    hours: 'Шш–Жм 10:00–20:00 · Иш–Жк 10:00–21:00 · Дш — дем алыш',
    openLink: 'Билетти сайттан ачуу',
    footer: 'Билет бир жолу баруу үчүн жарактуу. Суроолор боюнча — ушул катка жооп жазыңыз.',
    tariffs: { adult: 'Чоңдор', reduced: 'Балдар / студент', family: 'Үй-бүлөлүк (2+2)' },
  },
  en: {
    subject: (code) => `Your AI Museum ticket · ${code}`,
    hi: 'Thank you for your purchase!',
    intro: 'Your AI Museum ticket is ready. Show this QR at the entrance — no need to print it.',
    codeLabel: 'Ticket code',
    orderLabel: 'Order',
    totalLabel: 'Total',
    ticketsLabel: 'Tickets',
    whereLabel: 'Where',
    where: 'High Technology Park, Bishkek',
    hoursLabel: 'Opening hours',
    hours: 'Tue–Fri 10:00–20:00 · Sat–Sun 10:00–21:00 · Mon closed',
    openLink: 'Open ticket on the website',
    footer: 'Valid for a single visit. Any questions — just reply to this email.',
    tariffs: { adult: 'Adult', reduced: 'Child / student', family: 'Family (2+2)' },
  },
};

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replaceAll(/[&<>"']/g, (c) => ESCAPE[c]);
const som = (minor) => `${(minor / 100).toLocaleString('ru-RU')} KGS`;

function renderHtml(order, s, verifyUrl) {
  const rows = order.items
    .map(
      (i) => `<tr>
        <td style="padding:9px 0;border-bottom:1px solid #2a231a;color:#b7ad99">
          ${esc(s.tariffs[i.tariff] || i.tariff)} × ${i.qty}
        </td>
        <td style="padding:9px 0;border-bottom:1px solid #2a231a;text-align:right;color:#e2bd84">
          ${esc(som(i.price * i.qty))}
        </td>
      </tr>`
    )
    .join('');

  const line = (label, value) => `<tr>
      <td style="padding:9px 0;border-bottom:1px solid #2a231a;color:#b7ad99">${esc(label)}</td>
      <td style="padding:9px 0;border-bottom:1px solid #2a231a;text-align:right;color:#ebe1cd">${esc(value)}</td>
    </tr>`;

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#0f0c07;
    font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#ebe1cd">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;
         background:#171208;border:1px solid #2a231a;border-radius:14px">
    <tr><td style="padding:34px 32px 8px">
      <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#c99a5b">AI Museum · Бишкек</div>
      <h1 style="margin:14px 0 8px;font-size:24px;font-weight:700;letter-spacing:-.01em">${esc(s.hi)}</h1>
      <p style="margin:0;color:#b7ad99;font-size:15px;line-height:1.55">${esc(s.intro)}</p>
    </td></tr>

    <tr><td style="padding:26px 32px 6px" align="center">
      <div style="display:inline-block;background:#ebe1cd;padding:16px;border-radius:12px">
        <img src="cid:ticket-qr" width="216" height="216" alt="${esc(s.codeLabel)}" style="display:block">
      </div>
      <div style="margin-top:16px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8d8474">
        ${esc(s.codeLabel)}
      </div>
      <div style="margin-top:6px;font-size:22px;font-weight:700;letter-spacing:.16em;color:#e2bd84">
        ${esc(order.ticket_code)}
      </div>
    </td></tr>

    <tr><td style="padding:22px 32px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
        ${rows}
        <tr>
          <td style="padding:13px 0;color:#ebe1cd;font-weight:600">${esc(s.totalLabel)}</td>
          <td style="padding:13px 0;text-align:right;color:#e2bd84;font-weight:700;font-size:16px">
            ${esc(som(order.amount))}
          </td>
        </tr>
        ${line(s.whereLabel, s.where)}
        ${line(s.hoursLabel, s.hours)}
        ${line(s.orderLabel, order.id)}
      </table>
    </td></tr>

    <tr><td style="padding:24px 32px 34px">
      <a href="${esc(verifyUrl)}" style="display:block;padding:14px;border-radius:8px;background:#c99a5b;
         color:#1a1206;text-align:center;text-decoration:none;font-weight:600;font-size:14px">${esc(s.openLink)}</a>
      <p style="margin:18px 0 0;color:#7d7565;font-size:12px;line-height:1.6;text-align:center">${esc(s.footer)}</p>
    </td></tr>
  </table>
</body></html>`;
}

function renderText(order, s, verifyUrl) {
  const lines = order.items.map((i) => `  ${s.tariffs[i.tariff] || i.tariff} × ${i.qty} — ${som(i.price * i.qty)}`);
  return [
    s.hi,
    '',
    s.intro,
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
    s.footer,
  ].join('\n');
}

/**
 * Шлёт билет покупателю. Бросает исключение при неудаче — вызывающий код
 * считает попытку и повторит позже.
 */
export async function sendTicket(order) {
  const s = STRINGS[order.lang] || STRINGS.ru;
  const verifyUrl = `${config.publicUrl}/ticket/${order.ticket_code}`;

  // QR билета кодирует ссылку проверки: контролёр на входе сканирует — и сразу
  // видит статус, а не голый код, который надо куда-то вбивать.
  const qrPng = await QRCode.toBuffer(verifyUrl, {
    type: 'png',
    width: 432,
    margin: 1,
    color: { dark: '#141009', light: '#ebe1cd' },
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
