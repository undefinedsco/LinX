import type {
  SymphonyIssueRecord,
  SymphonyRuntimeEventType,
  SymphonyRuntimeDeliveryResult,
  SymphonyRunPlan,
  SymphonySessionRecord,
  SymphonyWorkerPlan,
  WorkerWorkspace,
} from '@linx/agent-runtime/symphony'
import {
  completeSymphonyWorkerRun,
  finalizeSymphonyRunPlanAfterWorkers,
  getSymphonyArchiveKey,
  normalizeSymphonyRuntimeDeliveryResult,
  parseSymphonyRuntimeDeliveryResult,
  recordSymphonyWorkerRuntimeEvent,
  startSymphonyWorkerRun,
} from '@linx/agent-runtime/symphony'
import { decideThreadControlEvent } from '@linx/agent-runtime/thread-reconciler-controller'
import {
  autoModeApprovalActionUri,
  autoModeApprovalRequestMessage,
  autoModeApprovalRisk,
  autoModeApprovalToolName,
  encodeAutoModeApprovalOptions,
  type AutoModeApprovalRequest,
  type AutoModeInteractionRequest,
  type AutoModeWorkerBackend,
} from '@linx/agent-runtime/auto-mode'
import {
  agentResource,
  approvalResource,
  chatResource,
  chatRepository,
  ContactClass,
  ContactType,
  contactResource,
  deliveryResource,
  evidenceResource,
  inboxNotificationResource,
  inputRequestResource,
  issueResource,
  messageResource,
  ReportKind,
  ReportOutcome,
  ReportStatus,
  reportResource,
  runResource,
  runStepResource,
  sessionResource,
  taskResource,
  threadResource,
  threadRepository,
  type ApprovalInsert,
  type ChatInsert,
  type ContactInsert,
  type DeliveryInsert,
  type EvidenceInsert,
  type InboxNotificationInsert,
  type InputRequestInsert,
  type IssueInsert,
  type MessageInsert,
  type ReportInsert,
  type RunInsert,
  type RunStepInsert,
  type SessionInsert,
  type SolidDatabase,
  type TaskInsert,
  type ThreadInsert,
} from '@undefineds.co/models'
import {
  insertExactRecordOnce,
  resolvePodResourceTemplateValue,
  type ExactRecordDatabase,
  upsertExactRecord,
} from '@undefineds.co/drizzle-solid'

export type SymphonyControlStage = 'planned' | 'running' | 'completed' | 'failed'

export interface BuildSymphonyControlRowsInput {
  plan: SymphonyRunPlan
  webId: string
  stage?: SymphonyControlStage
  stages?: SymphonyControlStage[]
}

export interface SymphonyControlRows {
  contacts: ContactInsert[]
  chats: ChatInsert[]
  threads: ThreadInsert[]
  messages: MessageInsert[]
  issue: IssueInsert
  issues: IssueInsert[]
  tasks: TaskInsert[]
  deliveries: DeliveryInsert[]
  sessions: SessionInsert[]
  runs: RunInsert[]
  runSteps: RunStepInsert[]
  evidence: EvidenceInsert[]
  reports: ReportInsert[]
}

export interface PersistSymphonyControlStateInput extends BuildSymphonyControlRowsInput {
  db: SolidDatabase & ExactRecordDatabase
}

export interface PersistSymphonyControlStateResult {
  plan: SymphonyRunPlan
  rows: SymphonyControlRows
}

export interface SymphonyRuntimeAdapterEvent {
  stepType: SymphonyRuntimeEventType
  message?: string
  payload?: Record<string, unknown>
  now?: Date
  randomId?: string
}

export interface SymphonyRuntimeAdapterResult {
  status?: 'completed' | 'failed'
  exitCode?: number
  autoModeSessionId?: string
  reportText?: string
  events?: SymphonyRuntimeAdapterEvent[]
}

export interface SymphonyRuntimeAdapter {
  run(input: {
    plan: SymphonyRunPlan
    worker: SymphonyWorkerPlan
    prompt: string
    signal?: AbortSignal
  }): Promise<SymphonyRuntimeAdapterResult>
}

export interface RunAndPersistSymphonyWorkerGoalPlanInput {
  db: SolidDatabase & ExactRecordDatabase
  webId: string
  plan: SymphonyRunPlan
  runtimeAdapter: SymphonyRuntimeAdapter
  now?: Date
  randomId?: string
  signal?: AbortSignal
}

export interface RunAndPersistSymphonyWorkerGoalPlanResult {
  plan: SymphonyRunPlan
  worker: SymphonyWorkerPlan
  status: 'completed' | 'failed'
  exitCode: number
  autoModeSessionId?: string
}

export interface ApplyAndPersistSymphonyWorkerRuntimeResultInput {
  db: SolidDatabase & ExactRecordDatabase
  webId: string
  plan: SymphonyRunPlan
  worker?: Worker
  result: SymphonyRuntimeAdapterResult | SymphonyRuntimeDeliveryResult
  now?: Date
  randomId?: string
}

export interface ApplyAndPersistSymphonyWorkerRuntimeResultResult {
  plan: SymphonyRunPlan
  worker: SymphonyWorkerPlan
  status: 'completed' | 'failed'
  exitCode: number
  autoModeSessionId?: string
}

export interface PersistSymphonyWorkerDeliveryInput {
  db: SolidDatabase & ExactRecordDatabase
  webId: string
  plan: SymphonyRunPlan
  worker?: Worker
  delivery: unknown
  now?: Date
  randomId?: string
}

export type PersistSymphonyWorkerDeliveryResult = ApplyAndPersistSymphonyWorkerRuntimeResultResult

export interface BuildSymphonyInteractionRequestRowsInput {
  plan: SymphonyRunPlan
  webId: string
  request: AutoModeInteractionRequest
  worker?: Worker
  now?: Date
  randomId?: string
  source?: 'codex-app-server' | 'codex-acp' | 'acp' | 'runtime' | (string & {})
  policyVersion?: string
}

export interface SymphonyInteractionRequestRows {
  approval?: ApprovalInsert
  inputRequest?: InputRequestInsert
  inboxNotification: InboxNotificationInsert
  runStep: RunStepInsert
}

export interface PersistSymphonyInteractionRequestInput extends BuildSymphonyInteractionRequestRowsInput {
  db: SolidDatabase & ExactRecordDatabase
}

export interface PersistSymphonyInteractionRequestResult {
  plan: SymphonyRunPlan
  rows: SymphonyInteractionRequestRows
}

export interface SymphonyControlWorkerStatus {
  status: string
  backend: string
  mode: string
  cwd?: string
  autoModeSessionId?: string
  target?: {
    label?: string
    agent?: string
    chat?: string
  }
}

export interface SymphonyControlReportStatus {
  status: string
  backend: string
  agent?: string
  title?: string
  summary?: string
  task?: string
  delivery?: string
  reportDelivery?: string
  run?: string
  chat?: string
  thread?: string
  autoModeSessionId?: string
  error?: string
  completedAt?: string
  updatedAt?: string
}

export const SYMPHONY_SECRETARY_AGENT_ID = '__secretary__'
export const SYMPHONY_CHAT_ID = 'symphony'
export const SYMPHONY_POLICY_VERSION = 'linx-symphony-session/v1'
export const SYMPHONY_WORKER_POD_ACCESS_POLICY_VERSION = 'linx-symphony-worker-pod-access/v1'
export const SYMPHONY_ARCHIVE_PROVENANCE_VERSION = 'linx-symphony-archive/v1'
export const SYMPHONY_RUNTIME_REQUEST_POLICY_VERSION = 'linx-symphony-runtime-request/v1'

type Worker = SymphonyRunPlan['workers'][number]
type SymphonyArchiveRefs = Partial<Record<'idea' | 'issue' | 'task' | 'delivery' | 'session', string>>

export async function persistSymphonyControlState(
  input: PersistSymphonyControlStateInput,
): Promise<PersistSymphonyControlStateResult> {
  const rows = buildSymphonyControlRows(input)

  await input.db.init([
    contactResource,
    chatResource,
    threadResource,
    messageResource,
    issueResource,
    taskResource,
    deliveryResource,
    sessionResource,
    runResource,
    runStepResource,
    evidenceResource,
    reportResource,
  ]).catch(() => undefined)

  for (const row of rows.contacts) {
    await upsertSymphonyContact(input.db, row)
  }
  for (const row of rows.chats) {
    await upsertSymphonyChat(input.db, row)
  }
  for (const row of rows.threads) {
    await upsertSymphonyThread(input.db, row)
  }
  for (const row of rows.messages) {
    await insertExactRecordOnce(input.db, messageResource, String(row.id), row as Record<string, unknown>)
  }
  for (const row of rows.issues) {
    await upsertSymphonyIssue(input.db, row)
  }
  for (const row of rows.tasks) {
    await upsertSymphonyTask(input.db, row)
  }
  for (const row of rows.deliveries) {
    await upsertSymphonyDelivery(input.db, row)
  }
  for (const row of rows.sessions) {
    await upsertSymphonySession(input.db, row)
  }
  for (const row of rows.runs) {
    await upsertSymphonyRun(input.db, row)
  }
  for (const row of rows.runSteps) {
    await insertExactRecordOnce(input.db, runStepResource, String(row.id), row as Record<string, unknown>)
  }
  for (const row of rows.evidence) {
    await insertExactRecordOnce(input.db, evidenceResource, String(row.id), row as Record<string, unknown>)
  }
  for (const row of rows.reports) {
    await upsertSymphonyReport(input.db, row)
  }

  return {
    plan: input.plan,
    rows,
  }
}

export async function runAndPersistSymphonyWorkerGoalPlan(
  input: RunAndPersistSymphonyWorkerGoalPlanInput,
): Promise<RunAndPersistSymphonyWorkerGoalPlanResult> {
  await persistSymphonyControlState({
    db: input.db,
    webId: input.webId,
    plan: input.plan,
    stage: 'planned',
  })

  let worker = startSymphonyWorkerRun({
    worker: input.plan.workers[0]!,
    now: input.now,
    randomId: `${input.randomId ?? 'symphony'}-runtime-start`,
  })
  let runningPlan = withSymphonyPrimaryWorker(input.plan, worker)
  await persistSymphonyControlState({
    db: input.db,
    webId: input.webId,
    plan: runningPlan,
    stage: 'running',
  })

  const adapterResult = await input.runtimeAdapter.run({
    plan: runningPlan,
    worker,
    prompt: worker.delivery.projection.prompt,
    signal: input.signal,
  })

  return applyAndPersistSymphonyWorkerRuntimeResult({
    db: input.db,
    webId: input.webId,
    plan: runningPlan,
    worker,
    result: adapterResult,
    now: input.now,
    randomId: input.randomId,
  })
}

export async function persistSymphonyWorkerDelivery(
  input: PersistSymphonyWorkerDeliveryInput,
): Promise<PersistSymphonyWorkerDeliveryResult> {
  const result = typeof input.delivery === 'string'
    ? parseSymphonyRuntimeDeliveryResult(input.delivery)
    : normalizeSymphonyRuntimeDeliveryResult(input.delivery)
  if (!result) {
    throw new Error('Invalid Symphony worker delivery: expected symphonyDelivery/final report JSON with status, events, or report.')
  }

  return applyAndPersistSymphonyWorkerRuntimeResult({
    db: input.db,
    webId: input.webId,
    plan: input.plan,
    ...(input.worker ? { worker: input.worker } : {}),
    result,
    now: input.now,
    randomId: input.randomId,
  })
}

