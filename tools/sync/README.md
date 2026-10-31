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

- `db/seed.ts`: سطر الـhash بيقرا `QCP_ADMIN_PASSWORD` من البيئة (باسورد admin الأولي لكل عميل)

## 2026-10-28 — تعديلات ويب فقط (مش في الأوفلاين): نسخة retail + الفروع
`services/edition.ts` (QCP_EDITION)، `services/branchScope.ts` + `branches.ts` + migration 070 (QCP_BRANCHES) وتعديلات في معظم الـservices والتقارير ودفتر القيود، `scripts/branches-test.ts`. الواجهة: `appStore` (الفرع المختار) + `webApi.ts` (هيدر `x-qcp-branch` وقنوات `branches:*` و`catalog:listAllWarehouses` — **مضافة يدويًا، `gen-webapi.cjs` هيمسحها فلازم تتنقل لـ`prelude.txt`/`web-tail.txt` قبل أي توليد**)، ومبدّل الفرع في الـTopbar وقسم الفروع في الإعدادات. أي مزامنة من الأوفلاين لازم تحافظ على: `branchFilter/currentBranchId` في الاستعلامات و`branch_id` في الـINSERTs و`getDefaultWarehouseId` (بيعتمد على الفرع).

## 2026-10-24 — مزامنة جزئية (7 تعديلات من الأوفلاين)
نُسخت يدويًا: `shared/types.ts` + `mutatingChannels.ts` (backend + frontend)، services (`expenses/employees/restaurant/reports`)، و4 شاشات (`ExpenseLogTab`, `EmployeesTab`, `OrderScreen`, `ReportsPage`)، وأُعيد توليد `handlers.ts` و`webApi.ts`. الجديد: تقريرا `item_sales`/`sales_by_captain`، تعديل/حذف موظف، حذف مصروف بباسورد الأدمن، دمج/نقل لترابيزة مشغولة. اتجرّب على DB مؤقتة (دمج/نقل/موظفين/تقارير) + `npm test`. **لم يُنشر على السيرفر بعد.**

## 2026-10-25 — تقسيم الشيك بالوحدة
نُسخ: `services/restaurant.ts` (`moveOrderItemToGroup`)، `OrderScreen.tsx`، `restaurant.css`، `mutatingChannels.ts` (backend + frontend)، وأُعيد توليد `handlers.ts`. **`webApi.ts` اتعدّل يدويًا (سطر `moveItem` بس) لأن `gen-webapi.cjs` بيمسح `forgotPassword`/`resetPassword` المضافين يدويًا في جلسة 2026-10-24b — لا تشغّله قبل ما تتضاف لـ`prelude.txt`/`web-tail.txt`.** اتجرّب على DB مؤقتة + `npm test` 62/0. **لم يُنشر على السيرفر.**

## 2026-10-30 — تعديلات ويب فقط: شجرة الحسابات المبسّطة + قنوات مطاعم إضافية ممنوعة في retail + استيراد أصناف من غير باركود
- **شجرة الحسابات**: `services/accountsChart.ts` جديد (الحسابات + ربط الأدوار + التحويل للـ7 حسابات) و`services/ledger.ts` بقى بيسجّل القيود بالـ"دور" (`role`) مش بالكود الثابت (الشجرة القديمة سلوكها بالظبط زي ما كان) + migration 071 (`account_roles`) + قنوات `ledger:updateAccount/deleteAccount/listAccountRoles/setAccountRoles` في `handlers.ts` و`webApi.ts` و`mutatingChannels.ts` (**مضافة يدويًا — `port-handlers.cjs` و`gen-webapi.cjs` هيمسحوها**) + `AccountingPage.tsx` (تعديل/مسح/ربط) + endpoint `/internal/chart` و`deploy/simplify-chart.sh` + `scripts/chart-test.ts`. الأوفلاين مفيهوش حاجة من دي.
- **`services/catalogImportExport.ts`**: الباركود بقى اختياري (باركود تلقائي لو فاضي، ومطابقة بالاسم عشان إعادة الاستيراد ما تكرّرش) و`nextAutoBarcode` اتصدّرت من `catalog.ts`. **`port-catalog-import.cjs` هيرجّع شرط "الباركود مطلوب" لو اتشغّل** — لازم تتعدّل قاعدة الأوفلاين نفسها أو يتعاد تطبيق التعديل.
- **`services/edition.ts`**: قنوات `settings:getRestaurant/updateRestaurant/*DeliveryDriver/*Captain` و`print:kitchenTicket/eventBooking` بقت ممنوعة في retail (الفواتير والطباعة بتقراها جوه السيرفر مباشرة). `PosPage` مبقاش بينادي `listDeliveryDrivers` إلا لو التوصيل مسموح.


