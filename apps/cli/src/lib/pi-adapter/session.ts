import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import {
  CURRENT_SESSION_VERSION,
  SessionManager,
  type SessionEntry,
  type SessionInfo,
} from '@mariozechner/pi-coding-agent'
import {
  getDefaultPodDataSession,
  type PodDataSession,
} from '../pod-data-session.js'
import {
  chatResource,
  buildSessionResourceId,
  drizzle,
  eq,
  extractSessionIdFromSessionRef,
  messageResource,
  sessionResource,
  solidResources,
  type MessageRow,
  type SessionRow,
  type SolidDatabase,
} from '../models.js'
import { PI_CHAT_ID } from './pod-mirror-mapping.js'

export interface LinxPiSessionManagerOptions {
  cwd: string
  agentDir: string
  session?: string
  last?: boolean
  podSessionSource?: LinxPiPodSessionSource | null
}

export interface LinxPiListSessionsOptions {
  podSessionSource?: LinxPiPodSessionSource | null
}

export interface LinxPiResolveSessionOptions {
  podSessionSource?: LinxPiPodSessionSource | null
}

export interface LinxPiPodSessionSource {
  listSessions(cwd?: string): Promise<LinxPiPodSessionSnapshot[]>
  findSession(input: string, cwd?: string): Promise<LinxPiPodSessionSnapshot | null>
}

export interface LinxPiPodSessionSnapshot {
  id: string
  cwd?: string
  name?: string
  createdAt?: Date | string | number
  updatedAt?: Date | string | number
  sessionFile?: string
  messages?: LinxPiPodMessageSnapshot[]
}

export interface LinxPiPodMessageSnapshot {
  id: string
  role?: string
  content?: string
  richContent?: string
  createdAt?: Date | string | number
  updatedAt?: Date | string | number
}

type PodSessionFetch = (url: string, init?: RequestInit) => Promise<Response>

export function createNativeLinxPiPodSessionSource(context: {
  webId: string
  db: SolidDatabase
  fetch?: PodSessionFetch
}): LinxPiPodSessionSource {
  const source: LinxPiPodSessionSource = {
    async listSessions(_cwd?: string): Promise<LinxPiPodSessionSnapshot[]> {
      return listPodSessionSnapshots(context)
    },
    async findSession(input: string, _cwd?: string): Promise<LinxPiPodSessionSnapshot | null> {
      const exact = await findPodSessionSnapshot(context, input)
      if (exact) {
        return exact
      }
      const sessions = await source.listSessions()
      const matches = sessions.filter((session: LinxPiPodSessionSnapshot) => session.id.startsWith(input))
      if (matches.length === 1) {
        return matches[0]
      }
      return null
    },
  }
  return source
}

export async function createLinxPiSessionManager(options: LinxPiSessionManagerOptions): Promise<SessionManager> {
  const sessionDir = getDefaultLinxPiSessionDir(options.cwd, options.agentDir)

  if (options.session?.trim()) {
    const session = await resolveLinxPiSession(options.session.trim(), options.cwd, sessionDir, {
      podSessionSource: options.podSessionSource,
    })
    return openAndRepairLinxPiSession(session.path, sessionDir)
  }

  if (options.last) {
    const sessions = await listLinxPiSessions(options.cwd, options.agentDir, {
      podSessionSource: options.podSessionSource,
    })
    if (sessions[0]) {
      return openAndRepairLinxPiSession(sessions[0].path, sessionDir)
    }
    return SessionManager.create(options.cwd, sessionDir)
  }

  return SessionManager.create(options.cwd, sessionDir)
}

export async function listLinxPiSessions(
  cwd: string,
  agentDir: string,
  options: LinxPiListSessionsOptions = {},
): Promise<SessionInfo[]> {
  const sessionDir = getDefaultLinxPiSessionDir(cwd, agentDir)
  const localSessions = await SessionManager.list(cwd, sessionDir)
  const podSessions = await hydratePodSessions(cwd, sessionDir, options.podSessionSource, localSessions)
  return sortSessionsByModified(mergeSessions(localSessions, podSessions))
}

