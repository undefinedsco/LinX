import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Copy, Loader2, Wrench } from 'lucide-react'
import { LINX_CLOUD_IDENTITY_ORIGIN } from '@undefineds.co/models/client'
import { Button } from '@/components/ui/button'
import { LoginCardShell } from './LoginCardShell'
import { cn } from '@/lib/utils'
import { useConfigWindowState } from './hooks/use-config-window-state'
import { useLocalOnboarding } from './hooks/use-local-onboarding'
import { useOidcConnect } from './hooks/use-oidc-connect'
import type { LocalOnboardingSnapshot, LocalSpaceKind } from '@/types/electron-api'

export interface LocalOnboardingCardProps {
  onBack: () => void
  backLabel?: string
}

export function LocalOnboardingScreen({
  onBack,
  backLabel = '返回空间选择',
}: LocalOnboardingCardProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LoginCardShell overlayClassName="z-[999]" cardSize="auto" cardClassName="min-h-[31rem]">
        <LocalOnboardingCard onBack={onBack} backLabel={backLabel} />
      </LoginCardShell>
    </div>
  )
}

export function LocalOnboardingCard({
  onBack,
  backLabel = '返回空间选择',
}: LocalOnboardingCardProps) {
  const oidc = useOidcConnect()
  const configWindow = useConfigWindowState()
  const {
    snapshot,
    loading,
    acting,
    chooseSpace,
    continueLocal,
    saveTunnelToken,
    testConnectivity,
    refresh,
    openAdvancedSettings,
  } = useLocalOnboarding()
  const [launchingAuth, setLaunchingAuth] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [tunnelToken, setTunnelToken] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const autoBootstrapStartedRef = useRef(false)
  const localIssuerUrl = snapshot.localUrl ?? snapshot.baseUrl
  const localProviderUrl = snapshot.spaceKind === 'standalone'
    ? localIssuerUrl
    : snapshot.publicUrl
  const previousConfigOpen = useRef(configWindow.open)

  const handleBack = useCallback(() => {
    setAuthError(null)
    setActionError(null)
    onBack()
  }, [onBack])

  const handleSignIn = useCallback(async () => {
    if (!localProviderUrl) {
      setAuthError(snapshot.spaceKind === 'standalone'
        ? 'Standalone 服务还没有准备好。'
        : 'Local canonical storage URL 尚未准备好。请重新启动 Local 完成 Cloud 绑定。')
      return
    }
    if (snapshot.spaceKind !== 'standalone' && !snapshot.provisionCode) {
      setAuthError('Local 还没完成 Cloud 绑定，暂时无法继续登录。')
      return
    }

    setAuthError(null)
    setLaunchingAuth(true)

    try {
      if (snapshot.spaceKind === 'standalone') {
        await oidc.connect(localProviderUrl, {
          authorizationSurface: 'embedded',
          storageProviderUrl: localProviderUrl,
          storageProviderLabel: 'Standalone',
          issuerLabel: 'Standalone',
        })
      } else {
        await oidc.connect(snapshot.cloudIdentityUrl ?? LINX_CLOUD_IDENTITY_ORIGIN, {
          authorizationSurface: 'embedded',
          storageProviderUrl: localProviderUrl,
          storageProviderLabel: 'Local',
          issuerLabel: 'Cloud',
          authorizationQuery: {
            provisionCode: snapshot.provisionCode,
          },
        })
      }
    } catch (error: any) {
      setAuthError(error?.message || '打开 Local 登录失败。')
    } finally {
      setLaunchingAuth(false)
    }
  }, [localProviderUrl, oidc, snapshot.cloudIdentityUrl, snapshot.spaceKind, snapshot.provisionCode])

  const handleOpenAdvancedSettings = useCallback(async () => {
    setActionError(null)

    try {
      await openAdvancedSettings()
    } catch (error: any) {
      setActionError(error?.message || '打开 Local 设置失败。')
    }
  }, [openAdvancedSettings])

  const handleCopyPublicUrl = useCallback(async () => {
    if (!snapshot.publicUrl) return

    try {
      await navigator.clipboard?.writeText(snapshot.publicUrl)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1200)
    } catch {
      setCopyState('idle')
    }
  }, [snapshot.publicUrl])

  const handleSaveTunnelToken = useCallback(async () => {
    setActionError(null)

    try {
      await saveTunnelToken(tunnelToken)
      setTunnelToken('')
    } catch (error: any) {
      setActionError(error?.message || '保存 Tunnel token 失败。')
    }
  }, [saveTunnelToken, tunnelToken])

  const handleTestConnectivity = useCallback(async () => {
    setActionError(null)

    try {
      await testConnectivity()
    } catch (error: any) {
      setActionError(error?.message || '测试 Local 联通性失败。')
    }
  }, [testConnectivity])

  useEffect(() => {
    const wasOpen = previousConfigOpen.current
    previousConfigOpen.current = configWindow.open

    if (wasOpen && !configWindow.open) {
      void refresh()
    }
  }, [configWindow.open, refresh])

  useEffect(() => {
    if (snapshot.state !== 'space_required' && snapshot.state !== 'idle') {
      autoBootstrapStartedRef.current = false
    }
  }, [snapshot.state])

  useEffect(() => {
    if (loading || acting) return
    if (configWindow.open) return

    const shouldAutoBootstrap = snapshot.state === 'space_required' || snapshot.state === 'idle'
    if (!shouldAutoBootstrap || autoBootstrapStartedRef.current) {
      return
    }

    autoBootstrapStartedRef.current = true
    setAuthError(null)
    setActionError(null)

    void (async () => {
      const continueSpaceKind: LocalSpaceKind = snapshot.spaceKind ?? 'local'

      try {
        if (snapshot.spaceKind !== continueSpaceKind) {
          await chooseSpace(continueSpaceKind)
        }
        await continueLocal()
      } catch (error: any) {
        setActionError(error?.message || '启动 Local 失败。')
      }
    })()
  }, [
    acting,
    chooseSpace,
    configWindow.open,
    continueLocal,
    loading,
    snapshot.spaceKind,
    snapshot.state,
  ])

  return (
    <>
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold text-center">Local</h1>
        <p className="mt-2 text-sm text-muted-foreground text-center leading-6">
          把聊天和资料留在你自己的空间里。LinX 会先在本机准备 Local，再用 Cloud 身份完成登录。
        </p>
      </div>

      <div className="px-6 pb-6">
        {loading ? (
          <LoadingCard label="正在检查 Local…" />
        ) : snapshot.state === 'space_required' || snapshot.state === 'idle' ? (
          <div className="space-y-4">
            <LoadingCard label="正在启动 Local…" detail={snapshot.localUrl ?? snapshot.baseUrl ?? undefined} />
            <Button variant="ghost" className="w-full" onClick={handleBack}>
              {backLabel}
            </Button>
          </div>
        ) : snapshot.state === 'starting' || snapshot.state === 'checking' ? (
          <LoadingCard label={snapshot.message ?? '正在启动 Local…'} detail={snapshot.localUrl ?? snapshot.baseUrl ?? undefined} />
        ) : snapshot.state === 'repair_required' || snapshot.state === 'error' ? (
          <RepairCard
            title={getRepairContent(snapshot).title}
            message={getRepairContent(snapshot).message}
            detail={getRepairContent(snapshot).detail}
            error={actionError}
            busy={acting}
            retryLabel={getRepairContent(snapshot).retryLabel}
            settingsLabel={getRepairContent(snapshot).settingsLabel}
            backLabel={backLabel}
            onRetry={() => void refresh()}
            onAdvancedSettings={snapshot.canOpenSettings ? () => void handleOpenAdvancedSettings() : undefined}
            onBack={handleBack}
          />
        ) : (
          <ReadyCard
            snapshot={snapshot}
            message={snapshot.message ?? 'Local 已准备好。'}
            spaceKind={snapshot.spaceKind}
            detail={snapshot.spaceKind === 'standalone'
              ? snapshot.localUrl ?? snapshot.baseUrl ?? snapshot.capabilities?.contract ?? undefined
              : snapshot.publicUrl ?? undefined}
            error={authError ?? actionError}
            busy={launchingAuth}
            acting={acting}
            backLabel={backLabel}
            tunnelToken={tunnelToken}
            copyState={copyState}
            onCopyPublicUrl={() => void handleCopyPublicUrl()}
            onTunnelTokenChange={setTunnelToken}
            onSaveTunnelToken={() => void handleSaveTunnelToken()}
            onTestConnectivity={() => void handleTestConnectivity()}
            onSignIn={() => void handleSignIn()}
            onConfigure={() => void handleOpenAdvancedSettings()}
            onBack={handleBack}
          />
        )}
      </div>
    </>
  )
}

