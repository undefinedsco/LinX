import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, X, AlertCircle, ChevronRight, HardDrive, ArrowLeft, Link2, ShieldAlert } from 'lucide-react'
import { isLocalAccessHostname } from '@/lib/local-access-url'
import { cn } from '@/lib/utils'
import type { LoginModalProps, LoginProviderOption } from './types'
import linxLogoUrl from '@/assets/linx-logo.png'
import {
  getProviderDisplayLabel,
} from './presentation'
import { resolveLoginProviderSource } from './provider-model'
import { LoginCardShell } from './LoginCardShell'
import { formatLoginErrorForUser } from './error-messages'
import { LocalReachabilitySummary } from './LocalReachabilitySummary'

export function LoginModal(props: LoginModalProps) {
  const { state, storageConflict, view } = props

  if (state === 'authenticated' && !storageConflict) return null

  return (
    <LoginCardShell cardSize="auto" cardClassName="min-h-[400px] max-h-[calc(100vh-32px)] has-[[data-login-view=other]]:min-h-0">
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
          onReopen={props.onReopenAuthWindow}
        />
      ) : view === 'local' ? (
        <LocalOnboardingView
          localOnboarding={props.localOnboarding}
          localProviderSource={props.localProviderSource}
          error={props.error}
          onBack={props.onBackFromLocal}
          onContinue={props.onContinueLocalLogin}
          onSwitchAccount={props.onSwitchAccount}
          onTestConnectivity={props.onTestLocalConnectivity}
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
          preferredSpace={props.preferredSpace}
          onSelectSpace={props.onSelectSpace}
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
      <div className="px-5 pt-8 pb-4 flex flex-col items-center justify-center gap-3 shrink-0">
        <AccountAvatar
          name={accountName}
          avatarUrl={storedAccount?.avatarUrl}
          size="lg"
          spaceMarker={resolveStoredAccountSpaceMarker(storedAccount)}
        />
        <p className="text-base font-semibold text-foreground">
          {isCreatePodSetup ? `${accountName} 在这里还没有空间` : '这个账号的数据在另一个空间'}
        </p>
        <p className="max-w-[19rem] text-center text-sm leading-6 text-muted-foreground">
          {isCreatePodSetup
            ? '创建后，LinX 会把你的聊天、文件和卡片保存在这里。'
            : '要去那里，还是在这里新建一个？'}
        </p>
      </div>

      <div className="mx-4">
        <Details>
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/25 p-4">
            <StorageDetail label="当前空间应写入" value={storageConflict.expectedStorageUrl} />
            <StorageDetail label="账号当前绑定" value={storageConflict.actualStorageUrl ?? '未绑定'} />
          </div>
        </Details>
      </div>

      <div className="mt-auto px-4 pb-4 pt-5 space-y-2">
        {canCreateHere ? (
          <button
            type="button"
            onClick={onOpenCurrentSpacePodSetup}
            className="w-full h-9 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
          >
            在这里创建
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          className={canCreateHere
            ? 'w-full h-9 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer'
            : 'w-full h-9 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer'}
        >
          换个空间
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
          <p className="-mt-2 text-xs text-muted-foreground">{getRememberedAccountBindingLabel(storedAccount)}</p>
        </>
      ) : null}
      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      <p className="text-xs text-muted-foreground">正在回到上次的位置…</p>
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
  const formattedError = error
    ? formatLoginErrorForUser(error, '操作失败，请返回上一步后重试。')
    : null
  const isSessionExpired = formattedError === '登录状态已失效。请重新登录。'

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex-1 px-5 py-8 flex flex-col items-center justify-center gap-4">
        {isSessionExpired ? (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            登录已过期
          </div>
        ) : null}
        <AccountAvatar
          name={storedAccount.displayName}
          avatarUrl={storedAccount.avatarUrl}
          size="lg"
          spaceMarker={resolveStoredAccountSpaceMarker(storedAccount)}
        />
        <div className="space-y-1 text-center">
          <p className="text-base font-semibold text-foreground">{storedAccount.displayName}</p>
          <p className="text-xs text-muted-foreground">{getRememberedAccountBindingLabel(storedAccount)}</p>
        </div>
        {isSessionExpired ? (
          <p className="max-w-[18rem] text-center text-xs leading-5 text-muted-foreground">
            没发出的草稿还在这台电脑，重新登录后继续。
          </p>
        ) : null}
      </div>

      {!isSessionExpired ? <ErrorBanner error={error} onClearError={onClearError} /> : null}

      <div className="px-5 pb-5 pt-2 space-y-2 shrink-0">
        <button
          onClick={onContinueStoredAccount}
          className="w-full h-9 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
        >
          {isSessionExpired ? '重新登录' : '进入'}
        </button>
        <button
          onClick={onSwitchAccount}
          className="w-full h-9 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
        >
          换个账号
        </button>
      </div>

      <Footer />
    </div>
  )
}

