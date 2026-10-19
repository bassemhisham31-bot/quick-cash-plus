import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'

type Status = { status: string; daysRemaining: number | null; graceDaysLeft?: number }

/**
 * شريط تحذير الاشتراك (نسخة الويب): بيظهر قبل الانتهاء بـ7 أيام، وأثناء فترة السماح بعد الانتهاء.
 * الحالة بتيجي من license:getStatus (السيرفر بيضيف graceDaysLeft أثناء السماح).
 */
export function WebLicenseBanner(): JSX.Element | null {
  const user = useAppStore((s) => s.user)
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const load = (): void => {
      window.api.license
        .getStatus()
        .then((s) => {
          if (!cancelled) setStatus(s as unknown as Status)
        })
        .catch(() => undefined)
    }
    load()
    const id = setInterval(load, 30 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [user])

  if (!user || !status) return null

  let text: string | null = null
  let danger = false
  if (status.graceDaysLeft != null) {
    danger = true
    text = `انتهى الاشتراك — البرنامج هيتوقف خلال ${status.graceDaysLeft} يوم لو ما اتجددش. تواصل مع مزوّد الخدمة للتجديد.`
  } else if ((status.status === 'active' || status.status === 'trial') && status.daysRemaining != null && status.daysRemaining <= 7) {
    text =
      status.status === 'trial'
        ? `فترة التجربة بتنتهي خلال ${status.daysRemaining} يوم — تواصل مع مزوّد الخدمة للاشتراك.`
        : `الاشتراك بينتهي خلال ${status.daysRemaining} يوم — تواصل مع مزوّد الخدمة للتجديد.`
  }
  if (!text) return null

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 0,
        insetInline: 0,
        zIndex: 9999,
        padding: '6px 12px',
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 600,
        color: danger ? '#fff' : '#3b2f00',
        background: danger ? '#c62828' : '#ffd54f'
      }}
    >
      {text}
    </div>
  )
}
