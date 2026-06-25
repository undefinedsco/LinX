export type LinxSessionRetryTurn = {
  continueFromId?: string | null
  promptText?: string
  promptParentId?: string | null
}

type SessionHistoryEntry = {
  id: string
  parentId?: string | null
  message: unknown
}

export function captureLinxSessionRetryTurn(source: LinxSessionHistorySource): LinxSessionRetryTurn {
  const session = resolveLinxSessionHistorySession(source)
  return captureLinxRetryTurnFromSessionManager(session?.sessionManager, session?.state?.messages)
}

export function restoreLinxSessionHistoryBranch(source: LinxSessionHistorySource, leafId: string | null | undefined): void {
  const session = resolveLinxSessionHistorySession(source)
  restoreSessionHistoryBranchWithManager(session?.sessionManager, leafId, session)
}

function captureLinxRetryTurnFromSessionManager(
  sessionManager: any,
  fallbackMessages: unknown,
): LinxSessionRetryTurn {
  const leafId = typeof sessionManager?.getLeafId === 'function'
    ? sessionManager.getLeafId()
    : undefined
  const leafEntry = leafId && typeof sessionManager?.getEntry === 'function'
    ? sessionManager.getEntry(leafId)
    : undefined
  const leafMessage = leafEntry?.type === 'message' ? leafEntry.message : undefined
  const userEntry = findLastUserMessageEntry(sessionManager, leafId)
  const promptText = extractUserMessageText(userEntry?.message)
    ?? extractUserMessageText(leafMessage)
    ?? findLastUserMessageText(fallbackMessages)

  return {
    continueFromId: userEntry?.id ?? (leafMessage?.role === 'user' ? leafId : undefined),
    promptText,
    promptParentId: userEntry?.parentId ?? (leafMessage?.role === 'user' ? normalizeParentId(leafEntry.parentId) : undefined),
  }
}

function restoreSessionHistoryBranchWithManager(
  sessionManager: any,
  leafId: string | null | undefined,
  session: any,
): void {
  if (!sessionManager) {
    return
  }

  if (typeof leafId === 'string' && leafId) {
    sessionManager.branch?.(leafId)
  } else if (leafId === null) {
    sessionManager.resetLeaf?.()
  }

  const context = sessionManager.buildSessionContext?.()
  if (context?.messages && session?.agent?.state) {
    session.agent.state.messages = context.messages
  }
}

function findLastUserMessageText(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) {
    return undefined
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = extractUserMessageText(messages[index])
    if (text) {
      return text
    }
  }
  return undefined
}

function findLastUserMessageEntry(
  sessionManager: any,
  leafId: unknown,
): SessionHistoryEntry | undefined {
  const branch = typeof sessionManager?.getBranch === 'function' && typeof leafId === 'string'
    ? sessionManager.getBranch(leafId)
    : undefined
  const entries = Array.isArray(branch) && branch.length > 0
    ? branch
    : typeof sessionManager?.getEntries === 'function'
      ? sessionManager.getEntries()
      : []

  if (!Array.isArray(entries)) {
    return undefined
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (
      isRecord(entry)
      && entry.type === 'message'
      && typeof entry.id === 'string'
      && isRecord(entry.message)
      && entry.message.role === 'user'
    ) {
      return {
        id: entry.id,
        parentId: normalizeParentId(entry.parentId),
        message: entry.message,
      }
    }
  }

  return undefined
}

function normalizeParentId(parentId: unknown): string | null | undefined {
  if (typeof parentId === 'string') {
    return parentId
  }
  if (parentId === null) {
    return null
  }
  return undefined
}

function extractUserMessageText(message: unknown): string | undefined {
  if (!isRecord(message) || message.role !== 'user') {
    return undefined
  }

  const content = message.content
  if (typeof content === 'string') {
    return content.trim() || undefined
  }
  if (!Array.isArray(content)) {
    return undefined
  }

  const text = content
    .filter((entry): entry is { type: string; text: string } => (
      isRecord(entry) && entry.type === 'text' && typeof entry.text === 'string'
    ))
    .map((entry) => entry.text)
    .join('')
    .trim()
  return text || undefined
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object'
}

