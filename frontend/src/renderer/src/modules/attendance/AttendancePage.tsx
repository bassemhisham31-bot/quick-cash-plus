import { useEffect, useState } from 'react'
import { alertDialog } from '../../components/ConfirmDialogHost'
import { PayrollTab } from './PayrollTab'
import type {
  AttendanceDayRow,
  AttendanceDeviceUser,
  AttendanceDeviceType,
  AttendanceEmployeeLink,
  AttendanceSettings,
  ReportResult
} from '../../../../shared/types'

type Tab = 'report' | 'payroll' | 'setup'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function AttendancePage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('report')
  return (
    <div>
      <div className="qcp-page-header">
        <h1>الحضور والانصراف</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`qcp-btn ${tab === 'report' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`} onClick={() => setTab('report')}>
            📋 التقرير
          </button>
          <button className={`qcp-btn ${tab === 'payroll' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`} onClick={() => setTab('payroll')}>
            💰 المرتبات والخصومات
          </button>
          <button className={`qcp-btn ${tab === 'setup' ? 'qcp-btn-primary' : 'qcp-btn-secondary'}`} onClick={() => setTab('setup')}>
            ⚙️ ماكينة البصمة وربط الموظفين
          </button>
        </div>
      </div>
      {tab === 'report' ? <ReportTab /> : tab === 'payroll' ? <PayrollTab /> : <SetupTab />}
    </div>
  )
}

