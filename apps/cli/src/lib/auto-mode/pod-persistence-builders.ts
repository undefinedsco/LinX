import { appendChatReconcilerMetadata, reconcileChatAppend } from '@linx/agent-runtime'
import {
  agentResource,
  chatResource,
  messageResource,
  sessionResource,
  threadRepository,
} from '../models.js'
import {
  buildAutoModeThreadMetadata,
  buildAutoModeTranscriptMessages,
  type AutoModeEventLogEntry,
  type AutoModeSessionRecord,
  type AutoModeTranscriptMessageSource,
} from '@linx/agent-runtime/auto-mode'
import {
  buildLinxSessionControlState,
  mergeLinxSessionControlMetadata,
} from '@linx/agent-runtime/control-plane'

export const AUTO_MODE_CHAT_ID_PREFIX = 'linx-auto-mode'
export const AUTO_MODE_CHAT_TITLE = 'LinX Auto Mode'
export const AUTO_MODE_SECRETARY_AGENT_ID = '__secretary__'

export interface AutoModeChatRow extends Record<string, unknown> {
  id: string
  title: string
  participants: string[]
  metadata: Record<string, unknown>
  lastActiveAt: Date
  lastMessagePreview?: string
  createdAt: Date
  updatedAt: Date
}

export interface AutoModeThreadRow extends Record<string, unknown> {
  id: string
  scope: string
  parent: string
  chat: string
  title: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface AutoModeSessionRow extends Record<string, unknown> {
  id: string
  owner: string
  chat: string
  thread: string
  sessionType: 'group'
  status: 'active' | 'completed' | 'error'
  tool: string
  tokenUsage: number
  policyVersion?: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
  archivedAt?: Date
}

export interface PersistedAutoModeConversationMessage extends Record<string, unknown> {
  id: string
  parent: string
  chat: string
  thread: string
  maker: string
  role: 'user' | 'assistant' | 'system'
  content: string
  status: 'sent'
  senderName?: string
  senderAvatarUrl?: string
  routedBy?: string
  routeTargetAgent?: string
  coordinationId?: string
  metadata?: Record<string, unknown>
  createdAt: Date
}

export interface AutoModeAgentRow extends Record<string, unknown> {
  id: string
  name: string
  provider: string
  model: string
  description?: string
  createdAt: Date
  updatedAt: Date
}

function normalizeTitle(text: string, width = 72): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return 'AutoMode Session'
  }

  if (normalized.length <= width) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, width - 3))}...`
}

export function buildAutoModeChatUri(webId: string, record: Pick<AutoModeSessionRecord, 'backend'>): string {
  return chatResource.buildIri(webId, { id: buildAutoModeChatId(record) })
}

export function buildAutoModeThreadUri(webId: string, record: AutoModeSessionRecord): string {
  return threadRepository.iriForChat(webId, buildAutoModeChatId(record), record.id)
}

export function buildAutoModeSessionUri(webId: string, record: AutoModeSessionRecord): string {
  return sessionResource.buildIri(webId, {
    id: record.id,
    createdAt: record.startedAt,
  })
}

export function buildAutoModeMessageUri(
  webId: string,
  record: AutoModeSessionRecord,
  row: Pick<PersistedAutoModeConversationMessage, 'id' | 'createdAt'>,
): string {
  const chat = buildAutoModeChatUri(webId, record)
  return messageResource.buildIri(webId, {
    id: row.id,
    parent: chat,
    chat,
    thread: buildAutoModeThreadUri(webId, record),
    createdAt: row.createdAt ?? record.startedAt,
  })
}

export function buildAutoModeChatId(record: Pick<AutoModeSessionRecord, 'backend'>): string {
  return `${AUTO_MODE_CHAT_ID_PREFIX}-${record.backend}`
}

export function buildAutoModePrimaryAgentId(record: Pick<AutoModeSessionRecord, 'backend'>): string {
  return `${AUTO_MODE_CHAT_ID_PREFIX}-${record.backend}-agent`
}

export function autoModeBackendDisplayName(backend: AutoModeSessionRecord['backend']): string {
  if (backend === 'codex') return 'Codex'
  if (backend === 'claude') return 'Claude Code'
  if (backend === 'codebuddy') return 'CodeBuddy'
  return backend
}

export function buildAutoModeParticipants(webId: string, record: Pick<AutoModeSessionRecord, 'backend'>): string[] {
  return [
    webId,
    agentResource.buildIri(webId, { id: AUTO_MODE_SECRETARY_AGENT_ID }),
    agentResource.buildIri(webId, { id: buildAutoModePrimaryAgentId(record) }),
  ]
}

export function buildAutoModeChatMetadata(webId: string, record: AutoModeSessionRecord): Record<string, unknown> {
  const secretaryAgentUri = agentResource.buildIri(webId, { id: AUTO_MODE_SECRETARY_AGENT_ID })
  const primaryAgentId = buildAutoModePrimaryAgentId(record)
  const primaryAgentUri = agentResource.buildIri(webId, { id: primaryAgentId })

  return {
    kind: 'auto-mode-group',
    surface: 'auto-mode',
    backend: record.backend,
    runtime: record.runtime,
    transport: record.transport,
    secretaryAgent: secretaryAgentUri,
    primaryAgent: primaryAgentUri,
    memberRoles: {
      [webId]: 'owner',
      [secretaryAgentUri]: 'admin',
      [primaryAgentUri]: 'member',
    },
    members: [
      { uri: webId, role: 'user', label: 'User' },
      { uri: secretaryAgentUri, role: 'secretary', label: 'AI Secretary' },
      { uri: primaryAgentUri, role: 'primary-agent', label: autoModeBackendDisplayName(record.backend) },
    ],
  }
}

export function buildAutoModeConversationThreadTitle(
  record: AutoModeSessionRecord,
  transcript: Array<{ role: string; content: string }> = [],
): string {
  const firstUserTurn = transcript.find((message) => message.role === 'user')?.content
  const base = firstUserTurn?.trim() || record.prompt?.trim() || `${record.backend} auto-mode`
  return normalizeTitle(`${record.backend} · ${base}`)
}

export function buildAutoModeConversationChatRow(
  record: AutoModeSessionRecord,
  webId: string,
  lastPreview?: string,
): AutoModeChatRow {
  const startedAt = new Date(record.startedAt)
  const updatedAt = record.endedAt ? new Date(record.endedAt) : startedAt

  return {
    id: buildAutoModeChatId(record),
    title: `${AUTO_MODE_CHAT_TITLE} · ${autoModeBackendDisplayName(record.backend)}`,
    participants: buildAutoModeParticipants(webId, record),
    metadata: buildAutoModeChatMetadata(webId, record),
    lastActiveAt: updatedAt,
    lastMessagePreview: lastPreview ? normalizeTitle(lastPreview, 100) : undefined,
    createdAt: startedAt,
    updatedAt,
  }
}

export function buildAutoModeConversationThreadRow(
  record: AutoModeSessionRecord,
  webId: string,
  transcript: Array<{ role: string; content: string }> = [],
): AutoModeThreadRow {
  const startedAt = new Date(record.startedAt)
  const updatedAt = record.endedAt ? new Date(record.endedAt) : startedAt
  const chatUri = buildAutoModeChatUri(webId, record)

  return {
    id: threadRepository.idForChat(chatUri, record.id),
    scope: chatUri,
    parent: chatUri,
    chat: chatUri,
    title: buildAutoModeConversationThreadTitle(record, transcript),
    metadata: {
      ...buildAutoModeThreadMetadata(record),
      chatId: buildAutoModeChatId(record),
    },
    createdAt: startedAt,
    updatedAt,
  }
}

export function buildAutoModeConversationSessionRow(
  record: AutoModeSessionRecord,
  webId: string,
): AutoModeSessionRow {
  const startedAt = new Date(record.startedAt)
  const updatedAt = record.endedAt ? new Date(record.endedAt) : startedAt
  const status = record.status === 'failed'
    ? 'error'
    : record.status === 'completed'
      ? 'completed'
      : 'active'
  const metadata = mergeLinxSessionControlMetadata({
    ...buildAutoModeThreadMetadata(record),
    backendSessionId: record.backendSessionId,
    command: record.command,
    args: record.args,
    credentialSource: record.credentialSource,
    resolvedCredentialSource: record.resolvedCredentialSource,
    approvalSource: record.approvalSource,
    exitCode: record.exitCode,
    signal: record.signal,
    error: record.error,
  }, buildLinxSessionControlState({
    autoEnabled: record.autoEnabled ?? record.mode === 'auto',
    updatedAt,
    updatedBy: 'cli',
  }))

  return {
    id: record.id,
    owner: webId,
    chat: buildAutoModeChatUri(webId, record),
    thread: buildAutoModeThreadUri(webId, record),
    sessionType: 'group',
    status,
    tool: record.backend,
    tokenUsage: 0,
    policyVersion: 'linx-auto-mode-session/v1',
    metadata,
    createdAt: startedAt,
    updatedAt,
    ...(record.endedAt ? { archivedAt: updatedAt } : {}),
  }
}

function resolveMessageSender(input: {
  record: AutoModeSessionRecord
  webId: string
  source: AutoModeTranscriptMessageSource
}): {
  maker: string
  senderName: string
  routedBy?: string
  routeTargetAgent?: string
} {
  const secretaryAgentUri = agentResource.buildIri(input.webId, { id: AUTO_MODE_SECRETARY_AGENT_ID })
  const primaryAgentId = buildAutoModePrimaryAgentId(input.record)
  const primaryAgentUri = agentResource.buildIri(input.webId, { id: primaryAgentId })

  if (input.source === 'user') {
    return {
      maker: input.webId,
      senderName: 'User',
    }
  }

  if (input.source === 'primary-agent') {
    return {
      maker: primaryAgentUri,
      senderName: autoModeBackendDisplayName(input.record.backend),
    }
  }

  if (input.source === 'tool') {
    return {
      maker: primaryAgentUri,
      senderName: `${autoModeBackendDisplayName(input.record.backend)} Tool`,
      routedBy: primaryAgentUri,
      routeTargetAgent: primaryAgentUri,
    }
  }

  return {
    maker: secretaryAgentUri,
    senderName: input.source === 'secretary' ? 'AI Secretary' : 'LinX AutoMode',
    routedBy: secretaryAgentUri,
    routeTargetAgent: primaryAgentUri,
  }
}

function buildAutoModeMessageReconcilerMetadata(input: {
  record: AutoModeSessionRecord
  webId: string
  chatUri: string
  threadUri: string
  messageUri: string
  role: 'user' | 'assistant' | 'system'
  source: AutoModeTranscriptMessageSource
  content: string
  maker: string
  createdAt: Date
}): Record<string, unknown> {
  const { summary } = reconcileChatAppend({
    chat: input.chatUri,
    thread: input.threadUri,
    resource: input.messageUri,
    role: input.role,
    content: input.content,
    actor: {
      id: input.maker,
      role: input.source === 'user'
        ? 'user'
        : input.source === 'secretary'
          ? 'secretary'
          : input.source === 'primary-agent'
            ? 'primary-agent'
            : 'runtime',
    },
    source: input.source === 'primary-agent'
      ? 'primary-agent'
      : input.source === 'secretary'
        ? 'secretary-runtime-intent'
        : input.source === 'user'
          ? 'cli-auto-mode'
          : 'runtime',
    autoEnabled: input.record.autoEnabled ?? input.record.mode === 'auto',
    createdAt: input.createdAt,
    randomId: input.messageUri,
  })
  return appendChatReconcilerMetadata(undefined, summary)
}

export function buildAutoModeConversationMessages(
  record: AutoModeSessionRecord,
  webId: string,
  entries: AutoModeEventLogEntry[],
): PersistedAutoModeConversationMessage[] {
  const transcript = buildAutoModeTranscriptMessages(entries)
  const chatUri = buildAutoModeChatUri(webId, record)
  const threadUri = buildAutoModeThreadUri(webId, record)

  return transcript.map((message, index) => {
    const sender = resolveMessageSender({
      record,
      webId,
      source: message.source,
    })
    const id = `${record.id}-m${String(index + 1).padStart(4, '0')}`
    const createdAt = new Date(message.createdAt)
    const messageUri = buildAutoModeMessageUri(webId, record, { id, createdAt })

    return {
      id,
      parent: chatUri,
      chat: chatUri,
      thread: threadUri,
      maker: sender.maker,
      role: message.role,
      content: message.content,
      status: 'sent',
      senderName: sender.senderName,
      routedBy: sender.routedBy,
      routeTargetAgent: sender.routeTargetAgent,
      coordinationId: record.id,
      metadata: buildAutoModeMessageReconcilerMetadata({
        record,
        webId,
        chatUri,
        threadUri,
        messageUri,
        role: message.role,
        source: message.source,
        content: message.content,
        maker: sender.maker,
        createdAt,
      }),
      createdAt,
    }
  })
}
