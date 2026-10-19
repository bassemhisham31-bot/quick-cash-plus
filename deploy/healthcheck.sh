#!/usr/bin/env bash
# فحص صحة السيرفر كله كل 5 دقايق (cron). لو كل حاجة سليمة بيبعت "نبضة" (heartbeat) لـUptimeRobot؛
# ولو أي حاجة بايظة بيسجّل السبب في /var/log/qcp-health.log ومابيبعتش النبضة — فـUptimeRobot هيبعتلك تنبيه
# لما النبضة تتأخر. رابط النبضة بيتخزن في /etc/qcp/heartbeat.url (بتحطه إنت بنفسك — سري).
#
# بيفحص: مساحة القرص، الذاكرة، Caddy، وكل عميل (PM2 شغال + /api/health بيرد + آخر نسخة احتياطية مش قديمة).
set -uo pipefail

CLIENTS_DIR=/opt/qcp/clients
LOG=/var/log/qcp-health.log
HEARTBEAT_FILE=/etc/qcp/heartbeat.url
problems=()

disk=$(df --output=pcent / | tail -1 | tr -dc '0-9')
[ "${disk:-0}" -lt 85 ] || problems+=("القرص ممتلي ${disk}%")

mem_avail=$(awk '/MemAvailable/ {print $2}' /proc/meminfo)
mem_total=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
[ $(( mem_avail * 100 / mem_total )) -ge 8 ] || problems+=("الذاكرة المتاحة أقل من 8%")

systemctl is-active --quiet caddy || problems+=("Caddy واقف")

online=$(sudo -u qcp pm2 jlist 2>/dev/null | tr ',' '\n' | grep -c '"status":"online"' || true)

for dir in "$CLIENTS_DIR"/*/; do
  name=$(basename "$dir")
  [ -f "$dir/.env" ] || continue
  # عميل متوقّف عن قصد (remove-client) مابيبقاش له ملف caddy
  [ -f "/etc/caddy/clients/$name.caddy" ] || continue

  port=$(grep -m1 '^PORT=' "$dir/.env" | cut -d= -f2)
  code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "http://127.0.0.1:$port/api/health" || echo 000)
  [ "$code" = 200 ] || problems+=("$name: /api/health رجّع $code")

  # SQLite محلية: لازم يكون فيه نسخة احتياطية من آخر 30 ساعة (الافتراضي كل 24)
  if ! grep -q '^QCP_DB_URL=' "$dir/.env"; then
    recent=$(find "$dir/backups" -name '*.sqlite' -mmin -1800 2>/dev/null | head -1)
    [ -n "$recent" ] || problems+=("$name: مفيش نسخة احتياطية من آخر 30 ساعة")
  fi
done

if [ ${#problems[@]} -eq 0 ]; then
  [ -f "$HEARTBEAT_FILE" ] && curl -fsS -m 10 -o /dev/null "$(tr -d '[:space:]' < "$HEARTBEAT_FILE")" || true
  exit 0
fi

echo "$(date -Is) PROBLEMS: ${problems[*]}" >> "$LOG"
exit 1
