import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import {
  CURRENT_SESSION_VERSION,
  SessionManager,
  type SessionEntry,
  type SessionInfo,
} from '@mariozechner/pi-coding-agent'
import { getDefaultPodDataSession } from '../pod-data-session.js'
import { PI_CHAT_ID, buildChatUri, buildThreadUri } from './pod-mirror-mapping.js'
import {
  DCT_CREATED,
  DCT_MODIFIED,
  SIOC_CONTENT,
  SIOC_RICH_CONTENT,
  UDFS_ACTOR,
  UDFS_CONVERSATION,
  UDFS_IN_THREAD,
  UDFS_METADATA,
  UDFS_SESSION_TOOL,
  buildChatIndexResourceUrl,
  buildMessageResourceUrl,
  firstIri,
  firstLiteral,
  listTurtleResources,
  listTurtleResourcesRecursive,
  parseManagedTurtleBlocks,
  podBaseUrlFromWebId,
  readTurtleResource,
  type PodFetch,
  type TurtleObject,
} from './pod-native.js'

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

export function createNativeLinxPiPodSessionSource(context: {
  webId: string
  fetch: PodFetch
}): LinxPiPodSessionSource {
  const source: LinxPiPodSessionSource = {
    async listSessions(cwd?: string): Promise<LinxPiPodSessionSnapshot[]> {
      return listPodSessionSnapshots(context, cwd)
    },
    async findSession(input: string, cwd?: string): Promise<LinxPiPodSessionSnapshot | null> {
      const sessions = await source.listSessions(cwd)
      const exact = sessions.find((session: LinxPiPodSessionSnapshot) => session.id === input)
      if (exact) {
        return exact
      }
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

function getDefaultLinxPiSessionDir(cwd: string, agentDir: string): string {
  const safePath = `--${cwd.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`
  return join(agentDir, 'sessions', safePath)
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
  const snapshots = await resolvedSource.listSessions(cwd).catch(() => [])
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

  const snapshot = await resolvedSource.findSession(input, cwd).catch(() => null)
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
  return createDefaultLinxPiPodSessionSource().catch(() => null)
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
  fetch: PodFetch
}

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
    fetch: session.fetch,
  }
}

async function listPodSessionSnapshots(
  context: DefaultPodSessionContext,
  cwd?: string,
): Promise<LinxPiPodSessionSnapshot[]> {
  const podBaseUrl = podBaseUrlFromWebId(context.webId)
  const [currentSessionUrls, legacySessionUrls] = await Promise.all([
    listTurtleResourcesRecursive(context.fetch, `${podBaseUrl}/.data/sessions/`).catch(() => []),
    listTurtleResources(context.fetch, `${podBaseUrl}/.data/session/`).catch(() => []),
  ])
  const sessionUrls = [...new Set([...currentSessionUrls, ...legacySessionUrls])]
  const snapshots = (await mapWithConcurrency(sessionUrls, 6, (sessionUrl) => (
    readPodSessionSnapshot(context, sessionUrl, { expectedCwd: cwd }).catch(() => null)
  )))
    .filter((snapshot): snapshot is LinxPiPodSessionSnapshot => snapshot !== null)

  return snapshots.sort((a, b) => {
    const aTime = toDate(a.updatedAt)?.getTime() ?? 0
    const bTime = toDate(b.updatedAt)?.getTime() ?? 0
    return bTime - aTime
  })
}

async function readPodSessionSnapshot(
  context: DefaultPodSessionContext,
  sessionUrl: string,
  options: { expectedCwd?: string } = {},
): Promise<LinxPiPodSessionSnapshot | null> {
  const turtle = await readTurtleResource(context.fetch, sessionUrl)
  if (!turtle) {
    return null
  }
  const blocks = parseManagedTurtleBlocks(turtle, sessionUrl)
  const blockEntries = [...blocks.entries()]
  const blockEntry = blockEntries.find(([subject]) => subject === sessionUrl)
    ?? blockEntries.find(([, entry]) => firstLiteral(entry, UDFS_SESSION_TOOL) === 'linx')
  const subjectUrl = blockEntry?.[0] ?? sessionUrl
  const predicates = blockEntry?.[1]
  if (!(predicates instanceof Map)) {
    return null
  }
  if (firstLiteral(predicates, UDFS_SESSION_TOOL) !== 'linx') {
    return null
  }
  const chatUri = firstIri(predicates, UDFS_CONVERSATION)
  const legacyChatId = firstLiteral(predicates, UDFS_CONVERSATION)
  if (chatUri && chatUri !== buildChatUri(context.webId)) {
    return null
  }
  if (!chatUri && legacyChatId !== PI_CHAT_ID) {
    return null
  }
  const ownerWebId = firstIri(predicates, UDFS_ACTOR)
  if (ownerWebId && ownerWebId !== context.webId) {
    return null
  }

  const id = decodeURIComponent(subjectUrl.includes('#')
    ? subjectUrl.split('#').pop() ?? ''
    : sessionUrl.split('/').pop()?.replace(/\.ttl$/, '') ?? '')
  if (!id) {
    return null
  }
  const metadata = parseMetadataPredicates(predicates)
  const sessionCwd = typeof metadata.cwd === 'string' ? metadata.cwd : undefined
  if (options.expectedCwd && sessionCwd !== options.expectedCwd) {
    return null
  }
  const storedThreadUri = firstIri(predicates, UDFS_IN_THREAD)
  const legacyThreadId = firstLiteral(predicates, UDFS_IN_THREAD)
  const threadUri = storedThreadUri
    ?? (typeof metadata.threadUri === 'string'
      ? metadata.threadUri
      : buildThreadUri(context.webId, PI_CHAT_ID, legacyThreadId ?? id))
  const messages = await listPodSessionMessages(context, id, threadUri, metadata.messageResources)
  return {
    id,
    cwd: sessionCwd,
    createdAt: normalizeUnknownDate(firstLiteral(predicates, DCT_CREATED)),
    updatedAt: normalizeUnknownDate(firstLiteral(predicates, DCT_MODIFIED)),
    sessionFile: typeof metadata.sessionFile === 'string' ? metadata.sessionFile : undefined,
    messages,
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, concurrency), items.length)
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index])
    }
  }))
  return results
}

