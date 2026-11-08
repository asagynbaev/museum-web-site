#!/usr/bin/env bash
# Деплой музея на VPS: свежий main → сборка сайта → зависимости API → рестарт.
#
# Его запускает GitHub Actions (.github/workflows/deploy.yml) по SSH от
# пользователя `deploy`. Ключ деплоя в authorized_keys привязан к этому
# скрипту (command=…), так что с ним нельзя ни открыть shell, ни выполнить
# что-то своё — только этот деплой.
#
# На сервере скрипт лежит в /usr/local/bin/museum-deploy и принадлежит root,
# а не берётся из /opt/museum: иначе любой коммит в main мог бы переписать
# то, что выполняется через sudo. После правки этого файла в репозитории его
# надо скопировать на сервер руками (см. deploy/README.md, «Автодеплой»).

set -euo pipefail

APP=/opt/museum
DB=$APP/server/data/museum.db
BACKUPS=/var/backups/museum
SERVICE=museum-api

as_museum() { sudo -u museum -H "$@"; }

echo "→ $(date -Is) деплой начат"
cd "$APP"

# Только fast-forward: если на сервере кто-то правил файлы руками, деплой
# остановится, а не затрёт их молча.
as_museum git fetch --quiet origin main
as_museum git merge --ff-only origin/main
echo "→ код: $(as_museum git log -1 --format='%h %s')"

echo "→ сайт"
as_museum npm ci --no-audit --no-fund --loglevel=error
as_museum npm run build --silent

echo "→ билетный API"
cd "$APP/server"
as_museum npm ci --omit=dev --no-audit --no-fund --loglevel=error

# Перед рестартом снимаем копию базы: новый код может мигрировать схему
# (например, колонка slot для сеансов). sqlite3 .backup безопасен на живой базе.
if [ -f "$DB" ] && ! command -v sqlite3 >/dev/null; then
  echo "! sqlite3 не установлен — копия базы перед рестартом не снята (apt install sqlite3)" >&2
elif [ -f "$DB" ]; then
  mkdir -p "$BACKUPS"
  copy="$BACKUPS/museum-predeploy-$(date +%F-%H%M%S).db"
  sqlite3 "$DB" ".backup '$copy'"
  echo "→ копия базы: $copy"
  # Предрелизные копии храним две недели — суточные бэкапы из cron не трогаем.
  find "$BACKUPS" -name 'museum-predeploy-*.db' -mtime +14 -delete
fi

echo "→ рестарт $SERVICE"
systemctl restart "$SERVICE"

# Ждём, пока API поднимется: упал на старте (например, не хватает переменной
# в .env) — деплой красный, и в Actions видно последние строки журнала.
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8787/api/health >/dev/null 2>&1; then
    echo "→ $(date -Is) готово: API отвечает"
    exit 0
  fi
  sleep 1
done

echo "✗ API не ответил за 20 секунд после рестарта" >&2
journalctl -u "$SERVICE" -n 40 --no-pager >&2 || true
exit 1
