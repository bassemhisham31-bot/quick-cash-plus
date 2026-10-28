#!/usr/bin/env bash
# تحديث الكود وإعادة بناء الواجهة وإعادة تشغيل كل العملاء. بيتشغّل كـroot أو qcp.
set -euo pipefail
# QCP_APP_DIR: تحديث checkout منفصل (عميل بنسخة كود تانية) — بيعيد تشغيل عملاء المجلد ده بس
APP_DIR="${QCP_APP_DIR:-/opt/qcp/app}"
RUN="sudo -u qcp"; [ "$(id -un)" = qcp ] && RUN=""

cd "$APP_DIR"
$RUN git pull --ff-only
(cd backend && $RUN npm ci --omit=dev)
(cd frontend && $RUN npm ci && $RUN npm run build)

# إعادة تشغيل عملاء المجلد ده بس (الـmigrations بتتطبّق تلقائيًا عند تشغيل كل نسخة على قاعدتها)
CLIENTS=$($RUN pm2 jlist | node -e 'const l=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(l.filter(p=>p.pm2_env&&p.pm2_env.pm_cwd===process.argv[1]).map(p=>p.name).join(" "))' "$APP_DIR/backend")
[ -n "$CLIENTS" ] || echo "⚠️  مفيش عملاء شغالين من $APP_DIR/backend — ماتعملش restart لأي حد"
for c in $CLIENTS; do
  $RUN pm2 restart "$c" --update-env
done
echo "✅ تم التحديث"
