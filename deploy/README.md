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

### نسخة العميل (`--edition`)
كل عميل له قاعدة بيانات منفصلة بالفعل (مجلد + SQLite + منفذ خاص بيه). والنسخة بتحدد الميزات اللي ظاهرة له:

| النسخة | المحتوى |
|---|---|
| `full` (الافتراضي) | كل الميزات |
| `retail` | من غير أي حاجة تخص المطاعم: المطاعم/الترابيزات/الكباتن/التوصيل/حجوزات المناسبات، الوصفات، تقارير المطاعم، قسم إعدادات المطاعم، وصلاحياتها |

```bash
bash /opt/qcp/app/deploy/add-client.sh shop shop.qcplus.app --edition retail
```
- بتتحفظ في `.env` الخاص بالعميل كـ`QCP_EDITION=retail` وبتفضل ثابتة حتى لو اتجدد الترخيص بـ`set-license.sh` (الميزات الموقوفة بالنسخة بتتدمج مع اللي بتوقفه بالترخيص).
- الإخفاء بيتم في الواجهة **والسيرفر كمان بيرفض قنوات المطاعم** (`restaurant:` `recipes:` `delivery:` `reservations:` `events:` وتقاريرها).
- جداول المطاعم بتفضل موجودة فاضية في قاعدة العميل (الـmigrations واحدة لكل العملاء عشان `update.sh` يحدّث الكل بنفس الكود).
- لتغيير نسخة عميل موجود: عدّل `QCP_EDITION` في `/opt/qcp/clients/<name>/.env` ثم `sudo -u qcp pm2 restart qcp-<name> --update-env`. العملاء اللي ملهمش القيمة دي (زي `quickcash`) بيشتغلوا `full`.
- القائمة نفسها في `backend/src/main/services/edition.ts`.

### ميزة الفروع (`--branches`)
عميل بأكتر من فرع على نفس السيرفر وقاعدة البيانات الواحدة:
```bash
bash /opt/qcp/app/deploy/add-client.sh chain chain.qcplus.app --edition retail --branches
```
- بتتحفظ في `.env` كـ`QCP_BRANCHES=on`. من غيرها (الافتراضي) كل حاجة بتشتغل زي ما كانت بفرع واحد مخفي.
- **كل فرع مستقل في:** المخزن، الخزائن (كاش/بنك/محافظ)، اليوم/الوردية (يفتح ويقفل لوحده)، الكاشيرات، المصروفات، الموظفين، الفواتير المعلّقة. **مشترك:** المنتجات والأسعار والعملاء والموردين (ومديونية العميل شاملة).
- الأدمن بيعمل الفروع من الإعدادات ← الفروع (الفرع الجديد بيتعمله مخزن و3 خزائن تلقائيًا) ويربط كل مستخدم بفرع من شاشة المستخدمين. الكاشير بيشوف فرعه بس ومايقدرش يغيّره؛ الأدمن بيبدّل الفرع أو "كل الفروع" من أعلى الشاشة وكل الشاشات والتقارير بتتعرض بنطاقه.
- تقرير **مقارنة الفروع** (للأدمن) + اسم الفرع على الإيصال وملخص الوردية. دفتر القيود والتقارير المحاسبية بتتفلتر بالفرع كمان (القيود اليدوية والأرصدة الافتتاحية بتظهر في "كل الفروع" بس).
- نقل البضاعة بين الفروع بنقل المخزون العادي (المصدر من مخازن الفرع، والوجهة أي فرع).
- الأدمن على "كل الفروع" للقراءة والتقارير بس: البيع وفتح اليوم والمصروفات والمشتريات محتاجة فرع محدد.
- الـmigration 070 بتضيف عمود `branch_id` (الافتراضي 1) والأمر كله إضافة بس، وبتشتغل على أي عميل بيتحدّث للكود ده حتى لو الفروع مقفولة عنده.

### عميل بنسخة كود منفصلة (من غير ما نلمس باقي العملاء)
`update.sh` بيعمل `git pull` وبيعيد تشغيل عملاء المجلد ده كلهم + بيطبّق الـmigrations الجديدة على قواعدهم. لو عايز عميل جديد يشتغل بكود أحدث والعملاء الشغالين يفضلوا زي ما هم بالظبط:
```bash
sudo -u qcp git clone --branch <branch> https://github.com/bassemhisham31-bot/quick-cash-plus.git /opt/qcp/app-shop
cd /opt/qcp/app-shop && (cd backend && sudo -u qcp npm ci --omit=dev) && (cd frontend && sudo -u qcp npm ci && sudo -u qcp npm run build)
QCP_APP_DIR=/opt/qcp/app-shop bash /opt/qcp/app-shop/deploy/add-client.sh shop shop.qcplus.app --edition retail
# لاحقًا لتحديث العميل ده بس:
QCP_APP_DIR=/opt/qcp/app-shop bash /opt/qcp/app-shop/deploy/update.sh
```
كل مجلد بيعمل restart لعملائه هو بس (بيتعرفوا من `pm_cwd` في pm2). Caddy بيقدّم واجهة العميل من `frontend/dist` بتاع مجلده.

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

