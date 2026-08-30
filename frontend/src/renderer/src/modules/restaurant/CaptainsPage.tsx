import { useEffect, useState } from 'react'
import type { Captain } from '../../../../shared/types'

export function CaptainsPage(): JSX.Element {
  const [captains, setCaptains] = useState<Captain[]>([])
  const [form, setForm] = useState({ name: '', phone: '' })

  function refresh(): void {
    window.api.settings.listCaptains(true).then(setCaptains)
  }

  useEffect(refresh, [])

  async function addCaptain(): Promise<void> {
    if (!form.name.trim()) return
    await window.api.settings.upsertCaptain({ name: form.name, phone: form.phone, active: true })
    setForm({ name: '', phone: '' })
    refresh()
  }

  async function toggleActive(captain: Captain): Promise<void> {
    await window.api.settings.upsertCaptain({ id: captain.id, name: captain.name, phone: captain.phone ?? '', active: !captain.active })
    refresh()
  }

  async function remove(captain: Captain): Promise<void> {
    if (!window.confirm(`حذف الكابتن "${captain.name}"؟`)) return
    await window.api.settings.deleteCaptain(captain.id)
    refresh()
  }

  return (
    <div>
      <div className="qcp-page-header">
        <h1>الكباتن</h1>
      </div>

      <div className="qcp-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="qcp-input"
            placeholder="اسم الكابتن"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="qcp-input"
            placeholder="الهاتف (اختياري)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <button type="button" className="qcp-btn qcp-btn-primary" onClick={addCaptain}>
            + إضافة كابتن
          </button>
        </div>
      </div>

      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الهاتف</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {captains.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.phone ?? '—'}</td>
                <td>
                  <span className={`qcp-pill ${c.active ? 'accent' : ''}`}>{c.active ? 'نشط' : 'معطّل'}</span>
                </td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="qcp-btn qcp-btn-secondary" style={{ padding: '4px 10px' }} onClick={() => toggleActive(c)}>
                    {c.active ? 'تعطيل' : 'تفعيل'}
                  </button>
                  <button className="qcp-btn qcp-btn-secondary" style={{ padding: '4px 10px', color: 'var(--qcp-critical)' }} onClick={() => remove(c)}>
                    🗑️ حذف
                  </button>
                </td>
              </tr>
            ))}
            {!captains.length && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--qcp-ink-faint)' }}>
                  مفيش كباتن مضافين لسه
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
