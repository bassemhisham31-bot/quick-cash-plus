// المرحلة 46 — خيار إرسال الفاتورة كملف PDF مرفق مع رسالة واتساب التلقائية
export const migration046WhatsAppInvoicePdf = `
ALTER TABLE whatsapp_settings ADD COLUMN send_invoice_pdf INTEGER NOT NULL DEFAULT 1;
`