function ReportTab(): JSX.Element {
  const [from, setFrom] = useState(todayIso())
  const [to, setTo] = useState(todayIso())
  const [rows, setRows] = useState<AttendanceDayRow[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load(): Promise<void> {
    setRows(await window.api.attendance.report(from, to))
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  async function sync(): Promise<void> {
    setBusy(true)
    setMsg(null)
    const res = await window.api.attendance.sync()
    setBusy(false)
    setMsg(res.ok ? `تمت المزامنة: ${res.fetched} بصمة على الماكينة، ${res.added} جديدة` : (res.error ?? 'فشلت المزامنة'))
    if (res.ok) await load()
  }

  async function exportAs(format: 'excel' | 'pdf'): Promise<void> {
    const report: ReportResult = {
      title: `تقرير الحضور والانصراف من ${from} إلى ${to}`,
      columns: [
        { key: 'day', label: 'اليوم' },
        { key: 'name', label: 'الموظف' },
        { key: 'in', label: 'الحضور' },
        { key: 'out', label: 'الانصراف' },
        { key: 'hours', label: 'ساعات العمل', format: 'number' },
        { key: 'punches', label: 'عدد البصمات', format: 'number' }
      ],
      rows: rows.map((r) => ({
        day: r.day,
        name: r.employeeName,
        in: r.firstIn,
        out: r.lastOut ?? '—',
        hours: r.hours ?? 0,
        punches: r.punches
      }))
    }
    const res = format === 'pdf' ? await window.api.reports.exportPdf(report) : await window.api.reports.exportExcel(report)
    if (res.canceled) return
    setMsg(res.ok ? `تم الحفظ في: ${res.filePath}` : (res.error ?? 'حدث خطأ'))
  }

  return (
    <div>
      <div className="qcp-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <label>من</label>
        <input className="qcp-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label>إلى</label>
        <input className="qcp-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="qcp-btn qcp-btn-primary" onClick={sync} disabled={busy}>
          {busy ? 'جاري السحب من الماكينة…' : '🔄 سحب البصمات من الماكينة'}
        </button>
        <button className="qcp-btn qcp-btn-secondary" onClick={() => exportAs('excel')} disabled={!rows.length}>
          📊 Excel
        </button>
        <button className="qcp-btn qcp-btn-secondary" onClick={() => exportAs('pdf')} disabled={!rows.length}>
          📄 PDF
        </button>
      </div>
      {msg && (
        <div className="qcp-pill accent" style={{ marginBottom: 12 }}>
          {msg}
        </div>
      )}
      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>اليوم</th>
              <th>الموظف</th>
              <th>الحضور</th>
              <th>الانصراف</th>
              <th>ساعات العمل</th>
              <th>عدد البصمات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.day}|${r.deviceUserId}`}>
                <td>{r.day}</td>
                <td>{r.employeeName}</td>
                <td>{r.firstIn}</td>
                <td>{r.lastOut ?? '—'}</td>
                <td>{r.hours != null ? r.hours : '—'}</td>
                <td title={r.punchTimes.join(' • ')}>{r.punches}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', opacity: 0.6 }}>
                  مفيش بصمات في الفترة دي — اضغط "سحب البصمات من الماكينة"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SetupTab(): JSX.Element {
  const [devType, setDevType] = useState<AttendanceDeviceType>('hikvision')
  const [devUser, setDevUser] = useState('admin')
  const [devPass, setDevPass] = useState('')
  const [useHttps, setUseHttps] = useState(false)
  const [ip, setIp] = useState('')
  const [port, setPort] = useState('80')
  const [auto, setAuto] = useState('0')
  const [settings, setSettings] = useState<AttendanceSettings | null>(null)
  const [employees, setEmployees] = useState<AttendanceEmployeeLink[]>([])
  const [deviceUsers, setDeviceUsers] = useState<AttendanceDeviceUser[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  async function load(): Promise<void> {
    const s = await window.api.attendance.getSettings()
    setSettings(s)
    setDevType(s.deviceType)
    setDevUser(s.deviceUser)
    setDevPass(s.devicePassword)
    setUseHttps(s.useHttps)
    setIp(s.deviceIp)
    setPort(String(s.devicePort))
    setAuto(String(s.autoSyncMinutes))
    setEmployees(await window.api.attendance.employees())
  }
  useEffect(() => {
    load()
  }, [])

  async function save(): Promise<void> {
    await window.api.attendance.saveSettings({
      deviceType: devType,
      deviceIp: ip,
      devicePort: Number(port) || (devType === 'zkteco' ? 4370 : useHttps ? 443 : 80),
      deviceUser: devUser,
      devicePassword: devPass,
      useHttps,
      autoSyncMinutes: Number(auto) || 0
    })
    setMsg('تم الحفظ')
    await load()
  }

  async function test(): Promise<void> {
    await save()
    setMsg('جاري الاتصال…')
    const r = await window.api.attendance.test()
    setMsg(r.ok ? `✅ الاتصال تمام — ${r.info}` : `❌ ${r.error}`)
  }

  async function fetchUsers(): Promise<void> {
    try {
      setDeviceUsers(await window.api.attendance.deviceUsers())
      setMsg(null)
    } catch (e: any) {
      await alertDialog(e?.message ?? 'تعذر قراءة المستخدمين من الماكينة')
    }
  }

  async function link(employeeId: number, value: string): Promise<void> {
    await window.api.attendance.linkEmployee(employeeId, value || null)
    setEmployees(await window.api.attendance.employees())
  }

  return (
    <div>
      <div className="qcp-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <label>نوع الماكينة</label>
        <select
          className="qcp-select"
          value={devType}
          onChange={(e) => {
            const t = e.target.value as AttendanceDeviceType
            setDevType(t)
            setPort(t === 'zkteco' ? '4370' : useHttps ? '443' : '80')
          }}
        >
          <option value="hikvision">Hikvision (DS-K1A8503MF وغيرها)</option>
          <option value="zkteco">ZKTeco</option>
        </select>
        {devType === 'hikvision' && (
          <>
            <label>المستخدم</label>
            <input className="qcp-input" style={{ width: 110 }} value={devUser} onChange={(e) => setDevUser(e.target.value)} />
            <label>الباسورد</label>
            <input className="qcp-input" style={{ width: 140 }} type="password" value={devPass} onChange={(e) => setDevPass(e.target.value)} />
            <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={useHttps}
                onChange={(e) => {
                  setUseHttps(e.target.checked)
                  setPort(e.target.checked ? '443' : '80')
                }}
              />
              HTTPS
            </label>
          </>
        )}
        <label>IP الماكينة</label>
        <input className="qcp-input" style={{ width: 160 }} placeholder="192.168.1.201" value={ip} onChange={(e) => setIp(e.target.value)} />
        <label>البورت</label>
        <input className="qcp-input" style={{ width: 90 }} value={port} onChange={(e) => setPort(e.target.value)} />
        <label>سحب تلقائي كل (دقيقة، 0 = يدوي)</label>
        <input className="qcp-input" style={{ width: 90 }} value={auto} onChange={(e) => setAuto(e.target.value)} />
        <button className="qcp-btn qcp-btn-primary" onClick={save}>
          حفظ
        </button>
        <button className="qcp-btn qcp-btn-secondary" onClick={test}>
          🔌 اختبار الاتصال
        </button>
        <button className="qcp-btn qcp-btn-secondary" onClick={fetchUsers}>
          👥 قراءة أسماء الماكينة
        </button>
      </div>
      {settings?.lastSyncAt && <p style={{ opacity: 0.7 }}>آخر سحب: {settings.lastSyncAt}</p>}
      {settings?.lastSyncError && <p style={{ color: 'var(--qcp-danger, #c0392b)' }}>آخر خطأ: {settings.lastSyncError}</p>}
      {msg && (
        <div className="qcp-pill accent" style={{ marginBottom: 12 }}>
          {msg}
        </div>
      )}

      <h3>ربط الموظفين برقمهم على الماكينة</h3>
      <div className="qcp-table-wrap">
        <table className="qcp-table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>رقمه على الماكينة</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.employeeId}>
                <td>{e.name}</td>
                <td>
                  {deviceUsers.length ? (
                    <select className="qcp-select" value={e.deviceUserId ?? ''} onChange={(ev) => link(e.employeeId, ev.target.value)}>
                      <option value="">— غير مربوط —</option>
                      {deviceUsers.map((u) => (
                        <option key={u.deviceUserId} value={u.deviceUserId}>
                          {u.deviceUserId} {u.name ? `— ${u.name}` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="qcp-input"
                      style={{ width: 120 }}
                      defaultValue={e.deviceUserId ?? ''}
                      onBlur={(ev) => {
                        if (ev.target.value.trim() !== (e.deviceUserId ?? '')) link(e.employeeId, ev.target.value)
                      }}
                    />
                  )}
                </td>
              </tr>
            ))}
            {!employees.length && (
              <tr>
                <td colSpan={2} style={{ textAlign: 'center', opacity: 0.6 }}>
                  ضيف الموظفين الأول من شاشة المصروفات ← الموظفين
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
