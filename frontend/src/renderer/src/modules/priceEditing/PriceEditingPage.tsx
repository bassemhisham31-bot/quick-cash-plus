import { ChangeEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  BulkPriceUpdateItem,
  Category,
  Product,
  ProductImportResult,
  ProductInput,
  Unit,
  VendorView,
  Warehouse
} from '../../../../shared/types'
import { playSound } from '../../lib/sounds'

type PriceEditingTab = 'editPrices' | 'bulkAdd' | 'categories'

export function PriceEditingPage(): JSX.Element {
  const { t } = useTranslation()
  const [tab, setTab] = useState<PriceEditingTab>('editPrices')
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [vendors, setVendors] = useState<VendorView[]>([])

  async function refreshCategories(): Promise<void> {
    setCategories(await window.api.catalog.listCategories())
  }

  useEffect(() => {
    Promise.all([
      window.api.catalog.listWarehouses(),
      window.api.catalog.listCategories(),
      window.api.catalog.listUnits(),
      window.api.vendors.list('')
    ]).then(([w, c, u, v]) => {
      setWarehouses(w)
      setCategories(c)
      setUnits(u)
      setVendors(v)
      setWarehouseId((prev) => prev ?? w.find((x) => x.isDefault)?.id ?? w[0]?.id ?? null)
    })
  }, [])

  return (
    <div>
      <div className="qcp-page-header">
        <h1>{t('priceEditing.title')}</h1>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          className={`qcp-btn ${tab === 'editPrices' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          onClick={() => setTab('editPrices')}
        >
          💰 {t('priceEditing.tabEditPrices')}
        </button>
        <button
          className={`qcp-btn ${tab === 'bulkAdd' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          onClick={() => setTab('bulkAdd')}
        >
          ➕ {t('priceEditing.tabBulkAdd')}
        </button>
        <button
          className={`qcp-btn ${tab === 'categories' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          onClick={() => setTab('categories')}
        >
          🏷️ {t('priceEditing.tabCategories')}
        </button>
        {warehouses.length > 1 && (
          <select
            className="qcp-select"
            value={warehouseId ?? ''}
            onChange={(e) => setWarehouseId(Number(e.target.value))}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {tab === 'editPrices' && warehouseId && <EditPricesTab warehouseId={warehouseId} />}
      {tab === 'bulkAdd' && warehouseId && (
        <BulkAddTab warehouseId={warehouseId} categories={categories} units={units} vendors={vendors} />
      )}
      {tab === 'categories' && <CategoriesTab categories={categories} onChanged={refreshCategories} />}
    </div>
  )
}

interface DirtyRow {
  costPrice: string
  retailPrice: string
  imageDataUrl: string | null
}

function EditPricesTab({ warehouseId }: { warehouseId: number }): JSX.Element {
  const { t } = useTranslation()
  const [products, setProducts] = useState<Product[]>([])
  const [dirty, setDirty] = useState<Record<number, DirtyRow>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  async function refresh(): Promise<void> {
    setProducts(await window.api.catalog.listProducts('', warehouseId))
    setDirty({})
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId])

  function rowValue(p: Product): DirtyRow {
    return (
      dirty[p.id] ?? {
        costPrice: String(p.costPrice),
        retailPrice: String(p.retailPrice),
        imageDataUrl: p.imageDataUrl
      }
    )
  }

  function setRow(id: number, patch: Partial<DirtyRow>): void {
    setDirty((prev) => {
      const base = prev[id] ?? rowValue(products.find((p) => p.id === id)!)
      return { ...prev, [id]: { ...base, ...patch } }
    })
  }

  function handleImageChange(id: number, e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setRow(id, { imageDataUrl: String(reader.result) })
    reader.readAsDataURL(file)
  }

  async function handleSaveAll(): Promise<void> {
    const items: BulkPriceUpdateItem[] = Object.entries(dirty).map(([id, row]) => ({
      id: Number(id),
      costPrice: Number(row.costPrice) || 0,
      retailPrice: Number(row.retailPrice) || 0,
      imageDataUrl: row.imageDataUrl
    }))
    if (items.length === 0) return
    setSaving(true)
    setMessage(null)
    try {
      await window.api.catalog.bulkUpdatePricesAndImages(items)
      playSound('save')
      setMessage(t('priceEditing.savedCount', { count: items.length }) ?? null)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const dirtyCount = Object.keys(dirty).length
  const term = search.trim().toLowerCase()
  const filteredProducts = term
    ? products.filter((p) => p.name.toLowerCase().includes(term) || p.barcode.toLowerCase().includes(term))
    : products

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <input
          className="qcp-input"
          style={{ width: 280 }}
          placeholder={t('common.search') ?? ''}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="qcp-btn qcp-btn-primary" disabled={dirtyCount === 0 || saving} onClick={handleSaveAll}>
          💾 {t('priceEditing.saveAll')} {dirtyCount > 0 && `(${dirtyCount})`}
        </button>
      </div>

      <div style={{ fontSize: 13, color: 'var(--qcp-ink-faint)', marginBottom: 12 }}>{t('priceEditing.editPricesHint')}</div>

      {message && (
        <div className="qcp-pill success" style={{ marginBottom: 12, width: 'fit-content' }}>
          {message}
        </div>
      )}

      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>{t('inventory.image')}</th>
              <th>{t('inventory.name')}</th>
              <th>{t('inventory.costPrice')}</th>
              <th>{t('inventory.retailPrice')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => {
              const row = rowValue(p)
              const isDirty = p.id in dirty
              return (
                <tr key={p.id} style={isDirty ? { background: 'var(--qcp-bg-sunken)' } : undefined}>
                  <td>
                    <label style={{ cursor: 'pointer', display: 'block', width: 34, height: 34 }}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 6,
                          overflow: 'hidden',
                          background: 'var(--qcp-bg-sunken)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {row.imageDataUrl ? (
                          <img src={row.imageDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: 15 }}>📦</span>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => handleImageChange(p.id, e)}
                      />
                    </label>
                  </td>
                  <td>{p.name}</td>
                  <td>
                    <input
                      className="qcp-input"
                      type="number"
                      step="0.01"
                      style={{ width: 110 }}
                      value={row.costPrice}
                      onChange={(e) => setRow(p.id, { costPrice: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="qcp-input"
                      type="number"
                      step="0.01"
                      style={{ width: 110 }}
                      value={row.retailPrice}
                      onChange={(e) => setRow(p.id, { retailPrice: e.target.value })}
                    />
                  </td>
                </tr>
              )
            })}
            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface BulkAddRow {
  key: number
  name: string
  barcode: string
  categoryId: number | ''
  unitId: number | ''
  vendorId: number | ''
  costPrice: string
  retailPrice: string
  openingQuantity: string
  serialNumber: string
  showInPos: boolean
}

let bulkAddRowKey = 0
function emptyBulkAddRow(): BulkAddRow {
  bulkAddRowKey += 1
  return {
    key: bulkAddRowKey,
    name: '',
    barcode: '',
    categoryId: '',
    unitId: '',
    vendorId: '',
    costPrice: '0',
    retailPrice: '0',
    openingQuantity: '0',
    serialNumber: '',
    showInPos: true
  }
}

function BulkAddTab({
  warehouseId,
  categories,
  units,
  vendors
}: {
  warehouseId: number
  categories: Category[]
  units: Unit[]
  vendors: VendorView[]
}): JSX.Element {
  const { t } = useTranslation()
  const [rows, setRows] = useState<BulkAddRow[]>(() => [emptyBulkAddRow(), emptyBulkAddRow(), emptyBulkAddRow()])
  const [saving, setSaving] = useState(false)
  const [importResult, setImportResult] = useState<ProductImportResult | null>(null)

  function patchRow(key: number, patch: Partial<BulkAddRow>): void {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function addRow(): void {
    setRows((prev) => [...prev, emptyBulkAddRow()])
  }

  function removeRow(key: number): void {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  async function handleSaveAll(): Promise<void> {
    const inputs: ProductInput[] = rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        barcode: r.barcode.trim(),
        categoryId: r.categoryId === '' ? null : Number(r.categoryId),
        unitId: r.unitId === '' ? null : Number(r.unitId),
        vendorId: r.vendorId === '' ? null : Number(r.vendorId),
        costPrice: Number(r.costPrice) || 0,
        retailPrice: Number(r.retailPrice) || 0,
        wholesalePrice: 0,
        wholesale2Price: 0,
        packPrice: 0,
        openingQuantity: Number(r.openingQuantity) || 0,
        reorderPoint: 5,
        warehouseId,
        expiryDate: null,
        serialNumber: r.serialNumber.trim() || null,
        showInPos: r.showInPos,
        serialTrackingEnabled: false,
        imageDataUrl: null
      }))
    if (inputs.length === 0) return
    setSaving(true)
    try {
      const result = await window.api.catalog.bulkCreateProducts(inputs)
      setImportResult(result)
      if (result.ok && result.rowErrors.length === 0) {
        playSound('save')
        setRows([emptyBulkAddRow(), emptyBulkAddRow(), emptyBulkAddRow()])
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--qcp-ink-faint)' }}>{t('priceEditing.bulkAddHint')}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="qcp-btn qcp-btn-secondary" onClick={addRow}>
            ➕ {t('priceEditing.addRow')}
          </button>
          <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleSaveAll}>
            💾 {t('priceEditing.saveAll')}
          </button>
        </div>
      </div>

      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>{t('inventory.name')}</th>
              <th>{t('inventory.barcodeColumn')}</th>
              <th>{t('inventory.category')}</th>
              <th>{t('inventory.unit')}</th>
              <th>{t('inventory.vendor')}</th>
              <th>{t('inventory.costPrice')}</th>
              <th>{t('inventory.retailPrice')}</th>
              <th>{t('inventory.openingQuantity')}</th>
              <th>{t('inventory.serialNumber')}</th>
              <th>{t('inventory.showInPos')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <input
                    className="qcp-input"
                    style={{ minWidth: 140 }}
                    value={r.name}
                    onChange={(e) => patchRow(r.key, { name: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="qcp-input"
                    style={{ width: 120 }}
                    value={r.barcode}
                    onChange={(e) => patchRow(r.key, { barcode: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    className="qcp-select"
                    value={r.categoryId}
                    onChange={(e) => patchRow(r.key, { categoryId: e.target.value ? Number(e.target.value) : '' })}
                  >
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="qcp-select"
                    value={r.unitId}
                    onChange={(e) => patchRow(r.key, { unitId: e.target.value ? Number(e.target.value) : '' })}
                  >
                    <option value="">—</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="qcp-select"
                    value={r.vendorId}
                    onChange={(e) => patchRow(r.key, { vendorId: e.target.value ? Number(e.target.value) : '' })}
                  >
                    <option value="">—</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="qcp-input"
                    type="number"
                    step="0.01"
                    style={{ width: 100 }}
                    value={r.costPrice}
                    onChange={(e) => patchRow(r.key, { costPrice: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="qcp-input"
                    type="number"
                    step="0.01"
                    style={{ width: 100 }}
                    value={r.retailPrice}
                    onChange={(e) => patchRow(r.key, { retailPrice: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="qcp-input"
                    type="number"
                    style={{ width: 90 }}
                    value={r.openingQuantity}
                    onChange={(e) => patchRow(r.key, { openingQuantity: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="qcp-input"
                    style={{ width: 120 }}
                    placeholder="SN-2026-001"
                    value={r.serialNumber}
                    onChange={(e) => patchRow(r.key, { serialNumber: e.target.value })}
                  />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={r.showInPos}
                    onChange={(e) => patchRow(r.key, { showInPos: e.target.checked })}
                  />
                </td>
                <td>
                  <button
                    className="qcp-btn qcp-btn-secondary"
                    style={{ padding: '4px 10px', color: 'var(--qcp-critical)' }}
                    onClick={() => removeRow(r.key)}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {importResult && (
        <div className="qcp-modal-backdrop" onClick={() => setImportResult(null)}>
          <div className="qcp-modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{t('inventory.importSummaryTitle')}</h2>
            {!importResult.ok && (
              <div className="qcp-pill critical" style={{ marginBottom: 12 }}>
                {importResult.error}
              </div>
            )}
            {importResult.ok && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <span className="qcp-pill success">
                  {t('inventory.importCreatedCount')}: {importResult.created}
                </span>
                <span className={`qcp-pill ${importResult.rowErrors.length ? 'critical' : ''}`}>
                  {t('inventory.importErrorsCount')}: {importResult.rowErrors.length}
                </span>
              </div>
            )}
            {importResult.rowErrors.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: 'auto', fontSize: 12.5 }}>
                {importResult.rowErrors.map((e, idx) => (
                  <div key={idx} style={{ padding: '4px 0', borderBottom: '1px solid var(--qcp-border)' }}>
                    {t('inventory.importRowError')} {e.row}: {e.message}
                  </div>
                ))}
              </div>
            )}
            <button
              className="qcp-btn qcp-btn-secondary"
              style={{ marginTop: 14, width: '100%' }}
              onClick={() => setImportResult(null)}
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CategoriesTab({ categories, onChanged }: { categories: Category[]; onChanged: () => void }): JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)

  async function handleAdd(): Promise<void> {
    if (!name.trim()) return
    setSaving(true)
    try {
      await window.api.catalog.createCategory(name.trim(), parentId === '' ? null : Number(parentId))
      playSound('save')
      setName('')
      setParentId('')
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  function categoryName(id: number | null): string {
    if (id === null) return '—'
    return categories.find((c) => c.id === id)?.name ?? '—'
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--qcp-ink-faint)', marginBottom: 12 }}>{t('priceEditing.categoriesHint')}</div>

      <div className="qcp-card" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="qcp-field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
          <label>{t('priceEditing.newCategoryName')}</label>
          <input
            className="qcp-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
            }}
          />
        </div>
        <div className="qcp-field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
          <label>{t('priceEditing.parentCategory')}</label>
          <select
            className="qcp-select"
            value={parentId}
            onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button className="qcp-btn qcp-btn-primary" disabled={!name.trim() || saving} onClick={handleAdd}>
          + {t('priceEditing.addCategory')}
        </button>
      </div>

      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>{t('priceEditing.categoryName')}</th>
              <th>{t('priceEditing.parentCategory')}</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{categoryName(c.parentId)}</td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={2} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
