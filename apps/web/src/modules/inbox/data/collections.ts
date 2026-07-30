import { useMemo } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  approvalResource,
  auditResource,
  extractApprovalIdFromApprovalRef,
  extractAuditIdFromAuditRef,
  extractChatThreadRef,
  extractInputRequestIdFromInputRequestRef,
  extractRuntimeSessionId as extractRuntimeSessionIdFromRef,
  inboxNotificationResource,
  inputRequestResource,
  type ApprovalInsert,
  type ApprovalRow,
  type AuditInsert,
  type AuditRow,
  type InboxNotificationInsert,
  type InboxNotificationRow,
  type InputRequestInsert,
  type InputRequestRow,
  type SolidDatabase,
} from '@undefineds.co/models'
import { updateExactRecord } from '@/lib/data/exact-records'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { assertInsertValuesBelongToCurrentPod, assertUpdateValuesBelongToCurrentPod } from '@/lib/data/pod-write-guard'
import { createPodCollection } from '@/lib/data/pod-collection'
import { queryClient } from '@/providers/query-provider'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { continueRuntimeToolCallFromInbox } from '@/modules/chat/services/chatkit-local/runtime-tool-response'
import { filesProposalApplicationCollection } from '@/modules/files/data/proposal/proposal-application-collection'
import type { InboxFilter } from '../domain/utils'
import { countActionableInboxItems, filterInboxItems } from '../domain/utils'
import { buildAuditPresentation, createResolvedAuthTimestampsIndex } from '../domain/presentation'
import type { InboxItem, InboxItemCategory, InboxItemKind } from '../domain/inbox-item'

export type { InboxItem, InboxItemCategory, InboxItemKind }

let dbGetter: (() => SolidDatabase | null) | null = null

export function setInboxDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

function getDb(): SolidDatabase | null {
  return dbGetter?.() ?? null
}

export const approvalCollection = createPodCollection<typeof approvalResource, ApprovalRow, ApprovalInsert>({
  resource: approvalResource,
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
  resource: auditResource,
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
  resource: inboxNotificationResource,
  queryKey: ['inbox', 'notifications'],
  queryClient,
  getDb,
  orderBy: { column: 'createdAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Inbox notification record is missing id')
    return item.id
  },
})