## 2026-10-30 (ب) — تعديلات ويب فقط على quickcash: دفع مقسّم، تواريخ استحقاق/سداد، خدمات بعمولة، مطلوب شراؤه، مرفقات
الأوفلاين مفيهوش حاجة من دي. migration **072** (`072_services_split_due_dates.ts`): `sales_invoice_payments` + `due_date` على `sales_invoices`/`purchase_invoices` + `products.is_service/commission_*` + `sales_items.service_amount` + `purchase_requests` + `pos_ui_settings.purchase_list_enabled`.
- **الدفع المقسّم**: الفاتورة `payment_method='mixed'` + صفوف في `sales_invoice_payments` (من غير الآجل). الباقي الآجل = الإجمالي − المدفوع ويتسجل على رصيد العميل. `services/salePayments.ts` فيه `SALE_PAY_LINES_SQL` (سطر لكل وسيلة؛ الفاتورة العادية بوسيلتها الواحدة) — اتستخدم في الوردية (`cashSession`)، لوحة التحكم، الخزائن (`treasuries`)، القيود (`ledger`: صفوف الدفع + توزيع المرتجع)، تقرير طرق الدفع، ويومية المبيعات (`accountingReports`). **أي مزامنة من الأوفلاين لازم تحافظ على تعديلات `pos.ts` و`invoices.ts` و`treasuries.ts` و`ledger.ts` و`cashSession.ts` و`dashboard.ts` و`reports.ts` و`accountingReports.ts` و`customers.ts` و`print.ts` (`paymentDetailsHtml`).**
- **تواريخ الاستحقاق/السداد**: `CheckoutInput.dueDate` (الجزء الآجل بس) و`PurchaseInvoiceInput.dueDate` (آجل بس). تقارير جديدة في `services/reportsExtra.ts` (`customer_due_dates`, `vendor_due_dates`, `sales_rep_commission_detail`, `service_sales`) متوصّلة في `reports.ts`.
- **الخدمات**: `products.is_service` (من غير مخزون في البيع/المرتجع/الحذف/الاسترجاع، ومستثناة من تقارير الجرد والحد الأدنى) + عمولة اختيارية (% + حد أدنى) بتتحسب في الـPOS على مبلغ بيتكتب؛ سعر السطر = العمولة و`sales_items.service_amount` = المبلغ.
- **مطلوب شراؤه**: `services/purchaseRequests.ts` + `PurchaseListModal`/`PurchaseInvoicesModal` (شاشة الأصناف). `pos.ts` بيسجّل كل قطعة مباعة (ما عدا الخدمات والمؤقت والمطعم) لو `purchaseListEnabled`.
- **المرفقات**: `services/attachments.ts` (رفع base64 في مجلد `attachments/` جنب القاعدة + قراءة) و`pickAttachment/openAttachment` في `webApi.ts`/`prelude.txt`/`gen-webapi.cjs`.
- **مضافة يدويًا (لازم تتنقل قبل أي توليد)**: قنوات `attachments:*` و`purchaseRequests:*` في `handlers.ts` + `mutatingChannels.ts`؛ وفي `webApi.ts` كتلة `purchaseRequests` (موجودة في `web-tail.txt`) وإضافة `PurchaseRequestFilter/Item` لقايمة الـimports (مش بتتولّد — ضيفها لو اتولّد الملف من جديد).
- الاختبار: `npm run test:features` (84 تأكيد) ضمن `npm test`.
- **توقيع QZ Tray (ويب فقط)**: `services/qzSigning.ts` بيولّد مفتاح + شهادة موقّعة ذاتيًا في `<QCP_DATA_DIR>/qz/` (مرة واحدة) و`/api/qz/certificate` + `/api/qz/sign` في `server.ts` (بعد تسجيل الدخول)، و`qzPrint.ts` بيضبط `qz.security.*`. الهدف: رسالة "Untrusted website" متتكررش مع كل طباعة — المستخدم بيوافق مرة واحدة مع "Remember this decision" على كل جهاز، أو يحط الشهادة كـ`override.crt` في فولدر QZ Tray فمبتظهرش أي رسالة. اتضاف `node-forge` للـbackend.
- **2026-10-30 (ج)** — شاشة البيع: العمولة بتتكتب بإيد الكاشير في نافذة الخدمة (المبلغ اختياري، والنسبة على الصنف بقت "مقترحة" بس) + `CartLine.isCommission`؛ وخانة "المحل المسوّق" اتنقلت من نافذة الدفع للشاشة الرئيسية مع زرار "✚ محل" لإضافة محل جديد في نفس المكان وسطر بعمولة المحل في الإجماليات. تعديلات واجهة فقط (`PosPage.tsx`, `InventoryPage.tsx`, `types.ts`).
- **2026-10-30 (د)** — migration **073** (`073_purchase_mode.ts`): `products.purchase_mode` (`every_sale` | `min_stock` | `none`) + `reorder_qty`. في `pos.ts`: `min_stock` = لما رصيد الصنف (كل مخازن الفرع) بعد البيع يوصل لـ`reorder_point` يتفتح طلب شراء واحد بس (الكمية = `reorder_qty` أو تكملة لضعف الحد الأدنى)؛ `none` مايتسجلش؛ الخدمة دايمًا `none`. الحقول في نموذج الصنف (`InventoryPage.tsx`).

