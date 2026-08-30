// المرحلة 33 — إعدادات واتساب (إرسال رسالة تفاصيل الفاتورة تلقائيًا بعد البيع)
export const migration033WhatsAppSettings = `
CREATE TABLE IF NOT EXISTS whatsapp_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  send_on_sale INTEGER NOT NULL DEFAULT 1,
  message_template TEXT NOT NULL DEFAULT 'مرحبًا {customerName} 🌟
شكرًا لتعاملك مع {storeName}
رقم الفاتورة: {invoiceNumber}
الإجمالي: {total}
نتشرف بخدمتك دائمًا 🙏'
);
INSERT OR IGNORE INTO whatsapp_settings (id) VALUES (1);
`
