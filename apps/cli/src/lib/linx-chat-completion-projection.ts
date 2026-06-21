import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RemoteChatMessage, RemoteChatTool, RemoteChatToolCall } from './chat-api.js'
import { getSolidLinxAgentDir } from './solid-local-store.js'

const DEFAULT_TOOL_RESULT_INLINE_CHAR_LIMIT = 12_000
const DEFAULT_TOOL_RESULT_EXCERPT_HEAD_CHARS = 6_000
const DEFAULT_TOOL_RESULT_EXCERPT_TAIL_CHARS = 1_200

export type LinxChatCompletionContextMessage = {
  role?: string
  content?: unknown
  toolCallId?: string
  toolName?: string
}

export type LinxChatCompletionContextTool = {
  name?: string
  description?: string
  parameters?: unknown
}

export function normalizeChatCompletionMessagesFromPiContext(context?: {
  messages?: LinxChatCompletionContextMessage[]
  systemPrompt?: string
}): RemoteChatMessage[] {
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

export function normalizeChatCompletionToolsFromPiContext(
  tools: LinxChatCompletionContextTool[] | undefined,
): RemoteChatTool[] | undefined {
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

export function resolveLatestUserTextFromChatCompletionMessages(messages: RemoteChatMessage[]): string {
  const lastUserText = [...messages].reverse().find((entry) => entry.role === 'user')
  return typeof lastUserText?.content === 'string' ? lastUserText.content : ''
}

export function materializeLargeToolResult(
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

export function sanitizeChatCompletionMessages(messages: RemoteChatMessage[]): RemoteChatMessage[] {
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

function hasVisibleMessageContent(content: RemoteChatMessage['content']): boolean {
  if (typeof content === 'string') {
    return content.trim().length > 0
  }

  if (!Array.isArray(content)) {
    return false
  }

  return content.some((part) => typeof part.text === 'string' && part.text.trim().length > 0)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
