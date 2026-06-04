import { Component, ErrorInfo, ReactNode } from 'react'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      const message = formatLoginErrorForUser(
        this.state.error,
        '页面暂时无法显示。请刷新页面；如果仍失败，请重新进入 LinX。',
      )

      return (
        <div style={{
          padding: '40px',
          maxWidth: '480px',
          margin: '0 auto',
          fontFamily: 'inherit',
          textAlign: 'center',
        }}>
          <h1 style={{ color: '#dc2626', fontSize: '22px', marginBottom: '12px' }}>
            页面暂时无法显示
          </h1>
          <p style={{ color: '#4b5563', fontSize: '14px', lineHeight: 1.7, margin: 0 }}>
            {message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '24px',
              padding: '10px 20px',
              background: '#111827',
              color: 'white',
              border: 'none',
              borderRadius: '999px',
              cursor: 'pointer',
            }}
          >
            刷新页面
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