export async function applyAndPersistSymphonyWorkerRuntimeResult(
  input: ApplyAndPersistSymphonyWorkerRuntimeResultInput,
): Promise<ApplyAndPersistSymphonyWorkerRuntimeResultResult> {
  let worker = input.worker ?? input.plan.workers[0] ?? {
    task: input.plan.task,
    taskRecord: input.plan.taskRecord,
    delivery: input.plan.delivery,
    session: input.plan.session,
  }
  let runningPlan = withSymphonyPrimaryWorker(input.plan, worker)

  if (worker.session.status === 'planned') {
    await persistSymphonyControlState({
      db: input.db,
      webId: input.webId,
      plan: runningPlan,
      stage: 'planned',
    })
    worker = startSymphonyWorkerRun({
      worker,
      now: input.now,
      randomId: `${input.randomId ?? 'symphony'}-delivery-runtime-start`,
      message: `${worker.session.backend} worker runtime result was ingested.`,
      payload: {
        source: 'symphony-delivery',
        issue: input.plan.issue.uri,
        task: worker.task,
        delivery: worker.delivery.uri,
        session: worker.session.uri,
        backend: worker.session.backend,
      },
    })
    runningPlan = withSymphonyPrimaryWorker(input.plan, worker)
    await persistSymphonyControlState({
      db: input.db,
      webId: input.webId,
      plan: runningPlan,
      stage: 'running',
    })
  }

  for (const [index, event] of (input.result.events ?? []).entries()) {
    const eventDate = readRuntimeEventDate(event)
    worker = recordSymphonyWorkerRuntimeEvent({
      worker,
      stepType: event.stepType,
      ...(event.message ? { message: event.message } : {}),
      ...(event.payload ? { payload: event.payload } : {}),
      ...(eventDate ? { now: eventDate } : {}),
      randomId: event.randomId ?? `${input.randomId ?? 'symphony'}-runtime-event-${index + 1}`,
    })
  }

  const status = input.result.status ?? ((input.result.exitCode ?? 0) === 0 ? 'completed' : 'failed')
  const exitCode = input.result.exitCode ?? (status === 'completed' ? 0 : 1)
  const completed = completeSymphonyWorkerRun({
    issue: runningPlan.issue,
    worker,
    status,
    exitCode,
    ...(input.result.autoModeSessionId ? { autoModeSessionId: input.result.autoModeSessionId } : {}),
    ...(input.result.reportText ? { reportText: input.result.reportText } : {}),
    now: input.now,
    randomId: `${input.randomId ?? 'symphony'}-runtime-complete`,
  })
  const finalized = finalizeSymphonyRunPlanAfterWorkers({
    plan: runningPlan,
    workers: [completed.worker],
    followUpIssues: completed.followUpIssues,
    now: input.now,
  })
  const finalPlan = finalized.plan
  await persistSymphonyControlState({
    db: input.db,
    webId: input.webId,
    plan: finalPlan,
    stage: status === 'completed' ? 'completed' : 'failed',
  })

  return {
    plan: finalPlan,
    worker: completed.worker,
    status,
    exitCode,
    ...(input.result.autoModeSessionId ? { autoModeSessionId: input.result.autoModeSessionId } : {}),
  }
}

export async function persistSymphonyInteractionRequest(
  input: PersistSymphonyInteractionRequestInput,
): Promise<PersistSymphonyInteractionRequestResult> {
  const rows = buildSymphonyInteractionRequestRows(input)

  await input.db.init([
    approvalResource,
    inputRequestResource,
    inboxNotificationResource,
    runStepResource,
  ]).catch(() => undefined)

  if (rows.approval) {
    await upsertSymphonyApprovalRequest(input.db, rows.approval)
  }
  if (rows.inputRequest) {
    await upsertSymphonyInputRequest(input.db, rows.inputRequest)
  }
  await insertExactRecordOnce(input.db, inboxNotificationResource, String(rows.inboxNotification.id), rows.inboxNotification as Record<string, unknown>)
  await insertExactRecordOnce(input.db, runStepResource, String(rows.runStep.id), rows.runStep as Record<string, unknown>)

  return {
    plan: input.plan,
    rows,
  }
}

export async function listOpenSymphonyIssuesFromControlState(
  input: { db: SolidDatabase; webId: string },
): Promise<SymphonyIssueRecord[]> {
  await input.db.init([issueResource]).catch(() => undefined)
  const rows = await input.db.select().from(issueResource).execute()
  return rows
    .map((row) => issueRowToSymphonyIssueRecord(row, input.webId))
    .filter((issue): issue is SymphonyIssueRecord => issue !== null)
    .filter((issue) => !isClosedIssueStatus(issue.status))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function listRunningSymphonyWorkersFromControlState(
  input: { db: SolidDatabase },
): Promise<SymphonyControlWorkerStatus[]> {
  await input.db.init([sessionResource]).catch(() => undefined)
  const rows = await input.db.select().from(sessionResource).execute()
  return rows
    .filter(isSymphonySessionRow)
    .flatMap((row) => extractRunningSymphonyWorkersFromSession(row as Record<string, unknown>))
    .sort(compareWorkerStatusUpdatedAt)
    .map(({ updatedAt: _updatedAt, ...worker }) => worker)
}

export async function listRecentSymphonyReportsFromControlState(
  input: { db: SolidDatabase; limit?: number },
): Promise<SymphonyControlReportStatus[]> {
  await input.db.init([reportResource, deliveryResource]).catch(() => undefined)
  const [reportRows, deliveryRows] = await Promise.all([
    selectAllRows(input.db, reportResource).catch(() => []),
    selectAllRows(input.db, deliveryResource).catch(() => []),
  ])
  return [
    ...reportRows.map(reportRowToSymphonyReportStatus),
    ...deliveryRows.map(deliveryRowToSymphonyReportStatus),
  ]
    .filter((report): report is SymphonyControlReportStatus & { sortAt: number } => report !== null)
    .sort((left, right) => right.sortAt - left.sortAt)
    .slice(0, input.limit ?? 5)
    .map(({ sortAt: _sortAt, ...report }) => report)
}

async function selectAllRows(db: SolidDatabase, resource: unknown): Promise<unknown[]> {
  return await db.select().from(resource as never).execute()
}

function issueRowToSymphonyIssueRecord(row: unknown, webId: string): SymphonyIssueRecord | null {
  const record = asRecord(row)
  const id = normalizeString(record?.id)
  const title = normalizeString(record?.title)
  if (!record || !id || !title) {
    return null
  }

  const status = normalizeIssueStatus(record.status)
  const priority = normalizeIssuePriority(record.priority)
  const tasks = Array.isArray(record.tasks)
    ? record.tasks.map((item) => normalizeString(item)).filter((item): item is string => Boolean(item))
    : []
  const createdAt = toIsoDate(record.createdAt)
  const updatedAt = toIsoDate(record.updatedAt) ?? createdAt
  return {
    uri: symphonyIssueUriFromResourceId(id),
    title,
    description: normalizeString(record.description),
    status,
    priority,
    source: normalizeIssueSource(record.source),
    issuer: {
      source: 'user',
      webId: normalizeString(record.createdBy) ?? webId,
      ...(normalizeString(record.chat) ? { chat: normalizeString(record.chat) } : {}),
      ...(normalizeString(record.thread) ? { thread: normalizeString(record.thread) } : {}),
    },
    tasks,
    deliveries: [],
    sessions: [],
    ...(normalizeString(record.chat) ? { chat: normalizeString(record.chat) } : {}),
    ...(normalizeString(record.thread) ? { thread: normalizeString(record.thread) } : {}),
    createdAt,
    updatedAt,
    ...(record.closedAt ? { closedAt: toIsoDate(record.closedAt) ?? updatedAt } : {}),
  }
}

function symphonyIssueUriFromResourceId(id: string): string {
  const normalized = resolvePodResourceTemplateValue(issueResource, id) ?? id
  return `urn:undefineds:linx:issue:${normalized}`
}

function normalizeIssueStatus(value: unknown): SymphonyIssueRecord['status'] {
  const normalized = normalizeString(value)
  if (
    normalized === 'open'
    || normalized === 'triaging'
    || normalized === 'in_progress'
    || normalized === 'blocked'
    || normalized === 'resolved'
    || normalized === 'closed'
  ) {
    return normalized
  }
  return 'open'
}

function normalizeIssuePriority(value: unknown): SymphonyIssueRecord['priority'] {
  const normalized = normalizeString(value)
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'urgent') {
    return normalized
  }
  return 'medium'
}

function normalizeIssueSource(value: unknown): SymphonyIssueRecord['source'] {
  const normalized = normalizeString(value)
  if (
    normalized === 'cli'
    || normalized === 'web'
    || normalized === 'service'
    || normalized === 'tui'
    || normalized === 'mcp'
    || normalized === 'runtime'
    || normalized === 'control-plane'
  ) {
    return normalized
  }
  return 'control-plane'
}

function isClosedIssueStatus(status: SymphonyIssueRecord['status']): boolean {
  return status === 'closed' || status === 'resolved'
}

function isSymphonySessionRow(row: unknown): row is Record<string, unknown> {
  if (!row || typeof row !== 'object') {
    return false
  }

  const record = row as Record<string, unknown>
  const metadata = asRecord(record.metadata)
  return metadata?.kind === 'symphony-run'
    || record.policyVersion === SYMPHONY_POLICY_VERSION
    || (typeof record.tool === 'string' && record.tool.startsWith('symphony:'))
}

function extractRunningSymphonyWorkersFromSession(row: Record<string, unknown>): Array<SymphonyControlWorkerStatus & { updatedAt?: Date }> {
  const metadata = asRecord(row.metadata) ?? {}
  const sessionStatus = normalizePodSymphonySessionStatus(metadata.status ?? row.status)
  const workers = Array.isArray(metadata.workers) ? metadata.workers : []
  const updatedAt = safeOptionalDate(row.updatedAt)

  if (workers.length === 0) {
    if (sessionStatus !== 'running') {
      return []
    }

    return [{
      status: sessionStatus,
      backend: normalizeString(metadata.backend) ?? parseBackendFromTool(row.tool) ?? 'unknown',
      mode: normalizeString(metadata.mode) ?? 'auto',
      cwd: normalizeString(metadata.workspacePath),
      autoModeSessionId: normalizeString(metadata.autoModeSessionId),
      target: normalizeSymphonyWorkerTarget(asRecord(metadata.target)),
      updatedAt,
    }]
  }

  return workers
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null)
    .map((worker) => ({
      status: normalizePodSymphonySessionStatus(worker.status ?? worker.taskStatus ?? sessionStatus),
      backend: normalizeString(worker.backend) ?? normalizeString(metadata.backend) ?? parseBackendFromTool(row.tool) ?? 'unknown',
      mode: normalizeString(worker.mode) ?? normalizeString(metadata.mode) ?? 'auto',
      cwd: normalizeString(worker.workspacePath) ?? normalizeString(metadata.workspacePath),
      autoModeSessionId: normalizeString(worker.autoModeSessionId) ?? normalizeString(metadata.autoModeSessionId),
      target: normalizeSymphonyWorkerTarget(asRecord(worker.target), worker, asRecord(metadata.target)),
      updatedAt,
    }))
    .filter((worker) => worker.status === 'running')
}

function deliveryRowToSymphonyReportStatus(row: unknown): (SymphonyControlReportStatus & { sortAt: number }) | null {
  const record = asRecord(row)
  if (!record) {
    return null
  }

  const metadata = asRecord(record.metadata)
  const payload = asRecord(record.payload)
  if (record.kind !== 'report' && metadata?.reportKind !== 'worker-completion' && payload?.kind !== 'symphony_report') {
    return null
  }

  const completedAt = safeOptionalDate(record.completedAt)
  const updatedAt = safeOptionalDate(record.updatedAt)
  const createdAt = safeOptionalDate(record.createdAt)
  const sortAt = completedAt?.getTime() ?? updatedAt?.getTime() ?? createdAt?.getTime() ?? 0
  const agent = normalizeString(payload?.agent)
  const title = normalizeString(record.objective)
  const summary = normalizeString(payload?.summary)
  const task = normalizeString(record.task)
  const archive = asRecord(metadata?.archive)
  const delivery = normalizeString(payload?.delivery) ?? normalizeString(archive?.delivery)
  const reportDelivery = normalizeString(payload?.reportDelivery) ?? normalizeString(record.id)
  const run = normalizeString(payload?.run) ?? normalizeString(record.object)
  const chat = normalizeString(record.chat)
  const thread = normalizeString(record.thread)
  const autoModeSessionId = normalizeString(payload?.autoModeSessionId)
  const error = normalizeString(payload?.error) ?? normalizeString(record.error)
  return {
    status: normalizeString(payload?.outcome) ?? normalizeString(record.status) ?? 'completed',
    backend: normalizeString(payload?.backend) ?? 'unknown',
    ...(agent ? { agent } : {}),
    ...(title ? { title } : {}),
    ...(summary ? { summary } : {}),
    ...(task ? { task } : {}),
    ...(delivery ? { delivery } : {}),
    ...(reportDelivery ? { reportDelivery } : {}),
    ...(run ? { run } : {}),
    ...(chat ? { chat } : {}),
    ...(thread ? { thread } : {}),
    ...(autoModeSessionId ? { autoModeSessionId } : {}),
    ...(error ? { error } : {}),
    ...(completedAt ? { completedAt: completedAt.toISOString() } : {}),
    ...(updatedAt ? { updatedAt: updatedAt.toISOString() } : {}),
    sortAt,
  }
}

