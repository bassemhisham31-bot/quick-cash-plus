// المرحلة 072 (ويب فقط) — دفع مقسّم على الفاتورة، تواريخ استحقاق/سداد، أصناف خدمات بعمولة، وقائمة "مطلوب شراؤه".
// كلها إضافات (أعمدة/جداول جديدة) فمفيش تأثير على البيانات القديمة: الفواتير القديمة مالهاش صفوف في sales_invoice_payments
// فبتتعامل بوسيلة دفعها الواحدة زي ما كانت بالظبط.

export const migration072ServicesSplitDueDates = `
-- أصناف الخدمات (تركيب، كشف أعطال، سحب فودافون كاش...): من غير مخزون، وممكن يكون ليها عمولة على مبلغ بيتكتب وقت البيع
ALTER TABLE products ADD COLUMN is_service INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN commission_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN commission_percent REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN commission_min REAL NOT NULL DEFAULT 0;

-- المبلغ الأساسي للعملية (مثلًا مبلغ السحب) لما يكون سطر الفاتورة هو عمولتها
ALTER TABLE sales_items ADD COLUMN service_amount REAL;

-- خيار في إعدادات البيع: تسجيل كل قطعة مباعة تلقائيًا في قائمة "مطلوب شراؤه"
ALTER TABLE pos_ui_settings ADD COLUMN purchase_list_enabled INTEGER NOT NULL DEFAULT 1;

-- تواريخ الاستحقاق (بيع آجل) والسداد المتوقع (شراء آجل)
ALTER TABLE sales_invoices ADD COLUMN due_date TEXT;
ALTER TABLE purchase_invoices ADD COLUMN due_date TEXT;
CREATE INDEX IF NOT EXISTS idx_sales_invoices_due_date ON sales_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_due_date ON purchase_invoices(due_date);

-- تقسيم دفع الفاتورة على أكتر من وسيلة (كاش + فودافون كاش + ...). الباقي الآجل مش بيتخزّن هنا، بيتحسب (الإجمالي - المدفوع)
CREATE TABLE IF NOT EXISTS sales_invoice_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id),
  method TEXT NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_payments_invoice ON sales_invoice_payments(invoice_id);

-- قائمة مطلوب شراؤه: كل قطعة اتباعت بتتسجل هنا عشان تتشترى من المورد
CREATE TABLE IF NOT EXISTS purchase_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  barcode TEXT,
  qty REAL NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0,
  vendor_id INTEGER REFERENCES vendors(id),
  sales_invoice_id INTEGER REFERENCES sales_invoices(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'purchased', 'cancelled')),
  purchase_invoice_id INTEGER REFERENCES purchase_invoices(id),
  note TEXT,
  branch_id INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  purchased_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_invoice ON purchase_requests(sales_invoice_id);
`
