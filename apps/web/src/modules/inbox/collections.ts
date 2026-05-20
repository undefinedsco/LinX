import { useMemo } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { resolveLinxPodBaseUrl } from '@undefineds.co/models/client'
import {
  approvalResource,
  auditResource,
  buildApprovalSubjectPath,
  buildAuditSubjectPath,
  extractChatThreadRef,
  inboxNotificationResource,
  type ApprovalInsert,
  type ApprovalRow,
  type AuditInsert,
  type AuditRow,
  type InboxNotificationInsert,
  type InboxNotificationRow,
  type SolidDatabase,
} from '@undefineds.co/models'
import { createPodCollection } from '@/lib/data/pod-collection'
import { queryClient } from '@/providers/query-provider'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { continueRuntimeToolCallFromInbox } from '@/modules/chat/services/chatkit-local/runtime-tool-response'
import { useInboxStore, type InboxFilter } from './store'
import { buildAuditPresentation, createResolvedAuthTimestampsIndex } from './presentation'
import { countActionableInboxItems, filterInboxItems } from './utils'

let dbGetter: (() => SolidDatabase | null) | null = null

export function setInboxDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

function getDb(): SolidDatabase | null {
  return dbGetter?.() ?? null
}

export const approvalCollection = createPodCollection<typeof approvalResource, ApprovalRow, ApprovalInsert>({
  table: approvalResource,
  queryKey: ['inbox', 'approvals'],
  queryClient,
  getDb,
  orderBy: { column: 'createdAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Approval record is missing id')
    return item.id
  },
})

export const auditCollection = createPodCollection<typeof auditResource, AuditRow, AuditInsert>({
  table: auditResource,
  queryKey: ['inbox', 'audit'],
  queryClient,
  getDb,
  orderBy: { column: 'createdAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Audit record is missing id')
    return item.id
  },
})