function reportRowToSymphonyReportStatus(row: unknown): (SymphonyControlReportStatus & { sortAt: number }) | null {
  const record = asRecord(row)
  if (!record) {
    return null
  }

  const metadata = asRecord(record.metadata)
  const metricFacts = asRecord(record.metricFacts)
  if (metadata?.surface !== 'symphony' && metadata?.reportKind !== 'worker-final-package') {
    return null
  }

  const publishedAt = safeOptionalDate(record.publishedAt)
  const updatedAt = safeOptionalDate(record.updatedAt)
  const createdAt = safeOptionalDate(record.createdAt)
  const sortAt = publishedAt?.getTime() ?? updatedAt?.getTime() ?? createdAt?.getTime() ?? 0
  const archive = asRecord(metadata?.archive)
  const reportDelivery = normalizeString(record.id)
  const delivery = normalizeString(record.delivery) ?? normalizeString(archive?.delivery)
  const run = normalizeString(record.run) ?? normalizeString(record.about)
  const error = normalizeString(metadata?.error)
  return {
    status: normalizeString(record.outcome) ?? normalizeString(record.status) ?? 'completed',
    backend: normalizeString(metricFacts?.backend) ?? normalizeString(metadata?.backend) ?? 'unknown',
    ...(normalizeString(record.actor) ? { agent: normalizeString(record.actor) } : {}),
    ...(normalizeString(record.summary) ? { title: normalizeString(record.summary), summary: normalizeString(record.summary) } : {}),
    ...(normalizeString(record.task) ? { task: normalizeString(record.task) } : {}),
    ...(delivery ? { delivery } : {}),
    ...(reportDelivery ? { reportDelivery } : {}),
    ...(run ? { run } : {}),
    ...(normalizeString(record.thread) ? { thread: normalizeString(record.thread) } : {}),
    ...(normalizeString(metricFacts?.autoModeSessionId) ? { autoModeSessionId: normalizeString(metricFacts?.autoModeSessionId) } : {}),
    ...(error ? { error } : {}),
    ...(publishedAt ? { completedAt: publishedAt.toISOString() } : {}),
    ...(updatedAt ? { updatedAt: updatedAt.toISOString() } : {}),
    sortAt,
  }
}

function normalizeSymphonyWorkerTarget(
  target: Record<string, unknown> | null,
  worker: Record<string, unknown> = {},
  fallback: Record<string, unknown> | null = null,
): SymphonyControlWorkerStatus['target'] {
  const normalized = {
    label: normalizeString(target?.label) ?? normalizeString(worker.title) ?? normalizeString(fallback?.label),
    agent: normalizeString(target?.agent) ?? normalizeString(worker.agent) ?? normalizeString(fallback?.agent),
    chat: normalizeString(target?.chat) ?? normalizeString(worker.chat) ?? normalizeString(fallback?.chat),
  }
  return Object.values(normalized).some(Boolean) ? normalized : undefined
}

function compareWorkerStatusUpdatedAt(
  left: SymphonyControlWorkerStatus & { updatedAt?: Date },
  right: SymphonyControlWorkerStatus & { updatedAt?: Date },
): number {
  return (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0)
}

function normalizePodSymphonySessionStatus(value: unknown): string {
  const normalized = normalizeString(value)
  if (normalized === 'active') return 'running'
  if (normalized === 'error') return 'failed'
  if (normalized === 'queued') return 'planned'
  return normalized ?? 'planned'
}

function parseBackendFromTool(value: unknown): string | undefined {
  const tool = normalizeString(value)
  if (!tool?.startsWith('symphony:')) {
    return undefined
  }
  return tool.slice('symphony:'.length) || undefined
}

function withSymphonyPrimaryWorker(plan: SymphonyRunPlan, worker: SymphonyWorkerPlan): SymphonyRunPlan {
  return {
    ...plan,
    task: worker.task,
    taskRecord: worker.taskRecord,
    delivery: worker.delivery,
    session: worker.session,
    workers: [worker],
  }
}

export function buildSymphonyControlRows(input: BuildSymphonyControlRowsInput): SymphonyControlRows {
  const stage = input.stage ?? inferSymphonyControlStage(input.plan)
  const stages = input.stages?.length ? input.stages : [stage]
  const followUpIssues = input.plan.followUpIssues ?? []
  const issues = [
    buildSymphonyIssueRow(input.plan, input.webId),
    ...followUpIssues.map((issue) => buildSymphonyIssueRow(input.plan, input.webId, issue)),
  ]

  return {
    contacts: buildSymphonyContactRows(input.plan, input.webId),
    chats: [buildSymphonyChatRow(input.plan, input.webId, stage)],
    threads: buildSymphonyThreadRows(input.plan, input.webId, stage),
    messages: stages.map((currentStage) => buildSymphonyStatusMessageRow(input.plan, input.webId, currentStage)),
    issue: issues[0]!,
    issues,
    tasks: input.plan.workers.map((worker) => buildSymphonyTaskRow(input.plan, input.webId, worker)),
    deliveries: input.plan.workers.map((worker) => buildSymphonyDeliveryRow(input.plan, input.webId, worker)),
    sessions: input.plan.workers.map((worker) => buildSymphonySessionRow(input.plan, input.webId, worker)),
    runs: input.plan.workers.map((worker) => buildSymphonyRunRow(input.plan, input.webId, worker)),
    runSteps: input.plan.workers.flatMap((worker) => [
      ...stages.map((currentStage) => buildSymphonyRunStepRow(input.plan, input.webId, worker, currentStage)),
      ...(worker.runSteps ?? []).map((step) => buildSymphonyRuntimeRunStepRow(input.plan, input.webId, worker, step)),
    ]),
    evidence: input.plan.workers.flatMap((worker) => buildSymphonyEvidenceRows(input.plan, input.webId, worker)),
    reports: input.plan.workers.flatMap((worker) => buildSymphonyReportRows(input.plan, input.webId, worker)),
  }
}

export function buildSymphonyInteractionRequestRows(
  input: BuildSymphonyInteractionRequestRowsInput,
): SymphonyInteractionRequestRows {
  const worker = input.worker ?? input.plan.workers[0] ?? {
    task: input.plan.task,
    taskRecord: input.plan.taskRecord,
    delivery: input.plan.delivery,
    session: input.plan.session,
  }
  const createdAt = safeDate(input.now)
  const source = input.source ?? defaultInteractionSource(worker)
  const requestKey = stableInteractionRequestKey(input.request, input.randomId)
  const run = buildSymphonyRunIri(input.webId, worker)
  const thread = selectWorkerThreadIri(input.plan, input.webId, worker)
  const chat = selectWorkerChatIri(input.plan, input.webId, worker)
  const requester = agentResource.buildIri(input.webId, {
    id: buildWorkerAgentId(worker.session.backend, worker.session.target.agent),
  })
  const assignedTo = agentResource.buildIri(input.webId, { id: SYMPHONY_SECRETARY_AGENT_ID })
  const session = buildSymphonyWorkerSessionIri(input.webId, worker)
  const task = buildSymphonyTaskIri(input.webId, worker.task)
  const policyVersion = input.policyVersion ?? SYMPHONY_RUNTIME_REQUEST_POLICY_VERSION

  const control = input.request.kind === 'user-input'
    ? buildSymphonyInputRequestRow({
      plan: input.plan,
      webId: input.webId,
      worker,
      request: input.request,
      requestKey,
      createdAt,
      source,
      session,
      chat,
      thread,
      run,
      task,
      requester,
      assignedTo,
      policyVersion,
    })
    : buildSymphonyApprovalRequestRow({
      plan: input.plan,
      webId: input.webId,
      worker,
      request: input.request,
      requestKey,
      createdAt,
      source,
      session,
      chat,
      thread,
      run,
      task,
      requester,
      assignedTo,
      policyVersion,
    })

  const controlResource = input.request.kind === 'user-input'
    ? inputRequestResource.buildIri(input.webId, {
      id: control.id,
      createdAt,
    })
    : approvalResource.buildIri(input.webId, {
      id: control.id,
      createdAt,
    })
  const inboxNotification = buildSymphonyInteractionInboxNotificationRow({
    requestKey,
    createdAt,
    actor: requester,
    controlResource,
  })
  const runStep = buildSymphonyInteractionRunStepRow({
    plan: input.plan,
    webId: input.webId,
    worker,
    request: input.request,
    requestKey,
    createdAt,
    source,
    run,
    controlResource,
    inboxNotification: inboxNotificationResource.buildIri(input.webId, {
      id: inboxNotification.id,
    }),
  })

  return input.request.kind === 'user-input'
    ? {
      inputRequest: control,
      inboxNotification,
      runStep,
    }
    : {
      approval: control,
      inboxNotification,
      runStep,
    }
}

export async function upsertSymphonyApprovalRequest(db: ExactRecordDatabase, row: ApprovalInsert): Promise<void> {
  await upsertExactRecord(db, approvalResource, { id: row.id, createdAt: row.createdAt }, row as Record<string, unknown>, {
    session: row.session,
    chat: row.chat,
    thread: row.thread,
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    target: row.target,
    action: row.action,
    risk: row.risk,
    status: row.status,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    assignedTo: row.assignedTo,
    decisionBy: row.decisionBy,
    decisionRole: row.decisionRole,
    onBehalfOf: row.onBehalfOf,
    reason: row.reason,
    context: row.context,
    approvalOptions: row.approvalOptions,
    policyVersion: row.policyVersion,
    expiresAt: row.expiresAt,
    resolvedAt: row.resolvedAt,
  })
}

export async function upsertSymphonyInputRequest(db: ExactRecordDatabase, row: InputRequestInsert): Promise<void> {
  await upsertExactRecord(db, inputRequestResource, { id: row.id, createdAt: row.createdAt }, row as Record<string, unknown>, {
    session: row.session,
    chat: row.chat,
    thread: row.thread,
    run: row.run,
    task: row.task,
    requester: row.requester,
    requestKind: row.requestKind,
    prompt: row.prompt,
    context: row.context,
    inputOptions: row.inputOptions,
    status: row.status,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    assignedTo: row.assignedTo,
    response: row.response,
    answeredBy: row.answeredBy,
    onBehalfOf: row.onBehalfOf,
    reason: row.reason,
    metadata: row.metadata,
    expiresAt: row.expiresAt,
    resolvedAt: row.resolvedAt,
  })
}

export async function upsertSymphonyContact(db: ExactRecordDatabase, row: ContactInsert): Promise<void> {
  await upsertExactRecord(db, contactResource, { id: row.id }, row as Record<string, unknown>, {
    name: row.name,
    about: row.about,
    rdfType: row.rdfType,
    contactType: row.contactType,
    alias: row.alias,
    note: row.note,
    sortKey: row.sortKey,
    updatedAt: row.updatedAt,
  })
}

export async function upsertSymphonyChat(db: ExactRecordDatabase, row: ChatInsert): Promise<void> {
  await upsertExactRecord(db, chatResource, { id: row.id }, row as Record<string, unknown>, {
    title: row.title,
    description: row.description,
    contact: row.contact,
    participants: row.participants,
    metadata: row.metadata,
    lastActiveAt: row.lastActiveAt,
    lastMessage: row.lastMessage,
    lastMessagePreview: row.lastMessagePreview,
    updatedAt: row.updatedAt,
  })
}

export async function upsertSymphonyThread(db: ExactRecordDatabase, row: ThreadInsert): Promise<void> {
  await upsertExactRecord(db, threadResource, { id: row.id }, row as Record<string, unknown>, {
    parent: row.parent,
    title: row.title,
    status: row.status,
    workspace: row.workspace,
    metadata: row.metadata,
    updatedAt: row.updatedAt,
  })
}

export async function upsertSymphonyReport(db: ExactRecordDatabase, row: ReportInsert): Promise<void> {
  await upsertExactRecord(db, reportResource, { id: row.id }, row as Record<string, unknown>, {
    reportKind: row.reportKind,
    status: row.status,
    outcome: row.outcome,
    about: row.about,
    issue: row.issue,
    task: row.task,
    delivery: row.delivery,
    run: row.run,
    thread: row.thread,
    evidence: row.evidence,
    summary: row.summary,
    reviewer: row.reviewer,
    actor: row.actor,
    source: row.source,
    metricFacts: row.metricFacts,
    metadata: row.metadata,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
  })
}

