import { Component, ErrorInfo, ReactNode } from 'react'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import { Button } from '@/components/ui/button'

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
        <div className="mx-auto max-w-[480px] px-6 py-10 text-center">
          <h1 className="mb-3 text-xl font-semibold text-destructive">
            页面暂时无法显示
          </h1>
          <p className="m-0 text-sm leading-7 text-muted-foreground">
            {message}
          </p>
          <Button
            onClick={() => window.location.reload()}
            className="mt-6"
          >
            刷新页面
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