## 4) الترخيص والاشتراكات
التفعيل بأمر من السيرفر (العميل مابيكتبش أكواد — والتفعيل بكود معطّل على الويب عن قصد لأن سر توقيع الأكواد في الكود المنشور).
```bash
bash /opt/qcp/app/deploy/set-license.sh quickcash status
bash /opt/qcp/app/deploy/set-license.sh quickcash trial 30
bash /opt/qcp/app/deploy/set-license.sh quickcash yearly 2027-10-31
bash /opt/qcp/app/deploy/set-license.sh quickcash monthly 2026-12-01 settings:backup,restaurant   # ميزات موقوفة (اختياري)
```
- قبل الانتهاء بـ7 أيام: شريط تحذير أصفر للعميل. بعد الانتهاء: **فترة سماح 7 أيام** (شغال مع شريط أحمر)، وبعدها البرنامج بيتقفل (قراءة شاشة التفعيل فقط) لحد ما تجدد.
- التجديد = نفس الأمر بتاريخ جديد؛ بيرجّع التشغيل فورًا.
- المسار `/internal/license` على localhost فقط + سر `QCP_INTERNAL_SECRET` في .env الخاص بالعميل (مش متاح من الإنترنت).

## 4-ب) تحويل شجرة الحسابات لـ7 حسابات أساسية (`simplify-chart.sh`)
بيمسح كل حسابات العميل ويعمل 1000 الايرادات / 2000 تكلفة المبيعات / 3000 المصروفات / 4000 الأصول الثابتة / 5000 الأصول المتداولة / 6000 الخصوم / 7000 حقوق الملكية بس، ويربط حركات النظام (مبيعات، عملاء، مخزون، خزائن...) بيهم. بيشتغل جوه السيرفر الحي (من غير فتح SQLite من برة) وبيعمل نسخة احتياطية قبل أي تغيير. محتاج إن الإصدار الجديد (اللي فيه `accountsChart.ts`) يكون شغّال عند العميل.
```bash
bash /opt/qcp/app/deploy/simplify-chart.sh quickcash plan          # يعرض اللي هيتحذف — من غير أي تغيير
bash /opt/qcp/app/deploy/simplify-chart.sh quickcash apply --yes   # ينفّذ (لازم --yes)
```
- القيود اليدوية على الحسابات المحذوفة بتتنقل لحساب أساسي من نفس النوع؛ الفواتير والمشتريات والمصروفات ما بتتأثرش (قيودها بتتولّد وقت القراءة) والأرقام الكلية بتفضل زي ما هي.
- بعد التحويل العميل بيضيف/يعدّل/يمسح حسابات من "التقارير المحاسبية ← شجرة الحسابات"، ويقدر يغيّر ربط الحركات بحسابات فرعية من "ربط حسابات النظام". التراجع = استرجاع النسخة الاحتياطية (`restore-client.sh`).

## 5) التحديث
```bash
bash /opt/qcp/app/deploy/update.sh
```
بيعمل `git pull` ويبني الواجهة ويعيد تشغيل كل العملاء (الـmigrations بتتطبق تلقائيًا على كل قاعدة).

## 6) إيقاف عميل
```bash
bash /opt/qcp/app/deploy/remove-client.sh acme
```
مابيمسحش قاعدة العميل ولا ملفاته.

## ملاحظات أمان
- كل عميل له `QCP_JWT_SECRET` عشوائي مولّد تلقائيًا في `.env` (صلاحيات 600).
- الـfirewall بيفتح SSH و80/443 بس؛ المنافذ الداخلية (4101+) مش متاحة من برّه.
- التراخيص: بأمر المالك من السيرفر (set-license.sh) — شوف قسم 4.

## النسخة التجريبية (demo) — `demo.qcplus.app`
نسخة كاملة (`QCP_EDITION=full`: سوبر ماركت + مطعم + كل الميزات) بقاعدة بيانات منفصلة تمامًا، بتتديها لعملاء محتملين يجرّبوا. بتشتغل من **checkout كود منفصل** (`/opt/qcp/app-demo`) عشان تحديثها ما يلمسش أي عميل حقيقي.
- `.env` بتاعها فيه `QCP_DEMO=on`: بيوقف قنوات بتلمس السيرفر نفسه (استرجاع/مسار النسخ الاحتياطي، مسح البيانات، واتساب، مساعد AI، أجهزة بصمة/PriceChecker) — القائمة في `edition.ts`.
- البيانات: `backend/scripts/seed-demo.ts` بتبنيها بدوال التطبيق نفسها (~120 صنف + خدمات بعمولة، فواتير بدفع مقسّم وآجل بتواريخ استحقاق، مشتريات آجلة، محلات مسوّقة، مطعم بترابيزات وكباتن ووصفات وطلبات شغالة، حجوزات، موظفين...) ووردية النهارده مفتوحة.
- **التجديد كل ليلة:** `/etc/cron.d/qcp-demo-reset` بيشغّل `deploy/reset-demo.sh` (بيرفض يمسح أي عميل من غير `QCP_DEMO=on`): بيوقف العميل، يحفظ آخر قاعدة في `previous/`، يعمل بيانات جديدة بتاريخ النهارده، ويرجّع الترخيص (10 سنين). يدويًا: `bash /opt/qcp/app-demo/deploy/reset-demo.sh`.
- تحديث كود الديمو: `QCP_APP_DIR=/opt/qcp/app-demo bash /opt/qcp/app-demo/deploy/update.sh` (بيعيد تشغيل الديمو بس).
