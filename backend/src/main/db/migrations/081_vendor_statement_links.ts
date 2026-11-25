// المرحلة 081 (ويب فقط) — رابط كشف حساب المورد (بيتبعت للمورد على واتساب ويتفتح من غير تسجيل دخول) — نفس فكرة 079 للعملاء:
//   vendor_statement_links: صف واحد لكل مورد فعّل الرابط. token = سر عشوائي طويل (192 بت)، والإلغاء = حذف الصف، والتجديد = token جديد.
// مفيش تغيير في أي جدول أو بيانات موجودة.

export const migration081VendorStatementLinks = `
CREATE TABLE IF NOT EXISTS vendor_statement_links (
  vendor_id INTEGER PRIMARY KEY REFERENCES vendors(id),
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_viewed_at TEXT,
  views INTEGER NOT NULL DEFAULT 0
);
`
