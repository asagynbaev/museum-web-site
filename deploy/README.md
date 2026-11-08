# Деплой на VPS

## Текущий стенд

| | |
|---|---|
| Сайт | **https://ai-museum.htp.kg** (Let's Encrypt, http → https редиректом); прежний `museum.eaysdev.online` отвечает 301 сюда |
| Сервер | `84.54.12.242` (Debian 12, hostname `kit-forum.kg`) |
| Код | `/opt/museum`, пользователь `museum`, ветка `main` |
| API | `museum-api.service` → `127.0.0.1:8787` |
| Голосовой гид `/bars` | `concierge-api.service` → `127.0.0.1:8090`, `/opt/concierge` (раздел ниже) |
| nginx | `/etc/nginx/sites-available/museum` — `server_name ai-museum.htp.kg`, отдельный блок для `museum.eaysdev.online` с редиректом |
| Бэкапы | `/etc/cron.d/museum-backup` → `/var/backups/museum/`, 30 дней |
| Деплой | пуш в `main` → GitHub Actions → `deploy@сервер` → `/usr/local/bin/museum-deploy` (раздел «Автодеплой») |

На этой же машине живёт **другой проект — atria** (`*.eaysdev.online`, docker `atria-api`
и `atria-db`). 80/443 общие, поэтому музей описан отдельным файлом и ловит трафик строго
по своему `server_name`; конфиги atria не трогаем.

Состояние интеграции с KICB на 28.08.2026:

- контур **боевой**: `KICB_BASE_URL=https://api.kicb.net`, логин `plb_htp`,
  боевой `terminalId` и пароль лежат только в `/opt/museum/server/.env`;
- IP `84.54.12.242` в белом списке банка (для тестового контура это было так;
  для боевого — подтвердить у банка, что тот же адрес разрешён и там);
- ключ терминала обновлён на выданный вместе с боевым доступом
  (`server/keys/kicb-terminal-public.pem`, прежний рядом в `.bak`);
- прежний тестовый контур `https://api-dev.kicb.net` с terminalId `3CF669916E`
  отвалился на `GetLink`: `HTTP 500, code 5 InternalServiceError` на любой
  terminalId. На боевом это надо перепроверить первым же QR.

Касса на 08.11.2026:

- SMTP вписан в `/opt/museum/server/.env` (`smtp.gmail.com:465`, ящик `events@htp.kg`,
  пароль приложения); отправку проверять `npm run mail:test -- вы@почта` из `server/`;
- цены боевые с 15.10.2026: `PRICE_ADULT=1600`, `PRICE_REDUCED=1200`,
  `PRICE_FAMILY=4800`;
- продажа по часовым сеансам: переменных `SLOT_*` в `.env` нет, работают значения
  по умолчанию из `server/src/config.js` — 20 мест, сеансы 10:00–19:00, понедельник
  выходной.

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
KICB_BASE_URL=https://api.kicb.net     # боевой; тестовый — https://api-dev.kicb.net
KICB_LOGIN=…
KICB_PASSWORD=…
KICB_TERMINAL_ID=…                    # не 1Test1Test, а выданный банком
KICB_TERMINAL_PUBLIC_KEY_FILE=keys/kicb-terminal-public.pem

PRICE_ADULT=1600                      # взрослый
PRICE_REDUCED=1200                    # детский / студенческий
PRICE_FAMILY=4800                     # семейный 2+2 = три взрослых

ADMIN_TOKEN=…                         # пароль к /admin; пусто — раздел выключен

