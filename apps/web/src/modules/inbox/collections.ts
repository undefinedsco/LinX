import { useMemo } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  approvalTable,
  auditTable,
  inboxNotificationTable,
  type ApprovalInsert,
  type ApprovalRow,
  type AuditInsert,
  type AuditRow,
  type InboxNotificationInsert,
  type InboxNotificationRow,
  type SolidDatabase,
} from '@linx/models'
import { createPodCollection } from '@/lib/data/pod-collection'
import { queryClient } from '@/providers/query-provider'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { continueRuntimeToolCallFromInbox } from '@/modules/chat/services/chatkit-local/runtime-tool-response'
import { useInboxStore, type InboxFilter } from './store'

let dbGetter: (() => SolidDatabase | null) | null = null

export function setInboxDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

function getDb(): SolidDatabase | null {
  return dbGetter?.() ?? null
}

export const approvalCollection = createPodCollection<typeof approvalTable, ApprovalRow, ApprovalInsert>({
  table: approvalTable,
  queryKey: ['inbox', 'approvals'],
  queryClient,
  getDb,
  orderBy: { column: 'createdAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Approval record is missing id')
    return item.id
  },
})

export const auditCollection = createPodCollection<typeof auditTable, AuditRow, AuditInsert>({
  table: auditTable,
  queryKey: ['inbox', 'audit'],
  queryClient,
  getDb,
  orderBy: { column: 'createdAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Audit record is missing id')
    return item.id
  },
})

export const inboxNotificationCollection = createPodCollection<typeof inboxNotificationTable, InboxNotificationRow, InboxNotificationInsert>({
  table: inboxNotificationTable,
  queryKey: ['inbox', 'notifications'],
  queryClient,
  getDb,
  orderBy: { column: 'createdAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Inbox notification record is missing id')
    return item.id
  },
})

export function initializeInboxCollections(db: SolidDatabase | null) {
  setInboxDatabaseGetter(() => db)
}

export function useInboxInit() {
  const { db } = useSolidDatabase()
  return { db, isReady: !!db }
}

function extractResourceId(uri: string | undefined): string | null {
  if (!uri) return null
  const hash = uri.split('#').pop()
  if (hash) return hash
  const match = uri.match(/\/([^/]+)\.ttl$/)
  return match?.[1] ?? null
}

function formatTimestamp(value: unknown): number {
  if (!value) return 0
  const time = new Date(String(value)).getTime()
  return Number.isFinite(time) ? time : 0
}

function extractPodBase(webId: string): string {
  return webId.replace('/profile/card#me', '')
}

function makeApprovalUri(webId: string, approvalId: string): string {
  return `${extractPodBase(webId)}/.data/approvals/${approvalId}.ttl#${approvalId}`
}

function makeAuditUri(webId: string, auditId: string): string {
  return `${extractPodBase(webId)}/.data/audit/${auditId}.ttl#${auditId}`
}

function extractRuntimeSessionId(sessionUri: string | null | undefined): string | null {
  if (!sessionUri) return null
  const match = sessionUri.match(/^urn:linx:runtime-session:(.+)$/)
  return match?.[1] ?? null
}

function extractThreadId(targetUri: string | null | undefined): string | null {
  if (!targetUri) return null
  const hash = targetUri.split('#').pop()
  return hash || null
}

function buildRuntimeToolResponse(decision: 'approved' | 'rejected', reason?: string): string {
  return JSON.stringify({
    decision,
    reason: reason?.trim() || null,
    source: 'linx-inbox',
  })
}

export type InboxItemKind = 'approval' | 'audit'
export type InboxItemCategory = 'approval' | 'auth_required' | 'audit'

export interface InboxItem {
  id: string
  kind: InboxItemKind
  category: InboxItemCategory
  title: string
  description: string
  timestamp: string
  status?: string
  approval?: ApprovalRow
  audit?: AuditRow
  notification?: InboxNotificationRow
  chatId?: string | null
  threadId?: string | null
  authUrl?: string | null
  authMethod?: string | null
  authMessage?: string | null
}

function buildApprovalDescription(approval: ApprovalRow): string {
  if (approval.status === 'approved') return `已批准 · ${approval.risk} 风险`
  if (approval.status === 'rejected') return `已拒绝 · ${approval.risk} 风险`
  return `等待授权 · ${approval.risk} 风险`
}