export const inboxNotificationCollection = createPodCollection<typeof inboxNotificationResource, InboxNotificationRow, InboxNotificationInsert>({
  table: inboxNotificationResource,
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
  return resolveLinxPodBaseUrl(webId)
}

function makeApprovalUri(webId: string, approvalId: string, createdAt: Date | string | number = new Date()): string {
  return `${extractPodBase(webId)}${buildApprovalSubjectPath(approvalId, createdAt)}`
}

function resolveApprovalIri(actorWebId: string, approval: ApprovalRow): string {
  const subject = (approval as Record<string, unknown>)['@id'] ?? (approval as Record<string, unknown>).subject
  if (typeof subject === 'string' && /^https?:\/\//.test(subject)) {
    return subject
  }
  return makeApprovalUri(actorWebId, approval.id, approval.createdAt ?? new Date())
}

function getApprovalSubject(approval: ApprovalRow): string | null {
  const subject = (approval as Record<string, unknown>)['@id'] ?? (approval as Record<string, unknown>).subject
  return typeof subject === 'string' && subject.length > 0 ? subject : null
}

function findLinkedApproval(approvals: ApprovalRow[], audit: AuditRow): ApprovalRow | null {
  if (!audit.approval) return null
  const approvalId = extractResourceId(audit.approval)
  return approvals.find((item) => getApprovalSubject(item) === audit.approval || item.id === approvalId) ?? null
}

async function updateApprovalByIri(
  db: SolidDatabase,
  actorWebId: string,
  approval: ApprovalRow,
  patch: Record<string, unknown>,
): Promise<void> {
  const iri = resolveApprovalIri(actorWebId, approval)
  const updateByIri = (db as unknown as { updateByIri?: (resource: typeof approvalResource, iri: string, data: Record<string, unknown>) => Promise<unknown> }).updateByIri
  if (typeof updateByIri === 'function') {
    await updateByIri.call(db, approvalResource, iri, patch)
    return
  }

  const query = db.update(approvalResource).set(patch as any)
  if (typeof (query as any).whereByIri === 'function') {
    await (query as any).whereByIri(iri).execute()
    return
  }

  await query.where({ id: approval.id } as any).execute()
}

function makeAuditUri(webId: string, auditId: string, createdAt: Date | string | number = new Date()): string {
  return `${extractPodBase(webId)}${buildAuditSubjectPath(auditId, createdAt)}`
}

function extractRuntimeSessionId(sessionUri: string | null | undefined): string | null {
  if (!sessionUri) return null
  const match = sessionUri.match(/^urn:linx:runtime-session:(.+)$/)
  if (match?.[1]) return match[1]

  const currentPodMatch = sessionUri.match(/\/\.data\/sessions\/\d{4}\/\d{2}\.ttl#([^/#]+)$/)
  if (currentPodMatch?.[1]) return decodeURIComponent(currentPodMatch[1])

  const legacyPodMatch = sessionUri.match(/\/\.data\/session\/([^/#]+)\.ttl(?:#([^/#]+))?$/)
  return legacyPodMatch?.[2]
    ? decodeURIComponent(legacyPodMatch[2])
    : legacyPodMatch?.[1]
      ? decodeURIComponent(legacyPodMatch[1])
      : null
}

function extractThreadId(approval: ApprovalRow): string | null {
  const threadUri = approval.thread || approval.target
  if (!threadUri) return null
  const hash = threadUri.split('#').pop()
  return hash || null
}

export function buildRuntimeToolResponse(decision: 'approved' | 'rejected', reason?: string): string {
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
  thread?: string | null
  about?: string | null
  approvalId?: string | null
  authUrl?: string | null
  authMethod?: string | null
  authMessage?: string | null
}

function buildApprovalDescription(approval: ApprovalRow): string {
  if (approval.status === 'approved') return `已批准 · ${approval.risk} 风险`
  if (approval.status === 'rejected') return `已拒绝 · ${approval.risk} 风险`
  return `等待授权 · ${approval.risk} 风险`
}

function extractApprovalChatThreadRef(approval: ApprovalRow): { chatId: string | null; threadId: string | null } {
  const threadRef = extractChatThreadRef(approval.thread || approval.target)
  const chatRef = extractChatThreadRef(approval.chat)

  return {
    chatId: threadRef.chatId ?? chatRef.chatId,
    threadId: threadRef.threadId,
  }
}

function buildInboxItems(
  notifications: InboxNotificationRow[],
  approvals: ApprovalRow[],
  audits: AuditRow[],
): InboxItem[] {
  const approvalById = new Map(approvals.map((item) => [item.id, item]))
  const auditById = new Map(audits.map((item) => [item.id, item]))
  const resolvedAuthTimestampsByKey = createResolvedAuthTimestampsIndex(audits)
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
      const threadRef = extractApprovalChatThreadRef(approval)
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
        thread: approval.thread || approval.target,
        about: approval.target,
        approvalId: approval.id,
      })
      continue
    }

    const audit = auditById.get(resourceId)
    if (audit) {
      const itemId = `audit:${audit.id}`
      if (seen.has(itemId)) continue
      seen.add(itemId)
      const linkedApproval = findLinkedApproval(approvals, audit)
      const presentation = buildAuditPresentation(audit, resolvedAuthTimestampsByKey, linkedApproval)
      items.push({
        id: itemId,
        kind: 'audit',
        category: presentation.category,
        title: presentation.title,
        description: presentation.description,
        timestamp: String(notification.createdAt ?? audit.createdAt ?? ''),
        status: presentation.status,
        audit,
        approval: linkedApproval ?? undefined,
        notification,
        chatId: presentation.chatId,
        threadId: presentation.threadId,
        thread: presentation.thread,
        about: presentation.about,
        approvalId: linkedApproval?.id ?? extractResourceId(audit.approval),
        authUrl: presentation.authUrl,
        authMethod: presentation.authMethod,
        authMessage: presentation.authMessage,
      })
    }
  }

  for (const approval of approvals) {
    const itemId = `approval:${approval.id}`
    if (seen.has(itemId)) continue
    const threadRef = extractApprovalChatThreadRef(approval)
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
      thread: approval.thread || approval.target,
      about: approval.target,
      approvalId: approval.id,
    })
  }

  for (const audit of audits) {
    const itemId = `audit:${audit.id}`
    if (seen.has(itemId)) continue
    const linkedApproval = findLinkedApproval(approvals, audit)
    const presentation = buildAuditPresentation(audit, resolvedAuthTimestampsByKey, linkedApproval)
    items.push({
      id: itemId,
      kind: 'audit',
      category: presentation.category,
      title: presentation.title,
      description: presentation.description,
      timestamp: String(audit.createdAt ?? ''),
      status: presentation.status,
      audit,
      approval: linkedApproval ?? undefined,
      chatId: presentation.chatId,
      threadId: presentation.threadId,
      thread: presentation.thread,
      about: presentation.about,
      approvalId: linkedApproval?.id ?? extractResourceId(audit.approval),
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
    const auditId = crypto.randomUUID()
    const auditUri = makeAuditUri(input.actorWebId, auditId, now)

    await updateApprovalByIri(db, input.actorWebId, input.approval, {
      status: input.decision,
      decisionBy: input.actorWebId,
      decisionRole: 'human',
      reason: input.reason?.trim() || null,
      resolvedAt: now,
      policyVersion: input.approval.policyVersion || 'phase4-inbox-v1',
    })

    await db.insert(auditResource).values({
      id: auditId,
      action: `inbox.approval.${input.decision}`,
      actor: input.actorWebId,
      actorRole: 'human',
      session: input.approval.session,
      chat: input.approval.chat,
      thread: input.approval.thread,
      toolCallId: input.approval.toolCallId,
      approval: resolveApprovalIri(input.actorWebId, input.approval),
      toolName: input.approval.toolName,
      entry: input.approval.thread || input.approval.target,
      policyVersion: input.approval.policyVersion || 'phase4-inbox-v1',
      createdAt: now,
    }).execute()

    await db.insert(inboxNotificationResource).values({
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
      return filterInboxItems(allItems, filter)
    },
  })
}

export function useInboxSummary() {
  const { data: items = [] } = useInboxItems('all')

  return useMemo(() => ({
    total: items.length,
    pending: countActionableInboxItems(items),
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
      const threadId = extractThreadId(input.approval)
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
