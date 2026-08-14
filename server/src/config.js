import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Конфигурация из окружения. Всё читается один раз на старте — если чего-то
 * критичного не хватает, процесс падает сразу, а не на первой оплате.
 */

function str(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback === undefined) throw new Error(`Не задана переменная окружения ${name}`);
    return fallback;
  }
  return v;
}

function int(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`${name} должно быть числом, получено "${v}"`);
  return n;
}

function bool(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

const mode = str('KICB_MODE', 'mock');
if (mode !== 'mock' && mode !== 'live') {
  throw new Error(`KICB_MODE должен быть "mock" или "live", получено "${mode}"`);
}

/**
 * Публичный ключ терминала. Удобнее держать его файлом (банк присылает .pem
 * как есть), но переменной с экранированными \n тоже можно — пригодится там,
 * где файлы класть некуда.
 */
function readTerminalPublicKey() {
  const file = process.env.KICB_TERMINAL_PUBLIC_KEY_FILE;
  if (file) {
    // Путь относительный — от корня server/, чтобы не зависеть от cwd юнита.
    const path = resolve(fileURLToPath(new URL('..', import.meta.url)), file);
    try {
      return readFileSync(path, 'utf8').trim();
    } catch (cause) {
      throw new Error(`Не удалось прочитать KICB_TERMINAL_PUBLIC_KEY_FILE (${path}): ${cause.message}`);
    }
  }
  return (process.env.KICB_TERMINAL_PUBLIC_KEY || '').replaceAll(String.raw`\n`, '\n').trim();
}

const publicKey = readTerminalPublicKey();
if (publicKey && !publicKey.includes('BEGIN PUBLIC KEY')) {
  throw new Error('Публичный ключ терминала не похож на PEM: нет заголовка BEGIN PUBLIC KEY');
}

const smtpHost = process.env.SMTP_HOST || '';

export const config = {
  port: int('PORT', 8787),
  host: str('HOST', '127.0.0.1'),
  publicUrl: str('PUBLIC_URL', 'http://localhost:5173').replace(/\/$/, ''),

  kicb: {
    mode,
    baseUrl: str('KICB_BASE_URL').replace(/\/$/, ''),
    login: str('KICB_LOGIN'),
    password: str('KICB_PASSWORD'),
    terminalId: str('KICB_TERMINAL_ID'),
    // Пустой ключ = работаем внутри IPSec-туннеля, terminalId уходит открытым.
    terminalPublicKey: publicKey || null,
    timeoutMs: int('KICB_TIMEOUT_MS', 15000),
  },

  orderTtlMs: int('ORDER_TTL_SECONDS', 600) * 1000,

  // Пароль к админке. Не задан — раздел просто выключен, а не открыт всем.
  adminToken: process.env.ADMIN_TOKEN || null,

  // Цены храним в тыйынах: целые числа не дают накопиться ошибке float.
  prices: {
    adult: int('PRICE_ADULT', 800) * 100,
    reduced: int('PRICE_REDUCED', 500) * 100,
    family: int('PRICE_FAMILY', 2200) * 100,
  },

  smtp: smtpHost
    ? {
        host: smtpHost,
        port: int('SMTP_PORT', 465),
        secure: bool('SMTP_SECURE', true),
        user: process.env.SMTP_USER || '',
        password: process.env.SMTP_PASSWORD || '',
      }
    : null,
  mailFrom: str('MAIL_FROM', 'AI Museum <tickets@example.kg>'),

  dbPath: str('DB_PATH', fileURLToPath(new URL('../data/museum.db', import.meta.url))),
};

if (config.kicb.mode === 'live' && config.kicb.baseUrl.startsWith('http://')) {
  throw new Error('В режиме live KICB_BASE_URL обязан быть https://');
}
