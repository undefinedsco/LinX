import { Component, ErrorInfo, ReactNode } from 'react'

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
      return (
        <div style={{
          padding: '40px',
          maxWidth: '800px',
          margin: '0 auto',
          fontFamily: 'monospace'
        }}>
          <h1 style={{ color: 'red' }}>❌ 出错了</h1>
          <h2>错误信息：</h2>
          <pre style={{
            background: '#f5f5f5',
            padding: '20px',
            borderRadius: '8px',
            overflow: 'auto'
          }}>
            {this.state.error?.toString()}
          </pre>
          <h2>堆栈信息：</h2>
          <pre style={{
            background: '#f5f5f5',
            padding: '20px',
            borderRadius: '8px',
            overflow: 'auto',
            fontSize: '12px'
          }}>
            {this.state.error?.stack}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
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












