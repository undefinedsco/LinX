import type { Api } from '@earendil-works/pi-ai'
import { DEFAULT_LINX_CLOUD_MODEL_ID, resolvePreferredLinxCloudModelId } from './default-model.js'
import { isRemoteAuthExpiredError, type RemoteAuthFetch, type RemoteChatMessage, type RemoteChatTool } from './chat-api.js'
import type { LinxCompletionBackendResult } from './linx-completion-backend.js'
import { loadCredentials } from './credentials-store.js'
import { clearDefaultPodDataSession, type PodDataSession } from './pod-data-session.js'
import { resolveLinxCloudRuntimeAuthFetch } from './linx-cloud-runtime-auth.js'
import {
  buildFallbackLinxCloudProviderModels,
  buildLinxCloudProviderModel,
  mergeLinxCloudProviderModels,
} from './linx-cloud-models.js'

type LinxCloudRuntimeModel = {
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
}

export type LinxCloudRuntimeCoordinator = {
  readonly providerModels: LinxCloudRuntimeModel[]
  getActiveModelId(): string
  shouldPromptLoginOnStart(): boolean
  syncProviderModels(authSession: { runtimeFetch: RemoteAuthFetch }, options?: { throwAuthExpired?: boolean; refreshOnAuthExpired?: boolean }): Promise<void>
  completeWithAuthRecovery(authFetch: RemoteAuthFetch, request: {
    runtimeUrl: string
    model?: string
    messages: RemoteChatMessage[]
    tools?: RemoteChatTool[]
    signal?: AbortSignal
  }): Promise<string | LinxCompletionBackendResult>
}

export function createLinxCloudRuntimeCoordinator(options: {
  requestedModel?: string
  runtimeUrl: string
  issuerUrl?: string
  getPodDataSession?: () => Promise<PodDataSession | null>
  createRemoteCompletion?: (options: {
    runtimeUrl: string
    authFetch: RemoteAuthFetch
    model?: string
    messages: RemoteChatMessage[]
    tools?: RemoteChatTool[]
    signal?: AbortSignal
  }) => Promise<string | LinxCompletionBackendResult>
  listRemoteModels?: (
    authFetch: RemoteAuthFetch,
    runtimeUrl: string,
    options?: { fallback?: boolean; timeoutMs?: number },
  ) => Promise<Array<{ id: string; contextWindow?: number }>>
}): LinxCloudRuntimeCoordinator {
  let activeModelId = options.requestedModel ?? DEFAULT_LINX_CLOUD_MODEL_ID
  let shouldPromptLogin = false
  const providerModels = buildFallbackLinxCloudProviderModels(activeModelId) as LinxCloudRuntimeModel[]

  return {
    providerModels,
    getActiveModelId() {
      return activeModelId
    },
    shouldPromptLoginOnStart() {
      return shouldPromptLogin
    },
    async syncProviderModels(authSession, recoveryOptions = {}) {
      if (!options.listRemoteModels) {
        return
      }

      const remoteModels = await listRemoteModelsWithAuthRecovery(authSession.runtimeFetch, recoveryOptions)
      if (remoteModels.length === 0) {
        return
      }

      const mergedModels = mergeLinxCloudProviderModels(remoteModels.map((entry) => ({
        id: entry.id,
        contextWindow: entry.contextWindow,
      })), activeModelId)
      const nextModels = mergedModels.map((entry) => buildLinxCloudProviderModel(entry)) as LinxCloudRuntimeModel[]
      providerModels.splice(0, providerModels.length, ...nextModels)

      if (!options.requestedModel) {
        activeModelId = resolvePreferredLinxCloudModelId(nextModels, activeModelId)
      }
    },
    async completeWithAuthRecovery(authFetch, request) {
      if (!options.createRemoteCompletion) {
        throw new Error('Cloud LinX runtime backend requires createRemoteCompletion')
      }
      try {
        return await options.createRemoteCompletion({
          ...request,
          authFetch,
        })
      } catch (error) {
        if (!isRemoteAuthExpiredError(error)) {
          throw error
        }

        const refreshedAuthFetch = await resolveRefreshedLinxCloudAuthFetch()
        if (!refreshedAuthFetch) {
          throw error
        }

        return options.createRemoteCompletion({
          ...request,
          authFetch: refreshedAuthFetch,
        })
      }
    },
  }

  async function listRemoteModelsWithAuthRecovery(
    authFetch: RemoteAuthFetch,
    recoveryOptions: { throwAuthExpired?: boolean; refreshOnAuthExpired?: boolean },
  ): Promise<Array<{ id: string; contextWindow?: number }>> {
    try {
      return await options.listRemoteModels!(authFetch, options.runtimeUrl, { fallback: false, timeoutMs: 5000 })
    } catch (error) {
      if (!isRemoteAuthExpiredError(error)) {
        return []
      }

      if (recoveryOptions.refreshOnAuthExpired) {
        try {
          const refreshedAuthFetch = await resolveRefreshedLinxCloudAuthFetch()
          if (refreshedAuthFetch) {
            return await options.listRemoteModels!(refreshedAuthFetch, options.runtimeUrl, { fallback: false, timeoutMs: 5000 })
          }
        } catch (retryError) {
          if (!isRemoteAuthExpiredError(retryError)) {
            return []
          }
        }
      }

      shouldPromptLogin = true
      if (recoveryOptions.throwAuthExpired) {
        throw error
      }
      return []
    }
  }

  async function resolveRefreshedLinxCloudAuthFetch(): Promise<RemoteAuthFetch | null> {
    clearDefaultPodDataSession()

    const storedCredentials = loadCredentials()
    if (storedCredentials || options.getPodDataSession) {
      return resolveLinxCloudRuntimeAuthFetch({
        issuerUrl: options.issuerUrl,
        getPodDataSession: options.getPodDataSession,
      })
    }

    return null
  }
}
