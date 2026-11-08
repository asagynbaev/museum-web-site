#!/usr/bin/env bash
# Настройка автодеплоя одной командой — запускать на СВОЁМ компьютере, не на сервере:
#
#   bash deploy/setup-autodeploy.sh                  # сервер 84.54.12.242, вход root@
#   SSH_TARGET=admin@84.54.12.242 bash deploy/setup-autodeploy.sh
#
# Нужно: ssh-доступ к серверу с правами root (или sudo без пароля) и GitHub CLI,
# залогиненный под владельцем репозитория (`gh auth login`).
#
# Что делает:
#   1. создаёт ключ деплоя во временной папке на этом компьютере;
#   2. по ssh настраивает сервер: пользователь deploy, /usr/local/bin/museum-deploy,
#      sudoers только на этот скрипт, публичный ключ с command=… в authorized_keys;
#   3. кладёт в GitHub секреты DEPLOY_HOST/USER/SSH_KEY/KNOWN_HOSTS;
#   4. стирает приватный ключ отсюда — он остаётся только в секретах GitHub;
#   5. запускает workflow Deploy.
#
# Повторный запуск безопасен: ключ просто заменится новым.

set -euo pipefail

HOST=${HOST:-84.54.12.242}
SSH_TARGET=${SSH_TARGET:-root@$HOST}
REPO=${REPO:-asagynbaev/museum-web-site}

for tool in ssh ssh-keygen gh; do
  command -v "$tool" >/dev/null || { echo "✗ не найден $tool" >&2; exit 1; }
done
gh auth status >/dev/null 2>&1 || { echo "✗ gh не залогинен: выполните gh auth login" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "→ ключ деплоя"
ssh-keygen -q -t ed25519 -N '' -C github-actions-museum -f "$tmp/key"
pub=$(cat "$tmp/key.pub")

echo "→ настраиваю сервер $SSH_TARGET"
# Всё через sudo: под root он пароля не спросит, под админом — тоже, если NOPASSWD.
ssh "$SSH_TARGET" "PUB='$pub' SUDO=sudo bash -s" <<'REMOTE'
set -euo pipefail
$SUDO -u museum git -C /opt/museum pull --ff-only
id deploy >/dev/null 2>&1 || $SUDO useradd -m -s /bin/bash deploy
$SUDO install -o root -g root -m 755 /opt/museum/deploy/museum-deploy.sh /usr/local/bin/museum-deploy

echo 'deploy ALL=(root) NOPASSWD: /usr/local/bin/museum-deploy' | $SUDO tee /etc/sudoers.d/museum-deploy >/dev/null
$SUDO chmod 440 /etc/sudoers.d/museum-deploy
$SUDO visudo -cf /etc/sudoers.d/museum-deploy >/dev/null

$SUDO install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
echo "command=\"sudo /usr/local/bin/museum-deploy\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $PUB" \
  | $SUDO tee /home/deploy/.ssh/authorized_keys >/dev/null
$SUDO chown deploy:deploy /home/deploy/.ssh/authorized_keys
$SUDO chmod 600 /home/deploy/.ssh/authorized_keys

if $SUDO grep -qE '^[[:space:]]*Allow(Users|Groups)' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null; then
  echo "! в sshd_config есть AllowUsers/AllowGroups — добавьте туда deploy и выполните systemctl reload ssh" >&2
fi
echo "  сервер готов"
REMOTE

# Ключ хоста берём по уже доверенному ssh-соединению, а не ssh-keyscan:
# так подменить его по дороге нельзя.
hostkey=$(ssh "$SSH_TARGET" "cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub")

echo "→ секреты в GitHub ($REPO)"
gh secret set DEPLOY_HOST -R "$REPO" --body "$HOST"
gh secret set DEPLOY_USER -R "$REPO" --body deploy
gh secret set DEPLOY_SSH_KEY -R "$REPO" < "$tmp/key"
gh secret set DEPLOY_KNOWN_HOSTS -R "$REPO" --body "$HOST $hostkey"

echo "→ запускаю Deploy"
gh workflow run deploy.yml -R "$REPO" --ref main
sleep 3
echo "✓ готово. Следить: gh run watch -R $REPO  (или вкладка Actions на GitHub)"
