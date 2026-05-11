import { useState, type ReactNode } from 'react'
import { Loader2, Plus, X, AlertCircle, ChevronRight, Cloud, HardDrive, Globe2, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LoginModalProps, LoginProviderOption } from './types'
import linxLogoUrl from '@/assets/linx-logo.png'
import {
  getProviderActionLabel,
  getProviderDisplayLabel,
  getProviderStatusBadge,
  getProviderSubtitle,
} from './presentation'
import { LoginCardShell } from './LoginCardShell'

export function LoginModal(props: LoginModalProps) {
  const { state, storageConflict, view } = props

  if (state === 'authenticated' && !storageConflict) return null

  return (
    <LoginCardShell cardSize="compact">
      {storageConflict ? (
        <StorageConflictView
          storedAccount={props.storedAccount}
          storageConflict={storageConflict}
          onDismiss={props.onDismissStorageConflict}
          onOpenCurrentSpacePodSetup={props.onOpenCurrentSpacePodSetup}
        />
      ) : state === 'restoring' ? (
        <RestoringView storedAccount={props.storedAccount} />
      ) : state === 'connecting' ? (
        <ConnectingView authWindowStatus={props.authWindowStatus} />
      ) : view === 'local' ? (
        <LocalOnboardingView
          localOnboarding={props.localOnboarding}
          error={props.error}
          onBack={props.onBackFromLocal}
          onContinue={props.onContinueLocalLogin}
          onClearError={props.onClearError}
        />
      ) : props.storedAccount ? (
        <AccountView
          storedAccount={props.storedAccount}
          onContinueStoredAccount={props.onContinueStoredAccount}
          onSwitchAccount={props.onSwitchAccount}
          error={props.error}
          onClearError={props.onClearError}
        />
      ) : (
        <ProviderSelectionView
          providers={props.providers}
          error={props.error}
          localLoginStatus={props.localLoginStatus}
          onConnect={props.onConnect}
          onAddProvider={props.onAddProvider}
          onClearError={props.onClearError}
        />
      )}
    </LoginCardShell>
  )
}

function StorageConflictView({
  storedAccount,
  storageConflict,
  onDismiss,
  onOpenCurrentSpacePodSetup,
}: {
  storedAccount: LoginModalProps['storedAccount']
  storageConflict: NonNullable<LoginModalProps['storageConflict']>
  onDismiss: () => void
  onOpenCurrentSpacePodSetup: () => void
}) {
  const accountName = storedAccount?.displayName || 'LinX 用户'
  const canCreateHere = Boolean(storageConflict.managementUrl)

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="px-5 pt-6 pb-4 shrink-0">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground/70 text-center">
          空间不匹配
        </p>
      </div>

      <div className="px-5 pb-4 flex flex-col items-center justify-center gap-3 shrink-0">
        <AccountAvatar name={accountName} avatarUrl={storedAccount?.avatarUrl} size="lg" />
        <p className="text-base font-semibold text-foreground">{accountName}</p>
        <p className="max-w-[19rem] text-center text-sm leading-6 text-muted-foreground">
          当前登录到了另一个数据空间。此版本暂不支持自动迁移，请返回正确空间重新登录，
          或在当前空间新建一个 Pod 后再继续。
        </p>
      </div>

      <div className="mx-4 space-y-3 rounded-2xl border border-border/60 bg-muted/25 p-4">
        <StorageDetail label="当前空间应写入" value={storageConflict.expectedStorageUrl} />
        <StorageDetail label="账号当前绑定" value={storageConflict.actualStorageUrl} />
      </div>

      <div className="mt-auto px-4 pb-4 pt-5 space-y-2">
        {canCreateHere ? (
          <button
            type="button"
            onClick={onOpenCurrentSpacePodSetup}
            className="w-full h-10 rounded-xl border border-border/60 bg-muted/30 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
          >
            在当前空间新建 Pod
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          className="w-full h-10 rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
        >
          返回登录并重新选择空间
        </button>
      </div>

      <Footer />
    </div>
  )
}

// ── RestoringView ─────────────────────────────────────────────────────

function RestoringView({ storedAccount }: Pick<LoginModalProps, 'storedAccount'>) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
      {storedAccount ? (
        <>
          <AccountAvatar name={storedAccount.displayName} avatarUrl={storedAccount.avatarUrl} size="lg" />
          <p className="text-sm font-medium text-foreground">{storedAccount.displayName}</p>
        </>
      ) : null}
      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      <p className="text-xs text-muted-foreground">正在恢复登录状态...</p>
    </div>
  )
}