## 2026-10-31 — ويب فقط على quickcash: الأصول الثابتة (4000) مربوطة بحركات النظام
الأوفلاين مفيهوش حاجة من دي. migration **074** (`074_fixed_assets.ts`): `expense_categories.is_fixed_asset` + تصنيف جاهز "شراء أصول ثابتة" + (لو الشجرة مبسّطة وحساب 4000 موجود) ربط `fixed_assets → 4000` في `account_roles` عشان يظهر عليه 🔗.
- **دور جديد `fixed_assets`** في `services/accountsChart.ts` (نوع `asset`، الافتراضي 4000، وفي الشجرة القديمة حساب النظام 1500 — اتضاف لـ`SYSTEM_ACCOUNTS`). ظاهر في "ربط حسابات النظام".
- **شراء أصل**: تصنيف المصروف المتعلّم "أصل ثابت" (من شاشة المصروفات: خانة "أصل ثابت" جنب "تصنيف جديد"، أو سند صرف "أخرى" بنفس التصنيف) بيتخصم من الخزينة زي أي مصروف، لكن قيده في `ledger.ts` مدين `fixed_assets` بدل المصروفات، ومبيدخلش في المصروفات ولا صافي الربح: `notFixedAssetSql()` (في `accountsChart.ts`) اتحطت في `reports.ts` (الأرباح والخسائر، المصروفات الشهرية، الملخص المالي، مقارنة الفترات والفروع) و`accountingReports.ts` (المصروفات حسب التصنيف). الخزينة وإقفال اليوم (`cashSession.ts`, `treasuries.ts`) بيحسبوه عادي لأن الفلوس خرجت. **أي مزامنة لازم تحافظ على ده.**
- **الميزانية العمومية** (`ledger.ts` → `balanceSheetReport`) بقت "الأصول الثابتة" (الحساب المربوط + أي حساب أصل كوده يبدأ بنفس بدايته: 4100، 4200...) و"الأصول المتداولة" (الباقي) بإجمالي لكل قسم — `makeFixedAssetMatcher()`.
- **فخ**: القنوات المعدِّلة بيتضاف لها `actor` كآخر argument تلقائي (`server.ts`) — فـ`expenses:createCategory` بيقارن العلامة بـ`=== true` (لو `!!` كانت اتحسبت أصل ثابت دايمًا لما الاستدعاء من غير العلامة).
- `handlers.ts` (`expenses:createCategory`) و`webApi.ts` (`createCategory(name, isFixedAsset)`) و`types.ts` (`ExpenseCategory.isFixedAsset`, `ExpenseView.isFixedAsset`) اتعدّلوا **يدويًا** — `port-handlers.cjs`/`gen-webapi.cjs` هيمسحوهم. الاختبار: `chart-test.ts` (136 تأكيد).
