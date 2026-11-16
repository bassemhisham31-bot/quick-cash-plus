/**
 * اختبار رسائل واتساب (2026-11-16) بجلسة وهمية على قاعدة مؤقتة من غير سيرفر HTTP ولا إرسال فعلي:
 * مرتجع على فاتورة، مرتجع بدون فاتورة، فاتورة «حفظ بدون ترحيل»، كشف حساب العميل، وتعديل بيانات العميل.
 */
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { getDb, initDatabaseAtPath } from '../src/main/db'
import { createProduct } from '../src/main/services/catalog'
import { createCustomer, updateCustomer, listCustomers } from '../src/main/services/customers'
import { openDay } from '../src/main/services/cashSession'
import { checkout } from '../src/main/services/pos'
import { returnInvoiceLines, getInvoiceView } from '../src/main/services/invoices'
import { getHeldInvoice, holdInvoice } from '../src/main/services/heldInvoices'
import { createDirectReturn } from '../src/main/services/directReturns'
import { getWhatsAppSettings, updateWhatsAppSettings } from '../src/main/services/settings'
import {
  __setFakeSocketForTests,
  notifyDirectReturnByWhatsApp,
  notifySalesReturnByWhatsApp,
  sendCustomerStatementByWhatsApp,
  sendHeldInvoiceByWhatsApp
} from '../src/main/services/whatsapp'
import type { CheckoutInput, ProductInput } from '../src/shared/types'

const DATA_DIR = join(process.cwd(), 'data', 'wa-test')
const DB_PATH = join(DATA_DIR, 'wa-test.sqlite')
process.env.QCP_DATA_DIR = DATA_DIR
process.env.QCP_WA_TEST = '1'

let passed = 0
let failed = 0
function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    console.error(`  ❌ ${msg}`)
  }
}

function productInput(over: Partial<ProductInput>): ProductInput {
  return {
    name: 'صنف', barcode: '', categoryId: null, unitId: null, vendorId: null, costPrice: 0, retailPrice: 0,
    wholesalePrice: 0, wholesale2Price: 0, packPrice: 0, openingQuantity: 0, reorderPoint: 0, warehouseId: 1,
    expiryDate: null, serialNumber: null, showInPos: true, serialTrackingEnabled: false, imageDataUrl: null, ...over
  } as ProductInput
}

