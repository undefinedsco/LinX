import { createLinxAgentStreamAdapter, type LinxAgentStreamAdapter, type LinxCompletionBackendResult } from './stream.js'
import { ensureBrowserConsentLogin, isOidcLoginExpiredError, isOidcTransientRemoteError } from '../oidc-auth.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID, resolvePreferredLinxCloudModelId } from '../default-model.js'
import { ensureLinxPiTheme } from '../linx-theme.js'
import {
  type BashOperations,
  type AgentSessionRuntime,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  createCodingTools,
  createLocalBashOperations,
} from '@earendil-works/pi-coding-agent'
// web_fetch / web_search are now handled by pi-web-access
import type { Api, Model, OAuthCredentials } from '@earendil-works/pi-ai'
import { isRemoteAuthExpiredError, type RemoteAuthFetch, type RemoteChatMessage, type RemoteChatTool } from '../chat-api.js'
import type { AutoModeWorkerBackend } from '../auto-mode/types.js'
import type { BackendCommandRouter, BackendCommandResult } from '../backend-command.js'
import { clearDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'
import type { CodexApprovalPolicy } from '../codex-plugin/codex-native-proxy.js'
import { loadCredentials } from '../credentials-store.js'
import { createLinxBearerAuthFetch, resolveLinxCloudRuntimeAuthFetch, resolveRuntimeAuthFetchFromApiKey } from '../linx-cloud-runtime-auth.js'
import { LINX_RUNTIME_MANAGED_AUTH_KEY } from '../linx-runtime-auth.js'
import {
  LINX_WEB_ACCESS_PACKAGE_SOURCE,
  ensurePiWebAccessConfig,
  resolveBundledLinxSkillsDir,
  resolveBundledPiPackageRoot,
  resolveInstalledMarketSkillDirs,
  withLinxSkillSourceInfo,
} from '../linx-runtime-resources.js'
import {
  LINX_CLOUD_PROVIDER_API,
  LINX_CLOUD_PROVIDER_ID,
  LINX_CLOUD_PROVIDER_LABEL,
  buildFallbackLinxCloudProviderModels,
  buildLinxCloudProviderModel,
  mergeLinxCloudProviderModels,
  sanitizeLinxCloudDefaults,
} from '../linx-cloud-models.js'

const UNDEFINEDS_SESSION_ID = 'undefineds_pi_frontend'
const UNDEFINEDS_AUTH_BRIDGE_ID = 'undefineds-cloud-oauth-bridge'
export const DEFAULT_LINX_PI_BASH_TIMEOUT_SECONDS = 15

export interface LinxRuntimeAdapterDependencies {
  createNativeProxy?: (options?: {
    cwd?: string
    model?: string
    listenPort?: number
    autoEnabled?: boolean
    codexApprovalPolicy?: CodexApprovalPolicy
    passthroughArgs?: string[]
    env?: Record<string, string>
    resolveEnv?: () => Promise<Record<string, string> | undefined>
  }) => {
    remoteUrl: string
    record: {
      id: string
      cwd: string
      model?: string
      backend: string
    }
    start(): Promise<void>
    sendTurn(input: string): Promise<void>
    executeCommand?(input: string): Promise<BackendCommandResult>
    setAutoEnabled?(enabled: boolean): Promise<void> | void
    setCwd?(cwd: string): Promise<void> | void
    setSessionControl?(control: import('../session-control.js').SessionControlManager): void
    subscribe(listener: (event: import('../auto-mode/types.js').AutoModeNormalizedEvent) => void): () => void
    close(): Promise<void>
  }
  createRemoteCompletion?: (options: {
    runtimeUrl: string
    authFetch: RemoteAuthFetch
    model?: string
    messages: RemoteChatMessage[]
    tools?: RemoteChatTool[]
    systemPrompt?: string
    signal?: AbortSignal
  }) => Promise<string | LinxCompletionBackendResult>
  listRemoteModels?: (
    authFetch: RemoteAuthFetch,
    runtimeUrl: string,
    options?: { fallback?: boolean; timeoutMs?: number },
  ) => Promise<Array<{
    id: string
    contextWindow?: number
  }>>
}

/** @deprecated Use LinxRuntimeAdapterDependencies. */
export type PiRuntimeAdapterDependencies = LinxRuntimeAdapterDependencies

export interface LinxRuntimeFactoryContext {
  cwd: string
  agentDir: string
  sessionManager: unknown
  sessionStartEvent?: unknown
}

export type LinxCreateRuntimeFactory = (context: LinxRuntimeFactoryContext) => Promise<AgentSessionRuntime>
/** @deprecated Use LinxRuntimeFactoryContext. */
export type PiRuntimeFactoryContext = LinxRuntimeFactoryContext
/** @deprecated Use LinxCreateRuntimeFactory. */
export type PiCreateRuntimeFactory = LinxCreateRuntimeFactory

export interface LinxRuntimeAdapterOptions {
  cwd?: string
  model?: string
  port?: number
  backend?: 'cloud' | 'native'
  workerBackend?: AutoModeWorkerBackend
  autoEnabled?: boolean
  symphonyEnabled?: boolean
  codexApprovalPolicy?: CodexApprovalPolicy
  passthroughArgs?: string[]
  backendEnv?: Record<string, string>
  resolveBackendEnv?: () => Promise<Record<string, string> | undefined>
  getPodDataSession?: () => Promise<PodDataSession | null>
  providerConfig?: {
    baseUrl: string
    issuerUrl?: string
    oauth?: {
      name: string
      login(...args: unknown[]): Promise<OAuthCredentials>
      refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>
      getApiKey(credentials: OAuthCredentials): string
      modifyModels?(models: Model<Api>[], credentials: OAuthCredentials): Model<Api>[]
    }
  }
}

/** @deprecated Use LinxRuntimeAdapterOptions. */
export type PiRuntimeAdapterOptions = LinxRuntimeAdapterOptions

export interface LinxCloudPiAuthBridge {
  description: 'undefineds-cloud-oauth-bridge'
  providerId: 'undefineds'
  providerLabel: 'LinX Cloud'
  runtimeUrl: string
  shouldPromptLoginOnStart?: boolean
}

export type LinxStartupLoginPromptDecision =
  | { shouldPrompt: false; reason: 'print-mode' | 'native-backend' | 'credential-present' }
  | { shouldPrompt: true; reason: 'missing-credential' | 'expired-credential' }

export type LinxStartupLoginReason = 'startup' | 'expired' | null

export async function resolveLinxStartupLoginPromptDecision(options: {
  backend: 'cloud' | 'native'
  print?: boolean
  issuerUrl?: string
  resolveSession?: () => Promise<Pick<PodDataSession, 'close'> | null>
  loadStoredCredentials?: typeof loadCredentials
}): Promise<LinxStartupLoginPromptDecision> {
  if (options.print) {
    return { shouldPrompt: false, reason: 'print-mode' }
  }
  if (options.backend === 'native') {
    return { shouldPrompt: false, reason: 'native-backend' }
  }

  if (!options.resolveSession) {
    return (options.loadStoredCredentials ?? loadCredentials)()
      ? { shouldPrompt: false, reason: 'credential-present' }
      : { shouldPrompt: true, reason: 'missing-credential' }
  }

  const resolveSession = options.resolveSession
  let session: Pick<PodDataSession, 'close'> | null = null
  try {
    session = await resolveSession()
    return session
      ? { shouldPrompt: false, reason: 'credential-present' }
      : { shouldPrompt: true, reason: 'missing-credential' }
  } catch (error) {
    if (isOidcLoginExpiredError(error)) {
      return { shouldPrompt: true, reason: 'expired-credential' }
    }
    if (isOidcTransientRemoteError(error) && (options.loadStoredCredentials ?? loadCredentials)()) {
      return { shouldPrompt: false, reason: 'credential-present' }
    }
    throw error
  } finally {
    await session?.close().catch(() => undefined)
  }
}

export function resolveLinxStartupLoginReason(
  decision: LinxStartupLoginPromptDecision,
): LinxStartupLoginReason {
  if (!decision.shouldPrompt) {
    return null
  }

  return decision.reason === 'expired-credential' ? 'expired' : 'startup'
}

export function resolveLinxInteractiveLoginReason(options: {
  startupDecision: LinxStartupLoginPromptDecision
  runtimePromptOnStart?: boolean
}): LinxStartupLoginReason {
  if (options.runtimePromptOnStart) {
    return 'expired'
  }

  return resolveLinxStartupLoginReason(options.startupDecision)
}

export interface LinxRuntimeAdapter {
  readonly remoteUrl: string
  readonly sessionId: string
  readonly cwd: string
  readonly model?: string
  readonly backend: 'linx'
  readonly runtimeBackend?: AutoModeWorkerBackend
  readonly autoEnabled: boolean
  readonly symphonyEnabled: boolean
  readonly backendCommandRouter?: BackendCommandRouter
  readonly streamAdapter: LinxAgentStreamAdapter
  createRuntime: LinxCreateRuntimeFactory
  start(): Promise<void>
  close(): Promise<void>
}

export function createLinxRuntimeAdapter(
  dependencies: LinxRuntimeAdapterDependencies,
  options: LinxRuntimeAdapterOptions = {},
): LinxRuntimeAdapter {
  const backendMode = options.backend ?? 'cloud'
  const workerBackend = options.workerBackend ?? (backendMode === 'native' ? 'codex' : undefined)
  const cwd = options.cwd ?? process.cwd()
  const requestedModel = options.model?.trim() || undefined
  let activeModelId = requestedModel ?? DEFAULT_LINX_CLOUD_MODEL_ID
  const baseUrl = options.providerConfig?.baseUrl ?? 'https://api.undefineds.co/v1'
  let shouldPromptLoginOnStart = false
  const providerModels: Array<{
    id: string
    name: string
    api: Api
    reasoning: boolean
    input: ['text']
    cost: {
      input: number
      output: number
      cacheRead: number
      cacheWrite: number
    }
    contextWindow: number
    maxTokens: number
    compat: {
      supportsStore: false
      supportsDeveloperRole: false
      supportsStrictMode: false
    }
  }> = buildFallbackLinxCloudProviderModels(activeModelId)
  const proxy = backendMode === 'native'
    ? dependencies.createNativeProxy?.({
      cwd,
      model: requestedModel,
      listenPort: options.port,
      autoEnabled: options.autoEnabled,
      codexApprovalPolicy: options.codexApprovalPolicy,
      passthroughArgs: options.passthroughArgs,
      env: options.backendEnv,
      resolveEnv: options.resolveBackendEnv,
    })
    : null

  if (backendMode === 'native' && !proxy) {
    throw new Error('Native LinX runtime backend requires createNativeProxy')
  }

  if (backendMode === 'cloud' && !options.providerConfig?.oauth && !dependencies.createRemoteCompletion) {
    throw new Error('Cloud LinX runtime backend requires createRemoteCompletion')
  }

  const streamAdapter = createLinxAgentStreamAdapter({
    sessionId: proxy?.record.id ?? UNDEFINEDS_SESSION_ID,
    cwd: proxy?.record.cwd ?? cwd,
    model: proxy?.record.model ?? activeModelId,
    backend: proxy
      ? {
        sendTurn(input) {
          return proxy.sendTurn(input)
        },
        subscribe(listener) {
          return proxy.subscribe(listener)
        },
      }
      : undefined,
    completionBackend: !proxy && dependencies.createRemoteCompletion
      ? {
        async complete(input) {
          const authFetch = options.providerConfig?.oauth
            ? input.authFetch
              ?? resolveRuntimeAuthFetchFromApiKey(input.apiKey)
              ?? await resolveLinxCloudRuntimeAuthFetch({
                issuerUrl: options.providerConfig?.issuerUrl,
                getPodDataSession: options.getPodDataSession,
              })
            : await resolveLinxCloudRuntimeAuthFetch({
              issuerUrl: options.providerConfig?.issuerUrl,
              getPodDataSession: options.getPodDataSession,
            })
          return completeWithAuthRecovery(authFetch, {
            runtimeUrl: baseUrl,
            model: input.model,
            messages: withSystemPrompt(input.systemPrompt, input.messages),
            tools: input.tools,
            signal: input.signal,
          })
        },
      }
      : undefined,
  })
  const backendCommandRouter: BackendCommandRouter | undefined = proxy && typeof proxy.executeCommand === 'function'
    ? {
      backend: proxy.record.backend,
      execute(input) {
        return proxy.executeCommand!(input)
      },
      setCwd: typeof proxy.setCwd === 'function'
        ? (nextCwd) => proxy.setCwd!(nextCwd)
        : undefined,
      subscribe(listener) {
        return proxy.subscribe(listener)
      },
      setSessionControl: typeof proxy.setSessionControl === 'function'
        ? (control) => proxy.setSessionControl!(control)
        : undefined,
    }
    : undefined

  return {
    remoteUrl: proxy?.remoteUrl ?? baseUrl,
    sessionId: proxy?.record.id ?? UNDEFINEDS_SESSION_ID,
    cwd: proxy?.record.cwd ?? cwd,
    model: proxy?.record.model ?? activeModelId,
    backend: 'linx',
    runtimeBackend: workerBackend,
    autoEnabled: options.autoEnabled === true,
    symphonyEnabled: options.symphonyEnabled === true,
    backendCommandRouter,
    streamAdapter,
    createRuntime: async (context: LinxRuntimeFactoryContext): Promise<AgentSessionRuntime> => {
      const authStorage = AuthStorage.inMemory()
      const modelRegistry = ModelRegistry.inMemory(authStorage)
      const originalIsUsingOAuth = modelRegistry.isUsingOAuth.bind(modelRegistry)
      modelRegistry.isUsingOAuth = (model) => (
        model.provider === LINX_CLOUD_PROVIDER_ID ? false : originalIsUsingOAuth(model)
      )
      const linxOAuthProvider = options.providerConfig?.oauth ?? {
        name: 'LinX Cloud',
        usesCallbackServer: true,
        async login(callbacks: {
          onAuth(info: { url: string; instructions?: string }): void
          onProgress?(message: string): void
          onManualCodeInput?: (signal?: AbortSignal) => Promise<string>
          forceFresh?: boolean
          signal?: AbortSignal
        }) {
          callbacks.onProgress?.('Opening LinX Cloud login in your browser...')
          const result = await ensureBrowserConsentLogin({
            issuerUrl: options.providerConfig?.issuerUrl,
            forceFresh: callbacks.forceFresh,
            signal: callbacks.signal,
            onAuthUrl(url) {
              callbacks.onAuth({
                url,
                instructions: 'Complete LinX Cloud consent in your browser. If the local callback is blocked, paste the final redirect URL below.',
              })
            },
            manualRedirectUrl: callbacks.onManualCodeInput,
          })
          clearDefaultPodDataSession()
          if (result.reusedExistingSession) {
            callbacks.onProgress?.('Reused existing LinX Cloud session.')
          }
          const authFetch = await resolveLinxCloudRuntimeAuthFetch({
            issuerUrl: options.providerConfig?.issuerUrl,
            getPodDataSession: options.getPodDataSession,
          })
          await syncProviderModels({ runtimeFetch: authFetch })

          return {
            refresh: result.tokenSet.refreshToken ?? '',
            access: LINX_RUNTIME_MANAGED_AUTH_KEY,
            expires: result.tokenSet.expiresAt ? result.tokenSet.expiresAt * 1000 : Date.now() + 60 * 60 * 1000,
          }
        },
        async refreshToken(credentials: OAuthCredentials) {
          clearDefaultPodDataSession()
          const authFetch = await resolveLinxCloudRuntimeAuthFetch({
            issuerUrl: options.providerConfig?.issuerUrl,
            getPodDataSession: options.getPodDataSession,
          })
          await syncProviderModels({ runtimeFetch: authFetch })
          return {
            type: 'oauth',
            refresh: credentials.refresh,
            access: LINX_RUNTIME_MANAGED_AUTH_KEY,
            expires: Date.now() + 60 * 60 * 1000,
          }
        },
        getApiKey(credentials: OAuthCredentials) {
          return credentials.access === LINX_RUNTIME_MANAGED_AUTH_KEY
            ? LINX_RUNTIME_MANAGED_AUTH_KEY
            : LINX_RUNTIME_MANAGED_AUTH_KEY
        },
      }
      const storedCredentials = options.providerConfig?.oauth ? null : loadCredentials()
      const hasManagedPodSession = !options.providerConfig?.oauth && Boolean(options.getPodDataSession)
      const explicitOAuthCredential = options.providerConfig?.oauth
        ? await options.providerConfig.oauth.login()
        : null
      if (storedCredentials || hasManagedPodSession) {
        const authFetch = await resolveLinxCloudRuntimeAuthFetch({
          issuerUrl: options.providerConfig?.issuerUrl,
          getPodDataSession: options.getPodDataSession,
        })
        await syncProviderModels({ runtimeFetch: authFetch }, { refreshOnAuthExpired: true })
      } else if (explicitOAuthCredential?.access) {
        await syncProviderModels({ runtimeFetch: createLinxBearerAuthFetch(explicitOAuthCredential.access) })
      }
      modelRegistry.registerProvider(LINX_CLOUD_PROVIDER_ID, {
        api: LINX_CLOUD_PROVIDER_API,
        baseUrl,
        apiKey: '$LINX_RUNTIME_AUTH',
        oauth: linxOAuthProvider,
        authHeader: false,
        streamSimple: streamAdapter.streamFn,
        models: providerModels,
      })
      if (!options.providerConfig?.oauth) {
        authStorage.setRuntimeApiKey(LINX_CLOUD_PROVIDER_ID, LINX_RUNTIME_MANAGED_AUTH_KEY)
      }
      if (options.providerConfig?.oauth && explicitOAuthCredential) {
        authStorage.set(LINX_CLOUD_PROVIDER_ID, { type: 'oauth', ...explicitOAuthCredential })
      }

      const settingsManager = SettingsManager.create(context.cwd, context.agentDir)
      ensureLinxPiTheme(context.agentDir)
      ensurePiWebAccessConfig()
      settingsManager.setTheme('linx')
      const defaultModelId = sanitizeLinxCloudDefaults(settingsManager, requestedModel, providerModels)
      activeModelId = defaultModelId
      const bundledSkillsDir = resolveBundledLinxSkillsDir()
      const marketSkillDirs = resolveInstalledMarketSkillDirs()
      const additionalSkillPaths = [
        ...(bundledSkillsDir ? [bundledSkillsDir] : []),
        ...marketSkillDirs,
      ]
      const bundledPackagePaths = [
        resolveBundledPiPackageRoot(LINX_WEB_ACCESS_PACKAGE_SOURCE),
      ].filter((path): path is string => Boolean(path))
      const services = await createAgentSessionServices({
        cwd: context.cwd,
        agentDir: context.agentDir,
        authStorage,
        settingsManager,
        modelRegistry,
        resourceLoaderOptions: {
          // Built-in: pi-web-access handles web_search, fetch_content, and related web tools.
          additionalExtensionPaths: bundledPackagePaths,
          additionalSkillPaths,
          skillsOverride: (base) => withLinxSkillSourceInfo(base, {
            bundledSkillsDir,
            marketSkillDirs,
          }),
          systemPromptOverride: overrideLinxSystemPrompt,
        },
      })
      const selectedModel = modelRegistry.find(LINX_CLOUD_PROVIDER_ID, defaultModelId)
        ?? modelRegistry.getAvailable().find((candidate) => candidate.provider === LINX_CLOUD_PROVIDER_ID)
      if (!selectedModel) {
        throw new Error('Failed to resolve undefineds model from the LinX runtime adapter')
      }
      const created = await createAgentSessionFromServices({
        services,
        sessionManager: context.sessionManager as SessionManager,
        sessionStartEvent: context.sessionStartEvent as never,
        model: selectedModel,
      })
      const session = created.session
      enableLinxXhighThinking(session)
      if (session.model?.provider !== selectedModel.provider || session.model.id !== selectedModel.id) {
        await session.setModel(selectedModel)
      }
      const runtime = await createAgentSessionRuntime(async () => ({
        ...created,
        session,
        services,
        diagnostics: services.diagnostics,
      }), {
        cwd: context.cwd,
        agentDir: context.agentDir,
        sessionManager: context.sessionManager as SessionManager,
        sessionStartEvent: context.sessionStartEvent as never,
      })
      ;(runtime as unknown as Record<string, unknown>).backend = 'linx'
      ;(runtime as unknown as Record<string, unknown>).runtimeBackend = workerBackend
      ;(runtime as unknown as Record<string, unknown>).autoEnabled = options.autoEnabled === true
      ;(runtime as unknown as Record<string, unknown>).symphonyEnabled = options.symphonyEnabled === true
      ;(runtime as unknown as Record<string, unknown>).linxAuthBridge = {
        description: UNDEFINEDS_AUTH_BRIDGE_ID,
        providerId: LINX_CLOUD_PROVIDER_ID,
        providerLabel: LINX_CLOUD_PROVIDER_LABEL,
        runtimeUrl: baseUrl,
        shouldPromptLoginOnStart,
      } satisfies LinxCloudPiAuthBridge
      if (backendCommandRouter) {
        ;(runtime as unknown as Record<string, unknown>).backendCommandRouter = backendCommandRouter
      }
      if (proxy) {
        ;(runtime as unknown as Record<string, unknown>).backendSessionRef = proxy.record
      }
      if (options.getPodDataSession) {
        ;(runtime as unknown as Record<string, unknown>).getPodDataSession = options.getPodDataSession
      }
      return runtime
    },
    async start(): Promise<void> {
      await proxy?.start()
    },
    async close(): Promise<void> {
      await proxy?.close()
    },
  }

  async function syncProviderModels(authSession: { runtimeFetch: RemoteAuthFetch }, options: { throwAuthExpired?: boolean; refreshOnAuthExpired?: boolean } = {}): Promise<void> {
    if (!dependencies.listRemoteModels) {
      return
    }

    const remoteModels = await listRemoteModelsWithAuthRecovery(authSession.runtimeFetch, options)
    if (remoteModels.length === 0) {
      return
    }

    const mergedModels = mergeLinxCloudProviderModels(remoteModels.map((entry) => ({
      id: entry.id,
      contextWindow: entry.contextWindow,
    })), activeModelId)
    const nextModels = mergedModels.map((entry) => buildLinxCloudProviderModel(entry))
    providerModels.splice(0, providerModels.length, ...nextModels)

    if (!requestedModel) {
      activeModelId = resolvePreferredLinxCloudModelId(nextModels, activeModelId)
    }
  }

  async function listRemoteModelsWithAuthRecovery(
    authFetch: RemoteAuthFetch,
    recoveryOptions: { throwAuthExpired?: boolean; refreshOnAuthExpired?: boolean },
  ): Promise<Array<{ id: string; contextWindow?: number }>> {
    try {
      return await dependencies.listRemoteModels!(authFetch, baseUrl, { fallback: false, timeoutMs: 5000 })
    } catch (error) {
      if (!isAuthExpiredError(error)) {
        return []
      }

      if (recoveryOptions.refreshOnAuthExpired) {
        try {
          const refreshedAuthFetch = await resolveRefreshedLinxPiCloudAuthFetch()
          if (refreshedAuthFetch) {
            return await dependencies.listRemoteModels!(refreshedAuthFetch, baseUrl, { fallback: false, timeoutMs: 5000 })
          }
        } catch (retryError) {
          if (!isAuthExpiredError(retryError)) {
            return []
          }
        }
      }

      shouldPromptLoginOnStart = true
      if (recoveryOptions.throwAuthExpired) {
        throw error
      }
      return []
    }
  }

  async function completeWithAuthRecovery(
    authFetch: RemoteAuthFetch,
    request: {
      runtimeUrl: string
      model?: string
      messages: RemoteChatMessage[]
      tools?: RemoteChatTool[]
      signal?: AbortSignal
    },
  ): Promise<string | LinxCompletionBackendResult> {
    try {
      return await dependencies.createRemoteCompletion!({
        ...request,
        authFetch,
      })
    } catch (error) {
      if (!isAuthExpiredError(error)) {
        throw error
      }

      const refreshedAuthFetch = await resolveRefreshedLinxPiCloudAuthFetch()
      if (!refreshedAuthFetch) {
        throw error
      }

      return dependencies.createRemoteCompletion!({
        ...request,
        authFetch: refreshedAuthFetch,
      })
    }
  }

  async function resolveRefreshedLinxPiCloudAuthFetch(): Promise<RemoteAuthFetch | null> {
    clearDefaultPodDataSession()

    const storedCredentials = loadCredentials()
    if (storedCredentials || options.getPodDataSession) {
      return resolveLinxCloudRuntimeAuthFetch({
        issuerUrl: options.providerConfig?.issuerUrl,
        getPodDataSession: options.getPodDataSession,
      })
    }

    return null
  }
}

/** @deprecated Use LinxRuntimeAdapter. */
export type PiRuntimeAdapter = LinxRuntimeAdapter

/** @deprecated Use createLinxRuntimeAdapter. */
export const createPiRuntimeAdapter = createLinxRuntimeAdapter

function enableLinxXhighThinking(session: {
  model?: { provider?: string; reasoning?: boolean }
  supportsXhighThinking?: () => boolean
  getAvailableThinkingLevels?: () => string[]
}): void {
  const originalSupportsXhighThinking = session.supportsXhighThinking?.bind(session)
  const originalGetAvailableThinkingLevels = session.getAvailableThinkingLevels?.bind(session)

  session.supportsXhighThinking = () => (
    session.model?.provider === LINX_CLOUD_PROVIDER_ID && session.model.reasoning
      ? (session.getAvailableThinkingLevels?.().includes('xhigh') ?? true)
      : (originalSupportsXhighThinking?.() ?? false)
  )

  if (originalGetAvailableThinkingLevels) {
    session.getAvailableThinkingLevels = () => {
      const levels = originalGetAvailableThinkingLevels()
      if (session.model?.provider === LINX_CLOUD_PROVIDER_ID && session.model.reasoning && !levels.includes('xhigh')) {
        return [...levels, 'xhigh']
      }
      return levels
    }
  }
}

export function createLinxPiCodingTools(cwd: string, options: {
  bashTimeoutSeconds?: number
  bashOperations?: BashOperations
} = {}): Array<{
  name: string
  execute(callId: string, input: Record<string, unknown>): Promise<unknown>
}> {
  const localBashOperations = options.bashOperations ?? createLocalBashOperations()
  const bashTimeoutSeconds = options.bashTimeoutSeconds ?? DEFAULT_LINX_PI_BASH_TIMEOUT_SECONDS
  return createCodingTools(cwd, {
    bash: {
      operations: {
        exec(command, workingDirectory, options) {
          return localBashOperations.exec(command, workingDirectory ?? cwd, {
            ...options,
            timeout: typeof options.timeout === 'number'
              ? options.timeout
              : bashTimeoutSeconds,
          })
        },
      },
    },
  })
}

function isAuthExpiredError(error: unknown): boolean {
  return isRemoteAuthExpiredError(error)
}

function withSystemPrompt(systemPrompt: string | undefined, messages: RemoteChatMessage[]): RemoteChatMessage[] {
  const prompt = systemPrompt?.trim()
  if (!prompt) {
    return messages
  }
  if (messages.some((message) => message.role === 'system')) {
    return messages
  }
  return [{ role: 'system', content: prompt }, ...messages]
}

function overrideLinxSystemPrompt(base: string | undefined): string | undefined {
  const original = base?.trim()
  const identity = [
    'You are LinX, an AI Secretary operating inside the LinX CLI.',
    'When replying in Chinese, describe yourself as "AI主理人".',
    'Use a friendly, direct style like: "你好！我是 LinX，一个 AI 主理人，很高兴为你服务！"',
    'Keep Pi-compatible coding agent behavior: read files, run commands, edit code, use tools, and follow project instructions.',
    'When introducing capabilities, describe only user-facing LinX product abilities and the currently available runtime actions.',
    'Do not advertise repository-local agent instructions, internal command names, bundled plugin skill names, package names, or developer-only workflows as features the user can call.',
    'If a capability depends on the current workspace, installed tools, login state, backend, or Symphony mode, state that dependency instead of implying it is always available.',
  ].join('\n')

  if (!original) {
    return identity
  }

  return `${identity}\n\n${original.replace(/\bpi\b/g, 'LinX').replace(/\bPi\b/g, 'LinX')}`
}