SMTP_HOST=smtp.gmail.com              # без SMTP письмо не уходит,
SMTP_PORT=465                         # а печатается в лог — покупатель
SMTP_SECURE=true                      # останется без билета на почте
SMTP_USER=events@htp.kg
SMTP_PASSWORD=…                       # пароль приложения Google, не пароль ящика
MAIL_FROM="AI Museum <events@htp.kg>"
```

Ящик музея — на Google Workspace, а он с 2022 года не принимает обычный пароль
аккаунта: на `SMTP_PASSWORD` от почты Gmail отвечает
`534-5.7.9 Application-specific password required`. Нужен пароль приложения на
16 символов (myaccount.google.com/apppasswords, пробелы убрать), а `MAIL_FROM`
должен совпадать с `SMTP_USER` или быть его алиасом в «Отправлять письма как»,
иначе Gmail перепишет отправителя. Проверка — `npm run mail:test -- вы@почта`
из `/opt/museum/server`.

Публичный ключ терминала **в репозитории не лежит** (репа публичная) — его кладут
на сервер руками, с машины, где он есть:

```bash
ssh root@СЕРВЕР 'cat > /opt/museum/server/keys/kicb-terminal-public.pem' < kicb-terminal-public.pem
ssh root@СЕРВЕР 'chown museum:museum /opt/museum/server/keys/kicb-terminal-public.pem'
```

Ключ должен быть от того же терминала, что в `KICB_TERMINAL_ID`, иначе банк
не расшифрует terminalId и ответит `code 2 DeviceNotFound`.

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
KICB: режим live, https://api.kicb.net, terminalId шифруется RSA
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

Боевой и тестовый контуры банк белит отдельно — адрес нужно отдать в KICB
ещё раз, даже если на `api-dev` он уже работал.

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

Обычно руками это делать не нужно — см. автодеплой ниже.

## Автодеплой из GitHub Actions

Каждый пуш в `main` запускает `.github/workflows/deploy.yml`:

1. **Проверка** на машине GitHub: сборка сайта и запуск билетного API на заглушке
   банка. Если что-то сломано, до сервера дело не доходит.
2. **Деплой**: заход на VPS по SSH пользователем `deploy` и запуск
   `/usr/local/bin/museum-deploy` (копия `deploy/museum-deploy.sh`): `git merge --ff-only`,
   `npm ci` и сборка, `npm ci` API, копия базы в `/var/backups/museum/`, рестарт
   `museum-api` и ожидание, пока `/api/health` ответит.
3. **Проверка снаружи**: `https://ai-museum.htp.kg/api/health` отвечает `{"ok":true}`.

Настроено 08.11.2026: пользователь `deploy`, `/usr/local/bin/museum-deploy`, sudoers и
ключ с `command=` на сервере; секреты `DEPLOY_HOST/USER/SSH_KEY/KNOWN_HOSTS` в репозитории.
Первый деплой — Deploy #3, зелёный.

Пока секреты не заданы, шаг деплоя пропускается с предупреждением, проверка работает.
Запустить вручную: GitHub → Actions → Deploy → Run workflow.

**Как устроен доступ.** Ключ деплоя в `authorized_keys` прибит к одной команде
(`command="sudo /usr/local/bin/museum-deploy"`, без pty и форвардинга), а sudo
разрешает пользователю `deploy` только этот скрипт. Утечка ключа из GitHub даёт
одно: запустить деплой того, что уже лежит в `main`. Скрипт лежит вне `/opt/museum`
и принадлежит root, поэтому коммит в репозиторий не может поменять то, что
выполняется через sudo.

### Быстрый путь: одна команда со своего компьютера

Если на вашем компьютере есть ssh-доступ к серверу под root и GitHub CLI
(`gh auth login`), всё, что ниже — сервер и секреты, — делает один скрипт:

```bash
bash deploy/setup-autodeploy.sh
```

Ключ деплоя создаётся у вас, публичная часть уходит на сервер, приватная — сразу
в секреты GitHub и стирается с диска. В конце скрипт запускает workflow Deploy.
Другой вход на сервер: `SSH_TARGET=admin@84.54.12.242 bash deploy/setup-autodeploy.sh`.

### Настройка сервера (один раз, от root)

