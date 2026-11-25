// المرحلة 079 (ويب فقط) — رابط كشف الحساب للعميل (بيتبعت على واتساب ويتفتح من غير تسجيل دخول):
//   - customer_statement_links: صف واحد لكل عميل فعّل الرابط. token = سر عشوائي طويل (192 بت) هو اللي بيفتح الكشف —
//     مفيش رقم عميل ظاهر في الرابط. إلغاء الرابط = حذف الصف، وإعادة التوليد = token جديد (القديم بيبطل فورًا).
//   - views / last_viewed_at: عشان صاحب المحل يعرف إن العميل فتح الرابط.
// مفيش تغيير في أي جدول أو بيانات موجودة.

export const migration079CustomerStatementLinks = `
CREATE TABLE IF NOT EXISTS customer_statement_links (
  customer_id INTEGER PRIMARY KEY REFERENCES customers(id),
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_viewed_at TEXT,
  views INTEGER NOT NULL DEFAULT 0
);
`
