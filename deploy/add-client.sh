#!/usr/bin/env bash
# إضافة عميل جديد: نسخة backend منفصلة (منفذ + قاعدة Turso + سر JWT خاص) + دومين فرعي بـHTTPS.
# الاستخدام:
#   bash add-client.sh <اسم-العميل> <الدومين-الكامل> [<TURSO_URL> <TURSO_TOKEN>]
#   من غير Turso: قاعدة SQLite محلية على السيرفر (الأسرع — النسخ الاحتياطية تلقائية داخل البرنامج)
#
# النسخة (--edition، الافتراضي full):
#   full   = كل الميزات
#   retail = من غير أي حاجة تخص المطاعم (طاولات/مطبخ/كباتن/توصيل/وصفات/حجوزات/مناسبات)
#   بتتحفظ في .env كـQCP_EDITION وبتثبت لحد ما تتغير يدويًا (القيمة بتتقري عند تشغيل النسخة).
# أمثلة:
#   bash add-client.sh acme acme.qcplus.app
#   bash add-client.sh shop shop.qcplus.app --edition retail
#   bash add-client.sh chain chain.qcplus.app --edition retail --branches   # أكتر من فرع (يوم/خزنة/مخزن/تقارير لكل فرع)
#   bash add-client.sh acme acme.example.com libsql://acme-xxx.turso.io eyJ...
set -euo pipefail

EDITION=full
EDITION_GIVEN=0
BRANCHES=off
POSITIONAL=()
while [ $# -gt 0 ]; do
  case "$1" in
    --edition)   EDITION="${2:?--edition محتاج قيمة: full أو retail}"; EDITION_GIVEN=1; shift 2 ;;
    --edition=*) EDITION="${1#--edition=}"; EDITION_GIVEN=1; shift ;;
    --branches)  BRANCHES=on; shift ;;
    *)           POSITIONAL+=("$1"); shift ;;
  esac
done
set -- "${POSITIONAL[@]}"

NAME="${1:?اسم العميل (حروف إنجليزية صغيرة وأرقام وشرطة)}"
DOMAIN="${2:?الدومين الكامل للعميل}"
DB_URL="${3:-}"
DB_TOKEN="${4:-}"

[[ "$NAME" =~ ^[a-z0-9-]+$ ]] || { echo "اسم العميل غير صالح"; exit 1; }
[[ "$EDITION" =~ ^(full|retail)$ ]] || { echo "النسخة غير صالحة: $EDITION (المسموح full أو retail)"; exit 1; }

# مجلد الكود اللي هيشغّل العميل ده. الافتراضي هو المجلد المشترك؛ ولو عايز عميل يشتغل بنسخة كود تانية
# من غير ما تلمس باقي العملاء: اعمل checkout تاني (مثلًا /opt/qcp/app-shop) وشغّل السكريبت بـQCP_APP_DIR=<المجلد>
APP_DIR="${QCP_APP_DIR:-/opt/qcp/app}"
[ -d "$APP_DIR/backend" ] && [ -d "$APP_DIR/frontend/dist" ] || { echo "مجلد الكود $APP_DIR مش جاهز (لازم فيه backend وfrontend/dist مبنية)"; exit 1; }
CLIENT_DIR=/opt/qcp/clients/$NAME
PORTS_FILE=/opt/qcp/clients/.ports

mkdir -p "$CLIENT_DIR"
touch "$PORTS_FILE"

# منفذ داخلي ثابت لكل عميل (يبدأ من 4101)
if grep -q "^$NAME " "$PORTS_FILE"; then
  PORT=$(grep "^$NAME " "$PORTS_FILE" | awk '{print $2}')
else
  LAST=$(awk '{print $2}' "$PORTS_FILE" | sort -n | tail -1)
  PORT=$(( ${LAST:-4100} + 1 ))
  echo "$NAME $PORT" >> "$PORTS_FILE"
fi

ENV_FILE="$CLIENT_DIR/.env"
ADMIN_PASS=$(openssl rand -base64 12 | tr -d "/+=" | cut -c1-12)
if [ ! -f "$ENV_FILE" ]; then
  NEW_ENV=1
  umask 077
  cat > "$ENV_FILE" <<ENV
PORT=$PORT
QCP_JWT_SECRET=$(openssl rand -hex 48)
QCP_ADMIN_PASSWORD=$ADMIN_PASS
QCP_INTERNAL_SECRET=$(openssl rand -hex 24)
QCP_EDITION=$EDITION
$( [ "$BRANCHES" = on ] && echo "QCP_BRANCHES=on" )
$( [ -n "$DB_URL" ] && printf "QCP_DB_URL=%s
QCP_DB_AUTH_TOKEN=%s" "$DB_URL" "$DB_TOKEN" )
QCP_DATA_DIR=$CLIENT_DIR/data
QCP_BACKUP_DIR=$CLIENT_DIR/backups
ENV
else
  echo "ملف .env موجود بالفعل لعميل $NAME — مش هعدّل عليه (السر والتوكن محفوظين)"
  EDITION=$(grep -m1 '^QCP_EDITION=' "$ENV_FILE" | cut -d= -f2 || true)
  EDITION="${EDITION:-full}"
  if [ "$EDITION_GIVEN" = 1 ]; then echo "ℹ️  النسخة الحالية للعميل: $EDITION (الـ--edition اتجاهل — لتغييرها عدّل QCP_EDITION في $ENV_FILE وأعد تشغيل qcp-$NAME)"; fi
fi
chmod 600 "$ENV_FILE"
umask 022   # ملفات Caddy لازم تتقري من مستخدم caddy

cat > "$CLIENT_DIR/ecosystem.config.cjs" <<PM2
module.exports = {
  apps: [{
    name: 'qcp-$NAME',
    cwd: '$APP_DIR/backend',
    script: 'npx',
    args: 'tsx src/index.ts',
    env: { QCP_ENV_FILE: '$ENV_FILE' },
    max_memory_restart: '400M'
  }]
}
PM2
chown -R qcp:qcp "$CLIENT_DIR" "$PORTS_FILE"

cat > /etc/caddy/clients/$NAME.caddy <<CADDY
$DOMAIN {
	encode gzip
	handle /api/* {
		reverse_proxy 127.0.0.1:$PORT
	}
	handle /ws {
		reverse_proxy 127.0.0.1:$PORT
	}
	handle {
		root * $APP_DIR/frontend/dist
		try_files {path} /index.html
		file_server
	}
}
CADDY

chmod 644 /etc/caddy/clients/$NAME.caddy
sudo -u qcp pm2 start "$CLIENT_DIR/ecosystem.config.cjs"
sudo -u qcp pm2 save
systemctl reload caddy

if [ "${NEW_ENV:-0}" = 1 ]; then echo "🔑 باسورد admin الأولي: $ADMIN_PASS  (غيّره بعد أول دخول — محفوظ كمان في $ENV_FILE)"; fi
echo "✅ العميل $NAME شغال على https://$DOMAIN (منفذ داخلي $PORT، نسخة: $EDITION$( grep -q '^QCP_BRANCHES=on' "$ENV_FILE" && echo '، فروع: مفعّلة' ))"
echo "   تأكد إن سجل DNS لـ $DOMAIN بيشاور على IP السيرفر."
