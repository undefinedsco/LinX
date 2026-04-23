import { appendFileSync } from 'node:fs'
import { createAssistantMessageEventStream, type AssistantMessage, type AssistantMessageEventStream } from '@mariozechner/pi-ai'
import type { WatchNormalizedEvent } from '../watch/types.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from '../default-model.js'

const UNDEFINEDS_PROVIDER_ID = 'undefineds'
const UNDEFINEDS_PROVIDER_API = 'linx-cloud-chat-completions'

type PiStreamContextMessage = {
  role?: string
  content?: unknown
}

export interface PiAgentStreamAdapterOptions {
  sessionId?: string
  cwd?: string
  model?: string
  eventSource?: () => AsyncIterable<WatchNormalizedEvent> | Iterable<WatchNormalizedEvent>
  backend?: {
    sendTurn(input: string): Promise<void>
    subscribe(listener: (event: WatchNormalizedEvent) => void): () => void
  }
  completionBackend?: {
    complete(input: {
      model?: string
      apiKey?: string
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    }): Promise<string>
  }
}

export interface PiAgentStreamAdapter {
  readonly sessionId?: string
  readonly cwd?: string
  readonly model?: string
  streamFn(..._args: unknown[]): AssistantMessageEventStream
}

export function createPiAgentStreamAdapter(options: PiAgentStreamAdapterOptions = {}): PiAgentStreamAdapter {
  const createBaseMessage = (modelId?: string): AssistantMessage => ({
    role: 'assistant',
    content: [],
    api: UNDEFINEDS_PROVIDER_API,
    provider: UNDEFINEDS_PROVIDER_ID,
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
      context?: { messages?: Array<{ role?: string; content?: unknown }> },
      streamOptions?: { apiKey?: string; modelId?: string },
    ): AssistantMessageEventStream {
      const stream = createAssistantMessageEventStream()
      const resolvedModelId = resolveModelId(modelArg, streamOptions?.modelId, options.model)
      const message = createBaseMessage(resolvedModelId)

      void (async () => {
        stream.push({ type: 'start', partial: { ...message } })
        const normalizedMessages = normalizeContextMessages(context?.messages ?? [])
        const lastUserText = [...normalizedMessages].reverse().find((entry) => entry.role === 'user')
        const prompt = lastUserText?.content ?? ''

        if (options.completionBackend) {
          appendFileSync('/tmp/linx-stream-debug.log', `${JSON.stringify({
            at: new Date().toISOString(),
            model: resolvedModelId,
            messageCount: normalizedMessages.length,
            messages: normalizedMessages,
          })}\n`)
          const reply = await options.completionBackend.complete({
            model: resolvedModelId,
            apiKey: streamOptions?.apiKey,
            messages: normalizedMessages,
          })

          if (reply) {
            message.content = [{ type: 'text', text: '' }]
            stream.push({ type: 'text_start', contentIndex: 0, partial: { ...message } })
            message.content = [{ type: 'text', text: reply }]
            stream.push({
              type: 'text_delta',
              contentIndex: 0,
              delta: reply,
              partial: { ...message },
            })
            stream.push({
              type: 'text_end',
              contentIndex: 0,
              content: reply,
              partial: { ...message },
            })
          }

          stream.push({
            type: 'done',
            reason: 'stop',
            message,
          })
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
        errorMessage.stopReason = 'error'
        errorMessage.errorMessage = error instanceof Error ? error.message : String(error)
        stream.push({ type: 'error', reason: 'error', error: errorMessage })
      })

      return stream
    },
  }
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

function normalizeContextMessages(
  messages: PiStreamContextMessage[],
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  return messages
    .map((entry) => {
      const role = entry.role === 'system' || entry.role === 'assistant' || entry.role === 'user'
        ? entry.role
        : null
      if (!role) {
        return null
      }

      const content = normalizeMessageContent(entry.content)
      if (!content) {
        return null
      }

      return { role, content }
    })
    .filter((entry): entry is { role: 'system' | 'user' | 'assistant'; content: string } => Boolean(entry))
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part
      }

      if (typeof part === 'object' && part !== null && 'text' in part) {
        return String((part as { text?: unknown }).text ?? '')
      }

      return ''
    })
    .join('')
}

async function* createBackendEventSource(
  backend: {
    sendTurn(input: string): Promise<void>
    subscribe(listener: (event: WatchNormalizedEvent) => void): () => void
  },
  prompt: string,
): AsyncIterable<WatchNormalizedEvent> {
  const queue: WatchNormalizedEvent[] = []
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
