import { useEffect, useState } from 'react'
import { alertDialog, confirmDialog } from '../../components/ConfirmDialogHost'
import { useAppStore } from '../../store/appStore'
import { formatCurrency as currency } from '../../lib/currency'
import type { AttendanceEmployeeLink, AttendancePayrollRow, AttendancePayrollRules, ReportResult } from '../../../../shared/types'

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthStartIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

interface EditableRow extends AttendancePayrollRow {
  selected: boolean
  deductionInput: string
  bonusInput: string
  open: boolean
}

export function PayrollTab(): JSX.Element {
  const user = useAppStore((s) => s.user)
  const [from, setFrom] = useState(monthStartIso())
  const [to, setTo] = useState(todayIso())
  const [rules, setRules] = useState<AttendancePayrollRules | null>(null)
  const [employees, setEmployees] = useState<AttendanceEmployeeLink[]>([])
  const [rows, setRows] = useState<EditableRow[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      setRules(await window.api.attendance.getPayrollRules())
      setEmployees(await window.api.attendance.employees())
    })()
  }, [])

  function setRule<K extends keyof AttendancePayrollRules>(k: K, v: AttendancePayrollRules[K]): void {
    setRules((r) => (r ? { ...r, [k]: v } : r))
  }

  async function saveRules(): Promise<void> {
    if (!rules) return
    try {
      await window.api.attendance.savePayrollRules(rules)
      setMsg('تم حفظ القواعد')
    } catch (e: any) {
      await alertDialog(e?.message ?? 'تعذر الحفظ')
    }
  }

  async function saveShift(
    e: AttendanceEmployeeLink,
    patch: Partial<Pick<AttendanceEmployeeLink, 'shiftStart' | 'shiftEnd' | 'weeklyOff'>>
  ): Promise<void> {
    const n = { ...e, ...patch }
    try {
      await window.api.attendance.saveEmployeeShift(n.employeeId, n.shiftStart, n.shiftEnd, n.weeklyOff)
      setEmployees((list) => list.map((x) => (x.employeeId === n.employeeId ? n : x)))
    } catch (err: any) {
      await alertDialog(err?.message ?? 'تعذر الحفظ')
    }
  }

  async function calculate(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      const res = await window.api.attendance.calculatePayroll(from, to)
      setRows(
        res.map((r) => ({
          ...r,
          selected: !r.alreadyApproved && (r.totalDeduction > 0 || r.overtimeBonus > 0),
          deductionInput: String(r.totalDeduction),
          bonusInput: String(r.overtimeBonus),
          open: false
        }))
      )
      if (!res.length) setMsg('مفيش موظفين مربوطين بالماكينة')
    } finally {
      setBusy(false)
    }
  }

  function patchRow(id: number, p: Partial<EditableRow>): void {
    setRows((list) => list.map((r) => (r.employeeId === id ? { ...r, ...p } : r)))
  }

  function buildNote(r: EditableRow): string {
    const parts: string[] = []
    if (r.absentDays) parts.push(`غياب ${r.absentDays} يوم`)
    if (r.lateMinutes) parts.push(`تأخير ${r.lateMinutes} د`)
    if (r.earlyMinutes) parts.push(`خروج مبكر ${r.earlyMinutes} د`)
    if (r.overtimeMinutes) parts.push(`إضافي ${r.overtimeMinutes} د`)
    return `حضور وانصراف من ${from} إلى ${to}${parts.length ? ': ' + parts.join('، ') : ''}`
  }

  async function approve(): Promise<void> {
    if (!user) return
    const items = rows
      .filter((r) => r.selected && !r.alreadyApproved)
      .map((r) => ({
        employeeId: r.employeeId,
        deduction: Number(r.deductionInput) || 0,
        bonus: Number(r.bonusInput) || 0,
        note: buildNote(r)
      }))
      .filter((i) => i.deduction > 0 || i.bonus > 0)
    if (!items.length) {
      await alertDialog('اختار موظف واحد على الأقل فيه خصم أو مكافأة')
      return
    }
    const totalDed = items.reduce((s, i) => s + i.deduction, 0)
    const totalBon = items.reduce((s, i) => s + i.bonus, 0)
    const ok = await confirmDialog(`هيتسجل في دفتر ${items.length} موظف: خصومات ${currency(totalDed)} ومكافآت ${currency(totalBon)}. تأكيد؟`)
    if (!ok) return
    const res = await window.api.attendance.approvePayroll(from, to, items, user.id)
    setMsg(`تم اعتماد ${res.approved} موظف` + (res.skipped.length ? ` — اتخطّى: ${res.skipped.join('، ')}` : ''))
    await calculate()
  }

  async function exportAs(format: 'excel' | 'pdf'): Promise<void> {
    const report: ReportResult = {
      title: `مرتبات وخصومات الحضور من ${from} إلى ${to}`,
      columns: [
        { key: 'name', label: 'الموظف' },
        { key: 'base', label: 'المرتب الأساسي', format: 'currency', align: 'end' },
        { key: 'absent', label: 'غياب (يوم)', format: 'number', align: 'end' },
        { key: 'late', label: 'تأخير (د)', format: 'number', align: 'end' },
        { key: 'early', label: 'خروج مبكر (د)', format: 'number', align: 'end' },
        { key: 'over', label: 'إضافي (د)', format: 'number', align: 'end' },
        { key: 'ded', label: 'الخصم', format: 'currency', align: 'end' },
        { key: 'bonus', label: 'المكافأة', format: 'currency', align: 'end' },
        { key: 'net', label: 'الصافي بعد الحضور', format: 'currency', align: 'end' }
      ],
      rows: rows.map((r) => {
        const ded = Number(r.deductionInput) || 0
        const bonus = Number(r.bonusInput) || 0
        return {
          name: r.name,
          base: r.baseSalary,
          absent: r.absentDays,
          late: r.lateMinutes,
          early: r.earlyMinutes,
          over: r.overtimeMinutes,
          ded,
          bonus,
          net: Math.round((r.baseSalary - ded + bonus) * 100) / 100
        }
      }),
      totals: {
        base: rows.reduce((s, r) => s + r.baseSalary, 0),
        ded: rows.reduce((s, r) => s + (Number(r.deductionInput) || 0), 0),
        bonus: rows.reduce((s, r) => s + (Number(r.bonusInput) || 0), 0),
        net: rows.reduce((s, r) => s + r.baseSalary - (Number(r.deductionInput) || 0) + (Number(r.bonusInput) || 0), 0)
      }
    }
    const res = format === 'pdf' ? await window.api.reports.exportPdf(report) : await window.api.reports.exportExcel(report)
    if (res.canceled) return
    setMsg(res.ok ? `تم الحفظ في: ${res.filePath}` : (res.error ?? 'حدث خطأ'))
  }

  const num = (v: string, fallback = 0): number => (Number.isFinite(Number(v)) ? Number(v) : fallback)

  return (
    <div>
      {rules && (
        <div className="qcp-card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>قواعد الخصم والإضافي</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <label>بداية الوردية الافتراضية</label>
            <input className="qcp-input" type="time" value={rules.defaultShiftStart} onChange={(e) => setRule('defaultShiftStart', e.target.value)} />
            <label>نهايتها</label>
            <input className="qcp-input" type="time" value={rules.defaultShiftEnd} onChange={(e) => setRule('defaultShiftEnd', e.target.value)} />
            <label>سماح (دقيقة)</label>
            <input className="qcp-input" style={{ width: 70 }} value={rules.graceMinutes} onChange={(e) => setRule('graceMinutes', num(e.target.value))} />
            <label>معامل خصم التأخير/الخروج المبكر</label>
            <input className="qcp-input" style={{ width: 70 }} value={rules.lateMultiplier} onChange={(e) => setRule('lateMultiplier', num(e.target.value))} />
            <label>معامل خصم الغياب (أيام)</label>
            <input className="qcp-input" style={{ width: 70 }} value={rules.absenceMultiplier} onChange={(e) => setRule('absenceMultiplier', num(e.target.value))} />
            <label>معامل الإضافي (0 = متعطّل)</label>
            <input className="qcp-input" style={{ width: 70 }} value={rules.overtimeMultiplier} onChange={(e) => setRule('overtimeMultiplier', num(e.target.value))} />
            <label>أقل إضافي يتحسب (دقيقة)</label>
            <input className="qcp-input" style={{ width: 70 }} value={rules.overtimeMinMinutes} onChange={(e) => setRule('overtimeMinMinutes', num(e.target.value))} />
            <label>أيام الشهر</label>
            <input className="qcp-input" style={{ width: 70 }} value={rules.monthDays} onChange={(e) => setRule('monthDays', num(e.target.value, 30))} />
            <button className="qcp-btn qcp-btn-primary" onClick={saveRules}>
              حفظ القواعد
            </button>
          </div>
          <p style={{ opacity: 0.7, fontSize: 12.5, marginBottom: 0 }}>
            سعر الساعة = المرتب الأساسي ÷ أيام الشهر ÷ ساعات الوردية. بعد دقائق السماح التأخير كله بيتحسب. الغياب = يوم من غير أي بصمة (ماعدا الإجازة الأسبوعية).
          </p>
        </div>
      )}

      <details className="qcp-card" style={{ marginBottom: 16 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>وردية كل موظف وإجازته الأسبوعية (اختياري — الفاضي = الافتراضي)</summary>
        <div className="qcp-table-wrap" style={{ marginTop: 10 }}>
          <table className="qcp-table">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>بداية الوردية</th>
                <th>نهايتها</th>
                <th>الإجازة الأسبوعية</th>
              </tr>
            </thead>
            <tbody>
              {employees
                .filter((e) => e.deviceUserId)
                .map((e) => (
                  <tr key={e.employeeId}>
                    <td>{e.name}</td>
                    <td>
                      <input className="qcp-input" type="time" value={e.shiftStart ?? ''} onChange={(ev) => saveShift(e, { shiftStart: ev.target.value || null })} />
                    </td>
                    <td>
                      <input className="qcp-input" type="time" value={e.shiftEnd ?? ''} onChange={(ev) => saveShift(e, { shiftEnd: ev.target.value || null })} />
                    </td>
                    <td>
                      <select className="qcp-select" value={e.weeklyOff} onChange={(ev) => saveShift(e, { weeklyOff: ev.target.value })}>
                        <option value="">بدون إجازة</option>
                        {WEEKDAYS.map((d, i) => (
                          <option key={i} value={String(i)}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              {!employees.some((e) => e.deviceUserId) && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', opacity: 0.6 }}>
                    اربط الموظفين برقمهم على الماكينة الأول (تبويب ماكينة البصمة)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>

      <div className="qcp-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <label>من</label>
        <input className="qcp-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label>إلى</label>
        <input className="qcp-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="qcp-btn qcp-btn-primary" onClick={calculate} disabled={busy}>
          🧮 احسب من البصمات
        </button>
        {rows.length > 0 && (
          <>
            <button className="qcp-btn qcp-btn-secondary" onClick={approve}>
              ✅ اعتماد المحدد وتسجيله في دفتر الموظفين
            </button>
            <button className="qcp-btn qcp-btn-secondary" onClick={() => exportAs('excel')}>
              📊 Excel
            </button>
            <button className="qcp-btn qcp-btn-secondary" onClick={() => exportAs('pdf')}>
              📄 PDF
            </button>
          </>
        )}
      </div>
      <p style={{ opacity: 0.7, fontSize: 12.5 }}>اسحب البصمات من الماكينة الأول (تبويب التقرير) عشان الحساب يكون محدّث.</p>
      {msg && (
        <div className="qcp-pill accent" style={{ marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {rows.length > 0 && (
        <div className="qcp-table-wrap">
          <table className="qcp-table">
            <thead>
              <tr>
                <th></th>
                <th>الموظف</th>
                <th>غياب (يوم)</th>
                <th>تأخير (د)</th>
                <th>خروج مبكر (د)</th>
                <th>إضافي (د)</th>
                <th>الخصم</th>
                <th>المكافأة</th>
                <th>تفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((r) => [
                <tr key={r.employeeId} style={r.alreadyApproved ? { opacity: 0.55 } : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.selected}
                      disabled={r.alreadyApproved}
                      onChange={(e) => patchRow(r.employeeId, { selected: e.target.checked })}
                    />
                  </td>
                  <td>
                    {r.name}
                    {r.alreadyApproved && (
                      <span className="qcp-pill" style={{ marginInlineStart: 6 }}>
                        معتمد قبل كده
                      </span>
                    )}
                    {r.incompleteDays > 0 && (
                      <span
                        className="qcp-pill"
                        style={{ marginInlineStart: 6 }}
                        title="أيام فيها بصمة واحدة بس — الخروج المبكر والإضافي ما اتحسبوش"
                      >
                        ⚠ {r.incompleteDays} بصمة ناقصة
                      </span>
                    )}
                  </td>
                  <td>{r.absentDays}</td>
                  <td>{r.lateMinutes}</td>
                  <td>{r.earlyMinutes}</td>
                  <td>{r.overtimeMinutes}</td>
                  <td>
                    <input
                      className="qcp-input"
                      style={{ width: 90 }}
                      type="number"
                      disabled={r.alreadyApproved}
                      value={r.deductionInput}
                      onChange={(e) => patchRow(r.employeeId, { deductionInput: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="qcp-input"
                      style={{ width: 90 }}
                      type="number"
                      disabled={r.alreadyApproved}
                      value={r.bonusInput}
                      onChange={(e) => patchRow(r.employeeId, { bonusInput: e.target.value })}
                    />
                  </td>
                  <td>
                    <button className="qcp-btn qcp-btn-secondary" style={{ padding: '2px 8px' }} onClick={() => patchRow(r.employeeId, { open: !r.open })}>
                      {r.open ? 'إخفاء' : 'عرض'}
                    </button>
                  </td>
                </tr>,
                r.open && (
                  <tr key={`${r.employeeId}-d`}>
                    <td colSpan={9}>
                      <div style={{ fontSize: 12.5, lineHeight: 1.9 }}>
                        <div style={{ opacity: 0.7 }}>
                          المرتب الأساسي {currency(r.baseSalary)} — خصم التأخير {currency(r.lateDeduction)} · الخروج المبكر {currency(r.earlyDeduction)} · الغياب{' '}
                          {currency(r.absenceDeduction)}
                        </div>
                        {r.days
                          .filter((d) => d.kind === 'absent' || d.lateMinutes || d.earlyMinutes || d.overtimeMinutes || d.incomplete)
                          .map((d) => (
                            <div key={d.day}>
                              {d.day} —{' '}
                              {d.kind === 'absent'
                                ? 'غياب'
                                : [
                                    `حضور ${d.firstIn}`,
                                    d.lastOut ? `انصراف ${d.lastOut}` : 'بصمة واحدة بس',
                                    d.lateMinutes ? `تأخير ${d.lateMinutes} د` : '',
                                    d.earlyMinutes ? `خروج مبكر ${d.earlyMinutes} د` : '',
                                    d.overtimeMinutes ? `إضافي ${d.overtimeMinutes} د` : ''
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </div>
                          ))}
                      </div>
                    </td>
                  </tr>
                )
              ])}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
