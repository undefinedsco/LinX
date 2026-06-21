import { createAssistantMessageEventStream, type AssistantMessage, type AssistantMessageEventStream } from '@earendil-works/pi-ai'
import type { RemoteChatMessage, RemoteChatTool } from '../chat-api.js'
import type { LinxCompletionBackendResult } from '../linx-completion-backend.js'
import type { AutoModeNormalizedEvent } from '../auto-mode/types.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from '../default-model.js'
import {
  normalizeChatCompletionMessagesFromPiContext,
  normalizeChatCompletionToolsFromPiContext,
  type LinxChatCompletionContextMessage,
  type LinxChatCompletionContextTool,
} from '../linx-chat-completion-projection.js'
import {
  LINX_CLOUD_PROVIDER_API,
  LINX_CLOUD_PROVIDER_ID,
} from '../linx-cloud-models.js'
import { formatLinxStreamErrorMessage, isLinxStreamAbortError } from '../linx-stream-error-formatting.js'

export type { LinxCompletionBackendResult, PiCompletionBackendResult } from '../linx-completion-backend.js'

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

/** @deprecated Use LinxAgentStreamAdapterOptions. */
export type PiAgentStreamAdapterOptions = LinxAgentStreamAdapterOptions

export interface LinxAgentStreamAdapter {
  readonly sessionId?: string
  readonly cwd?: string
  readonly model?: string
  streamFn(..._args: unknown[]): AssistantMessageEventStream
}

/** @deprecated Use LinxAgentStreamAdapter. */
export type PiAgentStreamAdapter = LinxAgentStreamAdapter

export function createLinxAgentStreamAdapter(options: LinxAgentStreamAdapterOptions = {}): LinxAgentStreamAdapter {
  const createBaseMessage = (modelId?: string): AssistantMessage => ({
    role: 'assistant',
    content: [],
    api: LINX_CLOUD_PROVIDER_API,
    provider: LINX_CLOUD_PROVIDER_ID,
    model: modelId ?? options.model ?? DEFAULT_LINX_CLOUD_MODEL_ID,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  })

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
      const resolvedModelId = resolveModelId(modelArg, streamOptions?.modelId, options.model)
      const message = createBaseMessage(resolvedModelId)

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
          emitCompletionResult(stream, message, reply)
          return
        }

        const source = options.eventSource?.() ?? (options.backend ? createBackendEventSource(options.backend, prompt) : undefined)
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
        const errorMessage = createBaseMessage()
        const aborted = isLinxStreamAbortError(error) || streamOptions?.signal?.aborted === true
        errorMessage.stopReason = aborted ? 'aborted' : 'error'
        errorMessage.errorMessage = formatLinxStreamErrorMessage(error)
        stream.push({ type: 'error', reason: errorMessage.stopReason, error: errorMessage })
      })

      return stream
    },
  }
}

export const createPiAgentStreamAdapter = createLinxAgentStreamAdapter

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

function resolveModelId(modelArg: unknown, overrideModelId?: string, fallbackModelId?: string): string {
  if (overrideModelId?.trim()) {
    return overrideModelId.trim()
  }

  if (typeof modelArg === 'object' && modelArg !== null && 'id' in modelArg) {
    const modelId = (modelArg as { id?: unknown }).id
    if (typeof modelId === 'string' && modelId.trim()) {
      return modelId.trim()
    }
  }

  if (fallbackModelId?.trim()) {
    return fallbackModelId.trim()
  }

  return DEFAULT_LINX_CLOUD_MODEL_ID
}

function emitCompletionResult(
  stream: AssistantMessageEventStream,
  message: AssistantMessage,
  reply: string | LinxCompletionBackendResult,
): void {
  const content = typeof reply === 'string' ? reply : reply.content ?? ''
  const toolCalls = typeof reply === 'string' ? [] : reply.toolCalls ?? []
  if (!isStringReply(reply) && reply.usage) {
    message.usage = {
      input: reply.usage.input,
      output: reply.usage.output,
      cacheRead: reply.usage.cacheRead,
      cacheWrite: reply.usage.cacheWrite,
      totalTokens: reply.usage.totalTokens,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    }
  }

  if (content) {
    const contentIndex = message.content.length
    message.content.push({ type: 'text', text: '' })
    stream.push({ type: 'text_start', contentIndex, partial: { ...message } })
    message.content[contentIndex] = { type: 'text', text: content }
    stream.push({ type: 'text_delta', contentIndex, delta: content, partial: { ...message } })
    stream.push({ type: 'text_end', contentIndex, content, partial: { ...message } })
  }

  for (const toolCall of toolCalls) {
    const parsedArguments = parseToolArguments(toolCall.function.arguments)
    const contentIndex = message.content.length
    const piToolCall = {
      type: 'toolCall' as const,
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: parsedArguments,
    }
    message.content.push(piToolCall)
    stream.push({ type: 'toolcall_start', contentIndex, partial: { ...message } })
    stream.push({
      type: 'toolcall_delta',
      contentIndex,
      delta: toolCall.function.arguments,
      partial: { ...message },
    })
    stream.push({
      type: 'toolcall_end',
      contentIndex,
      toolCall: piToolCall,
      partial: { ...message },
    })
  }

  const reason = toolCalls.length > 0 || (!isStringReply(reply) && reply.finishReason === 'tool_calls') ? 'toolUse' : 'stop'
  message.stopReason = reason
  stream.push({ type: 'done', reason, message })
}

function parseToolArguments(input: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(input || '{}')
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function isStringReply(reply: string | LinxCompletionBackendResult): reply is string {
  return typeof reply === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function* createBackendEventSource(
  backend: {
    sendTurn(input: string): Promise<void>
    subscribe(listener: (event: AutoModeNormalizedEvent) => void): () => void
  },
  prompt: string,
): AsyncIterable<AutoModeNormalizedEvent> {
  const queue: AutoModeNormalizedEvent[] = []
  let notify: (() => void) | null = null
  let done = false
  const unsubscribe = backend.subscribe((event) => {
    queue.push(event)
    notify?.()
    notify = null
    if (event.type === 'assistant.done') {
      done = true
    }
  })

  try {
    await backend.sendTurn(prompt)
    while (!done || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          notify = resolve
        })
        continue
      }

      const event = queue.shift()
      if (event) {
        yield event
      }
    }
  } finally {
    unsubscribe()
  }
}
