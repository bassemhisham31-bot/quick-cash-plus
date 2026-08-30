import { useEffect, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/appStore'
import { hasPermission } from '../../lib/permissions'
import { playSound } from '../../lib/sounds'
import type {
  AssistantProvider,
  AssistantSettings,
  BackupFileInfo,
  BackupSettings,
  BarcodeLabelSettings,
  Category,
  CategoryPrinter,
  DeviceRole,
  DeviceSettings,
  KeyboardShortcut,
  LicenseStatus,
  LoyaltySettings,
  NetworkConfig,
  NetworkStatus,
  PaperSize,
  PosUiSettings,
  PriceCheckerSyncSettings,
  PrinterInfo,
  PrintSettings,
  RestaurantSettings,
  StoreSettings,
  TaxSettings,
  UserActivityEntry,
  UserListItem,
  UserUpdateInput,
  WhatsAppSettings,
  WhatsAppStatus
} from '../../../../shared/types'
import { PERMISSIONS } from '../../../../shared/types'

type Section =
  | 'store'
  | 'license'
  | 'tax'
  | 'print'
  | 'barcode'
  | 'device'
  | 'backup'
  | 'priceCheckerSync'
  | 'network'
  | 'users'
  | 'loyalty'
  | 'shortcuts'
  | 'assistant'
  | 'whatsapp'
  | 'posUi'
  | 'restaurant'
  | 'dataReset'
  | 'about'

export function SettingsPage(): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)
  const [section, setSection] = useState<Section>('store')

  const sections: { key: Section; icon: string; label: string }[] = [
    { key: 'store', icon: '🏬', label: t('settings.storeSection') },
    { key: 'license', icon: '🔑', label: t('settings.licenseSection') },
    { key: 'tax', icon: '%', label: t('settings.taxSection') },
    { key: 'loyalty', icon: '⭐', label: t('settings.loyaltySection') },
    { key: 'print', icon: '🖨️', label: t('settings.printSection') },
    { key: 'barcode', icon: '🏷️', label: t('settings.barcodeSection') },
    { key: 'device', icon: '🔌', label: t('settings.deviceSection') },
    { key: 'shortcuts', icon: '⌨️', label: t('settings.shortcutsSection') },
    { key: 'backup', icon: '💾', label: t('settings.backupSection') },
    { key: 'priceCheckerSync', icon: '🏷️', label: t('settings.priceCheckerSyncSection') },
    { key: 'network', icon: '🖧', label: t('settings.networkSection') },
    ...(hasPermission(user, 'users.manage')
      ? [{ key: 'users' as Section, icon: '👥', label: t('settings.usersSection') }]
      : []),
    { key: 'assistant', icon: '🤖', label: t('settings.assistantSection') },
    { key: 'whatsapp', icon: '💬', label: t('settings.whatsappSection') },
    { key: 'posUi', icon: '🎛️', label: t('settings.posUiSection') },
    { key: 'restaurant', icon: '🍽️', label: t('settings.restaurantSection') },
    ...(user?.role === 'admin'
      ? [{ key: 'dataReset' as Section, icon: '⚠️', label: t('settings.dataResetSection') }]
      : [])
  ]

  return (
    <div>
      <div className="qcp-page-header">
        <h1>{t('settings.title')}</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 18 }}>
        <div className="qcp-card" style={{ height: 'fit-content' }}>
          {sections.map((s) => (
            <button
              key={s.key}
              className="qcp-nav-item"
              style={{
                background: section === s.key ? 'var(--qcp-gradient)' : 'transparent',
                color: section === s.key ? 'white' : 'var(--qcp-ink)'
              }}
              onClick={() => setSection(s.key)}
            >
              {s.icon} {s.label}
            </button>
          ))}
          <button
            className="qcp-btn qcp-btn-primary"
            style={{ width: '100%', marginTop: 10 }}
            onClick={() => setSection('about')}
          >
            ℹ️ {t('settings.aboutSection')}
          </button>
        </div>

        <div className="qcp-card">
          {section === 'store' && <StoreSection />}
          {section === 'license' && <LicenseSection />}
          {section === 'tax' && <TaxSection />}
          {section === 'loyalty' && <LoyaltySection />}
          {section === 'print' && <PrintSection />}
          {section === 'barcode' && <BarcodeSection />}
          {section === 'device' && <DeviceSection />}
          {section === 'shortcuts' && <ShortcutsSection />}
          {section === 'backup' && <BackupSection />}
          {section === 'priceCheckerSync' && <PriceCheckerSyncSection />}
          {section === 'network' && <NetworkSection />}
          {section === 'users' && hasPermission(user, 'users.manage') && <UsersSection />}
          {section === 'assistant' && <AssistantSection />}
          {section === 'whatsapp' && <WhatsAppSection />}
          {section === 'posUi' && <PosUiSection />}
          {section === 'restaurant' && <RestaurantSection />}
          {section === 'dataReset' && user?.role === 'admin' && <DataResetSection />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  )
}

const PERMISSION_LABELS: Record<string, string> = {
  'dashboard.view': 'لوحة التحكم',
  'pos.sell': 'البيع',
  'customers.manage': 'العملاء',
  'invoices.manage': 'الفواتير',
  'vendors.manage': 'الموردين',
  'inventory.manage': 'المخزون',
  'settings.manage': 'الإعدادات',
  'reports.view': 'التقارير',
  'expenses.manage': 'المصروفات',
  'users.manage': 'المستخدمون',
  'sales_reps.manage': 'المناديب',
  'pos.editPrice': 'تعديل السعر أثناء البيع'
}

// نفس ترتيب المجموعات في الصورة المرجعية: صف لكل 3 صلاحيات
const PERMISSION_GRID_ORDER: string[] = [
  'dashboard.view',
  'pos.sell',
  'customers.manage',
  'invoices.manage',
  'vendors.manage',
  'inventory.manage',
  'settings.manage',
  'reports.view',
  'expenses.manage',
  'users.manage',
  'sales_reps.manage',
  'pos.editPrice'
]

const emptyUserForm = {
  id: null as number | null,
  username: '',
  password: '',
  fullName: '',
  role: 'cashier' as 'admin' | 'cashier',
  active: true,
  permissions: [] as string[]
}