export async function upsertSymphonyIssue(db: ExactRecordDatabase, row: IssueInsert): Promise<void> {
  await upsertExactRecord(db, issueResource, { id: row.id }, row as Record<string, unknown>, {
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    labels: row.labels,
    chat: row.chat,
    thread: row.thread,
    parentIssue: row.parentIssue,
    tasks: row.tasks,
    assignedTo: row.assignedTo,
    updatedAt: row.updatedAt,
    closedAt: row.closedAt,
  })
}

export async function upsertSymphonyTask(db: ExactRecordDatabase, row: TaskInsert): Promise<void> {
  await upsertExactRecord(db, taskResource, { id: row.id }, row as Record<string, unknown>, {
    title: row.title,
    instruction: row.instruction,
    prompt: row.prompt,
    issue: row.issue,
    message: row.message,
    thread: row.thread,
    workspace: row.workspace,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assignedTo,
    source: row.source,
    metadata: row.metadata,
    updatedAt: row.updatedAt,
  })
}

export async function upsertSymphonyDelivery(db: ExactRecordDatabase, row: DeliveryInsert): Promise<void> {
  await upsertExactRecord(db, deliveryResource, { id: row.id }, row as Record<string, unknown>, {
    kind: row.kind,
    status: row.status,
    task: row.task,
    source: row.source,
    target: row.target,
    chat: row.chat,
    thread: row.thread,
    targetThread: row.targetThread,
    targetSession: row.targetSession,
    actor: row.actor,
    object: row.object,
    objective: row.objective,
    payload: row.payload,
    projection: row.projection,
    projectedRole: row.projectedRole,
    metadata: row.metadata,
    error: row.error,
    dispatchedAt: row.dispatchedAt,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
  })
}

export async function upsertSymphonySession(db: ExactRecordDatabase, row: SessionInsert): Promise<void> {
  await upsertExactRecord(db, sessionResource, { id: row.id, createdAt: row.createdAt }, row as Record<string, unknown>, {
    owner: row.owner,
    chat: row.chat,
    thread: row.thread,
    status: row.status,
    tool: row.tool,
    tokenUsage: row.tokenUsage,
    messages: row.messages,
    policy: row.policy,
    policyVersion: row.policyVersion,
    metadata: row.metadata,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  })
}

export async function upsertSymphonyRun(db: ExactRecordDatabase, row: RunInsert): Promise<void> {
  await upsertExactRecord(db, runResource, { id: row.id }, row as Record<string, unknown>, {
    task: row.task,
    delivery: row.delivery,
    trigger: row.trigger,
    input: row.input,
    thread: row.thread,
    workspace: row.workspace,
    status: row.status,
    runner: row.runner,
    prompt: row.prompt,
    externalRunId: row.externalRunId,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    heartbeatAt: row.heartbeatAt,
    cancelRequestedAt: row.cancelRequestedAt,
    error: row.error,
    metadata: row.metadata,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
  })
}

export function buildSymphonyIssueRow(plan: SymphonyRunPlan, webId: string, issue: SymphonyIssueRecord = plan.issue): IssueInsert {
  const createdAt = safeDate(issue.createdAt)
  const updatedAt = safeDate(issue.updatedAt)
  return {
    id: buildSymphonyIssueId(issue),
    title: issue.title,
    description: issue.description,
    status: issue.status,
    priority: issue.priority,
    labels: Array.from(new Set(['symphony', ...(issue.labels ?? [])])),
    chat: selectTargetChatIri(plan.session.target?.chat ?? issue.chat, webId, plan),
    thread: selectTargetThreadIri(plan.session.target?.thread ?? issue.thread, webId, plan),
    parentIssue: issue.parentIssue ? normalizeSymphonyIssueIri(webId, issue.parentIssue) : undefined,
    tasks: Array.from(new Set((issue.tasks?.length ? issue.tasks : issue.uri === plan.issue.uri ? plan.workers.map((worker) => worker.task) : [])
      .map((task) => normalizeSymphonyTaskIri(webId, task)))),
    createdBy: issue.issuer.webId ?? plan.issue.issuer.webId ?? webId,
    assignedTo: agentResource.buildIri(webId, { id: SYMPHONY_SECRETARY_AGENT_ID }),
    createdAt,
    updatedAt,
    ...(issue.closedAt ? { closedAt: safeDate(issue.closedAt) } : {}),
  } as IssueInsert
}

export function buildSymphonyTaskRow(plan: SymphonyRunPlan, webId: string, worker: Worker): TaskInsert {
  const createdAt = safeDate(worker.taskRecord.createdAt)
  const updatedAt = safeDate(worker.taskRecord.updatedAt)
  const workerAgent = agentResource.buildIri(webId, {
    id: buildWorkerAgentId(worker.session.backend, worker.session.target.agent),
  })

  return {
    id: taskResource.buildId({ id: buildSymphonyTaskKey(worker.task) }),
    title: worker.taskRecord.title,
    instruction: worker.taskRecord.objective,
    prompt: worker.delivery.projection.prompt,
    issue: buildSymphonyIssueIri(webId, plan.issue),
    message: lastItem(plan.issue.messages),
    thread: selectWorkerThreadIri(plan, webId, worker),
    workspace: pathToWorkspaceUri(worker.session.cwd) ?? pathToWorkspaceUri(plan.session.cwd) ?? 'file:///',
    status: mapSymphonyTaskStatus(worker.taskRecord.status),
    priority: plan.issue.priority,
    assignedTo: workerAgent,
    source: buildSymphonyIssueIri(webId, plan.issue),
    metadata: {
      surface: 'symphony',
      ...buildSymphonyArchiveMetadata({ task: worker.taskRecord.uri }),
      acceptanceCriteria: worker.taskRecord.acceptanceCriteria,
      acceptanceReview: worker.taskRecord.acceptanceReview ?? worker.delivery.acceptanceReview ?? worker.session.acceptanceReview,
      backend: worker.session.backend,
      target: worker.session.target,
      workspace: buildSymphonyWorkspaceMetadata(plan, worker),
      spaceContract: buildSymphonySpaceContract(plan, webId, worker),
      podAccessPolicy: buildSymphonyWorkerPodAccessPolicy(plan, webId, worker),
      reconciler: buildSymphonyReconcilerMetadata(worker),
    },
    createdAt,
    updatedAt,
  } as TaskInsert
}

export function buildSymphonyDeliveryRow(plan: SymphonyRunPlan, webId: string, worker: Worker): DeliveryInsert {
  const createdAt = safeDate(worker.delivery.createdAt)
  const updatedAt = safeDate(worker.delivery.updatedAt)
  const secretaryAgent = agentResource.buildIri(webId, { id: SYMPHONY_SECRETARY_AGENT_ID })
  const workerAgent = agentResource.buildIri(webId, {
    id: buildWorkerAgentId(worker.session.backend, worker.session.target.agent),
  })

  return {
    id: deliveryResource.buildId({
      id: getSymphonyArchiveKey(worker.delivery.uri),
      task: buildSymphonyTaskIri(webId, worker.task),
      createdAt,
    }),
    kind: worker.delivery.type,
    status: worker.delivery.status,
    task: buildSymphonyTaskIri(webId, worker.task),
    source: secretaryAgent,
    target: workerAgent,
    chat: selectWorkerChatIri(plan, webId, worker),
    thread: selectWorkerThreadIri(plan, webId, worker),
    targetThread: selectWorkerThreadIri(plan, webId, worker),
    targetSession: worker.session.uri,
    actor: secretaryAgent,
    object: buildSymphonyTaskIri(webId, worker.task),
    objective: worker.taskRecord.objective,
    payload: {
      issue: buildSymphonyIssueIri(webId, plan.issue),
      acceptanceCriteria: worker.taskRecord.acceptanceCriteria,
      backend: worker.session.backend,
      mode: worker.session.mode,
      target: worker.session.target,
      workspace: buildSymphonyWorkspaceMetadata(plan, worker),
      spaceContract: buildSymphonySpaceContract(plan, webId, worker),
      podAccessPolicy: buildSymphonyWorkerPodAccessPolicy(plan, webId, worker),
      reconciler: buildSymphonyReconcilerMetadata(worker),
      acceptanceReview: worker.delivery.acceptanceReview ?? worker.taskRecord.acceptanceReview ?? worker.session.acceptanceReview,
    },
    projection: worker.delivery.projection,
    projectedRole: worker.delivery.projection.runtimeRole,
    metadata: {
      surface: 'symphony',
      ...buildSymphonyArchiveMetadata({
        issue: plan.issue.uri,
        task: worker.task,
        delivery: worker.delivery.uri,
        session: worker.session.uri,
      }),
      autoModeSessionId: worker.delivery.autoModeSessionId,
      workspace: buildSymphonyWorkspaceMetadata(plan, worker),
      spaceContract: buildSymphonySpaceContract(plan, webId, worker),
      podAccessPolicy: buildSymphonyWorkerPodAccessPolicy(plan, webId, worker),
      reconciler: buildSymphonyReconcilerMetadata(worker),
    },
    error: worker.delivery.error,
    createdAt,
    dispatchedAt: worker.delivery.status === 'dispatched' || worker.delivery.status === 'completed'
      ? updatedAt
      : undefined,
    completedAt: worker.delivery.completedAt ? safeDate(worker.delivery.completedAt) : undefined,
    updatedAt,
  } as DeliveryInsert
}

export function buildSymphonySessionRow(plan: SymphonyRunPlan, webId: string, worker: Worker = plan.workers[0] ?? {
  task: plan.task,
  taskRecord: plan.taskRecord,
  delivery: plan.delivery,
  session: plan.session,
}): SessionInsert {
  const createdAt = safeDate(worker.session.createdAt)
  const updatedAt = safeDate(worker.session.updatedAt)
  const status = worker.session.status === 'completed'
    ? 'completed'
    : worker.session.status === 'failed'
      ? 'error'
      : worker.session.status === 'running'
        ? 'active'
        : 'queued'
  const workerSummary = buildSymphonyWorkerSummary(plan, webId, worker)

  return {
    id: buildSymphonySessionRecordId(worker.session),
    owner: webId,
    chat: selectWorkerChatIri(plan, webId, worker),
    thread: selectWorkerThreadIri(plan, webId, worker),
    status,
    tool: `symphony:${worker.session.backend}`,
    tokenUsage: 0,
    messages: worker.session.messages,
    policyVersion: SYMPHONY_POLICY_VERSION,
    metadata: {
      kind: 'symphony-run',
      surface: 'symphony',
      status: worker.session.status,
      issue: plan.issue.uri,
      task: worker.task,
      delivery: worker.delivery.uri,
      session: worker.session.uri,
      issuer: plan.issue.issuer,
      worker: workerSummary,
      workers: [workerSummary],
      backend: worker.session.backend,
      mode: worker.session.mode,
      model: worker.session.model,
      workspacePath: worker.session.cwd,
      workspace: buildSymphonyWorkspaceMetadata(plan, worker),
      reconciler: buildSymphonyReconcilerMetadata(worker),
      autoModeSessionId: worker.session.autoModeSessionId,
      exitCode: worker.session.exitCode,
      dryRun: worker.session.dryRun,
      error: worker.session.error ?? worker.delivery.error ?? plan.issue.error,
      target: worker.session.target,
    },
    createdAt,
    updatedAt,
    ...(status === 'completed' || status === 'error' ? { archivedAt: updatedAt } : {}),
  } as SessionInsert
}

