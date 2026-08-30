import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  Category,
  PosUiSettings,
  Product,
  ProductImportResult,
  Unit,
  VendorView,
  Warehouse
} from '../../../../shared/types'
import { PurchaseInvoiceModal } from './PurchaseInvoiceModal'
import { TransferModal } from './TransferModal'
import { RecipeEditorModal } from '../restaurant/RecipeEditorModal'
import { formatCurrency as currency } from '../../lib/currency'
import { playSound } from '../../lib/sounds'

const emptyForm = {
  id: null as number | null,
  name: '',
  barcode: '',
  categoryId: '' as number | '',
  unitId: '' as number | '',
  vendorId: '' as number | '',
  costPrice: '0',
  retailPrice: '0',
  wholesalePrice: '',
  wholesale2Price: '',
  packPrice: '',
  openingQuantity: '0',
  reorderPoint: '5',
  expiryDate: '',
  serialNumber: '',
  showInPos: true,
  serialTrackingEnabled: false,
  imageDataUrl: null as string | null
}

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0)
  return Math.ceil(ms / 86400000)
}

export function InventoryPage(): JSX.Element {
  const { t } = useTranslation()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [vendors, setVendors] = useState<VendorView[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newWarehouseName, setNewWarehouseName] = useState('')
  const [showPurchase, setShowPurchase] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showWarehouses, setShowWarehouses] = useState(false)
  const [importResult, setImportResult] = useState<ProductImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [posUiSettings, setPosUiSettings] = useState<PosUiSettings | null>(null)
  const [recipeProduct, setRecipeProduct] = useState<Product | null>(null)

  useEffect(() => {
    window.api.settings.getPosUi().then(setPosUiSettings)
    window.api.vendors.list('').then(setVendors)
  }, [])

  async function refreshProducts(wId: number): Promise<void> {
    setProducts(await window.api.catalog.listProducts(search, wId))
  }

  async function refreshAll(): Promise<void> {
    const [c, u, w] = await Promise.all([
      window.api.catalog.listCategories(),
      window.api.catalog.listUnits(),
      window.api.catalog.listWarehouses()
    ])
    setCategories(c)
    setUnits(u)
    setWarehouses(w)
    const activeWarehouseId = warehouseId ?? w.find((x) => x.isDefault)?.id ?? w[0]?.id
    if (activeWarehouseId) {
      setWarehouseId(activeWarehouseId)
      await refreshProducts(activeWarehouseId)
    }
  }

  useEffect(() => {
    refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!warehouseId) return
    const id = setTimeout(() => refreshProducts(warehouseId), 250)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, warehouseId])

  function handleImageChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setForm((f) => ({ ...f, imageDataUrl: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  async function handleAddCategory(): Promise<void> {
    if (!newCategoryName.trim()) return
    const cat = await window.api.catalog.createCategory(newCategoryName.trim(), null)
    setCategories((prev) => [...prev, cat])
    setForm((f) => ({ ...f, categoryId: cat.id }))
    setNewCategoryName('')
  }

  async function handleAddWarehouse(): Promise<void> {
    if (!newWarehouseName.trim()) return
    const wh = await window.api.catalog.createWarehouse(newWarehouseName.trim())
    setWarehouses((prev) => [...prev, wh])
    setNewWarehouseName('')
  }

  async function handleExportProducts(): Promise<void> {
    await window.api.catalog.exportProducts()
  }

  async function handleDownloadTemplate(): Promise<void> {
    await window.api.catalog.exportProductsTemplate()
  }

  async function handleImportProducts(): Promise<void> {
    setImporting(true)
    try {
      const result = await window.api.catalog.importProducts()
      if (result.canceled) return
      setImportResult(result)
      if (warehouseId) await refreshProducts(warehouseId)
    } finally {
      setImporting(false)
    }
  }

  function startEdit(p: Product): void {
    setForm({
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      categoryId: p.categoryId ?? '',
      unitId: p.unitId ?? '',
      vendorId: p.vendorId ?? '',
      costPrice: String(p.costPrice),
      retailPrice: String(p.retailPrice),
      wholesalePrice: p.prices.wholesale != null ? String(p.prices.wholesale) : '',
      wholesale2Price: p.prices.wholesale2 != null ? String(p.prices.wholesale2) : '',
      packPrice: p.prices.pack != null ? String(p.prices.pack) : '',
      openingQuantity: '0',
      reorderPoint: String(p.reorderPoint),
      expiryDate: p.expiryDate ?? '',
      serialNumber: p.serialNumber ?? '',
      showInPos: p.showInPos,
      serialTrackingEnabled: p.serialTrackingEnabled,
      imageDataUrl: p.imageDataUrl
    })
    setShowForm(true)
  }

  async function handleDeleteProduct(p: Product): Promise<void> {
    if (!warehouseId) return
    if (!window.confirm(t('inventory.confirmDeleteProduct', { name: p.name }) ?? '')) return
    await window.api.catalog.deleteProduct(p.id)
    playSound('delete')
    await refreshProducts(warehouseId)
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!warehouseId) return

    if (form.id === null) {
      await window.api.catalog.createProduct({
        name: form.name.trim(),
        barcode: form.barcode.trim(),
        categoryId: form.categoryId === '' ? null : Number(form.categoryId),
        unitId: form.unitId === '' ? null : Number(form.unitId),
        vendorId: form.vendorId === '' ? null : Number(form.vendorId),
        costPrice: Number(form.costPrice) || 0,
        retailPrice: Number(form.retailPrice) || 0,
        wholesalePrice: Number(form.wholesalePrice) || 0,
        wholesale2Price: Number(form.wholesale2Price) || 0,
        packPrice: Number(form.packPrice) || 0,
        openingQuantity: Number(form.openingQuantity) || 0,
        reorderPoint: Number(form.reorderPoint) || 0,
        warehouseId,
        expiryDate: form.expiryDate || null,
        serialNumber: form.serialNumber.trim() || null,
        showInPos: form.showInPos,
        serialTrackingEnabled: form.serialTrackingEnabled,
        imageDataUrl: form.imageDataUrl
      })
    } else {
      await window.api.catalog.updateProduct(form.id, {
        name: form.name.trim(),
        barcode: form.barcode.trim(),
        categoryId: form.categoryId === '' ? null : Number(form.categoryId),
        unitId: form.unitId === '' ? null : Number(form.unitId),
        vendorId: form.vendorId === '' ? null : Number(form.vendorId),
        costPrice: Number(form.costPrice) || 0,
        retailPrice: Number(form.retailPrice) || 0,
        wholesalePrice: Number(form.wholesalePrice) || 0,
        wholesale2Price: Number(form.wholesale2Price) || 0,
        packPrice: Number(form.packPrice) || 0,
        reorderPoint: Number(form.reorderPoint) || 0,
        expiryDate: form.expiryDate || null,
        serialNumber: form.serialNumber.trim() || null,
        showInPos: form.showInPos,
        serialTrackingEnabled: form.serialTrackingEnabled,
        imageDataUrl: form.imageDataUrl
      })
    }
    playSound('save')
    setForm(emptyForm)
    setShowForm(false)
    refreshProducts(warehouseId)
  }

  return (
    <div>
      <div className="qcp-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1>{t('inventory.title')}</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="qcp-btn qcp-btn-secondary" onClick={() => setShowWarehouses(true)}>
            🏬 {t('inventory.warehouse')}
          </button>
          {posUiSettings?.multiWarehouseEnabled !== false && (
            <button className="qcp-btn qcp-btn-secondary" onClick={() => setShowTransfer(true)}>
              🔁 {t('inventory.transferStock')}
            </button>
          )}
          <button className="qcp-btn qcp-btn-secondary" onClick={() => setShowPurchase(true)}>
            📥 {t('inventory.purchaseInvoice')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={handleDownloadTemplate}>
            📋 {t('inventory.downloadImportTemplate')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" onClick={handleExportProducts}>
            ⬇️ {t('inventory.exportProducts')}
          </button>
          <button className="qcp-btn qcp-btn-secondary" disabled={importing} onClick={handleImportProducts}>
            ⬆️ {t('inventory.importProducts')}
          </button>
          <button
            className="qcp-btn qcp-btn-primary"
            onClick={() => {
              setForm(emptyForm)
              setShowForm(true)
            }}
          >
            + {t('inventory.addProduct')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {posUiSettings?.multiWarehouseEnabled !== false && (
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
        <input
          className="qcp-input"
          style={{ width: 320 }}
          placeholder={t('common.search') ?? ''}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>{t('inventory.name')}</th>
              <th>{t('inventory.barcodeColumn')}</th>
              <th>{t('inventory.costPrice')}</th>
              <th>{t('inventory.retailPrice')}</th>
              <th>{t('inventory.wholesalePrice')}</th>
              <th>{t('inventory.quantity')}</th>
              <th>{t('inventory.expiryDate')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        overflow: 'hidden',
                        flexShrink: 0,
                        background: 'var(--qcp-bg-sunken)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {p.imageDataUrl ? (
                        <img src={p.imageDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: 13 }}>📦</span>
                      )}
                    </div>
                    <span>
                      {p.name}
                      {!p.showInPos && (
                        <span className="qcp-pill" style={{ marginInlineStart: 6, fontSize: 10 }}>
                          {t('inventory.hiddenFromPos')}
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--qcp-mono)' }}>{p.barcode}</td>
                <td>{currency(p.costPrice)}</td>
                <td>{currency(p.retailPrice)}</td>
                <td>{p.prices.wholesale != null ? currency(p.prices.wholesale) : '—'}</td>
                <td>
                  <span className={`qcp-pill ${p.quantity <= p.reorderPoint ? 'critical' : 'accent'}`}>
                    {p.quantity}
                  </span>
                </td>
                <td>
                  {p.expiryDate ? (
                    <span className={`qcp-pill ${daysUntil(p.expiryDate) <= 30 ? 'critical' : ''}`}>
                      {p.expiryDate}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="qcp-btn qcp-btn-secondary" style={{ padding: '4px 10px' }} onClick={() => startEdit(p)}>
                    ✏️ {t('inventory.editProduct')}
                  </button>
                  <button
                    className="qcp-btn qcp-btn-secondary"
                    style={{ padding: '4px 10px' }}
                    onClick={() => window.api.print.labels([{ barcode: p.barcode, name: p.name, price: p.retailPrice }])}
                  >
                    🏷️ {t('inventory.printBarcode')}
                  </button>
                  <button className="qcp-btn qcp-btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setRecipeProduct(p)}>
                    🧾 الوصفة
                  </button>
                  <button
                    className="qcp-btn qcp-btn-secondary"
                    style={{ padding: '4px 10px', color: 'var(--qcp-critical)' }}
                    onClick={() => handleDeleteProduct(p)}
                  >
                    🗑️ {t('inventory.deleteProduct')}
                  </button>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="qcp-modal-backdrop">
          <form
            className="qcp-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault()
            }}
          >
            <h2 style={{ marginTop: 0 }}>{form.id === null ? t('inventory.addProduct') : t('inventory.editProduct')}</h2>

            <div className="qcp-field">
              <label>{t('inventory.image')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 10,
                    border: '1px dashed var(--qcp-border-strong)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    background: 'var(--qcp-bg-sunken)',
                    flexShrink: 0
                  }}
                >
                  {form.imageDataUrl ? (
                    <img src={form.imageDataUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                  ) : (
                    <span style={{ fontSize: 22 }}>📦</span>
                  )}
                </div>
                <label className="qcp-btn qcp-btn-secondary" style={{ cursor: 'pointer' }}>
                  {t('inventory.uploadImage')}
                  <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                </label>
                {form.imageDataUrl && (
                  <button
                    type="button"
                    className="qcp-btn qcp-btn-secondary"
                    onClick={() => setForm((f) => ({ ...f, imageDataUrl: null }))}
                  >
                    {t('inventory.removeImage')}
                  </button>
                )}
              </div>
            </div>

            <div className="qcp-field">
              <label>{t('inventory.name')}</label>
              <input
                className="qcp-input"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="qcp-field">
              <label>{t('inventory.barcode')}</label>
              <input
                className="qcp-input"
                value={form.barcode}
                onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div className="qcp-field" style={{ flex: 1 }}>
                <label>{t('inventory.category')}</label>
                <select
                  className="qcp-select"
                  value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value ? Number(e.target.value) : '' }))}
                >
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="qcp-field" style={{ flex: 1 }}>
                <label>{t('inventory.unit')}</label>
                <select
                  className="qcp-select"
                  value={form.unitId}
                  onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value ? Number(e.target.value) : '' }))}
                >
                  <option value="">—</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="qcp-field">
              <label>{t('inventory.vendor')}</label>
              <select
                className="qcp-select"
                value={form.vendorId}
                onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value ? Number(e.target.value) : '' }))}
              >
                <option value="">—</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                className="qcp-input"
                style={{ flex: 1 }}
                placeholder={t('inventory.newCategory') ?? ''}
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <button type="button" className="qcp-btn qcp-btn-secondary" onClick={handleAddCategory}>
                +
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div className="qcp-field" style={{ flex: 1 }}>
                <label>{t('inventory.costPrice')}</label>
                <input
                  className="qcp-input"
                  type="number"
                  step="0.01"
                  value={form.costPrice}
                  onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                />
              </div>
              <div className="qcp-field" style={{ flex: 1 }}>
                <label>{t('inventory.retailPrice')}</label>
                <input
                  className="qcp-input"
                  type="number"
                  step="0.01"
                  value={form.retailPrice}
                  onChange={(e) => setForm((f) => ({ ...f, retailPrice: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div className="qcp-field" style={{ flex: 1 }}>
                <label>{t('inventory.wholesalePrice')}</label>
                <input
                  className="qcp-input"
                  type="number"
                  step="0.01"
                  value={form.wholesalePrice}
                  onChange={(e) => setForm((f) => ({ ...f, wholesalePrice: e.target.value }))}
                />
              </div>
              <div className="qcp-field" style={{ flex: 1 }}>
                <label>{t('inventory.wholesale2Price')}</label>
                <input
                  className="qcp-input"
                  type="number"
                  step="0.01"
                  value={form.wholesale2Price}
                  onChange={(e) => setForm((f) => ({ ...f, wholesale2Price: e.target.value }))}
                />
              </div>
              <div className="qcp-field" style={{ flex: 1 }}>
                <label>{t('inventory.packPrice')}</label>
                <input
                  className="qcp-input"
                  type="number"
                  step="0.01"
                  value={form.packPrice}
                  onChange={(e) => setForm((f) => ({ ...f, packPrice: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {form.id === null && (
                <div className="qcp-field" style={{ flex: 1 }}>
                  <label>{t('inventory.openingQuantity')}</label>
                  <input
                    className="qcp-input"
                    type="number"
                    value={form.openingQuantity}
                    onChange={(e) => setForm((f) => ({ ...f, openingQuantity: e.target.value }))}
                  />
                </div>
              )}
              <div className="qcp-field" style={{ flex: 1 }}>
                <label>{t('inventory.reorderPoint')}</label>
                <input
                  className="qcp-input"
                  type="number"
                  value={form.reorderPoint}
                  onChange={(e) => setForm((f) => ({ ...f, reorderPoint: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div className="qcp-field" style={{ flex: 1 }}>
                <label>{t('inventory.expiryDate')}</label>
                <input
                  className="qcp-input"
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                />
              </div>
              <div className="qcp-field" style={{ flex: 1 }}>
                <label>{t('inventory.serialNumber')}</label>
                <input
                  className="qcp-input"
                  placeholder="SN-2026-001"
                  value={form.serialNumber}
                  onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
                />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.showInPos}
                onChange={(e) => setForm((f) => ({ ...f, showInPos: e.target.checked }))}
              />
              {t('inventory.showInPos')}
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.serialTrackingEnabled}
                onChange={(e) => setForm((f) => ({ ...f, serialTrackingEnabled: e.target.checked }))}
              />
              {t('inventory.serialTrackingEnabled')}
            </label>
            <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)', marginTop: 2 }}>
              {t('inventory.serialTrackingEnabledHint')}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button className="qcp-btn qcp-btn-primary" type="submit">
                {t('inventory.save')}
              </button>
              <button
                className="qcp-btn qcp-btn-secondary"
                type="button"
                onClick={() => {
                  setForm(emptyForm)
                  setShowForm(false)
                }}
              >
                {t('inventory.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {showWarehouses && (
        <div className="qcp-modal-backdrop" onClick={() => setShowWarehouses(false)}>
          <div className="qcp-modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{t('inventory.warehouse')}</h2>
            <div className="qcp-table-wrap" style={{ marginBottom: 14 }}>
              <table className="qcp-table">
                <tbody>
                  {warehouses.map((w) => (
                    <tr key={w.id}>
                      <td>{w.name}</td>
                      <td>{w.isDefault && <span className="qcp-pill accent">افتراضي</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="qcp-input"
                style={{ flex: 1 }}
                placeholder={t('inventory.newWarehouse') ?? ''}
                value={newWarehouseName}
                onChange={(e) => setNewWarehouseName(e.target.value)}
              />
              <button className="qcp-btn qcp-btn-primary" onClick={handleAddWarehouse}>
                + {t('inventory.newWarehouse')}
              </button>
            </div>
            <button className="qcp-btn qcp-btn-secondary" style={{ marginTop: 14 }} onClick={() => setShowWarehouses(false)}>
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      {showTransfer && warehouseId && (
        <TransferModal
          warehouses={warehouses}
          defaultWarehouseId={warehouseId}
          onClose={() => setShowTransfer(false)}
          onSaved={() => refreshProducts(warehouseId)}
        />
      )}

      {recipeProduct && <RecipeEditorModal product={recipeProduct} onClose={() => setRecipeProduct(null)} />}

      {showPurchase && warehouseId && (
        <PurchaseInvoiceModal
          warehouses={warehouses}
          defaultWarehouseId={warehouseId}
          onClose={() => setShowPurchase(false)}
          onSaved={() => refreshProducts(warehouseId)}
        />
      )}

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
                <span className="qcp-pill accent">
                  {t('inventory.importUpdatedCount')}: {importResult.updated}
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
