#!/usr/bin/env bash
# نسخ ملفات النسخ الاحتياطي (الجاهزة والثابتة — مش القاعدة الحية) لـCloudflare R2 عبر rclone.
# القاعدة الحية ما بتتفتحش من أي عملية تانية (ده بيسبب تلف)، النسخ بتتعمل من جوه البرنامج نفسه.
# بيتشغّل من cron (كل ساعة مثلًا). محتاج إعداد rclone مرة واحدة باسم remote: r2  (شوف README).
set -euo pipefail
BUCKET="${QCP_R2_BUCKET:-qcp-backups}"
rclone sync /opt/qcp/clients "r2:$BUCKET" \
  --include '/*/backups/*.sqlite' --exclude '*' \
  --min-age 1m --fast-list --log-level NOTICE
echo "$(date -Is) offsite backup done"
