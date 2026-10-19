# نشر Quick Cash Plus (نسخة لكل عميل)

كل عميل = نسخة backend منفصلة (منفذ داخلي + قاعدة بيانات خاصة + سر JWT خاص) + دومين فرعي بـHTTPS.
الواجهة (frontend) بتتبني مرة واحدة وبتتخدم لكل العملاء من نفس المجلد.

```
/opt/qcp/app/                  الكود (git clone) — واحد لكل العملاء
/opt/qcp/clients/<name>/       .env + ecosystem.config.cjs + data/ + backups/  — لكل عميل
/etc/caddy/clients/<name>.caddy  إعداد الدومين لكل عميل
```

## 1) تجهيز السيرفر (مرة واحدة)
على السيرفر بحساب root:
```bash
curl -fsSL https://raw.githubusercontent.com/<user>/<repo>/main/deploy/server-setup.sh -o server-setup.sh
bash server-setup.sh https://github.com/<user>/<repo>.git
bash /opt/qcp/app/deploy/update.sh     # أول بناء للواجهة
```

## 2) إضافة عميل
**الافتراضي: SQLite محلية على السيرفر** — الأسرع (مفيش شبكة بين البرنامج والقاعدة). Turso في Tokyo بيضيف حوالي 100ms لكل استعلام، فعملية بيع واحدة بتتأخر ثواني.

1. DNS: السجل `*` موجود بالفعل على IP السيرفر، فمش محتاج DNS جديد لكل عميل.
2. على السيرفر:
```bash
bash /opt/qcp/app/deploy/add-client.sh acme acme.qcplus.app
```
(بـTurso بدل المحلي: زوّد `<TURSO_URL> <TOKEN>` في الآخر.)

أول تشغيل بيعمل الجداول وبيانات البداية ويعرض **باسورد admin الأولي** مرة واحدة — غيّره بعد أول دخول.

## 3) النسخ الاحتياطي (SQLite المحلية)
- **داخل البرنامج:** كل عميل بيعمل نسخة تلقائيًا كل 24 ساعة (قابلة للتعديل من الإعدادات ← النسخ الاحتياطي)، وأول ما يقوم لو آخر نسخة أقدم من كده. بتتحفظ في `/opt/qcp/clients/<name>/backups` (آخر 10). النسخة بتتعمل بـ`VACUUM INTO` من نفس اتصال البرنامج. **ماتفتحش القاعدة الحية من أي عملية تانية أبدًا** (ده بيسبب تلف في البيانات).
- **خارج السيرفر:** `offsite-backup.sh` بينسخ ملفات النسخ (مش القاعدة الحية) لـCloudflare R2 عبر rclone:
  1. في Cloudflare: R2 ← Create bucket (`qcp-backups`) ← Manage R2 API Tokens ← Create token (Object Read & Write على الـbucket).
  2. على السيرفر (كـroot): `rclone config` ← New remote ← الاسم `r2` ← Cloudflare R2 ← Access Key/Secret (بتكتبهم إنت بنفسك) والـEndpoint بتاع حسابك.
  3. جرّب: `bash /opt/qcp/app/deploy/offsite-backup.sh` ثم أضفه لـcron:
     ```bash
     (crontab -l 2>/dev/null; echo '15 * * * * /opt/qcp/app/deploy/offsite-backup.sh >> /var/log/qcp-offsite.log 2>&1') | crontab -
     ```
- **لقطات Hetzner:** فعّل Backups للسيرفر من Hetzner Console (حوالي 20% زيادة على سعر السيرفر) كطبقة تالتة.

### الاسترجاع
```bash
bash /opt/qcp/app/deploy/restore-client.sh acme            # يعرض النسخ المتاحة
bash /opt/qcp/app/deploy/restore-client.sh acme quick-cash-plus-backup-<الوقت>.sqlite
```
بيتأكد إن النسخة سليمة، وبيحفظ القاعدة الحالية جنبها (`*.before-restore-*`) ويرجّع التشغيل. **جرّب الاسترجاع مرة على عميل اختبار قبل ما تحتاجه فعلًا.**

## 4) التحديث
```bash
bash /opt/qcp/app/deploy/update.sh
```
بيعمل `git pull` ويبني الواجهة ويعيد تشغيل كل العملاء (الـmigrations بتتطبق تلقائيًا على كل قاعدة).

## 5) إيقاف عميل
```bash
bash /opt/qcp/app/deploy/remove-client.sh acme
```
مابيمسحش قاعدة العميل ولا ملفاته.

## ملاحظات أمان
- كل عميل له `QCP_JWT_SECRET` عشوائي مولّد تلقائيًا في `.env` (صلاحيات 600).
- الـfirewall بيفتح SSH و80/443 بس؛ المنافذ الداخلية (4101+) مش متاحة من برّه.
- التراخيص: لسه مبنية على بصمة الجهاز — تحويلها لاشتراك لكل عميل شغل لاحق.