export function buildSymphonyRunRow(plan: SymphonyRunPlan, webId: string, worker: Worker): RunInsert {
  const createdAt = safeDate(worker.session.createdAt)
  const updatedAt = safeDate(worker.session.updatedAt)

  return {
    id: runResource.buildId({
      id: getSymphonyArchiveKey(worker.session.uri),
      task: buildSymphonyTaskIri(webId, worker.task),
      createdAt,
    }),
    task: buildSymphonyTaskIri(webId, worker.task),
    delivery: buildSymphonyDeliveryIri(webId, worker),
    trigger: lastItem(plan.issue.messages) ?? buildSymphonyIssueIri(webId, plan.issue),
    input: buildSymphonyDeliveryIri(webId, worker),
    thread: selectWorkerThreadIri(plan, webId, worker),
    workspace: pathToWorkspaceUri(worker.session.cwd) ?? pathToWorkspaceUri(plan.session.cwd) ?? 'file:///',
    status: mapSymphonyRunStatus(worker.session.status),
    runner: worker.session.backend,
    prompt: worker.delivery.projection.prompt,
    externalRunId: worker.session.autoModeSessionId,
    error: worker.session.error,
    metadata: {
      surface: 'symphony',
      ...buildSymphonyArchiveMetadata({ session: worker.session.uri }),
      mode: worker.session.mode,
      model: worker.session.model,
      target: worker.session.target,
      workspace: buildSymphonyWorkspaceMetadata(plan, worker),
      spaceContract: buildSymphonySpaceContract(plan, webId, worker),
      podAccessPolicy: buildSymphonyWorkerPodAccessPolicy(plan, webId, worker),
      reconciler: buildSymphonyReconcilerMetadata(worker),
      acceptanceReview: worker.session.acceptanceReview ?? worker.taskRecord.acceptanceReview ?? worker.delivery.acceptanceReview,
      exitCode: worker.session.exitCode,
      dryRun: worker.session.dryRun,
    },
    createdAt,
    startedAt: worker.session.status === 'running' || worker.session.status === 'completed' || worker.session.status === 'failed'
      ? updatedAt
      : undefined,
    completedAt: worker.session.completedAt ? safeDate(worker.session.completedAt) : undefined,
    updatedAt,
  } as RunInsert
}

export function buildSymphonyRunStepRow(
  plan: SymphonyRunPlan,
  webId: string,
  worker: Worker,
  stage: SymphonyControlStage,
): RunStepInsert {
  const run = buildSymphonyRunIri(webId, worker)
  const createdAt = stage === 'planned' ? safeDate(worker.session.createdAt) : safeDate(worker.session.updatedAt)
  const stepType = stage === 'planned'
    ? 'run.created'
    : stage === 'running'
      ? 'run.started'
      : stage === 'completed'
        ? 'run.completed'
        : 'run.failed'

  return {
    id: runStepResource.buildId({
      id: `${getSymphonyArchiveKey(worker.session.uri)}-${stage}`,
      run,
    }),
    run,
    stepType,
    message: buildStatusContent(plan, stage),
    payload: {
      surface: 'symphony',
      stage,
      issue: buildSymphonyIssueIri(webId, plan.issue),
      task: buildSymphonyTaskIri(webId, worker.task),
      delivery: buildSymphonyDeliveryIri(webId, worker),
      archive: buildSymphonyArchiveRefs({ session: worker.session.uri }),
      autoModeSessionId: worker.session.autoModeSessionId,
    },
    createdAt,
  } as RunStepInsert
}

export function buildSymphonyRuntimeRunStepRow(
  plan: SymphonyRunPlan,
  webId: string,
  worker: Worker,
  step: NonNullable<Worker['runSteps']>[number],
): RunStepInsert {
  const run = buildSymphonyRunIri(webId, worker)
  return {
    id: runStepResource.buildId({
      id: getSymphonyArchiveKey(step.uri),
      run,
    }),
    run,
    stepType: step.stepType,
    message: step.message,
    payload: {
      surface: 'symphony',
      issue: buildSymphonyIssueIri(webId, plan.issue),
      task: buildSymphonyTaskIri(webId, worker.task),
      delivery: buildSymphonyDeliveryIri(webId, worker),
      session: buildSymphonyWorkerSessionIri(webId, worker),
      archive: buildSymphonyArchiveRefs({
        issue: step.issue,
        task: step.task,
        delivery: step.delivery,
        session: step.session,
      }),
      ...(step.payload ?? {}),
    },
    createdAt: safeDate(step.createdAt),
  } as RunStepInsert
}

export function buildSymphonyContactRows(plan: SymphonyRunPlan, webId: string): ContactInsert[] {
  const createdAt = safeDate(plan.issue.createdAt)
  const updatedAt = safeDate(plan.session.updatedAt)
  const agents = [
    {
      id: SYMPHONY_SECRETARY_AGENT_ID,
      name: 'AI Secretary',
      about: agentResource.buildIri(webId, { id: SYMPHONY_SECRETARY_AGENT_ID }),
      sortKey: '00-ai-secretary',
      note: 'Default Secretary contact for LinX-managed Symphony work.',
    },
    ...plan.workers.map((worker, index) => {
      const id = buildWorkerAgentId(worker.session.backend, worker.session.target.agent)
      const label = worker.session.target.label ?? worker.session.target.agent ?? backendDisplayName(worker.session.backend)
      return {
        id,
        name: label,
        about: agentResource.buildIri(webId, { id }),
        sortKey: `10-worker-${index + 1}-${label.toLowerCase()}`,
        note: `${backendDisplayName(worker.session.backend)} worker contact for Symphony task ${worker.taskRecord.title}.`,
      }
    }),
  ]

  return agents.map((agent) => ({
    id: agent.id === SYMPHONY_SECRETARY_AGENT_ID ? SYMPHONY_SECRETARY_AGENT_ID : `${agent.id}-contact`,
    name: agent.name,
    about: agent.about,
    rdfType: ContactClass.AGENT,
    contactType: ContactType.AGENT,
    alias: agent.name,
    note: agent.note,
    sortKey: agent.sortKey,
    createdAt,
    updatedAt,
  } as ContactInsert))
}

export function buildSymphonyChatRow(
  plan: SymphonyRunPlan,
  webId: string,
  stage: SymphonyControlStage,
): ChatInsert {
  const createdAt = safeDate(plan.issue.createdAt)
  const updatedAt = safeDate(plan.session.updatedAt)
  const secretaryAgent = agentResource.buildIri(webId, { id: SYMPHONY_SECRETARY_AGENT_ID })
  const workerAgents = plan.workers.map((worker) => agentResource.buildIri(webId, {
    id: buildWorkerAgentId(worker.session.backend, worker.session.target.agent),
  }))
  const targetChat = selectTargetChatIri(plan.session.target?.chat, webId, plan)
  const message = buildSymphonyStatusMessageRow(plan, webId, stage)

  return {
    id: buildTargetChatId(plan, webId),
    title: plan.session.target?.label ?? (targetChat === buildSymphonyChatUri(webId) ? 'AI Secretary · Symphony' : 'Symphony Delegation'),
    participants: Array.from(new Set([webId, secretaryAgent, ...workerAgents])),
    metadata: {
      kind: targetChat === buildSymphonyChatUri(webId) ? 'symphony-control-room' : 'symphony-target-room',
      surface: 'symphony',
      secretaryAgent,
      currentBackend: plan.session.backend,
      currentStage: stage,
      target: plan.session.target,
      members: [
        { uri: webId, role: 'user', label: 'User' },
        { uri: secretaryAgent, role: 'secretary', label: 'AI Secretary' },
        ...plan.workers.map((worker) => ({
          uri: agentResource.buildIri(webId, {
            id: buildWorkerAgentId(worker.session.backend, worker.session.target.agent),
          }),
          role: 'worker',
          label: worker.session.target.label ?? worker.session.target.agent ?? backendDisplayName(worker.session.backend),
        })),
      ],
    },
    lastActiveAt: updatedAt,
    lastMessage: buildSymphonyMessageIri(webId, plan, message),
    lastMessagePreview: normalizeTitle(message.content, 100),
    createdAt,
    updatedAt,
  } as ChatInsert
}

export function buildSymphonyThreadRows(
  plan: SymphonyRunPlan,
  webId: string,
  stage: SymphonyControlStage,
): ThreadInsert[] {
  return collectSymphonyThreadProjectionGroups(plan, webId)
    .map((group) => buildSymphonyThreadRow(plan, webId, stage, group))
}

export function buildSymphonyThreadRow(
  plan: SymphonyRunPlan,
  webId: string,
  stage: SymphonyControlStage,
  group?: SymphonyThreadProjectionGroup,
): ThreadInsert {
  const workers = group?.workers ?? plan.workers
  const primaryWorker = workers[0] ?? {
    task: plan.task,
    taskRecord: plan.taskRecord,
    delivery: plan.delivery,
    session: plan.session,
  }
  const createdAt = safeDate(primaryWorker.session.createdAt)
  const updatedAt = safeDate(primaryWorker.session.updatedAt)
  const chat = group?.chat ?? selectTargetChatIri(plan.session.target?.chat, webId, plan)
  const thread = group?.thread ?? selectTargetThreadIri(plan.session.target?.thread, webId, plan)
  const workspace = pathToWorkspaceUri(primaryWorker.session.cwd) ?? pathToWorkspaceUri(plan.session.cwd)

  return {
    id: threadRepository.idForChat(chat, thread),
    parent: chat,
    title: normalizeTitle(plan.issue.title || plan.issue.description || 'Symphony Task'),
    ...(workspace ? { workspace } : {}),
    metadata: {
      kind: 'symphony-run',
      surface: 'symphony',
      stage,
      status: primaryWorker.session.status,
      issue: plan.issue.uri,
      task: primaryWorker.task,
      delivery: primaryWorker.delivery.uri,
      session: primaryWorker.session.uri,
      issuer: plan.issue.issuer,
      workers: workers.map((worker) => buildSymphonyWorkerSummary(plan, webId, worker)),
      backend: primaryWorker.session.backend,
      mode: primaryWorker.session.mode,
      model: primaryWorker.session.model,
      workspacePath: primaryWorker.session.cwd,
      workspace: buildSymphonyWorkspaceMetadata(plan, primaryWorker),
      reconciler: buildSymphonyReconcilerMetadata(primaryWorker),
      autoModeSessionId: primaryWorker.session.autoModeSessionId,
      exitCode: primaryWorker.session.exitCode,
      error: primaryWorker.session.error ?? primaryWorker.delivery.error ?? plan.issue.error,
      target: primaryWorker.session.target,
    },
    createdAt,
    updatedAt,
  } as ThreadInsert
}

export function buildSymphonyStatusMessageRow(
  plan: SymphonyRunPlan,
  webId: string,
  stage: SymphonyControlStage,
): MessageInsert {
  const createdAt = stage === 'planned' ? safeDate(plan.issue.createdAt) : safeDate(plan.session.updatedAt)
  const chat = selectTargetChatIri(plan.session.target?.chat, webId, plan)
  const thread = selectTargetThreadIri(plan.session.target?.thread, webId, plan)
  const secretaryAgent = agentResource.buildIri(webId, { id: SYMPHONY_SECRETARY_AGENT_ID })

  return {
    id: messageResource.buildId({
      id: `${buildSymphonyThreadId(plan)}-${stage}`,
      chat,
      thread,
      createdAt,
    }),
    scope: chat,
    chat,
    thread,
    maker: secretaryAgent,
    role: 'assistant',
    content: buildStatusContent(plan, stage),
    richContent: JSON.stringify({
      blocks: [buildProgressBlock(plan, stage)],
      symphony: {
        stage,
        issue: plan.issue.uri,
        task: plan.task,
        delivery: plan.delivery.uri,
        session: plan.session.uri,
        issuer: plan.issue.issuer,
        workers: plan.workers.map((worker) => ({
          task: worker.task,
          title: worker.taskRecord.title,
          objective: worker.taskRecord.objective,
          acceptanceCriteria: worker.taskRecord.acceptanceCriteria,
          taskStatus: worker.taskRecord.status,
          delivery: worker.delivery.uri,
          session: worker.session.uri,
          backend: worker.session.backend,
          agent: worker.session.target.agent,
          status: worker.session.status,
          autoModeSessionId: worker.session.autoModeSessionId,
          acceptanceReview: worker.taskRecord.acceptanceReview ?? worker.delivery.acceptanceReview ?? worker.session.acceptanceReview,
        })),
      },
    }),
    status: 'completed',
    metadata: {
      surface: 'symphony',
      stage,
      issue: buildSymphonyIssueIri(webId, plan.issue),
      workers: plan.workers.map((worker) => buildSymphonyWorkerSummary(plan, webId, worker)),
    },
    senderName: 'AI Secretary',
    routeTargetAgent: secretaryAgent,
    coordinationId: plan.issue.uri,
    createdAt,
    updatedAt: createdAt,
  } as MessageInsert
}

