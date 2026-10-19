/** خانة خصم موحدة (قيمة بالجنيه أو نسبة %) — بتتستخدم للخصم على الصنف وعلى الفاتورة كلها في البيع العادي والمطعم */
export function DiscountField({
  type,
  value,
  onChange,
  label,
  autoFocus,
  base,
  maxPercent = 100
}: {
  type: 'percent' | 'value'
  value: string
  onChange: (type: 'percent' | 'value', value: string) => void
  label?: string
  autoFocus?: boolean
  /** المبلغ اللي الخصم بيتحسب عليه (قيمة الصنف أو الفاتورة) — لازم معاه maxPercent عشان الخصم بقيمة يتحدد برضه */
  base?: number
  /** أقصى نسبة خصم مسموحة */
  maxPercent?: number
}): JSX.Element {
  const limited = maxPercent < 100
  const maxValue = type === 'percent' ? maxPercent : base != null ? Math.floor(((base * maxPercent) / 100) * 100) / 100 : undefined
  function clamp(next: 'percent' | 'value', raw: string): string {
    if (raw === '') return raw
    const n = Number(raw)
    const cap = next === 'percent' ? maxPercent : base != null ? Math.floor(((base * maxPercent) / 100) * 100) / 100 : Infinity
    return n > cap ? String(cap) : raw
  }
  return (
    <div className="rst-disc-field">
      {label && <span className="rst-disc-label">{label}</span>}
      <input
        className="qcp-input"
        type="number"
        min={0}
        max={maxValue}
        placeholder="0"
        value={value}
        autoFocus={autoFocus}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(type, clamp(type, e.target.value))}
      />
      <div className="rst-seg rst-disc-seg">
        <button type="button" className={type === 'value' ? 'active' : ''} onClick={() => onChange('value', clamp('value', value))}>
          ج.م
        </button>
        <button type="button" className={type === 'percent' ? 'active' : ''} onClick={() => onChange('percent', clamp('percent', value))}>
          %
        </button>
      </div>
      {limited && <span className="rst-disc-tag" style={{ color: 'var(--qcp-ink-faint)' }}>حد {maxPercent}%</span>}
    </div>
  )
}
