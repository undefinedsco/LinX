import { createAssistantMessageEventStream, type AssistantMessageEventStream } from '@earendil-works/pi-ai'
import type { LinxRuntimeCompletionBackend } from '../linx-runtime-completion-backend.js'
import type { LinxCompletionBackendResult } from '../linx-completion-backend.js'
import type { AutoModeNormalizedEvent } from '../auto-mode/types.js'
import {
  normalizeChatCompletionMessagesFromPiContext,
  normalizeChatCompletionToolsFromPiContext,
  resolveLatestUserTextFromChatCompletionMessages,
  type LinxChatCompletionContextMessage,
  type LinxChatCompletionContextTool,
} from '../linx-chat-completion-projection.js'
import {
  createLinxPiAssistantMessage,
  emitLinxCompletionResultToPiStream,
  resolveLinxPiModelId,
} from '../linx-pi-completion-events.js'
import { createLinxBackendEventSource } from '../linx-backend-event-source.js'
import { emitNormalizedBackendEventsToPiStream } from '../linx-pi-normalized-event-stream.js'
import { emitLinxPiStreamError } from '../linx-pi-stream-errors.js'
import { throwIfLinxStreamAborted } from '../linx-stream-abort.js'
import type { NativeBackendStreamProxy } from '../native-backend-stream-backend.js'

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
  backend?: NativeBackendStreamProxy
  completionBackend?: LinxRuntimeCompletionBackend
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
        const prompt = resolveLatestUserTextFromChatCompletionMessages(normalizedMessages)

        if (options.completionBackend) {
          throwIfLinxStreamAborted(streamOptions?.signal)
          const reply = await options.completionBackend.complete({
            model: resolvedModelId,
            apiKey: streamOptions?.apiKey,
            authFetch: streamOptions?.authFetch,
            messages: normalizedMessages,
            tools: normalizedTools,
            systemPrompt: context?.systemPrompt,
            signal: streamOptions?.signal,
          })
          throwIfLinxStreamAborted(streamOptions?.signal)
          emitLinxCompletionResultToPiStream(stream, message, reply)
          return
        }

        const source = options.eventSource?.() ?? (options.backend ? createLinxBackendEventSource(options.backend, prompt) : undefined)
        await emitNormalizedBackendEventsToPiStream(stream, message, source)
      })().catch((error) => {
        emitLinxPiStreamError(stream, error, { signal: streamOptions?.signal })
      })

      return stream
    },
  }
}
