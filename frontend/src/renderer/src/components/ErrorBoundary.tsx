import { Component, ReactNode } from 'react'

/** لو أي شاشة وقعت بخطأ برمجي: بدل الشاشة البيضاء يظهر زرار إعادة التحميل، والخطأ بيتسجل في crash.log */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error): void {
    console.error('[react-error]', error.message, error.stack)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', textAlign: 'center', fontFamily: 'Tahoma, sans-serif' }}>
        <div>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h2>حصل خطأ غير متوقع</h2>
          <p style={{ color: '#777' }}>بياناتك محفوظة. دوس إعادة التحميل وكمّل شغل.</p>
          <button style={{ padding: '10px 24px', fontSize: 16 }} onClick={() => window.location.reload()}>
            🔄 إعادة التحميل
          </button>
        </div>
      </div>
    )
  }
}
