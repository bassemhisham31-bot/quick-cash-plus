#!/usr/bin/env bash
# تحويل شجرة حسابات عميل للنظام المبسّط: 7 حسابات أساسية بس (1000 الايرادات … 7000 حقوق الملكية) ومسح باقي الحسابات.
# بيشتغل جوه السيرفر الحي بتاع العميل (مفيش اتصال تاني بملف SQLite) وبيتعمل نسخة احتياطية تلقائيًا قبل أي تغيير.
#
# الاستخدام (كـroot على السيرفر):
#   bash simplify-chart.sh <العميل> plan            # يعرض اللي هيتحذف واللي هيتنقل — من غير أي تغيير
#   bash simplify-chart.sh <العميل> apply --yes     # ينفّذ (نسخة احتياطية ثم تحويل) — لازم --yes صريحة
#
# القيود اليدوية على الحسابات المحذوفة بتتنقل لحساب أساسي من نفس النوع؛ فواتير ومشتريات ومصروفات العميل ما بتتأثرش
# (قيودها بتتولّد وقت القراءة) والأرقام الكلية (صافي الربح/الأصول/الخصوم) بتفضل زي ما هي.
# بيتطلب إن كود الإصدار الجديد (اللي فيه accountsChart.ts) يكون شغّال عند العميل قبل التنفيذ.
set -euo pipefail

NAME="${1:?اسم العميل}"
ACTION="${2:?plan | apply}"
CLIENT_DIR=/opt/qcp/clients/$NAME
ENV_FILE="$CLIENT_DIR/.env"
[ -f "$ENV_FILE" ] || { echo "العميل $NAME مش موجود"; exit 1; }
case "$ACTION" in plan) ;; apply) [ "${3:-}" = "--yes" ] || { echo "التنفيذ بيمسح حسابات العميل — أضف --yes صراحةً بعد ما تراجع نتيجة plan"; exit 1; } ;; *) echo "إجراء غير معروف: $ACTION"; exit 1 ;; esac

PORT=$(grep -m1 '^PORT=' "$ENV_FILE" | cut -d= -f2)
SECRET=$(grep -m1 '^QCP_INTERNAL_SECRET=' "$ENV_FILE" | cut -d= -f2 || true)
[ -n "$SECRET" ] || { echo "مفيش QCP_INTERNAL_SECRET في $ENV_FILE — شغّل set-license.sh $NAME status الأول عشان يتضاف"; exit 1; }

RESP=$(curl -s -m 120 -X POST "http://127.0.0.1:$PORT/internal/chart" \
  -H "Content-Type: application/json" -H "x-qcp-internal: $SECRET" -d "{\"action\":\"$ACTION\"}")

node -e '
let r; try { r = JSON.parse(process.argv[1]) } catch { console.log("رد غير متوقع من السيرفر (النسخة المنشورة ما فيهاش التحويل؟):", process.argv[1].slice(0, 200)); process.exit(1) }
if (!r.ok) { console.log("❌", r.error || "فشل"); process.exit(1) }
const p = r.plan
console.log(p.alreadyConverted ? "الشجرة متحوّلة بالفعل للنظام المبسّط" : "الحسابات الحالية (" + p.toDelete.length + ") — هتتحذف:")
for (const a of p.toDelete) console.log("  ", a.code, a.name, "[" + a.type + "]", a.isSystem ? "(نظام)" : "(يدوي)", a.manualLines ? "← " + a.manualLines + " سطر قيد يدوي هيتنقل لـ" + a.remapTo : "")
console.log("هتتعمل:", p.toCreate.map((a) => a.code + " " + a.name).join(" | "))
console.log("سطور قيود يدوية هيتغيّر كودها:", p.manualLinesToRemap, "— سطور على أكواد مش موجودة أصلًا:", p.orphanLines)
if (r.backup) console.log("✅ تم التحويل. النسخة الاحتياطية قبل التحويل:", r.backup)
' "$RESP"
