import { createLinxAgentStreamAdapter, type LinxAgentStreamAdapter, type LinxCompletionBackendResult } from './stream.js'
import { ensureBrowserConsentLogin, isOidcLoginExpiredError, isOidcTransientRemoteError } from '../oidc-auth.js'
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
} from '@earendil-works/pi-coding-agent'
// web_fetch / web_search are now handled by pi-web-access
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { Api, Model, OAuthCredentials } from '@earendil-works/pi-ai'
import { RemoteChatRequestError, isRemoteAuthExpiredError, type RemoteAuthFetch, type RemoteChatMessage, type RemoteChatTool } from '../chat-api.js'
import { formatLinxCloudTransientMessage } from '../linx-cloud-errors.js'
import type { AutoModeWorkerBackend } from '../auto-mode/types.js'
import type { BackendCommandRouter, BackendCommandResult } from './backend-command.js'
import { clearDefaultPodDataSession, getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'
import type { CodexApprovalPolicy } from '../codex-plugin/codex-native-proxy.js'
import { loadCredentials } from '../credentials-store.js'
import { getSolidLinxAppDir, getSolidLinxPiWebAccessConfigPath } from '../solid-local-store.js'

const UNDEFINEDS_PROVIDER_ID = 'undefineds'
const UNDEFINEDS_PROVIDER_LABEL = 'LinX Cloud'
const UNDEFINEDS_PROVIDER_API = 'linx-cloud-chat-completions'
const UNDEFINEDS_SESSION_ID = 'undefineds_pi_frontend'
const UNDEFINEDS_AUTH_BRIDGE_ID = 'undefineds-cloud-oauth-bridge'
export const LINX_RUNTIME_MANAGED_AUTH_KEY = 'linx-runtime-managed-auth'
const LINX_PACKAGE_SOURCE = '@undefineds.co/linx'
const LINX_WEB_ACCESS_PACKAGE_SOURCE = 'pi-web-access'
const LINX_PRODUCT_SKILL_NAMES = new Set(['symphony'])
const MARKET_XPOD_CLI_SKILL_SOURCE = 'xpod-cli@undefineds'
export const DEFAULT_LINX_PI_BASH_TIMEOUT_SECONDS = 15
const DEFAULT_LINX_CLOUD_CONTEXT_WINDOW = 1_000_000
const DEFAULT_LINX_CLOUD_COMPLETION_TIMEOUT_MS = 10 * 60 * 1000

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
    setSessionControl?(control: import('./session-control.js').SessionControlManager): void
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
  }> = buildFallbackProviderModels(activeModelId)
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
              ?? await resolveLinxPiCloudAuthFetch({
                issuerUrl: options.providerConfig?.issuerUrl,
                getPodDataSession: options.getPodDataSession,
              })
            : await resolveLinxPiCloudAuthFetch({
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
          clearDefaultPodDataSession()
          if (result.reusedExistingSession) {
            callbacks.onProgress?.('Reused existing LinX Cloud session.')
          }
          const authFetch = await resolveLinxPiCloudAuthFetch({
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
          const authFetch = await resolveLinxPiCloudAuthFetch({
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
        const authFetch = await resolveLinxPiCloudAuthFetch({
          issuerUrl: options.providerConfig?.issuerUrl,
          getPodDataSession: options.getPodDataSession,
        })
        await syncProviderModels({ runtimeFetch: authFetch }, { refreshOnAuthExpired: true })
      } else if (explicitOAuthCredential?.access) {
        await syncProviderModels({ runtimeFetch: createBearerAuthFetch(explicitOAuthCredential.access) })
      }
      modelRegistry.registerProvider(UNDEFINEDS_PROVIDER_ID, {
        api: UNDEFINEDS_PROVIDER_API,
        baseUrl,
        apiKey: '$LINX_RUNTIME_AUTH',
        oauth: linxOAuthProvider,
        authHeader: false,
        streamSimple: streamAdapter.streamFn,
        models: providerModels,
      })
      if (!options.providerConfig?.oauth) {
        authStorage.setRuntimeApiKey(UNDEFINEDS_PROVIDER_ID, LINX_RUNTIME_MANAGED_AUTH_KEY)
      }
      if (options.providerConfig?.oauth && explicitOAuthCredential) {
        authStorage.set(UNDEFINEDS_PROVIDER_ID, { type: 'oauth', ...explicitOAuthCredential })
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
      const selectedModel = modelRegistry.find(UNDEFINEDS_PROVIDER_ID, defaultModelId)
        ?? modelRegistry.getAvailable().find((candidate) => candidate.provider === UNDEFINEDS_PROVIDER_ID)
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
        providerId: UNDEFINEDS_PROVIDER_ID,
        providerLabel: UNDEFINEDS_PROVIDER_LABEL,
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

    const mergedModels = mergeLinxProviderModels(remoteModels.map((entry) => ({
      id: entry.id,
      contextWindow: entry.contextWindow,
    })), activeModelId)
    const nextModels = mergedModels.map((entry) => buildProviderModel(entry))
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
      return resolveLinxPiCloudAuthFetch({
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

export function resolveBundledLinxSkillsDir(importMetaUrl = import.meta.url): string | null {
  const moduleDir = dirname(fileURLToPath(importMetaUrl))
  const candidates = [
    // Published package: dist/lib/pi-adapter/runtime.js -> dist/skills.
    // This directory is a curated product-skill bundle, not the repo skill root.
    join(moduleDir, '..', '..', 'skills'),
    // Test/dev bundle: <tmp>/dist/lib/pi-adapter/runtime.js -> curated product skills.
    resolve(moduleDir, '..', '..', '..', '..', 'skills'),
    // Source-tree fallback when running through a TS loader.
    resolve(moduleDir, '..', '..', '..', '..', '..', 'skills'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

function ensurePiWebAccessConfig(): void {
  const config = JSON.stringify({ workflow: 'none' }, null, 2) + '\n'
  const linxPath = getSolidLinxPiWebAccessConfigPath()
  const linxDir = getSolidLinxAppDir()
  if (!existsSync(linxDir)) {
    mkdirSync(linxDir, { recursive: true })
  }
  if (!existsSync(linxPath)) writeFileSync(linxPath, config)
}

export function resolveBundledPiPackageRoot(packageName: string, importMetaUrl = import.meta.url): string | null {
  const moduleDir = dirname(fileURLToPath(importMetaUrl))
  const vendoredCandidates = [
    // Published/built package: dist/lib/pi-adapter/runtime.js -> vendor/<package>.
    resolve(moduleDir, '..', '..', '..', 'vendor', packageName),
    // Defensive fallback for layouts that place vendor under dist.
    resolve(moduleDir, '..', '..', 'vendor', packageName),
  ]
  for (const candidate of vendoredCandidates) {
    if (existsSync(join(candidate, 'package.json'))) {
      return candidate
    }
  }

  try {
    const requireFromRuntime = createRequire(importMetaUrl)
    return dirname(requireFromRuntime.resolve(`${packageName}/package.json`))
  } catch {
    return null
  }
}

function withLinxSkillSourceInfo<T extends {
  skills: Array<{
    name: string
    filePath: string
    sourceInfo?: unknown
  }>
  diagnostics: unknown[]
}>(base: T, options: {
  bundledSkillsDir: string | null
  marketSkillDirs: string[]
}): T {
  const { bundledSkillsDir, marketSkillDirs } = options
  const filteredSkills = base.skills.filter((skill) => (
    !bundledSkillsDir
    || !skill.filePath.startsWith(bundledSkillsDir)
    || LINX_PRODUCT_SKILL_NAMES.has(skill.name)
  ))

  return {
    ...base,
    skills: filteredSkills.map((skill) => {
      if (bundledSkillsDir && skill.filePath.startsWith(bundledSkillsDir)) {
        return {
          ...skill,
          sourceInfo: {
            path: skill.filePath,
            source: LINX_PACKAGE_SOURCE,
            scope: 'temporary',
            origin: 'package',
            baseDir: bundledSkillsDir,
          },
        }
      }

      const marketSkillDir = marketSkillDirs.find((dir) => skill.filePath.startsWith(dir))
      if (marketSkillDir) {
        return {
          ...skill,
          sourceInfo: {
            path: skill.filePath,
            source: MARKET_XPOD_CLI_SKILL_SOURCE,
            scope: 'temporary',
            origin: 'marketplace',
            version: resolveMarketSkillVersion(marketSkillDir),
            baseDir: marketSkillDir,
          },
        }
      }

      return skill
    }),
  }
}

export function resolveInstalledMarketSkillDirs(): string[] {
  return [resolveInstalledXpodCliMarketSkillDir()].filter((path): path is string => Boolean(path))
}

function resolveInstalledXpodCliMarketSkillDir(): string | null {
  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), '.codex')
  const versionsRoot = join(codexHome, 'plugins', 'cache', 'undefineds', 'xpod-cli')
  if (!existsSync(versionsRoot)) {
    return null
  }

  const candidates: Array<{ version: string; dir: string }> = []
  for (const entry of safeReadDir(versionsRoot)) {
    const versionDir = join(versionsRoot, entry)
    if (!safeIsDirectory(versionDir)) {
      continue
    }
    const skillDir = join(versionDir, 'skills', 'xpod-cli')
    if (existsSync(join(skillDir, 'SKILL.md'))) {
      candidates.push({ version: entry, dir: skillDir })
    }
  }

  candidates.sort((a, b) => compareVersionLike(b.version, a.version))
  return candidates[0]?.dir ?? null
}

function resolveMarketSkillVersion(skillDir: string): string | undefined {
  const version = basename(dirname(dirname(skillDir)))
  return version && version !== 'skills' ? version : undefined
}

function safeReadDir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function safeIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function compareVersionLike(a: string, b: string): number {
  const left = a.split(/[.-]/u).map((part) => Number(part))
  const right = b.split(/[.-]/u).map((part) => Number(part))
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const l = Number.isFinite(left[i]) ? left[i] : 0
    const r = Number.isFinite(right[i]) ? right[i] : 0
    if (l !== r) {
      return l - r
    }
  }
  return a.localeCompare(b)
}

function enableLinxXhighThinking(session: {
  model?: { provider?: string; reasoning?: boolean }
  supportsXhighThinking?: () => boolean
  getAvailableThinkingLevels?: () => string[]
}): void {
  const originalSupportsXhighThinking = session.supportsXhighThinking?.bind(session)
  const originalGetAvailableThinkingLevels = session.getAvailableThinkingLevels?.bind(session)

  session.supportsXhighThinking = () => (
    session.model?.provider === UNDEFINEDS_PROVIDER_ID && session.model.reasoning
      ? (session.getAvailableThinkingLevels?.().includes('xhigh') ?? true)
      : (originalSupportsXhighThinking?.() ?? false)
  )

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

function createBearerAuthFetch(apiKey: string): RemoteAuthFetch {
  return async (url, init) => {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${apiKey}`)
    return fetch(url, { ...init, headers })
  }
}

function resolveRuntimeAuthFetchFromApiKey(apiKey: string | undefined): RemoteAuthFetch | null {
  const trimmed = apiKey?.trim()
  if (!trimmed || trimmed === LINX_RUNTIME_MANAGED_AUTH_KEY) {
    return null
  }
  return createBearerAuthFetch(trimmed)
}

async function resolveLinxPiCloudAuthFetch(options: {
  issuerUrl?: string
  getPodDataSession?: () => Promise<PodDataSession | null>
}): Promise<RemoteAuthFetch> {
  if (options.getPodDataSession) {
    return createPodDataSessionAuthFetch(options.getPodDataSession)
  }

  const session = await getDefaultPodDataSession()
  if (session) {
    return withCloudCompletionTimeout(session.runtimeFetch)
  }

  throw new Error('No LinX cloud login found. Interactive TUI supports /login in-app. For non-interactive --print mode, run `linx login` first.')
}

function createPodDataSessionAuthFetch(
  getPodDataSession: () => Promise<PodDataSession | null>,
): RemoteAuthFetch {
  if (getPodDataSession !== getDefaultPodDataSession) {
    return withCloudCompletionTimeout(async (url, init) => {
      const session = await getPodDataSession()
      if (session) {
        try {
          return await session.runtimeFetch(url, init)
        } finally {
          await session.close().catch(() => undefined)
        }
      }

      throw new Error('No LinX cloud login found. Interactive TUI supports /login in-app. For non-interactive --print mode, run `linx login` first.')
    })
  }

  let cachedSession: PodDataSession | null = null
  let cachedSessionPromise: Promise<PodDataSession | null> | null = null

  const getCachedSession = async (): Promise<PodDataSession | null> => {
    if (cachedSession) {
      return cachedSession
    }
    if (!cachedSessionPromise) {
      cachedSessionPromise = getPodDataSession().then((session) => {
        cachedSession = session
        return session
      }).finally(() => {
        cachedSessionPromise = null
      })
    }
    return cachedSessionPromise
  }

  return withCloudCompletionTimeout(async (url, init) => {
    const session = await getCachedSession()
    if (session) {
      return await session.runtimeFetch(url, init)
    }

    throw new Error('No LinX cloud login found. Interactive TUI supports /login in-app. For non-interactive --print mode, run `linx login` first.')
  })
}

function withCloudCompletionTimeout(fetcher: RemoteAuthFetch): RemoteAuthFetch {
  return async (url, init) => {
    if (!isChatCompletionRuntimeUrl(String(url))) {
      return fetcher(url, init)
    }

    const timeoutMs = resolveLinxCloudCompletionTimeoutMs()
    const controller = new AbortController()
    const signal = init?.signal
      ? combineAbortSignals(init.signal, controller.signal)
      : controller.signal
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    try {
      return await Promise.race([
        fetcher(url, { ...init, signal }),
        new Promise<Response>((_resolve, reject) => {
          controller.signal.addEventListener('abort', () => {
            if (timedOut) {
              reject(new RemoteChatRequestError(
                formatLinxCloudTransientMessage(`Request exceeded ${formatTimeoutSeconds(timeoutMs)}s.`),
                0,
                `Timed out waiting for POST ${url}`,
              ))
            }
          }, { once: true })
        }),
      ])
    } catch (error) {
      if (timedOut) {
        throw new RemoteChatRequestError(
          formatLinxCloudTransientMessage(`Request exceeded ${formatTimeoutSeconds(timeoutMs)}s.`),
          0,
          error instanceof Error ? error.message : String(error),
        )
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}

function resolveLinxCloudCompletionTimeoutMs(): number {
  const raw = process.env.LINX_CHAT_TIMEOUT_MS
  if (!raw) {
    return DEFAULT_LINX_CLOUD_COMPLETION_TIMEOUT_MS
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LINX_CLOUD_COMPLETION_TIMEOUT_MS
}

function formatTimeoutSeconds(timeoutMs: number): number {
  return Math.max(1, Math.round(timeoutMs / 1000))
}

function isChatCompletionRuntimeUrl(value: string): boolean {
  try {
    const target = new URL(value)
    const segments = target.pathname.split('/').filter(Boolean)
    return segments.length >= 3
      && /^v\d+$/.test(segments.at(-3) ?? '')
      && segments.at(-2) === 'chat'
      && segments.at(-1) === 'completions'
  } catch {
    return false
  }
}

function combineAbortSignals(left: AbortSignal, right: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([left, right])
  }
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (left.aborted || right.aborted) {
    abort()
    return controller.signal
  }
  left.addEventListener('abort', abort, { once: true })
  right.addEventListener('abort', abort, { once: true })
  return controller.signal
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
  api: Api
  reasoning: boolean
  thinkingLevelMap: {
    xhigh: 'xhigh'
  }
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
    api: UNDEFINEDS_PROVIDER_API,
    reasoning: true,
    thinkingLevelMap: {
      xhigh: 'xhigh',
    },
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
  models: Array<{ id: string; contextWindow?: number }>,
  activeModelId: string,
): Array<{ id: string; contextWindow: number }> {
  const byId = new Map<string, { id: string; contextWindow: number }>()
  for (const id of [
    ...FALLBACK_LINX_CLOUD_MODEL_IDS,
    activeModelId,
  ]) {
    byId.set(id, {
      id,
      contextWindow: normalizeLinxCloudContextWindow(undefined),
    })
  }
  for (const model of models) {
    const id = model.id.trim()
    if (!id) {
      continue
    }
    byId.set(id, {
      id,
      contextWindow: normalizeLinxCloudContextWindow(model.contextWindow),
    })
  }
  return [...byId.values()]
}

function normalizeLinxCloudContextWindow(contextWindow: number | undefined): number {
  return typeof contextWindow === 'number' && Number.isFinite(contextWindow) && contextWindow > 0
    ? contextWindow
    : DEFAULT_LINX_CLOUD_CONTEXT_WINDOW
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
