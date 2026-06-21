import type { RemoteAuthFetch, RemoteChatMessage, RemoteChatTool } from './chat-api.js'
import type { LinxCompletionBackendResult } from './linx-completion-backend.js'
import type { LinxCloudRuntimeCoordinator } from './linx-cloud-runtime-coordinator.js'
import { resolveLinxCloudRuntimeAuthFetch, resolveRuntimeAuthFetchFromApiKey } from './linx-cloud-runtime-auth.js'
import { withLinxRuntimeSystemPrompt } from './linx-runtime-system-prompt.js'
import type { PodDataSession } from './pod-data-session.js'

export type LinxRuntimeCompletionBackend = {
  complete(input: {
    model?: string
    apiKey?: string
    authFetch?: RemoteAuthFetch
    messages: RemoteChatMessage[]
    tools?: RemoteChatTool[]
    systemPrompt?: string
    signal?: AbortSignal
  }): Promise<string | LinxCompletionBackendResult>
}

export function createLinxRuntimeCompletionBackend(options: {
  cloudRuntime: LinxCloudRuntimeCoordinator
  runtimeUrl: string
  issuerUrl?: string
  getPodDataSession?: () => Promise<PodDataSession | null>
  useExplicitOAuthProvider?: boolean
}): LinxRuntimeCompletionBackend {
  return {
    async complete(input) {
      const authFetch = options.useExplicitOAuthProvider
        ? input.authFetch
          ?? resolveRuntimeAuthFetchFromApiKey(input.apiKey)
          ?? await resolveLinxCloudRuntimeAuthFetch({
            issuerUrl: options.issuerUrl,
            getPodDataSession: options.getPodDataSession,
          })
        : await resolveLinxCloudRuntimeAuthFetch({
          issuerUrl: options.issuerUrl,
          getPodDataSession: options.getPodDataSession,
        })
      return options.cloudRuntime.completeWithAuthRecovery(authFetch, {
        runtimeUrl: options.runtimeUrl,
        model: input.model,
        messages: withLinxRuntimeSystemPrompt(input.systemPrompt, input.messages),
        tools: input.tools,
        signal: input.signal,
      })
    },
  }
}