// ── ProviderSelectionView（S6：先选数据放哪） ───────────────────────────

interface SpaceChoice {
  id: 'cloud' | 'local' | 'standalone'
  title: string
  description: string
  provider: LoginProviderOption | undefined
  unavailableHint: string
}

function ProviderSelectionView({
  providers,
  error,
  localLoginStatus,
  onSelectSpace,
  onConnect,
  onAddProvider,
  onClearError,
}: {
  providers: LoginProviderOption[]
  error: string | null
  localLoginStatus: LoginModalProps['localLoginStatus']
  preferredSpace: 'cloud' | 'local'
  onSelectSpace: (space: 'cloud' | 'local') => void
  onConnect: (providerKey: string) => void
  onAddProvider: (url: string, label?: string) => void
  onClearError: () => void
}) {
  const [view, setView] = useState<'main' | 'other'>('main')
  const cloudProvider = providers.find((provider) => resolveLoginProviderSource(provider) === 'cloud')
  const localProvider = providers.find((provider) => resolveLoginProviderSource(provider) === 'local')
  const standaloneProvider = providers.find((provider) => resolveLoginProviderSource(provider) === 'standalone')

  if (view === 'other') {
    return (
      <OtherSpaceView
        providers={providers}
        onConnect={onConnect}
        onAddProvider={onAddProvider}
        onBack={() => setView('main')}
      />
    )
  }

  const choices: SpaceChoice[] = [
    {
      id: 'cloud',
      title: '云端空间',
      description: '用 undefineds 账号登录，数据保存在云端，换设备也能用',
      provider: cloudProvider,
      unavailableHint: '暂时连不上云端',
    },
    {
      id: 'local',
      title: '本机空间',
      description: '用云端账号登录，数据保存在这台电脑',
      provider: localProvider,
      unavailableHint: '没找到这台电脑上的 LinX 服务',
    },
    {
      id: 'standalone',
      title: '独立空间',
      description: '账号和数据都只在这台电脑，不需要网络账号',
      provider: standaloneProvider,
      unavailableHint: '没找到这台电脑上的 LinX 服务',
    },
  ]

  const choose = (choice: SpaceChoice) => {
    if (!choice.provider) return
    if (choice.id !== 'standalone') onSelectSpace(choice.id)
    onConnect(choice.provider.id)
  }

  return (
    <div className="flex-1 flex flex-col h-full px-6 py-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-12 w-12 overflow-hidden rounded-xl border border-border bg-muted p-0.5">
          <img src={linxLogoUrl} alt="LinX" className="h-full w-full scale-[1.24] object-cover" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-foreground">登录 LinX</h2>
          <p className="text-xs leading-5 text-muted-foreground">
            先选你的数据放在哪里。以后可以在 设置 › 空间与服务 里查看。
          </p>
        </div>
      </div>

      <div className="mt-5 flex-1 space-y-2 overflow-y-auto">
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            disabled={!choice.provider || localLoginStatus.active}
            onClick={() => choose(choice)}
            className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{choice.title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                {choice.provider ? choice.description : choice.unavailableHint}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
          </button>
        ))}
      </div>

      {localLoginStatus.active ? (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">正在启动本机空间…</p>
        </div>
      ) : null}

      <ErrorBanner error={error} onClearError={onClearError} />

      <div className="mt-3 shrink-0 space-y-1 text-center">
        <button
          type="button"
          onClick={() => setView('other')}
          className="h-8 w-full rounded-md text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground cursor-pointer"
        >
          使用其他空间…
        </button>
        <p className="text-[11px] text-muted-foreground/80">登录不会自动创建空间；需要创建时会先问你。</p>
      </div>
    </div>
  )
}