export async function resolveLinxPiSession(
  input: string,
  cwd: string,
  sessionDir?: string,
  options: LinxPiResolveSessionOptions = {},
): Promise<SessionInfo> {
  const directPath = resolve(input)
  if (existsSync(directPath) && statSync(directPath).isFile()) {
    const manager = SessionManager.open(directPath)
    const header = manager.getHeader()
    return {
      path: directPath,
      id: manager.getSessionId(),
      cwd: manager.getCwd(),
      created: header?.timestamp ? new Date(header.timestamp) : new Date(0),
      modified: statSync(directPath).mtime,
      messageCount: manager.getEntries().filter((entry) => entry.type === 'message').length,
      firstMessage: '(session file)',
      allMessagesText: '',
    }
  }

  const localSessions = sessionDir
    ? await SessionManager.list(cwd, sessionDir)
    : await SessionManager.list(cwd)
  const globalSessions = sessionDir ? await SessionManager.listAll() : []
  const sessions = [...localSessions, ...globalSessions]
  const exact = sessions.find((session) => session.id === input)
  if (exact) {
    return exact
  }

  const byPrefix = sessions.filter((session) => session.id.startsWith(input))
  if (byPrefix.length === 1) {
    return byPrefix[0]
  }

  const byFilePrefix = sessions.filter((session) => session.path.includes(input))
  if (byFilePrefix.length === 1) {
    return byFilePrefix[0]
  }

  const scoped = (byPrefix.length > 0 ? byPrefix : byFilePrefix)
    .filter((session) => session.cwd === cwd)
  if (scoped.length === 1) {
    return scoped[0]
  }

  if (sessionDir) {
    const podSession = await hydratePodSession(input, cwd, sessionDir, options.podSessionSource)
    if (podSession) {
      return podSession
    }
  }

  if (byPrefix.length > 1 || byFilePrefix.length > 1) {
    const matches = sortSessionsByModified([...new Map([...byPrefix, ...byFilePrefix].map((session) => [session.path, session])).values()])
      .slice(0, 8)
      .map((session) => `- ${formatLinxPiSessionSummary(session)}`)
      .join('\n')
    throw new Error(`Session id is ambiguous: ${input}\n${matches}`)
  }

  throw new Error(`No LinX session found for: ${input}`)
}

export function formatLinxPiSessionSummary(session: SessionInfo): string {
  const label = session.name || session.firstMessage || '(no messages)'
  const cwd = session.cwd || '(unknown cwd)'
  return `${session.id.slice(0, 13)}  ${label}  ${cwd}`
}

function sortSessionsByModified(sessions: SessionInfo[]): SessionInfo[] {
  return [...sessions].sort((a, b) => b.modified.getTime() - a.modified.getTime())
}

function mergeSessions(localSessions: SessionInfo[], podSessions: SessionInfo[]): SessionInfo[] {
  const merged = new Map<string, SessionInfo>()
  for (const session of podSessions) {
    merged.set(session.id, session)
  }
  for (const session of localSessions) {
    merged.set(session.id, session)
  }
  return [...merged.values()]
}

function getDefaultLinxPiSessionDir(_cwd: string, agentDir: string): string {
  // Sessions are stored flat, not bound to workspace directory.
  // Workspace (cwd) is tracked as session metadata, so `cd` doesn't break the session.
  return join(agentDir, 'sessions')
}

async function hydratePodSessions(
  cwd: string,
  sessionDir: string,
  source: LinxPiPodSessionSource | null | undefined,
  localSessions: SessionInfo[],
): Promise<SessionInfo[]> {
  const resolvedSource = await resolvePodSessionSource(source)
  if (!resolvedSource) {
    return []
  }

  const localIds = new Set(localSessions.map((session) => session.id))
  const snapshots = await resolvedSource.listSessions(cwd)
  const hydrated: SessionInfo[] = []
  for (const snapshot of snapshots) {
    if (localIds.has(snapshot.id)) {
      continue
    }
    hydrated.push(materializePodSessionSnapshot(snapshot, cwd, sessionDir))
  }
  return hydrated
}

async function hydratePodSession(
  input: string,
  cwd: string,
  sessionDir: string,
  source: LinxPiPodSessionSource | null | undefined,
): Promise<SessionInfo | null> {
  const resolvedSource = await resolvePodSessionSource(source)
  if (!resolvedSource) {
    return null
  }

  const snapshot = await resolvedSource.findSession(input, cwd)
  if (!snapshot) {
    return null
  }

  return materializePodSessionSnapshot(snapshot, cwd, sessionDir)
}

