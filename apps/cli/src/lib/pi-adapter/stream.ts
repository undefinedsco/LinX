import { createAssistantMessageEventStream, type AssistantMessageEventStream } from '@earendil-works/pi-ai'
import type { RemoteChatMessage, RemoteChatTool } from '../chat-api.js'
import type { LinxCompletionBackendResult } from '../linx-completion-backend.js'
import type { AutoModeNormalizedEvent } from '../auto-mode/types.js'
import {
  normalizeChatCompletionMessagesFromPiContext,
  normalizeChatCompletionToolsFromPiContext,
  type LinxChatCompletionContextMessage,
  type LinxChatCompletionContextTool,
} from '../linx-chat-completion-projection.js'
import {
  createLinxPiAssistantMessage,
  emitLinxCompletionResultToPiStream,
  resolveLinxPiModelId,
} from '../linx-pi-completion-events.js'
import { createLinxBackendEventSource } from '../linx-backend-event-source.js'
import { formatLinxStreamErrorMessage, isLinxStreamAbortError } from '../linx-stream-error-formatting.js'

export type { LinxCompletionBackendResult } from '../linx-completion-backend.js'

type PiStreamOptions = {
  apiKey?: string
  authFetch?: (url: string, init?: RequestInit) => Promise<Response>
  modelId?: string
  signal?: AbortSignal
}

export interface LinxAgentStreamAdapterOptions {
  sessionId?: string
  cwd?: string
  model?: string
  eventSource?: () => AsyncIterable<AutoModeNormalizedEvent> | Iterable<AutoModeNormalizedEvent>
  backend?: {
    sendTurn(input: string): Promise<void>
    subscribe(listener: (event: AutoModeNormalizedEvent) => void): () => void
  }
  completionBackend?: {
    complete(input: {
      model?: string
      apiKey?: string
      authFetch?: (url: string, init?: RequestInit) => Promise<Response>
      messages: RemoteChatMessage[]
      tools?: RemoteChatTool[]
      systemPrompt?: string
      signal?: AbortSignal
    }): Promise<string | LinxCompletionBackendResult>
  }
}

export interface LinxAgentStreamAdapter {
  readonly sessionId?: string
  readonly cwd?: string
  readonly model?: string
  streamFn(..._args: unknown[]): AssistantMessageEventStream
}

export function createLinxAgentStreamAdapter(options: LinxAgentStreamAdapterOptions = {}): LinxAgentStreamAdapter {
  return {
    sessionId: options.sessionId,
    cwd: options.cwd,
    model: options.model,
    streamFn(
      modelArg?: unknown,
      context?: {
        messages?: LinxChatCompletionContextMessage[]
        tools?: LinxChatCompletionContextTool[]
        systemPrompt?: string
      },
      streamOptions?: PiStreamOptions,
    ): AssistantMessageEventStream {
      const stream = createAssistantMessageEventStream()
      const resolvedModelId = resolveLinxPiModelId(modelArg, streamOptions?.modelId, options.model)
      const message = createLinxPiAssistantMessage(resolvedModelId)

      void (async () => {
        stream.push({ type: 'start', partial: { ...message } })
        const normalizedMessages = normalizeChatCompletionMessagesFromPiContext(context)
        const normalizedTools = normalizeChatCompletionToolsFromPiContext(context?.tools)
        const lastUserText = [...normalizedMessages].reverse().find((entry) => entry.role === 'user')
        const prompt = typeof lastUserText?.content === 'string' ? lastUserText.content : ''

        if (options.completionBackend) {
          throwIfAborted(streamOptions?.signal)
          const reply = await options.completionBackend.complete({
            model: resolvedModelId,
            apiKey: streamOptions?.apiKey,
            authFetch: streamOptions?.authFetch,
            messages: normalizedMessages,
            tools: normalizedTools,
            systemPrompt: context?.systemPrompt,
            signal: streamOptions?.signal,
          })
          throwIfAborted(streamOptions?.signal)
          emitLinxCompletionResultToPiStream(stream, message, reply)
          return
        }

        const source = options.eventSource?.() ?? (options.backend ? createLinxBackendEventSource(options.backend, prompt) : undefined)
        let text = ''
        let textStarted = false

        if (source) {
          for await (const event of source) {
            if (event.type === 'assistant.delta') {
              if (!textStarted) {
                message.content = [{ type: 'text', text: '' }]
                stream.push({ type: 'text_start', contentIndex: 0, partial: { ...message } })
                textStarted = true
              }

              text += event.text
              message.content = [{ type: 'text', text }]
              stream.push({
                type: 'text_delta',
                contentIndex: 0,
                delta: event.text,
                partial: { ...message },
              })
              continue
            }

            if (event.type === 'assistant.done') {
              break
            }
          }
        }

        if (textStarted) {
          stream.push({
            type: 'text_end',
            contentIndex: 0,
            content: text,
            partial: { ...message },
          })
        }

        stream.push({
          type: 'done',
          reason: 'stop',
          message,
        })
      })().catch((error) => {
        const errorMessage = createLinxPiAssistantMessage()
        const aborted = isLinxStreamAbortError(error) || streamOptions?.signal?.aborted === true
        errorMessage.stopReason = aborted ? 'aborted' : 'error'
        errorMessage.errorMessage = formatLinxStreamErrorMessage(error)
        stream.push({ type: 'error', reason: errorMessage.stopReason, error: errorMessage })
      })

      return stream
    },
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return
  }
  throw createAbortError()
}

function createAbortError(): Error {
  const error = new Error('Request was aborted.')
  error.name = 'AbortError'
  return error
}
