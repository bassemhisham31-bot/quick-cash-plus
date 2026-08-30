import { useEffect, useState } from 'react'
import { formatCurrency as currency } from '../../lib/currency'
import { InvoiceDetailModal } from '../invoices/InvoiceDetailModal'
import { PurchaseReturnModal } from './PurchaseReturnModal'
import type {
  InvoiceListItem,
  InvoiceView,
  PurchaseInvoiceListItem,
  PurchaseInvoiceView,
  PurchaseReturnListRow,
  SalesReturnListRow
} from '../../../../shared/types'

type Tab = 'sales' | 'purchases'

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ReturnsPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('sales')
  const [salesReturns, setSalesReturns] = useState<SalesReturnListRow[]>([])
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturnListRow[]>([])
  const [from, setFrom] = useState(daysAgoIso(30))
  const [to, setTo] = useState(todayIso())

  const [pickingInvoice, setPickingInvoice] = useState(false)
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [invoiceMatches, setInvoiceMatches] = useState<InvoiceListItem[]>([])
  const [openInvoice, setOpenInvoice] = useState<InvoiceView | null>(null)

  const [pickingPurchase, setPickingPurchase] = useState(false)
  const [purchaseSearch, setPurchaseSearch] = useState('')
  const [allPurchases, setAllPurchases] = useState<PurchaseInvoiceListItem[]>([])
  const [openPurchase, setOpenPurchase] = useState<PurchaseInvoiceView | null>(null)

  function refresh(): void {
    const range = { from: from ? `${from} 00:00:00` : undefined, to: to ? `${to} 23:59:59` : undefined }
    window.api.invoices.listReturns(range).then(setSalesReturns)
    window.api.purchases.listReturns(range).then(setPurchaseReturns)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  useEffect(() => {
    if (!pickingInvoice || invoiceSearch.trim().length < 2) {
      setInvoiceMatches([])
      return
    }
    const id = setTimeout(() => {
      window.api.invoices
        .list({ search: invoiceSearch, dateFrom: '', dateTo: '', paymentMethod: 'all', includeDeleted: false })
        .then(setInvoiceMatches)
    }, 250)
    return () => clearTimeout(id)
  }, [invoiceSearch, pickingInvoice])

  useEffect(() => {
    if (pickingPurchase && !allPurchases.length) window.api.purchases.list().then(setAllPurchases)
  }, [pickingPurchase, allPurchases.length])

  async function openSalesInvoice(id: number): Promise<void> {
    const view = await window.api.invoices.getView(id)
    setOpenInvoice(view)
    setPickingInvoice(false)
    setInvoiceSearch('')
  }

  async function openPurchaseInvoice(id: number): Promise<void> {
    const view = await window.api.purchases.getView(id)
    setOpenPurchase(view)
    setPickingPurchase(false)
    setPurchaseSearch('')
  }

  const purchaseMatches = purchaseSearch.trim()
    ? allPurchases.filter(
        (p) =>
          p.number.toLowerCase().includes(purchaseSearch.trim().toLowerCase()) ||
          p.vendorName.toLowerCase().includes(purchaseSearch.trim().toLowerCase())
      )
    : allPurchases.slice(0, 20)

  return (
    <div>
      <div className="qcp-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>إدارة المرتجعات</h1>
        {tab === 'sales' ? (
          <button type="button" className="qcp-btn qcp-btn-primary" onClick={() => setPickingInvoice(true)}>
            + تسجيل مرتجع مبيعات جديد
          </button>
        ) : (
          <button type="button" className="qcp-btn qcp-btn-primary" onClick={() => setPickingPurchase(true)}>
            + تسجيل مرتجع مشتريات جديد
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className={`qcp-btn ${tab === 'sales' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          onClick={() => setTab('sales')}
        >
          🛒 مرتجعات المبيعات (العملاء)
        </button>
        <button
          type="button"
          className={`qcp-btn ${tab === 'purchases' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          onClick={() => setTab('purchases')}
        >
          🔁 مرتجعات المشتريات (الموردين)
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          من
          <input className="qcp-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          إلى
          <input className="qcp-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {tab === 'sales' ? (
        <div className="qcp-table-wrap">
          <table className="qcp-table">
            <thead>
              <tr>
                <th>الرقم المرجعي</th>
                <th>العميل</th>
                <th>التاريخ والوقت</th>
                <th>السبب</th>
                <th>إجمالي المرتجع</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {salesReturns.map((r) => (
                <tr key={r.id}>
                  <td>{r.invoiceNumber}</td>
                  <td>{r.customerName}</td>
                  <td>{r.createdAt}</td>
                  <td>{r.reasonNote ?? '—'}</td>
                  <td style={{ color: 'var(--qcp-critical)' }}>{currency(r.amount)}</td>
                  <td>
                    <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => openSalesInvoice(r.invoiceId)}>
                      تفاصيل
                    </button>
                  </td>
                </tr>
              ))}
              {!salesReturns.length && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                    مفيش مرتجعات مبيعات في المدى المحدد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="qcp-table-wrap">
          <table className="qcp-table">
            <thead>
              <tr>
                <th>الرقم المرجعي</th>
                <th>المورد</th>
                <th>التاريخ والوقت</th>
                <th>السبب</th>
                <th>إجمالي المرتجع</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {purchaseReturns.map((r) => (
                <tr key={r.id}>
                  <td>{r.invoiceNumber}</td>
                  <td>{r.vendorName}</td>
                  <td>{r.createdAt}</td>
                  <td>{r.reasonNote ?? '—'}</td>
                  <td style={{ color: 'var(--qcp-critical)' }}>{currency(r.amount)}</td>
                  <td>
                    <button
                      type="button"
                      className="qcp-btn qcp-btn-secondary"
                      onClick={() => openPurchaseInvoice(r.purchaseInvoiceId)}
                    >
                      تفاصيل
                    </button>
                  </td>
                </tr>
              ))}
              {!purchaseReturns.length && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                    مفيش مرتجعات مشتريات في المدى المحدد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {pickingInvoice && (
        <div className="qcp-modal-backdrop" onClick={() => setPickingInvoice(false)}>
          <div className="qcp-modal" style={{ width: 'min(520px, 96vw)' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>ابحث عن فاتورة بيع</h2>
            <input
              className="qcp-input"
              style={{ width: '100%', marginBottom: 12 }}
              autoFocus
              placeholder="رقم الفاتورة أو اسم العميل..."
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
            />
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {invoiceMatches.map((inv) => (
                <button
                  key={inv.id}
                  type="button"
                  className="qcp-btn qcp-btn-secondary"
                  style={{ width: '100%', marginBottom: 6, textAlign: 'start' }}
                  onClick={() => openSalesInvoice(inv.id)}
                >
                  <strong>{inv.number}</strong> — {inv.customerName} — {currency(inv.total)}
                </button>
              ))}
              {invoiceSearch.trim().length >= 2 && !invoiceMatches.length && (
                <p style={{ color: 'var(--qcp-ink-faint)' }}>مفيش نتائج</p>
              )}
            </div>
            <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => setPickingInvoice(false)}>
              إغلاق
            </button>
          </div>
        </div>
      )}

      {pickingPurchase && (
        <div className="qcp-modal-backdrop" onClick={() => setPickingPurchase(false)}>
          <div className="qcp-modal" style={{ width: 'min(520px, 96vw)' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>ابحث عن فاتورة مشتريات</h2>
            <input
              className="qcp-input"
              style={{ width: '100%', marginBottom: 12 }}
              autoFocus
              placeholder="رقم الفاتورة أو اسم المورد..."
              value={purchaseSearch}
              onChange={(e) => setPurchaseSearch(e.target.value)}
            />
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {purchaseMatches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="qcp-btn qcp-btn-secondary"
                  style={{ width: '100%', marginBottom: 6, textAlign: 'start' }}
                  onClick={() => openPurchaseInvoice(p.id)}
                >
                  <strong>{p.number}</strong> — {p.vendorName} — {currency(p.total)}
                </button>
              ))}
              {!purchaseMatches.length && <p style={{ color: 'var(--qcp-ink-faint)' }}>مفيش نتائج</p>}
            </div>
            <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => setPickingPurchase(false)}>
              إغلاق
            </button>
          </div>
        </div>
      )}

      {openInvoice && (
        <InvoiceDetailModal
          invoice={openInvoice}
          onClose={() => setOpenInvoice(null)}
          onChanged={() => {
            openSalesInvoice(openInvoice.id)
            refresh()
          }}
        />
      )}

      {openPurchase && (
        <PurchaseReturnModal
          invoice={openPurchase}
          onClose={() => setOpenPurchase(null)}
          onChanged={() => {
            openPurchaseInvoice(openPurchase.id)
            refresh()
          }}
        />
      )}
    </div>
  )
}
