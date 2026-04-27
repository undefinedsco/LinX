import { createPiAgentStreamAdapter, type PiAgentStreamAdapter, type PiCompletionBackendResult } from './stream.js'
import { resolveLinxPiCloudOAuthCredential } from './auth.js'
import { loginWithBrowserConsent } from '../oidc-auth.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID, resolvePreferredLinxCloudModelId } from '../default-model.js'
import { ensureLinxPiTheme } from './theme.js'
import {
  type AgentSessionRuntime,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  createCodingTools,
} from '@mariozechner/pi-coding-agent'
import type { Api, Model, OAuthCredentials } from '@mariozechner/pi-ai'
import type { RemoteChatMessage, RemoteChatTool } from '../chat-api.js'

const UNDEFINEDS_PROVIDER_ID = 'undefineds'
const UNDEFINEDS_PROVIDER_LABEL = 'undefineds(cloud)'
const UNDEFINEDS_PROVIDER_API = 'openai-completions'
const UNDEFINEDS_SESSION_ID = 'undefineds_pi_frontend'
const UNDEFINEDS_AUTH_BRIDGE_ID = 'undefineds-cloud-oauth-bridge'

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
  providerId: 'undefineds-cloud'
  providerLabel: 'undefineds(cloud)'
  runtimeUrl: string
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
  }> = [buildProviderModel({
    id: activeModelId,
    contextWindow: 1_000_000,
  })]
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
          return dependencies.createRemoteCompletion!({
            runtimeUrl: baseUrl,
            apiKey,
            model: input.model,
            messages: withSystemPrompt(input.systemPrompt, input.messages),
            tools: input.tools,
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
          onManualCodeInput?: () => Promise<string>
        }) {
          callbacks.onProgress?.('Opening LinX Cloud login in your browser...')
          const result = await loginWithBrowserConsent({
            issuerUrl: options.providerConfig?.issuerUrl,
            onAuthUrl(url) {
              callbacks.onAuth({
                url,
                instructions: 'Complete LinX Cloud consent in your browser. If the local callback is blocked, paste the final redirect URL below.',
              })
            },
            manualRedirectUrl: callbacks.onManualCodeInput,
          })
          await syncProviderModels(result.tokenSet.accessToken ?? '')

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
        : await resolveLinxPiCloudOAuthCredential(options.providerConfig?.issuerUrl)
      const explicitOAuthCredential = options.providerConfig?.oauth
        ? await options.providerConfig.oauth.login()
        : null
      const explicitApiKey = options.providerConfig?.apiKey
      const authMode: 'oauth' | 'apiKey' = options.providerConfig?.oauth || resolvedOAuth || !explicitApiKey ? 'oauth' : 'apiKey'
      if (resolvedOAuth?.access) {
        await syncProviderModels(resolvedOAuth.access)
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
      sanitizeLinxCloudDefaults(settingsManager)
      const services = await createAgentSessionServices({
        cwd: context.cwd,
        agentDir: context.agentDir,
        authStorage,
        settingsManager,
        modelRegistry,
      })
      const selectedModel = modelRegistry.find(UNDEFINEDS_PROVIDER_ID, requestedModel ?? activeModelId)
        ?? modelRegistry.getAvailable().find((candidate) => candidate.provider === UNDEFINEDS_PROVIDER_ID)
      if (!selectedModel) {
        throw new Error('Failed to resolve undefineds model from the LinX Pi runtime adapter')
      }
      const created = await createAgentSessionFromServices({
        services,
        sessionManager: context.sessionManager as SessionManager,
        sessionStartEvent: context.sessionStartEvent as never,
        model: selectedModel,
        tools: createCodingTools(context.cwd),
      })
      const session = created.session
      if (session.model?.provider === UNDEFINEDS_PROVIDER_ID && session.model.id !== selectedModel.id) {
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
        providerId: 'undefineds-cloud',
        providerLabel: UNDEFINEDS_PROVIDER_LABEL,
        runtimeUrl: baseUrl,
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

  async function syncProviderModels(apiKey: string): Promise<void> {
    if (!apiKey || !dependencies.listRemoteModels) {
      return
    }

    const remoteModels = await dependencies.listRemoteModels(null, baseUrl, apiKey).catch(() => [])
    if (remoteModels.length === 0) {
      return
    }

    const nextModels = remoteModels.map((entry) => buildProviderModel({
      id: entry.id,
      contextWindow: entry.contextWindow ?? 1_000_000,
    }))
    providerModels.splice(0, providerModels.length, ...nextModels)

    if (!requestedModel) {
      activeModelId = resolvePreferredLinxCloudModelId(nextModels, activeModelId)
    }
  }
}

function sanitizeLinxCloudDefaults(settingsManager: SettingsManager): void {
  const provider = settingsManager.getDefaultProvider()
  const model = settingsManager.getDefaultModel()

  if (provider === UNDEFINEDS_PROVIDER_ID && model && model !== 'linx' && model !== 'linx-lite') {
    settingsManager.setDefaultModelAndProvider(UNDEFINEDS_PROVIDER_ID, DEFAULT_LINX_CLOUD_MODEL_ID)
  }
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
