import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Wrench } from 'lucide-react'
import { LINX_CLOUD_IDENTITY_ORIGIN } from '@linx/client'
import { Button } from '@/components/ui/button'
import { LoginCardShell } from './LoginCardShell'
import { useConfigWindowState } from './hooks/use-config-window-state'
import { useLocalOnboarding } from './hooks/use-local-onboarding'
import { useOidcConnect } from './hooks/use-oidc-connect'
import type { LocalOnboardingMode } from '@/types/electron-api'

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
    chooseMode,
    continueLocal,
    refresh,
    openAdvancedSettings,
  } = useLocalOnboarding()
  const [launchingAuth, setLaunchingAuth] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const autoBootstrapStartedRef = useRef(false)
  const autoSignInKeyRef = useRef<string | null>(null)
  const localIssuerUrl = snapshot.localUrl ?? snapshot.baseUrl
  const previousConfigOpen = useRef(configWindow.open)

  const handleBack = useCallback(() => {
    setAuthError(null)
    setActionError(null)
    onBack()
  }, [onBack])

  const handleDowngradeToDeviceOnly = useCallback(async () => {
    setAuthError(null)
    setActionError(null)
    await chooseMode('device-only')
    await continueLocal()
  }, [chooseMode, continueLocal])

  const handleSignIn = useCallback(async () => {
    if (!localIssuerUrl) {
      setAuthError('Local 服务还没有准备好。')
      return
    }
    if (snapshot.mode !== 'device-only' && !snapshot.provisionCode) {
      setAuthError('Local 还没完成 Cloud 绑定，暂时无法继续登录。')
      return
    }

    setAuthError(null)
    setLaunchingAuth(true)

    try {
      if (snapshot.mode === 'device-only') {
        await oidc.connect(localIssuerUrl, {
          authorizationSurface: 'embedded',
          providerUrl: localIssuerUrl,
          providerLabel: 'Local',
        })
      } else {
        await oidc.connect(snapshot.cloudIdentityUrl ?? LINX_CLOUD_IDENTITY_ORIGIN, {
          authorizationSurface: 'embedded',
          providerUrl: localIssuerUrl,
          providerLabel: 'Local',
          authorizationQuery: {
            provisionCode: snapshot.provisionCode,
          },
        })
      }
    } catch (error: any) {
      setAuthError(error?.message || '打开 Cloud 登录失败。')
    } finally {
      setLaunchingAuth(false)
    }
  }, [localIssuerUrl, oidc, snapshot.cloudIdentityUrl, snapshot.mode, snapshot.provisionCode])

  const handleOpenAdvancedSettings = useCallback(async () => {
    setActionError(null)

    try {
      await openAdvancedSettings()
    } catch (error: any) {
      setActionError(error?.message || '打开 Local 设置失败。')
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
    if (snapshot.state !== 'mode_required' && snapshot.state !== 'idle') {
      autoBootstrapStartedRef.current = false
    }
  }, [snapshot.state])

  useEffect(() => {
    if (snapshot.state !== 'ready') {
      autoSignInKeyRef.current = null
    }
  }, [snapshot.state])

  useEffect(() => {
    if (loading || acting) return
    if (configWindow.open) return

    const shouldAutoBootstrap = snapshot.state === 'mode_required' || snapshot.state === 'idle'
    if (!shouldAutoBootstrap || autoBootstrapStartedRef.current) {
      return
    }

    autoBootstrapStartedRef.current = true
    setAuthError(null)
    setActionError(null)

    void (async () => {
      const continueMode: LocalOnboardingMode = snapshot.mode ?? 'device-only'

      try {
        if (snapshot.mode !== continueMode) {
          await chooseMode(continueMode)
        }
        await continueLocal()
      } catch (error: any) {
        setActionError(error?.message || '启动 Local 失败。')
      }
    })()
  }, [
    acting,
    chooseMode,
    configWindow.open,
    continueLocal,
    loading,
    snapshot.mode,
    snapshot.state,
  ])

  useEffect(() => {
    if (loading || acting || launchingAuth) return
    if (configWindow.open) return
    if (snapshot.state !== 'ready' || !localIssuerUrl) return
    const autoSignInKey = `${localIssuerUrl}|${snapshot.provisionCode ?? ''}`
    if (autoSignInKeyRef.current === autoSignInKey) return

    autoSignInKeyRef.current = autoSignInKey
    void handleSignIn()
  }, [
    acting,
    configWindow.open,
    handleSignIn,
    launchingAuth,
    loading,
    localIssuerUrl,
    snapshot.provisionCode,
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
        ) : snapshot.state === 'mode_required' || snapshot.state === 'idle' ? (
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
            onUseDeviceOnly={
              snapshot.errorCode === 'LOCAL_REMOTE_READY_REQUIRES_SETUP'
                ? () => void handleDowngradeToDeviceOnly()
                : undefined
            }
            onBack={handleBack}
          />
        ) : (
          <ReadyCard
            mode={snapshot.mode}
            message={snapshot.message ?? 'Local 已准备好。'}
            detail={snapshot.publicUrl ?? snapshot.capabilities?.contract ?? snapshot.baseUrl ?? snapshot.localUrl ?? undefined}
            error={authError}
            busy={launchingAuth}
            backLabel={backLabel}
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
  onUseDeviceOnly,
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
  onUseDeviceOnly?: () => void
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
        {onUseDeviceOnly ? (
          <Button variant="outline" disabled={busy} onClick={onUseDeviceOnly}>
            改为只给这台设备用
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
  mode,
  message,
  detail,
  error,
  busy,
  backLabel,
  onSignIn,
  onConfigure,
  onBack,
}: {
  mode: LocalOnboardingMode | null
  message: string
  detail?: string
  error: string | null
  busy: boolean
  backLabel: string
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
          {mode === 'device-only'
            ? '下一步会打开本地 Local 登录页，完成后会回到 LinX。'
            : '下一步会打开 Cloud 登录页，流程完成后会回到 LinX。'}
        </p>
        {detail ? <p className="mt-2 text-xs text-muted-foreground break-all">{detail}</p> : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <Button disabled={busy} onClick={onSignIn}>
          {busy ? (mode === 'device-only' ? '正在打开 Local 登录…' : '正在打开 Cloud 登录…') : '继续登录'}
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

function getRepairContent(snapshot: {
  state: string
  errorCode: string | null
  message: string | null
}) {
  if (snapshot.errorCode === 'LOCAL_REMOTE_READY_REQUIRES_SETUP') {
    return {
      title: '还差一步让其他设备接入 Local',
      message: '你当前选择了多设备接入。要让手机或其他电脑也能访问，需要先给 Local 配一个固定可访问地址。',
      detail: '如果你现在只是想先开始使用，也可以直接切回“只给这台设备用”，不需要额外设置。',
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