// ── AccountView（微信式：头像 + 姓名 + 进入） ─────────────────────────

function AccountView({
  storedAccount,
  onContinueStoredAccount,
  onSwitchAccount,
  error,
  onClearError,
}: {
  storedAccount: NonNullable<LoginModalProps['storedAccount']>
  onContinueStoredAccount: () => void
  onSwitchAccount: () => void
  error: string | null
  onClearError: () => void
}) {
  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex-1 px-5 py-8 flex flex-col items-center justify-center gap-4">
        <AccountAvatar name={storedAccount.displayName} avatarUrl={storedAccount.avatarUrl} size="lg" />
        <p className="text-base font-semibold text-foreground">{storedAccount.displayName}</p>
      </div>

      <ErrorBanner error={error} onClearError={onClearError} />

      <div className="px-5 pb-5 pt-2 space-y-2 shrink-0">
        <button
          onClick={onContinueStoredAccount}
          className="w-full h-10 rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
        >
          进入 LinX
        </button>
        <button
          onClick={onSwitchAccount}
          className="w-full h-9 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
        >
          切换账号
        </button>
      </div>

      <Footer />
    </div>
  )
}

// ── ProviderSelectionView ─────────────────────────────────────────────

function ProviderSelectionView({
  providers,
  error,
  localLoginStatus,
  onConnect,
  onAddProvider,
  onClearError,
}: {
  providers: LoginProviderOption[]
  error: string | null
  localLoginStatus: LoginModalProps['localLoginStatus']
  onConnect: (url: string) => void
  onAddProvider: (url: string, label?: string) => void
  onClearError: () => void
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [customUrl, setCustomUrl] = useState('')
  const primaryProviders = providers.filter((provider) => provider.source !== 'custom')
  const customProviders = providers.filter((provider) => provider.source === 'custom')

  const handleAdd = () => {
    if (!customUrl.trim()) return
    try {
      new URL(customUrl.startsWith('http') ? customUrl : `https://${customUrl}`)
      const normalized = customUrl.startsWith('http') ? customUrl : `https://${customUrl}`
      onAddProvider(normalized)
      onConnect(normalized)
      setCustomUrl('')
      setIsAdding(false)
    } catch {
      // invalid url
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="px-5 pt-7 pb-4 shrink-0">
        <h2 className="text-lg font-semibold text-foreground text-center">选择空间</h2>
      </div>

      <ErrorBanner error={error} onClearError={onClearError} />

      {localLoginStatus.active ? (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">
            {localLoginStatus.message ?? '正在启动 Local…'}
          </p>
        </div>
      ) : null}

      <div className="flex-1 px-4 min-h-0 overflow-y-auto">
        <div className="space-y-4 pb-1">
          <ProviderSection title="Cloud / Local">
            <div className="space-y-2">
              {primaryProviders.map((provider) => (
                <ProviderItem
                  key={provider.url}
                  provider={provider}
                  variant="primary"
                  onSelect={() => onConnect(provider.url)}
                />
              ))}
            </div>
          </ProviderSection>

          {customProviders.length > 0 ? (
            <ProviderSection title="其他 Solid 账号">
              <div className="bg-muted/40 rounded-xl overflow-hidden divide-y divide-border/40">
                {customProviders.map((provider) => (
                  <ProviderItem
                    key={provider.url}
                    provider={provider}
                    variant="secondary"
                    onSelect={() => onConnect(provider.url)}
                  />
                ))}
              </div>
            </ProviderSection>
          ) : null}
        </div>
      </div>

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
            连接其他 Solid 账号
          </button>
        )}
      </div>

      <Footer />
    </div>
  )
}

function ProviderSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <p className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground/70">
        {title}
      </p>
      {children}
    </section>
  )
}

// ── ConnectingView ────────────────────────────────────────────────────

function ConnectingView({
  authWindowStatus,
}: {
  authWindowStatus: LoginModalProps['authWindowStatus']
}) {
  let title = '正在连接'
  let detail = '请稍候...'

  if (authWindowStatus.open) {
    title = '等待登录完成'
    detail = '请在登录窗口完成登录'
  } else if (authWindowStatus.reason === 'completed') {
    title = '正在验证身份'
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
      <p className="text-sm text-foreground font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{detail}</p>
    </div>
  )
}