function UsersSection(): JSX.Element {
  const { t } = useTranslation()
  const currentUser = useAppStore((s) => s.user)
  const [tab, setTab] = useState<'users' | 'log'>('users')
  const [users, setUsers] = useState<UserListItem[]>([])
  const [activity, setActivity] = useState<UserActivityEntry[]>([])
  const [form, setForm] = useState(emptyUserForm)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function refreshUsers(): Promise<void> {
    setUsers(await window.api.users.list())
  }

  useEffect(() => {
    refreshUsers()
  }, [])

  useEffect(() => {
    if (tab === 'log') window.api.users.listActivity(500).then(setActivity)
  }, [tab])

  function resetForm(): void {
    setForm(emptyUserForm)
  }

  async function startEdit(u: UserListItem): Promise<void> {
    const permissions = u.role === 'admin' ? [] : await window.api.users.getPermissions(u.id)
    setForm({
      id: u.id,
      username: u.username,
      password: '',
      fullName: u.fullName,
      role: u.role,
      active: u.active,
      permissions
    })
    setError(null)
    setMessage(null)
  }

  function togglePermission(code: string): void {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(code) ? f.permissions.filter((p) => p !== code) : [...f.permissions, code]
    }))
  }

  async function handleSubmit(): Promise<void> {
    setError(null)
    setMessage(null)
    setSaving(true)
    try {
      if (form.id === null) {
        await window.api.users.create({
          username: form.username.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          role: form.role,
          permissions: form.permissions
        })
        setMessage(t('settings.userCreated') ?? '')
      } else {
        const input: UserUpdateInput = {
          fullName: form.fullName.trim(),
          role: form.role,
          active: form.active,
          password: form.password.trim() || null,
          permissions: form.permissions
        }
        await window.api.users.update(form.id, input)
        setMessage(t('settings.userUpdated') ?? '')
      }
      resetForm()
      refreshUsers()
    } catch (err: any) {
      setError(err?.message ?? 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(u: UserListItem): Promise<void> {
    if (!currentUser) return
    if (!window.confirm(`${t('settings.confirmDeleteUser')} (${u.username})؟`)) return
    const result = await window.api.users.delete(u.id, currentUser.id)
    if (!result.ok) {
      setError(result.error ?? 'حدث خطأ')
      return
    }
    setMessage(result.deactivated ? t('settings.userDeactivated') ?? '' : t('settings.userDeleted') ?? '')
    refreshUsers()
  }

  const adminCount = users.filter((u) => u.role === 'admin' && u.active).length

  return (
    <>
      <h3 style={{ marginTop: 0 }}>👥 {t('settings.usersSection')}</h3>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`qcp-btn ${tab === 'users' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          onClick={() => setTab('users')}
        >
          {t('settings.usersAndPermissions')}
        </button>
        <button
          className={`qcp-btn ${tab === 'log' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`}
          onClick={() => setTab('log')}
        >
          {t('settings.usersActivityLog')}
        </button>
      </div>

      {tab === 'users' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
          <div>
            <div className="qcp-card" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
              <span className="qcp-pill accent">
                {t('settings.admins')}: {adminCount}
              </span>
              <span>
                {t('settings.totalUsers')}: {users.length}
              </span>
            </div>
            {users.map((u) => (
              <div
                key={u.id}
                className="qcp-card"
                style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{u.username}</div>
                  <div style={{ fontSize: 12, color: 'var(--qcp-ink-faint)' }}>
                    {u.role === 'admin' ? t('settings.roleAdmin') : t('settings.roleCashier')}
                    {!u.active && ` · ${t('settings.userInactive')}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="qcp-btn qcp-btn-secondary" style={{ padding: '4px 10px' }} onClick={() => startEdit(u)}>
                    {t('settings.edit')}
                  </button>
                  <button
                    className="qcp-btn qcp-btn-danger"
                    style={{ padding: '4px 10px' }}
                    onClick={() => handleDelete(u)}
                  >
                    {t('settings.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div>
            <h4 style={{ marginTop: 0 }}>{form.id === null ? t('settings.addUser') : t('settings.editUser')}</h4>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="qcp-field" style={{ flex: 1 }}>
                <label>{t('settings.username')}</label>
                <input
                  className="qcp-input"
                  disabled={form.id !== null}
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                />
              </div>
              <div className="qcp-field" style={{ flex: 1 }}>
                <label>{form.id === null ? t('settings.password') : t('settings.newPasswordOptional')}</label>
                <input
                  className="qcp-input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div className="qcp-field" style={{ flex: 1 }}>
                <label>{t('settings.fullName')}</label>
                <input
                  className="qcp-input"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              </div>
              <div className="qcp-field" style={{ flex: 1 }}>
                <label>{t('settings.role')}</label>
                <select
                  className="qcp-select"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'admin' | 'cashier' }))}
                >
                  <option value="cashier">{t('settings.roleCashier')}</option>
                  <option value="admin">{t('settings.roleAdmin')}</option>
                </select>
              </div>
            </div>

            {form.id !== null && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                {t('settings.userActive')}
              </label>
            )}

            {form.role !== 'admin' && (
              <div className="qcp-field">
                <label>{t('settings.permissions')}</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    className="qcp-btn qcp-btn-secondary"
                    style={{ padding: '4px 10px' }}
                    onClick={() => setForm((f) => ({ ...f, permissions: [...PERMISSIONS] }))}
                  >
                    {t('settings.allPermissions')}
                  </button>
                  <button
                    type="button"
                    className="qcp-btn qcp-btn-secondary"
                    style={{ padding: '4px 10px' }}
                    onClick={() => setForm((f) => ({ ...f, permissions: [] }))}
                  >
                    {t('settings.clearPermissions')}
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {PERMISSION_GRID_ORDER.map((code) => {
                    const active = form.permissions.includes(code)
                    return (
                      <button
                        key={code}
                        type="button"
                        style={{
                          cursor: 'pointer',
                          padding: '10px 8px',
                          borderRadius: 9,
                          fontSize: 13,
                          fontWeight: 700,
                          textAlign: 'center',
                          border: active ? '1.5px solid var(--qcp-accent)' : '1px solid var(--qcp-border)',
                          background: active ? 'var(--qcp-accent-soft)' : 'var(--qcp-bg-sunken)',
                          color: active ? 'var(--qcp-accent-strong)' : 'var(--qcp-ink)'
                        }}
                        onClick={() => togglePermission(code)}
                      >
                        {PERMISSION_LABELS[code] ?? code}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {error && (
              <div className="qcp-pill critical" style={{ marginTop: 12 }}>
                {error}
              </div>
            )}
            {message && (
              <div className="qcp-pill success" style={{ marginTop: 12 }}>
                {message}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                className="qcp-btn qcp-btn-primary"
                disabled={saving || !form.username.trim() || (form.id === null && !form.password)}
                onClick={handleSubmit}
              >
                {form.id === null ? t('settings.save') : t('settings.saveChanges')}
              </button>
              {form.id !== null && (
                <button className="qcp-btn qcp-btn-secondary" onClick={resetForm}>
                  {t('settings.cancel')}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="qcp-table-wrap">
          <table className="qcp-table">
            <thead>
              <tr>
                <th>{t('settings.logDate')}</th>
                <th>{t('settings.logUser')}</th>
                <th>{t('settings.logAction')}</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{a.createdAt}</td>
                  <td>{a.username}</td>
                  <td>
                    {t(`activityActions.${a.action}`, { defaultValue: a.action })} {a.detail ? `— ${a.detail}` : ''}
                  </td>
                </tr>
              ))}
              {activity.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                    —
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function LoyaltySection(): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<LoyaltySettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.settings.getLoyalty().then(setSettings)
  }, [])

  async function handleSave(): Promise<void> {
    if (!settings) return
    setSaving(true)
    setSaved(false)
    try {
      setSettings(await window.api.settings.updateLoyalty(settings))
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <p>{t('common.loading')}</p>

  return (
    <>
      <h3 style={{ marginTop: 0 }}>⭐ {t('settings.loyaltySection')}</h3>

      <div className="qcp-callout" style={{ marginBottom: 18 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          />
          {t('settings.loyaltyEnabled')}
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.redemptionValue')}</label>
          <input
            className="qcp-input"
            type="number"
            step="0.01"
            value={settings.redemptionValue}
            onChange={(e) => setSettings({ ...settings, redemptionValue: Number(e.target.value) || 0 })}
          />
          <p style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)', marginTop: 4 }}>
            {t('settings.redemptionValueHint')}
          </p>
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.pointsPerCurrency')}</label>
          <input
            className="qcp-input"
            type="number"
            step="0.01"
            value={settings.pointsPerCurrency}
            onChange={(e) => setSettings({ ...settings, pointsPerCurrency: Number(e.target.value) || 0 })}
          />
          <p style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)', marginTop: 4 }}>
            {t('settings.pointsPerCurrencyHint')}
          </p>
        </div>
      </div>

      <div className="qcp-card" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--qcp-ink-faint)' }}>{t('settings.pointsValueExample')}</div>
          <div style={{ fontWeight: 800 }}>{(100 * settings.redemptionValue).toFixed(2)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--qcp-ink-faint)' }}>{t('settings.invoicePointsExample')}</div>
          <div style={{ fontWeight: 800 }}>{Math.floor(100 * settings.pointsPerCurrency)}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--qcp-ink-faint)' }}>{t('settings.systemStatus')}</div>
          <span className={`qcp-pill ${settings.enabled ? 'success' : ''}`}>
            {settings.enabled ? t('settings.running') : t('settings.stopped')}
          </span>
        </div>
      </div>

      {saved && <SavedPill />}
      <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleSave}>
        {t('settings.saveLoyalty')}
      </button>
    </>
  )
}

const emptyShortcutForm = { view: 'dashboard', label: '', useShift: false, useAlt: true, useCtrl: false, key: '' }

function ShortcutsSection(): JSX.Element {
  const { t } = useTranslation()
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>([])
  const [customForm, setCustomForm] = useState(emptyShortcutForm)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [saved, setSaved] = useState<number | null>(null)

  async function refresh(): Promise<void> {
    setShortcuts(await window.api.shortcuts.list())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handlePatch(s: KeyboardShortcut, patch: Partial<KeyboardShortcut>): Promise<void> {
    const merged = { ...s, ...patch }
    await window.api.shortcuts.update(s.id, {
      enabled: merged.enabled,
      useShift: merged.useShift,
      useAlt: merged.useAlt,
      useCtrl: merged.useCtrl,
      key: merged.key
    })
    setSaved(s.id)
    refresh()
    setTimeout(() => setSaved(null), 1500)
  }

  async function handleAddCustom(): Promise<void> {
    if (!customForm.key.trim()) return
    await window.api.shortcuts.create({
      actionKey: customForm.view,
      label: customForm.label.trim() || `فتح ${customForm.view}`,
      useShift: customForm.useShift,
      useAlt: customForm.useAlt,
      useCtrl: customForm.useCtrl,
      key: customForm.key.trim()
    })
    setCustomForm(emptyShortcutForm)
    setShowCustomForm(false)
    refresh()
  }

  async function handleDeleteCustom(id: number): Promise<void> {
    await window.api.shortcuts.delete(id)
    refresh()
  }

  const builtIn = shortcuts.filter((s) => !s.isCustom)
  const custom = shortcuts.filter((s) => s.isCustom)

  function comboLabel(s: KeyboardShortcut): string {
    const parts = [s.useCtrl && 'Ctrl', s.useAlt && 'Alt', s.useShift && 'Shift', s.key.toUpperCase()].filter(Boolean)
    return parts.join(' + ')
  }

  return (
    <>
      <h3 style={{ marginTop: 0 }}>⌨️ {t('settings.shortcutsSection')}</h3>

      {builtIn.map((s) => (
        <div
          key={s.id}
          className="qcp-card"
          style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 60 }}>
            <input type="checkbox" checked={s.enabled} onChange={(e) => handlePatch(s, { enabled: e.target.checked })} />
            {t('settings.shortcutEnabled')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={s.useShift} onChange={(e) => handlePatch(s, { useShift: e.target.checked })} />
            SHIFT
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={s.useAlt} onChange={(e) => handlePatch(s, { useAlt: e.target.checked })} />
            ALT
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={s.useCtrl} onChange={(e) => handlePatch(s, { useCtrl: e.target.checked })} />
            CTRL
          </label>
          <input
            className="qcp-input"
            style={{ width: 60, textAlign: 'center' }}
            value={s.key}
            maxLength={1}
            onChange={(e) => handlePatch(s, { key: e.target.value.slice(-1) })}
          />
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)' }}>
              {t('settings.currentShortcut')}: {comboLabel(s)}
            </div>
          </div>
          {saved === s.id && <span className="qcp-pill success">{t('settings.saved')}</span>}
        </div>
      ))}

      <h4 style={{ marginTop: 20 }}>{t('settings.customShortcuts')}</h4>
      <p style={{ fontSize: 12.5, color: 'var(--qcp-ink-faint)' }}>{t('settings.customShortcutsHint')}</p>

      {!showCustomForm ? (
        <button className="qcp-btn qcp-btn-primary" onClick={() => setShowCustomForm(true)}>
          + {t('settings.addShortcut')}
        </button>
      ) : (
        <div className="qcp-card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="qcp-field">
              <label>{t('settings.shortcutTargetView')}</label>
              <select
                className="qcp-select"
                value={customForm.view}
                onChange={(e) => setCustomForm((f) => ({ ...f, view: e.target.value }))}
              >
                <option value="dashboard">{t('nav.dashboard')}</option>
                <option value="pos">{t('nav.pos')}</option>
                <option value="inventory">{t('nav.inventory')}</option>
                <option value="customers">{t('nav.customers')}</option>
                <option value="vendors">{t('nav.vendors')}</option>
                <option value="invoices">{t('nav.invoices')}</option>
                <option value="expenses">{t('nav.expenses')}</option>
                <option value="reports">{t('nav.reports')}</option>
                <option value="settings">{t('nav.settings')}</option>
              </select>
            </div>
            <div className="qcp-field">
              <label>{t('settings.shortcutLabel')}</label>
              <input
                className="qcp-input"
                value={customForm.label}
                onChange={(e) => setCustomForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={customForm.useCtrl}
                onChange={(e) => setCustomForm((f) => ({ ...f, useCtrl: e.target.checked }))}
              />
              CTRL
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={customForm.useAlt}
                onChange={(e) => setCustomForm((f) => ({ ...f, useAlt: e.target.checked }))}
              />
              ALT
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={customForm.useShift}
                onChange={(e) => setCustomForm((f) => ({ ...f, useShift: e.target.checked }))}
              />
              SHIFT
            </label>
            <div className="qcp-field">
              <label>{t('settings.shortcutKey')}</label>
              <input
                className="qcp-input"
                style={{ width: 60, textAlign: 'center' }}
                maxLength={1}
                value={customForm.key}
                onChange={(e) => setCustomForm((f) => ({ ...f, key: e.target.value.slice(-1) }))}
              />
            </div>
            <button className="qcp-btn qcp-btn-primary" onClick={handleAddCustom}>
              {t('settings.save')}
            </button>
            <button className="qcp-btn qcp-btn-secondary" onClick={() => setShowCustomForm(false)}>
              {t('settings.cancel')}
            </button>
          </div>
        </div>
      )}

      {custom.length === 0 ? (
        <p style={{ color: 'var(--qcp-ink-faint)', fontSize: 13 }}>{t('settings.noCustomShortcuts')}</p>
      ) : (
        custom.map((s) => (
          <div key={s.id} className="qcp-card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)' }}>{comboLabel(s)}</div>
            </div>
            <button className="qcp-btn qcp-btn-danger" style={{ padding: '4px 10px' }} onClick={() => handleDeleteCustom(s.id)}>
              {t('settings.delete')}
            </button>
          </div>
        ))
      )}
    </>
  )
}

function SavedPill(): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="qcp-pill success" style={{ marginBottom: 12 }}>
      {t('settings.saved')}
    </div>
  )
}

function TaxSection(): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<TaxSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.settings.getTax().then(setSettings)
  }, [])

  async function handleSave(): Promise<void> {
    if (!settings) return
    setSaving(true)
    setSaved(false)
    try {
      setSettings(await window.api.settings.updateTax(settings))
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <p>{t('common.loading')}</p>

  return (
    <>
      <h3 style={{ marginTop: 0 }}>{t('settings.taxSection')}</h3>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
        {t('settings.taxEnabled')}
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.taxName')}</label>
          <input className="qcp-input" value={settings.taxName} onChange={(e) => setSettings({ ...settings, taxName: e.target.value })} />
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.taxRate')}</label>
          <input className="qcp-input" type="number" value={settings.rate} onChange={(e) => setSettings({ ...settings, rate: Number(e.target.value) || 0 })} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.country')}</label>
          <input className="qcp-input" value={settings.country} onChange={(e) => setSettings({ ...settings, country: e.target.value })} />
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.taxNumber')}</label>
          <input className="qcp-input" value={settings.taxNumber ?? ''} onChange={(e) => setSettings({ ...settings, taxNumber: e.target.value })} />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input type="checkbox" checked={settings.eInvoiceEnabled} onChange={(e) => setSettings({ ...settings, eInvoiceEnabled: e.target.checked })} />
        {t('settings.eInvoiceEnabled')}
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <input type="checkbox" checked={settings.qrEnabled} onChange={(e) => setSettings({ ...settings, qrEnabled: e.target.checked })} />
        {t('settings.qrEnabled')}
      </label>
      {saved && <SavedPill />}
      <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleSave}>
        {t('settings.save')}
      </button>
    </>
  )
}

function PrintSection(): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<PrintSettings | null>(null)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.settings.getPrint().then(setSettings)
    window.api.settings.getPrinters().then(setPrinters)
  }, [])

  async function handleSave(): Promise<void> {
    if (!settings) return
    setSaving(true)
    setSaved(false)
    try {
      setSettings(await window.api.settings.updatePrint(settings))
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <p>{t('common.loading')}</p>

  return (
    <>
      <h3 style={{ marginTop: 0 }}>{t('settings.printSection')}</h3>
      <div className="qcp-field">
        <label>{t('settings.printer')}</label>
        <select
          className="qcp-select"
          value={settings.defaultPrinter ?? ''}
          onChange={(e) => setSettings({ ...settings, defaultPrinter: e.target.value || null })}
        >
          <option value="">{t('settings.systemDefault')}</option>
          {printers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.displayName}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.paperSize')}</label>
          <select className="qcp-select" value={settings.paperSize} onChange={(e) => setSettings({ ...settings, paperSize: e.target.value as PaperSize })}>
            <option value="80mm">80mm</option>
            <option value="58mm">58mm</option>
            <option value="A5">A5</option>
            <option value="A4">A4</option>
          </select>
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.printMode')}</label>
          <select className="qcp-select" value={settings.printMode} onChange={(e) => setSettings({ ...settings, printMode: e.target.value as 'auto' | 'manual' })}>
            <option value="manual">{t('settings.printModeManual')}</option>
            <option value="auto">{t('settings.printModeAuto')}</option>
          </select>
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.copies')}</label>
          <select
            className="qcp-select"
            value={settings.copies}
            onChange={(e) => setSettings({ ...settings, copies: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input type="checkbox" checked={settings.showLogo} onChange={(e) => setSettings({ ...settings, showLogo: e.target.checked })} />
        {t('settings.showLogo')}
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <input type="checkbox" checked={settings.autoPrintAfterSale} onChange={(e) => setSettings({ ...settings, autoPrintAfterSale: e.target.checked })} />
        {t('settings.autoPrintAfterSale')}
      </label>

      <h3>{t('settings.thermalCalibration')}</h3>
      <p style={{ marginTop: -6, fontSize: 12.5, color: 'var(--qcp-ink-faint)' }}>{t('settings.thermalCalibrationHint')}</p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.thermalContentWidth80mm')}</label>
          <input
            className="qcp-input"
            type="number"
            step="0.5"
            value={settings.thermalContentWidth80mm}
            onChange={(e) => setSettings({ ...settings, thermalContentWidth80mm: Number(e.target.value) })}
          />
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.thermalOffset80mm')}</label>
          <input
            className="qcp-input"
            type="number"
            step="0.5"
            value={settings.thermalOffset80mm}
            onChange={(e) => setSettings({ ...settings, thermalOffset80mm: Number(e.target.value) })}
          />
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.thermalContentWidth58mm')}</label>
          <input
            className="qcp-input"
            type="number"
            step="0.5"
            value={settings.thermalContentWidth58mm}
            onChange={(e) => setSettings({ ...settings, thermalContentWidth58mm: Number(e.target.value) })}
          />
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.thermalOffset58mm')}</label>
          <input
            className="qcp-input"
            type="number"
            step="0.5"
            value={settings.thermalOffset58mm}
            onChange={(e) => setSettings({ ...settings, thermalOffset58mm: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="qcp-field" style={{ maxWidth: 260, marginBottom: 18 }}>
        <label>{t('settings.thermalPageHeight')}</label>
        <input
          className="qcp-input"
          type="number"
          step="50"
          value={settings.thermalPageHeightMm}
          onChange={(e) => setSettings({ ...settings, thermalPageHeightMm: Number(e.target.value) })}
        />
        <p style={{ fontSize: 12, color: 'var(--qcp-ink-faint)', marginTop: 6 }}>{t('settings.thermalPageHeightHint')}</p>
      </div>
      {saved && <SavedPill />}
      <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleSave}>
        {t('settings.save')}
      </button>
    </>
  )
}

function RestaurantSection(): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<RestaurantSettings | null>(null)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryPrinters, setCategoryPrinters] = useState<CategoryPrinter[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function refresh(): void {
    window.api.settings.getRestaurant().then(setSettings)
    window.api.settings.getPrinters().then(setPrinters)
    window.api.catalog.listCategories().then(setCategories)
    window.api.settings.getCategoryPrinters().then(setCategoryPrinters)
  }

  useEffect(refresh, [])

  async function handleSave(): Promise<void> {
    if (!settings) return
    setSaving(true)
    setSaved(false)
    try {
      setSettings(await window.api.settings.updateRestaurant(settings))
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  async function setCategoryPrinter(categoryId: number, printerName: string): Promise<void> {
    await window.api.settings.setCategoryPrinter(categoryId, printerName || null)
    window.api.settings.getCategoryPrinters().then(setCategoryPrinters)
  }

  if (!settings) return <p>{t('common.loading')}</p>

  return (
    <>
      <h3 style={{ marginTop: 0 }}>{t('settings.restaurantSection')}</h3>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <input type="checkbox" checked={settings.dineInEnabled} onChange={(e) => setSettings({ ...settings, dineInEnabled: e.target.checked })} />
        تفعيل الصالة والترابيزات
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <input type="checkbox" checked={settings.takeawayEnabled} onChange={(e) => setSettings({ ...settings, takeawayEnabled: e.target.checked })} />
        تفعيل التيك أواي
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <input type="checkbox" checked={settings.deliveryEnabled} onChange={(e) => setSettings({ ...settings, deliveryEnabled: e.target.checked })} />
        تفعيل الديلفري
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <input type="checkbox" checked={settings.recipesEnabled} onChange={(e) => setSettings({ ...settings, recipesEnabled: e.target.checked })} />
        تفعيل الوصفات (خصم الخامات تلقائيًا)
      </label>

      <h3>ضريبة الخدمة</h3>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={settings.serviceChargeEnabled}
          onChange={(e) => setSettings({ ...settings, serviceChargeEnabled: e.target.checked })}
        />
        تفعيل ضريبة الخدمة (لطلبات الصالة فقط)
      </label>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>النوع</label>
          <select
            className="qcp-select"
            value={settings.serviceChargeType}
            onChange={(e) => setSettings({ ...settings, serviceChargeType: e.target.value as 'percent' | 'value' })}
          >
            <option value="percent">نسبة %</option>
            <option value="value">قيمة ثابتة</option>
          </select>
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>القيمة</label>
          <input
            className="qcp-input"
            type="number"
            value={settings.serviceChargeValue}
            onChange={(e) => setSettings({ ...settings, serviceChargeValue: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="qcp-field" style={{ maxWidth: 320, marginBottom: 18 }}>
        <label>طابعة المطبخ الافتراضية (لأي تصنيف مالوش طابعة محددة)</label>
        <select
          className="qcp-select"
          value={settings.defaultKitchenPrinter ?? ''}
          onChange={(e) => setSettings({ ...settings, defaultKitchenPrinter: e.target.value || null })}
        >
          <option value="">— بدون —</option>
          {printers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.displayName}
            </option>
          ))}
        </select>
      </div>

      {saved && <SavedPill />}
      <div>
        <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleSave}>
          {t('settings.save')}
        </button>
      </div>

      <h3 style={{ marginTop: 24 }}>طابعة المطبخ لكل تصنيف</h3>
      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>التصنيف</th>
              <th>الطابعة</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>
                  <select
                    className="qcp-select"
                    value={categoryPrinters.find((cp) => cp.categoryId === c.id)?.printerName ?? ''}
                    onChange={(e) => setCategoryPrinter(c.id, e.target.value)}
                  >
                    <option value="">— الطابعة الافتراضية —</option>
                    {printers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 24, fontSize: 13, color: 'var(--qcp-ink-faint)' }}>
        إدارة سائقي التوصيل ومناطق التوصيل بقت في صفحة "التوصيل والطيارين" في القائمة الجانبية.
      </p>
    </>
  )
}

function BarcodeSection(): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<BarcodeLabelSettings | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.settings.getBarcodeLabel().then(setSettings)
  }, [])

  useEffect(() => {
    if (!settings) return
    window.api.barcode.generate('6221000000012', settings.labelType).then(setPreview)
  }, [settings?.labelType])

  async function handleSave(): Promise<void> {
    if (!settings) return
    setSaving(true)
    setSaved(false)
    try {
      setSettings(await window.api.settings.updateBarcodeLabel(settings))
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <p>{t('common.loading')}</p>

  return (
    <>
      <h3 style={{ marginTop: 0 }}>{t('settings.barcodeSection')}</h3>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.labelType')}</label>
          <select className="qcp-select" value={settings.labelType} onChange={(e) => setSettings({ ...settings, labelType: e.target.value as BarcodeLabelSettings['labelType'] })}>
            <option value="auto">تلقائي</option>
            <option value="QR">QR</option>
            <option value="EAN8">EAN-8</option>
            <option value="EAN13">EAN-13</option>
            <option value="CODE128">CODE128</option>
          </select>
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.orientation')}</label>
          <select className="qcp-select" value={settings.orientation} onChange={(e) => setSettings({ ...settings, orientation: e.target.value as 'horizontal' | 'vertical' })}>
            <option value="vertical">{t('settings.orientationVertical')}</option>
            <option value="horizontal">{t('settings.orientationHorizontal')}</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.labelWidth')}</label>
          <input className="qcp-input" type="number" value={settings.labelWidthMm} onChange={(e) => setSettings({ ...settings, labelWidthMm: Number(e.target.value) || 0 })} />
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.labelHeight')}</label>
          <input className="qcp-input" type="number" value={settings.labelHeightMm} onChange={(e) => setSettings({ ...settings, labelHeightMm: Number(e.target.value) || 0 })} />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <input type="checkbox" checked={settings.showName} onChange={(e) => setSettings({ ...settings, showName: e.target.checked })} />
        {t('settings.showName')}
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <input type="checkbox" checked={settings.showPrice} onChange={(e) => setSettings({ ...settings, showPrice: e.target.checked })} />
        {t('settings.showPrice')}
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <input type="checkbox" checked={settings.showBarcodeNumber} onChange={(e) => setSettings({ ...settings, showBarcodeNumber: e.target.checked })} />
        {t('settings.showBarcodeNumber')}
      </label>

      {preview && (
        <div className="qcp-card" style={{ display: 'inline-block', marginBottom: 16 }}>
          <div style={{ fontSize: 11, marginBottom: 6, color: 'var(--qcp-ink-faint)' }}>{t('settings.preview')}</div>
          <img src={preview} alt="barcode preview" style={{ maxWidth: 200 }} />
        </div>
      )}

      {saved && <SavedPill />}
      <div>
        <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleSave}>
          {t('settings.save')}
        </button>
      </div>
    </>
  )
}

function DeviceSection(): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<DeviceSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.settings.getDevice().then(setSettings)
  }, [])

  async function handleSave(): Promise<void> {
    if (!settings) return
    setSaving(true)
    setSaved(false)
    try {
      setSettings(await window.api.settings.updateDevice(settings))
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <p>{t('common.loading')}</p>

  return (
    <>
      <h3 style={{ marginTop: 0 }}>{t('settings.deviceSection')}</h3>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <input type="checkbox" checked={settings.scannerEnabled} onChange={(e) => setSettings({ ...settings, scannerEnabled: e.target.checked })} />
        {t('settings.scannerEnabled')}
      </label>
      <div className="qcp-field" style={{ maxWidth: 220 }}>
        <label>{t('settings.scannerTimeout')}</label>
        <input className="qcp-input" type="number" value={settings.scannerTimeoutMs} onChange={(e) => setSettings({ ...settings, scannerTimeoutMs: Number(e.target.value) || 0 })} />
      </div>

      <hr style={{ border: 'none', borderTop: '1px dashed var(--qcp-border)', margin: '16px 0' }} />

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input type="checkbox" checked={settings.scaleBarcodeEnabled} onChange={(e) => setSettings({ ...settings, scaleBarcodeEnabled: e.target.checked })} />
        {t('settings.scaleBarcodeEnabled')}
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.scalePrefix')}</label>
          <input className="qcp-input" value={settings.scalePrefix} onChange={(e) => setSettings({ ...settings, scalePrefix: e.target.value })} />
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.scaleCodeLength')}</label>
          <input className="qcp-input" type="number" value={settings.scaleCodeLength} onChange={(e) => setSettings({ ...settings, scaleCodeLength: Number(e.target.value) || 0 })} />
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px dashed var(--qcp-border)', margin: '16px 0' }} />

      <div style={{ display: 'flex', gap: 10 }}>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.drawerPin')}</label>
          <select className="qcp-select" value={settings.drawerPin} onChange={(e) => setSettings({ ...settings, drawerPin: e.target.value })}>
            <option value="pin2">Pin 2</option>
            <option value="pin5">Pin 5</option>
          </select>
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input type="checkbox" checked={settings.openDrawerAfterSale} onChange={(e) => setSettings({ ...settings, openDrawerAfterSale: e.target.checked })} />
        {t('settings.openDrawerAfterSale')}
      </label>
      <p style={{ fontSize: 12, color: 'var(--qcp-ink-faint)', marginBottom: 16 }}>{t('settings.drawerNote')}</p>

      {saved && <SavedPill />}
      <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleSave}>
        {t('settings.save')}
      </button>
    </>
  )
}

function LicenseSection(): JSX.Element {
  const { t } = useTranslation()
  const [status, setStatus] = useState<LicenseStatus | null>(null)
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  async function refresh(): Promise<void> {
    setStatus(await window.api.license.getStatus())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleActivate(): Promise<void> {
    if (!key.trim()) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const result = await window.api.license.activate(key.trim())
      if (result.ok) {
        setSuccess(true)
        setKey('')
        if (result.status) setStatus(result.status)
      } else {
        setError(result.error ?? 'حدث خطأ')
      }
    } finally {
      setSaving(false)
    }
  }

  if (!status) return <p>{t('common.loading')}</p>

  const statusLabel =
    status.status === 'active'
      ? t('settings.activeStatus')
      : status.status === 'expired'
        ? t('settings.expiredStatus')
        : t('settings.trialStatus')
  const statusClass = status.status === 'active' ? 'success' : status.status === 'expired' ? 'critical' : 'warn'

  return (
    <>
      <h3 style={{ marginTop: 0 }}>{t('settings.licenseSection')}</h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span className={`qcp-pill ${statusClass}`}>{statusLabel}</span>
        {status.status !== 'active' && status.daysRemaining != null && (
          <span style={{ fontSize: 13, color: 'var(--qcp-ink-muted)' }}>
            {status.daysRemaining} {t('settings.daysRemaining')}
          </span>
        )}
        {status.status === 'active' && status.expiresAt && (
          <span style={{ fontSize: 13, color: 'var(--qcp-ink-muted)' }}>
            {t('settings.plan')}:{' '}
            {status.plan === 'yearly' ? t('settings.yearly') : status.plan === 'daily' ? t('settings.daily') : t('settings.monthly')} —{' '}
            {t('settings.expiresOn')} {status.expiresAt}
          </span>
        )}
      </div>

      <div className="qcp-field">
        <label>{t('settings.deviceFingerprint')}</label>
        <input
          className="qcp-input"
          readOnly
          value={status.deviceFingerprint}
          style={{ fontFamily: 'var(--qcp-mono)', fontSize: 12 }}
        />
      </div>

      <div className="qcp-field">
        <label>{t('settings.activationKey')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="qcp-input"
            style={{ flex: 1 }}
            placeholder={t('settings.enterKey') ?? ''}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button className="qcp-btn qcp-btn-primary" disabled={saving || !key.trim()} onClick={handleActivate}>
            {t('settings.activate')}
          </button>
        </div>
      </div>

      {success && <div className="qcp-pill success">{t('settings.activationSuccess')}</div>}
      {error && <div className="qcp-pill critical">{error}</div>}
    </>
  )
}

function BackupSection(): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<BackupSettings | null>(null)
  const [backups, setBackups] = useState<BackupFileInfo[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [clientId, setClientId] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)

  async function refresh(): Promise<void> {
    const [s, b] = await Promise.all([window.api.backup.getSettings(), window.api.backup.list()])
    setSettings(s)
    setBackups(b)
    setClientId(s.googleClientId ?? '')
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleSave(): Promise<void> {
    if (!settings) return
    setSaving(true)
    setSaved(false)
    try {
      const updated = await window.api.backup.updateSettings({
        autoBackupEnabled: settings.autoBackupEnabled,
        backupFolder: settings.backupFolder,
        frequencyHours: settings.frequencyHours,
        keepCount: settings.keepCount
      })
      setSettings(updated)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  async function handleBackupNow(): Promise<void> {
    setMessage(null)
    const result = await window.api.backup.runNow()
    setMessage(result.ok ? `تم إنشاء نسخة احتياطية: ${result.filePath}` : result.error ?? 'حدث خطأ')
    refresh()
  }

  async function handleRestore(filePath: string): Promise<void> {
    if (!window.confirm(t('settings.restoreConfirm') ?? '')) return
    const result = await window.api.backup.restore(filePath)
    if (!result.ok) setMessage(result.error ?? 'حدث خطأ')
  }

  async function handleConnectGoogle(): Promise<void> {
    if (!clientId.trim()) return
    setCloudBusy(true)
    setMessage(null)
    try {
      const result = await window.api.googleDrive.connect(clientId.trim())
      setMessage(result.ok ? 'تم الاتصال بحساب Google Drive بنجاح' : result.error ?? 'حدث خطأ')
      refresh()
    } finally {
      setCloudBusy(false)
    }
  }

  async function handleDisconnectGoogle(): Promise<void> {
    setCloudBusy(true)
    try {
      await window.api.googleDrive.disconnect()
      refresh()
    } finally {
      setCloudBusy(false)
    }
  }

  async function handleUploadNow(): Promise<void> {
    setCloudBusy(true)
    setMessage(null)
    try {
      const result = await window.api.googleDrive.upload()
      setMessage(result.ok ? 'تم رفع النسخة الاحتياطية إلى Google Drive' : result.error ?? 'حدث خطأ')
      refresh()
    } finally {
      setCloudBusy(false)
    }
  }

  if (!settings) return <p>{t('common.loading')}</p>

  return (
    <>
      <h3 style={{ marginTop: 0 }}>{t('settings.backupSection')}</h3>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={settings.autoBackupEnabled}
          onChange={(e) => setSettings({ ...settings, autoBackupEnabled: e.target.checked })}
        />
        {t('settings.autoBackupEnabled')}
      </label>

      <div className="qcp-field">
        <label>{t('settings.backupFolder')}</label>
        <input
          className="qcp-input"
          placeholder={t('settings.backupFolderPlaceholder') ?? ''}
          value={settings.backupFolder ?? ''}
          onChange={(e) => setSettings({ ...settings, backupFolder: e.target.value || null })}
        />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.frequency')}</label>
          <input
            className="qcp-input"
            type="number"
            value={settings.frequencyHours}
            onChange={(e) => setSettings({ ...settings, frequencyHours: Number(e.target.value) || 1 })}
          />
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.keepCount')}</label>
          <input
            className="qcp-input"
            type="number"
            value={settings.keepCount}
            onChange={(e) => setSettings({ ...settings, keepCount: Number(e.target.value) || 1 })}
          />
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--qcp-ink-faint)' }}>
        {t('settings.lastBackup')}: {settings.lastBackupAt ?? t('settings.never')}
      </p>

      {saved && <SavedPill />}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleSave}>
          {t('settings.save')}
        </button>
        <button className="qcp-btn qcp-btn-secondary" onClick={handleBackupNow}>
          {t('settings.backupNow')}
        </button>
      </div>

      {message && (
        <div className="qcp-pill accent" style={{ marginBottom: 16 }}>
          {message}
        </div>
      )}

      <h4 style={{ marginBottom: 8, fontSize: 14 }}>{t('settings.backupHistory')}</h4>
      <div className="qcp-table-wrap" style={{ marginBottom: 24 }}>
        <table className="qcp-table">
          <tbody>
            {backups.map((b) => (
              <tr key={b.filePath}>
                <td style={{ fontFamily: 'var(--qcp-mono)', fontSize: 12 }}>{b.fileName}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{b.createdAt}</td>
                <td>{(b.sizeBytes / 1024).toFixed(0)} KB</td>
                <td>
                  <button
                    className="qcp-btn qcp-btn-secondary"
                    style={{ padding: '4px 10px' }}
                    onClick={() => handleRestore(b.filePath)}
                  >
                    {t('settings.restore')}
                  </button>
                </td>
              </tr>
            ))}
            {backups.length === 0 && (
              <tr>
                <td style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <hr style={{ border: 'none', borderTop: '1px dashed var(--qcp-border)', margin: '10px 0 20px' }} />

      <h4 style={{ marginBottom: 6, fontSize: 14 }}>{t('settings.cloudBackupSection')}</h4>

      {settings.googleAccountEmail ? (
        <div style={{ marginBottom: 14 }}>
          <span className="qcp-pill success">
            {t('settings.connectedAs')}: {settings.googleAccountEmail}
          </span>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button className="qcp-btn qcp-btn-primary" disabled={cloudBusy} onClick={handleUploadNow}>
              {t('settings.uploadNow')}
            </button>
            <button className="qcp-btn qcp-btn-secondary" disabled={cloudBusy} onClick={handleDisconnectGoogle}>
              {t('settings.disconnectGoogle')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="qcp-field">
            <label>{t('settings.googleClientId')}</label>
            <input className="qcp-input" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            <p style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)', marginTop: 4 }}>
              {t('settings.googleClientIdHelp')}
            </p>
          </div>
          <button className="qcp-btn qcp-btn-primary" disabled={cloudBusy || !clientId.trim()} onClick={handleConnectGoogle}>
            {t('settings.connectGoogle')}
          </button>
        </>
      )}
    </>
  )
}

function PriceCheckerSyncSection(): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<PriceCheckerSyncSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  async function refresh(): Promise<void> {
    setSettings(await window.api.priceCheckerSync.get())
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleSave(): Promise<void> {
    if (!settings) return
    setSaving(true)
    setSaved(false)
    try {
      const updated = await window.api.priceCheckerSync.update({
        enabled: settings.enabled,
        server: settings.server,
        port: settings.port,
        databaseName: settings.databaseName,
        username: settings.username,
        password: settings.password
      })
      setSettings(updated)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest(): Promise<void> {
    if (!settings) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.api.priceCheckerSync.test({
        server: settings.server,
        port: settings.port,
        databaseName: settings.databaseName,
        username: settings.username,
        password: settings.password
      })
      setTestResult(result.ok ? t('settings.priceCheckerSyncTestOk') : result.error ?? t('common.error'))
    } finally {
      setTesting(false)
    }
  }

  async function handleSyncNow(): Promise<void> {
    setSyncing(true)
    try {
      const updated = await window.api.priceCheckerSync.syncNow()
      setSettings(updated)
    } finally {
      setSyncing(false)
    }
  }

  if (!settings) return <p>{t('common.loading')}</p>

  const connectionString = `Server=${settings.server || '<server>'},${settings.port};Database=${settings.databaseName || '<database>'};User Id=${settings.username || '<username>'};Password=***;TrustServerCertificate=True`
  const sampleQuery = 'SELECT ItemName, Price, Unit FROM dbo.QCP_PriceCheckItems WHERE Barcode = @Barcode'

  return (
    <>
      <h3 style={{ marginTop: 0 }}>{t('settings.priceCheckerSyncSection')}</h3>
      <p style={{ fontSize: 12.5, color: 'var(--qcp-ink-faint)', marginTop: -6, marginBottom: 16 }}>
        {t('settings.priceCheckerSyncHelp')}
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
        />
        {t('settings.priceCheckerSyncEnabled')}
      </label>

      <div style={{ display: 'flex', gap: 10 }}>
        <div className="qcp-field" style={{ flex: 2 }}>
          <label>{t('settings.priceCheckerSyncServer')}</label>
          <input
            className="qcp-input"
            value={settings.server ?? ''}
            onChange={(e) => setSettings({ ...settings, server: e.target.value || null })}
          />
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.priceCheckerSyncPort')}</label>
          <input
            className="qcp-input"
            type="number"
            value={settings.port}
            onChange={(e) => setSettings({ ...settings, port: Number(e.target.value) || 1433 })}
          />
        </div>
      </div>

      <div className="qcp-field">
        <label>{t('settings.priceCheckerSyncDatabase')}</label>
        <input
          className="qcp-input"
          value={settings.databaseName ?? ''}
          onChange={(e) => setSettings({ ...settings, databaseName: e.target.value || null })}
        />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.priceCheckerSyncUsername')}</label>
          <input
            className="qcp-input"
            value={settings.username ?? ''}
            onChange={(e) => setSettings({ ...settings, username: e.target.value || null })}
          />
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.priceCheckerSyncPassword')}</label>
          <input
            className="qcp-input"
            type="password"
            value={settings.password ?? ''}
            onChange={(e) => setSettings({ ...settings, password: e.target.value || null })}
          />
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--qcp-ink-faint)' }}>
        {t('settings.lastBackup')}: {settings.lastSyncAt ?? t('settings.never')}
        {settings.lastSyncStatus === 'error' && settings.lastSyncError ? ` — ${settings.lastSyncError}` : ''}
      </p>

      {saved && <SavedPill />}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleSave}>
          {t('settings.save')}
        </button>
        <button className="qcp-btn qcp-btn-secondary" disabled={testing} onClick={handleTest}>
          {t('settings.priceCheckerSyncTest')}
        </button>
        <button className="qcp-btn qcp-btn-secondary" disabled={syncing} onClick={handleSyncNow}>
          {t('settings.priceCheckerSyncNow')}
        </button>
      </div>

      {testResult && (
        <div className="qcp-pill accent" style={{ marginBottom: 16 }}>
          {testResult}
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px dashed var(--qcp-border)', margin: '10px 0 20px' }} />

      <h4 style={{ marginBottom: 6, fontSize: 14 }}>{t('settings.priceCheckerSyncDeviceSetup')}</h4>
      <p style={{ fontSize: 12.5, color: 'var(--qcp-ink-faint)', marginBottom: 10 }}>
        {t('settings.priceCheckerSyncDeviceSetupHelp')}
      </p>

      <div className="qcp-field">
        <label>{t('settings.priceCheckerSyncConnectionString')}</label>
        <input className="qcp-input" readOnly style={{ fontFamily: 'var(--qcp-mono)', fontSize: 12 }} value={connectionString} />
      </div>

      <div className="qcp-field">
        <label>{t('settings.priceCheckerSyncSampleQuery')}</label>
        <input className="qcp-input" readOnly style={{ fontFamily: 'var(--qcp-mono)', fontSize: 12 }} value={sampleQuery} />
      </div>
    </>
  )
}

function NetworkSection(): JSX.Element {
  const { t } = useTranslation()
  const [config, setConfig] = useState<NetworkConfig | null>(null)
  const [status, setStatus] = useState<NetworkStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [needsRestart, setNeedsRestart] = useState(false)

  async function refresh(): Promise<void> {
    const [c, s] = await Promise.all([window.api.network.getConfig(), window.api.network.getStatus()])
    setConfig(c)
    setStatus(s)
  }

  useEffect(() => {
    refresh()
    const id = setInterval(() => window.api.network.getStatus().then(setStatus), 4000)
    return () => clearInterval(id)
  }, [])

  async function handleSave(): Promise<void> {
    if (!config) return
    setSaving(true)
    try {
      const updated = await window.api.network.updateConfig(config)
      setConfig(updated)
      setNeedsRestart(true)
    } finally {
      setSaving(false)
    }
  }

  async function handleRegenerateCode(): Promise<void> {
    if (!config) return
    const code = await window.api.network.regenerateCode()
    setConfig({ ...config, connectionCode: code })
  }

  async function handleRestart(): Promise<void> {
    await window.api.relaunchApp()
  }

  if (!config || !status) return <p>{t('common.loading')}</p>

  return (
    <>
      <h3 style={{ marginTop: 0 }}>{t('settings.networkSection')}</h3>

      <div className="qcp-field">
        <label>{t('settings.deviceRole')}</label>
        <select className="qcp-select" value={config.role} onChange={(e) => setConfig({ ...config, role: e.target.value as DeviceRole })}>
          <option value="standalone">{t('settings.roleStandalone')}</option>
          <option value="main">{t('settings.roleMain')}</option>
          <option value="sub">{t('settings.roleSub')}</option>
        </select>
      </div>

      <div className="qcp-field">
        <label>{t('settings.deviceName')}</label>
        <input className="qcp-input" value={config.deviceName} onChange={(e) => setConfig({ ...config, deviceName: e.target.value })} />
      </div>

      {config.role === 'main' && (
        <>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="qcp-field" style={{ flex: 1 }}>
              <label>{t('settings.mainPort')}</label>
              <input className="qcp-input" type="number" value={config.port} onChange={(e) => setConfig({ ...config, port: Number(e.target.value) || 4545 })} />
            </div>
            <div className="qcp-field" style={{ flex: 2 }}>
              <label>{t('settings.connectionCode')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="qcp-input" readOnly style={{ flex: 1, fontFamily: 'var(--qcp-mono)', fontSize: 12 }} value={config.connectionCode} />
                <button type="button" className="qcp-btn qcp-btn-secondary" onClick={handleRegenerateCode}>
                  {t('settings.regenerateCode')}
                </button>
              </div>
            </div>
          </div>

          <div className="qcp-field">
            <label>{t('settings.localIpAddresses')}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {status.localIpAddresses.length === 0 && <span className="qcp-pill">—</span>}
              {status.localIpAddresses.map((ip) => (
                <span key={ip} className="qcp-pill accent" style={{ fontFamily: 'var(--qcp-mono)' }}>
                  {ip}
                </span>
              ))}
            </div>
          </div>

          <div className="qcp-pill success" style={{ marginBottom: 16 }}>
            {t('settings.connectedDevices')}: {status.connectedDeviceCount}
          </div>
        </>
      )}

      {config.role === 'sub' && (
        <>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="qcp-field" style={{ flex: 2 }}>
              <label>{t('settings.subMainHost')}</label>
              <input
                className="qcp-input"
                placeholder="192.168.1.10"
                value={config.mainHost ?? ''}
                onChange={(e) => setConfig({ ...config, mainHost: e.target.value || null })}
              />
            </div>
            <div className="qcp-field" style={{ flex: 1 }}>
              <label>{t('settings.subMainPort')}</label>
              <input
                className="qcp-input"
                type="number"
                value={config.mainPort ?? 4545}
                onChange={(e) => setConfig({ ...config, mainPort: Number(e.target.value) || null })}
              />
            </div>
          </div>
          <div className="qcp-field">
            <label>{t('settings.subMainCode')}</label>
            <input
              className="qcp-input"
              style={{ fontFamily: 'var(--qcp-mono)', fontSize: 12 }}
              value={config.mainConnectionCode ?? ''}
              onChange={(e) => setConfig({ ...config, mainConnectionCode: e.target.value || null })}
            />
          </div>

          <div className={`qcp-pill ${status.connectedToMain ? 'success' : 'critical'}`} style={{ marginBottom: 16 }}>
            {t('settings.connectionStatus')}: {status.connectedToMain ? t('settings.connected') : t('settings.disconnected')}
          </div>
        </>
      )}

      {needsRestart && (
        <div className="qcp-callout" style={{ marginBottom: 16 }}>
          <span>{t('settings.restartRequired')}</span>
          <button className="qcp-btn qcp-btn-primary" onClick={handleRestart}>
            {t('settings.restartNow')}
          </button>
        </div>
      )}

      <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleSave}>
        {t('settings.save')}
      </button>
    </>
  )
}

function StoreSection(): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<StoreSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.settings.getStore().then(setSettings)
  }, [])

  async function handleSave(): Promise<void> {
    if (!settings) return
    setSaving(true)
    setSaved(false)
    try {
      setSettings(await window.api.settings.updateStore(settings))
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (!file || !settings) return
    const reader = new FileReader()
    reader.onload = () => setSettings({ ...settings, logoDataUrl: String(reader.result) })
    reader.readAsDataURL(file)
  }

  if (!settings) return <p>{t('common.loading')}</p>

  return (
    <>
      <h3 style={{ marginTop: 0 }}>{t('settings.storeSection')}</h3>

      <div className="qcp-field">
        <label>{t('settings.storeLogo')}</label>
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
              background: 'var(--qcp-bg-sunken)'
            }}
          >
            {settings.logoDataUrl ? (
              <img src={settings.logoDataUrl} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%' }} />
            ) : (
              <span style={{ fontSize: 22 }}>🏬</span>
            )}
          </div>
          <label className="qcp-btn qcp-btn-secondary" style={{ cursor: 'pointer' }}>
            {t('settings.uploadLogo')}
            <input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }} />
          </label>
          {settings.logoDataUrl && (
            <button
              type="button"
              className="qcp-btn qcp-btn-secondary"
              onClick={() => setSettings({ ...settings, logoDataUrl: null })}
            >
              {t('settings.removeLogo')}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.storeName')}</label>
          <input className="qcp-input" value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.storePhone')}</label>
          <input
            className="qcp-input"
            value={settings.phone ?? ''}
            onChange={(e) => setSettings({ ...settings, phone: e.target.value || null })}
          />
        </div>
      </div>

      <div className="qcp-field">
        <label>{t('settings.storeAddress')}</label>
        <input
          className="qcp-input"
          value={settings.address ?? ''}
          onChange={(e) => setSettings({ ...settings, address: e.target.value || null })}
        />
      </div>

      <div className="qcp-field">
        <label>{t('settings.storeWebsite')}</label>
        <input
          className="qcp-input"
          value={settings.website ?? ''}
          onChange={(e) => setSettings({ ...settings, website: e.target.value || null })}
        />
      </div>

      <div className="qcp-field">
        <label>{t('settings.thankYouMessage')}</label>
        <input
          className="qcp-input"
          value={settings.thankYouMessage}
          onChange={(e) => setSettings({ ...settings, thankYouMessage: e.target.value })}
        />
      </div>

      {saved && <SavedPill />}
      <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleSave}>
        {t('settings.save')}
      </button>
    </>
  )
}

