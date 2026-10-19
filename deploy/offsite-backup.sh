#!/usr/bin/env bash
# نسخ ملفات النسخ الاحتياطي (الجاهزة والثابتة — مش القاعدة الحية) لـCloudflare R2 عبر rclone.
# القاعدة الحية ما بتتفتحش من أي عملية تانية (ده بيسبب تلف)، النسخ بتتعمل من جوه البرنامج نفسه.
# بيتشغّل من cron (كل ساعة). محتاج remote اسمه r2 في rclone (شوف deploy/README.md).
#
# ملاحظة: "copy" مش "sync" عن قصد — السيرفر بيقلّم نسخه المحلية (آخر 10)، ومش عايزين ده يمسح
# التاريخ الأطول على R2. نظّف النسخ القديمة من R2 بقاعدة Lifecycle على الـbucket (مثلًا حذف بعد 30 يوم).
set -euo pipefail
BUCKET="${QCP_R2_BUCKET:-qcp-backups}"

# نسخة rclone القديمة مع R2 بتفشل أحيانًا بـ501 في أول محاولة وبتنجح في التانية — فمعانا retries
rclone copy /opt/qcp/clients "r2:$BUCKET" \
  --filter '+ /*/backups/*.sqlite' --filter '- *' \
  --min-age 1m --retries 5 --low-level-retries 5 --log-level ERROR

echo "$(date -Is) offsite backup done"