export function buildSymphonyEvidenceRows(plan: SymphonyRunPlan, webId: string, worker: Worker): EvidenceInsert[] {
  if (worker.session.status !== 'completed' && worker.session.status !== 'failed') {
    return []
  }
  const review = worker.session.acceptanceReview ?? worker.taskRecord.acceptanceReview ?? worker.delivery.acceptanceReview
  const createdAt = safeDate(worker.session.completedAt ?? worker.session.updatedAt)
  const run = buildSymphonyRunIri(webId, worker)
  const task = buildSymphonyTaskIri(webId, worker.task)
  const delivery = buildSymphonyDeliveryIri(webId, worker)
  const issue = buildSymphonyIssueIri(webId, plan.issue)
  const actor = agentResource.buildIri(webId, { id: buildWorkerAgentId(worker.session.backend, worker.session.target.agent) })
  const finalEvidence = {
    id: evidenceResource.buildId({
      id: `${getSymphonyArchiveKey(worker.session.uri)}-final`,
      createdAt,
      about: run,
    }),
    evidenceKind: 'runtime_log',
    about: run,
    issue,
    task,
    delivery,
    run,
    thread: selectWorkerThreadIri(plan, webId, worker),
    summary: review?.summary ?? worker.session.error ?? worker.delivery.error ?? `${worker.taskRecord.title} ${worker.session.status}.`,
    actor,
    outcome: review?.outcome ?? (worker.session.status === 'failed' ? 'blocked' : 'accepted'),
    metadata: {
      surface: 'symphony',
      ...buildSymphonyArchiveMetadata({
        issue: plan.issue.uri,
        task: worker.task,
        delivery: worker.delivery.uri,
        session: worker.session.uri,
      }),
      backend: worker.session.backend,
      autoModeSessionId: worker.session.autoModeSessionId,
      exitCode: worker.session.exitCode,
      error: worker.session.error ?? worker.delivery.error ?? worker.taskRecord.error,
      acceptanceReview: review,
      evidence: review?.evidence ?? [],
      commands: review?.commands ?? [],
      changedFiles: review?.changedFiles ?? [],
      risks: review?.risks ?? [],
      followUps: review?.followUps ?? [],
    },
    createdAt,
  } as EvidenceInsert
  const implementationChangeRequest = review?.implementationChangeRequest
    ? buildSymphonyImplementationChangeRequestEvidenceRow({
      plan,
      webId,
      worker,
      issue,
      task,
      delivery,
      run,
      actor,
      implementationChangeRequest: review.implementationChangeRequest,
    })
    : undefined
  return implementationChangeRequest ? [finalEvidence, implementationChangeRequest] : [finalEvidence]
}

function buildSymphonyImplementationChangeRequestEvidenceRow(input: {
  plan: SymphonyRunPlan
  webId: string
  worker: Worker
  issue: string
  task: string
  delivery: string
  run: string
  actor: string
  implementationChangeRequest: NonNullable<NonNullable<Worker['taskRecord']['acceptanceReview']>['implementationChangeRequest']>
}): EvidenceInsert {
  const createdAt = safeDate(input.implementationChangeRequest.createdAt)
  const sourceRunSteps = (input.worker.runSteps ?? []).map((step) => {
    const row = buildSymphonyRuntimeRunStepRow(input.plan, input.webId, input.worker, step)
    return runStepResource.buildIri(input.webId, { id: row.id, run: row.run })
  })
  return {
    id: evidenceResource.buildId({
      id: `${getSymphonyArchiveKey(input.worker.session.uri)}-implementation-change-request`,
      createdAt,
      about: input.task,
    }),
    evidenceKind: 'review_finding',
    about: input.task,
    issue: input.issue,
    task: input.task,
    delivery: input.delivery,
    run: input.run,
    thread: selectWorkerThreadIri(input.plan, input.webId, input.worker),
    summary: input.implementationChangeRequest.summary,
    source: sourceRunSteps[sourceRunSteps.length - 1] ?? input.run,
    actor: input.actor,
    outcome: 'blocked',
    metadata: {
      surface: 'symphony',
      recordKind: 'implementation_change_request',
      ...buildSymphonyArchiveMetadata({
        issue: input.plan.issue.uri,
        task: input.worker.task,
        delivery: input.worker.delivery.uri,
        session: input.worker.session.uri,
      }),
      implementationChangeRequest: input.implementationChangeRequest,
      sourceRunSteps,
      basedOnRunSteps: input.implementationChangeRequest.basedOnRunSteps,
      recommends: input.implementationChangeRequest.recommendedNextShape,
      invalidates: input.task,
    },
    createdAt,
  } as EvidenceInsert
}

export function buildSymphonyReportRows(plan: SymphonyRunPlan, webId: string, worker: Worker): ReportInsert[] {
  if (worker.session.status !== 'completed' && worker.session.status !== 'failed') {
    return []
  }
  const evidence = buildSymphonyEvidenceRows(plan, webId, worker)
  const review = worker.session.acceptanceReview ?? worker.taskRecord.acceptanceReview ?? worker.delivery.acceptanceReview
  const createdAt = safeDate(worker.session.completedAt ?? worker.session.updatedAt)
  const run = buildSymphonyRunIri(webId, worker)
  const task = buildSymphonyTaskIri(webId, worker.task)
  const delivery = buildSymphonyDeliveryIri(webId, worker)
  const issue = buildSymphonyIssueIri(webId, plan.issue)
  const workerAgent = agentResource.buildIri(webId, { id: buildWorkerAgentId(worker.session.backend, worker.session.target.agent) })
  const secretaryAgent = agentResource.buildIri(webId, { id: SYMPHONY_SECRETARY_AGENT_ID })
  return [{
    id: reportResource.buildId({
      id: `${getSymphonyArchiveKey(worker.session.uri)}-final`,
      task,
      delivery,
      run,
      createdAt,
    }),
    reportKind: ReportKind.HANDOFF,
    status: ReportStatus.PUBLISHED,
    outcome: mapSymphonyReportOutcome(worker, review?.outcome),
    about: run,
    issue,
    task,
    delivery,
    run,
    thread: selectWorkerThreadIri(plan, webId, worker),
    evidence: evidence.map((row) => evidenceResource.buildIri(webId, { id: row.id, createdAt: row.createdAt, about: row.about })),
    summary: review?.summary ?? worker.session.error ?? worker.delivery.error ?? `${worker.taskRecord.title} ${worker.session.status}.`,
    reviewer: secretaryAgent,
    actor: workerAgent,
    source: delivery,
    metricFacts: {
      backend: worker.session.backend,
      mode: worker.session.mode,
      exitCode: worker.session.exitCode,
      autoModeSessionId: worker.session.autoModeSessionId,
    },
    metadata: {
      surface: 'symphony',
      reportKind: 'worker-final-package',
      ...buildSymphonyArchiveMetadata({
        issue: plan.issue.uri,
        task: worker.task,
        delivery: worker.delivery.uri,
        session: worker.session.uri,
      }),
      acceptanceReview: review,
      reusableExtraction: review?.reusableExtraction,
    },
    createdAt,
    publishedAt: createdAt,
    updatedAt: createdAt,
  } as ReportInsert]
}

function buildSymphonyApprovalRequestRow(input: {
  plan: SymphonyRunPlan
  webId: string
  worker: Worker
  request: AutoModeApprovalRequest
  requestKey: string
  createdAt: Date
  source: string
  session: string
  chat: string
  thread: string
  run: string
  task: string
  requester: string
  assignedTo: string
  policyVersion: string
}): ApprovalInsert {
  const approvalOptions = encodeAutoModeApprovalOptions(input.request.approvalOptions)
  const context = encodeRequestContext({
    surface: 'symphony',
    source: input.source,
    requestKind: input.request.kind,
    requester: input.requester,
    decisionSource: 'secretary-policy-or-human',
    valueSource: 'runtime-request',
    message: autoModeApprovalRequestMessage(input.request),
    targetRuntimeSession: input.session,
    run: input.run,
    task: input.task,
    worker: buildSymphonyWorkerSummary(input.plan, input.webId, input.worker),
    routing: {
      firstResponder: SYMPHONY_SECRETARY_AGENT_ID,
      unresolvedSurface: 'inbox',
      rule: 'secretary-before-human',
    },
    ...(input.request.kind === 'command-approval' && input.request.command ? { command: input.request.command } : {}),
    ...(input.request.kind === 'command-approval' && input.request.cwd ? { cwd: input.request.cwd } : {}),
  })

  return {
    id: input.requestKey,
    session: input.session,
    chat: input.chat,
    thread: input.thread,
    toolCallId: extractInteractionToolCallId(input.request, input.requestKey),
    toolName: autoModeApprovalToolName(input.request),
    target: input.run,
    action: autoModeApprovalActionUri(input.request),
    risk: autoModeApprovalRisk(input.request),
    status: 'pending',
    assignedTo: input.assignedTo,
    onBehalfOf: input.webId,
    reason: 'AI Secretary should resolve this runtime approval before escalating to the human user.',
    context,
    ...(approvalOptions ? { approvalOptions } : {}),
    policyVersion: input.policyVersion,
    createdAt: input.createdAt,
    ...(input.request.expiresAt ? { expiresAt: safeDate(input.request.expiresAt) } : {}),
  } as ApprovalInsert
}

function buildSymphonyInputRequestRow(input: {
  plan: SymphonyRunPlan
  webId: string
  worker: Worker
  request: Extract<AutoModeInteractionRequest, { kind: 'user-input' }>
  requestKey: string
  createdAt: Date
  source: string
  session: string
  chat: string
  thread: string
  run: string
  task: string
  requester: string
  assignedTo: string
  policyVersion: string
}): InputRequestInsert {
  const context = encodeRequestContext({
    surface: 'symphony',
    source: input.source,
    requestKind: input.request.kind,
    requester: input.requester,
    decisionSource: 'secretary-policy-or-human',
    valueSource: 'secretary-or-human-response',
    targetRuntimeSession: input.session,
    run: input.run,
    task: input.task,
    worker: buildSymphonyWorkerSummary(input.plan, input.webId, input.worker),
    routing: {
      firstResponder: SYMPHONY_SECRETARY_AGENT_ID,
      unresolvedSurface: 'inbox',
      rule: 'secretary-before-human',
    },
  })

  return {
    id: input.requestKey,
    session: input.session,
    chat: input.chat,
    thread: input.thread,
    run: input.run,
    task: input.task,
    requester: input.requester,
    requestKind: input.request.kind,
    prompt: input.request.message,
    context,
    inputOptions: encodeRequestContext({
      questions: input.request.questions,
    }),
    status: 'pending',
    assignedTo: input.assignedTo,
    onBehalfOf: input.webId,
    reason: 'AI Secretary should answer this runtime input request before escalating to the human user.',
    metadata: {
      surface: 'symphony',
      source: input.source,
      policyVersion: input.policyVersion,
      decisionSource: 'secretary-policy-or-human',
      valueSource: 'secretary-or-human-response',
      requester: input.requester,
      targetRuntimeSession: input.session,
      run: input.run,
      task: input.task,
    },
    createdAt: input.createdAt,
    ...(input.request.expiresAt ? { expiresAt: safeDate(input.request.expiresAt) } : {}),
  } as InputRequestInsert
}

function buildSymphonyInteractionInboxNotificationRow(input: {
  requestKey: string
  createdAt: Date
  actor: string
  controlResource: string
}): InboxNotificationInsert {
  return {
    id: `${input.requestKey}-inbox`,
    actor: input.actor,
    object: input.controlResource,
    createdAt: input.createdAt,
  } as InboxNotificationInsert
}

function buildSymphonyInteractionRunStepRow(input: {
  plan: SymphonyRunPlan
  webId: string
  worker: Worker
  request: AutoModeInteractionRequest
  requestKey: string
  createdAt: Date
  source: string
  run: string
  controlResource: string
  inboxNotification: string
}): RunStepInsert {
  return {
    id: runStepResource.buildId({
      id: `${input.requestKey}-requested`,
      run: input.run,
    }),
    run: input.run,
    stepType: input.request.kind === 'user-input' ? 'input.required' : 'approval.required',
    message: input.request.message,
    payload: {
      surface: 'symphony',
      source: input.source,
      requestKind: input.request.kind,
      issue: buildSymphonyIssueIri(input.webId, input.plan.issue),
      task: buildSymphonyTaskIri(input.webId, input.worker.task),
      delivery: buildSymphonyDeliveryIri(input.webId, input.worker),
      session: buildSymphonyWorkerSessionIri(input.webId, input.worker),
      run: input.run,
      controlResource: input.controlResource,
      inboxNotification: input.inboxNotification,
      routing: {
        firstResponder: SYMPHONY_SECRETARY_AGENT_ID,
        unresolvedSurface: 'inbox',
      },
      request: summarizeInteractionRequest(input.request),
    },
    createdAt: input.createdAt,
  } as RunStepInsert
}

