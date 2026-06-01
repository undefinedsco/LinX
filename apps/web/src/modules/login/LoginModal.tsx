import { useState, type ReactNode } from 'react'
import { Loader2, Plus, X, AlertCircle, ChevronRight, Cloud, HardDrive, Globe2, ArrowLeft, Link2, Info, Copy, CheckCircle2, type LucideIcon } from 'lucide-react'
import { isLocalAccessHostname } from '@/lib/local-access-url'
import { cn } from '@/lib/utils'
import type { LoginModalProps, LoginProviderOption } from './types'
import linxLogoUrl from '@/assets/linx-logo.png'
import {
  getProviderActionLabel,
  getProviderDisplayLabel,
  getProviderInfoText,
  getProviderStatusBadge,
  getProviderSubtitle,
} from './presentation'
import { resolveLoginProviderSource } from './provider-model'
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
        <ConnectingView
          authWindowStatus={props.authWindowStatus}
          connectingProvider={props.connectingProvider}
          onCancel={props.onCancelConnecting}
        />
      ) : view === 'local' ? (
        <LocalOnboardingView
          localOnboarding={props.localOnboarding}
          localProviderSource={props.localProviderSource}
          error={props.error}
          onBack={props.onBackFromLocal}
          onContinue={props.onContinueLocalLogin}
          onSaveTunnelToken={props.onSaveLocalTunnelToken}
          onTestConnectivity={props.onTestLocalConnectivity}
          onClearError={props.onClearError}
        />
      ) : props.storedAccount ? (
        <AccountView
          storedAccount={props.storedAccount}
          hasRestorableSession={props.hasRestorableSession}
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
  const canCreateHere = Boolean(storageConflict.setupUrl ?? storageConflict.managementUrl)
  const isCreatePodSetup = storageConflict.setupKind === 'create-pod'

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="px-5 pt-6 pb-4 shrink-0">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground/70 text-center">
          {isCreatePodSetup ? '需要创建 Pod' : '空间不匹配'}
        </p>
      </div>

      <div className="px-5 pb-4 flex flex-col items-center justify-center gap-3 shrink-0">
        <AccountAvatar
          name={accountName}
          avatarUrl={storedAccount?.avatarUrl}
          size="lg"
          spaceMarker={resolveStoredAccountSpaceMarker(storedAccount)}
        />
        <p className="text-base font-semibold text-foreground">{accountName}</p>
        <p className="max-w-[19rem] text-center text-sm leading-6 text-muted-foreground">
          {isCreatePodSetup
            ? '这个 Cloud 账号还没有绑定当前 Local 空间的 Pod。先为当前 Local 空间创建 Pod，之后数据会写入这里。'
            : '当前登录到了另一个数据空间。此版本暂不支持自动迁移，请返回正确空间重新登录，或在当前空间新建一个 Pod 后再继续。'}
        </p>
      </div>

      <div className="mx-4 space-y-3 rounded-2xl border border-border/60 bg-muted/25 p-4">
        <StorageDetail label="当前空间应写入" value={storageConflict.expectedStorageUrl} />
        <StorageDetail label="账号当前绑定" value={storageConflict.actualStorageUrl ?? '未绑定'} />
      </div>

      <div className="mt-auto px-4 pb-4 pt-5 space-y-2">
        {canCreateHere ? (
          <button
            type="button"
            onClick={onOpenCurrentSpacePodSetup}
            className="w-full h-10 rounded-xl border border-border/60 bg-muted/30 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
          >
            {isCreatePodSetup ? '为当前 Local 创建 Pod' : '在当前空间新建 Pod'}
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
          <AccountAvatar
            name={storedAccount.displayName}
            avatarUrl={storedAccount.avatarUrl}
            size="lg"
            spaceMarker={resolveStoredAccountSpaceMarker(storedAccount)}
          />
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
  hasRestorableSession,
  onContinueStoredAccount,
  onSwitchAccount,
  error,
  onClearError,
}: {
  storedAccount: NonNullable<LoginModalProps['storedAccount']>
  hasRestorableSession: boolean
  onContinueStoredAccount: () => void
  onSwitchAccount: () => void
  error: string | null
  onClearError: () => void
}) {
  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex-1 px-5 py-8 flex flex-col items-center justify-center gap-4">
        <AccountAvatar
          name={storedAccount.displayName}
          avatarUrl={storedAccount.avatarUrl}
          size="lg"
          spaceMarker={resolveStoredAccountSpaceMarker(storedAccount)}
        />
        <p className="text-base font-semibold text-foreground">{storedAccount.displayName}</p>
      </div>

      <ErrorBanner error={error} onClearError={onClearError} />

      <div className="px-5 pb-5 pt-2 space-y-2 shrink-0">
        <button
          onClick={onContinueStoredAccount}
          className="w-full h-10 rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
        >
          {hasRestorableSession ? '进入 LinX' : '继续登录'}
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
  onConnect: (providerKey: string) => void
  onAddProvider: (url: string, label?: string) => void
  onClearError: () => void
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [customUrl, setCustomUrl] = useState('')
  const primaryProviders = providers.filter((provider) => resolveLoginProviderSource(provider) !== 'custom')
  const customProviders = providers.filter((provider) => resolveLoginProviderSource(provider) === 'custom')

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
          <ProviderSection title="登录方式">
            <div className="space-y-2">
              {primaryProviders.map((provider) => (
                <ProviderItem
                  key={provider.id}
                  provider={provider}
                  variant="primary"
                  onSelect={() => onConnect(provider.id)}
                />
              ))}
            </div>
          </ProviderSection>

          {customProviders.length > 0 ? (
            <ProviderSection title="其他 Solid 账号">
              <div className="bg-muted/40 rounded-xl overflow-hidden divide-y divide-border/40">
                {customProviders.map((provider) => (
                  <ProviderItem
                    key={provider.id}
                    provider={provider}
                    variant="secondary"
                    onSelect={() => onConnect(provider.id)}
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
  connectingProvider,
  onCancel,
}: {
  authWindowStatus: LoginModalProps['authWindowStatus']
  connectingProvider: LoginModalProps['connectingProvider']
  onCancel: () => void
}) {
  let title = '正在连接'
  let detail = connectingProvider
    ? `正在使用 ${connectingProvider.issuerLabel}`
    : '请稍候...'

  if (authWindowStatus.open) {
    title = connectingProvider
      ? `等待 ${connectingProvider.issuerLabel} 登录完成`
      : '等待登录完成'
    detail = '请在登录窗口完成'
  } else if (authWindowStatus.reason === 'completed') {
    title = '正在验证身份'
    detail = connectingProvider?.storageProviderLabel
      ? `正在进入 ${connectingProvider.storageProviderLabel}`
      : detail
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
        <p className="text-sm text-foreground font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{detail}</p>
        {connectingProvider ? (
          <div className="mt-4 w-full max-w-[18rem] rounded-2xl border border-border/60 bg-muted/30 px-3 py-2">
            <p className="truncate text-xs font-medium text-foreground">
              {connectingProvider.storageProviderLabel}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {formatProviderHost(connectingProvider.storageProviderUrl)}
            </p>
          </div>
        ) : null}
      </div>
      <div className="px-5 pb-5 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="w-full h-9 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
        >
          换一个空间
        </button>
      </div>
    </div>
  )
}

// ── LocalOnboardingView ──────────────────────────────────────────────

function LocalOnboardingView({
  localOnboarding,
  localProviderSource,
  error,
  onBack,
  onContinue,
  onSaveTunnelToken,
  onTestConnectivity,
  onClearError,
}: {
  localOnboarding: LoginModalProps['localOnboarding']
  localProviderSource: LoginModalProps['localProviderSource']
  error: string | null
  onBack: () => void
  onContinue: () => void
  onSaveTunnelToken: LoginModalProps['onSaveLocalTunnelToken']
  onTestConnectivity: LoginModalProps['onTestLocalConnectivity']
  onClearError: () => void
}) {
  const snapshot = localOnboarding
  const [tunnelToken, setTunnelToken] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const isStandalone = localProviderSource === 'standalone'
  const productLabel = isStandalone ? 'Standalone' : 'Local'
  const onboardingState = snapshot?.state ?? 'idle'
  const isReady = onboardingState === 'ready'
  const isRepair = onboardingState === 'repair_required'
  const isError = onboardingState === 'error'
  const isStarting = onboardingState === 'starting' || onboardingState === 'checking' || onboardingState === 'idle' || onboardingState === 'space_required'
  const progressLabel = snapshot?.progress?.label ?? snapshot?.message ?? `正在启动 ${productLabel}…`
  const progressDetail = snapshot?.progress?.detail
  const publicUrl = snapshot?.publicUrl ?? null
  const localUrl = snapshot?.localUrl ?? snapshot?.baseUrl ?? null
  const localServiceUrl = formatRouteOrigin(localUrl ?? 'http://localhost:5737/')
  const hasTunnelToken = Boolean(snapshot?.tunnel?.hasToken)
  const connectivity = snapshot?.connectivity ?? null

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard?.writeText(value)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1200)
    } catch {
      setCopyState('idle')
    }
  }

  const saveTunnelToken = async () => {
    await Promise.resolve(onSaveTunnelToken(tunnelToken))
    setTunnelToken('')
  }

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
        <h2 className="text-lg font-semibold text-foreground">{productLabel}</h2>
      </div>

      <ErrorBanner error={error} onClearError={onClearError} />

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-2">
        <div className="flex min-h-full flex-col justify-center gap-4">
          {isStarting && (
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
              <p className="text-sm font-medium text-foreground">{progressLabel}</p>
              {progressDetail ? (
                <p className="max-w-[18rem] break-all text-[11px] leading-5 text-muted-foreground">
                  {progressDetail}
                </p>
              ) : null}
            </div>
          )}

          {isReady && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-foreground text-center">{productLabel} 已准备好</p>
              {snapshot?.capabilities?.contract && (
                <p className="text-[11px] text-muted-foreground/70 text-center font-mono">
                  {snapshot.capabilities.contract}
                </p>
              )}
              {isStandalone ? (
                <RouteInfoCard title="本机入口" value={localUrl} />
              ) : (
                <>
                  <LocalDomainCard
                    publicUrl={publicUrl}
                    copyState={copyState}
                    onCopy={publicUrl ? () => void handleCopy(publicUrl) : undefined}
                  />
                  <TunnelSetupCard
                    publicUrl={publicUrl}
                    localServiceUrl={localServiceUrl}
                    hasTunnelToken={hasTunnelToken}
                    token={tunnelToken}
                    onTokenChange={setTunnelToken}
                    onSaveToken={() => void saveTunnelToken()}
                  />
                  <ConnectivityCard
                    connectivity={connectivity}
                    onTest={() => void onTestConnectivity()}
                  />
                </>
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
                {isStandalone ? 'Standalone 启动失败' : '还差一步让 Local 接入 Cloud'}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {snapshot?.message ?? (isStandalone ? '请检查本机 xpod 启动状态。' : '需要完成额外设置才能从其他设备访问。')}
              </p>
              <button
                onClick={() => {
                  const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
                  desktopApi?.app?.openConfigWindow?.()
                }}
                className="w-full h-10 rounded-xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
              >
                {isStandalone ? '打开设置' : '去完成 Local 设置'}
              </button>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center gap-3 text-center">
              <AlertCircle className="w-6 h-6 text-destructive" />
              <p className="text-sm text-destructive">
                {snapshot?.message ?? `${productLabel} 启动失败`}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-5 shrink-0" />

      <Footer />
    </div>
  )
}

function LocalDomainCard({
  publicUrl,
  copyState,
  onCopy,
}: {
  publicUrl: string | null
  copyState: 'idle' | 'copied'
  onCopy?: () => void
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/25 p-3">
      <div className="flex items-start gap-3">
        <StepNumber value={1} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground">拿到 Local 域名</p>
            {onCopy ? (
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              >
                {copyState === 'copied' ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copyState === 'copied' ? '已复制' : '复制'}
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            这是 Cloud 分配给这台设备的 Local canonical URL，会写入账号的 storage。
          </p>
          <p className="mt-2 break-all font-mono text-[11px] leading-5 text-foreground">
            {publicUrl ?? '等待 Cloud 分配'}
          </p>
        </div>
      </div>
    </div>
  )
}

function RouteInfoCard({
  title,
  value,
  action,
}: {
  title: string
  value: string | null
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground/70">{title}</p>
        {action}
      </div>
      <p className="mt-2 break-all font-mono text-[11px] leading-5 text-foreground">
        {value ?? '等待 xpod 返回'}
      </p>
    </div>
  )
}

function TunnelSetupCard({
  publicUrl,
  localServiceUrl,
  hasTunnelToken,
  token,
  onTokenChange,
  onSaveToken,
}: {
  publicUrl: string | null
  localServiceUrl: string
  hasTunnelToken: boolean
  token: string
  onTokenChange: (value: string) => void
  onSaveToken: () => void
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        <StepNumber value={2} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground">配置 Cloudflare Tunnel</p>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              hasTunnelToken
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
            )}>
              {hasTunnelToken ? '已保存' : '未配置'}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            在 Cloudflare Zero Trust 创建 Tunnel，Public Hostname 填 {publicUrl ? formatProviderHost(publicUrl) : '上方 Local 域名'}，Service URL 填 {localServiceUrl}。
          </p>
          <button
            type="button"
            onClick={() => {
              const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
              void desktopApi?.app?.openExternal?.('https://one.dash.cloudflare.com/')
            }}
            className="mt-2 inline-flex h-7 items-center rounded-lg border border-border/60 px-2 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            打开 Cloudflare
          </button>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          type="password"
          value={token}
          onChange={(event) => onTokenChange(event.target.value)}
          placeholder={hasTunnelToken ? '粘贴新 token 或完整命令覆盖' : '粘贴 tunnel token 或完整命令'}
          className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          disabled={!token.trim()}
          onClick={onSaveToken}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          保存
        </button>
      </div>
      {hasTunnelToken ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          需要更换时直接粘贴新 token 覆盖保存。
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">
          token 在 Cloudflare 给出的 `cloudflared tunnel run --token ...` 命令里；整条命令也可以直接粘贴。
        </p>
      )}
    </div>
  )
}

function ConnectivityCard({
  connectivity,
  onTest,
}: {
  connectivity: NonNullable<LoginModalProps['localOnboarding']>['connectivity']
  onTest: () => void
}) {
  const status = connectivity?.status ?? 'unknown'
  const tone = resolveConnectivityTone(status)
  const local = connectivity?.local
  const publicProbe = connectivity?.public

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        <StepNumber value={3} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-foreground">测试联通性</p>
              <p className={cn('mt-1 text-[11px] leading-5', tone.textClass)}>
                {connectivity?.message ?? '会同时测试本机入口和公网入口，并确认是不是同一个 Local 节点。'}
              </p>
            </div>
            <button
              type="button"
              onClick={onTest}
              disabled={status === 'checking'}
              className="shrink-0 rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/50 disabled:cursor-wait disabled:opacity-60"
            >
              {status === 'checking' ? '测试中' : '测试'}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <ProbePill label="本机" probe={local ?? null} />
            <ProbePill label="公网" probe={publicProbe ?? null} />
          </div>
        </div>
      </div>
    </div>
  )
}

function StepNumber({ value }: { value: number }) {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
      {value}
    </span>
  )
}

function ProbePill({
  label,
  probe,
}: {
  label: string
  probe: NonNullable<NonNullable<LoginModalProps['localOnboarding']>['connectivity']>['local']
}) {
  const reachable = probe?.reachable
  const sameNode = probe?.sameNode
  const value = !probe
    ? '未测'
    : reachable && sameNode !== false
      ? probe.latencyMs !== null ? `${probe.latencyMs}ms` : '可达'
      : '失败'

  return (
    <div className="rounded-xl border border-border/50 bg-background/60 px-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn(
          'font-medium',
          reachable && sameNode !== false ? 'text-emerald-600 dark:text-emerald-400' : probe ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
        )}>
          {value}
        </span>
      </div>
      {probe?.url ? (
        <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
          {formatProviderHost(probe.url)}
        </p>
      ) : null}
    </div>
  )
}

