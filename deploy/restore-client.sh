#!/usr/bin/env bash
# استرجاع قاعدة عميل (SQLite محلية) من نسخة احتياطية. بيتشغّل كـroot.
# الاستخدام:
#   bash restore-client.sh <اسم-العميل>                 # بيعرض النسخ المتاحة
#   bash restore-client.sh <اسم-العميل> <اسم-ملف-النسخة> # بيسترجع
# القاعدة الحالية بتتحفظ جنب (مش بتتمسح) باسم  *.before-restore-<الوقت>
set -euo pipefail

NAME="${1:?اسم العميل}"
FILE="${2:-}"
CLIENT_DIR=/opt/qcp/clients/$NAME
BACKUPS="$CLIENT_DIR/backups"
DB="$CLIENT_DIR/data/quick-cash-plus.sqlite"

[ -d "$CLIENT_DIR" ] || { echo "العميل $NAME مش موجود"; exit 1; }
[ -f "$DB" ] || { echo "العميل ده مش على SQLite محلية (ممكن يكون على Turso)"; exit 1; }

if [ -z "$FILE" ]; then
  echo "النسخ المتاحة لـ $NAME (الأحدث أولًا):"
  ls -1t "$BACKUPS" | grep '\.sqlite$' | head -30
  exit 0
fi

SRC="$BACKUPS/$FILE"
[ -f "$SRC" ] || { echo "الملف مش موجود: $SRC"; exit 1; }

# نتأكد إن النسخة سليمة قبل ما نلمس أي حاجة
[ "$(sqlite3 "$SRC" 'PRAGMA integrity_check;')" = "ok" ] || { echo "النسخة دي تالفة — الاسترجاع اتلغى"; exit 1; }

STAMP=$(date +%Y%m%d-%H%M%S)
sudo -u qcp pm2 stop "qcp-$NAME"
mv "$DB" "$DB.before-restore-$STAMP"
rm -f "$DB-wal" "$DB-shm"
cp "$SRC" "$DB"
chown qcp:qcp "$DB"
sudo -u qcp pm2 start "qcp-$NAME"
echo "✅ اتسترجع $NAME من $FILE (القاعدة القديمة محفوظة: $DB.before-restore-$STAMP)"