async function resolvePodSessionSource(
  source: LinxPiPodSessionSource | null | undefined,
): Promise<LinxPiPodSessionSource | null> {
  if (source !== undefined) {
    return source
  }
  return createDefaultLinxPiPodSessionSource()
}

function materializePodSessionSnapshot(
  snapshot: LinxPiPodSessionSnapshot,
  fallbackCwd: string,
  sessionDir: string,
): SessionInfo {
  mkdirSync(sessionDir, { recursive: true })
  const created = toDate(snapshot.createdAt) ?? toDate(snapshot.updatedAt) ?? new Date()
  const modified = toDate(snapshot.updatedAt) ?? created
  const cwd = snapshot.cwd?.trim() || fallbackCwd
  const entries = buildPodSessionEntries(snapshot)
  const sessionFile = getMaterializedSessionFile(snapshot, sessionDir, created)
  const header = {
    type: 'session',
    version: CURRENT_SESSION_VERSION,
    id: snapshot.id,
    timestamp: created.toISOString(),
    cwd,
  }
  const lines = [header, ...entries].map((entry) => JSON.stringify(entry))
  writeFileSync(sessionFile, `${lines.join('\n')}\n`)

  const manager = openAndRepairLinxPiSession(sessionFile, sessionDir)
  const info = buildSessionInfoFromManager(manager, sessionFile, created, modified)
  return snapshot.name ? { ...info, name: snapshot.name } : info
}

function openAndRepairLinxPiSession(path: string, sessionDir?: string): SessionManager {
  const manager = SessionManager.open(path, sessionDir)
  repairDanglingLinxPiToolCalls(manager)
  return manager
}

export function repairDanglingLinxPiToolCalls(manager: SessionManager): number {
  let repaired = 0
  const maxRepairs = 10

  for (let index = 0; index < maxRepairs; index += 1) {
    const repair = findFirstDanglingToolCallRepair(manager.getBranch())
    if (!repair) {
      break
    }

    manager.branch(repair.assistantEntry.id)
    for (const toolCall of repair.toolCalls) {
      const existingResult = repair.immediateToolResults.get(toolCall.id)
      if (existingResult) {
        appendReplayedSessionEntry(manager, existingResult)
      } else {
        manager.appendMessage(createInterruptedToolResultMessage(toolCall))
      }
    }

    for (const entry of repair.replayEntries) {
      const message = entry.type === 'message' ? entry.message : undefined
      if (isToolResultMessageFor(message, repair.toolCallIds)) {
        continue
      }
      appendReplayedSessionEntry(manager, entry)
    }
    repaired += repair.toolCalls.filter((toolCall) => !repair.immediateToolResults.has(toolCall.id)).length
  }

  return repaired
}

function findFirstDanglingToolCallRepair(branch: SessionEntry[]): {
  assistantEntry: SessionEntry
  toolCalls: Array<{ id: string; name: string }>
  toolCallIds: Set<string>
  immediateToolResults: Map<string, SessionEntry>
  replayEntries: SessionEntry[]
} | null {
  for (let index = 0; index < branch.length; index += 1) {
    const entry = branch[index]
    const message = entry.type === 'message' ? entry.message : undefined
    const toolCalls = extractAssistantToolCalls(message)
    if (toolCalls.length === 0) {
      continue
    }

    const toolCallIds = new Set(toolCalls.map((toolCall) => toolCall.id))
    const immediateToolResults = new Map<string, SessionEntry>()
    let nextIndex = index + 1
    while (nextIndex < branch.length) {
      const nextEntry = branch[nextIndex]
      const nextMessage = nextEntry.type === 'message' ? nextEntry.message : undefined
      if (!isRecord(nextMessage) || nextMessage.role !== 'toolResult') {
        break
      }
      const toolCallId = typeof nextMessage.toolCallId === 'string' ? nextMessage.toolCallId : ''
      if (toolCallIds.has(toolCallId) && !immediateToolResults.has(toolCallId)) {
        immediateToolResults.set(toolCallId, nextEntry)
      }
      nextIndex += 1
    }

    if (toolCalls.every((toolCall) => immediateToolResults.has(toolCall.id))) {
      continue
    }

    return {
      assistantEntry: entry,
      toolCalls,
      toolCallIds,
      immediateToolResults,
      replayEntries: branch.slice(nextIndex),
    }
  }

  return null
}