export const inputRequestCollection = createPodCollection<typeof inputRequestResource, InputRequestRow, InputRequestInsert>({
  resource: inputRequestResource,
  queryKey: ['inbox', 'inputRequests'],
  queryClient,
  getDb,
  orderBy: { column: 'createdAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('InputRequest record is missing id')
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

function formatTimestamp(value: unknown): number {
  if (!value) return 0
  const time = new Date(String(value)).getTime()
  return Number.isFinite(time) ? time : 0
}

function resolveApprovalIri(db: SolidDatabase, approval: ApprovalRow): string {
  if (!approval.id) {
    throw new Error('Approval row is missing id.')
  }
  return db.resolveRowIri(approvalResource as any, {
    id: approval.id,
    createdAt: approval.createdAt ?? new Date(),
  } as any)
}

function findLinkedApproval(approvals: ApprovalRow[], audit: AuditRow): ApprovalRow | null {
  if (!audit.approval) return null
  const approvalId = extractApprovalIdFromApprovalRef(audit.approval)
  return approvalId
    ? approvals.find((item) => item.id === approvalId) ?? null
    : null
}

export function findLatestApprovalByTarget(approvals: ApprovalRow[], target: string | null | undefined): ApprovalRow | null {
  const normalizedTarget = target?.trim()
  if (!normalizedTarget) return null
  return approvals
    .filter((approval) => approval.target === normalizedTarget)
    .sort((a, b) => formatTimestamp(b.resolvedAt ?? b.createdAt) - formatTimestamp(a.resolvedAt ?? a.createdAt))[0] ?? null
}

function findCachedApprovalByTarget(target: string | null | undefined): ApprovalRow | null {
  const normalizedTarget = target?.trim()
  if (!normalizedTarget) return null

  const queryApprovals = queryClient.getQueryData<ApprovalRow[]>(['inbox', 'approvals'])
  const queryMatch = findLatestApprovalByTarget(queryApprovals ?? [], normalizedTarget)
  if (queryMatch) return queryMatch

  if (!approvalCollection.isReady()) return null
  return findLatestApprovalByTarget(approvalCollection.toArray as ApprovalRow[], normalizedTarget)
}

async function updateApprovalByIri(
  db: SolidDatabase,
  approval: ApprovalRow,
  patch: Record<string, unknown>,
): Promise<void> {
  assertUpdateValuesBelongToCurrentPod(db, approval)
  await updateExactRecord(db, approvalResource as any, resolveApprovalIri(db, approval), patch)
}

async function updateResolvedApproval(
  db: SolidDatabase,
  approval: ApprovalRow,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!approval.id) {
    throw new Error('Approval row is missing id.')
  }
  if (approvalCollection.state.has(approval.id)) {
    const tx = approvalCollection.update(approval.id, (draft: ApprovalRow) => {
      Object.assign(draft, patch)
    })
    await tx.isPersisted.promise
    return
  }
  await updateApprovalByIri(db, approval, patch)
}

function makeAuditUri(db: SolidDatabase, auditId: string, createdAt: Date | string | number = new Date()): string {
  const podBaseUrl = resolveCurrentPodBaseUrl(db)
  if (!podBaseUrl) {
    throw new Error('Cannot build audit resource IRI without a current SP Pod URL.')
  }
  return auditResource.buildIri(podBaseUrl, { id: auditId, createdAt } as any)
}

function extractApprovalRuntimeThreadId(approval: ApprovalRow): string | null {
  return extractChatThreadRef(approval.thread || approval.target).threadId
}

export function buildRuntimeToolResponse(decision: 'approved' | 'rejected', reason?: string): string {
  return JSON.stringify({
    decision,
    reason: reason?.trim() || null,
    source: 'linx-inbox',
  })
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

function extractInputRequestChatThreadRef(inputRequest: InputRequestRow): { chatId: string | null; threadId: string | null } {
  const threadRef = extractChatThreadRef(inputRequest.thread || inputRequest.run || inputRequest.task)
  const chatRef = extractChatThreadRef(inputRequest.chat)

  return {
    chatId: threadRef.chatId ?? chatRef.chatId,
    threadId: threadRef.threadId,
  }
}

function buildInputRequestDescription(inputRequest: InputRequestRow): string {
  if (inputRequest.status === 'resolved') return '已回答'
  if (inputRequest.status === 'expired') return '已过期'
  if (inputRequest.status === 'cancelled') return '已取消'
  if (inputRequest.status === 'handling') return '正在处理'
  return '等待输入'
}

function buildInboxItems(
  notifications: InboxNotificationRow[],
  approvals: ApprovalRow[],
  inputRequests: InputRequestRow[],
  audits: AuditRow[],
): InboxItem[] {
  const approvalById = new Map(approvals.map((item) => [item.id, item]))
  const inputRequestById = new Map(inputRequests.map((item) => [item.id, item]))
  const auditById = new Map(audits.map((item) => [item.id, item]))
  const resolvedAuthTimestampsByKey = createResolvedAuthTimestampsIndex(audits)
  const seen = new Set<string>()
  const items: InboxItem[] = []

  for (const notification of notifications) {
    const approvalId = extractApprovalIdFromApprovalRef(notification.object)
    const approval = approvalId ? approvalById.get(approvalId) : null
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

    const inputRequestId = extractInputRequestIdFromInputRequestRef(notification.object)
    const inputRequest = inputRequestId ? inputRequestById.get(inputRequestId) : null
    if (inputRequest) {
      const itemId = `input:${inputRequest.id}`
      if (seen.has(itemId)) continue
      seen.add(itemId)
      const threadRef = extractInputRequestChatThreadRef(inputRequest)
      items.push({
        id: itemId,
        kind: 'input_request',
        category: 'input_request',
        title: inputRequest.prompt || '需要输入',
        description: buildInputRequestDescription(inputRequest),
        timestamp: String(notification.createdAt ?? inputRequest.resolvedAt ?? inputRequest.createdAt ?? ''),
        status: inputRequest.status,
        inputRequest,
        notification,
        chatId: threadRef.chatId,
        threadId: threadRef.threadId,
        thread: inputRequest.thread || inputRequest.run || inputRequest.task,
        about: inputRequest.run || inputRequest.task || inputRequest.session,
      })
      continue
    }

    const auditId = extractAuditIdFromAuditRef(notification.object)
    const audit = auditId ? auditById.get(auditId) : null
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
        approvalId: linkedApproval?.id ?? extractApprovalIdFromApprovalRef(audit.approval),
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

  for (const inputRequest of inputRequests) {
    const itemId = `input:${inputRequest.id}`
    if (seen.has(itemId)) continue
    const threadRef = extractInputRequestChatThreadRef(inputRequest)
    items.push({
      id: itemId,
      kind: 'input_request',
      category: 'input_request',
      title: inputRequest.prompt || '需要输入',
      description: buildInputRequestDescription(inputRequest),
      timestamp: String(inputRequest.resolvedAt ?? inputRequest.createdAt ?? ''),
      status: inputRequest.status,
      inputRequest,
      chatId: threadRef.chatId,
      threadId: threadRef.threadId,
      thread: inputRequest.thread || inputRequest.run || inputRequest.task,
      about: inputRequest.run || inputRequest.task || inputRequest.session,
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
      approvalId: linkedApproval?.id ?? extractApprovalIdFromApprovalRef(audit.approval),
      authUrl: presentation.authUrl,
      authMethod: presentation.authMethod,
      authMessage: presentation.authMessage,
    })
  }

  return items.sort((a, b) => formatTimestamp(b.timestamp) - formatTimestamp(a.timestamp))
}

export const inboxOps = {
  async subscribeToPod(): Promise<() => void> {
    const db = getDb()
    if (!db) return () => {}
    const unsubscribes = await Promise.all([
      approvalCollection.subscribeToPod(db),
      auditCollection.subscribeToPod(db),
      inboxNotificationCollection.subscribeToPod(db),
      inputRequestCollection.subscribeToPod(db),
    ])
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe()
    }
  },

  async fetchApprovals() {
    return approvalCollection.fetch()
  },
  async fetchAuditEntries() {
    return auditCollection.fetch()
  },
  async fetchNotifications() {
    return inboxNotificationCollection.fetch()
  },
  async fetchInputRequests() {
    return inputRequestCollection.fetch()
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
    const auditUri = makeAuditUri(db, auditId, now)

    await filesProposalApplicationCollection.applyApprovalDecision({
      db,
      approval: input.approval,
      decision: input.decision,
    })

    await updateResolvedApproval(db, input.approval, {
      status: input.decision,
      decisionBy: input.actorWebId,
      decisionRole: 'human',
      reason: input.reason?.trim() || null,
      resolvedAt: now,
      policyVersion: input.approval.policyVersion || 'phase4-inbox-v1',
    })

    const auditPayload = {
      id: auditId,
      action: `inbox.approval.${input.decision}`,
      actor: input.actorWebId,
      actorRole: 'human',
      session: input.approval.session,
      chat: input.approval.chat,
      thread: input.approval.thread,
      toolCallId: input.approval.toolCallId,
      approval: resolveApprovalIri(db, input.approval),
      toolName: input.approval.toolName,
      entry: input.approval.thread || input.approval.target,
      policyVersion: input.approval.policyVersion || 'phase4-inbox-v1',
      createdAt: now,
    }
    assertInsertValuesBelongToCurrentPod(db, auditPayload)
    await db.insert(auditResource).values(auditPayload).execute()

    const notificationPayload = {
      id: crypto.randomUUID(),
      actor: input.actorWebId,
      object: auditUri,
      createdAt: now,
    }
    assertInsertValuesBelongToCurrentPod(db, notificationPayload)
    await db.insert(inboxNotificationResource).values(notificationPayload).execute()

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['inbox', 'approvals'] }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'audit'] }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'inputRequests'] }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'items'] }),
    ])
  },
}

