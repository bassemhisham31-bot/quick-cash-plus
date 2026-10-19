#!/usr/bin/env bash
# إيقاف عميل وإزالة إعداد الدومين بتاعه (بيبقي ملفاته وبياناته المحلية في /opt/qcp/clients/<name> ولا بيمسح قاعدة Turso).
set -euo pipefail
NAME="${1:?اسم العميل}"
sudo -u qcp pm2 delete "qcp-$NAME" || true
sudo -u qcp pm2 save
rm -f "/etc/caddy/clients/$NAME.caddy"
systemctl reload caddy
echo "✅ اتوقّف $NAME (الملفات والقاعدة متمسحتش)"
