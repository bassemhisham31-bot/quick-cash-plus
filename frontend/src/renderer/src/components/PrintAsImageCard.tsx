import { useState } from 'react'
import { isPrintAsImageEnabled, setPrintAsImageEnabled } from '../platform/printImageMode'

/**
 * "طباعة كصورة" — اختيار خاص بالجهاز ده: لو الفاتورة بتطلع والحروف العربي مفكوكة (مشكلة في QZ Tray على بعض الأجهزة)،
 * المتصفح بيرسم الورقة بنفسه ويبعتها للطابعة صورة جاهزة. بيشتغل على الورق الحراري (58/80 مم) بس.
 */
export function PrintAsImageCard(): JSX.Element {
  const [enabled, setEnabled] = useState<boolean>(() => isPrintAsImageEnabled())

  return (
    <div className="qcp-card" style={{ marginBottom: 18, padding: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setPrintAsImageEnabled(e.target.checked)
            setEnabled(e.target.checked)
          }}
        />
        <strong>🖼️ طباعة كصورة (لو الحروف العربي بتطلع مفكوكة)</strong>
      </label>
      <div style={{ fontSize: 12.5, color: 'var(--qcp-ink-muted)', marginTop: 6, lineHeight: 1.8 }}>
        فعّلها على الجهاز اللي الفاتورة بتطلع فيه والحروف متقطعة. بتتطبق على الورق الحراري (58 / 80 مم) وبتتحفظ فورًا — مش محتاجة زرار حفظ.
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--qcp-ink-faint)', marginTop: 4 }}>الاختيار ده خاص بالجهاز والمتصفح ده بس، وباقي الأجهزة مش بتتأثر.</div>
    </div>
  )
}
