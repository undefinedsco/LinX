import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  createSymphonyIdeaUri,
  createRunPlan,
  formatSymphonyDeliverySummary,
  formatSymphonyIssueSummary,
  formatSymphonySessionSummary,
  getSymphonyArchiveKey,
  getSymphonyArchiveRelativePaths,
  SYMPHONY_HOME_DIRNAME,
  type CreateSymphonyRunPlanInput,
  type SymphonyDeliveryRecord,
  type SymphonyDeliveryStatus,
  type SymphonyIdeaCommitment,
  type SymphonyIdeaRecord,
  type SymphonyIdeaStatus,
  type SymphonyIssueRecord,
  type SymphonyIssueStatus,
  type SymphonyRunPlan,
  type SymphonySessionRecord,
  type SymphonySessionStatus,
  type SymphonyTaskRecord,
  type SymphonyTaskStatus,
} from '@linx/agent-runtime/symphony'
import { LINX_HOME_DIRNAME } from '@undefineds.co/models/client'

type SymphonyKind = 'idea' | 'issue' | 'task' | 'delivery' | 'session'

interface SymphonyRecordMap {
  idea: SymphonyIdeaRecord
  issue: SymphonyIssueRecord
  task: SymphonyTaskRecord
  delivery: SymphonyDeliveryRecord
  session: SymphonySessionRecord
}

export interface SymphonyIssueTriageDecision {
  action: 'create' | 'update'
  confidence: 'low' | 'medium' | 'high'
  issue?: SymphonyIssueRecord
  reason: string
  score: number
}

export interface SymphonyIssueTriageOptions {
  objective: string
  chat?: string
  thread?: string
  workspacePath?: string
  issues?: SymphonyIssueRecord[]
  now?: Date
}

export interface CaptureSymphonyIdeaInput {
  input: string
  summary?: string
  chat?: string
  thread?: string
  messages?: string[]
  affectedArea?: string
  currentUnderstanding?: string
  openQuestions?: string[]
  relatedRecords?: string[]
  conflicts?: string[]
  nextStep?: string
  status?: SymphonyIdeaStatus
  commitment?: SymphonyIdeaCommitment
  now?: Date
  randomId?: string
}

export function getSymphonyHome(): string {
  return join(homedir(), LINX_HOME_DIRNAME, SYMPHONY_HOME_DIRNAME)
}

export function createArchivedSymphonyRunPlan(input: CreateSymphonyRunPlanInput): SymphonyRunPlan {
  const plan = createSymphonyRunPlanDraft(input)
  writeSymphonyRunPlan(plan)
  return plan
}

export function createSymphonyRunPlanDraft(input: CreateSymphonyRunPlanInput): SymphonyRunPlan {
  const triage = triageSymphonyIssue({
    objective: input.objective,
    chat: input.chat,
    thread: input.thread,
    workspacePath: input.workspacePath,
  })
  const plan = createRunPlan(input)
  const archivedPlan = triage.action === 'update' && triage.issue
    ? attachSymphonyRunPlanToIssue(plan, triage.issue)
    : plan
  return archivedPlan
}

export function triageSymphonyIssue(options: SymphonyIssueTriageOptions): SymphonyIssueTriageDecision {
  const objective = normalizeTriageText(options.objective)
  if (!objective) {
    return { action: 'create', confidence: 'low', reason: 'missing objective', score: 0 }
  }

  const issues = options.issues ?? listSymphonyIssues()
  const candidates = issues
    .filter((issue) => !isClosedSymphonyIssue(issue))
    .map((issue) => ({
      issue,
      ...scoreSymphonyIssueMatch(issue, {
        objective,
        chat: normalizeTriageText(options.chat),
        thread: normalizeTriageText(options.thread),
        workspacePath: normalizeTriageText(options.workspacePath),
      }),
    }))
    .sort((left, right) => right.score - left.score)

  const best = candidates[0]
  if (!best || best.score < 0.72) {
    const ambiguousIssue = best && best.score >= 0.45 ? best.issue : undefined
    return {
      action: 'create',
      confidence: best && best.score >= 0.45 ? 'medium' : 'low',
      ...(ambiguousIssue ? { issue: ambiguousIssue } : {}),
      reason: best ? `best existing issue below merge threshold: ${best.reason}` : 'no open issues',
      score: best?.score ?? 0,
    }
  }

  return {
    action: 'update',
    confidence: best.score >= 0.9 ? 'high' : 'medium',
    issue: best.issue,
    reason: best.reason,
    score: best.score,
  }
}

