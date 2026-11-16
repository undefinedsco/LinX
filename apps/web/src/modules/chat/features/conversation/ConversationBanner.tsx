import { ShieldCheck, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MatrixAuthorizationBanner, type MatrixAuthorizationState } from './MatrixAuthorizationBanner'
import type { ConversationBannerKind } from './conversation-banner'

export interface ConversationBannerRuntime extends MatrixAuthorizationState {
  serviceAccessError: string | null
  isGrantingServiceAccess: boolean
  grantServiceAccess: () => Promise<unknown>
  reconnectStatus: 'idle' | 'syncing' | 'error'
}

export interface ConversationBannerProps {
  kind: ConversationBannerKind | null
  runtime: ConversationBannerRuntime
  loadErrorMessage: string | null
  onRetryLoad: () => void
  onSynchronize: () => Promise<unknown>
}

export function ConversationBanner({ kind, runtime, loadErrorMessage, onRetryLoad, onSynchronize }: ConversationBannerProps) {
  if (kind === 'load-error') {
    return (
      <div role="alert" className="absolute inset-x-3 top-3 z-20 flex items-center justify-between gap-3 rounded-lg border bg-background/95 px-3 py-2 text-sm shadow-sm">
        <span>{loadErrorMessage ?? '读不到这个聊天的消息。'}</span>
        <Button size="sm" variant="outline" onClick={onRetryLoad}>重试</Button>
      </div>
    )
  }
  if (kind === 'matrix-authorization') return <MatrixAuthorizationBanner runtime={runtime} />
  if (kind === 'service-access') {
    return (
      <div role="alert" className="absolute inset-x-3 top-3 z-30 flex items-center justify-between gap-4 rounded-xl border bg-background/95 px-4 py-3 shadow-md">
        <div className="flex min-w-0 items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-medium">允许 AI 服务读取模型配置</p>
            <p className="text-xs text-muted-foreground">仅授权当前空间中的模型配置。授权后请重新发送刚才的消息。</p>
            {runtime.serviceAccessError ? <p className="mt-1 text-xs text-destructive">{runtime.serviceAccessError}</p> : null}
          </div>
        </div>
        <Button size="sm" disabled={runtime.isGrantingServiceAccess} onClick={() => void runtime.grantServiceAccess().then(() => onSynchronize()).catch(() => undefined)}>
          {runtime.isGrantingServiceAccess ? '正在授权…' : '允许并继续'}
        </Button>
      </div>
    )
  }
  if (kind === 'offline') {
    return (
      <div role="alert" className="absolute inset-x-3 top-3 z-20 flex items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 text-sm shadow-sm">
        <WifiOff className="size-4" />网络已断开。现在发送会失败，连上后请重新发送。
      </div>
    )
  }
  if (kind === 'reconnect') {
    return (
      <div
        role={runtime.reconnectStatus === 'error' ? 'alert' : 'status'}
        className="absolute inset-x-3 top-3 z-20 flex items-center justify-between gap-3 rounded-lg border bg-background/95 px-3 py-2 text-sm shadow-sm"
      >
        <span>{runtime.reconnectStatus === 'syncing' ? '连接已恢复，正在同步最新消息…' : '连接已恢复，但消息同步失败。'}</span>
        {runtime.reconnectStatus === 'error' ? (
          <Button size="sm" variant="outline" onClick={() => void onSynchronize()}>重试同步</Button>
        ) : null}
      </div>
    )
  }
  return null
}
