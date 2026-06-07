import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAssistantMessageEventStream, type AssistantMessage, type AssistantMessageEventStream } from '@earendil-works/pi-ai'
import type { RemoteChatMessage, RemoteChatTool, RemoteChatToolCall } from '../chat-api.js'
import type { AutoModeNormalizedEvent } from '../auto-mode/types.js'
import { DEFAULT_LINX_CLOUD_MODEL_ID } from '../default-model.js'
import { normalizeMisclassifiedCloudCompletionPodTimeoutMessage } from '../linx-cloud-errors.js'
import { getSolidLinxAgentDir } from '../solid-local-store.js'

const UNDEFINEDS_PROVIDER_ID = 'undefineds'
const UNDEFINEDS_PROVIDER_API = 'linx-cloud-chat-completions'
const DEFAULT_TOOL_RESULT_INLINE_CHAR_LIMIT = 12_000
const DEFAULT_TOOL_RESULT_EXCERPT_HEAD_CHARS = 6_000
const DEFAULT_TOOL_RESULT_EXCERPT_TAIL_CHARS = 1_200

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

/** @deprecated Use LinxCompletionBackendResult. */
export type PiCompletionBackendResult = LinxCompletionBackendResult

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
      streamOptions?: PiStreamOptions,
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
        const aborted = isAbortError(error) || streamOptions?.signal?.aborted === true
        errorMessage.stopReason = aborted ? 'aborted' : 'error'
        errorMessage.errorMessage = formatStreamErrorMessage(error)
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

function formatStreamErrorMessage(error: unknown): string {
  if (isAbortError(error)) {
    return 'Request was aborted.'
  }
  if (isAuthExpiredError(error)) {
    return 'LinX Cloud login expired.'
  }
  const misclassifiedPodRuntimeTimeout = formatMisclassifiedPodRuntimeTimeout(error)
  if (misclassifiedPodRuntimeTimeout) {
    return misclassifiedPodRuntimeTimeout
  }
  return error instanceof Error ? error.message : String(error)
}

function formatMisclassifiedPodRuntimeTimeout(error: unknown): string | null {
  return normalizeMisclassifiedCloudCompletionPodTimeoutMessage(error)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function isAuthExpiredError(error: unknown): boolean {
  if (isRecord(error) && error.authExpired === true) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  return normalized.includes('linx cloud login expired')
    || normalized.includes('invalid solid token')
    || (normalized.includes('chat request failed (401)') && normalized.includes('unauthorized'))
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
      const reasoningContent = normalizeAssistantReasoningContent(entry.content)
      if (content || toolCalls.length > 0) {
        normalized.push({
          role: 'assistant',
          content: content || '',
          ...(reasoningContent && toolCalls.length > 0 ? { reasoning_content: reasoningContent } : {}),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        })
      }
      continue
    }

    if (entry.role === 'toolResult' || entry.role === 'tool') {
      const rawContent = normalizeMessageContent(entry.content) || '(empty tool result)'
      const toolCallId = typeof entry.toolCallId === 'string' ? entry.toolCallId : undefined
      if (toolCallId) {
        const content = materializeLargeToolResult(rawContent, {
          toolCallId,
          toolName: typeof entry.toolName === 'string' ? entry.toolName : undefined,
        })
        normalized.push({
          role: 'tool',
          content,
          tool_call_id: toolCallId,
          ...(typeof entry.toolName === 'string' ? { name: entry.toolName } : {}),
        })
      }
    }
  }

  return sanitizeChatCompletionMessages(normalized)
}

