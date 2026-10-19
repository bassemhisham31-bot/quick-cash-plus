#!/usr/bin/env bash
# تحديث الكود وإعادة بناء الواجهة وإعادة تشغيل كل العملاء. بيتشغّل كـroot أو qcp.
set -euo pipefail
APP_DIR=/opt/qcp/app
RUN="sudo -u qcp"; [ "$(id -un)" = qcp ] && RUN=""

cd "$APP_DIR"
$RUN git pull --ff-only
(cd backend && $RUN npm ci --omit=dev)
(cd frontend && $RUN npm ci && $RUN npm run build)

# إعادة تشغيل كل العملاء (الـmigrations بتتطبّق تلقائيًا عند تشغيل كل نسخة على قاعدتها)
if $RUN pm2 jlist | grep -q '"name"'; then
  $RUN pm2 restart all --update-env
fi
echo "✅ تم التحديث"
