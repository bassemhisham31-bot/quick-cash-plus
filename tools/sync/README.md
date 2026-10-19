# مزامنة نسخة الويب من نسخة الأوفلاين

آخر مزامنة كاملة: 2026-10-19 (الأوفلاين وقتها وصل لـ migration 068).

الأوفلاين (`D:\New Project`) هو الأصل. الويب بياخد منه كل حاجة ما عدا الأجزاء المرتبطة بـElectron:

| الجزء | الطريقة |
|---|---|
| `backend/src/main/db/migrations/*`, `services/*` (معظمها), `shared/*`, `db/seed.ts` | نسخ مباشر من الأوفلاين |
| `backend/src/main/handlers.ts` | `node tools/sync/port-handlers.cjs` (بيشيل قنوات الملفات/Google Drive/الشبكة المحلية) |
| `services/catalogImportExport.ts` | `node tools/sync/port-catalog-import.cjs` (base64 بدل حوارات Electron) |
| `services/exportReport.ts` | `tools/sync/web-overrides/exportReport.ts` (نسخ مباشر؛ PDF = HTML يتطبع من المتصفح) |
| `backend/src/main/services/print.ts` | `node tools/sync/port-print.cjs` (الطباعة بقت "capture": السيرفر بيرجّع jobs والمتصفح يطبعها عبر QZ Tray) |
| `frontend/src/renderer/src/platform/webApi.ts` | `node tools/sync/gen-webapi.cjs` (بيتولّد من `src/preload/index.ts` + `prelude.txt`) |
| باقي `frontend/src/renderer/src/**` | نسخ مباشر، ما عدا `main.tsx` و`platform/` |

## تعديلات ويب مقصودة على نسخ مباشرة (لازم تتراجع بعد كل نسخ)
- `services/whatsapp.ts` (stub)، `services/backup.ts` (Turso/مسار السيرفر)، `services/devicePrint.ts` (categoryPrinterList بس)
- `services/settings.ts`: `getSystemPrinters()` بترجع `[]`
- `services/attendance.ts`: تحميل `node-zklib` كسول
- `db/index.ts`: `initDatabase()` بمتغيرات البيئة + قايمة الـmigrations
- `http/server.ts`: JWT، capture الطباعة، قفل الترخيص، `{__undef:true}` لتمييز undefined من null
- `attachments.ts` / `googleDrive.ts`: مش منقولين (قنوات stub في `webApi.ts`)
- `web-tail.txt`: network/system/onDataChanged الخاصين بالويب في `webApi.ts`
