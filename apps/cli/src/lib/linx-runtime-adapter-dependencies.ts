import type { RemoteAuthFetch, RemoteChatMessage, RemoteChatTool } from './chat-api.js'
import type { LinxCompletionBackendResult } from './linx-completion-backend.js'
import type { CreateNativeBackendProxy } from './native-backend-proxy.js'

export interface LinxRuntimeAdapterDependencies {
  createNativeProxy?: CreateNativeBackendProxy
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
