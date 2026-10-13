import { useMemo } from 'react'
import { useSession } from '@/providers/solid-session-context'
import { useLiveQuery } from '@tanstack/react-db'
import { useMutation } from '@tanstack/react-query'
import {
  approvalResource,
  auditResource,
  grantResource,
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
  type GrantInsert,
  type GrantRow,
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
import { countActionableInboxItems, countAutoWaitingInboxItems, filterInboxItems, isAutoApprovedInboxItem } from '../domain/utils'
import { buildAuditPresentation, createResolvedAuthTimestampsIndex } from '../domain/presentation'
import {
  AUTO_JUDGE_AUDIT_ACTION,
  AUTO_JUDGE_POLICY_VERSION,
  buildAutoJudgeApprovePatch,
  buildAutoJudgeReviewedPatch,
  buildAutoJudgeTakeOverPatch,
  encodeAutoJudgeGrantTags,
  isAutoJudgeDue,
} from '@linx/agent-runtime/auto-judge'
import { approvalAutoPhase } from '../domain/auto-judge-view'
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
  window: {
    limit: 100,
    orderBy: [{ column: 'createdAt', direction: 'desc' }],
    maxResidentPages: 3,
  },
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
  window: {
    limit: 100,
    orderBy: [{ column: 'createdAt', direction: 'desc' }],
    maxResidentPages: 3,
  },
  getKey: (item) => {
    if (!item.id) throw new Error('Audit record is missing id')
    return item.id
  },
})

/** Grants (/settings/autonomy/grants/): what LinX may decide for the person. */
export const grantCollection = createPodCollection<typeof grantResource, GrantRow, GrantInsert>({
  resource: grantResource,
  queryKey: ['inbox', 'grants'],
  queryClient,
  getDb,
  orderBy: { column: 'createdAt', direction: 'desc' },
  window: {
    limit: 100,
    orderBy: [{ column: 'createdAt', direction: 'desc' }],
    maxResidentPages: 3,
  },
  getKey: (item) => {
    if (!item.id) throw new Error('Grant record is missing id')
    return item.id
  },
})