export type LinxSessionHistorySource = {
  interactive?: any
  runtime?: any
  session?: any
}

export type LinxRewindMessageItem = {
  id: string
  text: string
}

export interface LinxRewindSessionState {
  id?: string
  file?: string
  createdAt?: Date
}

export interface LinxCleanRewindResult {
  materialized: boolean
  sessionChanged: boolean
  id?: string
  file?: string
  warning?: string
}

export interface LinxSessionHistoryRewindResult {
  rewound: number
  targetLeafId: string | null
  previousState: LinxRewindSessionState
  cleanResult: LinxCleanRewindResult
  abandonedEntries: any[]
  remainingMessages?: number
}

export function hasLinxSessionHistory(source: LinxSessionHistorySource): boolean {
  return Boolean(resolveLinxSessionHistoryManager(source))
}

export function getLinxActiveSessionHistoryEntries(source: LinxSessionHistorySource): any[] {
  const sessionManager = resolveLinxSessionHistoryManager(source)
  return sessionManager ? getActiveSessionHistoryEntriesWithManager(sessionManager) : []
}

export function getLinxActiveSessionAgentMessages(source: LinxSessionHistorySource): unknown[] {
  const messages = resolveLinxSessionHistorySession(source)?.agent?.state?.messages
  return Array.isArray(messages) ? messages : []
}

export function collectLinxRewindUserMessages(source: LinxSessionHistorySource): LinxRewindMessageItem[] {
  const sessionManager = resolveLinxSessionHistoryManager(source)
  return sessionManager ? collectRewindUserMessagesWithManager(sessionManager) : []
}

export function assertLinxRewindUserEntryTarget(source: LinxSessionHistorySource, entryId: string): void {
  const sessionManager = resolveLinxSessionHistoryManager(source)
  if (!sessionManager) {
    throw new Error('Cannot rewind: selected message is not a user turn in the active branch.')
  }
  assertRewindUserEntryTargetWithManager(sessionManager, entryId)
}

function getActiveSessionHistoryEntriesWithManager(sessionManager: any): any[] {
  return getActiveSessionBranch(sessionManager)
}

function collectRewindUserMessagesWithManager(sessionManager: any): LinxRewindMessageItem[] {
  return getActiveSessionHistoryEntriesWithManager(sessionManager)
    .filter((entry) => entry?.type === 'message' && entry.message?.role === 'user')
    .map((entry) => ({
      id: String(entry.id),
      text: extractRewindMessageText(entry.message?.content) || '(empty user message)',
    }))
}

function assertRewindUserEntryTargetWithManager(sessionManager: any, entryId: string): void {
  const entry = resolveRewindUserEntry(sessionManager, entryId)
  if (!entry) {
    throw new Error('Cannot rewind: selected message is not a user turn in the active branch.')
  }
}

export function rewindLinxSessionHistoryByTurns(
  source: LinxSessionHistorySource,
  turns: number,
): LinxSessionHistoryRewindResult | undefined {
  const sessionManager = resolveLinxSessionHistoryManager(source)
  return sessionManager
    ? rewindSessionHistoryByTurnsWithManager(sessionManager, turns, resolveLinxSessionHistorySession(source))
    : undefined
}

export function rewindLinxSessionHistoryBeforeUserEntry(
  source: LinxSessionHistorySource,
  entryId: string,
): LinxSessionHistoryRewindResult | undefined {
  const sessionManager = resolveLinxSessionHistoryManager(source)
  return sessionManager
    ? rewindSessionHistoryBeforeUserEntryWithManager(sessionManager, entryId, resolveLinxSessionHistorySession(source))
    : undefined
}

function rewindSessionHistoryByTurnsWithManager(
  sessionManager: any,
  turns: number,
  session: any,
): LinxSessionHistoryRewindResult | undefined {
  const previousState = captureLinxRewindSessionState(sessionManager)
  const previousBranch = getActiveSessionBranch(sessionManager)
  const result = rewindSessionHistoryByTurns(sessionManager, turns)
  if (result.rewound === 0) {
    return undefined
  }

  const cleanResult = materializeCleanRewindSession(sessionManager, result.targetLeafId, previousState)
  syncAgentStateFromSessionManager(session, sessionManager)
  return {
    rewound: result.rewound,
    targetLeafId: result.targetLeafId,
    previousState,
    cleanResult,
    abandonedEntries: collectAbandonedRewindEntries(previousBranch, result.targetLeafId),
    remainingMessages: countActiveAgentMessages(session),
  }
}