export function attachSymphonyRunPlanToIssue(plan: SymphonyRunPlan, issue: SymphonyIssueRecord): SymphonyRunPlan {
  const taskUris = plan.workers.map((worker) => worker.task)
  const deliveryUris = plan.workers.map((worker) => worker.delivery.uri)
  const sessionUris = plan.workers.map((worker) => worker.session.uri)
  const now = plan.issue.updatedAt
  const mergedIssue: SymphonyIssueRecord = {
    ...issue,
    status: issue.status === 'resolved' || issue.status === 'closed' ? 'open' : issue.status,
    tasks: uniqueStrings([...issue.tasks, ...taskUris]),
    deliveries: uniqueStrings([...issue.deliveries, ...deliveryUris]),
    sessions: uniqueStrings([...issue.sessions, ...sessionUris]),
    updatedAt: now,
    ...(plan.issue.chat && !issue.chat ? { chat: plan.issue.chat } : {}),
    ...(plan.issue.thread && !issue.thread ? { thread: plan.issue.thread } : {}),
    ...(plan.issue.messages?.length && !issue.messages?.length ? { messages: plan.issue.messages } : {}),
  }
  const workers = plan.workers.map((worker) => ({
    task: worker.task,
    taskRecord: {
      ...worker.taskRecord,
      issue: mergedIssue.uri,
      chat: worker.taskRecord.chat ?? mergedIssue.chat,
      thread: worker.taskRecord.thread ?? mergedIssue.thread,
      messages: worker.taskRecord.messages ?? mergedIssue.messages,
    },
    delivery: {
      ...worker.delivery,
      issue: mergedIssue.uri,
      projection: {
        ...worker.delivery.projection,
        prompt: worker.delivery.projection.prompt.replaceAll(plan.issue.uri, mergedIssue.uri),
      },
      chat: worker.delivery.chat ?? mergedIssue.chat,
      thread: worker.delivery.thread ?? mergedIssue.thread,
      messages: worker.delivery.messages ?? mergedIssue.messages,
    },
    session: {
      ...worker.session,
      issue: mergedIssue.uri,
      chat: worker.session.chat ?? mergedIssue.chat,
      thread: worker.session.thread ?? mergedIssue.thread,
      messages: worker.session.messages ?? mergedIssue.messages,
    },
  }))
  const primary = workers[0]!
  return {
    issue: mergedIssue,
    task: primary.task,
    taskRecord: primary.taskRecord,
    delivery: primary.delivery,
    session: primary.session,
    workers,
  }
}

export function createNewArchivedSymphonyRunPlan(input: CreateSymphonyRunPlanInput): SymphonyRunPlan {
  const plan = createRunPlan(input)
  writeSymphonyIssue(plan.issue)
  for (const worker of plan.workers) {
    writeSymphonyTask(worker.taskRecord)
    writeSymphonyDelivery(worker.delivery)
    writeSymphonySession(worker.session)
  }
  return plan
}