export const inboxNotificationCollection = createPodCollection<typeof inboxNotificationResource, InboxNotificationRow, InboxNotificationInsert>({
  resource: inboxNotificationResource,
  queryKey: ['inbox', 'notifications'],
  queryClient,
  getDb,
  orderBy: { column: 'createdAt', direction: 'desc' },
  window: {
    limit: 100,
    orderBy: [{ column: 'createdAt', direction: 'desc' }],
    maxResidentPages: 3,
  },
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
  window: {
    limit: 100,
    orderBy: [{ column: 'createdAt', direction: 'desc' }],
    maxResidentPages: 3,
  },
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

function resolveInputRequestIri(db: SolidDatabase, inputRequest: InputRequestRow): string {
  if (!inputRequest.id) {
    throw new Error('InputRequest row is missing id.')
  }
  return db.resolveRowIri(inputRequestResource as any, {
    id: inputRequest.id,
    createdAt: inputRequest.createdAt ?? new Date(),
  } as any)
}

async function updateResolvedInputRequest(
  db: SolidDatabase,
  inputRequest: InputRequestRow,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!inputRequest.id) {
    throw new Error('InputRequest row is missing id.')
  }
  if (inputRequestCollection.state.has(inputRequest.id)) {
    const tx = inputRequestCollection.update(inputRequest.id, (draft: InputRequestRow) => {
      Object.assign(draft, patch)
    })
    await tx.isPersisted.promise
    return
  }
  assertUpdateValuesBelongToCurrentPod(db, inputRequest)
  await updateExactRecord(db, inputRequestResource as any, resolveInputRequestIri(db, inputRequest), patch)
}

function resolveGrantIri(db: SolidDatabase, grant: GrantRow): string {
  if (!grant.id) throw new Error('Grant row is missing id.')
  return db.resolveRowIri(grantResource as any, {
    id: grant.id,
    createdAt: grant.createdAt ?? new Date(),
  } as any)
}

function readAutoJudgeGrantId(approval: ApprovalRow): string | null {
  try {
    const parsed = JSON.parse(approval.context ?? '') as { linxAutoJudge?: { grantId?: unknown } }
    const grantId = parsed?.linxAutoJudge?.grantId
    return typeof grantId === 'string' ? grantId : null
  } catch {
    return null
  }
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
        autoPhase: approvalAutoPhase(approval),
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
      autoPhase: approvalAutoPhase(approval),
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
      grantCollection.subscribeToPod(db),
      inboxNotificationCollection.subscribeToPod(db),
      inputRequestCollection.subscribeToPod(db),
    ])
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe()
    }
  },

  async readApprovals() {
    return approvalCollection.fetch()
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
    const auditTx = auditCollection.insert(auditPayload as AuditRow)
    await auditTx.isPersisted.promise

    const notificationPayload = {
      id: crypto.randomUUID(),
      actor: input.actorWebId,
      object: auditUri,
      createdAt: now,
    }
    assertInsertValuesBelongToCurrentPod(db, notificationPayload)
    const notificationTx = inboxNotificationCollection.insert(notificationPayload as InboxNotificationRow)
    await notificationTx.isPersisted.promise
  },

  /**
   * The wait elapsed and nobody acted: LinX approves on the person's behalf.
   * Records who decided (`decisionBy` = the LinX assistant, `decisionRole` =
   * secretary, `onBehalfOf` = the person) and a reviewable audit entry.
   * Returns false when the request was already handled or is not due.
   */
  async autoApproveApproval(input: { approval: ApprovalRow; userWebId: string; now?: Date }): Promise<boolean> {
    const db = getDb()
    if (!db) throw new Error('Database not connected')
    const now = input.now ?? new Date()
    // Re-read: a person may have acted since the sweep picked this up.
    const approval = (input.approval.id ? approvalCollection.state.get(input.approval.id) : null) ?? input.approval
    if (approval.status !== 'pending' || !isAutoJudgeDue(approval, now)) return false
    const agentIri = approval.assignedTo
    if (!agentIri) return false
    const patch = buildAutoJudgeApprovePatch({ approval, agentIri, userWebId: input.userWebId, now })
    if (!patch) return false

    await filesProposalApplicationCollection.applyApprovalDecision({ db, approval, decision: 'approved' })
    await updateResolvedApproval(db, approval, { ...patch })

    const auditId = crypto.randomUUID()
    const auditUri = makeAuditUri(db, auditId, now)
    const grantId = readAutoJudgeGrantId(approval)
    const grantRow = grantId ? grantCollection.state.get(grantId) : null
    const grantIri = grantRow ? resolveGrantIri(db, grantRow) : undefined
    const auditPayload = {
      id: auditId,
      action: AUTO_JUDGE_AUDIT_ACTION,
      actor: agentIri,
      actorRole: 'secretary',
      onBehalfOf: input.userWebId,
      session: approval.session,
      chat: approval.chat,
      thread: approval.thread,
      toolCallId: approval.toolCallId,
      approval: resolveApprovalIri(db, approval),
      toolName: approval.toolName,
      entry: approval.thread || approval.target,
      ...(grantIri ? { policy: grantIri } : {}),
      policyVersion: AUTO_JUDGE_POLICY_VERSION,
      createdAt: now,
    }
    assertInsertValuesBelongToCurrentPod(db, auditPayload)
    await auditCollection.insert(auditPayload as AuditRow).isPersisted.promise

    const notificationPayload = { id: crypto.randomUUID(), actor: agentIri, object: auditUri, createdAt: now }
    assertInsertValuesBelongToCurrentPod(db, notificationPayload)
    await inboxNotificationCollection.insert(notificationPayload as InboxNotificationRow).isPersisted.promise
    return true
  },

  /** "我来判断": the request goes back to the person, with no timer. */
  async takeOverApproval(input: { approval: ApprovalRow; userWebId: string }) {
    const db = getDb()
    if (!db) throw new Error('Database not connected')
    const patch = buildAutoJudgeTakeOverPatch({ approval: input.approval, userWebId: input.userWebId, now: new Date() })
    if (!patch) return
    await updateResolvedApproval(db, input.approval, { ...patch })
  },

  /** "没问题" in the review: remember the person looked at it. */
  async markAutoApprovalReviewed(input: { approval: ApprovalRow; userWebId: string }) {
    const db = getDb()
    if (!db) throw new Error('Database not connected')
    const patch = buildAutoJudgeReviewedPatch({ approval: input.approval, userWebId: input.userWebId, now: new Date() })
    if (!patch) return
    await updateResolvedApproval(db, input.approval, { ...patch })
  },

  /**
   * "以后这类交给 LinX 判断": a grant for this kind of request. The grant covers
   * the whole document the request touches (not just one fragment). Spending,
   * deleting and sending out are tagged as confirmed separately.
   */
  async createGrantFromApproval(input: {
    approval: ApprovalRow
    userWebId: string
    highImpactConfirmed: boolean
    agentIri?: string | null
  }): Promise<GrantRow> {
    const db = getDb()
    if (!db) throw new Error('Database not connected')
    const now = new Date()
    const target = input.approval.target.split('#', 1)[0] || input.approval.target
    const payload = {
      id: crypto.randomUUID(),
      target,
      action: input.approval.action,
      effect: 'allow',
      title: input.approval.toolName,
      riskCeiling: input.approval.risk,
      tags: encodeAutoJudgeGrantTags([], input.highImpactConfirmed),
      decisionBy: input.userWebId,
      decisionRole: 'human',
      onBehalfOf: input.userWebId,
      createdAt: now,
    }
    assertInsertValuesBelongToCurrentPod(db, payload)
    await grantCollection.insert(payload as GrantRow).isPersisted.promise
    return payload as GrantRow
  },

  /** 收回: LinX stops deciding this kind of request; what it already did stays. */
  async revokeGrant(input: { grant: GrantRow }) {
    const db = getDb()
    if (!db) throw new Error('Database not connected')
    if (!input.grant.id) throw new Error('Grant row is missing id.')
    const patch = { revokedAt: new Date() }
    if (grantCollection.state.has(input.grant.id)) {
      await grantCollection.update(input.grant.id, (draft: GrantRow) => {
        Object.assign(draft, patch)
      }).isPersisted.promise
      return
    }
    assertUpdateValuesBelongToCurrentPod(db, input.grant)
    await updateExactRecord(db, grantResource as any, resolveGrantIri(db, input.grant), patch)
  },

  /**
   * Answers an InputRequest on its own resource. The waiting runtime owns
   * continuation: it observes the resolved status and response on the same
   * request, so the inbox never replays the run or creates a new one.
   */
  async resolveInputRequest(input: {
    inputRequest: InputRequestRow
    response: string
    actorWebId: string
  }) {
    const db = getDb()
    if (!db) {
      throw new Error('Database not connected')
    }
    const response = input.response.trim()
    if (!response) {
      throw new Error('Input response is empty')
    }

    const now = new Date()
    await updateResolvedInputRequest(db, input.inputRequest, {
      status: 'resolved',
      response,
      answeredBy: input.actorWebId,
      resolvedAt: now,
    })

    const auditPayload = {
      id: crypto.randomUUID(),
      action: 'inbox.input_request.resolved',
      actor: input.actorWebId,
      actorRole: 'human',
      session: input.inputRequest.session,
      chat: input.inputRequest.chat,
      thread: input.inputRequest.thread,
      entry: input.inputRequest.thread || input.inputRequest.run || input.inputRequest.task || resolveInputRequestIri(db, input.inputRequest),
      createdAt: now,
    }
    assertInsertValuesBelongToCurrentPod(db, auditPayload)
    const auditTx = auditCollection.insert(auditPayload as AuditRow)
    await auditTx.isPersisted.promise
  },
}

