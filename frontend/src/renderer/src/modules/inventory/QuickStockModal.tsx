import { useState } from 'react'
import type { Product } from '../../../../shared/types'
import { useAppStore } from '../../store/appStore'
import { alertDialog } from '../../components/ConfirmDialogHost'
import { playSound } from '../../lib/sounds'

/** بيقبل أرقام عشرية وسالبة (للإضافة: -2 يعني نقص 2) — بيرجع null لو مش رقم */
function parseQty(value: string): number | null {
  const trimmed = value.trim().replace(',', '.').replace('٫', '.')
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/** إدخال سريع لكمية الصنف من جدول الأصناف — إضافة على الرصيد أو ضبط الرصيد مباشرة (جرد) */
export function QuickStockModal({
  product,
  warehouseId,
  onClose,
  onSaved
}: {
  product: Product
  warehouseId: number
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const user = useAppStore((s) => s.user)
  const [mode, setMode] = useState<'add' | 'set'>('add')
  const [qtyText, setQtyText] = useState('')
  const [saving, setSaving] = useState(false)

  const qty = parseQty(qtyText)
  const resulting = qty == null ? null : mode === 'add' ? product.quantity + qty : qty

  async function save(): Promise<void> {
    if (qty == null || (mode === 'add' && qty === 0)) {
      void alertDialog('اكتب كمية صحيحة (مسموح بالكسور زي 2.5)')
      return
    }
    if (!user) return
    setSaving(true)
    try {
      await window.api.catalog.adjustStock(product.id, warehouseId, mode, qty, user.id)
      playSound('save')
      onSaved()
      onClose()
    } catch (err: any) {
      void alertDialog(err?.message ?? 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>كمية الصنف: {product.name}</h3>
        <p style={{ margin: '0 0 12px' }}>
          الرصيد الحالي: <span className="qcp-pill accent">{product.quantity}</span>
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className={`qcp-btn ${mode === 'add' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
            style={{ flex: 1 }}
            onClick={() => setMode('add')}
          >
            ➕ إضافة على الرصيد
          </button>
          <button
            type="button"
            className={`qcp-btn ${mode === 'set' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
            style={{ flex: 1 }}
            onClick={() => setMode('set')}
          >
            📝 ضبط الرصيد (جرد)
          </button>
        </div>

        <div className="qcp-field">
          <label>{mode === 'add' ? 'الكمية المضافة (اكتب بالسالب للخصم، مثال -2)' : 'الرصيد الفعلي الجديد'}</label>
          <input
            className="qcp-input"
            type="text"
            inputMode="decimal"
            autoFocus
            value={qtyText}
            onChange={(e) => setQtyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
              if (e.key === 'Escape') onClose()
            }}
          />
        </div>

        {resulting != null && (
          <p style={{ fontSize: 13, color: 'var(--qcp-ink-faint)', margin: '0 0 12px' }}>
            الرصيد بعد الحفظ: <strong>{Math.round(resulting * 1000) / 1000}</strong>
          </p>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="qcp-btn qcp-btn-primary" style={{ flex: 1 }} disabled={saving} onClick={save}>
            حفظ
          </button>
          <button type="button" className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}
