// المرحلة 080 (ويب فقط) — حركات حساب المورد التاريخية (أرقام فقط) لنقل كشوف الحسابات القديمة:
//   - vendor_account_entries: صف لكل حركة في كشف حساب المورد (رصيد أول المدة / مشتريات / مرتجع / سداد) بتاريخها ومبلغها وبيانها.
//   - debit = بيزوّد اللي علينا للمورد، credit = بيقلّله (نفس اتجاه كشف الحساب الحالي: السداد دائن).
//   - الحركات دي سجل أرقام بس: مفيش مخزون ولا خزنة ولا قيود يومية. رصيد المورد نفسه (vendors.balance) هو اللي بيدخل المحاسبة كرصيد أول المدة.
// مفيش تغيير في أي جدول أو بيانات موجودة.

export const migration080VendorAccountEntries = `
CREATE TABLE IF NOT EXISTS vendor_account_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  entry_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('opening', 'purchase', 'return', 'payment')),
  description TEXT NOT NULL DEFAULT '',
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vendor_account_entries_vendor ON vendor_account_entries(vendor_id, entry_date);
`
