import nodemailer from 'nodemailer'

/**
 * إرسال الإيميلات (استعادة كلمة المرور) عبر SMTP — أي مزوّد (Gmail/Brevo/Resend/...) بنفس الإعدادات من .env:
 * QCP_SMTP_HOST, QCP_SMTP_PORT (465 = SSL مباشر، غيره STARTTLS), QCP_SMTP_USER, QCP_SMTP_PASS, QCP_SMTP_FROM
 * لو الإعدادات ناقصة isMailConfigured() بترجع false والاستعادة بالإيميل مش بتشتغل (بدون ما تنهار).
 */

export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
}

export type MailSender = (message: MailMessage) => Promise<void>

let testSender: MailSender | null = null

/** للاختبارات فقط: بدل SMTP حقيقي بنلتقط الرسائل. */
export function setMailSenderForTests(sender: MailSender | null): void {
  testSender = sender
}

export function isMailConfigured(): boolean {
  if (testSender) return true
  return !!(process.env.QCP_SMTP_HOST && process.env.QCP_SMTP_USER && process.env.QCP_SMTP_PASS)
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (testSender) return testSender(message)

  const host = process.env.QCP_SMTP_HOST
  const user = process.env.QCP_SMTP_USER
  const pass = process.env.QCP_SMTP_PASS
  if (!host || !user || !pass) throw new Error('إعدادات الإيميل (SMTP) غير مضبوطة على السيرفر')

  const port = Number(process.env.QCP_SMTP_PORT ?? 587)
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  })
  await transport.sendMail({
    from: process.env.QCP_SMTP_FROM || user,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html
  })
}
