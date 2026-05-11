import { createPiAgentStreamAdapter, type PiAgentStreamAdapter, type PiCompletionBackendResult } from './stream.js'
import { resolveLinxPiCloudOAuthCredential } from './auth.js'
import { ensureBrowserConsentLogin, isOidcLoginExpiredError } from '../oidc-auth.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID, FALLBACK_LINX_CLOUD_MODEL_IDS, resolvePreferredLinxCloudModelId } from '../default-model.js'
import { ensureLinxPiTheme } from './theme.js'
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
} from '@mariozechner/pi-coding-agent'
import { webFetchTool, webSearchTool } from './web-fetch.js'
import { podReadTool, podWriteTool } from './pod-tools.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Api, Model, OAuthCredentials } from '@mariozechner/pi-ai'
import { isRemoteAuthExpiredError, type RemoteChatMessage, type RemoteChatTool } from '../chat-api.js'
import { installLinxPiRemoteApproval } from './pod-approval.js'

const UNDEFINEDS_PROVIDER_ID = 'undefineds'
const UNDEFINEDS_PROVIDER_LABEL = 'undefineds'
const UNDEFINEDS_PROVIDER_API = 'openai-completions'
const UNDEFINEDS_SESSION_ID = 'undefineds_pi_frontend'
const UNDEFINEDS_AUTH_BRIDGE_ID = 'undefineds-cloud-oauth-bridge'
export const DEFAULT_LINX_PI_BASH_TIMEOUT_SECONDS = 15