function extractAssistantToolCalls(message: unknown): Array<{ id: string; name: string }> {
  if (!isRecord(message) || message.role !== 'assistant' || !Array.isArray(message.content)) {
    return []
  }

  return message.content.flatMap((part) => {
    if (!isRecord(part) || part.type !== 'toolCall') {
      return []
    }
    const id = typeof part.id === 'string' ? part.id : ''
    const name = typeof part.name === 'string' ? part.name : ''
    return id && name ? [{ id, name }] : []
  })
}

function isToolResultMessageFor(message: unknown, toolCallIds: Set<string>): boolean {
  if (!isRecord(message) || message.role !== 'toolResult') {
    return false
  }
  const toolCallId = typeof message.toolCallId === 'string' ? message.toolCallId : ''
  return toolCallIds.has(toolCallId)
}

function createInterruptedToolResultMessage(toolCall: { id: string; name: string }): {
  role: 'toolResult'
  toolCallId: string
  toolName: string
  content: Array<{ type: 'text'; text: string }>
  details: { linxRepair: string; interrupted: boolean }
  isError: boolean
  timestamp: number
} {
  return {
    role: 'toolResult',
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content: [{
      type: 'text',
      text: `Tool execution was interrupted before LinX received a result for ${toolCall.name}. Treat this tool call as failed and retry only if still needed.`,
    }],
    details: {
      linxRepair: 'dangling-tool-call',
      interrupted: true,
    },
    isError: true,
    timestamp: Date.now(),
  }
}

function appendReplayedSessionEntry(manager: SessionManager, entry: SessionEntry): void {
  if (entry.type === 'message') {
    manager.appendMessage(cloneJson(entry.message) as Parameters<SessionManager['appendMessage']>[0])
    return
  }
  if (entry.type === 'thinking_level_change') {
    manager.appendThinkingLevelChange(entry.thinkingLevel)
    return
  }
  if (entry.type === 'model_change') {
    manager.appendModelChange(entry.provider, entry.modelId)
    return
  }
  if (entry.type === 'session_info' && entry.name) {
    manager.appendSessionInfo(entry.name)
    return
  }
  if (entry.type === 'custom') {
    manager.appendCustomEntry(entry.customType, cloneJson(entry.data))
    return
  }
  if (entry.type === 'custom_message') {
    manager.appendCustomMessageEntry(entry.customType, cloneJson(entry.content), entry.display, cloneJson(entry.details))
  }
}

function cloneJson<T>(value: T): T {
  if (value === undefined) {
    return value
  }
  return JSON.parse(JSON.stringify(value)) as T
}

function buildPodSessionEntries(snapshot: LinxPiPodSessionSnapshot): SessionEntry[] {
  const sortedMessages = [...(snapshot.messages ?? [])].sort((a, b) => {
    const aTime = toDate(a.createdAt)?.getTime() ?? 0
    const bTime = toDate(b.createdAt)?.getTime() ?? 0
    return aTime - bTime
  })
  const entries: SessionEntry[] = []
  let previousId: string | null = null

  for (const row of sortedMessages) {
    const parsed = parsePodRichContent(row.richContent)
    const message = parsed.message ?? synthesizeAgentMessage(row)
    if (!message) {
      continue
    }
    const id = parsed.entry?.id
      ?? extractEntryIdFromPodMessageId(snapshot.id, row.id)
    const timestamp = parsed.entry?.timestamp
      ?? toDate(row.createdAt)?.toISOString()
      ?? new Date().toISOString()
    const entry = {
      type: 'message',
      id,
      parentId: parsed.entry?.parentId !== undefined ? parsed.entry.parentId : previousId,
      timestamp,
      message,
    } as SessionEntry
    entries.push(entry)
    previousId = id
  }

  return entries
}

function parsePodRichContent(richContent: string | undefined): {
  entry?: Partial<SessionEntry> & { message?: unknown }
  message?: unknown
} {
  if (!richContent?.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(richContent) as unknown
    if (isRecord(parsed) && parsed.type === 'message' && isRecord(parsed.message)) {
      return {
        entry: parsed as Partial<SessionEntry> & { message?: unknown },
        message: parsed.message,
      }
    }
    if (isRecord(parsed) && isRecord(parsed.linxPiSessionEntry)) {
      const entry = parsed.linxPiSessionEntry as Partial<SessionEntry> & { message?: unknown }
      return {
        entry,
        message: isRecord(entry.message) ? entry.message : parsed,
      }
    }
    if (isRecord(parsed) && typeof parsed.role === 'string') {
      return { message: parsed }
    }
  } catch {
    return {}
  }

  return {}
}

