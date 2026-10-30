import { formatCurrency as currency } from '../lib/currency'
import type { InvoiceView } from '../../../shared/types'

const METHOD_LABELS: Record<string, string> = {
  cash: 'نقدًا',
  credit: 'آجل',
  card: 'بنكي',
  wallet: 'محفظة',
  mixed: 'مختلط',
  vodafone_cash: 'فودافون كاش',
  instapay: 'InstaPay'
}

/**
 * ملخص الدفع على الفاتورة: وسائل الدفع المقسّمة (لو فيه)، الباقي الآجل وتاريخ استحقاقه، والمحل/المندوب المسوّق وعمولته.
 * بيرجّع null لو مفيش حاجة تتعرض (فاتورة عادية بوسيلة واحدة).
 */
export function InvoicePaymentSummary({ invoice }: { invoice: InvoiceView }): JSX.Element | null {
  const outstanding = invoice.paymentMethod === 'credit' || invoice.paymentMethod === 'mixed' ? Math.max(0, invoice.total - invoice.paid) : 0
  const hasSplit = invoice.payments.length > 0
  if (!hasSplit && outstanding < 0.005 && !invoice.dueDate && !invoice.salesRepName) return null

  const row = (label: string, value: string, bold = false): JSX.Element => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 800 : 400 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )

  return (
    <div className="qcp-card" style={{ marginBottom: 14, fontSize: 13 }}>
      {hasSplit && (
        <>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>تفاصيل الدفع</div>
          {invoice.payments.map((p, i) => row(METHOD_LABELS[p.method] ?? p.method, currency(p.amount)))}
        </>
      )}
      {outstanding >= 0.005 && row('المتبقي آجل على العميل', currency(outstanding), true)}
      {invoice.dueDate && outstanding >= 0.005 && row('📅 تاريخ الاستحقاق', invoice.dueDate, true)}
      {invoice.salesRepName && row('🏪 المحل / المندوب المسوّق', `${invoice.salesRepName}${invoice.commissionAmount > 0 ? ` — عمولة ${currency(invoice.commissionAmount)}` : ''}`)}
    </div>
  )
}
