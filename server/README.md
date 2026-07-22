# Билетный сервер AI Museum

Продажа билетов через **KICB Terminal API v1.7** (QR-оплата) и отправка билетов на почту.

Фронт не может ходить в банк напрямую: там логин/пароль, белый список статических IP
и никакого CORS. Поэтому весь разговор с KICB ведёт этот сервис, а сайт общается только с ним.

## Что внутри

```
src/config.js        переменные окружения, падаем на старте если чего-то нет
src/db.js            SQLite: одна таблица orders (она же корзина, платёж и билет)
src/kicb.js          клиент банка: токен, GetLink, CheckStatus, ChangeStatus, AbortPayment
src/tariffs.js       прайс — единственный источник правды по ценам
src/orders.js        жизненный цикл заказа + фоновая сверка с банком
src/mailer.js        письмо с билетом (ru/ky/en) и QR-кодом
src/routes.js        HTTP-API для сайта
src/mock/            заглушка банка для разработки
```

## Запуск локально

```bash
cp .env.example .env
npm install
npm run mock     # окно 1 — заглушка банка на :8788
npm run dev      # окно 2 — API на :8787
```

Vite проксирует `/api` на `:8787`, так что сайт (`npm run dev` в корне) заводится без настройки.

Заглушка отдаёт в QR ссылку на свою же страницу «оплаты». Отсканируйте QR с сайта
телефоном — откроется экран с кнопкой «Оплатить», и сайт увидит платёж ровно так же,
как увидел бы настоящий. Чтобы телефон достучался до ноутбука:

```bash
MOCK_HOST=0.0.0.0 MOCK_PUBLIC_URL=http://192.168.0.10:8788 npm run mock
```

Можно и без телефона: `MOCK_AUTOPAY_MS=8000` — QR «оплатится» сам через 8 секунд.

## API

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/tariffs` | прайс для витрины |
| `POST` | `/api/orders` | создать заказ и получить QR |
| `GET` | `/api/orders/:id` | статус заказа (сайт опрашивает раз в 2 с) |
| `GET` | `/api/orders/:id/qr.svg` | QR картинкой |
| `POST` | `/api/orders/:id/cancel` | отменить неоплаченный QR |
| `GET` | `/api/tickets/:code` | проверка билета — по этой ссылке ведёт QR из письма |

`POST /api/orders` принимает только `{ items: [{tariff, qty}], email, lang }`.
Цену и сумму клиент прислать не может — их считает сервер по `src/tariffs.js`.

## Переход на боевой KICB

Когда банк выдаст доступ:

1. `KICB_MODE=live`, `KICB_BASE_URL=https://…` (боевой адрес даёт банк),
   `KICB_LOGIN`, `KICB_PASSWORD`, `KICB_TERMINAL_ID`.
2. **Если работаете через IPSec VPN** (раздел 4.1 доки) — `KICB_TERMINAL_PUBLIC_KEY`
   оставьте пустым, `terminalId` уйдёт открытым текстом внутри туннеля.
3. **Если без VPN** (раздел 4.2) — банк должен внести статический IP сервера в белый
   список и выдать публичный RSA-ключ терминала. Положите его в
   `KICB_TERMINAL_PUBLIC_KEY`, и `terminalId` будет шифроваться RSA/OAEP-SHA256 → base64.
4. Проверьте, что в логе на старте написано то, что вы ожидаете:
   `KICB: режим live, https://…, terminalId шифруется RSA`.

⚠️ Serverless (Vercel/Netlify functions) не подойдёт: у них плавающий исходящий IP,
белый список банка такое не переживёт. Нужен VPS с фиксированным адресом.

## Деплой на VPS

```bash
# на сервере
git clone <repo> /opt/museum && cd /opt/museum/server
npm ci --omit=dev
cp .env.example .env && nano .env      # заполнить боевые значения
```

`/etc/systemd/system/museum-api.service`:

```ini
[Unit]
Description=AI Museum ticket API
After=network.target

[Service]
Type=simple
User=museum
WorkingDirectory=/opt/museum/server
ExecStart=/usr/bin/node --env-file=.env src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now museum-api
```

nginx — статика сайта плюс проксирование `/api`:

```nginx
server {
    server_name museum.kg;

    root /opt/museum/dist;
    location / { try_files $uri $uri/ /index.html; }

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Сервер читает `X-Forwarded-For` (`trustProxy`), поэтому лимиты считаются по реальному IP,
а не по адресу nginx.

## Что стоит помнить

- **Вебхуков у KICB нет.** Статус узнаём опросом: фоновая сверка каждые 5 секунд
  проходит по незакрытым заказам. Благодаря ей оплата долетает, даже если человек
  закрыл вкладку сразу после сканирования.
- **Письмо уходит ровно один раз.** Переход в `paid` — атомарный `UPDATE … WHERE status <> 'paid'`,
  и письмо отправляет только тот вызов, который реально совершил переход.
- **Неотправленные письма** сервер повторяет сам, до 5 попыток (`mail_attempts`).
- **Просроченный QR** гасится в банке через `AbortPayment`, чтобы его нельзя было
  оплатить после истечения `ORDER_TTL_SECONDS`.
- **Бэкапы.** Билеты лежат в `data/museum.db`. Достаточно `sqlite3 data/museum.db ".backup …"`
  по крону — файл маленький.