export function createSymphonyIdeaRecord(input: CaptureSymphonyIdeaInput): SymphonyIdeaRecord {
  const now = input.now ?? new Date()
  const timestamp = now.toISOString()
  const text = normalizeIdeaText(input.input)
  if (!text) {
    throw new Error('Missing Symphony idea input')
  }

  const messages = (input.messages ?? [])
    .map((item) => normalizeIdeaText(item))
    .filter((item): item is string => Boolean(item))
  const record: SymphonyIdeaRecord = {
    uri: createSymphonyIdeaUri({ now, randomId: input.randomId }),
    summary: normalizeIdeaText(input.summary) ?? summarizeIdeaInput(text),
    input: text,
    status: input.status ?? 'captured',
    commitment: input.commitment ?? 'thought',
    source: 'cli',
    ...(normalizeIdeaText(input.affectedArea) ? { affectedArea: normalizeIdeaText(input.affectedArea) } : {}),
    ...(normalizeIdeaText(input.currentUnderstanding) ? { currentUnderstanding: normalizeIdeaText(input.currentUnderstanding) } : {}),
    openQuestions: normalizeIdeaTextList(input.openQuestions),
    relatedRecords: normalizeIdeaTextList(input.relatedRecords),
    conflicts: normalizeIdeaTextList(input.conflicts),
    ...(normalizeIdeaText(input.nextStep) ? { nextStep: normalizeIdeaText(input.nextStep) } : {}),
    ...(normalizeIdeaText(input.chat) ? { chat: normalizeIdeaText(input.chat) } : {}),
    ...(normalizeIdeaText(input.thread) ? { thread: normalizeIdeaText(input.thread) } : {}),
    ...(messages.length > 0 ? { messages } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  return record
}

export function captureSymphonyIdea(input: CaptureSymphonyIdeaInput): SymphonyIdeaRecord {
  const record = createSymphonyIdeaRecord(input)
  writeSymphonyIdea(record)
  return record
}

export function writeSymphonyIdea(record: SymphonyIdeaRecord): void {
  writeSymphonyRecord('idea', record.uri, record)
}

export function writeSymphonyIssue(record: SymphonyIssueRecord): void {
  writeSymphonyRecord('issue', record.uri, record)
}

export function writeSymphonyTask(record: SymphonyTaskRecord): void {
  writeSymphonyRecord('task', record.uri, record)
}

export function writeSymphonyDelivery(record: SymphonyDeliveryRecord): void {
  writeSymphonyRecord('delivery', record.uri, record)
}

export function writeSymphonySession(record: SymphonySessionRecord): void {
  writeSymphonyRecord('session', record.uri, record)
}

export function writeSymphonyRunPlan(plan: SymphonyRunPlan): SymphonyRunPlan {
  writeSymphonyIssue(plan.issue)
  for (const worker of plan.workers.length > 0 ? plan.workers : [{ task: plan.task, taskRecord: plan.taskRecord, delivery: plan.delivery, session: plan.session }]) {
    if (worker.taskRecord) {
      writeSymphonyTask(worker.taskRecord)
    }
    writeSymphonyDelivery(worker.delivery)
    writeSymphonySession(worker.session)
  }
  return plan
}

export function updateSymphonyIssueStatus(
  record: SymphonyIssueRecord,
  status: SymphonyIssueStatus,
  updates: { error?: string; closedAt?: string } = {},
): SymphonyIssueRecord {
  const next = withSymphonyIssueStatus(record, status, updates)
  writeSymphonyIssue(next)
  return next
}

export function withSymphonyIssueStatus(
  record: SymphonyIssueRecord,
  status: SymphonyIssueStatus,
  updates: { error?: string; closedAt?: string } = {},
): SymphonyIssueRecord {
  const now = new Date().toISOString()
  return {
    ...record,
    status,
    updatedAt: now,
    ...(updates.error ? { error: updates.error } : {}),
    ...((updates.closedAt || status === 'resolved' || status === 'closed') ? { closedAt: updates.closedAt ?? now } : {}),
  }
}

export function updateSymphonyIdeaStatus(
  record: SymphonyIdeaRecord,
  status: SymphonyIdeaStatus,
  updates: {
    commitment?: SymphonyIdeaCommitment
    currentUnderstanding?: string
    openQuestions?: string[]
    relatedRecords?: string[]
    conflicts?: string[]
    nextStep?: string
    promotedTo?: string
  } = {},
): SymphonyIdeaRecord {
  const next = withSymphonyIdeaStatus(record, status, updates)
  writeSymphonyIdea(next)
  return next
}

export function withSymphonyIdeaStatus(
  record: SymphonyIdeaRecord,
  status: SymphonyIdeaStatus,
  updates: {
    commitment?: SymphonyIdeaCommitment
    currentUnderstanding?: string
    openQuestions?: string[]
    relatedRecords?: string[]
    conflicts?: string[]
    nextStep?: string
    promotedTo?: string
  } = {},
): SymphonyIdeaRecord {
  const now = new Date().toISOString()
  return {
    ...record,
    status,
    ...(updates.commitment ? { commitment: updates.commitment } : {}),
    ...(normalizeIdeaText(updates.currentUnderstanding) ? { currentUnderstanding: normalizeIdeaText(updates.currentUnderstanding) } : {}),
    ...(updates.openQuestions ? { openQuestions: normalizeIdeaTextList(updates.openQuestions) } : {}),
    ...(updates.relatedRecords ? { relatedRecords: normalizeIdeaTextList(updates.relatedRecords) } : {}),
    ...(updates.conflicts ? { conflicts: normalizeIdeaTextList(updates.conflicts) } : {}),
    ...(normalizeIdeaText(updates.nextStep) ? { nextStep: normalizeIdeaText(updates.nextStep) } : {}),
    ...(normalizeIdeaText(updates.promotedTo) ? { promotedTo: normalizeIdeaText(updates.promotedTo) } : {}),
    updatedAt: now,
  }
}

export function updateSymphonyTaskStatus(
  record: SymphonyTaskRecord,
  status: SymphonyTaskStatus,
  updates: { error?: string; completedAt?: string } = {},
): SymphonyTaskRecord {
  const next = withSymphonyTaskStatus(record, status, updates)
  writeSymphonyTask(next)
  return next
}

export function withSymphonyTaskStatus(
  record: SymphonyTaskRecord,
  status: SymphonyTaskStatus,
  updates: { error?: string; completedAt?: string } = {},
): SymphonyTaskRecord {
  const now = new Date().toISOString()
  return {
    ...record,
    status,
    updatedAt: now,
    ...(updates.error ? { error: updates.error } : {}),
    ...((updates.completedAt || status === 'completed' || status === 'failed') ? { completedAt: updates.completedAt ?? now } : {}),
  }
}

export function updateSymphonyDeliveryStatus(
  record: SymphonyDeliveryRecord,
  status: SymphonyDeliveryStatus,
  updates: { error?: string; autoModeSessionId?: string; completedAt?: string } = {},
): SymphonyDeliveryRecord {
  const next = withSymphonyDeliveryStatus(record, status, updates)
  writeSymphonyDelivery(next)
  return next
}

export function withSymphonyDeliveryStatus(
  record: SymphonyDeliveryRecord,
  status: SymphonyDeliveryStatus,
  updates: { error?: string; autoModeSessionId?: string; completedAt?: string } = {},
): SymphonyDeliveryRecord {
  const now = new Date().toISOString()
  return {
    ...record,
    status,
    updatedAt: now,
    ...(updates.autoModeSessionId ? { autoModeSessionId: updates.autoModeSessionId } : {}),
    ...(updates.error ? { error: updates.error } : {}),
    ...((updates.completedAt || status === 'completed' || status === 'failed') ? { completedAt: updates.completedAt ?? now } : {}),
  }
}

export function updateSymphonySessionStatus(
  record: SymphonySessionRecord,
  status: SymphonySessionStatus,
  updates: {
    error?: string
    autoModeSessionId?: string
    exitCode?: number | null
    dryRun?: boolean
    completedAt?: string
  } = {},
): SymphonySessionRecord {
  const next = withSymphonySessionStatus(record, status, updates)
  writeSymphonySession(next)
  return next
}

export function withSymphonySessionStatus(
  record: SymphonySessionRecord,
  status: SymphonySessionStatus,
  updates: {
    error?: string
    autoModeSessionId?: string
    exitCode?: number | null
    dryRun?: boolean
    completedAt?: string
  } = {},
): SymphonySessionRecord {
  const now = new Date().toISOString()
  return {
    ...record,
    status,
    updatedAt: now,
    ...(updates.autoModeSessionId ? { autoModeSessionId: updates.autoModeSessionId } : {}),
    ...(updates.exitCode !== undefined ? { exitCode: updates.exitCode } : {}),
    ...(updates.dryRun !== undefined ? { dryRun: updates.dryRun } : {}),
    ...(updates.error ? { error: updates.error } : {}),
    ...((updates.completedAt || status === 'completed' || status === 'failed') ? { completedAt: updates.completedAt ?? now } : {}),
  }
}

export function listSymphonyIdeas(): SymphonyIdeaRecord[] {
  return listSymphonyRecords('idea')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function listSymphonyIssues(): SymphonyIssueRecord[] {
  return listSymphonyRecords('issue')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function listSymphonyTasks(): SymphonyTaskRecord[] {
  return listSymphonyRecords('task')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function listSymphonyDeliveries(): SymphonyDeliveryRecord[] {
  return listSymphonyRecords('delivery')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function listSymphonySessions(): SymphonySessionRecord[] {
  return listSymphonyRecords('session')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function loadSymphonyIdea(uriOrKey: string): SymphonyIdeaRecord | null {
  return loadSymphonyRecord('idea', uriOrKey)
}

export function loadSymphonyIssue(uriOrKey: string): SymphonyIssueRecord | null {
  return loadSymphonyRecord('issue', uriOrKey)
}

export function loadSymphonyTask(uriOrKey: string): SymphonyTaskRecord | null {
  return loadSymphonyRecord('task', uriOrKey)
}

export function loadSymphonyDelivery(uriOrKey: string): SymphonyDeliveryRecord | null {
  return loadSymphonyRecord('delivery', uriOrKey)
}

export function loadSymphonySession(uriOrKey: string): SymphonySessionRecord | null {
  return loadSymphonyRecord('session', uriOrKey)
}

export function resolveSymphonyRecord(uriOrKey: string): {
  kind: SymphonyKind
  record: SymphonyIdeaRecord | SymphonyIssueRecord | SymphonyTaskRecord | SymphonyDeliveryRecord | SymphonySessionRecord
} | null {
  const idea = loadSymphonyIdea(uriOrKey)
  if (idea) {
    return { kind: 'idea', record: idea }
  }

  const issue = loadSymphonyIssue(uriOrKey)
  if (issue) {
    return { kind: 'issue', record: issue }
  }

  const task = loadSymphonyTask(uriOrKey)
  if (task) {
    return { kind: 'task', record: task }
  }

  const delivery = loadSymphonyDelivery(uriOrKey)
  if (delivery) {
    return { kind: 'delivery', record: delivery }
  }

  const session = loadSymphonySession(uriOrKey)
  if (session) {
    return { kind: 'session', record: session }
  }

  return null
}

export function formatSymphonyRecordSummary(
  kind: SymphonyKind,
  record: SymphonyIdeaRecord | SymphonyIssueRecord | SymphonyTaskRecord | SymphonyDeliveryRecord | SymphonySessionRecord,
): string {
  if (kind === 'idea') {
    const idea = record as SymphonyIdeaRecord
    return `${getSymphonyArchiveKey(idea.uri)} ${idea.status}/${idea.commitment} ${idea.summary}`
  }
  if (kind === 'issue') {
    return formatSymphonyIssueSummary(record as SymphonyIssueRecord)
  }
  if (kind === 'task') {
    const task = record as SymphonyTaskRecord
    const suffix = task.agent ? ` -> ${task.agent}` : ''
    return `${getSymphonyArchiveKey(task.uri)} ${task.status} ${task.title}${suffix}`
  }
  if (kind === 'delivery') {
    return formatSymphonyDeliverySummary(record as SymphonyDeliveryRecord)
  }
  return formatSymphonySessionSummary(record as SymphonySessionRecord)
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

function kindRoot(kind: SymphonyKind): string {
  const paths = getSymphonyArchiveRelativePaths('urn:undefineds:linx:placeholder:placeholder', kind)
  const dirName = paths.dir.split('/')[0]
  return join(getSymphonyHome(), dirName)
}

function recordDir(kind: SymphonyKind, uri: string): string {
  const paths = getSymphonyArchiveRelativePaths(uri, kind)
  const dir = join(getSymphonyHome(), paths.dir)
  ensureDir(dir)
  return dir
}

function recordFile(kind: SymphonyKind, uri: string): string {
  const paths = getSymphonyArchiveRelativePaths(uri, kind)
  return join(getSymphonyHome(), paths.file)
}

function scoreSymphonyIssueMatch(issue: SymphonyIssueRecord, input: {
  objective: string
  chat?: string
  thread?: string
  workspacePath?: string
}): { score: number; reason: string } {
  const issueText = normalizeTriageText(`${issue.title} ${issue.description ?? ''}`)
  const textScore = jaccardScore(tokenizeTriageText(input.objective), tokenizeTriageText(issueText))
  const exactSubstring = issueText.includes(input.objective) || input.objective.includes(issueText)
  const chatScore = input.chat && issue.chat === input.chat ? 0.18 : 0
  const threadScore = input.thread && issue.thread === input.thread ? 0.12 : 0
  const statusScore = issue.status === 'open' || issue.status === 'triaging' || issue.status === 'in_progress' ? 0.08 : 0
  const score = Math.min(1, (exactSubstring ? 0.86 : textScore) + chatScore + threadScore + statusScore)
  const reason = [
    `text=${textScore.toFixed(2)}`,
    exactSubstring ? 'substring' : undefined,
    chatScore ? 'same chat' : undefined,
    threadScore ? 'same thread' : undefined,
    statusScore ? `status=${issue.status}` : undefined,
  ].filter(Boolean).join(', ')
  return { score, reason: reason || 'no match signals' }
}

function isClosedSymphonyIssue(issue: SymphonyIssueRecord): boolean {
  return issue.status === 'resolved' || issue.status === 'closed'
}

function normalizeTriageText(value: string | undefined | null): string {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/\s+/gu, ' ').trim()
    : ''
}

function tokenizeTriageText(value: string): Set<string> {
  const tokens = new Set<string>()
  for (const token of value.match(/[\p{Letter}\p{Number}_-]+/gu) ?? []) {
    const normalized = token.toLowerCase()
    if (normalized.length >= 2) {
      tokens.add(normalized)
    }
  }
  for (const char of value.match(/[\p{Script=Han}]/gu) ?? []) {
    tokens.add(char)
  }
  return tokens
}

function jaccardScore(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0
  }

  let intersection = 0
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1
    }
  }
  const union = new Set([...left, ...right]).size
  return union > 0 ? intersection / union : 0
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function summarizeIdeaInput(input: string): string {
  const compact = input.replace(/\s+/gu, ' ').trim()
  return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact
}

function normalizeIdeaText(value: string | undefined | null): string | undefined {
  const normalized = typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : ''
  return normalized || undefined
}

function normalizeIdeaTextList(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((item) => normalizeIdeaText(item))
    .filter((item): item is string => Boolean(item))
}

function writeSymphonyRecord<K extends SymphonyKind>(kind: K, uri: string, record: SymphonyRecordMap[K]): void {
  // Runtime JSON is portable/offline cache only. LinX product facts belong in
  // modeled Pod TTL resources; local durable mirrors should be RDF/JSON-LD.
  recordDir(kind, uri)
  writeFileSync(recordFile(kind, uri), `${JSON.stringify(record, null, 2)}\n`)
}

function readSymphonyRecordFromDirectory<K extends SymphonyKind>(kind: K, uriOrKey: string): SymphonyRecordMap[K] | null {
  try {
    const raw = readFileSync(recordFile(kind, uriOrKey), 'utf-8')
    return JSON.parse(raw) as SymphonyRecordMap[K]
  } catch {
    return null
  }
}

function listSymphonyRecords<K extends SymphonyKind>(kind: K): SymphonyRecordMap[K][] {
  const root = kindRoot(kind)
  if (!existsSync(root)) {
    return []
  }
  return readdirSync(root)
    .map((name) => readSymphonyRecordFromDirectory(kind, name))
    .filter((item): item is SymphonyRecordMap[K] => item !== null)
}

function loadSymphonyRecord<K extends SymphonyKind>(kind: K, uriOrKey: string): SymphonyRecordMap[K] | null {
  const normalized = uriOrKey.trim()
  if (!normalized) {
    return null
  }

  const direct = readSymphonyRecordFromDirectory(kind, normalized)
  if (direct) {
    return direct
  }

  const exact = listSymphonyRecords(kind).filter((record) => record.uri === normalized || getSymphonyArchiveKey(record.uri) === normalized)
  if (exact.length === 1) {
    return exact[0]
  }

  const prefix = listSymphonyRecords(kind).filter((record) => getSymphonyArchiveKey(record.uri).startsWith(normalized))
  if (prefix.length === 1) {
    return prefix[0]
  }

  return null
}
