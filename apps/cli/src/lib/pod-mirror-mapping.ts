import { createHash } from 'node:crypto'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { SessionEntry, SessionManager } from '@earendil-works/pi-coding-agent'
import {
  agentResource,
  chatResource,
  threadResource,
} from './models.js'
import {
  isLinxCloudAuthExpiredMessage,
  isLinxCloudTransientMessage,
} from './linx-cloud-errors.js'

export const DEFAULT_SECRETARY_CHAT_ID = '__secretary__'
export const DEFAULT_SECRETARY_AGENT_ID = '__secretary__'

// Compatibility exports for older call sites. New code should use the secretary/chat
// names because Chat identifies the conversation counterpart, not the CLI product.
export const PI_CHAT_ID = DEFAULT_SECRETARY_CHAT_ID
export const PI_AGENT_ID = DEFAULT_SECRETARY_AGENT_ID

type PersistedRole = 'user' | 'assistant' | 'system'

export interface PodMirrorMessageRow {
  id: string
  parent: string
  chat: string
  thread: string
  maker: string
  role: PersistedRole
  content: string
  richContent?: string
  status: 'sent' | 'error'
  createdAt: Date
  updatedAt: Date
}

export function buildPodMessageRow(
  webId: string,
  options: Pick<{ sessionManager: SessionManager }, 'sessionManager'>,
  entry: SessionEntry,
): PodMirrorMessageRow | null {
  if (entry.type !== 'message') {
    return null
  }

  const message = entry.message as AgentMessage
  if (isSkippableOperationalAssistantError(message)) {
    return null
  }

  const role = mapMessageRole(message)
  const content = sanitizePodLiteralText(extractMessageText(message))
  if (!role || !content.trim()) {
    return null
  }

  const createdAt = messageTimestampToDate(message, entry.timestamp)
  return {
    id: `${options.sessionManager.getSessionId()}-${entry.id}`,
    parent: secretaryChatUri(webId),
    chat: secretaryChatUri(webId),
    thread: secretaryThreadUri(webId, options.sessionManager.getSessionId()),
    maker: role === 'user' ? webId : secretaryAgentUri(webId),
    role,
    content,
    richContent: sanitizePodLiteralText(JSON.stringify({
      linxPiSessionEntry: entry,
      message,
    })),
    status: isAssistantError(message) ? 'error' : 'sent',
    createdAt,
    updatedAt: createdAt,
  }
}

export function sanitizePodLiteralText(value: string): string {
  let output = ''
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) {
        output += value[index]!
        output += value[index + 1]!
        index += 1
      } else {
        output += '\uFFFD'
      }
      continue
    }
    if (code >= 0xDC00 && code <= 0xDFFF) {
      output += '\uFFFD'
      continue
    }
    if ((code >= 0x00 && code <= 0x08) || code === 0x0B || code === 0x0C || (code >= 0x0E && code <= 0x1F)) {
      output += '\uFFFD'
      continue
    }
    output += value[index]!
  }
  return output
}

export function secretaryThreadUri(webId: string, threadId: string, chatId = DEFAULT_SECRETARY_CHAT_ID): string {
  return threadResource.buildIri(webId, { id: secretaryThreadResourceId(threadId, chatId) })
}

export function secretaryThreadResourceId(threadId: string, chatId = DEFAULT_SECRETARY_CHAT_ID): string {
  const chatDocumentId = chatResource.buildId({ id: chatId }).split('#')[0]
  return `chat/${chatDocumentId}#${threadId}`
}

export function secretaryAgentUri(webId: string): string {
  return agentResource.buildIri(webId,  { id: DEFAULT_SECRETARY_AGENT_ID })
}

export function secretaryChatUri(webId: string, chatId = DEFAULT_SECRETARY_CHAT_ID): string {
  return chatResource.buildIri(webId,  { id: chatId })
}

export function buildToolAuditId(sessionId: string, toolCallId: string, action: string): string {
  return `audit-${shortStableId([sessionId, toolCallId, action])}`
}

export function pathToWorkspaceUri(path: string): string | undefined {
  if (!path.trim()) {
    return undefined
  }
  return `file://${path}`
}

export function calculateTokenUsage(entries: SessionEntry[]): number {
  let total = 0
  for (const entry of entries) {
    if (entry.type !== 'message') {
      continue
    }
    const usage = (entry.message as { usage?: { totalTokens?: unknown } }).usage
    if (typeof usage?.totalTokens === 'number' && Number.isFinite(usage.totalTokens)) {
      total += usage.totalTokens
    }
  }
  return total
}

