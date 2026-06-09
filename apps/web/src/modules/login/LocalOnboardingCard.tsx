import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoginCardShell } from './LoginCardShell'
import { useConfigWindowState } from './hooks/use-config-window-state'
import { useLocalOnboarding } from './hooks/use-local-onboarding'
import { useOidcConnect } from './hooks/use-oidc-connect'
import { formatLoginErrorForUser } from './error-messages'
import { LocalReachabilitySummary } from './LocalReachabilitySummary'
import type { LocalOnboardingConnectivity, LocalSpaceKind } from '@/types/electron-api'

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
    refresh,
    testConnectivity,
    openAdvancedSettings,
  } = useLocalOnboarding()
  const [launchingAuth, setLaunchingAuth] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const autoBootstrapStartedRef = useRef(false)
  const autoProbeKeyRef = useRef<string | null>(null)
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
        ? '独立空间还没有准备好。请稍后重试。'
        : '本地空间还没有完成准备。请回到空间选择页，再点一次“本地空间”。')
      return
    }
    if (snapshot.spaceKind !== 'standalone' && !snapshot.provisionCode) {
      setAuthError('本地空间还没有完成准备。请回到空间选择页，再点一次“本地空间”。')
      return
    }

    setAuthError(null)
    setLaunchingAuth(true)

    try {
      if (snapshot.spaceKind === 'standalone') {
        await oidc.connect(localProviderUrl, {
          authorizationSurface: 'embedded',
          route: 'standalone',
          storageProviderUrl: localProviderUrl,
          storageProviderLabel: 'Standalone',
          issuerLabel: 'Standalone',
          strictDiscovery: true,
          nodeId: snapshot.nodeId ?? undefined,
        })
      } else {
        await oidc.connect(localProviderUrl, {
          authorizationSurface: 'embedded',
          route: 'local',
          accountIssuerUrl: snapshot.cloudIdentityUrl ?? undefined,
          accountIssuerLabel: 'Cloud',
          storageProviderUrl: localProviderUrl,
          storageProviderLabel: 'Local',
          issuerLabel: 'Cloud',
          authorizationQuery: {
            provisionCode: snapshot.provisionCode,
          },
          strictDiscovery: true,
          nodeId: snapshot.nodeId ?? undefined,
        })
      }
    } catch (error: any) {
      setAuthError(formatLoginErrorForUser(error, '登录页没有打开。请返回空间选择页重试。'))
    } finally {
      setLaunchingAuth(false)
    }
  }, [localProviderUrl, oidc, snapshot.cloudIdentityUrl, snapshot.spaceKind, snapshot.provisionCode])

  const handleOpenAdvancedSettings = useCallback(async () => {
    setActionError(null)

    try {
      await openAdvancedSettings()
    } catch (error: any) {
      setActionError(formatLoginErrorForUser(error, '本地空间设置没有打开。请稍后重试。'))
    }
  }, [openAdvancedSettings])

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
        setActionError(formatLoginErrorForUser(error, '本地空间启动失败。请稍后重试。'))
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

  useEffect(() => {
    if (loading || acting) return
    if (snapshot.state !== 'ready' || snapshot.spaceKind !== 'local') return
    if (snapshot.connectivity && snapshot.connectivity.status !== 'unknown') return

    const probeKey = [
      snapshot.spaceKind ?? '',
      snapshot.localUrl ?? '',
      snapshot.publicUrl ?? '',
    ].join('|')
    if (autoProbeKeyRef.current === probeKey) return

    autoProbeKeyRef.current = probeKey
    void Promise.resolve(testConnectivity()).catch((error: any) => {
      setActionError(formatLoginErrorForUser(error, '本地空间连接检测失败。'))
    })
  }, [
    acting,
    loading,
    snapshot.connectivity,
    snapshot.localUrl,
    snapshot.publicUrl,
    snapshot.spaceKind,
    snapshot.state,
    testConnectivity,
  ])
  const productLabel = snapshot.spaceKind === 'standalone' ? '独立空间' : '本地空间'

  return (
    <>
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold text-center">{productLabel}</h1>
        <p className="mt-2 text-sm text-muted-foreground text-center leading-6">
          把聊天和资料留在你选择的空间里。LinX 会先在这台电脑准备好空间，再打开登录页完成授权。
        </p>
      </div>

      <div className="px-6 pb-6">
        {loading ? (
          <LoadingCard label="正在检查本地空间…" />
        ) : snapshot.state === 'space_required' || snapshot.state === 'idle' ? (
          <div className="space-y-4">
            <LoadingCard label="正在启动本地空间…" />
            <Button variant="ghost" className="w-full" onClick={handleBack}>
              {backLabel}
            </Button>
          </div>
        ) : snapshot.state === 'starting' || snapshot.state === 'checking' ? (
          <LoadingCard
            label={formatLocalCardMessage(snapshot.message, '正在启动本地空间…')}
            detail={formatLocalCardDetail(snapshot.localUrl ?? snapshot.baseUrl ?? undefined)}
          />
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
            message={formatLocalCardMessage(snapshot.message, '本地空间已准备好。')}
            spaceKind={snapshot.spaceKind}
            detail={snapshot.spaceKind === 'local'
              ? undefined
              : snapshot.spaceKind === 'standalone'
              ? formatLocalCardDetail(snapshot.localUrl ?? snapshot.baseUrl ?? snapshot.capabilities?.contract ?? undefined)
              : formatLocalCardDetail(snapshot.publicUrl ?? undefined)}
            connectivity={snapshot.spaceKind === 'local' ? snapshot.connectivity : null}
            error={authError ?? actionError}
            busy={launchingAuth}
            backLabel={backLabel}
            onSignIn={() => void handleSignIn()}
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
      {detail ? <p className="mt-2 text-xs text-muted-foreground">{detail}</p> : null}
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
            {settingsLabel ?? '打开本地空间设置'}
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
          {formatLoginErrorForUser(error, '操作失败。请返回空间选择页重试。')}
        </div>
      ) : null}
    </div>
  )
}