function rewindSessionHistoryBeforeUserEntryWithManager(
  sessionManager: any,
  entryId: string,
  session: any,
): LinxSessionHistoryRewindResult | undefined {
  const entry = resolveRewindUserEntry(sessionManager, entryId)
  if (!entry) {
    throw new Error('Cannot rewind: selected message is not a user turn in the active branch.')
  }

  const previousState = captureLinxRewindSessionState(sessionManager)
  const previousBranch = getActiveSessionBranch(sessionManager)
  const targetLeafId = typeof entry.parentId === 'string' && entry.parentId ? entry.parentId : null
  moveSessionManagerLeaf(sessionManager, targetLeafId)
  const cleanResult = materializeCleanRewindSession(sessionManager, targetLeafId, previousState)
  syncAgentStateFromSessionManager(session, sessionManager)
  return {
    rewound: 1,
    targetLeafId,
    previousState,
    cleanResult,
    abandonedEntries: collectAbandonedRewindEntries(previousBranch, targetLeafId),
    remainingMessages: countActiveAgentMessages(session),
  }
}

export function describeLinxRewindTarget(targetLeafId: string | null, cleanResult: LinxCleanRewindResult): string {
  const target = targetLeafId ? `leaf ${targetLeafId}` : 'session root'
  if (!cleanResult.materialized) {
    return target
  }
  if (cleanResult.sessionChanged && cleanResult.id) {
    return `${target} in clean session ${cleanResult.id}`
  }
  return `${target} in clean session`
}

function resolveLinxSessionHistorySession(source: LinxSessionHistorySource): any {
  return source.session ?? source.interactive?.session ?? source.runtime?.session
}

function resolveLinxSessionHistoryManager(source: LinxSessionHistorySource): any {
  return source.session?.sessionManager
    ?? source.interactive?.session?.sessionManager
    ?? source.interactive?.sessionManager
    ?? source.runtime?.session?.sessionManager
    ?? source.runtime?.sessionManager
}

function resolveRewindUserEntry(sessionManager: any, entryId: string): any | undefined {
  const entry = typeof sessionManager?.getEntry === 'function'
    ? sessionManager.getEntry(entryId)
    : getActiveSessionBranch(sessionManager).find((candidate) => candidate?.id === entryId)
  return entry?.type === 'message' && entry.message?.role === 'user' ? entry : undefined
}

function rewindSessionHistoryByTurns(
  sessionManager: any,
  turns: number,
): { rewound: number; targetLeafId: string | null } {
  let rewound = 0
  let targetLeafId = resolveSessionManagerLeafId(sessionManager)

  for (; rewound < turns; rewound += 1) {
    const branch = getActiveSessionBranch(sessionManager)
    const latestUserEntry = findLatestUserMessageEntry(branch)
    if (!latestUserEntry) {
      break
    }

    targetLeafId = typeof latestUserEntry.parentId === 'string' && latestUserEntry.parentId
      ? latestUserEntry.parentId
      : null
    moveSessionManagerLeaf(sessionManager, targetLeafId)
  }

  return { rewound, targetLeafId }
}

function resolveSessionManagerLeafId(sessionManager: any): string | null {
  return typeof sessionManager?.getLeafId === 'function'
    ? sessionManager.getLeafId()
    : null
}

function getActiveSessionBranch(sessionManager: any): any[] {
  const hasLeafApi = typeof sessionManager?.getLeafId === 'function'
  const leafId = hasLeafApi ? sessionManager.getLeafId() : undefined
  if (hasLeafApi && leafId === null) {
    return []
  }
  if (typeof sessionManager?.getBranch === 'function') {
    const branch = hasLeafApi ? sessionManager.getBranch(leafId) : sessionManager.getBranch()
    return Array.isArray(branch) ? branch : []
  }
  const entries = typeof sessionManager?.getEntries === 'function' ? sessionManager.getEntries() : []
  return Array.isArray(entries) ? entries : []
}