function LoadingCard({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-6 text-center">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
      <p className="mt-4 text-sm font-medium">{label}</p>
      {detail ? <p className="mt-2 text-xs text-muted-foreground break-all">{detail}</p> : null}
    </div>
  )
}

function RepairCard({
  title,
  message,
  detail,
  error,
  busy,
  retryLabel,
  settingsLabel,
  backLabel,
  onRetry,
  onAdvancedSettings,
  onBack,
}: {
  title: string
  message: string
  detail?: string | null
  error: string | null
  busy: boolean
  retryLabel: string
  settingsLabel?: string
  backLabel: string
  onRetry: () => void
  onAdvancedSettings?: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <Wrench className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-2 text-sm text-muted-foreground leading-6">{message}</p>
            {detail ? <p className="mt-3 text-xs text-muted-foreground leading-5">{detail}</p> : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {onAdvancedSettings ? (
          <Button onClick={onAdvancedSettings}>
            {settingsLabel ?? '打开 Local 设置'}
          </Button>
        ) : null}
        <Button variant={onAdvancedSettings ? 'outline' : 'default'} disabled={busy} onClick={onRetry}>
          {retryLabel}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          {backLabel}
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  )
}

function ReadyCard({
  snapshot,
  spaceKind,
  message,
  detail,
  error,
  busy,
  acting,
  backLabel,
  tunnelToken,
  copyState,
  onCopyPublicUrl,
  onTunnelTokenChange,
  onSaveTunnelToken,
  onTestConnectivity,
  onSignIn,
  onConfigure,
  onBack,
}: {
  snapshot: LocalOnboardingSnapshot
  spaceKind: LocalSpaceKind | null
  message: string
  detail?: string
  error: string | null
  busy: boolean
  acting: boolean
  backLabel: string
  tunnelToken: string
  copyState: 'idle' | 'copied'
  onCopyPublicUrl: () => void
  onTunnelTokenChange: (value: string) => void
  onSaveTunnelToken: () => void
  onTestConnectivity: () => void
  onSignIn: () => void
  onConfigure: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <p className="text-sm font-medium">Local 已准备好</p>
        <p className="mt-2 text-sm text-muted-foreground leading-6">{message}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {spaceKind === 'standalone'
            ? '下一步会打开 Standalone 登录页，完成后会回到 LinX。'
            : '下一步会打开 Cloud 登录页，流程完成后会回到 LinX。'}
        </p>
        {detail ? <p className="mt-2 text-xs text-muted-foreground break-all">{detail}</p> : null}
      </div>

      {spaceKind === 'local' ? (
        <LocalRouteSetup
          snapshot={snapshot}
          tunnelToken={tunnelToken}
          copyState={copyState}
          busy={acting}
          onCopyPublicUrl={onCopyPublicUrl}
          onTunnelTokenChange={onTunnelTokenChange}
          onSaveTunnelToken={onSaveTunnelToken}
          onTestConnectivity={onTestConnectivity}
        />
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button disabled={busy} onClick={onSignIn}>
          {busy ? (spaceKind === 'standalone' ? '正在打开 Standalone 登录…' : '正在打开 Cloud 登录…') : '继续登录'}
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onBack}>
            {backLabel}
          </Button>
          <Button variant="outline" className="flex-1" onClick={onConfigure}>
            高级设置
          </Button>
        </div>
      </div>
    </div>
  )
}

function LocalRouteSetup({
  snapshot,
  tunnelToken,
  copyState,
  busy,
  onCopyPublicUrl,
  onTunnelTokenChange,
  onSaveTunnelToken,
  onTestConnectivity,
}: {
  snapshot: LocalOnboardingSnapshot
  tunnelToken: string
  copyState: 'idle' | 'copied'
  busy: boolean
  onCopyPublicUrl: () => void
  onTunnelTokenChange: (value: string) => void
  onSaveTunnelToken: () => void
  onTestConnectivity: () => void
}) {
  const publicUrl = snapshot.publicUrl
  const hasTunnelToken = Boolean(snapshot.tunnel?.hasToken)
  const localServiceUrl = formatRouteOrigin(snapshot.localUrl ?? snapshot.baseUrl ?? 'http://localhost:5737/')
  const connectivity = snapshot.connectivity
  const connectivityStatus = connectivity?.status ?? 'unknown'
  const tone = resolveConnectivityTone(connectivityStatus)

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/60 bg-muted/25 p-4">
        <div className="flex items-start gap-3">
          <StepNumber value={1} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">拿到 Local 域名</p>
              {publicUrl ? (
                <button
                  type="button"
                  onClick={onCopyPublicUrl}
                  className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                >
                  {copyState === 'copied' ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copyState === 'copied' ? '已复制' : '复制'}
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Cloud 分配的 canonical URL 会写入账号 storage。
            </p>
            <p className="mt-2 break-all font-mono text-xs text-foreground">
              {publicUrl ?? '等待 Cloud 分配'}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <StepNumber value={2} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">配置 Cloudflare Tunnel</p>
              <span className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                hasTunnelToken
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
              )}>
                {hasTunnelToken ? '已保存' : '未配置'}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Public Hostname 填 {publicUrl ? formatProviderHost(publicUrl) : '上方 Local 域名'}，Service URL 填 {localServiceUrl}。
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                value={tunnelToken}
                onChange={(event) => onTunnelTokenChange(event.target.value)}
                placeholder={hasTunnelToken ? '粘贴新 token 或完整命令覆盖' : '粘贴 tunnel token 或完整命令'}
                className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
              <Button
                size="sm"
                disabled={!tunnelToken.trim() || busy}
                onClick={onSaveTunnelToken}
              >
                保存
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              token 在 Cloudflare 的 `cloudflared tunnel run --token ...` 命令里；整条命令可直接粘贴。
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <StepNumber value={3} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">测试联通性</p>
                <p className={cn('mt-1 text-xs leading-5', tone)}>
                  {connectivity?.message ?? '会同时测试本机入口和公网入口，并确认是不是同一个 Local 节点。'}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || connectivityStatus === 'checking'}
                onClick={onTestConnectivity}
              >
                {connectivityStatus === 'checking' ? '测试中' : '测试'}
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <ProbePill label="本机" probe={connectivity?.local ?? null} />
              <ProbePill label="公网" probe={connectivity?.public ?? null} />
            </div>
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
  probe: NonNullable<LocalOnboardingSnapshot['connectivity']>['local']
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

function resolveConnectivityTone(status: string): string {
  if (status === 'ready') {
    return 'text-emerald-600 dark:text-emerald-400'
  }
  if (status === 'failed' || status === 'mismatch') {
    return 'text-destructive'
  }
  if (status === 'local-only') {
    return 'text-amber-700 dark:text-amber-400'
  }
  return 'text-muted-foreground'
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
    return new URL(url).origin
  } catch {
    return url.replace(/\/+$/, '')
  }
}

function getRepairContent(snapshot: {
  state: string
  errorCode: string | null
  message: string | null
}) {
  if (snapshot.errorCode === 'LOCAL_REMOTE_READY_REQUIRES_SETUP') {
    return {
      title: '还差一步让其他设备接入 Local',
      message: '你当前选择了多设备接入。要让手机或其他电脑也能访问，需要先给 Local 配一个固定可访问地址。',
      detail: '如果只想账号和数据都留在本机，请回到空间选择并选择 Standalone。',
      retryLabel: '完成后重新检查',
      settingsLabel: '去完成 Local 设置',
    }
  }

  if (snapshot.errorCode === 'LOCAL_START_FAILED') {
    return {
      title: 'Local 没有顺利启动',
      message: snapshot.message ?? '启动 Local 失败。',
      detail: '你可以重新检查，或打开 Local 设置确认当前环境。',
      retryLabel: '重新检查',
      settingsLabel: '配置启动',
    }
  }

  return {
    title: snapshot.state === 'repair_required' ? 'Local 还需要处理' : 'Local 暂时无法继续',
    message: snapshot.message ?? 'Local 还没有准备好。',
    detail: null,
    retryLabel: '重新检查',
    settingsLabel: '配置启动',
  }
}
