# Деплой на VPS

## Текущий стенд

| | |
|---|---|
| Сайт | **https://museum.eaysdev.online** (Let's Encrypt, http → https редиректом) |
| Сервер | `84.54.12.242` (Debian 12, hostname `kit-forum.kg`) |
| Код | `/opt/museum`, пользователь `museum`, ветка `main` |
| API | `museum-api.service` → `127.0.0.1:8787` |
| nginx | `/etc/nginx/sites-available/museum` — только `server_name museum.eaysdev.online` |
| Бэкапы | `/etc/cron.d/museum-backup` → `/var/backups/museum/`, 30 дней |

На этой же машине живёт **другой проект — atria** (`*.eaysdev.online`, docker `atria-api`
и `atria-db`). 80/443 общие, поэтому музей описан отдельным файлом и ловит трафик строго
по своему `server_name`; конфиги atria не трогаем.

Состояние интеграции с KICB на 10.08.2026:

- IP `84.54.12.242` **в белом списке банка**, `POST /oauth2/token` отдаёт токен;
- `terminalId` — боевой `3CF669916E` (выдан банком 10.08.2026);
- `GetLink` **падает на стороне банка**: `HTTP 500, code 5 InternalServiceError`
  на любой `terminalId`, включая заведомо несуществующий (по разделу 5 доки там
  должен быть `code 2 DeviceNotFound`). `CheckStatus` при этом отвечает штатно —
  значит дело не в наших доступах и не в запросе. Ждём банк.

Что ещё не сделано: **не настроен SMTP** — билеты печатаются в
`journalctl -u museum-api`, на почту покупателю ничего не уходит.

Дальше — общая инструкция, если разворачивать с нуля на чистой машине.

Сайт и билетный API живут на одной машине: nginx отдаёт статику из `dist/`
и проксирует `/api` на локальный Node-процесс. Пути на фронте относительные,
поэтому ни `VITE_API_URL`, ни CORS настраивать не нужно.

**Почему не Vercel / не serverless.** KICB пускает только с IP из белого списка,
а у serverless-функций исходящий адрес плавает. Плюс билеты лежат в SQLite и раз
в 5 секунд фоновый процесс опрашивает банк (вебхуков у KICB нет) — нужен постоянно
живущий процесс с диском.

## 0. Что нужно до начала

- VPS с **статическим IP** (Ubuntu 22.04+ / Debian 12), 1 CPU / 1 ГБ хватает
- домен, A-запись которого смотрит на этот IP
- Node **20.6+** (нужен `--env-file`)
- доступы KICB: логин, пароль, `terminalId`, публичный ключ терминала
- SMTP-ящик для писем с билетами

## 1. Node, пользователь, код

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git

sudo useradd -r -m -d /opt/museum -s /usr/sbin/nologin museum
sudo -u museum git clone https://github.com/asagynbaev/museum-web-site.git /opt/museum
cd /opt/museum
```

## 2. Сборка сайта

```bash
sudo -u museum npm ci          # с dev-зависимостями: сборщик живёт в них
sudo -u museum npm run build   # → /opt/museum/dist
```

## 3. Билетный сервер

```bash
cd /opt/museum/server
sudo -u museum npm ci --omit=dev
sudo -u museum cp .env.example .env
sudo -u museum nano .env
```

В `.env` заполнить:

```ini
PUBLIC_URL=https://museum.kg          # настоящий домен: уходит в письма и в CORS

KICB_MODE=live
KICB_BASE_URL=https://api-dev.kicb.net   # боевой адрес банк даёт отдельно
KICB_LOGIN=…
KICB_PASSWORD=…
KICB_TERMINAL_ID=…                    # не 1Test1Test, а выданный банком
KICB_TERMINAL_PUBLIC_KEY_FILE=keys/kicb-terminal-public.pem

PRICE_ADULT=3                         # тестовые 1/3/5 → заменить перед продажами
PRICE_REDUCED=1
PRICE_FAMILY=5

SMTP_HOST=…                           # без SMTP письмо не уходит,
SMTP_PORT=465                         # а печатается в лог — покупатель
SMTP_SECURE=true                      # останется без билета на почте
SMTP_USER=…
SMTP_PASSWORD=…
MAIL_FROM="AI Museum <tickets@museum.kg>"
```

`.env` в git не хранится и содержит пароли — права строго на владельца:

```bash
sudo chmod 600 /opt/museum/server/.env
sudo chown museum:museum /opt/museum/server/.env
```

## 4. systemd

```bash
sudo cp /opt/museum/deploy/museum-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now museum-api
journalctl -u museum-api -n 20
```

В логе должно быть ровно это:

```
KICB: режим live, https://api-dev.kicb.net, terminalId шифруется RSA
```

## 5. nginx и TLS

```bash
sudo cp /opt/museum/deploy/nginx.conf /etc/nginx/sites-available/museum
sudo sed -i 's/museum\.kg/ВАШ-ДОМЕН/g' /etc/nginx/sites-available/museum
sudo ln -sf /etc/nginx/sites-available/museum /etc/nginx/sites-enabled/museum
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ВАШ-ДОМЕН -d www.ВАШ-ДОМЕН
```

## 6. Белый список банка

Отдать в KICB исходящий адрес машины — с него сервер ходит в API:

```bash
curl -s ifconfig.me
```

Пока IP не в списке, в логе будет `Банк недоступен: fetch failed`, а на сайте —
«Банк временно недоступен».

## 7. Проверка

```bash
curl -s https://ВАШ-ДОМЕН/api/health     # {"ok":true}
curl -s https://ВАШ-ДОМЕН/api/tariffs    # прайс — если 404, nginx не проксирует /api
```

Дальше — покупка с телефона на 1 сом: QR → оплата в приложении банка → на экране
появляется код билета, письмо уходит на почту, QR из письма открывает
`https://ВАШ-ДОМЕН/ticket/AIM-XXXX-XXXX` с зелёной галкой.

## Обновление

```bash
cd /opt/museum
sudo -u museum git pull
sudo -u museum npm ci && sudo -u museum npm run build
cd server && sudo -u museum npm ci --omit=dev
sudo systemctl restart museum-api
```

## Бэкап билетов

Билеты — единственное, что нельзя потерять. Файл маленький, кладём ежедневно:

```bash
sudo crontab -e
0 3 * * * sqlite3 /opt/museum/server/data/museum.db ".backup /var/backups/museum-$(date +\%F).db"
```

## Vercel

После переезда деплой на Vercel лучше отключить или оставить как превью на отдельном
домене: там нет `/api`, поэтому касса на нём всегда будет показывать «0 сом» и 404
на `/api/tariffs`. Основной домен должен вести на VPS.
