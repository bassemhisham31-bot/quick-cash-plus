# نشر Quick Cash Plus (نسخة لكل عميل)

كل عميل = نسخة backend منفصلة (منفذ داخلي + قاعدة Turso خاصة + سر JWT خاص) + دومين فرعي بـHTTPS.
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
1. اعمل قاعدة Turso جديدة للعميل (واحدة لكل عميل) وخد الـURL والتوكن.
2. في Cloudflare DNS: سجل `A` للدومين الفرعي (مثلًا `acme`) على IP السيرفر.
3. على السيرفر:
```bash
bash /opt/qcp/app/deploy/add-client.sh acme acme.example.com libsql://acme-xxx.turso.io <TOKEN>
```
أول تشغيل بيطبّق كل الـmigrations على قاعدة العميل ويعمل مستخدم admin الافتراضي — **غيّر باسورد admin فورًا**.

## 3) التحديث
```bash
bash /opt/qcp/app/deploy/update.sh
```
بيعمل `git pull` ويبني الواجهة ويعيد تشغيل كل العملاء (الـmigrations بتتطبق تلقائيًا على كل قاعدة).

## 4) إيقاف عميل
```bash
bash /opt/qcp/app/deploy/remove-client.sh acme
```
مابيمسحش قاعدة Turso ولا ملفات العميل.

## ملاحظات أمان
- كل عميل له `QCP_JWT_SECRET` عشوائي مولّد تلقائيًا في `.env` (صلاحيات 600).
- الـfirewall بيفتح SSH و80/443 بس؛ المنافذ الداخلية (4101+) مش متاحة من برّه.
- التراخيص: لسه مبنية على بصمة الجهاز — تحويلها لاشتراك لكل عميل شغل لاحق.