export function getActiveSessionEntries(sessionManager: SessionManager): SessionEntry[] {
  if (typeof sessionManager.getLeafId === 'function' && sessionManager.getLeafId() === null) {
    return []
  }
  if (typeof sessionManager.getBranch === 'function') {
    const branch = sessionManager.getBranch()
    return Array.isArray(branch) ? branch : []
  }
  return sessionManager.getEntries()
}

export function buildThreadTitle(sessionManager: SessionManager): string {
  const name = sessionManager.getSessionName()
  if (name) {
    return name
  }

  const firstUser = getActiveSessionEntries(sessionManager).find((entry) => (
    entry.type === 'message'
    && (entry.message as { role?: unknown }).role === 'user'
  ))
  if (firstUser?.type === 'message') {
    const title = extractMessageText(firstUser.message).replace(/\s+/g, ' ').trim()
    if (title) {
      return title.slice(0, 72)
    }
  }

  return 'LinX Secretary Thread'
}

function mapMessageRole(message: AgentMessage): PersistedRole | null {
  const role = (message as { role?: unknown }).role
  if (role === 'user') return 'user'
  if (role === 'assistant') return 'assistant'
  if (role === 'toolResult' || role === 'bashExecution' || role === 'custom') return 'system'
  return null
}

function extractMessageText(message: AgentMessage): string {
  const role = (message as { role?: unknown }).role
  if (role === 'bashExecution') {
    const bash = message as { command?: unknown; output?: unknown; exitCode?: unknown; cancelled?: unknown }
    return [
      `$ ${String(bash.command ?? '')}`,
      String(bash.output ?? ''),
      bash.cancelled ? '(command cancelled)' : '',
      typeof bash.exitCode === 'number' ? `(exit ${bash.exitCode})` : '',
    ].filter(Boolean).join('\n')
  }

  if (role === 'toolResult') {
    const tool = message as { toolName?: unknown; content?: unknown; isError?: unknown }
    const content = extractContentText(tool.content)
    return `[tool:${String(tool.toolName ?? 'unknown')}${tool.isError ? ':error' : ''}] ${content}`
  }

  if (role === 'assistant') {
    const assistant = message as { content?: unknown; errorMessage?: unknown }
    const text = extractContentText(assistant.content)
    const toolCalls = extractToolCallText(assistant.content)
    const error = typeof assistant.errorMessage === 'string' ? assistant.errorMessage : ''
    return [text, toolCalls, error].filter(Boolean).join('\n')
  }

  if (role === 'custom') {
    const custom = message as { customType?: unknown; content?: unknown }
    return `[custom:${String(custom.customType ?? 'unknown')}] ${extractContentText(custom.content)}`
  }

  return extractContentText((message as { content?: unknown }).content)
}

function extractContentText(content: unknown): string {
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
      if (!isRecord(part)) {
        return ''
      }
      if (part.type === 'text') {
        return String(part.text ?? '')
      }
      if (part.type === 'thinking') {
        return String(part.thinking ?? '')
      }
      if (part.type === 'image') {
        return '[image]'
      }
      return ''
    })
    .filter(Boolean)
    .join('')
}

function extractToolCallText(content: unknown): string {
  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((part) => {
      if (!isRecord(part) || part.type !== 'toolCall') {
        return ''
      }
      return `[tool-call:${String(part.name ?? 'unknown')}] ${JSON.stringify(part.arguments ?? {})}`
    })
    .filter(Boolean)
    .join('\n')
}

function messageTimestampToDate(message: AgentMessage, fallback: string): Date {
  const timestamp = (message as { timestamp?: unknown }).timestamp
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    return new Date(timestamp)
  }
  const parsed = new Date(fallback)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function isAssistantError(message: AgentMessage): boolean {
  return (message as { role?: unknown; stopReason?: unknown }).role === 'assistant'
    && (message as { stopReason?: unknown }).stopReason === 'error'
}

function isSkippableOperationalAssistantError(message: AgentMessage): boolean {
  if (!isAssistantError(message)) {
    return false
  }
  const errorMessage = (message as { errorMessage?: unknown }).errorMessage
  if (typeof errorMessage !== 'string' || !errorMessage.trim()) {
    return false
  }
  return isLinxCloudTransientMessage(errorMessage) || isLinxCloudAuthExpiredMessage(errorMessage)
}

function shortStableId(parts: string[]): string {
  const hash = createHash('sha256')
  for (const part of parts) {
    hash.update(part)
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 16)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