function synthesizeAgentMessage(row: LinxPiPodMessageSnapshot): unknown | null {
  const role = row.role === 'assistant' || row.role === 'system' ? row.role : 'user'
  const timestamp = toDate(row.createdAt)?.getTime() ?? Date.now()
  const content = [{ type: 'text', text: row.content ?? '' }]
  if (role === 'assistant') {
    return {
      role: 'assistant',
      content,
      api: 'openai-completions',
      provider: 'undefineds',
      model: 'linx-lite',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop',
      timestamp,
    }
  }
  if (role === 'system') {
    return {
      role: 'custom',
      customType: 'linx-pod-system',
      content,
      timestamp,
    }
  }
  return {
    role: 'user',
    content,
    timestamp,
  }
}

function extractEntryIdFromPodMessageId(sessionId: string, messageId: string): string {
  const prefix = `${sessionId}-`
  return messageId.startsWith(prefix) ? messageId.slice(prefix.length) : messageId
}

function getMaterializedSessionFile(
  snapshot: LinxPiPodSessionSnapshot,
  sessionDir: string,
  created: Date,
): string {
  if (snapshot.sessionFile?.trim()) {
    const fileName = basename(snapshot.sessionFile)
    if (fileName.endsWith('.jsonl')) {
      return join(sessionDir, fileName)
    }
  }

  const fileTimestamp = created.toISOString().replace(/[:.]/g, '-')
  return join(sessionDir, `${fileTimestamp}_${snapshot.id}.jsonl`)
}

function buildSessionInfoFromManager(
  manager: SessionManager,
  path: string,
  created: Date,
  modified: Date,
): SessionInfo {
  const entries = manager.getEntries()
  const messages = entries.filter((entry) => entry.type === 'message')
  const allMessages = messages
    .map((entry) => extractMessageText((entry as { message?: unknown }).message))
    .filter(Boolean)
  const firstUserMessage = messages.find((entry) => {
    const message = (entry as { message?: { role?: unknown } }).message
    return message?.role === 'user'
  })
  return {
    path,
    id: manager.getSessionId(),
    cwd: manager.getCwd(),
    name: manager.getSessionName(),
    created,
    modified,
    messageCount: messages.length,
    firstMessage: firstUserMessage
      ? extractMessageText((firstUserMessage as { message?: unknown }).message) || '(no messages)'
      : '(no messages)',
    allMessagesText: allMessages.join(' '),
  }
}

function extractMessageText(message: unknown): string {
  if (!isRecord(message)) {
    return ''
  }
  const content = message.content
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (!isRecord(part)) return ''
      if (part.type === 'text') return String(part.text ?? '')
      if (part.type === 'thinking') return String(part.thinking ?? '')
      return ''
    })
    .join('')
}

