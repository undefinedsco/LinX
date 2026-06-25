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
import type { Api, Model, OAuthCredentials } from '@earendil-works/pi-ai'
import type { AutoModeWorkerBackend } from './auto-mode/types.js'
import type { BackendCommandRouter } from './backend-command-router-contract.js'
import { loadCredentials } from './credentials-store.js'
import { LINX_CLOUD_PROVIDER_ID, LINX_CLOUD_PROVIDER_LABEL } from './linx-cloud-models.js'
import type { LinxCloudRuntimeCoordinator } from './linx-cloud-runtime-coordinator.js'
import { createLinxBearerAuthFetch, resolveLinxCloudRuntimeAuthFetch } from './linx-cloud-runtime-auth.js'
import { createLinxRuntimeProviderRegistration } from './linx-runtime-provider-registration.js'
import { createLinxManagedRuntimeOAuthProvider } from './linx-runtime-oauth-provider.js'
import {
  LINX_WEB_ACCESS_PACKAGE_SOURCE,
  ensurePiWebAccessConfig,
  resolveBundledLinxSkillsDir,
  resolveBundledPiPackageRoot,
  resolveInstalledMarketSkillDirs,
  withLinxSkillSourceInfo,
} from './linx-runtime-resources.js'
import { overrideLinxSystemPrompt } from './linx-runtime-system-prompt.js'
import { enableLinxXhighThinking } from './linx-runtime-thinking.js'
import { ensureLinxTheme } from './linx-theme.js'
import type { PodDataSession } from './pod-data-session.js'

const UNDEFINEDS_AUTH_BRIDGE_ID = 'undefineds-cloud-oauth-bridge'

export type LinxRuntimeOAuthProvider = {
  name: string
  login(...args: unknown[]): Promise<OAuthCredentials>
  refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>
  getApiKey(credentials: OAuthCredentials): string
  modifyModels?(models: Model<Api>[], credentials: OAuthCredentials): Model<Api>[]
}

export interface LinxCloudPiAuthBridge {
  description: 'undefineds-cloud-oauth-bridge'
  providerId: 'undefineds'
  providerLabel: 'LinX Cloud'
  runtimeUrl: string
  shouldPromptLoginOnStart?: boolean
}

export interface LinxAgentSessionRuntimeContext {
  cwd: string
  agentDir: string
  sessionManager: unknown
  sessionStartEvent?: unknown
}

export type LinxRuntimeBackendSessionRef = {
  id: string
  cwd: string
  model?: string
  backend: string
}

export async function createLinxAgentSessionRuntime(options: {
  context: LinxAgentSessionRuntimeContext
  baseUrl: string
  requestedModel?: string
  streamSimple: unknown
  cloudRuntime: LinxCloudRuntimeCoordinator
  issuerUrl?: string
  oauth?: LinxRuntimeOAuthProvider
  getPodDataSession?: () => Promise<PodDataSession | null>
  workerBackend?: AutoModeWorkerBackend
  backendCommandRouter?: BackendCommandRouter
  backendSessionRef?: LinxRuntimeBackendSessionRef
  autoEnabled?: boolean
  symphonyEnabled?: boolean
}): Promise<AgentSessionRuntime> {
  const authStorage = AuthStorage.inMemory()
  const modelRegistry = ModelRegistry.inMemory(authStorage)
  const linxOAuthProvider = options.oauth ?? createLinxManagedRuntimeOAuthProvider({
    issuerUrl: options.issuerUrl,
    getPodDataSession: options.getPodDataSession,
    syncProviderModels: options.cloudRuntime.syncProviderModels,
  })
  const storedCredentials = options.oauth ? null : loadCredentials()
  const hasManagedPodSession = !options.oauth && Boolean(options.getPodDataSession)
  const explicitOAuthCredential = options.oauth
    ? await options.oauth.login()
    : null
  if (storedCredentials || hasManagedPodSession) {
    const authFetch = await resolveLinxCloudRuntimeAuthFetch({
      issuerUrl: options.issuerUrl,
      getPodDataSession: options.getPodDataSession,
    })
    await options.cloudRuntime.syncProviderModels({ runtimeFetch: authFetch }, { refreshOnAuthExpired: true })
  } else if (explicitOAuthCredential?.access) {
    await options.cloudRuntime.syncProviderModels({ runtimeFetch: createLinxBearerAuthFetch(explicitOAuthCredential.access) })
  }

  const context = options.context
  const settingsManager = SettingsManager.create(context.cwd, context.agentDir)
  ensureLinxTheme(context.agentDir)
  ensurePiWebAccessConfig()
  settingsManager.setTheme('linx')
  const { defaultModelId } = createLinxRuntimeProviderRegistration({
    authStorage,
    modelRegistry,
    settingsManager,
    baseUrl: options.baseUrl,
    requestedModel: options.requestedModel,
    streamSimple: options.streamSimple,
    providerModels: options.cloudRuntime.providerModels,
    oauth: linxOAuthProvider,
    explicitOAuthCredential,
    useManagedRuntimeAuth: !options.oauth,
  })
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
  ;(runtime as unknown as Record<string, unknown>).runtimeBackend = options.workerBackend
  ;(runtime as unknown as Record<string, unknown>).autoEnabled = options.autoEnabled === true
  ;(runtime as unknown as Record<string, unknown>).symphonyEnabled = options.symphonyEnabled === true
  ;(runtime as unknown as Record<string, unknown>).linxAuthBridge = {
    description: UNDEFINEDS_AUTH_BRIDGE_ID,
    providerId: LINX_CLOUD_PROVIDER_ID,
    providerLabel: LINX_CLOUD_PROVIDER_LABEL,
    runtimeUrl: options.baseUrl,
    shouldPromptLoginOnStart: options.cloudRuntime.shouldPromptLoginOnStart(),
  } satisfies LinxCloudPiAuthBridge
  if (options.backendCommandRouter) {
    ;(runtime as unknown as Record<string, unknown>).backendCommandRouter = options.backendCommandRouter
  }
  if (options.backendSessionRef) {
    ;(runtime as unknown as Record<string, unknown>).backendSessionRef = options.backendSessionRef
  }
  if (options.getPodDataSession) {
    ;(runtime as unknown as Record<string, unknown>).getPodDataSession = options.getPodDataSession
  }
  return runtime
}
