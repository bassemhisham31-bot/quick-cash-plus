import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'

/**
 * بديل window.confirm / window.alert جوه البرنامج نفسه.
 * رسايل ويندوز الأصلية (confirm/alert) في Electron على ويندوز بتسيب الصفحة في حالة غريبة: بعد ما تتقفل،
 * خانات الكتابة بتبطل تستقبل الكيبورد لحد ما المستخدم يخرج من البرنامج ويرجعله. عشان كده ممنوع نستخدمها.
 */

interface DialogRequest {
  message: string
  id?: number
  kind: 'confirm' | 'alert' | 'approval'
  /** approval: وصف العملية اللي هيتسجل في سجل النشاط + مين طلبها */
  detail?: string
  requestedBy?: string | null
  confirmLabel: string
  danger: boolean
  resolve: (ok: boolean) => void
}

const useDialogStore = create<{ current: DialogRequest | null; queue: DialogRequest[] }>(() => ({ current: null, queue: [] }))

let nextId = 1

function enqueue(req: DialogRequest): void {
  req.id = nextId++
  useDialogStore.setState((s) => (s.current ? { queue: [...s.queue, req] } : { current: req }))
}

function finish(ok: boolean): void {
  const { current, queue } = useDialogStore.getState()
  if (!current) return
  useDialogStore.setState({ current: queue[0] ?? null, queue: queue.slice(1) })
  current.resolve(ok)
}

export function confirmDialog(message: string, opts: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) =>
    enqueue({ message, kind: 'confirm', confirmLabel: opts.confirmLabel ?? 'تأكيد', danger: opts.danger ?? false, resolve })
  )
}

export function alertDialog(message: string): Promise<void> {
  return new Promise((resolve) =>
    enqueue({ message, kind: 'alert', confirmLabel: 'تمام', danger: false, resolve: () => resolve() })
  )
}

/**
 * موافقة مشرف: نافذة بتطلب باسورد الأدمن (أو مستخدم عنده صلاحية الحذف) — بتتقفل بـtrue بس لو الباسورد صح.
 */
export function requestSupervisorApproval(message: string, detail: string, requestedBy: string | null): Promise<boolean> {
  return new Promise((resolve) =>
    enqueue({ message, kind: 'approval', detail, requestedBy, confirmLabel: 'موافقة', danger: true, resolve })
  )
}

function ApprovalBody({ current }: { current: DialogRequest }): JSX.Element {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function submit(): Promise<void> {
    if (checking) return
    setChecking(true)
    setError(null)
    try {
      const r = await window.api.auth.approveWithSupervisorPassword(password, current.detail ?? '', current.requestedBy ?? null)
      if (r.ok) finish(true)
      else {
        setError(r.error ?? 'الباسورد غلط')
        setPassword('')
        inputRef.current?.focus()
      }
    } finally {
      setChecking(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>🔒 محتاج موافقة الأدمن</div>
      <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 12, color: 'var(--qcp-ink-muted)' }}>{current.message}</div>
      <input
        ref={inputRef}
        className="qcp-input"
        type="password"
        style={{ width: '100%', fontSize: 16 }}
        placeholder="باسورد الأدمن"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && (
        <div className="rst-error" style={{ marginTop: 8 }}>
          ⚠️ {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button
          type="submit"
          className="qcp-btn qcp-btn-primary"
          style={{ flex: 1, background: 'var(--qcp-critical)', borderColor: 'var(--qcp-critical)' }}
          disabled={checking || !password}
        >
          {checking ? '...' : '🔓 موافقة وحذف'}
        </button>
        <button type="button" className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={() => finish(false)}>
          إلغاء
        </button>
      </div>
    </form>
  )
}

export function ConfirmDialogHost(): JSX.Element | null {
  const current = useDialogStore((s) => s.current)
  const okRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!current) return
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body) returnFocus.current = active
    if (current.kind !== 'approval') okRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        finish(current.kind === 'alert')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      // الفوكس يرجع للخانة اللي كان المستخدم فيها (لو لسه موجودة في الصفحة)
      const el = returnFocus.current
      returnFocus.current = null
      if (el && el.isConnected) setTimeout(() => el.focus(), 0)
    }
  }, [current])

  if (!current) return null

  return (
    <div className="qcp-modal-backdrop" style={{ zIndex: 1000 }} onClick={() => finish(current.kind === 'alert')}>
      <div className="qcp-modal" style={{ width: 'min(420px, 92vw)' }} onClick={(e) => e.stopPropagation()} role="alertdialog">
        {current.kind === 'approval' ? (
          <ApprovalBody key={current.id} current={current} />
        ) : (
          <>
        <div style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 18 }}>{current.message}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            ref={okRef}
            type="button"
            className="qcp-btn qcp-btn-primary"
            style={{ flex: 1, ...(current.danger ? { background: 'var(--qcp-critical)', borderColor: 'var(--qcp-critical)' } : {}) }}
            onClick={() => finish(true)}
          >
            {current.confirmLabel}
          </button>
          {current.kind === 'confirm' && (
            <button type="button" className="qcp-btn qcp-btn-secondary" style={{ flex: 1 }} onClick={() => finish(false)}>
              إلغاء
            </button>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  )
}
