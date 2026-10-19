#!/usr/bin/env bash
# ضبط ترخيص عميل من السيرفر (بيتشغّل كـroot). التفعيل بأمر المالك، مش بكود بيلصقه العميل.
#
# الاستخدام:
#   bash set-license.sh <العميل> status                              # يعرض الحالة الحالية
#   bash set-license.sh <العميل> trial [عدد-الأيام]                 # تجربة من دلوقتي (الافتراضي 30)
#   bash set-license.sh <العميل> monthly|yearly|daily <YYYY-MM-DD> [ميزات-موقوفة-csv]
#
# أمثلة:
#   bash set-license.sh quickcash status
#   bash set-license.sh quickcash yearly 2027-10-31
#   bash set-license.sh quickcash monthly 2026-12-01 settings:backup,restaurant
#
# السلوك: تحذير للعميل قبل الانتهاء بـ7 أيام، وبعد الانتهاء فترة سماح 7 أيام (شغال مع تحذير أحمر)، وبعدها بيتقفل.
set -euo pipefail

NAME="${1:?اسم العميل}"
ACTION="${2:?status | trial | monthly | yearly | daily}"
CLIENT_DIR=/opt/qcp/clients/$NAME
ENV_FILE="$CLIENT_DIR/.env"
[ -f "$ENV_FILE" ] || { echo "العميل $NAME مش موجود"; exit 1; }

PORT=$(grep -m1 '^PORT=' "$ENV_FILE" | cut -d= -f2)

# عملاء اتعملوا قبل ميزة الترخيص: نضيف السر الداخلي ونعيد تشغيل النسخة مرة واحدة
if ! grep -q '^QCP_INTERNAL_SECRET=' "$ENV_FILE"; then
  echo "QCP_INTERNAL_SECRET=$(openssl rand -hex 24)" >> "$ENV_FILE"
  sudo -u qcp pm2 restart "qcp-$NAME" --update-env >/dev/null
  for _ in $(seq 1 30); do
    curl -s -o /dev/null -m 3 "http://127.0.0.1:$PORT/api/health" && break
    sleep 2
  done
fi
SECRET=$(grep -m1 '^QCP_INTERNAL_SECRET=' "$ENV_FILE" | cut -d= -f2)

case "$ACTION" in
  status) BODY='{}' ;;
  trial)  BODY=$(node -e 'console.log(JSON.stringify({plan:"trial",trialDays:Number(process.argv[1]||30)}))' "${3:-30}") ;;
  monthly|yearly|daily)
    EXP="${3:?تاريخ الانتهاء YYYY-MM-DD}"
    BODY=$(node -e 'const [plan,exp,feat]=process.argv.slice(1);console.log(JSON.stringify({plan,expiresAt:exp,disabledFeatures:(feat||"").split(",").filter(Boolean)}))' "$ACTION" "$EXP" "${4:-}")
    ;;
  *) echo "إجراء غير معروف: $ACTION"; exit 1 ;;
esac

RESP=$(curl -s -m 20 -X POST "http://127.0.0.1:$PORT/internal/license" \
  -H "Content-Type: application/json" -H "x-qcp-internal: $SECRET" -d "$BODY")

node -e '
let r; try { r = JSON.parse(process.argv[1]) } catch { console.log("رد غير متوقع من السيرفر:", process.argv[1]); process.exit(1) }
if (!r.ok) { console.log("❌", r.error || "فشل"); process.exit(1) }
const s = r.status
console.log("✅ الترخيص:", JSON.stringify({ الحالة: s.status, الخطة: s.plan, "أيام متبقية": s.daysRemaining, "ينتهي": s.expiresAt, "سماح (أيام)": s.graceDaysLeft ?? null, "ميزات موقوفة": s.disabledFeatures }))
' "$RESP"