/** 其他 Solid 空间：粘贴空间地址继续；以前添加过的也在这里。 */
function OtherSpaceView({
  providers,
  onConnect,
  onAddProvider,
  onBack,
}: {
  providers: LoginProviderOption[]
  onConnect: (providerKey: string) => void
  onAddProvider: (url: string, label?: string) => void
  onBack: () => void
}) {
  const [customUrl, setCustomUrl] = useState('')
  const [customUrlError, setCustomUrlError] = useState<string | null>(null)
  const configuredProviders = providers.filter((provider) => resolveLoginProviderSource(provider) === 'custom')

  const handleAdd = () => {
    if (!customUrl.trim()) return
    try {
      const normalized = /^https?:\/\//iu.test(customUrl.trim()) ? customUrl.trim() : `https://${customUrl.trim()}`
      const parsed = new URL(normalized)
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
        throw new Error('Unsupported provider URL')
      }
      onAddProvider(normalized)
      onConnect(normalized)
      setCustomUrl('')
      setCustomUrlError(null)
    } catch {
      setCustomUrlError('连不上这个地址。确认它在运行，再试一次。')
    }
  }

  return (
    <div data-login-view="other" className="flex-1 flex flex-col px-5 py-5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
          aria-label="返回"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
      </div>
      <h2 className="mt-3 text-base font-semibold text-foreground">使用其他空间</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">已有 Solid 空间的话，粘贴它的地址。</p>
      {configuredProviders.length > 0 ? (
      <div className="mt-4 space-y-2 overflow-y-auto">
        {configuredProviders.map((provider) => (
          <button
            key={provider.id}
            type="button"
            onClick={() => onConnect(provider.id)}
            className="w-full rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-left hover:bg-muted/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{getProviderDisplayLabel(provider)}</p>
                <p className="mt-1 text-xs text-muted-foreground">已添加</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
            </div>
          </button>
        ))}
      </div>
      ) : null}
      <div className="mt-4 space-y-2">
        <input
          autoFocus
          type="url"
          aria-label="空间地址"
          aria-invalid={customUrlError ? true : undefined}
          aria-describedby={customUrlError ? 'custom-provider-url-error' : undefined}
          placeholder="https://pod.example.com"
          value={customUrl}
          onChange={(event) => {
            setCustomUrl(event.target.value)
            setCustomUrlError(null)
          }}
          onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
          className="w-full h-9 px-3 text-sm border border-border/60 rounded-lg bg-background focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
        />
        {customUrlError ? (
          <p id="custom-provider-url-error" role="alert" className="flex items-center gap-1.5 text-left text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {customUrlError}
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleAdd}
          disabled={!customUrl.trim()}
          className="h-9 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          继续
        </button>
      </div>
    </div>
  )
}


// ── ConnectingView ────────────────────────────────────────────────────