export function useInboxItems(filter: InboxFilter = 'all', options?: { enabled?: boolean }) {
  const approvals = useLiveQuery(approvalCollection)
  const audits = useLiveQuery(auditCollection)
  const notifications = useLiveQuery(inboxNotificationCollection)
  const inputRequests = useLiveQuery(inputRequestCollection)
  const enabled = options?.enabled ?? true
  const data = useMemo(() => {
    if (!enabled) return []
    return filterInboxItems(buildInboxItems(
      (notifications.data ?? []) as InboxNotificationRow[],
      (approvals.data ?? []) as ApprovalRow[],
      (inputRequests.data ?? []) as InputRequestRow[],
      (audits.data ?? []) as AuditRow[],
    ), filter)
  }, [approvals.data, audits.data, enabled, filter, inputRequests.data, notifications.data])

  return {
    data,
    isLoading: enabled && [approvals, audits, notifications, inputRequests].some((query) => query.isLoading),
    isError: [approvals, audits, notifications, inputRequests].some((query) => query.isError),
    error: null,
  }
}

export function useApprovalByTarget(target: string | null | undefined, options?: { enabled?: boolean }) {
  const normalizedTarget = target?.trim() || null
  const query = useLiveQuery(approvalCollection)
  const enabled = !!normalizedTarget && (options?.enabled ?? true)
  const data = useMemo(() => enabled
    ? findLatestApprovalByTarget((query.data ?? []) as ApprovalRow[], normalizedTarget)
    : null, [enabled, normalizedTarget, query.data])
  return { ...query, data }
}

