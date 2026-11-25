import { FormEvent, useState } from 'react'
import { alertDialog } from './ConfirmDialogHost'

type Kind = 'purchase' | 'payment' | 'return'

interface Props {
  vendorName: string
  onClose: () => void
  /** بيتنفّذ بعد ما الحركة تتسجّل بنجاح (عشان الكشف يتحدّث) */
  onSaved: () => void | Promise<void>
  onSubmit: (input: { date: string; kind: Kind; amount: number; description: string }) => Promise<void>
}

const KINDS: Array<{ value: Kind; label: string; hint: string }> = [
  { value: 'purchase', label: 'مشتريات / بضاعة مستحقة', hint: 'بتزوّد اللي علينا للمورد' },
  { value: 'payment', label: 'سداد', hint: 'بينقّص اللي علينا للمورد' },
  { value: 'return', label: 'مرتجع / خصم', hint: 'بينقّص اللي علينا للمورد' }
]

const todayLocal = (): string => {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * حركة يدوية على حساب المورد: مبلغ وتاريخ وبيان بس. مش بتعمل فاتورة ولا بتأثر على المخزون أو الخزنة —
 * لو بتدفع فلوس فعلًا من الخزنة استخدم «تسجيل سداد» في كشف الحساب.
 */
export function VendorEntryModal({ vendorName, onClose, onSaved, onSubmit }: Props): JSX.Element {
  const [kind, setKind] = useState<Kind>('purchase')
  const [date, setDate] = useState(todayLocal())
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    const value = Number(amount)
    if (!(value > 0)) {
      await alertDialog('اكتب مبلغ صحيح أكبر من صفر')
      return
    }
    setSaving(true)
    try {
      await onSubmit({ date, kind, amount: value, description: description.trim() })
      await onSaved()
      onClose()
    } catch (err: any) {
      await alertDialog(err?.message ?? 'تعذر تسجيل الحركة')
    } finally {
      setSaving(false)
    }
  }

  const hint = KINDS.find((k) => k.value === kind)?.hint ?? ''

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <form
        className="qcp-modal"
        style={{ width: 'min(480px, 94vw)' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault()
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>➕ حركة على حساب المورد</h2>
          <span style={{ fontWeight: 700 }}>{vendorName}</span>
        </div>
        <p style={{ margin: '4px 0 12px', fontSize: 13, color: 'var(--qcp-text-muted)' }}>
          بتتسجّل في كشف الحساب وفي رابط المورد وبتتحسب على رصيده — <b>من غير فاتورة ولا أثر على المخزون أو الخزنة</b>. لو بتدفع فلوس من الخزنة استخدم «تسجيل سداد» في كشف الحساب.
        </p>

        <div className="qcp-field">
          <label>نوع الحركة</label>
          <select className="qcp-input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 12.5, color: 'var(--qcp-ink-faint)', marginTop: 4 }}>{hint}</div>
        </div>
        <div className="qcp-field">
          <label>التاريخ</label>
          <input className="qcp-input" type="date" required max={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="qcp-field">
          <label>المبلغ</label>
          <input className="qcp-input" type="number" min="0" step="any" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="qcp-field">
          <label>البيان (اختياري)</label>
          <input
            className="qcp-input"
            maxLength={300}
            placeholder="مثلًا: بنك مصر / فرق سعر / حاجة أمانة"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="qcp-btn qcp-btn-primary" type="submit" disabled={saving}>
            {saving ? '...جاري الحفظ' : 'حفظ الحركة'}
          </button>
          <button className="qcp-btn qcp-btn-secondary" type="button" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </form>
    </div>
  )
}