function resolveConnectivityTone(status: string): { textClass: string } {
  if (status === 'ready') {
    return { textClass: 'text-emerald-600 dark:text-emerald-400' }
  }
  if (status === 'failed' || status === 'mismatch') {
    return { textClass: 'text-destructive' }
  }
  if (status === 'local-only') {
    return { textClass: 'text-amber-700 dark:text-amber-400' }
  }
  return { textClass: 'text-muted-foreground' }
}

// ── Shared Components ─────────────────────────────────────────────────

function AccountAvatar({
  name,
  avatarUrl,
  size = 'md',
  spaceMarker = null,
}: {
  name: string
  avatarUrl?: string
  size?: 'md' | 'lg'
  spaceMarker?: SpaceMarkerKind | null
}) {
  const [productLogoFailed, setProductLogoFailed] = useState(false)
  const dim = size === 'lg' ? 'w-16 h-16' : 'w-11 h-11'
  const textSize = size === 'lg' ? 'text-2xl' : 'text-sm'
  const radius = 'rounded-[18%]'
  const effectiveAvatarUrl = resolveAccountAvatarUrl(avatarUrl)
  const isProductLogo = isLinxLogoUrl(effectiveAvatarUrl)
  const productLogoInnerScale = size === 'lg' ? 'scale-[1.24]' : 'scale-[1.24]'
  const marker = spaceMarker ? <SpaceMarker kind={spaceMarker} size={size} /> : null

  if (effectiveAvatarUrl) {
    return (
      <div
        className={cn(
          dim,
          radius,
          'relative overflow-hidden shadow-sm',
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
        {marker}
      </div>
    )
  }

  if (!productLogoFailed) {
    return (
      <div className={cn(dim, radius, 'relative overflow-hidden border border-violet-400/90 bg-violet-200/90 p-0.5 shadow-sm')}>
        <img
          src={linxLogoUrl}
          alt="LinX"
          className={cn('h-full w-full object-cover', productLogoInnerScale)}
          onError={() => setProductLogoFailed(true)}
        />
        {marker}
      </div>
    )
  }

  return (
    <div className={cn(dim, radius, 'relative bg-primary/10 flex items-center justify-center shadow-sm')}>
      <span className={cn(textSize, 'font-semibold text-primary')}>
        {name.charAt(0).toUpperCase()}
      </span>
      {marker}
    </div>
  )
}

type SpaceMarkerKind = 'local' | 'standalone'

function SpaceMarker({ kind, size }: { kind: SpaceMarkerKind; size: 'md' | 'lg' }) {
  const isStandalone = kind === 'standalone'
  const Icon = isStandalone ? HardDrive : Link2

  return (
    <span
      data-account-space-marker={kind}
      data-account-local-marker={kind === 'local' ? true : undefined}
      data-account-standalone-marker={kind === 'standalone' ? true : undefined}
      className={cn(
        'absolute flex items-center justify-center border border-white/80 text-white shadow-sm dark:border-zinc-900/80',
        isStandalone ? 'bg-emerald-500' : 'bg-sky-500',
        size === 'lg' ? 'bottom-1 right-1 h-5 w-5 rounded-[7px]' : 'bottom-0.5 right-0.5 h-4 w-4 rounded-[6px]',
      )}
    >
      <Icon className={size === 'lg' ? 'h-3 w-3' : 'h-2.5 w-2.5'} aria-hidden="true" />
    </span>
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
  const infoText = getProviderInfoText(provider, false)
  const statusBadge = getProviderStatusBadge(provider)
  const actionLabel = getProviderActionLabel(provider)
  const isPrimary = variant === 'primary'
  const logoUrl = resolveProviderLogoUrl(provider)
  const isProductLogo = isLinxLogoUrl(logoUrl)
  const productLogoInnerScale = 'scale-[1.24]'
  const source = resolveLoginProviderSource(provider)
  const spaceMarker = resolveProviderSpaceMarker(provider)

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
        data-provider-source={source}
        className={cn(
          'relative rounded-[22%] flex items-center justify-center shrink-0 overflow-hidden border border-border/60',
          isProductLogo && 'border-violet-400/90 bg-violet-200/90 p-0.5',
          !isProductLogo && 'bg-background',
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
        {spaceMarker ? (
          <span
            data-provider-space-marker={spaceMarker.kind}
            data-provider-local-marker={spaceMarker.kind === 'local' ? true : undefined}
            data-provider-standalone-marker={spaceMarker.kind === 'standalone' ? true : undefined}
            className={cn(
              'absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-[6px] border border-white/80 text-white shadow-sm dark:border-zinc-900/80',
              spaceMarker.kind === 'standalone' ? 'bg-emerald-500' : 'bg-sky-500',
            )}
          >
            <spaceMarker.Icon className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{label}</p>
        <div className={cn('mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground/80', isPrimary ? 'text-xs' : 'text-[11px]')}>
          <span className="truncate">{subtitle}</span>
          <span
            aria-label={infoText}
            title={infoText}
            className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60"
          >
            <Info className="h-3 w-3" aria-hidden="true" />
          </span>
        </div>
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
  const source = resolveLoginProviderSource(provider)

  if (source === 'cloud') {
    return <Cloud className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
  }

  if (source === 'local') {
    return <Link2 className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
  }

  if (source === 'standalone') {
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
      aria-label={badge.label}
      title={badge.label}
      className={cn(
        'inline-flex h-2.5 w-2.5 items-center justify-center rounded-full',
        badge.tone === 'primary' && 'border-primary/20 bg-primary/10 text-primary',
        badge.tone === 'success' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        badge.tone === 'warning' && 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
        badge.tone === 'danger' && 'border-destructive/20 bg-destructive/10 text-destructive',
        badge.tone === 'neutral' && 'bg-muted text-muted-foreground',
      )}
    >
      <span
        data-provider-status-dot={badge.tone}
        aria-hidden="true"
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          badge.tone === 'primary' && 'bg-primary',
          badge.tone === 'success' && 'bg-emerald-500',
          badge.tone === 'warning' && 'bg-amber-500',
          badge.tone === 'danger' && 'bg-destructive',
          badge.tone === 'neutral' && 'bg-muted-foreground/60',
        )}
      />
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
  const source = resolveLoginProviderSource(provider)
  if (source === 'cloud' || source === 'local' || source === 'standalone') {
    return linxLogoUrl
  }

  return provider.logoUrl
}

function resolveProviderSpaceMarker(provider: LoginProviderOption): { kind: SpaceMarkerKind; Icon: LucideIcon } | null {
  const source = resolveLoginProviderSource(provider)
  if (source === 'local') {
    return { kind: 'local', Icon: Link2 }
  }
  if (source === 'standalone') {
    return { kind: 'standalone', Icon: HardDrive }
  }
  return null
}

function resolveStoredAccountSpaceMarker(account: LoginModalProps['storedAccount']): SpaceMarkerKind | null {
  if (!account) {
    return null
  }

  if (
    account.storageProviderLabel === 'Standalone'
    || account.issuerLabel === 'Standalone'
  ) {
    return 'standalone'
  }

  if (
    account.storageProviderLabel === 'Local'
  ) {
    return 'local'
  }

  if (account.issuerLabel === 'Local') {
    return 'standalone'
  }

  if (
    isStandaloneAccountUrl(account.storageProviderUrl)
    || isStandaloneAccountUrl(account.issuerUrl)
    || isStandaloneAccountUrl(account.webId)
  ) {
    return 'standalone'
  }

  return isManagedLocalAccountUrl(account.storageProviderUrl)
    || isManagedLocalAccountUrl(account.issuerUrl)
    || isManagedLocalAccountUrl(account.webId)
    ? 'local'
    : null
}

function isStandaloneAccountUrl(url?: string): boolean {
  if (!url) {
    return false
  }

  try {
    const hostname = new URL(url).hostname
    return isLocalAccessHostname(hostname)
  } catch {
    return false
  }
}

function isManagedLocalAccountUrl(url?: string): boolean {
  if (!url) {
    return false
  }

  try {
    const hostname = new URL(url).hostname
    return hostname.endsWith('.undefineds.co') && hostname.startsWith('node-')
  } catch {
    return false
  }
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

function formatProviderHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function formatRouteOrigin(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.origin
  } catch {
    return url.replace(/\/+$/, '')
  }
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