export interface PiRuntimeAdapterDependencies {
  createNativeProxy?: (options?: {
    cwd?: string
    model?: string
    listenPort?: number
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
    subscribe(listener: (event: import('../watch/types.js').WatchNormalizedEvent) => void): () => void
    close(): Promise<void>
  }
  createRemoteCompletion?: (options: {
    runtimeUrl: string
    apiKey: string
    model?: string
    messages: RemoteChatMessage[]
    tools?: RemoteChatTool[]
    systemPrompt?: string
    signal?: AbortSignal
  }) => Promise<string | PiCompletionBackendResult>
  listRemoteModels?: (
    session: unknown,
    runtimeUrl: string,
    apiKey: string,
  ) => Promise<Array<{
    id: string
    contextWindow?: number
  }>>
}

export interface PiRuntimeFactoryContext {
  cwd: string
  agentDir: string
  sessionManager: unknown
  sessionStartEvent?: unknown
}

export type PiCreateRuntimeFactory = (context: PiRuntimeFactoryContext) => Promise<AgentSessionRuntime>

export interface PiRuntimeAdapterOptions {
  cwd?: string
  model?: string
  port?: number
  backend?: 'cloud' | 'native'
  providerConfig?: {
    baseUrl: string
    issuerUrl?: string
    apiKey?: string
    oauth?: {
      name: string
      login(...args: unknown[]): Promise<OAuthCredentials>
      refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>
      getApiKey(credentials: OAuthCredentials): string
      modifyModels?(models: Model<Api>[], credentials: OAuthCredentials): Model<Api>[]
    }
  }
}

export interface LinxCloudPiAuthBridge {
  description: 'undefineds-cloud-oauth-bridge'
  providerId: 'undefineds'
  providerLabel: 'undefineds'
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
  resolveCredential?: typeof resolveLinxPiCloudOAuthCredential
}): Promise<LinxStartupLoginPromptDecision> {
  if (options.print) {
    return { shouldPrompt: false, reason: 'print-mode' }
  }
  if (options.backend === 'native') {
    return { shouldPrompt: false, reason: 'native-backend' }
  }

  const resolveCredential = options.resolveCredential ?? resolveLinxPiCloudOAuthCredential
  try {
    const credential = await resolveCredential(options.issuerUrl)
    return credential
      ? { shouldPrompt: false, reason: 'credential-present' }
      : { shouldPrompt: true, reason: 'missing-credential' }
  } catch (error) {
    if (isOidcLoginExpiredError(error)) {
      return { shouldPrompt: true, reason: 'expired-credential' }
    }
    throw error
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

export interface PiRuntimeAdapter {
  readonly remoteUrl: string
  readonly sessionId: string
  readonly cwd: string
  readonly model?: string
  readonly backend: string
  readonly streamAdapter: PiAgentStreamAdapter
  createRuntime: PiCreateRuntimeFactory
  start(): Promise<void>
  close(): Promise<void>
}

export function createPiRuntimeAdapter(
  dependencies: PiRuntimeAdapterDependencies,
  options: PiRuntimeAdapterOptions = {},
): PiRuntimeAdapter {
  const backendMode = options.backend ?? 'cloud'
  const cwd = options.cwd ?? process.cwd()
  const requestedModel = options.model?.trim() || undefined
  let activeModelId = requestedModel ?? DEFAULT_LINX_CLOUD_MODEL_ID
  const baseUrl = options.providerConfig?.baseUrl ?? 'https://api.undefineds.co/v1'
  let shouldPromptLoginOnStart = false
  const providerModels: Array<{
    id: string
    name: string
    api: 'openai-completions'
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
  }> = buildFallbackProviderModels(activeModelId)
  const proxy = backendMode === 'native'
    ? dependencies.createNativeProxy?.({
      cwd,
      model: activeModelId,
      listenPort: options.port,
    })
    : null

  if (backendMode === 'native' && !proxy) {
    throw new Error('Native Pi runtime backend requires createNativeProxy')
  }

  if (backendMode === 'cloud' && !options.providerConfig?.oauth && !dependencies.createRemoteCompletion) {
    throw new Error('Cloud Pi runtime backend requires createRemoteCompletion')
  }

  const streamAdapter = createPiAgentStreamAdapter({
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
          const apiKey = input.apiKey && input.apiKey !== 'linx-runtime-managed-auth'
            ? input.apiKey
            : await resolveLinxPiCloudApiKey({
            issuerUrl: options.providerConfig?.issuerUrl,
            explicitApiKey: options.providerConfig?.apiKey,
          })
          return completeWithAuthRecovery(apiKey, {
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

  return {
    remoteUrl: proxy?.remoteUrl ?? baseUrl,
    sessionId: proxy?.record.id ?? UNDEFINEDS_SESSION_ID,
    cwd: proxy?.record.cwd ?? cwd,
    model: proxy?.record.model ?? activeModelId,
    backend: proxy?.record.backend ?? UNDEFINEDS_PROVIDER_ID,
    streamAdapter,
    createRuntime: async (context: PiRuntimeFactoryContext): Promise<AgentSessionRuntime> => {
      const authStorage = AuthStorage.inMemory()
      const modelRegistry = ModelRegistry.inMemory(authStorage)
      const originalIsUsingOAuth = modelRegistry.isUsingOAuth.bind(modelRegistry)
      modelRegistry.isUsingOAuth = (model) => (
        model.provider === UNDEFINEDS_PROVIDER_ID ? false : originalIsUsingOAuth(model)
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
          if (result.reusedExistingSession) {
            callbacks.onProgress?.('Reused existing LinX Cloud session.')
          }
          await syncProviderModels(result.tokenSet.accessToken ?? '', { throwAuthExpired: true })

          return {
            refresh: result.tokenSet.refreshToken ?? '',
            access: result.tokenSet.accessToken ?? '',
            expires: result.tokenSet.expiresAt ? result.tokenSet.expiresAt * 1000 : Date.now() + 60 * 60 * 1000,
          }
        },
        async refreshToken() {
          const refreshed = await resolveLinxPiCloudOAuthCredential(options.providerConfig?.issuerUrl)
          if (!refreshed) {
            throw new Error('Failed to refresh LinX cloud credential for Pi runtime adapter')
          }
          await syncProviderModels(refreshed.access)
          return refreshed
        },
        getApiKey(credentials: OAuthCredentials) {
          return credentials.access
        },
      }
      const resolvedOAuth = options.providerConfig?.oauth
        ? null
        : await resolveLinxPiCloudOAuthCredential(options.providerConfig?.issuerUrl).catch((error) => {
          if (isOidcLoginExpiredError(error)) {
            return null
          }
          throw error
        })
      const explicitOAuthCredential = options.providerConfig?.oauth
        ? await options.providerConfig.oauth.login()
        : null
      const explicitApiKey = options.providerConfig?.apiKey
      const authMode: 'oauth' | 'apiKey' = options.providerConfig?.oauth || resolvedOAuth || !explicitApiKey ? 'oauth' : 'apiKey'
      if (resolvedOAuth?.access) {
        await syncProviderModels(resolvedOAuth.access, { refreshOnAuthExpired: true })
      } else if (explicitOAuthCredential?.access) {
        await syncProviderModels(explicitOAuthCredential.access)
      } else if (explicitApiKey) {
        await syncProviderModels(explicitApiKey)
      }
      modelRegistry.registerProvider(UNDEFINEDS_PROVIDER_ID, {
        api: UNDEFINEDS_PROVIDER_API,
        baseUrl,
        apiKey: 'LINX_RUNTIME_AUTH',
        oauth: linxOAuthProvider,
        authHeader: false,
        streamSimple: streamAdapter.streamFn,
        models: providerModels,
      })
      if (!options.providerConfig?.oauth && !resolvedOAuth && !explicitApiKey) {
        authStorage.setRuntimeApiKey(UNDEFINEDS_PROVIDER_ID, 'linx-runtime-managed-auth')
      }
      if (options.providerConfig?.oauth && explicitOAuthCredential) {
        authStorage.set(UNDEFINEDS_PROVIDER_ID, { type: 'oauth', ...explicitOAuthCredential })
      } else if (resolvedOAuth) {
        authStorage.set(UNDEFINEDS_PROVIDER_ID, resolvedOAuth)
      }

      const settingsManager = SettingsManager.create(context.cwd, context.agentDir)
      ensureLinxPiTheme(context.agentDir)
      settingsManager.setTheme('linx')
      const defaultModelId = sanitizeLinxCloudDefaults(settingsManager, requestedModel, providerModels)
      activeModelId = defaultModelId
      const services = await createAgentSessionServices({
        cwd: context.cwd,
        agentDir: context.agentDir,
        authStorage,
        settingsManager,
        modelRegistry,
        resourceLoaderOptions: {
          systemPromptOverride: overrideLinxSystemPrompt,
        },
      })

      // Inject npm-packaged skills shipped with linx-cli
      const linxSkillsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills')
      services.resourceLoader.extendResources({
        skillPaths: [{
          path: linxSkillsDir,
          metadata: {
            source: '@undefineds.co/linx',
            scope: 'temporary',
            origin: 'package',
            baseDir: dirname(fileURLToPath(import.meta.url)),
          },
        }],
        promptPaths: [],
        themePaths: [],
      })
      const selectedModel = modelRegistry.find(UNDEFINEDS_PROVIDER_ID, defaultModelId)
        ?? modelRegistry.getAvailable().find((candidate) => candidate.provider === UNDEFINEDS_PROVIDER_ID)
      if (!selectedModel) {
        throw new Error('Failed to resolve undefineds model from the LinX Pi runtime adapter')
      }
      const created = await createAgentSessionFromServices({
        services,
        sessionManager: context.sessionManager as SessionManager,
        sessionStartEvent: context.sessionStartEvent as never,
        model: selectedModel,
        tools: createLinxPiCodingTools(context.cwd),
        customTools: [webFetchTool, webSearchTool, podReadTool, podWriteTool],
      })
      const session = created.session
      enableLinxXhighThinking(session)
      installLinxPiRemoteApproval({
        session,
        cwd: context.cwd,
      })
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
      ;(runtime as unknown as Record<string, unknown>).linxAuthBridge = {
        description: UNDEFINEDS_AUTH_BRIDGE_ID,
        authMode,
        providerId: UNDEFINEDS_PROVIDER_ID,
        providerLabel: UNDEFINEDS_PROVIDER_LABEL,
        runtimeUrl: baseUrl,
        shouldPromptLoginOnStart,
      } satisfies LinxCloudPiAuthBridge & { authMode: 'oauth' | 'apiKey' }
      return runtime
    },
    async start(): Promise<void> {
      await proxy?.start()
    },
    async close(): Promise<void> {
      await proxy?.close()
    },
  }

  async function syncProviderModels(apiKey: string, options: { throwAuthExpired?: boolean; refreshOnAuthExpired?: boolean } = {}): Promise<void> {
    if (!apiKey || !dependencies.listRemoteModels) {
      return
    }

    const remoteModels = await listRemoteModelsWithAuthRecovery(apiKey, options)
    if (remoteModels.length === 0) {
      return
    }

    const mergedModels = mergeLinxProviderModels(remoteModels.map((entry) => ({
      id: entry.id,
      contextWindow: entry.contextWindow ?? 1_000_000,
    })), activeModelId)
    const nextModels = mergedModels.map((entry) => buildProviderModel(entry))
    providerModels.splice(0, providerModels.length, ...nextModels)

    if (!requestedModel) {
      activeModelId = resolvePreferredLinxCloudModelId(nextModels, activeModelId)
    }
  }

  async function listRemoteModelsWithAuthRecovery(
    apiKey: string,
    recoveryOptions: { throwAuthExpired?: boolean; refreshOnAuthExpired?: boolean },
  ): Promise<Array<{ id: string; contextWindow?: number }>> {
    try {
      return await dependencies.listRemoteModels!(null, baseUrl, apiKey)
    } catch (error) {
      if (!isAuthExpiredError(error)) {
        return []
      }

      if (recoveryOptions.refreshOnAuthExpired) {
        const refreshed = await resolveLinxPiCloudOAuthCredential(options.providerConfig?.issuerUrl, { forceRefresh: true }).catch((refreshError) => {
          if (isOidcLoginExpiredError(refreshError)) {
            return null
          }
          throw refreshError
        })
        if (refreshed?.access) {
          try {
            return await dependencies.listRemoteModels!(null, baseUrl, refreshed.access)
          } catch (retryError) {
            if (!isAuthExpiredError(retryError)) {
              return []
            }
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
    apiKey: string,
    request: {
      runtimeUrl: string
      model?: string
      messages: RemoteChatMessage[]
      tools?: RemoteChatTool[]
      signal?: AbortSignal
    },
  ): Promise<string | PiCompletionBackendResult> {
    try {
      return await dependencies.createRemoteCompletion!({
        ...request,
        apiKey,
      })
    } catch (error) {
      if (!isAuthExpiredError(error)) {
        throw error
      }

      const refreshed = await resolveLinxPiCloudOAuthCredential(options.providerConfig?.issuerUrl, { forceRefresh: true }).catch((refreshError) => {
        if (isOidcLoginExpiredError(refreshError)) {
          return null
        }
        throw refreshError
      })
      if (!refreshed?.access) {
        throw error
      }

      return dependencies.createRemoteCompletion!({
        ...request,
        apiKey: refreshed.access,
      })
    }
  }
}

export function createLinxPiCodingTools(cwd: string, options: {
  bashTimeoutSeconds?: number
  bashOperations?: BashOperations
} = {}): ReturnType<typeof createCodingTools> {
  const localBashOperations = options.bashOperations ?? createLocalBashOperations()
  const bashTimeoutSeconds = options.bashTimeoutSeconds ?? DEFAULT_LINX_PI_BASH_TIMEOUT_SECONDS
  return createCodingTools(cwd, {
    bash: {
      operations: {
        exec(command, workingDirectory, options) {
          return localBashOperations.exec(command, workingDirectory, {
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

function enableLinxXhighThinking(session: {
  model?: { provider?: string; reasoning?: boolean }
  supportsXhighThinking?: () => boolean
  getAvailableThinkingLevels?: () => string[]
}): void {
  const originalSupportsXhighThinking = session.supportsXhighThinking?.bind(session)
  const originalGetAvailableThinkingLevels = session.getAvailableThinkingLevels?.bind(session)

  if (originalSupportsXhighThinking) {
    session.supportsXhighThinking = () => (
      session.model?.provider === UNDEFINEDS_PROVIDER_ID && session.model.reasoning
        ? true
        : originalSupportsXhighThinking()
    )
  }

  if (originalGetAvailableThinkingLevels) {
    session.getAvailableThinkingLevels = () => {
      const levels = originalGetAvailableThinkingLevels()
      if (session.model?.provider === UNDEFINEDS_PROVIDER_ID && session.model.reasoning && !levels.includes('xhigh')) {
        return [...levels, 'xhigh']
      }
      return levels
    }
  }
}

function isAuthExpiredError(error: unknown): boolean {
  return isRemoteAuthExpiredError(error)
}

function sanitizeLinxCloudDefaults(
  settingsManager: SettingsManager,
  requestedModel: string | undefined,
  providerModels: Array<{ id: string }>,
): string {
  const availableModelIds = new Set(providerModels.map((model) => model.id))
  const savedProvider = settingsManager.getDefaultProvider()
  const savedModel = settingsManager.getDefaultModel()
  const savedLinxModel = savedProvider === UNDEFINEDS_PROVIDER_ID && savedModel && availableModelIds.has(savedModel)
    ? savedModel
    : undefined
  const nextModel = requestedModel || savedLinxModel || DEFAULT_LINX_CLOUD_MODEL_ID

  if (savedProvider !== UNDEFINEDS_PROVIDER_ID || savedModel !== nextModel) {
    settingsManager.setDefaultModelAndProvider(UNDEFINEDS_PROVIDER_ID, nextModel)
  }

  return nextModel
}

function buildProviderModel(input: {
  id: string
  contextWindow: number
}): {
  id: string
  name: string
  api: 'openai-completions'
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
} {
  return {
    id: input.id,
    name: input.id,
    api: 'openai-completions',
    reasoning: true,
    input: ['text'],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: input.contextWindow,
    maxTokens: 64_000,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsStrictMode: false,
    },
  }
}

function buildFallbackProviderModels(activeModelId: string): ReturnType<typeof buildProviderModel>[] {
  return mergeLinxProviderModels([], activeModelId).map((entry) => buildProviderModel(entry))
}

function mergeLinxProviderModels(
  models: Array<{ id: string; contextWindow: number }>,
  activeModelId: string,
): Array<{ id: string; contextWindow: number }> {
  const byId = new Map<string, { id: string; contextWindow: number }>()
  for (const id of [
    ...FALLBACK_LINX_CLOUD_MODEL_IDS,
    activeModelId,
  ]) {
    byId.set(id, {
      id,
      contextWindow: 1_000_000,
    })
  }
  for (const model of models) {
    const id = model.id.trim()
    if (!id) {
      continue
    }
    byId.set(id, {
      id,
      contextWindow: model.contextWindow,
    })
  }
  return [...byId.values()]
}

async function resolveLinxPiCloudApiKey(options: {
  issuerUrl?: string
  explicitApiKey?: string
}): Promise<string> {
  if (options.explicitApiKey) {
    return options.explicitApiKey
  }

  const credential = await resolveLinxPiCloudOAuthCredential(options.issuerUrl)
  if (credential?.access) {
    return credential.access
  }

  throw new Error('No LinX cloud login found. Interactive TUI supports /login in-app. For non-interactive --print mode, run `linx login` first.')
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
  ].join('\n')

  if (!original) {
    return identity
  }

  return `${identity}\n\n${original.replace(/\bpi\b/g, 'LinX').replace(/\bPi\b/g, 'LinX')}`
}