function toDate(value: Date | string | number | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

interface DefaultPodSessionContext {
  webId: string
  db: SolidDatabase
  fetch?: PodSessionFetch
}

const POD_SESSION_LIST_LOOKBACK_DAYS = 90
const POD_SESSION_LIST_LIMIT = 200
const POD_CONTAINER_LIST_TIMEOUT_MS = 8_000

async function createDefaultLinxPiPodSessionSource(): Promise<LinxPiPodSessionSource | null> {
  const contextPromise = createDefaultPodSessionContext()
  return {
    async listSessions(cwd?: string): Promise<LinxPiPodSessionSnapshot[]> {
      const context = await contextPromise
      return context ? createNativeLinxPiPodSessionSource(context).listSessions(cwd) : []
    },
    async findSession(input: string, cwd?: string): Promise<LinxPiPodSessionSnapshot | null> {
      const context = await contextPromise
      return context ? createNativeLinxPiPodSessionSource(context).findSession(input, cwd) : null
    },
  }
}

async function createDefaultPodSessionContext(): Promise<DefaultPodSessionContext | null> {
  const session = await getDefaultPodDataSession()
  if (!session) {
    return null
  }

  return {
    webId: session.webId,
    db: createSessionSourceDb(session),
    fetch: session.fetch,
  }
}

async function listPodSessionSnapshots(
  context: DefaultPodSessionContext,
): Promise<LinxPiPodSessionSnapshot[]> {
  const rows = await listPodSessionRows(context)
  const snapshots = (await Promise.all(rows.map((row) => (
    buildPodSessionSnapshot(context, row)
  ))))
    .filter((snapshot): snapshot is LinxPiPodSessionSnapshot => snapshot !== null)

  return snapshots.sort((a, b) => {
    const aTime = toDate(a.updatedAt)?.getTime() ?? 0
    const bTime = toDate(b.updatedAt)?.getTime() ?? 0
    return bTime - aTime
  })
}

function createSessionSourceDb(session: PodDataSession): SolidDatabase {
  return drizzle(session.solidSession, {
    logger: false,
    disableInteropDiscovery: true,
    podUrl: session.podUrl,
    resourcePreparation: 'off' as never,
    schema: solidResources,
  }) as unknown as SolidDatabase
}

async function listPodSessionRows(context: DefaultPodSessionContext): Promise<SessionRow[]> {
  const fetchFn = resolvePodFetch(context)
  if (fetchFn) {
    const rows = await listRecentSessionRowsFromContainers(context, fetchFn)
    return filterPodSessionRows(context, rows)
  }

  const toolColumn = (sessionResource as any).tool
  const rows = await context.db.select()
    .from(sessionResource)
    .where(eq(toolColumn, 'linx'))
    .orderBy('updatedAt', 'desc')
    .execute() as SessionRow[]
  return filterPodSessionRows(context, rows)
}

function filterPodSessionRows(context: DefaultPodSessionContext, rows: SessionRow[]): SessionRow[] {
  const secretaryChat = context.db.resolveLocatorIri(chatResource, { id: PI_CHAT_ID })
  return rows.filter((row) => {
    if (typeof row.id !== 'string' || !buildSessionResourceIdFromInput(row.id)) {
      return false
    }
    if (row.ownerWebId && row.ownerWebId !== context.webId) {
      return false
    }
    if (row.chat && !isSecretaryChatRef(row.chat, secretaryChat)) {
      return false
    }
    return true
  })
}

function resolvePodFetch(context: DefaultPodSessionContext): PodSessionFetch | null {
  if (context.fetch) {
    return context.fetch
  }
  const dialect = (context.db as { dialect?: { getAuthenticatedFetch?: () => PodSessionFetch } }).dialect
  if (typeof dialect?.getAuthenticatedFetch === 'function') {
    return dialect.getAuthenticatedFetch()
  }
  return null
}

async function listRecentSessionRowsFromContainers(
  context: DefaultPodSessionContext,
  fetchFn: PodSessionFetch,
): Promise<SessionRow[]> {
  const monthContainers = getRecentSessionMonthContainers(context.webId)
  const dayContainers = new Set<string>()
  for (const monthContainer of monthContainers) {
    const contained = await listContainedPodResources(fetchFn, monthContainer)
    for (const item of contained) {
      if (item.endsWith('/')) {
        dayContainers.add(item)
      }
    }
  }

  const sessionResources = new Set<string>()
  for (const dayContainer of [...dayContainers].sort().reverse()) {
    const contained = await listContainedPodResources(fetchFn, dayContainer)
    for (const item of contained) {
      if (item.endsWith('.ttl')) {
        sessionResources.add(item)
      }
      if (sessionResources.size >= POD_SESSION_LIST_LIMIT) {
        break
      }
    }
    if (sessionResources.size >= POD_SESSION_LIST_LIMIT) {
      break
    }
  }

  const rows: SessionRow[] = []
  for (const iri of [...sessionResources].sort().reverse()) {
    try {
      const row = await context.db.findByIri(sessionResource, iri) as SessionRow | null
      if (row) {
        rows.push(row)
      }
    } catch {
      // A bad session resource should not prevent listing other resumable sessions.
    }
  }
  return rows
}

function getRecentSessionMonthContainers(webId: string): string[] {
  const base = getPodBaseUrl(webId)
  const months = new Set<string>()
  const now = new Date()
  for (let offset = 0; offset < POD_SESSION_LIST_LOOKBACK_DAYS; offset += 1) {
    const date = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000)
    const yyyy = String(date.getUTCFullYear())
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
    months.add(`${base}/.data/sessions/${yyyy}/${mm}/`)
  }
  return [...months].sort().reverse()
}