async function listPodSessionMessages(
  context: DefaultPodSessionContext,
  sessionId: string,
  threadUri: unknown,
  messageResources: unknown,
): Promise<LinxPiPodMessageSnapshot[]> {
  const resolvedThreadUri = typeof threadUri === 'string' && threadUri
    ? threadUri
    : buildThreadUri(context.webId, PI_CHAT_ID, sessionId)
  const urls = normalizeMessageResourceUrls(messageResources)
  if (urls.length === 0) {
    urls.push(...await candidateMessageResourceUrls(context.fetch, context.webId))
  }
  const messages: LinxPiPodMessageSnapshot[] = []
  for (const url of urls) {
    const turtle = await readTurtleResource(context.fetch, url).catch(() => null)
    if (!turtle) {
      continue
    }
    for (const [subject, predicates] of parseManagedTurtleBlocks(turtle, url)) {
      if (!subject.includes(`${sessionId}-`)) {
        continue
      }
      const richContent = firstLiteral(predicates, SIOC_RICH_CONTENT)
      if (richContent) {
        const parsed = parsePodRichContent(richContent)
        const entry = parsed.entry
        if (entry?.id && !subject.endsWith(`${sessionId}-${entry.id}`)) {
          continue
        }
      }
      if (turtle.includes(`<${resolvedThreadUri}>`) || subject.includes(`${sessionId}-`)) {
        messages.push({
          id: decodeURIComponent(subject.split('#').pop() ?? subject),
          role: firstLiteral(predicates, 'https://undefineds.co/ns#messageType'),
          content: firstLiteral(predicates, SIOC_CONTENT),
          richContent,
          createdAt: normalizeUnknownDate(firstLiteral(predicates, DCT_CREATED)),
          updatedAt: normalizeUnknownDate(firstLiteral(predicates, DCT_MODIFIED)),
        })
      }
    }
  }

  return messages
    .filter((message) => message.id)
    .sort((a, b) => {
      const aTime = toDate(a.createdAt)?.getTime() ?? 0
      const bTime = toDate(b.createdAt)?.getTime() ?? 0
      return aTime - bTime
    })
}

function normalizeMessageResourceUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return [...new Set(value.filter((entry): entry is string => (
    typeof entry === 'string' && entry.startsWith('http') && entry.endsWith('.ttl')
  )))]
}

async function candidateMessageResourceUrls(fetcher: PodFetch, webId: string): Promise<string[]> {
  const chatBase = `${podBaseUrlFromWebId(webId)}/.data/chat/${PI_CHAT_ID}/`
  const discovered = new Set<string>()
  const yearContainers = await listChildContainers(fetcher, chatBase)
  for (const yearContainer of yearContainers) {
    const monthContainers = await listChildContainers(fetcher, yearContainer)
    for (const monthContainer of monthContainers) {
      const dayContainers = await listChildContainers(fetcher, monthContainer)
      for (const dayContainer of dayContainers) {
        discovered.add(new URL('messages.ttl', dayContainer).toString())
      }
    }
  }
  if (discovered.size === 0) {
    const now = new Date()
    discovered.add(buildMessageResourceUrl(webId, PI_CHAT_ID, now))
  }
  return [...discovered].sort()
}

async function listChildContainers(fetcher: PodFetch, containerUrl: string): Promise<string[]> {
  const response = await fetcher(containerUrl, {
    method: 'GET',
    headers: { Accept: 'text/turtle, application/ld+json;q=0.8, */*;q=0.1' },
  })
  if (response.status === 404) {
    return []
  }
  if (!response.ok) {
    return []
  }
  const text = await response.text()
  const urls = new Set<string>()
  const base = new URL(containerUrl)
  const relativeRegexp = /[<"]([^<>"']+\/)[>"]/g
  let match: RegExpExecArray | null
  while ((match = relativeRegexp.exec(text))) {
    urls.add(new URL(match[1], base).toString())
  }
  const absoluteRegexp = /(https?:\/\/[^<>"'\s)]+\/)/g
  for (const absolute of text.matchAll(absoluteRegexp)) {
    const url = absolute[1]
    if (url.startsWith(containerUrl) && url !== containerUrl) {
      urls.add(url)
    }
  }
  return [...urls].sort()
}

function normalizeUnknownDate(value: unknown): Date | string | number | undefined {
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number') {
    return value
  }
  return undefined
}

function parseJsonObject(value: string | undefined): Record<string, unknown> {
  if (!value) {
    return {}
  }
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseMetadataPredicates(predicates: Map<string, TurtleObject[]>): Record<string, unknown> {
  const values = predicates.get(UDFS_METADATA) ?? []
  const parsed = values
    .filter((entry): entry is Extract<TurtleObject, { type: 'literal' }> => entry.type === 'literal')
    .map((entry) => parseJsonObject(entry.value))
    .filter((entry) => Object.keys(entry).length > 0)
  for (let index = parsed.length - 1; index >= 0; index -= 1) {
    if (Array.isArray(parsed[index].messageResources)) {
      return parsed[index]
    }
  }
  return parsed[parsed.length - 1] ?? {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
