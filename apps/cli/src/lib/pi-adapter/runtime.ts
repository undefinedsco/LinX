import { createLinxAgentStreamAdapter, type LinxAgentStreamAdapter } from './stream.js'
import type { LinxCompletionBackendResult } from '../linx-completion-backend.js'
import { withLinxRuntimeSystemPrompt, overrideLinxSystemPrompt } from '../linx-runtime-system-prompt.js'
import { enableLinxXhighThinking } from '../linx-runtime-thinking.js'
import { ensureLinxPiTheme } from '../linx-theme.js'
import {
  type AgentSessionRuntime,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
} from '@earendil-works/pi-coding-agent'
// web_fetch / web_search are now handled by pi-web-access
import type { Api, Model, OAuthCredentials } from '@earendil-works/pi-ai'
import type { RemoteAuthFetch, RemoteChatMessage, RemoteChatTool } from '../chat-api.js'
import type { AutoModeWorkerBackend } from '../auto-mode/types.js'
import type { BackendCommandRouter, BackendCommandResult } from '../backend-command.js'
import type { PodDataSession } from '../pod-data-session.js'
import type { CodexApprovalPolicy } from '../codex-plugin/codex-native-proxy.js'
import { loadCredentials } from '../credentials-store.js'
import { createLinxBearerAuthFetch, resolveLinxCloudRuntimeAuthFetch, resolveRuntimeAuthFetchFromApiKey } from '../linx-cloud-runtime-auth.js'
import { createLinxCloudRuntimeCoordinator } from '../linx-cloud-runtime-coordinator.js'
import { LINX_RUNTIME_MANAGED_AUTH_KEY } from '../linx-runtime-auth.js'
import { createLinxManagedRuntimeOAuthProvider } from '../linx-runtime-oauth-provider.js'
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
  sanitizeLinxCloudDefaults,
} from '../linx-cloud-models.js'
export {
  resolveLinxInteractiveLoginReason,
  resolveLinxStartupLoginPromptDecision,
  resolveLinxStartupLoginReason,
  type LinxStartupLoginPromptDecision,
  type LinxStartupLoginReason,
} from '../linx-startup-login-policy.js'
export {
  DEFAULT_LINX_PI_BASH_TIMEOUT_SECONDS,
  createLinxPiCodingTools,
} from '../linx-runtime-coding-tools.js'

const UNDEFINEDS_SESSION_ID = 'undefineds_pi_frontend'
const UNDEFINEDS_AUTH_BRIDGE_ID = 'undefineds-cloud-oauth-bridge'
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
  const baseUrl = options.providerConfig?.baseUrl ?? 'https://api.undefineds.co/v1'
  const cloudRuntime = createLinxCloudRuntimeCoordinator({
    requestedModel,
    runtimeUrl: baseUrl,
    issuerUrl: options.providerConfig?.issuerUrl,
    getPodDataSession: options.getPodDataSession,
    createRemoteCompletion: dependencies.createRemoteCompletion,
    listRemoteModels: dependencies.listRemoteModels,
  })
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
    model: proxy?.record.model ?? cloudRuntime.getActiveModelId(),
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
          return cloudRuntime.completeWithAuthRecovery(authFetch, {
            runtimeUrl: baseUrl,
            model: input.model,
            messages: withLinxRuntimeSystemPrompt(input.systemPrompt, input.messages),
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
    model: proxy?.record.model ?? cloudRuntime.getActiveModelId(),
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
      const linxOAuthProvider = options.providerConfig?.oauth ?? createLinxManagedRuntimeOAuthProvider({
        issuerUrl: options.providerConfig?.issuerUrl,
        getPodDataSession: options.getPodDataSession,
        syncProviderModels: cloudRuntime.syncProviderModels,
      })
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
        await cloudRuntime.syncProviderModels({ runtimeFetch: authFetch }, { refreshOnAuthExpired: true })
      } else if (explicitOAuthCredential?.access) {
        await cloudRuntime.syncProviderModels({ runtimeFetch: createLinxBearerAuthFetch(explicitOAuthCredential.access) })
      }
      modelRegistry.registerProvider(LINX_CLOUD_PROVIDER_ID, {
        api: LINX_CLOUD_PROVIDER_API,
        baseUrl,
        apiKey: '$LINX_RUNTIME_AUTH',
        oauth: linxOAuthProvider,
        authHeader: false,
        streamSimple: streamAdapter.streamFn,
        models: cloudRuntime.providerModels,
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
      const defaultModelId = sanitizeLinxCloudDefaults(settingsManager, requestedModel, cloudRuntime.providerModels)
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
        shouldPromptLoginOnStart: cloudRuntime.shouldPromptLoginOnStart(),
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

}

/** @deprecated Use LinxRuntimeAdapter. */
export type PiRuntimeAdapter = LinxRuntimeAdapter

/** @deprecated Use createLinxRuntimeAdapter. */
export const createPiRuntimeAdapter = createLinxRuntimeAdapter