export function buildSymphonyWorkerSummary(
  plan: SymphonyRunPlan,
  webId: string,
  worker: Worker,
): Record<string, unknown> {
  return {
    task: worker.task,
    title: worker.taskRecord.title,
    objective: worker.taskRecord.objective,
    acceptanceCriteria: worker.taskRecord.acceptanceCriteria,
    taskStatus: worker.taskRecord.status,
    delivery: worker.delivery.uri,
    session: worker.session.uri,
    sessionResource: buildSymphonyWorkerSessionIri(webId, worker),
    backend: worker.session.backend,
    agent: worker.session.target.agent,
    status: worker.session.status,
    autoModeSessionId: worker.session.autoModeSessionId,
    target: worker.session.target,
    thread: selectWorkerThreadIri(plan, webId, worker),
    workspace: buildSymphonyWorkspaceMetadata(plan, worker),
    podAccessPolicy: buildSymphonyWorkerPodAccessPolicy(plan, webId, worker),
    reconciler: buildSymphonyReconcilerMetadata(worker),
    acceptanceReview: worker.taskRecord.acceptanceReview ?? worker.delivery.acceptanceReview ?? worker.session.acceptanceReview,
  }
}

export function buildSymphonyReconcilerMetadata(worker: Worker): Record<string, unknown> {
  const fallbackDispatch = createFallbackSymphonyDispatchDecision(worker)
  const taskDecisions = worker.taskRecord.reconciler?.decisions ?? [fallbackDispatch]
  const deliveryDecisions = worker.delivery.reconciler?.decisions ?? [fallbackDispatch]
  const sessionDecisions = worker.session.reconciler?.decisions ?? [fallbackDispatch]
  const allDecisions = [...taskDecisions, ...deliveryDecisions, ...sessionDecisions]
  const latest = lastItem(allDecisions)

  return {
    taskDecisions,
    deliveryDecisions,
    sessionDecisions,
    ...(latest ? { latest } : {}),
  }
}

export function buildSymphonyWorkerPodAccessPolicy(
  plan: SymphonyRunPlan,
  webId: string,
  worker: Worker,
): Record<string, unknown> {
  return {
    version: SYMPHONY_WORKER_POD_ACCESS_POLICY_VERSION,
    authority: '__secretary__-control-lane',
    assigned: {
      issue: buildSymphonyIssueIri(webId, plan.issue),
      task: buildSymphonyTaskIri(webId, worker.task),
      delivery: buildSymphonyDeliveryIri(webId, worker),
      run: buildSymphonyRunIri(webId, worker),
      session: buildSymphonyWorkerSessionIri(webId, worker),
      archive: buildSymphonyArchiveRefs({
        issue: plan.issue.uri,
        task: worker.task,
        delivery: worker.delivery.uri,
        session: worker.session.uri,
      }),
    },
    spaceContract: buildSymphonySpaceContract(plan, webId, worker),
    workspace: buildSymphonyWorkspaceMetadata(plan, worker),
    artifactContract: {
      pathScope: 'worker-environment-local',
      identity: [
        'repoRelativePath',
        'baseRevision',
        'checksum',
        'etag',
        'patchUri',
        'artifactUri',
      ],
      rule: 'absolute-paths-are-not-cross-environment-identities',
    },
    readScope: [
      'assigned-control-records',
      'source-context',
      'existing-evidence',
    ],
    writeScope: [
      'run',
      'runStep',
      'progress',
      'blocker',
      'evidence',
      'deliveryReport',
      'implementationChangeRequest',
    ],
    forbiddenScope: [
      'issueClosure',
      'specTruth',
      'acceptanceCriteria',
      'workSplit',
      'releaseBoundary',
      'roadmapState',
      'grant',
      'siblingWorkerState',
    ],
    noPodFallback: 'return-structured-report-for-secretary-to-persist',
    documentationAuthority: {
      controlRecords: 'pod',
      implementationRecords: 'repository',
      localControlRecords: 'portable-runtime-fallback-or-pod-mirror',
      rule: 'repository-docs-reference-pod-issue-without-becoming-issue-truth',
    },
  }
}

export function buildSymphonySpaceContract(
  plan: SymphonyRunPlan,
  webId: string,
  worker: Worker,
): Record<string, unknown> {
  return {
    control: {
      authority: 'pod-control-records',
      sharedRecords: [
        buildSymphonyIssueIri(webId, plan.issue),
        buildSymphonyTaskIri(webId, worker.task),
        buildSymphonyDeliveryIri(webId, worker),
        buildSymphonyRunIri(webId, worker),
        buildSymphonyWorkerSessionIri(webId, worker),
      ],
    },
    runtimeSession: {
      relation: resolveSymphonyRuntimeSessionRelation(plan, webId, worker),
      secretaryThread: selectTargetThreadIri(plan.issue.thread, webId, plan),
      workerThread: selectWorkerThreadIri(plan, webId, worker),
      workerSession: worker.session.uri,
      topologyRule: 'session-topology-is-explicit-not-derived-from-workspace-sharing',
    },
    workspace: {
      relation: 'thread-environment-scoped',
      allocation: 'thread',
      thread: selectWorkerThreadIri(plan, webId, worker),
      sameThreadSameEnvironmentSharing: 'preferred',
      independentWorkIsolation: 'separate-worktree-when-needed',
      crossEnvironmentIdentity: 'artifact-or-revision-evidence-required',
    },
  }
}

export function buildSymphonyWorkspaceMetadata(plan: SymphonyRunPlan, worker: Worker): Record<string, unknown> {
  const workspace = normalizeWorkerWorkspace(worker.session.workspace ?? plan.session.workspace, worker.session.cwd ?? plan.session.cwd)
  return {
    path: workspace.path,
    kind: workspace.kind,
    ...(workspace.container ? { container: workspace.container } : {}),
    ...(workspace.repository ? { repository: workspace.repository } : {}),
    ...(workspace.branch ? { branch: workspace.branch } : {}),
    ...(workspace.worktree ? { worktree: workspace.worktree } : {}),
    ...(workspace.baseRevision ? { baseRevision: workspace.baseRevision } : {}),
    environment: workspace.environment ?? {
      kind: 'backend-runtime',
      runtime: worker.session.backend,
    },
    pathAuthority: 'worker-environment',
    equivalenceRequires: ['baseRevision', 'checksum-or-etag-or-artifact-uri'],
  }
}

export function buildSymphonyArchiveRefs(refs: SymphonyArchiveRefs): Record<string, string> {
  const archive: Record<string, string> = {
    version: SYMPHONY_ARCHIVE_PROVENANCE_VERSION,
  }
  for (const [key, value] of Object.entries(refs)) {
    if (typeof value === 'string' && value.trim()) {
      archive[key] = value
    }
  }
  return archive
}

export function buildSymphonyArchiveMetadata(refs: SymphonyArchiveRefs): { archive: Record<string, string> } {
  return {
    archive: buildSymphonyArchiveRefs(refs),
  }
}

export function buildSymphonyIssueId(issue: SymphonyIssueRecord): string {
  return getSymphonyArchiveKey(issue.uri)
}

export function buildSymphonyIssueIri(webId: string, issue: SymphonyIssueRecord | string): string {
  return issueResource.buildIri(webId, { id: getSymphonyArchiveKey(typeof issue === 'string' ? issue : issue.uri) })
}

export function normalizeSymphonyIssueIri(webId: string, issue: string): string {
  if (/^https?:\/\//u.test(issue)) {
    return issue
  }
  return buildSymphonyIssueIri(webId, issue)
}

export function buildSymphonyTaskKey(task: string): string {
  return getSymphonyArchiveKey(task)
}

export function buildSymphonyTaskIri(webId: string, task: string): string {
  return taskResource.buildIri(webId, { id: buildSymphonyTaskKey(task) })
}

export function normalizeSymphonyTaskIri(webId: string, task: string): string {
  if (/^https?:\/\//u.test(task)) {
    return task
  }
  return buildSymphonyTaskIri(webId, task)
}

export function buildSymphonyDeliveryIri(webId: string, worker: Worker): string {
  return deliveryResource.buildIri(webId, {
    id: getSymphonyArchiveKey(worker.delivery.uri),
    task: buildSymphonyTaskIri(webId, worker.task),
    createdAt: safeDate(worker.delivery.createdAt),
  })
}

export function buildSymphonyRunIri(webId: string, worker: Worker): string {
  return runResource.buildIri(webId, {
    id: getSymphonyArchiveKey(worker.session.uri),
    task: buildSymphonyTaskIri(webId, worker.task),
    createdAt: safeDate(worker.session.createdAt),
  })
}

export function buildSymphonyWorkerSessionIri(webId: string, worker: Worker): string {
  return sessionResource.buildIri(webId, {
    id: buildSymphonySessionRecordId(worker.session),
    createdAt: worker.session.createdAt,
  })
}

export function buildSymphonyControlSessionIri(webId: string, plan: SymphonyRunPlan): string {
  return sessionResource.buildIri(webId, {
    id: buildSymphonyThreadId(plan),
    createdAt: plan.session.createdAt,
  })
}

export function buildSymphonySessionRecordId(session: Pick<SymphonySessionRecord, 'uri'>): string {
  return session.uri
    .trim()
    .replace(/^urn:undefineds:linx:session:/u, '')
    .replace(/[^a-zA-Z0-9._-]/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '') || 'symphony-session'
}

export function buildSymphonyThreadId(plan: Pick<SymphonyRunPlan, 'session'>): string {
  return buildSymphonySessionRecordId(plan.session)
}

export function buildSymphonyChatUri(webId: string): string {
  return chatRepository.iri(webId, SYMPHONY_CHAT_ID)
}

export function buildTargetChatId(plan: SymphonyRunPlan, webId: string): string {
  return chatRepository.target(selectTargetChatIri(plan.session.target?.chat, webId, plan)).id
}

export function buildSymphonyMessageIri(webId: string, plan: SymphonyRunPlan, row: Pick<MessageInsert, 'id' | 'createdAt'>): string {
  return messageResource.buildIri(webId, {
    id: String(row.id),
    chat: selectTargetChatIri(plan.session.target?.chat, webId, plan),
    thread: selectTargetThreadIri(plan.session.target?.thread, webId, plan),
    createdAt: row.createdAt,
  })
}

export function selectTargetChatIri(value: string | undefined, webId: string, plan?: SymphonyRunPlan): string {
  if (!value) {
    const thread = plan?.session.target?.thread
    if (thread) {
      return chatRepository.iri(webId, threadRepository.chatIdFromRef(thread) ?? SYMPHONY_CHAT_ID)
    }
    return buildSymphonyChatUri(webId)
  }
  return chatRepository.iri(webId, value)
}

export function selectTargetThreadIri(value: string | undefined, webId: string, plan: SymphonyRunPlan): string {
  if (!value) {
    return selectDefaultThreadIri(webId, plan)
  }
  return threadRepository.iriForChat(webId, selectTargetChatIri(plan.session.target?.chat, webId, plan), value)
}

export function selectDefaultThreadIri(webId: string, plan: SymphonyRunPlan): string {
  const targetThread = plan.session.target?.thread
  if (targetThread) {
    return targetThread
  }

  return threadRepository.iriForChat(webId, selectTargetChatIri(plan.session.target?.chat, webId, plan), buildSymphonyThreadId(plan))
}

export function readWorkerChatRef(worker: Worker): string | undefined {
  return worker.session.target?.chat
    ?? worker.session.chat
    ?? worker.taskRecord.chat
    ?? worker.delivery.chat
}

export function readWorkerThreadRef(worker: Worker): string | undefined {
  return worker.session.target?.thread
    ?? worker.session.thread
    ?? worker.taskRecord.thread
    ?? worker.delivery.thread
}

export function readWorkerMessages(worker: Worker): string[] {
  return worker.session.target?.messages
    ?? worker.session.messages
    ?? worker.taskRecord.messages
    ?? worker.delivery.messages
    ?? []
}