const ASSISTANT_PROVIDERS: { key: AssistantProvider; name: string; desc: string }[] = [
  { key: 'openai_compatible', name: 'OpenAI Compatible', desc: 'أي مزود متوافق مع Chat Completions أو Responses' },
  { key: 'groq', name: 'Groq', desc: 'سرعة عالية، وبحث عبر Groq Compound' },
  { key: 'gemini', name: 'Google Gemini', desc: 'Gemini API مع Google Search Grounding عند تفعيله' },
  { key: 'openai', name: 'OpenAI', desc: 'مع دعم Responses API المدمج عند تفعيله' }
]

const ASSISTANT_SECTION_LABELS: Record<string, string> = {
  dashboard: 'لوحة التحكم',
  pos: 'المبيعات',
  inventory: 'المخزون والمشتريات',
  customers: 'العملاء',
  vendors: 'الموردين',
  invoices: 'الفواتير',
  expenses: 'المصروفات',
  reports: 'التقارير',
  settings: 'الإعدادات'
}

function AssistantSection(): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AssistantSettings | null>(null)
  const [users, setUsers] = useState<UserListItem[]>([])
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  useEffect(() => {
    window.api.settings.getAssistant().then(setSettings)
    window.api.users.list().then(setUsers)
  }, [])

  async function handleSave(): Promise<void> {
    if (!settings) return
    setSaving(true)
    setSaved(false)
    try {
      setSettings(await window.api.settings.updateAssistant(settings))
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest(): Promise<void> {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await window.api.assistant.testConnection())
    } finally {
      setTesting(false)
    }
  }

  function toggleSection(key: string): void {
    if (!settings) return
    setSettings({
      ...settings,
      allowedSections: settings.allowedSections.includes(key)
        ? settings.allowedSections.filter((s) => s !== key)
        : [...settings.allowedSections, key]
    })
  }

  function toggleUser(id: number): void {
    if (!settings) return
    setSettings({
      ...settings,
      allowedUserIds: settings.allowedUserIds.includes(id)
        ? settings.allowedUserIds.filter((u) => u !== id)
        : [...settings.allowedUserIds, id]
    })
  }

  if (!settings) return <p>{t('common.loading')}</p>

  return (
    <>
      <div
        className="qcp-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
          background: 'var(--qcp-accent-soft)'
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>🤖 {t('settings.assistantSection')}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--qcp-ink-muted)' }}>
            {t('settings.assistantSubtitle')}
          </p>
        </div>
        <span className="qcp-pill success">🛡️ {t('settings.assistantReadOnlyBadge')}</span>
      </div>

      <div className="qcp-field">
        <label>{t('settings.assistantProvider')}</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {ASSISTANT_PROVIDERS.map((p) => {
            const active = settings.provider === p.key
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setSettings({ ...settings, provider: p.key })}
                style={{
                  cursor: 'pointer',
                  textAlign: 'start',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: active ? '1.5px solid var(--qcp-accent)' : '1px solid var(--qcp-border)',
                  background: active ? 'var(--qcp-accent-soft)' : 'transparent'
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>
                  {active && '✓ '}
                  {p.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--qcp-ink-faint)', marginTop: 3 }}>{p.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.assistantModelName')}</label>
          <input
            className="qcp-input"
            value={settings.modelName}
            onChange={(e) => setSettings({ ...settings, modelName: e.target.value })}
          />
        </div>
        <div className="qcp-field" style={{ flex: 1 }}>
          <label>{t('settings.assistantApiKey')}</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="qcp-input"
              style={{ flex: 1 }}
              type={showKey ? 'text' : 'password'}
              placeholder={t('settings.assistantApiKeyPlaceholder') ?? ''}
              value={settings.apiKey ?? ''}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
            />
            <button type="button" className="qcp-btn qcp-btn-secondary" onClick={() => setShowKey((v) => !v)}>
              👁️
            </button>
          </div>
        </div>
      </div>

      <div className="qcp-field">
        <label>{t('settings.assistantApiUrl')}</label>
        <input
          className="qcp-input"
          value={settings.apiUrl}
          onChange={(e) => setSettings({ ...settings, apiUrl: e.target.value })}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
        <label className="qcp-card" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          />
          <span>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{t('settings.assistantEnabled')}</div>
            <div style={{ fontSize: 11, color: 'var(--qcp-ink-faint)' }}>{t('settings.assistantEnabledHint')}</div>
          </span>
        </label>
        <label className="qcp-card" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.floatingButtonEnabled}
            onChange={(e) => setSettings({ ...settings, floatingButtonEnabled: e.target.checked })}
          />
          <span>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{t('settings.assistantFloatingButton')}</div>
            <div style={{ fontSize: 11, color: 'var(--qcp-ink-faint)' }}>
              {t('settings.assistantFloatingButtonHint')}
            </div>
          </span>
        </label>
        <label className="qcp-card" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.storeAnalysisEnabled}
            onChange={(e) => setSettings({ ...settings, storeAnalysisEnabled: e.target.checked })}
          />
          <span>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{t('settings.assistantStoreAnalysis')}</div>
            <div style={{ fontSize: 11, color: 'var(--qcp-ink-faint)' }}>
              {t('settings.assistantStoreAnalysisHint')}
            </div>
          </span>
        </label>
        <label className="qcp-card" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.externalSearchEnabled}
            onChange={(e) => setSettings({ ...settings, externalSearchEnabled: e.target.checked })}
          />
          <span>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{t('settings.assistantExternalSearch')}</div>
            <div style={{ fontSize: 11, color: 'var(--qcp-ink-faint)' }}>
              {t('settings.assistantExternalSearchHint')}
            </div>
          </span>
        </label>
      </div>

      <div className="qcp-card" style={{ marginBottom: 16 }}>
        <h4 style={{ marginTop: 0 }}>{t('settings.assistantAllowedSections')}</h4>
        <p style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)', marginBottom: 10 }}>
          {t('settings.assistantAllowedSectionsHint')}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.keys(ASSISTANT_SECTION_LABELS).map((key) => {
            const active = settings.allowedSections.includes(key)
            return (
              <button
                key={key}
                type="button"
                className="qcp-pill"
                style={{
                  cursor: 'pointer',
                  border: 'none',
                  background: active ? 'var(--qcp-accent)' : 'var(--qcp-bg-sunken)',
                  color: active ? 'white' : 'var(--qcp-ink)'
                }}
                onClick={() => toggleSection(key)}
              >
                {ASSISTANT_SECTION_LABELS[key]}
              </button>
            )
          })}
        </div>
      </div>

      <div className="qcp-card" style={{ marginBottom: 18 }}>
        <h4 style={{ marginTop: 0 }}>👥 {t('settings.assistantAllowedUsers')}</h4>
        <p style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)', marginBottom: 10 }}>
          {t('settings.assistantAllowedUsersHint')}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {users.map((u) => (
            <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              {u.username}
              <input type="checkbox" checked={settings.allowedUserIds.includes(u.id)} onChange={() => toggleUser(u.id)} />
            </label>
          ))}
        </div>
      </div>

      {saved && <SavedPill />}
      {testResult && (
        <div className={`qcp-pill ${testResult.ok ? 'success' : 'critical'}`} style={{ marginBottom: 12 }}>
          {testResult.ok ? t('settings.assistantTestSuccess') : testResult.error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleSave}>
          {t('settings.save')}
        </button>
        <button className="qcp-btn qcp-btn-secondary" disabled={testing} onClick={handleTest}>
          {testing ? t('common.loading') : t('settings.assistantTestConnection')}
        </button>
      </div>
    </>
  )
}

