import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import type { AssistantChatMessage, AssistantSettings } from '../../../shared/types'

const BTN_SIZE = 54
const POS_STORAGE_KEY = 'qcp_assistant_btn_pos'

function clampPos(p: { x: number; y: number }): { x: number; y: number } {
  const maxX = Math.max(window.innerWidth - BTN_SIZE, 0)
  const maxY = Math.max(window.innerHeight - BTN_SIZE, 0)
  return { x: Math.min(Math.max(p.x, 0), maxX), y: Math.min(Math.max(p.y, 0), maxY) }
}

function loadPos(): { x: number; y: number } {
  try {
    const saved = localStorage.getItem(POS_STORAGE_KEY)
    if (saved) return clampPos(JSON.parse(saved))
  } catch {
    // تجاهل أي مشكلة قراءة/تحليل وارجع للموضع الافتراضي
  }
  return clampPos({ x: 24, y: window.innerHeight - BTN_SIZE - 24 })
}

export function AssistantFloatingButton(): JSX.Element | null {
  const { t } = useTranslation()
  const user = useAppStore((s) => s.user)
  const dataVersion = useAppStore((s) => s.dataVersion)
  const [settings, setSettings] = useState<AssistantSettings | null>(null)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AssistantChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pos, setPos] = useState(loadPos)
  const [dragging, setDragging] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const posRef = useRef(pos)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  useEffect(() => {
    posRef.current = pos
  }, [pos])

  useEffect(() => {
    function onResize(): void {
      setPos((p) => clampPos(p))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    window.api.settings.getAssistant().then(setSettings)
  }, [dataVersion])

  useEffect(() => {
    if (open && user) window.api.assistant.getHistory(user.id).then(setMessages)
  }, [open, user])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, sending])

  const allowed =
    !!settings &&
    settings.enabled &&
    settings.floatingButtonEnabled &&
    !!user &&
    (settings.allowedUserIds.length === 0 || settings.allowedUserIds.includes(user.id))

  if (!allowed || !user) return null
  const userId = user.id

  async function handleClear(): Promise<void> {
    if (!window.confirm(t('assistantChat.clearConfirm') ?? '')) return
    await window.api.assistant.clearHistory(userId)
    setMessages([])
    setError(null)
  }

  async function handleSend(): Promise<void> {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setError(null)
    setMessages((prev) => [...prev, { id: -Date.now(), role: 'user', content: text, createdAt: new Date().toISOString() }])
    setSending(true)
    try {
      const result = await window.api.assistant.sendMessage(userId, text)
      if (result.ok) {
        setMessages(await window.api.assistant.getHistory(userId))
      } else {
        setError(result.error ?? 'تعذر الوصول للمساعد الذكي')
      }
    } finally {
      setSending(false)
    }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>): void {
    draggingRef.current = true
    movedRef.current = false
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>): void {
    if (!draggingRef.current) return
    const next = clampPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y })
    if (Math.abs(next.x - posRef.current.x) > 3 || Math.abs(next.y - posRef.current.y) > 3) movedRef.current = true
    setPos(next)
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLButtonElement>): void {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
    try {
      localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(posRef.current))
    } catch {
      // تجاهل لو التخزين المحلي مش متاح
    }
  }

  function handleButtonClick(): void {
    if (movedRef.current) {
      movedRef.current = false
      return
    }
    setOpen((v) => !v)
  }

  const panelWidth = Math.min(340, window.innerWidth * 0.9)
  const panelHeight = Math.min(460, window.innerHeight * 0.7)
  const spaceBelow = window.innerHeight - (pos.y + BTN_SIZE)
  const panelTop =
    spaceBelow >= panelHeight + 10 || spaceBelow >= pos.y
      ? Math.min(pos.y + BTN_SIZE + 10, window.innerHeight - panelHeight - 10)
      : Math.max(10, pos.y - panelHeight - 10)
  const panelLeft = Math.min(Math.max(pos.x, 10), Math.max(window.innerWidth - panelWidth - 10, 10))

  return (
    <>
      {open && (
        <div
          className="qcp-card"
          style={{
            position: 'fixed',
            top: panelTop,
            left: panelLeft,
            width: panelWidth,
            maxWidth: '90vw',
            height: panelHeight,
            maxHeight: '70vh',
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            zIndex: 40,
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)'
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--qcp-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>🤖 {t('assistantChat.title')}</div>
              <div style={{ fontSize: 10.5, color: 'var(--qcp-ink-faint)' }}>🛡️ {t('assistantChat.readOnlyBadge')}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="qcp-btn qcp-btn-secondary"
                style={{ padding: '4px 10px' }}
                title={t('assistantChat.clear') ?? ''}
                disabled={messages.length === 0}
                onClick={() => void handleClear()}
              >
                🗑️
              </button>
              <button
                type="button"
                className="qcp-btn qcp-btn-secondary"
                style={{ padding: '4px 10px' }}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
          </div>

          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--qcp-ink-faint)', textAlign: 'center', marginTop: 20 }}>
                {t('assistantChat.empty')}
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  background: m.role === 'user' ? 'var(--qcp-accent)' : 'var(--qcp-bg-sunken)',
                  color: m.role === 'user' ? 'white' : 'var(--qcp-ink)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 12.5,
                  maxWidth: '85%',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {m.content}
              </div>
            ))}
            {sending && <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)' }}>{t('assistantChat.thinking')}</div>}
          </div>

          {error && (
            <div className="qcp-pill critical" style={{ margin: '0 12px 8px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--qcp-border)' }}>
            <input
              className="qcp-input"
              style={{ flex: 1 }}
              placeholder={t('assistantChat.placeholder') ?? ''}
              value={input}
              disabled={sending}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleSend()
                }
              }}
            />
            <button
              type="button"
              className="qcp-btn qcp-btn-primary"
              disabled={sending || !input.trim()}
              onClick={() => void handleSend()}
            >
              {t('assistantChat.send')}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        title={t('assistantChat.openButton') ?? ''}
        onClick={handleButtonClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'fixed',
          top: pos.y,
          left: pos.x,
          width: BTN_SIZE,
          height: BTN_SIZE,
          borderRadius: '50%',
          border: 'none',
          background: 'var(--qcp-gradient)',
          color: 'white',
          fontSize: 24,
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          boxShadow: dragging ? '0 10px 26px rgba(0, 0, 0, 0.4)' : '0 6px 18px rgba(0, 0, 0, 0.3)',
          zIndex: 40
        }}
      >
        🤖
      </button>
    </>
  )
}