function ConnectingView({
  authWindowStatus,
  connectingProvider,
  onCancel,
  onReopen,
}: {
  authWindowStatus: LoginModalProps['authWindowStatus']
  connectingProvider: LoginModalProps['connectingProvider']
  onCancel: () => void
  onReopen?: () => void
}) {
  let title = '正在连接'
  let detail = connectingProvider
    ? '正在打开登录页'
    : '请稍候...'

  if (authWindowStatus.open) {
    title = '请在登录窗口完成'
    detail = '完成后会自动回到这里。窗口没看到，可以再打开一次。'
  } else if (authWindowStatus.reason === 'completed') {
    title = '正在验证身份'
    detail = connectingProvider?.storageProviderLabel ? '正在进入所选空间' : detail
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
        <p className="text-sm text-foreground font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{detail}</p>
        {connectingProvider ? (
          <div className="mt-4 w-full max-w-[18rem] rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            <p className="truncate text-xs font-medium text-foreground">
              {formatProviderLabelForUser(connectingProvider.storageProviderLabel)}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {formatProviderHost(connectingProvider.storageProviderUrl)}
            </p>
          </div>
        ) : null}
      </div>
      <div className="px-5 pb-5 shrink-0 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-9 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
        >
          取消
        </button>
        {authWindowStatus.open && onReopen ? (
          <button
            type="button"
            onClick={onReopen}
            className="flex-1 h-9 rounded-md border border-border/60 text-xs font-medium text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
          >
            重新打开
          </button>
        ) : null}
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
  onSwitchAccount,
  onTestConnectivity,
  onClearError,
}: {
  localOnboarding: LoginModalProps['localOnboarding']
  localProviderSource: LoginModalProps['localProviderSource']
  error: string | null
  onBack: () => void
  onContinue: () => void
  onSwitchAccount: () => void
  onTestConnectivity: () => Promise<void> | void
  onClearError: () => void
}) {
  const snapshot = localOnboarding
  const autoProbeKeyRef = useRef<string | null>(null)
  const isStandalone = localProviderSource === 'standalone'
  const productLabel = isStandalone ? '独立空间' : '本机空间'
  const onboardingState = snapshot?.state ?? 'idle'
  const isReady = onboardingState === 'ready'
  const connectivity = !isStandalone ? snapshot?.connectivity : null
  const isLocalNetworkBlocked = Boolean(
    isReady
    && connectivity
    && (connectivity.status === 'failed' || connectivity.status === 'mismatch')
  )
  const isPendingStart = onboardingState === 'space_required' || onboardingState === 'idle'
  const isRepair = onboardingState === 'repair_required'
  const isError = onboardingState === 'error'
  const isStarting = onboardingState === 'starting' || onboardingState === 'checking'
  const progressDetail = getLocalPreparationDetail(onboardingState, snapshot?.progress?.phase)
  const localUrl = snapshot?.localUrl ?? snapshot?.baseUrl ?? null

  useEffect(() => {
    if (!isReady || isStandalone || !snapshot) {
      return
    }

    if (connectivity && connectivity.status !== 'unknown') {
      return
    }

    const probeKey = [
      snapshot.spaceKind ?? '',
      snapshot.localUrl ?? '',
      snapshot.publicUrl ?? '',
    ].join('|')
    if (autoProbeKeyRef.current === probeKey) {
      return
    }

    autoProbeKeyRef.current = probeKey
    void Promise.resolve(onTestConnectivity()).catch(() => undefined)
  }, [
    connectivity,
    isReady,
    isStandalone,
    onTestConnectivity,
    snapshot,
    snapshot?.localUrl,
    snapshot?.publicUrl,
    snapshot?.spaceKind,
  ])

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="px-5 pt-5 pb-3 shrink-0 flex items-center gap-2">
        <button
          onClick={onBack}
          className="-ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
          aria-label="返回空间选择"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>
        <h2 className="text-lg font-semibold text-foreground">{productLabel}</h2>
      </div>

      <ErrorBanner error={error} onClearError={onClearError} />

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-2">
        <div className="flex min-h-full flex-col justify-center gap-4">
          {(isPendingStart || isStarting) && (
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
              <p className="text-sm font-medium text-foreground">正在准备{productLabel}</p>
              <p className="max-w-[18rem] text-xs leading-5 text-muted-foreground">{progressDetail}</p>
              {isStarting ? <PreparationProgress progress={snapshot?.progress} /> : null}
            </div>
          )}

          {isReady && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-foreground text-center">
                {isLocalNetworkBlocked ? '本机空间入口异常' : `${productLabel} 已准备好`}
              </p>
              {isLocalNetworkBlocked ? (
                <p className="text-xs text-muted-foreground leading-relaxed text-center">
                  {formatLocalStatusMessageForUser(
                    connectivity?.message,
                    '本机入口不可达。请确认本机空间已启动后重试。',
                  )}
                </p>
              ) : null}
              {isStandalone ? (
                <RouteInfoCard title="本机入口" value={localUrl} />
              ) : null}
              {!isStandalone ? (
                <LocalReachabilitySummary connectivity={connectivity} assumeLocalReachable />
              ) : null}
              <button
                onClick={onContinue}
                className="w-full h-9 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
              >
                {isLocalNetworkBlocked ? '重新检测' : '继续登录'}
              </button>
            </div>
          )}

          {(isRepair || isError) && (
            <LocalUnavailableRecovery
              canOpenSettings={Boolean(snapshot?.canOpenSettings)}
              canRetry={Boolean(snapshot?.canRetry)}
              onRetry={onContinue}
              onOpenSettings={() => {
                const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
                desktopApi?.app?.openConfigWindow?.()
              }}
              onSwitchAccount={onSwitchAccount}
            />
          )}
        </div>
      </div>

      <div className="px-5 pb-5 shrink-0" />

      <Footer />
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
    <div className="rounded-lg border border-border/60 bg-muted/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground/70">{title}</p>
        {action}
      </div>
      <p className="mt-2 break-all font-mono text-[11px] leading-5 text-foreground">
        {value ?? '正在获取入口'}
      </p>
    </div>
  )
}