async function main(): Promise<void> {
  if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true })
  mkdirSync(DATA_DIR, { recursive: true })
  await initDatabaseAtPath(DB_PATH)

  const sent: { jid: string; text: string }[] = []
  __setFakeSocketForTests({ sendMessage: async (jid, content) => void sent.push({ jid, text: content.text }) })
  const wa = await getWhatsAppSettings()
  await updateWhatsAppSettings({ ...wa, enabled: true, sendOnSale: true })

  await openDay(1, 0)
  const product = await createProduct(productInput({ name: 'زيت عباد 1 لتر', costPrice: 50, retailPrice: 80, openingQuantity: 100 }))
  const customer = await createCustomer({ name: 'محمد التجربة', phone: '01012345678', address: '', notes: '', openingBalance: 200, loyaltyEnabled: true })
  const noPhone = await createCustomer({ name: 'بدون رقم', phone: '', address: '', notes: '', openingBalance: 0, loyaltyEnabled: true })

  const line = { productId: product.id, name: product.name, barcode: product.barcode, qty: 3, unitPrice: 80, discount: 0 }
  const input = {
    customerId: customer.id, warehouseId: 1, lines: [line], discountType: 'value', discountValue: 0,
    paymentMethod: 'credit', paid: 0, redeemPoints: 0
  } as unknown as CheckoutInput

  console.log('1) البيع العادي لسه بيبعت + skipWhatsApp')
  const sale = await checkout(input, 1)
  await new Promise((r) => setTimeout(r, 300))
  assert(sale.ok && sent.length === 1 && sent[0].text.includes('زيت عباد 1 لتر'), 'رسالة البيع اتبعتت بالأصناف')
  assert(sent[0].jid === '201012345678@s.whatsapp.net', 'الرقم اتحوّل لصيغة واتساب')
  console.log(sent[0].text.split('\n').map((l) => '     ' + l).join('\n'))
  assert(
    sent[0].text.includes('وسيلة الدفع: آجل') && sent[0].text.includes('الرصيد السابق: 200.00') && sent[0].text.includes('الرصيد الحالي: 440.00'),
    'فاتورة آجل: فيها وسيلة الدفع والرصيد السابق والحالي'
  )
  const cashSale = await checkout({ ...input, paymentMethod: 'cash', paid: 240 } as any, 1)
  await new Promise((r) => setTimeout(r, 300))
  const cashMsg = sent.pop()!.text
  assert(cashSale.ok && cashMsg.includes('وسيلة الدفع: نقدًا') && !cashMsg.includes('الرصيد السابق'), 'فاتورة نقدي: وسيلة الدفع بس من غير أرصدة')
  const sale2 = await checkout({ ...input, skipWhatsApp: true }, 1)
  await new Promise((r) => setTimeout(r, 300))
  assert(sale2.ok && sent.length === 1, 'skipWhatsApp بيمنع تكرار الرسالة في الحفظ النهائي')

  console.log('2) مرتجع على فاتورة')
  const view = await getInvoiceView(sale.invoiceId!)
  const retLines = [{ salesItemId: (view!.lines[0] as any).salesItemId, qty: 1 }]
  const ret = await returnInvoiceLines(sale.invoiceId!, retLines as any, 1)
  await notifySalesReturnByWhatsApp(sale.invoiceId!, retLines, ret.refundAmount ?? 0)
  const m2 = sent[sent.length - 1]?.text ?? ''
  console.log(m2.split('\n').map((l) => '     ' + l).join('\n'))
  assert(ret.ok && sent.length === 2, 'رسالة المرتجع اتبعتت')
  assert(m2.includes(sale.invoiceNumber!) && m2.includes('زيت عباد 1 لتر × 1') && m2.includes('80.00'), 'فيها رقم الفاتورة والصنف والقيمة')

  console.log('3) مرتجع بدون فاتورة')
  const dr = await createDirectReturn(
    { customerId: customer.id, warehouseId: 1, refundMethod: 'credit', lines: [{ productId: product.id, qty: 2, unitPrice: 80 }] } as any,
    1
  )
  await notifyDirectReturnByWhatsApp(dr.returnId!)
  const m3 = sent[sent.length - 1]?.text ?? ''
  console.log(m3.split('\n').map((l) => '     ' + l).join('\n'))
  assert(dr.ok && sent.length === 3, 'رسالة المرتجع بدون فاتورة اتبعتت')
  assert(m3.includes(dr.number!) && m3.includes('160.00') && m3.includes('خصم من رصيد الحساب'), 'فيها رقم المرتجع والقيمة وطريقة الرد')
  const drWalkIn = await createDirectReturn(
    { customerId: null, warehouseId: 1, refundMethod: 'cash', lines: [{ productId: product.id, qty: 1, unitPrice: 80 }] } as any,
    1
  )
  await notifyDirectReturnByWhatsApp(drWalkIn.returnId!)
  assert(drWalkIn.ok && sent.length === 3, 'مرتجع عميل نقدي (من غير ملف) مابيبعتش حاجة')

  console.log('4) فاتورة حفظ بدون ترحيل')
  const heldId = await holdInvoice(
    {
      payload: {
        lines: [line as any], discountType: 'value', discountValue: 0, customerId: customer.id, customerLabel: '', warehouseId: 1,
        payment: { method: 'cash', received: '300', splitRows: [], dueDate: '' }
      },
      total: 240
    },
    1
  )
  const h = await sendHeldInvoiceByWhatsApp(heldId)
  const m4 = sent[sent.length - 1]?.text ?? ''
  console.log(m4.split('\n').map((l) => '     ' + l).join('\n'))
  assert(h.ok && sent.length === 4 && m4.includes('240.00') && m4.includes('زيت عباد 1 لتر'), 'رسالة الفاتورة غير المرحّلة اتبعتت بالأصناف والإجمالي')
  const heldAfter = await getHeldInvoice(heldId)
  assert(m4.includes('وسيلة الدفع: نقدًا') && !m4.includes('الرصيد السابق'), 'غير مرحّلة نقدي: وسيلة الدفع بس')
  const heldCredit = await holdInvoice(
    {
      payload: {
        lines: [line as any], discountType: 'value', discountValue: 0, customerId: customer.id, customerLabel: '', warehouseId: 1,
        payment: { method: 'credit', received: '', splitRows: [], dueDate: '2026-12-16' }
      },
      total: 240
    },
    1
  )
  await sendHeldInvoiceByWhatsApp(heldCredit)
  const m4b = sent.pop()!.text
  console.log(m4b.split('\n').map((l) => '     ' + l).join('\n'))
  assert(m4b.includes('وسيلة الدفع: آجل') && m4b.includes('الرصيد السابق: 440.00') && m4b.includes('الرصيد الحالي: 680.00'), 'غير مرحّلة آجل: الرصيد السابق والحالي المتوقع')
  assert(heldAfter?.payload.whatsappSent === true && heldAfter.payload.payment?.method === 'cash', 'اتعلّمت إنها اتبعتت واختيارات الدفع محفوظة')

  console.log('5) كشف الحساب')
  const st = await sendCustomerStatementByWhatsApp(customer.id, {})
  const m5 = sent[sent.length - 1]?.text ?? ''
  console.log(m5.split('\n').map((l) => '     ' + l).join('\n'))
  const balance = (await listCustomers('محمد')).find((c) => c.id === customer.id)!.balance
  assert(st.ok && sent.length === 5, 'كشف الحساب اتبعت')
  assert(m5.includes('رصيد سابق: 200.00') && m5.includes(`الرصيد الحالي المستحق: ${balance.toFixed(2)}`), 'فيه الرصيد السابق والرصيد الحالي الصحيح')
  assert(m5.includes(sale.invoiceNumber!) && m5.includes(dr.number!), 'فيه الفواتير والمرتجعات')
  const st2 = await sendCustomerStatementByWhatsApp(noPhone.id, {})
  assert(!st2.ok && !!st2.error && sent.length === 5, 'عميل من غير رقم → رسالة خطأ واضحة')

  console.log('6) تعديل بيانات العميل')
  const edited = await updateCustomer(customer.id, { name: 'محمد بعد التعديل', phone: '01198765432', address: 'القاهرة', notes: '' })
  assert(edited.name === 'محمد بعد التعديل' && edited.phone === '01198765432' && edited.address === 'القاهرة', 'الاسم والموبايل والعنوان اتعدّلوا')
  assert(edited.balance === balance, 'الرصيد ما اتغيرش بالتعديل')
  let threw = false
  await updateCustomer(customer.id, { name: '  ', phone: '' }).catch(() => (threw = true))
  assert(threw, 'اسم فاضي مرفوض')
  const walkIn = (await getDb().execute('SELECT id FROM customers WHERE is_walk_in = 1')).rows[0] as any
  threw = false
  await updateCustomer(Number(walkIn.id), { name: 'x', phone: '' }).catch(() => (threw = true))
  assert(threw, 'العميل النقدي الافتراضي مايتعدّلش')

  console.log(`\nالنتيجة: ${passed} نجح / ${failed} فشل`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