export function useInboxItems(filter: InboxFilter = 'all', options?: { enabled?: boolean }) {
  const { db } = useSolidDatabase()

  return useQuery({
    queryKey: ['inbox', 'items', filter],
    enabled: !!db && (options?.enabled ?? true),
    queryFn: async () => {
      const [notifications, approvals, inputRequests, audits] = await Promise.all([
        inboxOps.fetchNotifications(),
        inboxOps.fetchApprovals(),
        inboxOps.fetchInputRequests(),
        inboxOps.fetchAuditEntries(),
      ])

      const allItems = buildInboxItems(notifications, approvals, inputRequests, audits)
      return filterInboxItems(allItems, filter)
    },
  })
}

export function useApprovalByTarget(target: string | null | undefined, options?: { enabled?: boolean }) {
  const { db } = useSolidDatabase()
  const normalizedTarget = target?.trim() || null

  return useQuery({
    queryKey: ['inbox', 'approvals', 'target', normalizedTarget],
    enabled: !!db && !!normalizedTarget && (options?.enabled ?? true),
    initialData: () => findCachedApprovalByTarget(normalizedTarget),
    queryFn: async () => {
      const approvals = await inboxOps.fetchApprovals()
      return findLatestApprovalByTarget(approvals, normalizedTarget)
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

      const runtimeSessionId = extractRuntimeSessionIdFromRef(input.approval.session)
      const threadId = extractApprovalRuntimeThreadId(input.approval)
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