async function listContainedPodResources(fetchFn: PodSessionFetch, containerUrl: string): Promise<string[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), POD_CONTAINER_LIST_TIMEOUT_MS)
  try {
    const response = await fetchFn(containerUrl, {
      method: 'GET',
      headers: { Accept: 'text/turtle' },
      signal: controller.signal,
    })
    if (response.status === 404) {
      return []
    }
    if (!response.ok) {
      throw new Error(`Failed to list Pod container ${containerUrl}: ${response.status} ${response.statusText}`)
    }
    const body = await response.text()
    return extractContainedPodResources(containerUrl, body)
  } finally {
    clearTimeout(timer)
  }
}

function extractContainedPodResources(containerUrl: string, turtle: string): string[] {
  const urls = new Set<string>()
  const pattern = /<([^>]+)>/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(turtle)) !== null) {
    const raw = match[1]
    try {
      const url = new URL(raw, containerUrl).href
      if (url.startsWith(containerUrl) && url !== containerUrl) {
        urls.add(url)
      }
    } catch {
      // Ignore malformed container entries.
    }
  }
  return [...urls]
}

function isSecretaryChatRef(value: string, secretaryChat: string): boolean {
  return value === secretaryChat
    || value === PI_CHAT_ID
    || value.endsWith(`/.data/chat/${PI_CHAT_ID}/index.ttl#this`)
}

async function findPodSessionSnapshot(
  context: DefaultPodSessionContext,
  input: string,
): Promise<LinxPiPodSessionSnapshot | null> {
  const sessionId = input.trim()
  if (!sessionId) {
    return null
  }

  const resourceId = buildSessionResourceIdFromInput(sessionId)
  if (!resourceId) {
    return null
  }

  const row = await context.db.findById(sessionResource, resourceId) as SessionRow | null
  const expectedSessionId = extractResourceLocalId(resourceId)
  if (!row || extractResourceLocalId(row.id) !== expectedSessionId || row.tool !== 'linx') {
    return null
  }
  if (row.ownerWebId && row.ownerWebId !== context.webId) {
    return null
  }
  return row ? buildPodSessionSnapshot(context, row) : null
}