// ── LocalOnboardingView ──────────────────────────────────────────────

function LocalOnboardingView({
  localOnboarding,
  error,
  onBack,
  onContinue,
  onClearError,
}: {
  localOnboarding: LoginModalProps['localOnboarding']
  error: string | null
  onBack: () => void
  onContinue: () => void
  onClearError: () => void
}) {
  const snapshot = localOnboarding
  const onboardingState = snapshot?.state ?? 'idle'
  const isReady = onboardingState === 'ready'
  const isRepair = onboardingState === 'repair_required'
  const isError = onboardingState === 'error'
  const isStarting = onboardingState === 'starting' || onboardingState === 'checking' || onboardingState === 'idle' || onboardingState === 'mode_required'

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="px-5 pt-5 pb-3 shrink-0 flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
          aria-label="返回空间选择"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-lg font-semibold text-foreground">Local</h2>
      </div>

      <ErrorBanner error={error} onClearError={onClearError} />

      <div className="flex-1 px-5 flex flex-col justify-center gap-4">
        {isStarting && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">正在启动 Local…</p>
          </div>
        )}

        {isReady && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-foreground text-center">Local 已准备好</p>
            {snapshot?.capabilities?.contract && (
              <p className="text-[11px] text-muted-foreground/70 text-center font-mono">
                {snapshot.capabilities.contract}
              </p>
            )}
            <button
              onClick={onContinue}
              className="w-full h-10 rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
            >
              继续登录
            </button>
          </div>
        )}

        {isRepair && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground leading-relaxed">
              还差一步让其他设备接入 Local
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {snapshot?.message ?? '需要完成额外设置才能从其他设备访问。'}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              如果你现在只是想先开始使用，也可以直接切回{'\u201c'}只给这台设备用{'\u201d'}，不需要额外设置。
            </p>
            <button
              onClick={() => {
                const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
                desktopApi?.app?.openConfigWindow?.()
              }}
              className="w-full h-10 rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
            >
              去完成 Local 设置
            </button>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
            <p className="text-sm text-destructive">
              {snapshot?.message ?? 'Local 启动失败'}
            </p>
          </div>
        )}
      </div>

      <div className="px-5 pb-5 shrink-0" />

      <Footer />
    </div>
  )
}

// ── Shared Components ─────────────────────────────────────────────────

function AccountAvatar({
  name,
  avatarUrl,
  size = 'md',
}: {
  name: string
  avatarUrl?: string
  size?: 'md' | 'lg'
}) {
  const [productLogoFailed, setProductLogoFailed] = useState(false)
  const dim = size === 'lg' ? 'w-16 h-16' : 'w-11 h-11'
  const textSize = size === 'lg' ? 'text-2xl' : 'text-sm'
  const radius = 'rounded-[18%]'
  const effectiveAvatarUrl = resolveAccountAvatarUrl(avatarUrl)
  const isProductLogo = isLinxLogoUrl(effectiveAvatarUrl)
  const productLogoInnerScale = size === 'lg' ? 'scale-[1.24]' : 'scale-[1.24]'

  if (effectiveAvatarUrl) {
    return (
      <div
        className={cn(
          dim,
          radius,
          'overflow-hidden shadow-sm',
          isProductLogo && 'border border-violet-400/90 bg-violet-200/90 p-0.5',
        )}
      >
        <img
          src={effectiveAvatarUrl}
          alt=""
          className={cn(
            'h-full w-full',
            isProductLogo ? `object-cover ${productLogoInnerScale}` : 'object-cover',
          )}
        />
      </div>
    )
  }

  if (!productLogoFailed) {
    return (
      <div className={cn(dim, radius, 'overflow-hidden border border-violet-400/90 bg-violet-200/90 p-0.5 shadow-sm')}>
        <img
          src={linxLogoUrl}
          alt="LinX"
          className={cn('h-full w-full object-cover', productLogoInnerScale)}
          onError={() => setProductLogoFailed(true)}
        />
      </div>
    )
  }

  return (
    <div className={cn(dim, radius, 'bg-primary/10 flex items-center justify-center shadow-sm')}>
      <span className={cn(textSize, 'font-semibold text-primary')}>
        {name.charAt(0).toUpperCase()}
      </span>
    </div>
  )
}

