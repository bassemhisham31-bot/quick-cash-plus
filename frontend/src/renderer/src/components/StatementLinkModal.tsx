import { useEffect, useState } from 'react'
import { alertDialog, confirmDialog } from './ConfirmDialogHost'
import type { StatementLinkInfo } from '../../../shared/types'

interface Props {
  customer: { id: number; name: string; phone: string | null }
  onClose: () => void
}

/** رقم موبايل مصري → صيغة دولية لـwa.me (01012345678 → 201012345678) */
function toIntlPhone(phone: string): string {
  const d = (phone ?? '').replace(/\D/g, '')
  if (d.startsWith('00')) return d.slice(2)
  if (d.startsWith('0')) return '2' + d
  return d
}

/**
 * رابط كشف حساب العميل: العميل يفتحه من موبايله ويشوف رصيده وحركاته (قراءة فقط، من غير تسجيل دخول).
 * من هنا: تفعيل الرابط، إرسال على واتساب، نسخ، تجديد (القديم يبطل)، أو إلغاء.
 */
export function StatementLinkModal({ customer, onClose }: Props): JSX.Element {
  const [info, setInfo] = useState<StatementLinkInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    window.api.customers.getStatementLink(customer.id).then(setInfo).catch(() => setInfo({ enabled: false, url: null, createdAt: null, lastViewedAt: null, views: 0 }))
  }, [customer.id])

  async function run(label: string, fn: () => Promise<void>): Promise<void> {
    setBusy(label)
    try {
      await fn()
    } catch (e: any) {
      await alertDialog(e?.message ?? 'حصل خطأ')
    } finally {
      setBusy(null)
    }
  }

  const enable = (): Promise<void> => run('enable', async () => setInfo(await window.api.customers.createStatementLink(customer.id)))

  const sendWhatsApp = (): Promise<void> =>
    run('send', async () => {
      const r = await window.api.customers.sendStatementLinkWhatsApp(customer.id)
      if (r.ok) {
        setInfo(await window.api.customers.getStatementLink(customer.id))
        await alertDialog(`✅ الرابط اتبعت على واتساب (${customer.phone ?? ''})`)
      } else {
        await alertDialog(r.error ?? 'تعذر إرسال الرابط')
      }
    })

  async function copy(): Promise<void> {
    if (!info?.url) return
    try {
      await navigator.clipboard.writeText(info.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      await alertDialog('تعذر النسخ تلقائيًا — اضغط على الرابط واختاره ثم انسخه يدويًا')
    }
  }

  const renew = (): Promise<void> =>
    run('renew', async () => {
      if (!(await confirmDialog('تجديد الرابط هيعمل رابط جديد، والرابط القديم (لو اتبعت قبل كده) هيبطل فورًا. تكمل؟', { confirmLabel: 'جدّد الرابط' }))) return
      setInfo(await window.api.customers.createStatementLink(customer.id, true))
    })

  const revoke = (): Promise<void> =>
    run('revoke', async () => {
      if (!(await confirmDialog('إلغاء الرابط هيوقّفه فورًا — العميل مش هيقدر يفتح كشف حسابه من الرابط اللي معاه. تكمل؟', { confirmLabel: 'إلغاء الرابط', danger: true }))) return
      await window.api.customers.revokeStatementLink(customer.id)
      setInfo(await window.api.customers.getStatementLink(customer.id))
    })

  const waManual =
    info?.url && customer.phone
      ? `https://wa.me/${toIntlPhone(customer.phone)}?text=${encodeURIComponent(`كشف حساب ${customer.name}\n${info.url}`)}`
      : null

  return (
    <div className="qcp-modal-backdrop" onClick={onClose}>
      <div className="qcp-modal" style={{ width: 'min(560px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>🔗 رابط كشف الحساب</h2>
          <span style={{ fontWeight: 700 }}>{customer.name}</span>
        </div>
        <p style={{ margin: '4px 0 12px', fontSize: 13, color: 'var(--qcp-text-muted)' }}>
          العميل بيفتح الرابط من موبايله ويشوف رصيده وحركاته (قراءة فقط ومن غير تسجيل دخول). الكشف بيتحدّث لوحده مع كل حركة جديدة.
        </p>

        {!info ? (
          <div style={{ padding: 16, textAlign: 'center' }}>جاري التحميل...</div>
        ) : !info.enabled ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="qcp-btn qcp-btn-primary" disabled={!!busy} onClick={enable}>
              {busy === 'enable' ? '...' : 'تفعيل الرابط'}
            </button>
            <button
              type="button"
              className="qcp-btn qcp-btn-secondary"
              disabled={!!busy || !customer.phone}
              title={customer.phone ? '' : 'العميل مالوش رقم موبايل'}
              onClick={sendWhatsApp}
            >
              {busy === 'send' ? '...جاري الإرسال' : '🟢 تفعيل وإرسال على واتساب'}
            </button>
          </div>
        ) : (
          <>
            <input
              className="qcp-input"
              readOnly
              value={info.url ?? ''}
              onFocus={(e) => e.currentTarget.select()}
              style={{ width: '100%', direction: 'ltr', fontSize: 12.5 }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <button
                type="button"
                className="qcp-btn qcp-btn-primary"
                disabled={!!busy || !customer.phone}
                title={customer.phone ? '' : 'العميل مالوش رقم موبايل'}
                onClick={sendWhatsApp}
              >
                {busy === 'send' ? '...جاري الإرسال' : '🟢 إرسال على واتساب'}
              </button>
              <button type="button" className="qcp-btn qcp-btn-secondary" onClick={copy}>
                {copied ? '✅ اتنسخ' : '📋 نسخ الرابط'}
              </button>
              <a className="qcp-btn qcp-btn-secondary" href={info.url ?? '#'} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                👁 فتح الكشف
              </a>
              {waManual && (
                <a className="qcp-btn qcp-btn-secondary" href={waManual} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }} title="لو واتساب المحل مش مربوط من الإعدادات">
                  📱 فتح واتساب بالرسالة
                </a>
              )}
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--qcp-text-muted)' }}>
              {info.views > 0 ? `العميل فتح الرابط ${info.views} مرة — آخر فتح: ${info.lastViewedAt ?? ''} (UTC)` : 'العميل لسه ما فتحش الرابط'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--qcp-border)' }}>
              <button type="button" className="qcp-btn qcp-btn-secondary" disabled={!!busy} onClick={renew}>
                🔄 تجديد الرابط
              </button>
              <button type="button" className="qcp-btn qcp-btn-danger" disabled={!!busy} onClick={revoke}>
                ⛔ إلغاء الرابط
              </button>
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="qcp-btn qcp-btn-secondary" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  )
}