```bash
# 0. Свежий код — в нём есть сам скрипт деплоя
sudo -u museum git -C /opt/museum pull --ff-only

# 1. Пользователь для деплоя
useradd -m -s /bin/bash deploy

# 2. Скрипт деплоя: вне репозитория, владелец root
install -o root -g root -m 755 /opt/museum/deploy/museum-deploy.sh /usr/local/bin/museum-deploy

# 3. sudo — только этот скрипт и ничего больше
echo 'deploy ALL=(root) NOPASSWD: /usr/local/bin/museum-deploy' > /etc/sudoers.d/museum-deploy
chmod 440 /etc/sudoers.d/museum-deploy
visudo -cf /etc/sudoers.d/museum-deploy

# 4. Ключ деплоя, привязанный к команде
ssh-keygen -t ed25519 -N '' -C github-actions-museum -f /root/museum-deploy-key
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
echo "command=\"sudo /usr/local/bin/museum-deploy\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $(cat /root/museum-deploy-key.pub)" \
  > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# 5. Пробный деплой прямо на сервере — должен закончиться «готово: API отвечает»
sudo -u deploy sudo /usr/local/bin/museum-deploy

# 6. Что положить в секреты GitHub (п. ниже)
cat /root/museum-deploy-key                                            # → DEPLOY_SSH_KEY
echo "84.54.12.242 $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)" # → DEPLOY_KNOWN_HOSTS

# 7. Когда ключ лёг в GitHub — убрать приватную часть с сервера
shred -u /root/museum-deploy-key
```

Проверить SSH-доступ снаружи:

- **Файрвол.** Машины GitHub приходят с разных адресов, поэтому 22-й порт должен быть
  открыт для всех (`ufw status`). Пускать по ключу, а не по паролю, sshd и так умеет.
- **sshd.** Если в `/etc/ssh/sshd_config` есть `AllowUsers` или `AllowGroups`, туда
  нужно добавить `deploy` и выполнить `systemctl reload ssh`.
- **Нестандартный порт.** Тогда в known_hosts пишется `[84.54.12.242]:ПОРТ …`,
  а сам порт уходит в секрет `DEPLOY_PORT`.

### Секреты в GitHub

Repository → Settings → Secrets and variables → Actions → **New repository secret**:

| Секрет | Значение |
|---|---|
| `DEPLOY_HOST` | `84.54.12.242` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | вывод `cat /root/museum-deploy-key` целиком, вместе с `-----BEGIN…` и `-----END…` |
| `DEPLOY_KNOWN_HOSTS` | строка из шага 6 |
| `DEPLOY_PORT` | только если SSH не на 22 |

После этого: Actions → Deploy → Run workflow. Оба шага зелёные — дальше каждый пуш
в `main` выкатывается сам.

**Если поменялся `deploy/museum-deploy.sh`**, на сервер его надо скопировать руками
(шаг 2): автодеплой его не обновляет, и так задумано.

## Голосовой гид /bars (сервер консьержа)

Страница `/bars` — 3D-барс, с которым говорят голосом через Gemini Live. Код барса
в `src/concierge/` и модель в `public/concierge/` — копия из репозитория
**ai-concierge** (`web/scripts/export-museum.mjs`), правится там. Токен сессии и
тулы выдаёт его Java-сервер; nginx отправляет на него `/api/live/` и `/api/tools/`
(с лимитом 6 токенов в минуту с адреса), остальной `/api/` — касса.

| | |
|---|---|
| Код | `/opt/concierge/app.jar` (собирается в ai-concierge: `mvn -DskipTests clean package`, JDK 21) |
| Java | `/opt/concierge/jre` — Temurin 21 JRE, системной Java на машине нет |
| Ключ | `/opt/concierge/concierge.env`: `GEMINI_API_KEY=…`, владелец `concierge`, `chmod 600` |
| Юнит | `/etc/systemd/system/concierge-api.service` (из ai-concierge `server/deploy/`) |

Без этого сервиса сайт и касса работают как обычно, на `/bars` барс виден, но
«Начать разговор» ответит ошибкой. Обновление сервера:

```bash
scp server/target/ai-concierge-server-0.1.0.jar root@СЕРВЕР:/opt/concierge/app.jar
ssh root@СЕРВЕР 'systemctl restart concierge-api && journalctl -u concierge-api -n 20'
```

Проверка: `curl -s -X POST https://ВАШ-ДОМЕН/api/live/token -H 'content-type: application/json'
-H 'Origin: https://ВАШ-ДОМЕН' -d '{"lang":"ru"}'` — JSON с полем `token`.

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
