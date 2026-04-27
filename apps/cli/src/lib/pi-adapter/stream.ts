import { createAssistantMessageEventStream, type AssistantMessage, type AssistantMessageEventStream } from '@mariozechner/pi-ai'
import type { RemoteChatMessage, RemoteChatTool, RemoteChatToolCall } from '../chat-api.js'
import type { WatchNormalizedEvent } from '../watch/types.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from '../default-model.js'

const UNDEFINEDS_PROVIDER_ID = 'undefineds'
const UNDEFINEDS_PROVIDER_API = 'linx-cloud-chat-completions'

type PiStreamContextMessage = {
  role?: string
  content?: unknown
  toolCallId?: string
  toolName?: string
}

type PiStreamTool = {
  name?: string
  description?: string
  parameters?: unknown
}

export interface PiCompletionBackendResult {
  content?: string
  toolCalls?: RemoteChatToolCall[]
  finishReason?: string | null
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
      messages: RemoteChatMessage[]
      tools?: RemoteChatTool[]
      systemPrompt?: string
    }): Promise<string | PiCompletionBackendResult>
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
      context?: { messages?: PiStreamContextMessage[]; tools?: PiStreamTool[]; systemPrompt?: string },
      streamOptions?: { apiKey?: string; modelId?: string },
    ): AssistantMessageEventStream {
      const stream = createAssistantMessageEventStream()
      const resolvedModelId = resolveModelId(modelArg, streamOptions?.modelId, options.model)
      const message = createBaseMessage(resolvedModelId)

      void (async () => {
        stream.push({ type: 'start', partial: { ...message } })
        const normalizedMessages = normalizeContextMessages(context)
        const normalizedTools = normalizeContextTools(context?.tools)
        const lastUserText = [...normalizedMessages].reverse().find((entry) => entry.role === 'user')
        const prompt = typeof lastUserText?.content === 'string' ? lastUserText.content : ''

        if (options.completionBackend) {
          const reply = await options.completionBackend.complete({
            model: resolvedModelId,
            apiKey: streamOptions?.apiKey,
            messages: normalizedMessages,
            tools: normalizedTools,
            systemPrompt: context?.systemPrompt,
          })
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

function normalizeContextMessages(context?: { messages?: PiStreamContextMessage[]; systemPrompt?: string }): RemoteChatMessage[] {
  const messages = context?.messages ?? []
  const normalized: RemoteChatMessage[] = []
  const systemPrompt = context?.systemPrompt?.trim()
  if (systemPrompt) {
    normalized.push({ role: 'system', content: systemPrompt })
  }

  for (const entry of messages) {
    if (entry.role === 'system' || entry.role === 'user') {
      const content = normalizeMessageContent(entry.content)
      if (content) {
        normalized.push({ role: entry.role, content })
      }
      continue
    }

    if (entry.role === 'assistant') {
      const content = normalizeAssistantTextContent(entry.content)
      const toolCalls = normalizeAssistantToolCalls(entry.content)
      if (content || toolCalls.length > 0) {
        normalized.push({
          role: 'assistant',
          content: content || null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        })
      }
      continue
    }

    if (entry.role === 'toolResult' || entry.role === 'tool') {
      const content = normalizeMessageContent(entry.content) || '(empty tool result)'
      const toolCallId = typeof entry.toolCallId === 'string' ? entry.toolCallId : undefined
      if (toolCallId) {
        normalized.push({
          role: 'tool',
          content,
          tool_call_id: toolCallId,
          ...(typeof entry.toolName === 'string' ? { name: entry.toolName } : {}),
        })
      }
    }
  }

  return normalized
}

function normalizeContextTools(tools: PiStreamTool[] | undefined): RemoteChatTool[] | undefined {
  if (!Array.isArray(tools)) {
    return undefined
  }

  const normalized: RemoteChatTool[] = []
  for (const tool of tools) {
    if (!tool?.name) {
      continue
    }
    normalized.push({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })
  }
  return normalized
}

function normalizeAssistantToolCalls(content: unknown): RemoteChatToolCall[] {
  if (!Array.isArray(content)) {
    return []
  }

  return content.flatMap((part) => {
    if (!isRecord(part) || part.type !== 'toolCall') {
      return []
    }
    const id = typeof part.id === 'string' ? part.id : ''
    const name = typeof part.name === 'string' ? part.name : ''
    if (!id || !name) {
      return []
    }
    return [{
      id,
      type: 'function' as const,
      function: {
        name,
        arguments: JSON.stringify(isRecord(part.arguments) ? part.arguments : {}),
      },
    }]
  })
}

function normalizeAssistantTextContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return normalizeMessageContent(content)
  }

  return content
    .map((part) => {
      if (isRecord(part) && part.type === 'text') {
        return String(part.text ?? '')
      }
      return ''
    })
    .join('')
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

      if (isRecord(part) && part.type === 'text') {
        return String(part.text ?? '')
      }

      return ''
    })
    .join('')
}

function emitCompletionResult(
  stream: AssistantMessageEventStream,
  message: AssistantMessage,
  reply: string | PiCompletionBackendResult,
): void {
  const content = typeof reply === 'string' ? reply : reply.content ?? ''
  const toolCalls = typeof reply === 'string' ? [] : reply.toolCalls ?? []

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

function isStringReply(reply: string | PiCompletionBackendResult): reply is string {
  return typeof reply === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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