function parseContext(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function extractChatThreadRef(uri: string | null | undefined): { chatId: string | null; threadId: string | null } {
  if (!uri) return { chatId: null, threadId: null }

  const match = uri.match(/\.data\/chat\/([^/]+)\/index\.ttl#(.+)$/)
  return {
    chatId: match?.[1] ?? null,
    threadId: match?.[2] ?? null,
  }
}

function buildAuditPresentation(audit: AuditRow): Pick<InboxItem, 'title' | 'description' | 'category' | 'chatId' | 'threadId' | 'authUrl' | 'authMethod' | 'authMessage'> {
  const context = parseContext(audit.context)
  const threadUri = typeof context?.threadUri === 'string' ? context.threadUri : null
  const { chatId, threadId } = extractChatThreadRef(threadUri)

  if (audit.action === 'runtime.auth_required') {
    const method = typeof context?.method === 'string' ? context.method : null
    const url = typeof context?.url === 'string' ? context.url : null
    const message = typeof context?.message === 'string' ? context.message : null
    const descriptionParts = [message, method, url].filter(Boolean)

    return {
      title: method ? `认证请求 · ${method}` : '认证请求',
      description: descriptionParts.length > 0 ? descriptionParts.join(' · ') : '运行时需要额外认证后才能继续。',
      category: 'auth_required',
      chatId,
      threadId,
      authUrl: url,
      authMethod: method,
      authMessage: message,
    }
  }

  return {
    title: audit.action,
    description: audit.actorRole === 'system' ? '系统事件' : audit.actorRole,
    category: 'audit',
    chatId,
    threadId,
    authUrl: null,
    authMethod: null,
    authMessage: null,
  }
}

function buildInboxItems(
  notifications: InboxNotificationRow[],
  approvals: ApprovalRow[],
  audits: AuditRow[],
): InboxItem[] {
  const approvalById = new Map(approvals.map((item) => [item.id, item]))
  const auditById = new Map(audits.map((item) => [item.id, item]))
  const seen = new Set<string>()
  const items: InboxItem[] = []

  for (const notification of notifications) {
    const resourceId = extractResourceId(notification.object)
    if (!resourceId) continue

    const approval = approvalById.get(resourceId)
    if (approval) {
      const itemId = `approval:${approval.id}`
      if (seen.has(itemId)) continue
      seen.add(itemId)
      const threadRef = extractChatThreadRef(approval.target)
      items.push({
        id: itemId,
        kind: 'approval',
        category: 'approval',
        title: approval.toolName,
        description: buildApprovalDescription(approval),
        timestamp: String(notification.createdAt ?? approval.resolvedAt ?? approval.createdAt ?? ''),
        status: approval.status,
        approval,
        notification,
        chatId: threadRef.chatId,
        threadId: threadRef.threadId,
      })
      continue
    }

    const audit = auditById.get(resourceId)
    if (audit) {
      const itemId = `audit:${audit.id}`
      if (seen.has(itemId)) continue
      seen.add(itemId)
      const presentation = buildAuditPresentation(audit)
      items.push({
        id: itemId,
        kind: 'audit',
        category: presentation.category,
        title: presentation.title,
        description: presentation.description,
        timestamp: String(notification.createdAt ?? audit.createdAt ?? ''),
        audit,
        notification,
        chatId: presentation.chatId,
        threadId: presentation.threadId,
        authUrl: presentation.authUrl,
        authMethod: presentation.authMethod,
        authMessage: presentation.authMessage,
      })
    }
  }

  for (const approval of approvals) {
    const itemId = `approval:${approval.id}`
    if (seen.has(itemId)) continue
    const threadRef = extractChatThreadRef(approval.target)
    items.push({
      id: itemId,
      kind: 'approval',
      category: 'approval',
      title: approval.toolName,
      description: buildApprovalDescription(approval),
      timestamp: String(approval.resolvedAt ?? approval.createdAt ?? ''),
      status: approval.status,
      approval,
      chatId: threadRef.chatId,
      threadId: threadRef.threadId,
    })
  }

  for (const audit of audits) {
    const itemId = `audit:${audit.id}`
    if (seen.has(itemId)) continue
    const presentation = buildAuditPresentation(audit)
    items.push({
      id: itemId,
      kind: 'audit',
      category: presentation.category,
      title: presentation.title,
      description: presentation.description,
      timestamp: String(audit.createdAt ?? ''),
      audit,
      chatId: presentation.chatId,
      threadId: presentation.threadId,
      authUrl: presentation.authUrl,
      authMethod: presentation.authMethod,
      authMessage: presentation.authMessage,
    })
  }

  return items.sort((a, b) => formatTimestamp(b.timestamp) - formatTimestamp(a.timestamp))
}

export const inboxOps = {
  async fetchApprovals() {
    return approvalCollection.fetch()
  },
  async fetchAuditEntries() {
    return auditCollection.fetch()
  },
  async fetchNotifications() {
    return inboxNotificationCollection.fetch()
  },
  async resolveApproval(input: {
    approval: ApprovalRow
    decision: 'approved' | 'rejected'
    actorWebId: string
    reason?: string
  }) {
    const db = getDb()
    if (!db) {
      throw new Error('Database not connected')
    }

    const now = new Date()
    const resolvedAt = now.toISOString()
    const auditId = crypto.randomUUID()
    const auditUri = makeAuditUri(input.actorWebId, auditId)

    await db.update(approvalTable).set({
      status: input.decision,
      decisionBy: input.actorWebId,
      decisionRole: 'human',
      reason: input.reason?.trim() || null,
      resolvedAt: now,
      policyVersion: input.approval.policyVersion || 'phase4-inbox-v1',
    } as any).where({ id: input.approval.id } as any).execute()

    await db.insert(auditTable).values({
      id: auditId,
      action: `inbox.approval.${input.decision}`,
      actor: input.actorWebId,
      actorRole: 'human',
      session: input.approval.session,
      toolCallId: input.approval.toolCallId,
      approval: makeApprovalUri(input.actorWebId, input.approval.id),
      context: JSON.stringify({
        toolName: input.approval.toolName,
        risk: input.approval.risk,
        status: input.decision,
        reason: input.reason?.trim() || null,
        resolvedAt,
      }),
      policyVersion: input.approval.policyVersion || 'phase4-inbox-v1',
      createdAt: now,
    }).execute()

    await db.insert(inboxNotificationTable).values({
      id: crypto.randomUUID(),
      actor: input.actorWebId,
      object: auditUri,
      createdAt: now,
    }).execute()

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['inbox', 'approvals'] }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'audit'] }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'items'] }),
    ])
  },
}

