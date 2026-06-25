import type { RemoteChatToolCall } from './chat-api.js'

export interface LinxCompletionBackendResult {
  content?: string
  reasoningContent?: string
  toolCalls?: RemoteChatToolCall[]
  finishReason?: string | null
  usage?: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    totalTokens: number
  }
}