function findLatestUserMessageEntry(branch: any[]): any | null {
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index]
    if (entry?.type === 'message' && entry.message?.role === 'user') {
      return entry
    }
  }
  return null
}

function moveSessionManagerLeaf(sessionManager: any, leafId: string | null): void {
  if (leafId) {
    sessionManager.branch?.(leafId)
    return
  }
  sessionManager.resetLeaf?.()
}

function captureLinxRewindSessionState(sessionManager: any): LinxRewindSessionState {
  return {
    id: normalizeRewindString(sessionManager?.getSessionId?.()),
    file: normalizeRewindString(sessionManager?.getSessionFile?.()),
    createdAt: resolveRewindSessionCreatedAt(sessionManager),
  }
}

function materializeCleanRewindSession(
  sessionManager: any,
  targetLeafId: string | null,
  previousState: LinxRewindSessionState,
): LinxCleanRewindResult {
  const beforeId = previousState.id
  let materialized = false
  let warning: string | undefined

  try {
    if (targetLeafId && typeof sessionManager?.createBranchedSession === 'function') {
      sessionManager.createBranchedSession(targetLeafId)
      materialized = true
    } else if (!targetLeafId && typeof sessionManager?.newSession === 'function') {
      sessionManager.newSession(previousState.file ? { parentSession: previousState.file } : undefined)
      materialized = true
    }
  } catch (error) {
    warning = error instanceof Error ? error.message : String(error)
  }

  const id = normalizeRewindString(sessionManager?.getSessionId?.())
  const file = normalizeRewindString(sessionManager?.getSessionFile?.())
  return {
    materialized,
    sessionChanged: Boolean(beforeId && id && beforeId !== id),
    id,
    file,
    ...(warning ? { warning } : {}),
  }
}

function collectAbandonedRewindEntries(previousBranch: any[], targetLeafId: string | null): any[] {
  if (!Array.isArray(previousBranch) || previousBranch.length === 0) {
    return []
  }
  if (!targetLeafId) {
    return previousBranch
  }
  const targetIndex = previousBranch.findIndex((entry) => entry?.id === targetLeafId)
  return targetIndex >= 0 ? previousBranch.slice(targetIndex + 1) : previousBranch
}

function resolveRewindSessionCreatedAt(sessionManager: any): Date | undefined {
  const headerTimestamp = normalizeRewindString(sessionManager?.getHeader?.()?.timestamp)
  const headerDate = toValidRewindDate(headerTimestamp)
  if (headerDate) {
    return headerDate
  }

  const entries = Array.isArray(sessionManager?.getEntries?.()) ? sessionManager.getEntries() : []
  for (const entry of entries) {
    const timestamp = normalizeRewindString(entry?.timestamp)
    const date = toValidRewindDate(timestamp)
    if (date) {
      return date
    }
  }

  const sessionId = normalizeRewindString(sessionManager?.getSessionId?.())
  return sessionId ? parseRewindDateFromSessionId(sessionId) ?? undefined : undefined
}

function parseRewindDateFromSessionId(sessionId: string): Date | null {
  const prefix = sessionId.replace(/-/g, '').slice(0, 12)
  if (!/^[\da-f]{12}$/i.test(prefix)) {
    return null
  }
  const millis = Number.parseInt(prefix, 16)
  if (!Number.isFinite(millis) || millis <= 0) {
    return null
  }
  return toValidRewindDate(millis)
}

function toValidRewindDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

function normalizeRewindString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function syncAgentStateFromSessionManager(session: any, sessionManager: any): void {
  const context = sessionManager.buildSessionContext?.()
  if (!context || !session?.agent?.state) {
    return
  }
  if (Array.isArray(context.messages)) {
    session.agent.state.messages = context.messages
  }
}

function countActiveAgentMessages(session: any): number | undefined {
  return Array.isArray(session?.agent?.state?.messages)
    ? session.agent.state.messages.length
    : undefined
}

function extractRewindMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .filter((part): part is { type: string; text?: unknown } => typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text')
    .map((part) => typeof part.text === 'string' ? part.text : '')
    .join('')
}
