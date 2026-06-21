import type { AutoModeNormalizedEvent } from './auto-mode/types.js'
import type { RemoteAuthFetch, RemoteChatMessage, RemoteChatTool } from './chat-api.js'
import type { LinxCompletionBackendResult } from './linx-completion-backend.js'

export type AgentStreamBackendProxy = {
  sendTurn(input: string): Promise<void>
  subscribe(listener: (event: AutoModeNormalizedEvent) => void): () => void
}

export type AgentStreamCompletionBackend = {
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