function WhatsAppSection(): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<WhatsAppSettings | null>(null)
  const [status, setStatus] = useState<WhatsAppStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  async function refreshStatus(): Promise<void> {
    setStatus(await window.api.whatsapp.getStatus())
  }

  useEffect(() => {
    window.api.settings.getWhatsApp().then(setSettings)
    refreshStatus()
  }, [])

  // بيفضل يسأل عن حالة الاتصال كل شوية طول ما لسه مش متصل — سواء وقت انتظار مسح الـQR أو لو
  // الاتصال فشل/انتهت صلاحية الكود، عشان الزرار يرجع يشتغل تلقائيًا من غير ما يعلق على حالة قديمة.
  useEffect(() => {
    if (status?.connected) return
    const interval = setInterval(refreshStatus, 2500)
    return () => clearInterval(interval)
  }, [status?.connected])

  async function handleSave(): Promise<void> {
    if (!settings) return
    setSaving(true)
    setSaved(false)
    try {
      setSettings(await window.api.settings.updateWhatsApp(settings))
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  async function handlePair(): Promise<void> {
    setStatus(await window.api.whatsapp.startPairing())
  }

  async function handleLogout(): Promise<void> {
    setLoggingOut(true)
    try {
      await window.api.whatsapp.logout()
      await refreshStatus()
    } finally {
      setLoggingOut(false)
    }
  }

  async function handleTestSend(): Promise<void> {
    if (!testPhone.trim()) return
    setTestSending(true)
    setTestResult(null)
    try {
      setTestResult(await window.api.whatsapp.sendTest(testPhone.trim(), t('settings.whatsappTestMessage') ?? 'رسالة تجربة من Quick Cash Plus'))
    } finally {
      setTestSending(false)
    }
  }

  if (!settings || !status) return <p>{t('common.loading')}</p>

  return (
    <>
      <h3 style={{ marginTop: 0 }}>💬 {t('settings.whatsappSection')}</h3>
      <p style={{ marginTop: -6, fontSize: 12.5, color: 'var(--qcp-ink-faint)' }}>{t('settings.whatsappSubtitle')}</p>

      <div
        className="qcp-card"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}
      >
        <div>
          <span
            className="qcp-pill"
            style={{
              background: status.connected ? 'var(--qcp-success-soft)' : 'var(--qcp-critical-soft)',
              color: status.connected ? 'var(--qcp-success)' : 'var(--qcp-critical)'
            }}
          >
            {status.connected ? `🟢 ${t('settings.whatsappConnected')} (${status.phoneNumber})` : `🔴 ${t('settings.whatsappDisconnected')}`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!status.connected && (
            <button className="qcp-btn qcp-btn-primary" onClick={handlePair} disabled={status.connecting}>
              {t('settings.whatsappPair')}
            </button>
          )}
          {status.connected && (
            <button className="qcp-btn qcp-btn-secondary" onClick={handleLogout} disabled={loggingOut}>
              {t('settings.whatsappLogout')}
            </button>
          )}
        </div>
      </div>

      {!status.connected && status.lastError && (
        <div className="qcp-pill critical" style={{ marginBottom: 18 }}>
          {status.lastError}
        </div>
      )}

      {!status.connected && status.connecting && !status.qrDataUrl && (
        <p style={{ marginBottom: 18 }}>{t('common.loading')}</p>
      )}

      {!status.connected && status.qrDataUrl && (
        <div className="qcp-card" style={{ textAlign: 'center', marginBottom: 18 }}>
          <p style={{ marginTop: 0 }}>{t('settings.whatsappScanHint')}</p>
          <img src={status.qrDataUrl} alt="WhatsApp QR" style={{ width: 220, height: 220 }} />
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
        {t('settings.whatsappEnabled')}
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={settings.sendOnSale}
          onChange={(e) => setSettings({ ...settings, sendOnSale: e.target.checked })}
        />
        {t('settings.whatsappSendOnSale')}
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <input
          type="checkbox"
          checked={settings.sendInvoicePdf}
          onChange={(e) => setSettings({ ...settings, sendInvoicePdf: e.target.checked })}
        />
        {t('settings.whatsappSendInvoicePdf')}
      </label>

      <div className="qcp-field" style={{ marginBottom: 18 }}>
        <label>{t('settings.whatsappTemplate')}</label>
        <textarea
          className="qcp-input"
          style={{ width: '100%', minHeight: 120, fontFamily: 'inherit' }}
          value={settings.messageTemplate}
          onChange={(e) => setSettings({ ...settings, messageTemplate: e.target.value })}
        />
        <p style={{ fontSize: 12, color: 'var(--qcp-ink-faint)', marginTop: 6 }}>{t('settings.whatsappTemplateHint')}</p>
      </div>

      {saved && <SavedPill />}
      <button className="qcp-btn qcp-btn-primary" disabled={saving} onClick={handleSave} style={{ marginBottom: 24 }}>
        {t('settings.save')}
      </button>

      <h3>{t('settings.whatsappTestSection')}</h3>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          className="qcp-input"
          style={{ maxWidth: 220 }}
          placeholder={t('settings.whatsappTestPhonePlaceholder') ?? ''}
          value={testPhone}
          onChange={(e) => setTestPhone(e.target.value)}
        />
        <button className="qcp-btn qcp-btn-secondary" onClick={handleTestSend} disabled={testSending || !status.connected}>
          {t('settings.whatsappSendTest')}
        </button>
      </div>
      {testResult && (
        <p style={{ color: testResult.ok ? 'var(--qcp-success)' : 'var(--qcp-critical)', marginTop: 8 }}>
          {testResult.ok ? t('settings.whatsappTestSent') : testResult.error}
        </p>
      )}
    </>
  )
}

const CURRENCY_PRESETS: { code: string; symbol: string; label: string }[] = [
  { code: 'EGP', symbol: 'ج.م', label: 'جنيه مصري' },
  { code: 'SAR', symbol: 'ر.س', label: 'ريال سعودي' },
  { code: 'AED', symbol: 'د.إ', label: 'درهم إماراتي' },
  { code: 'KWD', symbol: 'د.ك', label: 'دينار كويتي' },
  { code: 'USD', symbol: '$', label: 'دولار أمريكي' },
  { code: 'EUR', symbol: '€', label: 'يورو' }
]

function PosUiSection(): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<PosUiSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    window.api.settings.getPosUi().then(setSettings)
  }, [])

  async function handleSave(next: PosUiSettings): Promise<void> {
    setSettings(next)
    setSaving(true)
    setMessage(null)
    try {
      const updated = await window.api.settings.updatePosUi(next)
      setSettings(updated)
      setMessage(t('settings.saved'))
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <p>{t('common.loading')}</p>

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>{t('settings.posUiSection')}</h2>

      <div className="qcp-card" style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={settings.soundEnabled}
            onChange={(e) => handleSave({ ...settings, soundEnabled: e.target.checked })}
          />
          🔊 {t('posUi.soundsEnabled')}
        </label>
        <div className="qcp-field">
          <label>
            {t('posUi.soundVolume')}: {Math.round(settings.soundVolume * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.soundVolume}
            onChange={(e) => setSettings({ ...settings, soundVolume: Number(e.target.value) })}
            onMouseUp={(e) => handleSave({ ...settings, soundVolume: Number((e.target as HTMLInputElement).value) })}
            onTouchEnd={() => handleSave(settings)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="qcp-btn qcp-btn-secondary"
            onClick={() => playSound('sell', { forceEnabled: true, forceVolume: settings.soundVolume })}
          >
            {t('posUi.testSell')}
          </button>
          <button
            type="button"
            className="qcp-btn qcp-btn-secondary"
            onClick={() => playSound('delete', { forceEnabled: true, forceVolume: settings.soundVolume })}
          >
            {t('posUi.testDelete')}
          </button>
          <button
            type="button"
            className="qcp-btn qcp-btn-secondary"
            onClick={() => playSound('save', { forceEnabled: true, forceVolume: settings.soundVolume })}
          >
            {t('posUi.testSave')}
          </button>
        </div>
      </div>

      <ToggleRow
        title={t('posUi.allowTempItem')}
        hint={t('posUi.allowTempItemHint')}
        checked={settings.allowTempItem}
        onChange={(v) => handleSave({ ...settings, allowTempItem: v })}
      />
      <ToggleRow
        title={t('posUi.priceEditEnabled')}
        hint={t('posUi.priceEditEnabledHint')}
        checked={settings.priceEditEnabled}
        onChange={(v) => handleSave({ ...settings, priceEditEnabled: v })}
      />
      <ToggleRow
        title={t('posUi.multiWarehouseEnabled')}
        hint={t('posUi.multiWarehouseEnabledHint')}
        checked={settings.multiWarehouseEnabled}
        onChange={(v) => handleSave({ ...settings, multiWarehouseEnabled: v })}
        locked={!settings.multiWarehouseEnabled}
      />
      <ToggleRow
        title={t('posUi.categorySidebarEnabled')}
        hint={t('posUi.categorySidebarEnabledHint')}
        checked={settings.categorySidebarEnabled}
        onChange={(v) => handleSave({ ...settings, categorySidebarEnabled: v })}
      />

      <div className="qcp-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('posUi.currency')}</h3>
        <div className="qcp-field">
          <label>{t('posUi.currency')}</label>
          <select
            className="qcp-select"
            value={settings.currencyCode}
            onChange={(e) => {
              const preset = CURRENCY_PRESETS.find((c) => c.code === e.target.value)
              if (preset) handleSave({ ...settings, currencyCode: preset.code, currencySymbol: preset.symbol })
            }}
          >
            {CURRENCY_PRESETS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label} ({c.symbol})
              </option>
            ))}
          </select>
        </div>
        <div className="qcp-field">
          <label>{t('posUi.currencySymbol')}</label>
          <input
            className="qcp-input"
            value={settings.currencySymbol}
            onChange={(e) => setSettings({ ...settings, currencySymbol: e.target.value })}
            onBlur={() => handleSave(settings)}
          />
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)' }}>{t('posUi.currencyNote')}</p>
      </div>

      {saving && <p style={{ fontSize: 12, color: 'var(--qcp-ink-faint)' }}>{t('common.loading')}</p>}
      {message && (
        <div className="qcp-pill success" style={{ marginTop: 10 }}>
          {message}
        </div>
      )}
    </div>
  )
}