export function useInboxSummary() {
  const { data: items = [] } = useInboxItems('all')

  return useMemo(() => ({
    total: items.length,
    pending: countActionableInboxItems(items),
    audit: items.filter((item) => item.kind === 'audit').length,
    autoWaiting: countAutoWaitingInboxItems(items),
    autoApproved: items.filter(isAutoApprovedInboxItem).length,
  }), [items])
}

export function useResolveInboxInputRequest() {
  const { session } = useSession()

  return useMutation({
    mutationFn: async (input: { inputRequest: InputRequestRow; response: string }) => {
      const actorWebId = session.info.webId
      if (!actorWebId) {
        throw new Error('Solid session is not ready')
      }
      await inboxOps.resolveInputRequest({
        inputRequest: input.inputRequest,
        response: input.response,
        actorWebId,
      })
    },
  })
}

/** Lets a waiting runtime tool call continue once its approval is decided (service mode only). */
export async function continueRuntimeAfterApproval(input: {
  approval: ApprovalRow
  decision: 'approved' | 'rejected'
  reason?: string
  db: SolidDatabase | null
  webId: string
  authFetch?: typeof fetch
}): Promise<void> {
  const runtimeSessionId = extractRuntimeSessionIdFromRef(input.approval.session)
  const threadId = extractApprovalRuntimeThreadId(input.approval)
  const isServiceMode = typeof window !== 'undefined' && !!(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__
  if (!(runtimeSessionId && threadId && isServiceMode && input.approval.toolCallId && input.db && input.authFetch)) return
  try {
    await continueRuntimeToolCallFromInbox({
      db: input.db,
      webId: input.webId,
      authFetch: input.authFetch,
      threadId,
      toolCallId: input.approval.toolCallId,
      output: buildRuntimeToolResponse(input.decision, input.reason),
    })
    await queryClient.invalidateQueries({ queryKey: ['threads', threadId, 'messages'] })
  } catch (error) {
    console.warn('[Inbox] Failed to resume runtime tool call:', error)
  }
}

export function useResolveInboxApproval() {
  const { session } = useSession()
  const { db } = useSolidDatabase()

  return useMutation({
    mutationFn: async (input: {
      approval: ApprovalRow
      decision: 'approved' | 'rejected'
      reason?: string
      /** "以后这类交给 LinX 判断": also grant this kind of request. */
      grant?: { highImpactConfirmed: boolean }
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

      if (input.grant && input.decision === 'approved') {
        await inboxOps.createGrantFromApproval({
          approval: input.approval,
          userWebId: actorWebId,
          highImpactConfirmed: input.grant.highImpactConfirmed,
        })
      }

      await continueRuntimeAfterApproval({
        approval: input.approval,
        decision: input.decision,
        reason: input.reason,
        db,
        webId: actorWebId,
        authFetch: session.fetch,
      })
    },
  })
}