function LocalUnavailableRecovery({
  canRetry,
  canOpenSettings,
  onRetry,
  onOpenSettings,
  onSwitchAccount,
}: {
  canRetry: boolean
  canOpenSettings: boolean
  onRetry: () => void
  onOpenSettings: () => void
  onSwitchAccount: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <AlertCircle className="w-6 h-6 text-destructive" />
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">本机空间没有启动</p>
        <p className="max-w-[18rem] text-xs leading-5 text-muted-foreground">
          先重新检查；还不行就重启 LinX，它会自己修复。不会自动换成云端空间。
        </p>
      </div>
      <div className="w-full space-y-2">
        <button
          type="button"
          onClick={onRetry}
          disabled={!canRetry}
          className="w-full h-9 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          重新检查
        </button>
        <Details>
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={onOpenSettings}
              disabled={!canOpenSettings}
              className="h-8 rounded-md px-3 text-xs text-foreground hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              打开本机服务设置
            </button>
            <button
              type="button"
              onClick={onSwitchAccount}
              className="h-8 rounded-md px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer"
            >
              换个空间
            </button>
          </div>
        </Details>
      </div>
    </div>
  )
}

/** 技术细节收进“详情”，默认收起。 */
function Details({ children }: { children: ReactNode }) {
  return (
    <details className="group w-full text-center">
      <summary className="inline-flex h-7 cursor-pointer list-none items-center justify-center rounded-md px-2 text-xs text-muted-foreground hover:text-foreground">
        详情
      </summary>
      <div className="mt-1 text-left">{children}</div>
    </details>
  )
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
  const radius = 'rounded-xl'
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
          isProductLogo && 'border border-border bg-muted p-0.5',
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
      <div className={cn(dim, radius, 'relative overflow-hidden border border-border bg-muted p-0.5')}>
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

/**
 * First-time setup progress. The desktop reports a phase and, while it
 * installs components, sometimes a percentage in its text; with no number the
 * bar is indeterminate.
 */
function PreparationProgress({ progress }: { progress: NonNullable<LoginModalProps['localOnboarding']>['progress'] }) {
  if (!progress) return null
  const downloading = progress.phase === 'install-bun' || progress.phase === 'install-npm'
  const percent = parsePreparationPercent(progress)
  return (
    <div className="flex w-full max-w-[18rem] flex-col gap-1.5">
      <div
        role="progressbar"
        aria-label={downloading ? '下载组件' : '准备进度'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full bg-primary', percent === null && 'w-1/3 animate-pulse')}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      {downloading ? (
        <p className="text-[11px] text-muted-foreground">
          下载组件{percent === null ? '' : ` ${percent}%`} · 只在第一次需要。准备好会自动继续登录。
        </p>
      ) : null}
    </div>
  )
}