function ToggleRow({
  title,
  hint,
  checked,
  onChange,
  locked
}: {
  title: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
  locked?: boolean
}): JSX.Element {
  return (
    <div
      className="qcp-card"
      style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          {title}
          {locked && <span className="qcp-pill critical">{'🔒'}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)', marginTop: 4 }}>{hint}</div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center' }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </label>
    </div>
  )
}

type DataResetAction =
  | 'customers'
  | 'products'
  | 'sales'
  | 'vendors'
  | 'categories'
  | 'expenses'
  | 'assistantChat'
  | 'factoryReset'

function DataResetSection(): JSX.Element {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)
  const [activeAction, setActiveAction] = useState<DataResetAction | null>(null)

  const actions: { key: DataResetAction; icon: string; label: string; danger?: boolean; note?: string }[] = [
    { key: 'customers', icon: '👤', label: t('dataReset.customers') },
    { key: 'products', icon: '📦', label: t('dataReset.products') },
    { key: 'sales', icon: '🧾', label: t('dataReset.sales') },
    { key: 'vendors', icon: '🚚', label: t('dataReset.vendors') },
    { key: 'categories', icon: '🏷️', label: t('dataReset.categories') },
    { key: 'expenses', icon: '💸', label: t('dataReset.expenses') },
    { key: 'assistantChat', icon: '💬', label: t('dataReset.assistantChat') }
  ]

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>{t('dataReset.title')}</h2>
      <div className="qcp-callout" style={{ marginBottom: 18 }}>
        ⚠️ {t('dataReset.warning')}
      </div>

      <div className="qcp-grid qcp-grid-4" style={{ marginBottom: 16 }}>
        {actions.map((a) => (
          <button
            key={a.key}
            className="qcp-card"
            style={{ textAlign: 'start', cursor: 'pointer', border: 'none' }}
            onClick={() => setActiveAction(a.key)}
          >
            <div style={{ fontSize: 22, marginBottom: 8 }}>{a.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{a.label}</div>
          </button>
        ))}
      </div>

      <button
        className="qcp-card"
        style={{
          textAlign: 'start',
          cursor: 'pointer',
          width: '100%',
          border: '2px solid var(--qcp-critical)',
          background: 'var(--qcp-critical-soft)'
        }}
        onClick={() => setActiveAction('factoryReset')}
      >
        <div style={{ fontSize: 24, marginBottom: 8 }}>🏭</div>
        <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--qcp-critical)' }}>
          {t('dataReset.factoryReset')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--qcp-ink-muted)', marginTop: 6 }}>
          {t('dataReset.factoryResetNote')}
        </div>
      </button>

      {activeAction && user && (
        <ConfirmResetModal action={activeAction} userId={user.id} onClose={() => setActiveAction(null)} />
      )}
    </div>
  )
}

