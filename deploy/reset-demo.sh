#!/usr/bin/env bash
# تجديد بيانات النسخة التجريبية (demo): بيوقف العميل، يشيل قاعدته الحالية (آخر نسخة بتتحفظ في previous/)، يعمل بيانات جديدة
# بتاريخ النهارده من backend/scripts/seed-demo.ts (سوبر ماركت + مطعم + كل الميزات)، يشغّله، ويرجّع الترخيص الطويل.
# بيتشغّل كـroot — يدويًا أو من cron كل ليلة (/etc/cron.d/qcp-demo-reset):
#   bash /opt/qcp/app-demo/deploy/reset-demo.sh
#
# أمان: بيرفض يمسح أي عميل مش متعلّم QCP_DEMO=on في .env بتاعه (عشان ما يتشغّلش على عميل حقيقي بالغلط).
# مجلد qz (شهادة الطباعة) بيفضل زي ما هو عشان الموافقة اللي اتحفظت على أجهزة الطباعة ماتضيعش.
set -euo pipefail

NAME="${QCP_DEMO_NAME:-demo}"
APP_DIR="${QCP_APP_DIR:-/opt/qcp/app-demo}"
CLIENT_DIR=/opt/qcp/clients/$NAME
ENV_FILE="$CLIENT_DIR/.env"
DATA_DIR="$CLIENT_DIR/data"
PREV="$CLIENT_DIR/previous"

[ -f "$ENV_FILE" ] || { echo "العميل $NAME مش موجود"; exit 1; }
grep -q '^QCP_DEMO=on' "$ENV_FILE" || { echo "العميل $NAME مش نسخة تجريبية (QCP_DEMO=on مش موجود في .env) — رفضت أمسح قاعدته"; exit 1; }
[ -f "$APP_DIR/backend/scripts/seed-demo.ts" ] || { echo "سكريبت البيانات مش موجود في $APP_DIR"; exit 1; }

exec 9>"/var/lock/qcp-reset-$NAME.lock"
flock -n 9 || { echo "تجديد $NAME شغال بالفعل"; exit 1; }

PORT=$(grep -m1 '^PORT=' "$ENV_FILE" | cut -d= -f2)
ADMIN_PASS=$(grep -m1 '^QCP_ADMIN_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)
mkdir -p "$DATA_DIR" "$CLIENT_DIR/backups"

echo "$(date -Is) تجديد $NAME..."
sudo -u qcp pm2 stop "qcp-$NAME" >/dev/null 2>&1 || true

# آخر قاعدة بتتحفظ جنب (مش بتتمسح) لحد التجديد الجاي
rm -rf "$PREV"
mkdir -p "$PREV"
for f in "$DATA_DIR"/quick-cash-plus.sqlite*; do [ -e "$f" ] && mv "$f" "$PREV/"; done
rm -rf "$DATA_DIR/attachments"
chown -R qcp:qcp "$CLIENT_DIR"

if ! sudo -u qcp bash -c "cd '$APP_DIR/backend' && env QCP_DATA_DIR='$DATA_DIR' QCP_BACKUP_DIR='$CLIENT_DIR/backups' QCP_ADMIN_PASSWORD='$ADMIN_PASS' node --import tsx scripts/seed-demo.ts"; then
  echo "❌ فشل إنشاء البيانات — برجّع القاعدة اللي كانت موجودة"
  rm -f "$DATA_DIR"/quick-cash-plus.sqlite*
  for f in "$PREV"/quick-cash-plus.sqlite*; do [ -e "$f" ] && mv "$f" "$DATA_DIR/"; done
  chown -R qcp:qcp "$CLIENT_DIR"
  sudo -u qcp pm2 restart "qcp-$NAME" --update-env >/dev/null
  exit 1
fi

sudo -u qcp pm2 restart "qcp-$NAME" --update-env >/dev/null
for _ in $(seq 1 45); do
  curl -s -o /dev/null -m 3 "http://127.0.0.1:$PORT/api/health" && break
  sleep 2
done

# الترخيص جوه القاعدة فبيضيع مع المسح — نرجّعه طويل (10 سنين) عشان الديمو ما يتقفلش
bash "$APP_DIR/deploy/set-license.sh" "$NAME" yearly "$(date -d '+10 years' +%F)"
echo "$(date -Is) ✅ اتجدد $NAME (باسورد الأدمن محفوظ في $ENV_FILE)"