function ReadyCard({
  spaceKind,
  message,
  detail,
  connectivity,
  error,
  busy,
  backLabel,
  onSignIn,
  onBack,
}: {
  spaceKind: LocalSpaceKind | null
  message: string
  detail?: string
  connectivity: LocalOnboardingConnectivity | null
  error: string | null
  busy: boolean
  backLabel: string
  onSignIn: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <p className="text-sm font-medium">{spaceKind === 'standalone' ? '独立空间已准备好' : '本地空间已准备好'}</p>
        <p className="mt-2 text-sm text-muted-foreground leading-6">{message}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {spaceKind === 'standalone'
            ? '下一步会打开本机登录页，完成后会回到 LinX。'
            : '下一步会打开登录页，流程完成后会回到 LinX。'}
        </p>
        {detail ? <p className="mt-2 text-xs text-muted-foreground break-all">{detail}</p> : null}
        {spaceKind === 'local' ? (
          <LocalReachabilitySummary connectivity={connectivity} assumeLocalReachable className="mt-4 bg-background/50" />
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {formatLoginErrorForUser(error, '登录失败。请返回空间选择页重试。')}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button disabled={busy} onClick={onSignIn}>
          {busy ? '正在打开登录页…' : '继续登录'}
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onBack}>
            {backLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function getRepairContent(snapshot: {
  state: string
  errorCode: string | null
  message: string | null
}) {
  if (snapshot.errorCode === 'LOCAL_REMOTE_READY_REQUIRES_SETUP') {
    return {
      title: '还差一步让其他设备接入本地空间',
      message: '你当前选择了多设备接入。要让手机或其他电脑也能访问，需要先给这台电脑配置一个固定可访问地址。',
      detail: '如果只想账号和数据都留在本机，请返回空间选择并选择独立空间。',
      retryLabel: '完成后重新检查',
      settingsLabel: '去完成本地空间设置',
    }
  }

  if (snapshot.errorCode === 'LOCAL_START_FAILED') {
    return {
      title: '本地空间启动失败',
      message: formatLocalCardMessage(snapshot.message, '本地空间启动失败。'),
      detail: '你可以重新检查，或打开本地空间设置确认当前环境。',
      retryLabel: '重新检查',
      settingsLabel: '配置启动',
    }
  }

  return {
    title: snapshot.state === 'repair_required' ? '本地空间还需要处理' : '本地空间暂时无法继续',
    message: formatLocalCardMessage(snapshot.message, '本地空间还没有准备好。'),
    detail: null,
    retryLabel: '重新检查',
    settingsLabel: '配置启动',
  }
}

function formatLocalCardMessage(value: string | null | undefined, fallback: string): string {
  return formatLoginErrorForUser(value, fallback)
}

function formatLocalCardDetail(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const formatted = formatLoginErrorForUser(value, '')
  return formatted || undefined
}
