import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MatrixNativeGrantPanel } from '@/lib/matrix/MatrixNativeGrantPanel'

export interface MatrixAuthorizationState {
  matrixAuthorizationRequired: boolean
  matrixAuthorizationError: string | null
  matrixNativeGrantRequired: boolean
  matrixAccountOrigin: string | null
  isAuthorizingMatrix: boolean
  authorizeMatrixAccess: () => Promise<void>
  importMatrixAccess: (credential: { apiKey?: string; clientId?: string; clientSecret?: string }) => Promise<void>
  dismissMatrixNativeGrant: () => void
}

/** Explicit consent banner for Matrix group chat; the native grant panel only
 * opens after the Account authority says programmatic issuance is unavailable. */
export function MatrixAuthorizationBanner({ runtime }: { runtime: MatrixAuthorizationState }) {
  if (!runtime.matrixAuthorizationRequired) return null
  return (
    <div role="alert" className="absolute inset-x-3 top-3 z-30 flex flex-col gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-md">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-medium">允许当前空间收发群聊消息</p>
            <p className="text-xs text-muted-foreground">LinX 会为本次登录创建一个只用于这个空间的访问凭据，不会保存到本机。授权后请重新发送刚才的消息。</p>
            {runtime.matrixAuthorizationError && !runtime.matrixNativeGrantRequired ? (
              <p className="mt-1 text-xs text-destructive">{runtime.matrixAuthorizationError}</p>
            ) : null}
          </div>
        </div>
        <Button size="sm" disabled={runtime.isAuthorizingMatrix} onClick={() => void runtime.authorizeMatrixAccess().catch(() => undefined)}>
          {runtime.isAuthorizingMatrix ? '正在授权…' : '授权并继续'}
        </Button>
      </div>
      {runtime.matrixNativeGrantRequired ? (
        <MatrixNativeGrantPanel
          accountOrigin={runtime.matrixAccountOrigin}
          busy={runtime.isAuthorizingMatrix}
          error={runtime.matrixAuthorizationError}
          onImport={(credential) => { void runtime.importMatrixAccess(credential).catch(() => undefined) }}
          onCancel={runtime.dismissMatrixNativeGrant}
        />
      ) : null}
    </div>
  )
}
