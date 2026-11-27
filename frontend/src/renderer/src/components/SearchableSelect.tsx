import { useEffect, useRef, useState } from 'react'

export interface SearchOption {
  id: number
  label: string
}

/** قائمة اختيار بحث: بتكتب جزء من الاسم فتتفلتر النتايج وتختار منها. */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'ابحث بالاسم...',
  emptyLabel = '— اختار —'
}: {
  options: SearchOption[]
  value: number | ''
  onChange: (id: number | '') => void
  placeholder?: string
  emptyLabel?: string
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const selected = value === '' ? undefined : options.find((o) => o.id === value)

  useEffect(() => {
    function onDoc(e: MouseEvent): void {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = (q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options).slice(0, 100)

  function pick(id: number | ''): void {
    onChange(id)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        className="qcp-input"
        style={{ width: '100%' }}
        placeholder={selected ? '' : placeholder}
        value={open ? query : (selected?.label ?? '')}
        onFocus={() => {
          setOpen(true)
          setQuery('')
          setActive(0)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, filtered.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter') {
            if (open && filtered[active]) {
              e.preventDefault()
              pick(filtered[active].id)
            }
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 50,
            insetInline: 0,
            top: '100%',
            maxHeight: 260,
            overflowY: 'auto',
            background: 'var(--qcp-bg-elevated, var(--qcp-bg, #fff))',
            border: '1px solid var(--qcp-border)',
            borderRadius: 8,
            boxShadow: '0 6px 20px rgba(0,0,0,.18)'
          }}
        >
          <div
            style={{ padding: '8px 10px', cursor: 'pointer', color: 'var(--qcp-ink-faint)' }}
            onMouseDown={(e) => {
              e.preventDefault()
              pick('')
            }}
          >
            {emptyLabel}
          </div>
          {filtered.map((o, i) => (
            <div
              key={o.id}
              style={{ padding: '8px 10px', cursor: 'pointer', background: i === active ? 'var(--qcp-bg-sunken)' : undefined }}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(o.id)
              }}
            >
              {o.label}
            </div>
          ))}
          {!filtered.length && <div style={{ padding: '8px 10px', color: 'var(--qcp-ink-faint)' }}>مفيش نتايج</div>}
        </div>
      )}
    </div>
  )
}