function ConfirmResetModal({
  action,
  userId,
  onClose
}: {
  action: DataResetAction
  userId: number
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const confirmLabel = t(`dataReset.${action}`)
  const [typedValue, setTypedValue] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successPath, setSuccessPath] = useState<string | null>(null)

  async function handleConfirm(): Promise<void> {
    if (typedValue.trim() !== confirmLabel) {
      setError(t('dataReset.confirmMismatch'))
      return
    }
    setError(null)
    setProcessing(true)
    try {
      const api = window.api.dataReset
      const result = await (action === 'customers'
        ? api.customers(userId)
        : action === 'products'
          ? api.products(userId)
          : action === 'sales'
            ? api.sales(userId)
            : action === 'vendors'
              ? api.vendors(userId)
              : action === 'categories'
                ? api.categories(userId)
                : action === 'expenses'
                  ? api.expenses(userId)
                  : action === 'assistantChat'
                    ? api.assistantChat(userId)
                    : api.factoryReset(userId))
      if (!result.ok) {
        setError(result.error ?? 'حدث خطأ')
        return
      }
      playSound('delete')
      setSuccessPath(result.backupFilePath ?? '')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="qcp-modal-backdrop" onClick={processing ? undefined : onClose}>
      <div className="qcp-modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, color: 'var(--qcp-critical)' }}>{confirmLabel}</h2>

        {successPath !== null ? (
          <>
            <div className="qcp-pill success" style={{ marginBottom: 12 }}>
              {t('dataReset.success')} {successPath}
            </div>
            <button className="qcp-btn qcp-btn-primary" style={{ width: '100%' }} onClick={onClose}>
              {t('common.close')}
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--qcp-ink-muted)' }}>{t('dataReset.warning')}</p>
            <div className="qcp-field">
              <label>
                {t('dataReset.confirmPrompt')} <strong>{confirmLabel}</strong>
              </label>
              <input
                className="qcp-input"
                value={typedValue}
                disabled={processing}
                onChange={(e) => setTypedValue(e.target.value)}
              />
            </div>
            {error && (
              <div className="qcp-pill critical" style={{ marginBottom: 12 }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="qcp-btn qcp-btn-primary"
                style={{ background: 'var(--qcp-critical)' }}
                disabled={processing || typedValue.trim() !== confirmLabel}
                onClick={handleConfirm}
              >
                {processing ? t('dataReset.processing') : t('dataReset.confirmButton')}
              </button>
              <button className="qcp-btn qcp-btn-secondary" disabled={processing} onClick={onClose}>
                {t('parties.cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AboutSection(): JSX.Element {
  const { t } = useTranslation()
  const [store, setStore] = useState<StoreSettings | null>(null)
  const [license, setLicense] = useState<LicenseStatus | null>(null)
  const [aboutTab, setAboutTab] = useState<'info' | 'remoteSupport'>('info')

  useEffect(() => {
    window.api.settings.getStore().then(setStore)
    window.api.license.getStatus().then(setLicense)
  }, [])

  const statusLabel =
    license?.status === 'active'
      ? t('settings.activeStatus')
      : license?.status === 'expired'
        ? t('settings.expiredStatus')
        : t('settings.trialStatus')

  const whatsappLink = store?.phone ? `https://wa.me/${store.phone.replace(/\D/g, '')}` : null

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0 }}>{t('app.name')}</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--qcp-ink-muted)', maxWidth: 460, fontSize: 13 }}>
            {t('settings.aboutDescription')}
          </p>
        </div>
        <span className="qcp-pill accent">Quick Cash Plus v0.1.0</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, borderBottom: '1px solid var(--qcp-border)' }}>
        <button
          className="qcp-btn"
          style={{
            background: 'transparent',
            borderBottom: aboutTab === 'info' ? '2px solid var(--qcp-accent)' : '2px solid transparent',
            borderRadius: 0,
            fontWeight: aboutTab === 'info' ? 800 : 500
          }}
          onClick={() => setAboutTab('info')}
        >
          ℹ️ {t('settings.aboutTabInfo')}
        </button>
        <button
          className="qcp-btn"
          style={{
            background: 'transparent',
            borderBottom: aboutTab === 'remoteSupport' ? '2px solid var(--qcp-accent)' : '2px solid transparent',
            borderRadius: 0,
            fontWeight: aboutTab === 'remoteSupport' ? 800 : 500
          }}
          onClick={() => setAboutTab('remoteSupport')}
        >
          🖥️ {t('settings.aboutTabRemoteSupport')}
        </button>
      </div>

      {aboutTab === 'remoteSupport' && <RemoteSupportTab />}

      {aboutTab === 'info' && (
        <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <a
          className="qcp-card"
          href={whatsappLink ?? undefined}
          target="_blank"
          rel="noreferrer"
          style={{
            textDecoration: 'none',
            color: 'white',
            background: 'linear-gradient(135deg, #059669, #10B981)',
            opacity: whatsappLink ? 1 : 0.6,
            pointerEvents: whatsappLink ? 'auto' : 'none'
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>💬 {t('settings.aboutDirectContact')}</div>
          <div style={{ fontSize: 12 }}>{t('settings.aboutDirectContactHint')}</div>
        </a>
        <a
          className="qcp-card"
          href={store?.website ?? undefined}
          target="_blank"
          rel="noreferrer"
          style={{
            textDecoration: 'none',
            color: 'white',
            background: 'var(--qcp-gradient)',
            opacity: store?.website ? 1 : 0.6,
            pointerEvents: store?.website ? 'auto' : 'none'
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>🌐 {t('settings.aboutOfficialWebsite')}</div>
          <div style={{ fontSize: 12 }}>{t('settings.aboutOfficialWebsiteHint')}</div>
        </a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div className="qcp-card">
          <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)' }}>{t('settings.aboutContactNumber')}</div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{store?.phone || '—'}</div>
        </div>
        <div className="qcp-card">
          <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)' }}>{t('settings.aboutDeveloperName')}</div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Quick Cash Plus</div>
        </div>
        <div className="qcp-card">
          <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)' }}>{t('settings.aboutSubscriptionStatus')}</div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{statusLabel}</div>
          {license?.status !== 'active' && license?.daysRemaining != null && (
            <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-muted)' }}>
              {license.daysRemaining} {t('settings.daysRemaining')}
            </div>
          )}
          {license?.status === 'active' && license.expiresAt && (
            <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-muted)' }}>
              {t('settings.expiresOn')} {license.expiresAt}
            </div>
          )}
        </div>
      </div>

      <div className="qcp-card">
        <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 13 }}>{t('settings.aboutQuickInfo')}</div>
        <p style={{ fontSize: 12.5, color: 'var(--qcp-ink-muted)', margin: 0, lineHeight: 1.7 }}>
          {t('settings.aboutQuickInfoText')}
        </p>
      </div>
        </>
      )}
    </>
  )
}