export function selectWorkerChatIri(plan: SymphonyRunPlan, webId: string, worker: Worker): string {
  const chat = readWorkerChatRef(worker)
  if (chat) {
    return selectTargetChatIri(chat, webId, plan)
  }

  const thread = readWorkerThreadRef(worker)
  if (thread) {
    return chatRepository.iri(
      webId,
      threadRepository.chatIdFromRef(thread) ?? chatRepository.idFromRef(selectTargetChatIri(undefined, webId, plan)) ?? SYMPHONY_CHAT_ID,
    )
  }

  return selectTargetChatIri(undefined, webId, plan)
}

export function selectWorkerThreadIri(plan: SymphonyRunPlan, webId: string, worker: Worker): string {
  const thread = readWorkerThreadRef(worker)
  if (thread) {
    return selectTargetThreadIri(thread, webId, plan)
  }

  const chat = selectWorkerChatIri(plan, webId, worker)
  if (chat.endsWith('#this')) {
    return `${chat.slice(0, -'#this'.length)}#${encodeURIComponent(buildSymphonySessionRecordId(worker.session))}`
  }

  return selectTargetThreadIri(undefined, webId, plan)
}

export function buildWorkerThreadId(plan: SymphonyRunPlan, webId: string, worker: Worker): string {
  return threadRepository.idFromRef(selectWorkerThreadIri(plan, webId, worker))
    ?? buildSymphonySessionRecordId(worker.session)
}

interface SymphonyThreadProjectionGroup {
  chat: string
  thread: string
  workers: Worker[]
}

function collectSymphonyThreadProjectionGroups(plan: SymphonyRunPlan, webId: string): SymphonyThreadProjectionGroup[] {
  const groups = new Map<string, SymphonyThreadProjectionGroup>()
  for (const worker of plan.workers) {
    const chat = selectWorkerChatIri(plan, webId, worker)
    const thread = selectWorkerThreadIri(plan, webId, worker)
    const key = `${chat}\0${thread}`
    const existing = groups.get(key)
    if (existing) {
      existing.workers.push(worker)
    } else {
      groups.set(key, { chat, thread, workers: [worker] })
    }
  }
  return Array.from(groups.values())
}

export function buildWorkerAgentId(backend: AutoModeWorkerBackend, agent?: string): string {
  const suffix = (agent ?? `${backend}-worker`)
    .trim()
    .replace(/[^a-zA-Z0-9._-]/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
  return `symphony-${suffix || `${backend}-worker`}`
}

export function mapSymphonyTaskStatus(status: string): string {
  if (status === 'running') return 'active'
  if (status === 'pending') return 'open'
  return status
}

export function mapSymphonyRunStatus(status: string): string {
  if (status === 'planned') return 'queued'
  if (status === 'running') return 'running'
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  return 'queued'
}

export function mapSymphonyReportOutcome(worker: Worker, outcome?: string): string {
  if (worker.session.status === 'failed') return ReportOutcome.BLOCKED
  if (outcome === 'accepted') return ReportOutcome.ACCEPTED
  if (outcome === 'rejected') return ReportOutcome.REJECTED
  if (outcome === 'blocked') return ReportOutcome.BLOCKED
  if (outcome === 'follow_up') return ReportOutcome.DEFERRED
  return ReportOutcome.ACCEPTED
}

export function inferSymphonyControlStage(plan: SymphonyRunPlan): SymphonyControlStage {
  if (plan.workers.some((worker) => worker.session.status === 'failed')) return 'failed'
  if (plan.workers.every((worker) => worker.session.status === 'completed')) return 'completed'
  if (plan.workers.some((worker) => worker.session.status === 'running')) return 'running'
  return 'planned'
}

export function buildStatusContent(plan: SymphonyRunPlan, stage: SymphonyControlStage): string {
  if (stage === 'planned') {
    return `I created a Symphony issue with ${plan.workers.length} worker${plan.workers.length === 1 ? '' : 's'}.\n\n${plan.issue.description ?? plan.issue.title}`
  }
  if (stage === 'running') {
    const running = plan.workers
      .filter((worker) => worker.session.status === 'running')
      .map((worker) => worker.session.target.label ?? worker.session.target.agent ?? backendDisplayName(worker.session.backend))
    return `Symphony workers are active: ${running.length > 0 ? running.join(', ') : plan.workers.length}.\n\nIssue: ${plan.issue.uri}`
  }
  if (stage === 'completed') {
    return `Symphony issue completed.\n\nWorkers: ${plan.workers.length}`
  }
  return `Symphony issue failed.\n\n${plan.issue.error ?? plan.session.error ?? plan.delivery.error ?? 'Backend did not complete successfully.'}`
}

function buildProgressBlock(plan: SymphonyRunPlan, stage: SymphonyControlStage): Record<string, unknown> {
  const statusByStage: Record<SymphonyControlStage, 'pending' | 'running' | 'done' | 'error'> = {
    planned: 'pending',
    running: 'running',
    completed: 'done',
    failed: 'error',
  }
  const workerSteps = plan.workers.map((worker, index) => ({
    id: `${buildSymphonyThreadId(plan)}-worker-${index + 1}`,
    label: `${worker.session.target.label ?? worker.session.target.agent ?? backendDisplayName(worker.session.backend)} worker`,
    status: worker.session.status === 'completed'
      ? 'done'
      : worker.session.status === 'failed'
        ? 'error'
        : worker.session.status === 'running'
          ? 'running'
          : statusByStage[stage],
    detail: worker.session.autoModeSessionId ?? worker.session.uri,
  }))
  return {
    type: 'task_progress',
    task: plan.task,
    title: plan.issue.title,
    steps: [
      {
        id: `${buildSymphonyThreadId(plan)}-plan`,
        label: 'Secretary created task projection',
        status: stage === 'planned' ? 'running' : 'done',
        detail: plan.issue.uri,
      },
      ...workerSteps,
      {
        id: `${buildSymphonyThreadId(plan)}-finish`,
        label: 'Archive Symphony result',
        status: stage === 'completed' ? 'done' : stage === 'failed' ? 'error' : 'pending',
        detail: plan.issue.error ?? plan.session.error ?? `${plan.workers.length} worker${plan.workers.length === 1 ? '' : 's'}`,
      },
    ],
    currentStep: stage === 'planned' ? 1 : stage === 'running' ? 2 : workerSteps.length + 2,
    totalSteps: workerSteps.length + 2,
  }
}

function createFallbackSymphonyDispatchDecision(worker: Worker) {
  return decideThreadControlEvent({
    policy: {
      kind: 'symphony',
      assignedWorkerAgent: worker.delivery.targetAgent,
      secretaryAgent: SYMPHONY_SECRETARY_AGENT_ID,
    },
    event: {
      type: 'delivery.submitted',
      ...(readWorkerChatRef(worker) ? { chat: readWorkerChatRef(worker) } : {}),
      ...(readWorkerThreadRef(worker) ? { thread: readWorkerThreadRef(worker) } : {}),
      resource: worker.delivery.uri,
      actor: {
        id: SYMPHONY_SECRETARY_AGENT_ID,
        role: 'secretary',
      },
      data: {
        deliveryType: worker.delivery.type,
        issue: worker.delivery.issue,
        task: worker.delivery.task,
        delivery: worker.delivery.uri,
        session: worker.session.uri,
      },
    },
    now: safeDate(worker.delivery.createdAt),
    randomId: `${worker.delivery.uri}-dispatch`,
  }).summary
}

function resolveSymphonyRuntimeSessionRelation(plan: SymphonyRunPlan, webId: string, worker: Worker): string {
  const secretaryThread = selectTargetThreadIri(plan.issue.thread, webId, plan)
  const workerThread = selectWorkerThreadIri(plan, webId, worker)
  if (secretaryThread === workerThread) {
    return 'same-thread-or-room'
  }
  return 'runtime-projected-worker-session'
}

function normalizeWorkerWorkspace(workspace: WorkerWorkspace | undefined, fallbackPath: string): WorkerWorkspace {
  return {
    path: workspace?.path ?? fallbackPath,
    kind: workspace?.kind ?? 'folder',
    ...(workspace?.repository ? { repository: workspace.repository } : {}),
    ...(workspace?.branch ? { branch: workspace.branch } : {}),
    ...(workspace?.worktree ? { worktree: workspace.worktree } : {}),
    ...(workspace?.container ? { container: workspace.container } : {}),
    ...(workspace?.baseRevision ? { baseRevision: workspace.baseRevision } : {}),
    ...(workspace?.environment ? { environment: workspace.environment } : {}),
  }
}

function backendDisplayName(backend: AutoModeWorkerBackend): string {
  if (backend === 'codex') return 'Codex'
  if (backend === 'claude') return 'Claude Code'
  if (backend === 'codebuddy') return 'CodeBuddy'
  return backend
}

function normalizeTitle(text: string, width = 72): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return 'Symphony Task'
  if (normalized.length <= width) return normalized
  return `${normalized.slice(0, Math.max(0, width - 3))}...`
}

function pathToWorkspaceUri(path: string): string | undefined {
  if (!path.trim()) {
    return undefined
  }
  return `file://${path}`
}

function defaultInteractionSource(worker: Worker): string {
  if (worker.session.backend === 'codex') {
    return 'codex-app-server'
  }
  return 'runtime'
}

function stableInteractionRequestKey(
  request: AutoModeInteractionRequest,
  randomId: string | undefined,
): string {
  const suffix = (randomId?.trim() || stableHash(JSON.stringify(summarizeInteractionRequest(request))))
    .replace(/[^a-zA-Z0-9._-]/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 48)
  return `symphony-${request.kind}-${suffix || 'runtime-request'}`
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function extractInteractionToolCallId(request: AutoModeApprovalRequest, fallback: string): string {
  const raw = recordFromUnknown(request.raw)
  const params = recordFromUnknown(raw?.params)
  const toolCall = recordFromUnknown(params?.toolCall)
  return stringFromUnknown(toolCall?.toolCallId)
    ?? stringFromUnknown(params?.toolCallId)
    ?? stringFromUnknown(raw?.id)
    ?? fallback
}

function summarizeInteractionRequest(request: AutoModeInteractionRequest): Record<string, unknown> {
  if (request.kind === 'user-input') {
    return {
      kind: request.kind,
      message: request.message,
      questions: request.questions.map((question) => ({
        id: question.id,
        header: question.header,
        question: question.question,
        options: question.options,
      })),
      ...(request.timeoutMs ? { timeoutMs: request.timeoutMs } : {}),
      ...(request.expiresAt ? { expiresAt: request.expiresAt } : {}),
    }
  }

  return {
    kind: request.kind,
    message: request.message,
    toolName: autoModeApprovalToolName(request),
    action: autoModeApprovalActionUri(request),
    risk: autoModeApprovalRisk(request),
    ...(request.kind === 'command-approval' && request.command ? { command: request.command } : {}),
    ...(request.kind === 'command-approval' && request.cwd ? { cwd: request.cwd } : {}),
    ...(request.kind === 'file-change-approval' && request.reason ? { reason: request.reason } : {}),
    ...(request.kind === 'permissions-approval' ? { permissions: request.permissions } : {}),
    ...(request.approvalOptions ? { approvalOptions: request.approvalOptions } : {}),
    ...(request.timeoutMs ? { timeoutMs: request.timeoutMs } : {}),
    ...(request.expiresAt ? { expiresAt: request.expiresAt } : {}),
  }
}

function encodeRequestContext(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ error: 'unserializable_context' })
  }
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return recordFromUnknown(value)
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeString(value: unknown): string | undefined {
  return stringFromUnknown(value)
}

function readRuntimeEventDate(event: unknown): Date | undefined {
  const record = asRecord(event)
  if (!record) {
    return undefined
  }
  if (record.now instanceof Date) {
    return record.now
  }
  return safeOptionalDate(record.createdAt ?? record.created_at ?? record.timestamp)
}

function safeOptionalDate(value: unknown): Date | undefined {
  if (!value) {
    return undefined
  }
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isFinite(date.getTime()) ? date : undefined
}

function toIsoDate(value: unknown): string {
  return (safeOptionalDate(value) ?? new Date()).toISOString()
}

function lastItem<T>(items: T[] | undefined): T | undefined {
  return items && items.length > 0 ? items[items.length - 1] : undefined
}

function safeDate(input: string | Date | undefined): Date {
  const date = input instanceof Date ? input : new Date(input ?? Date.now())
  return Number.isFinite(date.getTime()) ? date : new Date()
}