function buildSessionResourceIdFromInput(input: string): string | null {
  const trimmed = input.trim().replace(/^\/?\.data\/sessions\//, '')
  if (!trimmed) {
    return null
  }
  if (trimmed.includes('.ttl#')) {
    return null
  }
  if (trimmed.includes('.ttl')) {
    if (/^https?:\/\//.test(trimmed)) {
      if (!new URL(trimmed).pathname.includes('/.data/sessions/')) {
        return null
      }
      const sessionId = extractSessionIdFromSessionRef(trimmed)
      const createdAt = sessionId ? parseTimestampFromUuidLikeId(sessionId) : null
      return sessionId && createdAt ? buildSessionResourceId(sessionId, createdAt) : trimmed
    }
    if (!trimmed.startsWith('20')) {
      return null
    }
    return trimmed
  }

  const createdAt = parseTimestampFromUuidLikeId(trimmed)
  if (!createdAt) {
    return null
  }
  return buildSessionResourceId(trimmed, createdAt)
}

function extractResourceLocalId(resourceId: string): string {
  const sessionId = extractSessionIdFromSessionRef(resourceId)
  if (sessionId) {
    return sessionId
  }
  const hashIndex = resourceId.lastIndexOf('#')
  if (hashIndex >= 0) {
    return decodeURIComponent(resourceId.slice(hashIndex + 1))
  }
  const fileMatch = resourceId.match(/\/?([^/#?]+)\.ttl(?:$|[?#])/)
  if (fileMatch?.[1]) {
    return decodeURIComponent(fileMatch[1])
  }
  return resourceId
}

function parseTimestampFromUuidLikeId(id: string): Date | null {
  const fragmentId = extractResourceLocalId(id)
  const prefix = fragmentId.replace(/-/g, '').slice(0, 12)
  if (!/^[\da-f]{12}$/i.test(prefix)) {
    return null
  }
  const millis = Number.parseInt(prefix, 16)
  if (!Number.isFinite(millis) || millis <= 0) {
    return null
  }
  const date = new Date(millis)
  return Number.isNaN(date.getTime()) ? null : date
}

async function buildPodSessionSnapshot(
  context: DefaultPodSessionContext,
  row: SessionRow,
): Promise<LinxPiPodSessionSnapshot | null> {
  if (!row.id || row.tool !== 'linx') {
    return null
  }
  if (row.ownerWebId && row.ownerWebId !== context.webId) {
    return null
  }

  const metadata = isRecord(row.metadata) ? row.metadata : {}
  const sessionId = extractResourceLocalId(row.id)
  const sessionCwd = typeof metadata.cwd === 'string' ? metadata.cwd : undefined
  const messages = await listPodSessionMessages(context, row)
  return {
    id: sessionId,
    cwd: sessionCwd,
    createdAt: normalizeUnknownDate(row.createdAt),
    updatedAt: normalizeUnknownDate(row.updatedAt),
    sessionFile: typeof metadata.sessionFile === 'string' ? metadata.sessionFile : undefined,
    messages,
  }
}

async function listPodSessionMessages(
  context: DefaultPodSessionContext,
  session: SessionRow,
): Promise<LinxPiPodMessageSnapshot[]> {
  if (!session.thread) {
    return []
  }

  const metadata = isRecord(session.metadata) ? session.metadata : {}
  const rowMessageResources = Array.isArray((session as { messageResources?: unknown }).messageResources)
    ? (session as { messageResources: unknown[] }).messageResources
    : []
  const metadataMessageResources = Array.isArray(metadata.messageResources)
    ? metadata.messageResources
    : []
  const messageResources = [...rowMessageResources, ...metadataMessageResources]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  if (messageResources.length > 0) {
    const rows = await Promise.all(messageResources.map(async (resource) => {
      return /^https?:\/\//.test(resource)
        ? await context.db.findByIri(messageResource, resource) as MessageRow | null
        : await context.db.findById(messageResource, resource) as MessageRow | null
    }))
    const messages = rows
      .filter((message: MessageRow | null): message is MessageRow => {
        if (!message?.id) {
          return false
        }
        // Exact resource reads may not hydrate inverse thread links. The
        // session-owned messageResources list is already the authoritative
        // pointer set, so only reject rows that explicitly point elsewhere.
        return !message.thread || message.thread === session.thread
      })
      .map(podMessageRowToSnapshot)
      .filter((message: LinxPiPodMessageSnapshot): message is LinxPiPodMessageSnapshot => Boolean(message.id))
      .sort(compareMessageSnapshots)
    if (messages.length > 0) {
      return messages
    }

    return []
  }

  const threadColumn = (messageResource as any).thread
  const rows = await context.db.select()
    .from(messageResource)
    .where(eq(threadColumn, session.thread))
    .orderBy('createdAt', 'asc')
    .execute() as MessageRow[]

  return rows
    .filter((message) => {
      if (!message.id || message.thread !== session.thread) {
        return false
      }
      return extractResourceLocalId(message.id).startsWith(`${extractResourceLocalId(session.id)}-`)
    })
    .map(podMessageRowToSnapshot)
    .filter((message: LinxPiPodMessageSnapshot): message is LinxPiPodMessageSnapshot => Boolean(message.id))
    .sort(compareMessageSnapshots)
}

function podMessageRowToSnapshot(message: MessageRow): LinxPiPodMessageSnapshot {
  return {
    id: extractResourceLocalId(message.id),
    role: message.role,
    content: message.content,
    richContent: message.richContent,
    createdAt: normalizeUnknownDate(message.createdAt),
    updatedAt: normalizeUnknownDate(message.updatedAt),
  }
}

function compareMessageSnapshots(
  a: LinxPiPodMessageSnapshot,
  b: LinxPiPodMessageSnapshot,
): number {
  const aTime = toDate(a.createdAt)?.getTime() ?? 0
  const bTime = toDate(b.createdAt)?.getTime() ?? 0
  return aTime - bTime
}

function normalizeUnknownDate(value: unknown): Date | string | number | undefined {
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number') {
    return value
  }
  return undefined
}

function getPodBaseUrl(webId: string): string {
  return webId.replace('/profile/card#me', '').replace(/\/$/, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