function RemoteSupportTab(): JSX.Element {
  const { t } = useTranslation()
  const [message, setMessage] = useState<string | null>(null)
  const [loadingApp, setLoadingApp] = useState<'anydesk' | 'teamviewer' | null>(null)

  async function openApp(appName: 'anydesk' | 'teamviewer'): Promise<void> {
    setMessage(null)
    setLoadingApp(appName)
    try {
      const result = await window.api.system.openRemoteSupportApp(appName)
      if (!result.ok) setMessage(result.error ?? t('settings.remoteSupportAppNotInstalled') ?? '')
    } finally {
      setLoadingApp(null)
    }
  }

  return (
    <div className="qcp-card">
      <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 14 }}>{t('settings.remoteSupportTitle')}</div>
      <p style={{ fontSize: 12.5, color: 'var(--qcp-ink-muted)', margin: '0 0 16px', lineHeight: 1.7 }}>
        {t('settings.remoteSupportHint')}
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          className="qcp-btn qcp-btn-primary"
          style={{ flex: 1 }}
          disabled={loadingApp !== null}
          onClick={() => openApp('anydesk')}
        >
          🖥️ {t('settings.openAnyDesk')}
        </button>
        <button
          className="qcp-btn qcp-btn-primary"
          style={{ flex: 1 }}
          disabled={loadingApp !== null}
          onClick={() => openApp('teamviewer')}
        >
          🖥️ {t('settings.openTeamViewer')}
        </button>
      </div>
      {message && (
        <div className="qcp-pill critical" style={{ marginTop: 14 }}>
          {message}
        </div>
      )}
    </div>
  )
}
