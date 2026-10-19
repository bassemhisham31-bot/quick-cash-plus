import { useEffect, useState } from 'react'
import type { Product, RecipeItemView, Unit } from '../../../../shared/types'
import { alertDialog } from '../../components/ConfirmDialogHost'
import { formatCurrency as currency } from '../../lib/currency'

/** بيقبل أرقام عشرية (جرامات مثلاً 12.5 أو 0.150 كيلو) — بيرجع null لو القيمة مش رقم موجب */
function parseQty(value: string): number | null {
  const n = Number(value.replace(',', '.').replace('٫', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function RecipeEditorModal({ product, onClose }: { product: Product; onClose: () => void }): JSX.Element {
  const [recipe, setRecipe] = useState<RecipeItemView[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rawMaterialId, setRawMaterialId] = useState('')
  const [qtyPerUnit, setQtyPerUnit] = useState('1')
  const [saving, setSaving] = useState(false)
  const [units, setUnits] = useState<Unit[]>([])
  // النص اللي بيتكتب في كل خانة كمية — منفصل عن الرقم عشان الكتابة العشرية (زي "0." أو "12.") متتمسحش أثناء الكتابة
  const [qtyText, setQtyText] = useState<Record<number, string>>({})

  useEffect(() => {
    window.api.recipes.get(product.id).then((rows) => {
      setRecipe(rows)
      setQtyText(Object.fromEntries(rows.map((r) => [r.rawMaterialProductId, String(r.qtyPerUnit)])))
    })
    window.api.catalog.listUnits().then(setUnits)
    window.api.catalog.listProducts('').then((list) => setProducts(list.filter((p) => p.id !== product.id)))
  }, [product.id])

  function addRow(): void {
    if (!rawMaterialId) return
    const raw = products.find((p) => p.id === Number(rawMaterialId))
    if (!raw) return
    if (recipe.some((r) => r.rawMaterialProductId === raw.id)) return
    const qty = parseQty(qtyPerUnit)
    if (qty == null) {
      void alertDialog('اكتب كمية صحيحة أكبر من صفر (مسموح بالكسور زي 0.150 أو 12.5)')
      return
    }
    setRecipe((prev) => [...prev, { rawMaterialProductId: raw.id, rawMaterialName: raw.name, qtyPerUnit: qty }])
    setQtyText((prev) => ({ ...prev, [raw.id]: qtyPerUnit }))
    setRawMaterialId('')
    setQtyPerUnit('1')
  }

  function removeRow(rawMaterialProductId: number): void {
    setRecipe((prev) => prev.filter((r) => r.rawMaterialProductId !== rawMaterialProductId))
  }

  function updateQty(rawMaterialProductId: number, value: string): void {
    setQtyText((prev) => ({ ...prev, [rawMaterialProductId]: value }))
    const qty = parseQty(value)
    setRecipe((prev) =>
      prev.map((r) => (r.rawMaterialProductId === rawMaterialProductId ? { ...r, qtyPerUnit: qty ?? 0 } : r))
    )
  }

  function unitName(productId: number): string {
    const p = products.find((x) => x.id === productId)
    return units.find((u) => u.id === p?.unitId)?.name ?? ''
  }

  /** تكلفة الخامة في الوصفة = سعر شراء الخامة (لوحدتها) × الكمية المستخدمة */
  function rowCost(r: RecipeItemView): number {
    const costPrice = products.find((x) => x.id === r.rawMaterialProductId)?.costPrice ?? 0
    return costPrice * (r.qtyPerUnit || 0)
  }

  const totalCost = recipe.reduce((sum, r) => sum + rowCost(r), 0)
  const profit = product.retailPrice - totalCost
  const profitPercent = product.retailPrice > 0 ? (profit / product.retailPrice) * 100 : 0

  async function save(): Promise<void> {
    const bad = recipe.find((r) => !(r.qtyPerUnit > 0))
    if (bad) {
      void alertDialog('كمية الخامة "' + bad.rawMaterialName + '" مش صحيحة')
      return
    }
    setSaving(true)
    try {
      await window.api.recipes.set(
        product.id,
        recipe.map((r) => ({ rawMaterialProductId: r.rawMaterialProductId, qtyPerUnit: r.qtyPerUnit }))
      )
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" onClick={(e) => e.stopPropagation()}>
        <h3>وصفة الصنف: {product.name}</h3>
        <p style={{ fontSize: 12, color: 'var(--qcp-ink-faint)' }}>
          لو حددت خامات، هيتخصم من مخزون الخامات دي تلقائيًا مع كل عملية بيع بدل ما يتخصم مخزون الصنف نفسه. الكمية بوحدة الخامة نفسها ومسموح بالكسور — لو الخامة متسجلة بالكيلو و الوصفة 150 جرام اكتب 0.150، ولو متسجلة بالجرام اكتب 150.
        </p>

        <div style={{ marginBottom: 12 }}>
          {recipe.map((r) => (
            <div key={r.rawMaterialProductId} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ flex: 1 }}>{r.rawMaterialName}</span>
              <input
                className="qcp-input"
                type="text"
                inputMode="decimal"
                style={{ width: 100 }}
                value={qtyText[r.rawMaterialProductId] ?? String(r.qtyPerUnit)}
                onChange={(e) => updateQty(r.rawMaterialProductId, e.target.value)}
              />
              <span style={{ fontSize: 12, color: 'var(--qcp-ink-faint)', minWidth: 40 }}>{unitName(r.rawMaterialProductId)}</span>
              <span style={{ fontSize: 12.5, minWidth: 80, textAlign: 'end' }} title="تكلفة الخامة">
                {currency(rowCost(r))}
              </span>
              <button type="button" className="qcp-btn qcp-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => removeRow(r.rawMaterialProductId)}>
                ×
              </button>
            </div>
          ))}
          {!recipe.length && <p style={{ color: 'var(--qcp-ink-faint)', fontSize: 13 }}>مفيش خامات مضافة</p>}
        </div>

        {recipe.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <span className="qcp-pill accent">تكلفة الوصفة: {currency(totalCost)}</span>
            <span className="qcp-pill">سعر البيع: {currency(product.retailPrice)}</span>
            <span className={`qcp-pill ${profit < 0 ? 'critical' : 'success'}`}>
              الربح: {currency(profit)} ({Math.round(profitPercent)}%)
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', borderTop: '1px dashed var(--qcp-border)', paddingTop: 10 }}>
          <div className="qcp-field" style={{ flex: 1, marginBottom: 0 }}>
            <label>الخامة</label>
            <select className="qcp-select" value={rawMaterialId} onChange={(e) => setRawMaterialId(e.target.value)}>
              <option value="">اختار خامة</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="qcp-field" style={{ width: 110, marginBottom: 0 }}>
            <label>الكمية {rawMaterialId ? unitName(Number(rawMaterialId)) : ''}</label>
            <input className="qcp-input" type="text" inputMode="decimal" placeholder="مثال 0.150" value={qtyPerUnit} onChange={(e) => setQtyPerUnit(e.target.value)} />
          </div>
          <button type="button" className="qcp-btn qcp-btn-secondary" onClick={addRow}>
            + إضافة
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
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
