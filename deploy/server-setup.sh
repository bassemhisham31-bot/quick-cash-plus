#!/usr/bin/env bash
# تجهيز سيرفر Ubuntu 24.04 جديد (مرة واحدة). بيتشغّل كـroot.
# الاستخدام:  bash server-setup.sh https://github.com/<user>/<repo>.git
set -euo pipefail

REPO_URL="${1:?لازم تدي رابط الريبو كأول argument}"
APP_DIR=/opt/qcp/app
CLIENTS_DIR=/opt/qcp/clients

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ufw debian-keyring debian-archive-keyring apt-transport-https gnupg

# Node.js 22 LTS
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy (HTTPS تلقائي)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

# PM2
command -v pm2 >/dev/null || npm install -g pm2

# مستخدم خدمة بدون صلاحيات root
id qcp >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash qcp
mkdir -p "$CLIENTS_DIR" /etc/caddy/clients
chown -R qcp:qcp /opt/qcp

# الكود
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u qcp git clone "$REPO_URL" "$APP_DIR"
fi

# Caddy: ملف رئيسي بيستورد ملف لكل عميل
cat > /etc/caddy/Caddyfile <<'CADDY'
import /etc/caddy/clients/*.caddy
CADDY

# Firewall: SSH + HTTP/HTTPS بس (منافذ العملاء الداخلية مش مفتوحة للخارج)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# PM2 يشتغل تلقائيًا بعد إعادة تشغيل السيرفر
env PATH="$PATH:/usr/bin" pm2 startup systemd -u qcp --hp /home/qcp >/dev/null

systemctl enable --now caddy
echo "✅ السيرفر جاهز. الخطوة التالية: bash $APP_DIR/deploy/update.sh ثم add-client.sh لكل عميل"