function ProviderItem({
  provider,
  variant,
  onSelect,
}: {
  provider: LoginProviderOption
  variant: 'primary' | 'secondary'
  onSelect: () => void
}) {
  const [imgError, setImgError] = useState(false)
  const label = getProviderDisplayLabel(provider)
  const subtitle = getProviderSubtitle(provider, false)
  const statusBadge = getProviderStatusBadge(provider)
  const actionLabel = getProviderActionLabel(provider)
  const isPrimary = variant === 'primary'
  const logoUrl = resolveProviderLogoUrl(provider)
  const isProductLogo = isLinxLogoUrl(logoUrl)
  const productLogoInnerScale = 'scale-[1.24]'

  return (
    <button
      type="button"
      className={cn(
        'group flex w-full items-center gap-3 text-left transition-colors',
        isPrimary
          ? 'rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 hover:bg-muted/50'
          : 'px-3 py-2.5 hover:bg-muted/80',
      )}
      onClick={onSelect}
    >
      <div
        className={cn(
          'rounded-[22%] flex items-center justify-center shrink-0 overflow-hidden border border-border/60',
          isProductLogo ? 'border-violet-400/90 bg-violet-200/90 p-0.5' : 'bg-background',
          isPrimary ? 'h-11 w-11' : 'h-9 w-9',
        )}
      >
        {logoUrl && !imgError ? (
          <img
            src={logoUrl}
            alt=""
            className={cn(
              'w-full h-full',
              isProductLogo ? `object-cover ${productLogoInnerScale}` : 'object-cover',
            )}
            onError={() => setImgError(true)}
          />
        ) : (
          <ProviderIcon provider={provider} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{label}</p>
        <p className={cn('text-muted-foreground/80 truncate mt-0.5', isPrimary ? 'text-xs' : 'text-[11px]')}>
          {subtitle}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {statusBadge ? <ProviderStatusBadge badge={statusBadge} /> : null}
        <span className="text-[11px] font-medium text-muted-foreground/70">
          {actionLabel}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  )
}

function ProviderIcon({ provider }: { provider: LoginProviderOption }) {
  if (provider.source === 'cloud') {
    return <Cloud className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
  }

  if (provider.source === 'local') {
    return <HardDrive className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
  }

  return <Globe2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
}

function ProviderStatusBadge({
  badge,
}: {
  badge: NonNullable<ReturnType<typeof getProviderStatusBadge>>
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
        badge.tone === 'primary' && 'border-primary/20 bg-primary/10 text-primary',
        badge.tone === 'success' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        badge.tone === 'warning' && 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
        badge.tone === 'danger' && 'border-destructive/20 bg-destructive/10 text-destructive',
        badge.tone === 'neutral' && 'border-border/60 bg-background text-muted-foreground',
      )}
    >
      {badge.label}
    </span>
  )
}

function ErrorBanner({ error, onClearError }: { error: string | null; onClearError: () => void }) {
  if (!error) return null

  return (
    <div className="mx-4 mb-3 px-3 py-2 bg-destructive/10 rounded-lg flex items-start gap-2 shrink-0">
      <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
      <p className="text-xs text-destructive flex-1 leading-relaxed">{error}</p>
      <button
        onClick={onClearError}
        className="text-destructive/60 hover:text-destructive shrink-0 cursor-pointer"
        aria-label="关闭错误提示"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function Footer() {
  return null
}

function resolveProviderLogoUrl(provider: LoginProviderOption): string | undefined {
  if (provider.source === 'cloud' || provider.source === 'local') {
    return linxLogoUrl
  }

  return provider.logoUrl
}

function resolveAccountAvatarUrl(avatarUrl?: string): string | undefined {
  if (!avatarUrl) {
    return linxLogoUrl
  }

  if (isLinxLogoUrl(avatarUrl)) {
    return linxLogoUrl
  }

  return avatarUrl
}

function isLinxLogoUrl(url?: string): boolean {
  if (!url) {
    return false
  }

  return (
    url.includes('linx-logo')
    || url.includes('/src/assets/')
    || url.includes('/assets/linx-logo')
  )
}

function StorageDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground/70">
        {label}
      </p>
      <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground break-all">
        {value}
      </div>
    </div>
  )
}