export function useInboxItems(filterOverride?: InboxFilter) {
  const { db } = useSolidDatabase()
  const storeFilter = useInboxStore((state) => state.filter)
  const filter = filterOverride ?? storeFilter

  return useQuery({
    queryKey: ['inbox', 'items', filter],
    enabled: !!db,
    queryFn: async () => {
      const [notifications, approvals, audits] = await Promise.all([
        inboxOps.fetchNotifications(),
        inboxOps.fetchApprovals(),
        inboxOps.fetchAuditEntries(),
      ])

      const allItems = buildInboxItems(notifications, approvals, audits)
      return applyInboxFilter(allItems, filter)
    },
  })
}

function applyInboxFilter(items: InboxItem[], filter: InboxFilter): InboxItem[] {
  switch (filter) {
    case 'pending':
      return items.filter((item) => item.kind === 'approval' && item.status === 'pending')
    case 'audit':
      return items.filter((item) => item.kind === 'audit')
    default:
      return items
  }
}

export function useInboxSummary() {
  const { data: items = [] } = useInboxItems('all')

  return useMemo(() => ({
    total: items.length,
    pending: items.filter((item) => item.kind === 'approval' && item.status === 'pending').length,
    audit: items.filter((item) => item.kind === 'audit').length,
  }), [items])
}

export function useResolveInboxApproval() {
  const { session } = useSession()
  const { db } = useSolidDatabase()

  return useMutation({
    mutationFn: async (input: {
      approval: ApprovalRow
      decision: 'approved' | 'rejected'
      reason?: string
    }) => {
      const actorWebId = session.info.webId
      if (!actorWebId) {
        throw new Error('Solid session is not ready')
      }

      await inboxOps.resolveApproval({
        approval: input.approval,
        decision: input.decision,
        actorWebId,
        reason: input.reason,
      })

      const runtimeSessionId = extractRuntimeSessionId(input.approval.session)
      const threadId = extractThreadId(input.approval.target)
      const isServiceMode = typeof window !== 'undefined' && !!(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__
      if (runtimeSessionId && threadId && isServiceMode && input.approval.toolCallId && db && session.fetch) {
        try {
          await continueRuntimeToolCallFromInbox({
            db,
            webId: actorWebId,
            authFetch: session.fetch,
            threadId,
            toolCallId: input.approval.toolCallId,
            output: buildRuntimeToolResponse(input.decision, input.reason),
          })

          await queryClient.invalidateQueries({ queryKey: ['threads', threadId, 'messages'] })
        } catch (error) {
          console.warn('[Inbox] Failed to resume runtime tool call:', error)
        }
      }
    },
  })
}
