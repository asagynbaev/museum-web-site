/**
 * Проверка почты: связь с SMTP + тестовое письмо.
 *
 *   npm run mail:test -- you@example.com
 *
 * Письмо собирается тем же кодом, что и настоящий билет, поэтому проверяются
 * заодно вёрстка, вложенный QR и кодировка — а не только логин с паролем.
 */
import { config } from '../config.js';
import { mailerReady, sendTicket, verifyMailer } from '../mailer.js';

const to = process.argv[2];

if (!to) {
  console.error('Укажите адрес: npm run mail:test -- you@example.com');
  process.exit(1);
}

if (!mailerReady) {
  console.error('SMTP не настроен: заполните SMTP_HOST и соседние переменные в .env');
  process.exit(1);
}

console.log(`Проверяю ${config.smtp.host}:${config.smtp.port} (secure=${config.smtp.secure})…`);

try {
  await verifyMailer();
  console.log('✓ сервер принял логин и пароль');
} catch (err) {
  console.error('✗ не удалось подключиться:', err.message);
  process.exit(1);
}

// Заказ ненастоящий, в базу не попадает — нужен только для отрисовки письма.
const sample = {
  id: 'test-' + Date.now().toString(36),
  ticket_code: 'AIM-TEST-MAIL',
  email: to,
  lang: 'ru',
  amount: 900,
  seats: 6,
  items: [
    { tariff: 'adult', qty: 1, price: 300 },
    { tariff: 'reduced', qty: 1, price: 100 },
    { tariff: 'family', qty: 1, price: 500 },
  ],
};

try {
  await sendTicket(sample);
  console.log(`✓ письмо отправлено на ${to} — проверьте ящик и папку «Спам»`);
} catch (err) {
  console.error('✗ отправка не прошла:', err.message);
  process.exit(1);
}