function materializeLargeToolResult(
  content: string,
  metadata: {
    toolCallId: string
    toolName?: string
  },
): string {
  const inlineLimit = readPositiveIntegerEnv(
    'LINX_TOOL_RESULT_INLINE_CHAR_LIMIT',
    DEFAULT_TOOL_RESULT_INLINE_CHAR_LIMIT,
  )
  if (content.length <= inlineLimit) {
    return content
  }

  const digest = createHash('sha256').update(content).digest('hex')
  const dir = join(
    getSolidLinxAgentDir(),
    'artifacts',
    'tool-results',
    new Date().toISOString().slice(0, 10),
  )
  const filePath = join(dir, `${sanitizePathSegment(metadata.toolName ?? 'tool')}-${digest.slice(0, 16)}.txt`)
  const excerpt = buildToolResultExcerpt(content)
  const descriptor = [
    '[LinX large tool result materialized]',
    `tool: ${metadata.toolName ?? 'unknown'}`,
    `tool_call_id: ${metadata.toolCallId}`,
    `original_chars: ${content.length}`,
    `sha256: ${digest}`,
    `path: ${filePath}`,
    'The full tool output was omitted from chat history to keep the model request valid.',
    'Read the file above when exact details are needed.',
    '',
    'inline_excerpt:',
    excerpt,
  ]

  try {
    if (!existsSync(filePath)) {
      mkdirSync(dir, { recursive: true })
      writeFileSync(filePath, content, 'utf-8')
    }
  } catch (error) {
    descriptor.splice(6, 0, `artifact_write_error: ${error instanceof Error ? error.message : String(error)}`)
  }

  return descriptor.join('\n')
}

function buildToolResultExcerpt(content: string): string {
  const headChars = readPositiveIntegerEnv(
    'LINX_TOOL_RESULT_EXCERPT_HEAD_CHARS',
    DEFAULT_TOOL_RESULT_EXCERPT_HEAD_CHARS,
  )
  const tailChars = readPositiveIntegerEnv(
    'LINX_TOOL_RESULT_EXCERPT_TAIL_CHARS',
    DEFAULT_TOOL_RESULT_EXCERPT_TAIL_CHARS,
  )
  if (content.length <= headChars + tailChars) {
    return content
  }

  const omitted = content.length - headChars - tailChars
  return [
    content.slice(0, headChars),
    '',
    `[... omitted ${omitted} chars; full output is in the artifact file ...]`,
    '',
    content.slice(-tailChars),
  ].join('\n')
}

function sanitizePathSegment(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return sanitized || 'tool'
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function sanitizeChatCompletionMessages(messages: RemoteChatMessage[]): RemoteChatMessage[] {
  const sanitized: RemoteChatMessage[] = []

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]

    if (message.role === 'tool') {
      continue
    }

    if (message.role !== 'assistant' || !message.tool_calls?.length) {
      sanitized.push(message)
      continue
    }

    const followingToolMessages: RemoteChatMessage[] = []
    let nextIndex = index + 1
    while (nextIndex < messages.length && messages[nextIndex]?.role === 'tool') {
      followingToolMessages.push(messages[nextIndex])
      nextIndex += 1
    }

    const toolResultIds = new Set(
      followingToolMessages
        .map((toolMessage) => toolMessage.tool_call_id)
        .filter((toolCallId): toolCallId is string => typeof toolCallId === 'string' && toolCallId.length > 0),
    )
    const matchedToolCalls = message.tool_calls.filter((toolCall) => toolResultIds.has(toolCall.id))

    if (matchedToolCalls.length > 0) {
      const matchedToolCallIds = new Set(matchedToolCalls.map((toolCall) => toolCall.id))
      const emittedToolResults = new Set<string>()
      sanitized.push({
        ...message,
        tool_calls: matchedToolCalls,
      })

      for (const toolMessage of followingToolMessages) {
        const toolCallId = toolMessage.tool_call_id
        if (typeof toolCallId !== 'string' || !matchedToolCallIds.has(toolCallId) || emittedToolResults.has(toolCallId)) {
          continue
        }
        sanitized.push(toolMessage)
        emittedToolResults.add(toolCallId)
      }
    } else if (hasVisibleMessageContent(message.content)) {
      sanitized.push({
        role: 'assistant',
        content: message.content,
      })
    }

    index = nextIndex - 1
  }

  return sanitized
}

function hasVisibleMessageContent(content: RemoteChatMessage['content']): boolean {
  if (typeof content === 'string') {
    return content.trim().length > 0
  }

  if (!Array.isArray(content)) {
    return false
  }

  return content.some((part) => typeof part.text === 'string' && part.text.trim().length > 0)
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

function normalizeAssistantReasoningContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((part) => {
      if (!isRecord(part) || part.type !== 'thinking') {
        return ''
      }
      const signature = typeof part.thinkingSignature === 'string' ? part.thinkingSignature : ''
      if (signature && signature !== 'reasoning_content') {
        return ''
      }
      return typeof part.thinking === 'string' ? part.thinking : ''
    })
    .join('')
    .trim()
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