export function parsePreparationPercent(progress: { label?: string | null; detail?: string | null }): number | null {
  const match = /(\d{1,3})\s*%/.exec(`${progress.detail ?? ''} ${progress.label ?? ''}`)
  if (!match) return null
  const value = Number(match[1])
  return value >= 0 && value <= 100 ? value : null
}

function getLocalPreparationDetail(
  state: NonNullable<LoginModalProps['localOnboarding']>['state'],
  progressPhase: string | undefined,
): string {
  if (state === 'checking') return '正在验证本机空间'
  if (progressPhase === 'register-cloud') return '正在准备登录授权'
  return '正在启动本机服务'
}

function formatLocalStatusMessageForUser(value: string | null | undefined, fallback: string): string {
  return formatLoginErrorForUser(value, fallback)
}

function formatProviderLabelForUser(value: string | undefined): string {
  if (value === 'Cloud') return '云端空间'
  if (value === 'Local') return '本机空间'
  if (value === 'Standalone') return '独立空间'
  return value ?? '所选空间'
}

function ErrorBanner({ error, onClearError }: { error: string | null; onClearError: () => void }) {
  if (!error) return null
  const message = formatLoginErrorForUser(error, '操作失败，请返回上一步后重试。')

  return (
    <div className="mx-4 mb-3 px-3 py-2 bg-destructive/10 rounded-lg flex items-start gap-2 shrink-0">
      <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
      <p className="text-xs text-destructive flex-1 leading-relaxed">{message}</p>
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

function getRememberedAccountBindingLabel(account: NonNullable<LoginModalProps['storedAccount']>): string {
  const issuer = resolveRememberedIssuerLabel(account)
  const marker = resolveStoredAccountSpaceMarker(account)

  if (marker === 'local') return issuer === '本机空间' ? issuer : `${issuer} · 本机空间`
  if (marker === 'standalone') return issuer === '独立空间' ? issuer : `${issuer} · 独立空间`

  const storageLabel = account.storageProviderLabel?.toLowerCase()
  const storageUrl = account.storageProviderUrl ?? ''
  if (storageLabel === 'cloud' || /undefineds\.co/i.test(storageUrl)) {
    return issuer === '云端' ? '云端空间' : `${issuer} · 云端空间`
  }

  return account.storageProviderLabel ? `${issuer} · ${localizeAccountLabel(account.storageProviderLabel)}` : issuer
}

function resolveRememberedIssuerLabel(account: NonNullable<LoginModalProps['storedAccount']>): string {
  if (account.issuerLabel?.toLowerCase().includes('undefineds') || account.issuerUrl?.includes('id.undefineds.co')) {
    return 'undefineds'
  }

  return localizeAccountLabel(account.issuerLabel) || '账号'
}

/** Stored labels are English keys (`Standalone`, `Local`, `Cloud`); the card shows Chinese only. */
function localizeAccountLabel(label?: string): string | undefined {
  switch (label?.trim().toLowerCase()) {
    case 'standalone': return '独立空间'
    case 'local': return '本机空间'
    case 'cloud': return '云端'
    default: return label
  }
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

function StorageDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground/70">
        {label}
      </p>
      <div className="rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground break-all">
        {value}
      </div>
    </div>
  )
}
