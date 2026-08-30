import { useEffect, useState } from 'react'
import type { Product, RecipeItemView } from '../../../../shared/types'

export function RecipeEditorModal({ product, onClose }: { product: Product; onClose: () => void }): JSX.Element {
  const [recipe, setRecipe] = useState<RecipeItemView[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rawMaterialId, setRawMaterialId] = useState('')
  const [qtyPerUnit, setQtyPerUnit] = useState('1')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.recipes.get(product.id).then(setRecipe)
    window.api.catalog.listProducts('').then((list) => setProducts(list.filter((p) => p.id !== product.id)))
  }, [product.id])

  function addRow(): void {
    if (!rawMaterialId) return
    const raw = products.find((p) => p.id === Number(rawMaterialId))
    if (!raw) return
    if (recipe.some((r) => r.rawMaterialProductId === raw.id)) return
    setRecipe((prev) => [...prev, { rawMaterialProductId: raw.id, rawMaterialName: raw.name, qtyPerUnit: Number(qtyPerUnit) || 1 }])
    setRawMaterialId('')
    setQtyPerUnit('1')
  }

  function removeRow(rawMaterialProductId: number): void {
    setRecipe((prev) => prev.filter((r) => r.rawMaterialProductId !== rawMaterialProductId))
  }

  function updateQty(rawMaterialProductId: number, value: string): void {
    setRecipe((prev) =>
      prev.map((r) => (r.rawMaterialProductId === rawMaterialProductId ? { ...r, qtyPerUnit: Number(value) || 0 } : r))
    )
  }

  async function save(): Promise<void> {
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
          لو حددت خامات، هيتخصم من مخزون الخامات دي تلقائيًا مع كل عملية بيع بدل ما يتخصم مخزون الصنف نفسه.
        </p>

        <div style={{ marginBottom: 12 }}>
          {recipe.map((r) => (
            <div key={r.rawMaterialProductId} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ flex: 1 }}>{r.rawMaterialName}</span>
              <input
                className="qcp-input"
                type="number"
                step="0.01"
                style={{ width: 90 }}
                value={r.qtyPerUnit}
                onChange={(e) => updateQty(r.rawMaterialProductId, e.target.value)}
              />
              <button type="button" className="qcp-btn qcp-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => removeRow(r.rawMaterialProductId)}>
                ×
              </button>
            </div>
          ))}
          {!recipe.length && <p style={{ color: 'var(--qcp-ink-faint)', fontSize: 13 }}>مفيش خامات مضافة</p>}
        </div>

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
          <div className="qcp-field" style={{ width: 90, marginBottom: 0 }}>
            <label>الكمية</label>
            <input className="qcp-input" type="number" step="0.01" value={qtyPerUnit} onChange={(e) => setQtyPerUnit(e.target.value)} />
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
