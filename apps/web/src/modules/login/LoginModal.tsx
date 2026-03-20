import { useState } from 'react'
import { Loader2, Plus, Trash2, AlertCircle, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LoginModalProps, ProviderOption } from './types'

// ============================================================================
// Main Component
// ============================================================================

export function LoginModal(props: LoginModalProps) {
  const { state } = props

  // 已登录时不显示
  if (state === 'logged_in') {
    return null
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50">
      <div className="w-compact-modal h-compact-modal warm-card overflow-hidden rounded-xl flex flex-col">
        {state === 'init' || state === 'restoring' ? (
          <RestoringView />
        ) : state === 'connecting' ? (
          <ConnectingView provider={props.selectedProvider} />
        ) : (
          <SelectingView {...props} />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Restoring View - 恢复会话中
// ============================================================================

function RestoringView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <Loader2 className="w-8 h-8 text-muted-foreground animate-spin mb-4" />
      <p className="text-sm text-muted-foreground">正在恢复登录状态...</p>
    </div>
  )
}

// ============================================================================
// Connecting View - 连接中
// ============================================================================

function ConnectingView({ provider }: { provider: string | null }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
      <p className="text-sm text-foreground font-medium mb-1">正在连接</p>
      <p className="text-xs text-muted-foreground truncate max-w-full">
        {provider ? new URL(provider).hostname : '...'}
      </p>
    </div>
  )
}

// ============================================================================
// Selecting View - 选择 Provider
// ============================================================================

function SelectingView(props: LoginModalProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [customUrl, setCustomUrl] = useState('')

  const handleAdd = () => {
    if (!customUrl.trim()) return
    try {
      new URL(customUrl.startsWith('http') ? customUrl : `https://${customUrl}`)
      const normalized = customUrl.startsWith('http') ? customUrl : `https://${customUrl}`
      props.onAddProvider(normalized)
      props.onConnect(normalized)
      setCustomUrl('')
      setIsAdding(false)
    } catch {
      // URL 格式错误
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-8 pb-4 shrink-0">
        <h2 className="text-lg font-semibold text-foreground text-center">
          登录 LinX
        </h2>
        <p className="text-xs text-muted-foreground text-center mt-1.5">
          当前阶段仅支持 Solid Pod 登录
        </p>
      </div>

      {/* Error */}
      {props.error && (
        <div className="mx-4 mb-3 px-3 py-2 bg-destructive/10 rounded-lg flex items-start gap-2 shrink-0">
          <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive flex-1 leading-relaxed">{props.error}</p>
          <button
            onClick={props.onClearError}
            className="text-destructive/60 hover:text-destructive shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Provider List - Flex Grow Area */}
      <div className="flex-1 px-4 min-h-0 overflow-y-auto">
        <div className="bg-muted/40 rounded-xl overflow-hidden divide-y divide-border/40">
          {props.providers.map((provider) => (
            <ProviderItem
              key={provider.url}
              provider={provider}
              isFailed={props.failedProvider === provider.url}
              onSelect={() => props.onConnect(provider.url)}
              onDelete={provider.isDefault ? undefined : () => props.onDeleteProvider(provider.url)}
            />
          ))}
        </div>
      </div>

      {/* Add Custom Provider */}
      <div className="px-4 py-4 shrink-0 mt-auto">
        {isAdding ? (
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              type="url"
              placeholder="https://pod.example.com"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="w-full h-9 px-3 text-sm border border-border/60 rounded-lg bg-background focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={!customUrl.trim()}
                className="flex-1 h-8 text-xs font-medium text-primary-foreground bg-primary rounded-lg disabled:opacity-50 cursor-pointer hover:bg-primary/90 transition-colors"
              >
                连接
              </button>
              <button
                onClick={() => { setIsAdding(false); setCustomUrl('') }}
                className="px-3 h-8 text-xs text-muted-foreground hover:text-foreground cursor-pointer border border-border/50 rounded-lg"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full h-9 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            添加其他服务器
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-6 pt-3 border-t border-border/30 shrink-0">
        <p className="text-[10px] text-muted-foreground/60 text-center leading-normal">
          阶段 1 只使用 Solid Pod 登录，三端共用同一套壳
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Provider Item
// ============================================================================

function ProviderItem({
  provider,
  isFailed,
  onSelect,
  onDelete,
}: {
  provider: ProviderOption
  isFailed: boolean
  onSelect: () => void
  onDelete?: () => void
}) {
  const [imgError, setImgError] = useState(false)

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
        "hover:bg-muted/80",
        isFailed && "bg-destructive/5"
      )}
      onClick={onSelect}
    >
      {/* Logo */}
      <div className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden",
        isFailed ? "bg-destructive/10" : "bg-background border border-border/60"
      )}>
        {provider.logoUrl && !imgError ? (
          <img
            src={provider.logoUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className={cn(
            "text-sm font-medium",
            isFailed ? "text-destructive" : "text-muted-foreground"
          )}>
            {provider.label.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium truncate",
          isFailed ? "text-destructive" : "text-foreground"
        )}>
          {provider.label}
        </p>
        <p className={cn(
          "text-[11px] truncate mt-0.5",
          isFailed ? "text-destructive/70" : "text-muted-foreground/80"
        )}>
          {isFailed ? '连接失败' : new URL(provider.url).hostname}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30" />
      </div>
    </div>
  )
}
