import type { AutoModeMode, AutoModeWorkerBackend } from './auto-mode.js'
import {
  summarizeReconcileDecision,
  type ReconcileDecision,
  type ReconcileDecisionSummary,
  type ReconcilerActorRef,
  type ReconcilerClientContext,
  type ReconcilerEventType,
  type ReconcilerNotificationEvent,
  type ThreadControlEvent,
  type ThreadPolicy,
  type ThreadPolicyKind,
  type WakeJobSummary,
} from './reconciler.js'
import { decideThreadControlEvent } from './thread-reconciler-controller.js'
import type { AgentWorkspace, AgentWorkspaceEnvironment, AgentWorkspaceKind } from './workspace.js'

export const SYMPHONY_HOME_DIRNAME = 'symphony'
export const SYMPHONY_IDEAS_DIRNAME = 'ideas'
export const SYMPHONY_ISSUES_DIRNAME = 'issues'
export const SYMPHONY_TASKS_DIRNAME = 'tasks'
export const SYMPHONY_DELIVERIES_DIRNAME = 'deliveries'
export const SYMPHONY_SESSIONS_DIRNAME = 'sessions'
export const SYMPHONY_RUN_STEPS_DIRNAME = 'run-steps'

export const SYMPHONY_IDEA_FILE_NAME = 'idea.json'
export const SYMPHONY_ISSUE_FILE_NAME = 'issue.json'
export const SYMPHONY_TASK_FILE_NAME = 'task.json'
export const SYMPHONY_DELIVERY_FILE_NAME = 'delivery.json'
export const SYMPHONY_SESSION_FILE_NAME = 'session.json'
export const SYMPHONY_RUN_STEP_FILE_NAME = 'run-step.json'

const SYMPHONY_URI_PREFIX = 'urn:undefineds:linx'

export type WorkerWorkspaceKind = AgentWorkspaceKind
export type SymphonyIdeaStatus = 'captured' | 'exploring' | 'candidate' | 'promoted' | 'deferred' | 'rejected' | 'superseded'
export type SymphonyIdeaCommitment = 'thought' | 'direction' | 'tentative_decision' | 'committed'
export type SymphonyIssueStatus = 'open' | 'triaging' | 'in_progress' | 'blocked' | 'resolved' | 'closed'
export type SymphonyTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked'
export type SymphonyDeliveryStatus = 'pending' | 'dispatched' | 'completed' | 'failed'
export type SymphonySessionStatus = 'planned' | 'running' | 'completed' | 'failed'
export type SymphonyProjectionRole = 'user' | 'system' | 'tool'
export type SymphonyResourceKind = 'idea' | 'issue' | 'task' | 'delivery' | 'session' | 'runStep'
export type SymphonyRuntimeEventType =
  | 'session.started'
  | 'session.resumed'
  | 'run.started'
  | 'run.step'
  | 'approval.required'
  | 'input.required'
  | 'worker.blocked'
  | 'delivery.submitted'
  | 'delivery.completed'
  | 'delivery.failed'
  | 'run.completed'
  | 'run.failed'
export type SymphonyFollowUpCandidateKind =
  | 'new_defect'
  | 'missing_shared_abstraction'
  | 'app_local_glue'
  | 'models_gap'
  | 'orm_gap'
  | 'runtime_api_gap'
  | 'shared_runtime_utility'
  | 'test_harness'
  | 'live_verification_gap'
  | 'documentation'
  | 'cleanup'
  | 'other'
export type SymphonyFollowUpDisposition = 'same_issue_task' | 'new_issue' | 'idea' | 'evidence_only' | 'ask_user'
export type SymphonyAcceptanceOutcome = 'accepted' | 'rejected' | 'blocked' | 'follow_up'
export type SymphonyRecordSource = 'cli' | 'web' | 'service' | 'tui' | 'mcp' | 'runtime' | 'control-plane'

export interface SymphonyReconcilerState {
  decisions: ReconcileDecisionSummary[]
}

export type SymphonyThreadReconcilerNextAction =
  | 'noop'
  | 'wake_secretary'
  | 'wake_worker'
  | 'wake_reviewer'
  | 'notify_user'

export interface SymphonyThreadReconcileEventInput {
  id?: string
  type?: ReconcilerEventType
  eventType?: ReconcilerEventType
  chat?: string
  thread?: string
  resource?: string
  actor?: ReconcilerActorRef
  content?: string
  message?: string
  createdAt?: string
  data?: Record<string, unknown>
  symphonyHookEvent?: boolean
  hookEventName?: string
  sessionId?: string
  source?: string
  [key: string]: unknown
}

export interface ReconcileSymphonyThreadEventsInput {
  policy?: ThreadPolicyKind | ThreadPolicy
  chat?: string
  thread?: string
  randomId?: string
  now?: Date | string
  client?: ReconcilerClientContext
  events?: SymphonyThreadReconcileEventInput[]
}

export interface ReconcileSymphonyThreadEventsResult {
  policyKind: ThreadPolicyKind
  chat?: string
  thread: string
  eventCount: number
  decisions: ReconcileDecisionSummary[]
  wakeJobs: WakeJobSummary[]
  notificationEvents: ReconcilerNotificationEvent[]
  nextAction: SymphonyThreadReconcilerNextAction
  summary: string
}

export type WorkerWorkspace = AgentWorkspace & { path: string }
export type WorkerEnvironment = AgentWorkspaceEnvironment

export interface SymphonySupervisorPolicy {
  strategy: 'interval'
  intervalMs: number
  immediateWakeKinds: string[]
}

export interface SymphonyIssuerRef extends SymphonyChatThreadRef {
  source: 'user' | 'secretary' | 'system'
  webId?: string
  agent?: string
  label?: string
}

export interface SymphonyChatThreadRef {
  chat?: string
  thread?: string
  messages?: string[]
}

export type SymphonyDelegationTargetSource = 'active-session' | 'group-chat' | 'ai-contact' | 'explicit-backend' | 'default'

export interface SymphonyDelegationTarget extends SymphonyChatThreadRef {
  source: SymphonyDelegationTargetSource
  backend: AutoModeWorkerBackend
  agent?: string
  label?: string
}

export interface SymphonyIdeaRecord extends SymphonyChatThreadRef {
  uri: string
  summary: string
  input?: string
  status: SymphonyIdeaStatus
  commitment: SymphonyIdeaCommitment
  source: SymphonyRecordSource
  affectedArea?: string
  currentUnderstanding?: string
  openQuestions: string[]
  relatedRecords: string[]
  conflicts: string[]
  nextStep?: string
  promotedTo?: string
  createdAt: string
  updatedAt: string
}

export interface SymphonyIssueRecord extends SymphonyChatThreadRef {
  uri: string
  title: string
  description?: string
  status: SymphonyIssueStatus
  priority: 'low' | 'medium' | 'high' | 'urgent'
  source: SymphonyRecordSource
  issuer: SymphonyIssuerRef
  parentIssue?: string
  labels?: string[]
  tasks: string[]
  deliveries: string[]
  sessions: string[]
  createdAt: string
  updatedAt: string
  closedAt?: string
  error?: string
}

export interface SymphonyTaskRecord extends SymphonyChatThreadRef {
  uri: string
  issue: string
  title: string
  objective: string
  acceptanceCriteria: string[]
  status: SymphonyTaskStatus
  target: SymphonyDelegationTarget
  backend: AutoModeWorkerBackend
  agent?: string
  delivery: string
  session: string
  acceptanceReview?: SymphonyAcceptanceReview
  reconciler?: SymphonyReconcilerState
  createdAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export interface SymphonyDeliveryRecord extends SymphonyChatThreadRef {
  uri: string
  issue: string
  task: string
  type: 'task_dispatch'
  status: SymphonyDeliveryStatus
  sourceAgent: '__secretary__'
  targetBackend: AutoModeWorkerBackend
  targetAgent: string
  target: SymphonyDelegationTarget
  projection: {
    runtimeRole: SymphonyProjectionRole
    prompt: string
  }
  session?: string
  autoModeSessionId?: string
  acceptanceReview?: SymphonyAcceptanceReview
  reconciler?: SymphonyReconcilerState
  createdAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export interface SymphonySessionRecord extends SymphonyChatThreadRef {
  uri: string
  issue: string
  task: string
  delivery: string
  backend: AutoModeWorkerBackend
  mode: AutoModeMode
  secretaryAutoEnabled?: boolean
  status: SymphonySessionStatus
  cwd: string
  workspace?: WorkerWorkspace
  target: SymphonyDelegationTarget
  model?: string
  supervisor?: SymphonySupervisorPolicy
  autoModeSessionId?: string
  dryRun?: boolean
  exitCode?: number | null
  acceptanceReview?: SymphonyAcceptanceReview
  reconciler?: SymphonyReconcilerState
  createdAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export interface SymphonyRunPlan {
  issue: SymphonyIssueRecord
  task: string
  taskRecord: SymphonyTaskRecord
  delivery: SymphonyDeliveryRecord
  session: SymphonySessionRecord
  workers: SymphonyWorkerPlan[]
  followUpIssues?: SymphonyIssueRecord[]
}

export interface SymphonyWorkerPlan {
  task: string
  taskRecord: SymphonyTaskRecord
  delivery: SymphonyDeliveryRecord
  session: SymphonySessionRecord
  runSteps?: SymphonyRunStepRecord[]
}

export interface SymphonyRunStepRecord {
  uri: string
  issue: string
  task: string
  delivery: string
  session: string
  stepType: SymphonyRuntimeEventType
  message: string
  payload?: Record<string, unknown>
  createdAt: string
}

export interface SymphonyWorkerSpec extends Partial<SymphonyDelegationTarget> {
  title?: string
  objective?: string
  acceptanceCriteria?: string[]
  model?: string
  supervisorIntervalMs?: number
  workspace?: Partial<WorkerWorkspace>
}

export interface SymphonyFollowUpCandidate {
  kind: SymphonyFollowUpCandidateKind
  summary: string
  evidence?: string[]
  suggestedDisposition?: SymphonyFollowUpDisposition
  reason?: string
  requiredBeforeAcceptance?: boolean
  userDecisionRequired?: boolean
  targetPackage?: string
}

export interface SymphonyClassifiedFollowUp extends SymphonyFollowUpCandidate {
  disposition: SymphonyFollowUpDisposition
  reason: string
  source: 'worker_report' | 'secretary_inference'
  issue?: string
}

export interface SymphonyReusableExtractionDecision {
  disposition: SymphonyFollowUpDisposition
  reason: string
  candidates: SymphonyClassifiedFollowUp[]
}

export interface SymphonyImplementationChangeRequest {
  trigger: 'worker_failed' | 'acceptance_blocked'
  task: string
  delivery: string
  session: string
  summary: string
  failedAssumption: string
  evidence: string[]
  risks: string[]
  recommendedNextShape: 'retry' | 'split' | 'redesign' | 'defer' | 'reduce_scope' | 'request_authority'
  basedOnRunSteps: string[]
  createdAt: string
}

export interface SymphonyFinalReportEnvelope {
  summary?: string
  evidence?: string[]
  risks?: string[]
  changedFiles?: string[]
  commands?: string[]
  followUps?: SymphonyFollowUpCandidate[]
}

export interface SymphonyRuntimeDeliveryEvent {
  stepType: SymphonyRuntimeEventType
  message?: string
  payload?: Record<string, unknown>
  createdAt?: string
  randomId?: string
}

export interface SymphonyRuntimeDeliveryResult {
  status: 'completed' | 'failed'
  exitCode: number
  autoModeSessionId?: string
  reportText?: string
  events: SymphonyRuntimeDeliveryEvent[]
}

export interface SymphonyAcceptanceReview {
  outcome: SymphonyAcceptanceOutcome
  accepted: boolean
  reviewedBy: '__secretary__'
  reviewedAt: string
  summary: string
  evidence: string[]
  risks: string[]
  changedFiles: string[]
  commands: string[]
  followUps: SymphonyClassifiedFollowUp[]
  reusableExtraction: SymphonyReusableExtractionDecision
  implementationChangeRequest?: SymphonyImplementationChangeRequest
}

export interface ReconcileSymphonyWorkerDeliveryInput {
  issue: SymphonyIssueRecord
  worker: SymphonyWorkerPlan
  status: 'completed' | 'failed'
  exitCode: number
  autoModeSessionId?: string
  reportText?: string
  now?: Date
  randomId?: string
}

export interface ReconcileSymphonyWorkerDeliveryResult {
  worker: SymphonyWorkerPlan
  acceptanceReview: SymphonyAcceptanceReview
  followUpIssues: SymphonyIssueRecord[]
}

export interface StartSymphonyWorkerRunInput {
  worker: SymphonyWorkerPlan
  decision?: ReconcileDecision | ReconcileDecisionSummary
  now?: Date
  randomId?: string
  message?: string
  payload?: Record<string, unknown>
}

export interface RecordSymphonyWorkerRuntimeEventInput {
  worker: SymphonyWorkerPlan
  stepType: SymphonyRuntimeEventType
  message?: string
  payload?: Record<string, unknown>
  now?: Date
  randomId?: string
}

export interface CompleteSymphonyWorkerRunInput {
  issue: SymphonyIssueRecord
  worker: SymphonyWorkerPlan
  status: 'completed' | 'failed'
  exitCode: number
  autoModeSessionId?: string
  reportText?: string
  decision?: ReconcileDecision | ReconcileDecisionSummary
  now?: Date
  randomId?: string
}

export interface CreateSymphonyRunStepInput {
  worker: SymphonyWorkerPlan
  stepType: SymphonyRuntimeEventType
  message?: string
  payload?: Record<string, unknown>
  now?: Date
  randomId?: string
}

export interface SymphonyIssueStatusUpdates {
  error?: string
  closedAt?: string
  now?: Date | string
}

export interface SymphonyTaskStatusUpdates {
  error?: string
  completedAt?: string
  now?: Date | string
}

export interface SymphonyDeliveryStatusUpdates {
  error?: string
  autoModeSessionId?: string
  completedAt?: string
  now?: Date | string
}

export interface SymphonySessionStatusUpdates {
  error?: string
  autoModeSessionId?: string
  exitCode?: number | null
  dryRun?: boolean
  completedAt?: string
  now?: Date | string
}

export interface FinalizeSymphonyRunPlanAfterWorkersInput {
  plan: SymphonyRunPlan
  workers?: SymphonyWorkerPlan[]
  followUpIssues?: SymphonyIssueRecord[]
  now?: Date | string
}

export interface FinalizeSymphonyRunPlanAfterWorkersResult {
  plan: SymphonyRunPlan
  status: 'completed' | 'failed'
  issueStatus: 'resolved' | 'blocked'
  blocker?: {
    kind: 'worker_failure' | 'acceptance'
    error: string
    exitCode?: number
    worker: SymphonyWorkerPlan
  }
}

export interface CreateSymphonyRunPlanInput {
  objective: string
  source?: SymphonyRecordSource
  title?: string
  acceptanceCriteria?: string[]
  workspacePath: string
  workspaceKind?: WorkerWorkspaceKind
  repository?: string
  branch?: string
  worktree?: string
  container?: string
  baseRevision?: string
  environment?: Partial<WorkerEnvironment>
  backend: AutoModeWorkerBackend
  mode: AutoModeMode
  secretaryAutoEnabled?: boolean
  model?: string
  workerModel?: string
  workerSupervisorIntervalMs?: number
  chat?: string
  thread?: string
  messages?: string[]
  issuer?: Partial<SymphonyIssuerRef>
  target?: Partial<SymphonyDelegationTarget>
  workers?: SymphonyWorkerSpec[]
  now?: Date
  randomId?: string
}

export function createSymphonyIdeaUri(options: { now?: Date; randomId?: string } = {}): string {
  return createSymphonyResourceUri('idea', options)
}

export function createSymphonyIssueUri(options: { now?: Date; randomId?: string } = {}): string {
  return createSymphonyResourceUri('issue', options)
}

export function createTaskUri(options: { now?: Date; randomId?: string } = {}): string {
  return createSymphonyResourceUri('task', options)
}

export function createSymphonyDeliveryUri(options: { now?: Date; randomId?: string } = {}): string {
  return createSymphonyResourceUri('delivery', options)
}

export function createSymphonySessionUri(options: { now?: Date; randomId?: string } = {}): string {
  return createSymphonyResourceUri('session', options)
}

export function createSymphonyRunStepUri(options: { now?: Date; randomId?: string } = {}): string {
  return createSymphonyResourceUri('runStep', options)
}

export function getSymphonyArchiveRelativePaths(uri: string, kind: SymphonyResourceKind): {
  dir: string
  file: string
} {
  const key = getSymphonyArchiveKey(uri)
  const dirNameByKind: Record<SymphonyResourceKind, string> = {
    idea: SYMPHONY_IDEAS_DIRNAME,
    issue: SYMPHONY_ISSUES_DIRNAME,
    task: SYMPHONY_TASKS_DIRNAME,
    delivery: SYMPHONY_DELIVERIES_DIRNAME,
    session: SYMPHONY_SESSIONS_DIRNAME,
    runStep: SYMPHONY_RUN_STEPS_DIRNAME,
  }
  const fileNameByKind: Record<SymphonyResourceKind, string> = {
    idea: SYMPHONY_IDEA_FILE_NAME,
    issue: SYMPHONY_ISSUE_FILE_NAME,
    task: SYMPHONY_TASK_FILE_NAME,
    delivery: SYMPHONY_DELIVERY_FILE_NAME,
    session: SYMPHONY_SESSION_FILE_NAME,
    runStep: SYMPHONY_RUN_STEP_FILE_NAME,
  }
  const dirName = dirNameByKind[kind]
  const fileName = fileNameByKind[kind]

  return {
    dir: `${dirName}/${key}`,
    file: `${dirName}/${key}/${fileName}`,
  }
}

export function createRunPlan(input: CreateSymphonyRunPlanInput): SymphonyRunPlan {
  const now = input.now ?? new Date()
  const timestamp = now.toISOString()
  const randomId = normalizeSymphonyRandomId(input.randomId)
  const uriOptions = { now, randomId }
  const objective = normalizeRequiredText(input.objective, 'objective')
  const title = normalizeOptionalText(input.title) ?? createSymphonyTitle(objective)
  const source = input.source ?? 'cli'
  const acceptanceCriteria = normalizeSymphonyAcceptanceCriteria(input.acceptanceCriteria)
  const issuer = normalizeSymphonyIssuer(input)
  const workerSpecs = normalizeSymphonyWorkerSpecs(input)
  const primaryTarget = workerSpecs[0]!.target
  const chatThread = normalizeSymphonyChatThreadRef({
    chat: normalizeOptionalText(input.chat) ?? primaryTarget.chat,
    thread: normalizeOptionalText(input.thread) ?? primaryTarget.thread,
    messages: input.messages ?? primaryTarget.messages,
  })
  const workspace: WorkerWorkspace = {
    path: normalizeRequiredText(input.workspacePath, 'workspacePath'),
    kind: input.workspaceKind ?? 'folder',
    ...(normalizeOptionalText(input.repository) ? { repository: normalizeOptionalText(input.repository) } : {}),
    ...(normalizeOptionalText(input.branch) ? { branch: normalizeOptionalText(input.branch) } : {}),
    ...(normalizeOptionalText(input.worktree) ? { worktree: normalizeOptionalText(input.worktree) } : {}),
    ...(normalizeOptionalText(input.container) ? { container: normalizeOptionalText(input.container) } : {}),
    ...(normalizeOptionalText(input.baseRevision) ? { baseRevision: normalizeOptionalText(input.baseRevision) } : {}),
    environment: normalizeSymphonyWorkerEnvironment(input.environment, input.backend),
  }
  const issueUri = createSymphonyIssueUri(uriOptions)
  const workerUris = workerSpecs.map((_, index) => createSymphonyWorkerUris(uriOptions, index))

  const issue: SymphonyIssueRecord = {
    uri: issueUri,
    title,
    description: objective,
    status: 'open',
    priority: 'medium',
    source,
    issuer,
    tasks: workerUris.map((item) => item.task),
    deliveries: workerUris.map((item) => item.delivery),
    sessions: workerUris.map((item) => item.session),
    ...chatThread,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const workers = workerSpecs.map((spec, index): SymphonyWorkerPlan => {
    const uris = workerUris[index]!
    const target = spec.target
    const workerWorkspace = normalizeSymphonyWorkerWorkspace(workspace, spec.workspace, target.backend)
    const workerObjective = spec.objective
    const workerTitle = spec.title ?? createSymphonyTitle(workerObjective)
    const workerAcceptanceCriteria = spec.acceptanceCriteria.length > 0
      ? spec.acceptanceCriteria
      : acceptanceCriteria
    const workerChatThread = normalizeSymphonyChatThreadRef({
      chat: target.chat ?? chatThread.chat,
      thread: target.thread ?? chatThread.thread,
      messages: target.messages ?? chatThread.messages,
    })
    const targetAgent = target.agent ?? `${target.backend}-worker`
    const dispatchReconciler = createSymphonyDispatchReconcilerState({
      issue: issueUri,
      task: uris.task,
      delivery: uris.delivery,
      session: uris.session,
      chat: workerChatThread.chat,
      thread: workerChatThread.thread,
      targetAgent,
      now,
      randomId: `${randomId}-w${index + 1}-dispatch`,
    })
    const taskRecord: SymphonyTaskRecord = {
      uri: uris.task,
      issue: issueUri,
      title: workerTitle,
      objective: workerObjective,
      acceptanceCriteria: workerAcceptanceCriteria,
      status: 'pending',
      target,
      backend: target.backend,
      ...(target.agent ? { agent: target.agent } : {}),
      delivery: uris.delivery,
      session: uris.session,
      reconciler: dispatchReconciler,
      ...workerChatThread,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const session: SymphonySessionRecord = {
      uri: uris.session,
      issue: issueUri,
      task: uris.task,
      delivery: uris.delivery,
      backend: target.backend,
      mode: input.mode,
      ...(input.secretaryAutoEnabled !== undefined ? { secretaryAutoEnabled: input.secretaryAutoEnabled } : {}),
      status: 'planned',
      cwd: workerWorkspace.path,
      workspace: workerWorkspace,
      target,
      ...(spec.model ? { model: spec.model } : {}),
      ...(spec.supervisor ? { supervisor: spec.supervisor } : {}),
      reconciler: dispatchReconciler,
      ...workerChatThread,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const delivery: SymphonyDeliveryRecord = {
      uri: uris.delivery,
      issue: issueUri,
      task: uris.task,
      type: 'task_dispatch',
      status: 'pending',
      sourceAgent: '__secretary__',
      targetBackend: target.backend,
      targetAgent,
      target,
      projection: {
        runtimeRole: 'user',
        prompt: renderSymphonyRuntimePrompt({
          issue,
          task: uris.task,
          objective: workerObjective,
          acceptanceCriteria: workerAcceptanceCriteria,
          workspace: workerWorkspace,
          backend: target.backend,
          mode: input.mode,
          secretaryAutoEnabled: input.secretaryAutoEnabled,
          session: uris.session,
          target,
          issuer,
          workerIndex: index + 1,
          workerCount: workerSpecs.length,
        }),
      },
      session: uris.session,
      reconciler: dispatchReconciler,
      ...workerChatThread,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return { task: uris.task, taskRecord, delivery, session }
  })

  const primary = workers[0]!
  return { issue, task: primary.task, taskRecord: primary.taskRecord, delivery: primary.delivery, session: primary.session, workers }
}

export function appendSymphonyReconcilerDecision<T extends { reconciler?: SymphonyReconcilerState }>(
  record: T,
  decision: ReconcileDecision | ReconcileDecisionSummary,
): T {
  const summary = isReconcileDecisionSummary(decision)
    ? decision
    : summarizeReconcileDecision(decision)
  return {
    ...record,
    reconciler: {
      decisions: [
        ...(record.reconciler?.decisions ?? []),
        summary,
      ],
    },
  }
}

export function reconcileSymphonyThreadEvents(
  input: ReconcileSymphonyThreadEventsInput,
): ReconcileSymphonyThreadEventsResult {
  const policy = input.policy ?? { kind: 'symphony', secretaryAgent: '__secretary__' }
  const events = (input.events ?? []).map((event, index) => normalizeSymphonyThreadReconcileEvent(event, input, index))
  const now = input.now instanceof Date
    ? input.now
    : normalizeOptionalText(input.now)
      ? new Date(normalizeOptionalText(input.now)!)
      : undefined

  const decisions = events.map((event, index) => decideThreadControlEvent({
    policy,
    event,
    ...(input.chat ? { chat: input.chat } : {}),
    ...(input.thread ? { thread: input.thread } : {}),
    ...(now && Number.isFinite(now.getTime()) ? { now } : {}),
    randomId: `${input.randomId ?? event.id ?? 'symphony-thread'}-${index + 1}`,
    ...(input.client ? { client: input.client } : {}),
  }).summary)
  const wakeJobs = decisions.flatMap((decision) => decision.wakeJobs)
  const notificationEvents = decisions.flatMap((decision) => decision.notificationEvents ?? [])
  const latestDecision = decisions.length > 0 ? decisions[decisions.length - 1] : undefined
  const latestEvent = events.length > 0 ? events[events.length - 1] : undefined
  const thread = latestDecision?.thread
    ?? normalizeOptionalText(input.thread)
    ?? latestEvent?.thread
    ?? 'urn:undefineds:linx:thread:system-control'
  const chat = latestDecision?.chat
    ?? normalizeOptionalText(input.chat)
    ?? latestEvent?.chat
  const nextAction = resolveSymphonyThreadReconcilerNextAction(wakeJobs, notificationEvents)

  return {
    policyKind: typeof policy === 'string' ? policy : policy.kind,
    ...(chat ? { chat } : {}),
    thread,
    eventCount: events.length,
    decisions,
    wakeJobs,
    notificationEvents,
    nextAction,
    summary: summarizeSymphonyThreadReconcilerResult(events.length, nextAction, wakeJobs.length, notificationEvents.length),
  }
}

export function withSymphonyIssueStatus(
  record: SymphonyIssueRecord,
  status: SymphonyIssueStatus,
  updates: SymphonyIssueStatusUpdates = {},
): SymphonyIssueRecord {
  const timestamp = normalizeSymphonyStatusTimestamp(updates.now)
  return {
    ...record,
    status,
    updatedAt: timestamp,
    ...(updates.error ? { error: updates.error } : {}),
    ...((updates.closedAt || status === 'resolved' || status === 'closed') ? { closedAt: updates.closedAt ?? timestamp } : {}),
  }
}

export function withSymphonyTaskStatus(
  record: SymphonyTaskRecord,
  status: SymphonyTaskStatus,
  updates: SymphonyTaskStatusUpdates = {},
): SymphonyTaskRecord {
  const timestamp = normalizeSymphonyStatusTimestamp(updates.now)
  return {
    ...record,
    status,
    updatedAt: timestamp,
    ...(updates.error ? { error: updates.error } : {}),
    ...((updates.completedAt || status === 'completed' || status === 'failed') ? { completedAt: updates.completedAt ?? timestamp } : {}),
  }
}

export function withSymphonyDeliveryStatus(
  record: SymphonyDeliveryRecord,
  status: SymphonyDeliveryStatus,
  updates: SymphonyDeliveryStatusUpdates = {},
): SymphonyDeliveryRecord {
  const timestamp = normalizeSymphonyStatusTimestamp(updates.now)
  return {
    ...record,
    status,
    updatedAt: timestamp,
    ...(updates.autoModeSessionId ? { autoModeSessionId: updates.autoModeSessionId } : {}),
    ...(updates.error ? { error: updates.error } : {}),
    ...((updates.completedAt || status === 'completed' || status === 'failed') ? { completedAt: updates.completedAt ?? timestamp } : {}),
  }
}

export function withSymphonySessionStatus(
  record: SymphonySessionRecord,
  status: SymphonySessionStatus,
  updates: SymphonySessionStatusUpdates = {},
): SymphonySessionRecord {
  const timestamp = normalizeSymphonyStatusTimestamp(updates.now)
  return {
    ...record,
    status,
    updatedAt: timestamp,
    ...(updates.autoModeSessionId ? { autoModeSessionId: updates.autoModeSessionId } : {}),
    ...(updates.exitCode !== undefined ? { exitCode: updates.exitCode } : {}),
    ...(updates.dryRun !== undefined ? { dryRun: updates.dryRun } : {}),
    ...(updates.error ? { error: updates.error } : {}),
    ...((updates.completedAt || status === 'completed' || status === 'failed') ? { completedAt: updates.completedAt ?? timestamp } : {}),
  }
}

export function withSymphonyRunPlanPrimaryWorker(plan: SymphonyRunPlan): SymphonyRunPlan {
  const primary = plan.workers[0]
  if (!primary) {
    return plan
  }

  return {
    ...plan,
    task: primary.task,
    taskRecord: primary.taskRecord,
    delivery: primary.delivery,
    session: primary.session,
  }
}

export function withSymphonyRunPlanWorker(plan: SymphonyRunPlan, worker: SymphonyWorkerPlan): SymphonyRunPlan {
  return withSymphonyRunPlanPrimaryWorker({
    ...plan,
    workers: plan.workers.map((candidate) => (
      candidate.session.uri === worker.session.uri ? worker : candidate
    )),
  })
}

export function createSymphonyRunStepRecord(input: CreateSymphonyRunStepInput): SymphonyRunStepRecord {
  const now = input.now ?? new Date()
  const payload = sanitizeSymphonyRunStepPayload(input.payload)
  return {
    uri: createSymphonyRunStepUri({
      now,
      randomId: input.randomId ?? `${getSymphonyArchiveKey(input.worker.session.uri)}-${input.stepType}`,
    }),
    issue: input.worker.session.issue,
    task: input.worker.task,
    delivery: input.worker.delivery.uri,
    session: input.worker.session.uri,
    stepType: input.stepType,
    message: normalizeOptionalText(input.message) ?? defaultSymphonyRunStepMessage(input.stepType, input.worker),
    ...(payload ? { payload } : {}),
    createdAt: now.toISOString(),
  }
}

export function withSymphonyWorkerRunStep(
  worker: SymphonyWorkerPlan,
  step: SymphonyRunStepRecord,
): SymphonyWorkerPlan {
  const existing = worker.runSteps ?? []
  if (existing.some((candidate) => candidate.uri === step.uri)) {
    return worker
  }

  return {
    ...worker,
    runSteps: [...existing, step],
  }
}

export function withSymphonyWorkerRuntimeStep(
  worker: SymphonyWorkerPlan,
  input: Omit<CreateSymphonyRunStepInput, 'worker'>,
): SymphonyWorkerPlan {
  return withSymphonyWorkerRunStep(worker, createSymphonyRunStepRecord({
    worker,
    ...input,
  }))
}

export function startSymphonyWorkerRun(input: StartSymphonyWorkerRunInput): SymphonyWorkerPlan {
  const taskRecord = applySymphonyDecision(
    withSymphonyTaskStatus(input.worker.taskRecord, 'running', { now: input.now }),
    input.decision,
  )
  const delivery = applySymphonyDecision(
    withSymphonyDeliveryStatus(input.worker.delivery, 'dispatched', { now: input.now }),
    input.decision,
  )
  const session = applySymphonyDecision(
    withSymphonySessionStatus(input.worker.session, 'running', { now: input.now }),
    input.decision,
  )
  return withSymphonyWorkerRuntimeStep({
    task: input.worker.task,
    taskRecord,
    delivery,
    session,
    ...(input.worker.runSteps?.length ? { runSteps: input.worker.runSteps } : {}),
  }, {
    stepType: 'run.started',
    message: input.message ?? `${input.worker.session.backend} worker run started.`,
    payload: {
      issue: input.worker.session.issue,
      task: input.worker.task,
      delivery: input.worker.delivery.uri,
      session: input.worker.session.uri,
      backend: input.worker.session.backend,
      targetAgent: input.worker.delivery.targetAgent,
      ...(input.payload ?? {}),
    },
    now: input.now,
    randomId: input.randomId ?? `${input.worker.delivery.uri}-run-started`,
  })
}

export function recordSymphonyWorkerRuntimeEvent(
  input: RecordSymphonyWorkerRuntimeEventInput,
): SymphonyWorkerPlan {
  const session = input.stepType === 'run.step'
    ? withSymphonySessionStatus(input.worker.session, 'running', { now: input.now })
    : input.worker.session
  return withSymphonyWorkerRuntimeStep({
    ...input.worker,
    session,
  }, {
    stepType: input.stepType,
    message: input.message,
    payload: {
      issue: input.worker.session.issue,
      task: input.worker.task,
      delivery: input.worker.delivery.uri,
      session: input.worker.session.uri,
      backend: input.worker.session.backend,
      ...(input.payload ?? {}),
    },
    now: input.now,
    randomId: input.randomId,
  })
}

export function completeSymphonyWorkerRun(
  input: CompleteSymphonyWorkerRunInput,
): ReconcileSymphonyWorkerDeliveryResult {
  const error = input.status === 'failed'
    ? `Backend exited with code ${input.exitCode}`
    : undefined
  const taskRecord = applySymphonyDecision(
    withSymphonyTaskStatus(input.worker.taskRecord, input.status, {
      now: input.now,
      ...(error ? { error } : {}),
    }),
    input.decision,
  )
  const delivery = applySymphonyDecision(
    withSymphonyDeliveryStatus(input.worker.delivery, input.status, {
      now: input.now,
      ...(input.autoModeSessionId ? { autoModeSessionId: input.autoModeSessionId } : {}),
      ...(error ? { error } : {}),
    }),
    input.decision,
  )
  const session = applySymphonyDecision(
    withSymphonySessionStatus(input.worker.session, input.status, {
      now: input.now,
      ...(input.autoModeSessionId ? { autoModeSessionId: input.autoModeSessionId } : {}),
      exitCode: input.exitCode,
      ...(error ? { error } : {}),
    }),
    input.decision,
  )
  return reconcileSymphonyWorkerDelivery({
    issue: input.issue,
    worker: {
      task: input.worker.task,
      taskRecord,
      delivery,
      session,
      ...(input.worker.runSteps?.length ? { runSteps: input.worker.runSteps } : {}),
    },
    status: input.status,
    exitCode: input.exitCode,
    autoModeSessionId: input.autoModeSessionId,
    reportText: input.reportText,
    now: input.now,
    randomId: input.randomId,
  })
}

export function finalizeSymphonyRunPlanAfterWorkers(
  input: FinalizeSymphonyRunPlanAfterWorkersInput,
): FinalizeSymphonyRunPlanAfterWorkersResult {
  const workers = input.workers ?? input.plan.workers
  const followUpIssues = input.followUpIssues ?? input.plan.followUpIssues
  const basePlan = withSymphonyRunPlanPrimaryWorker({
    ...input.plan,
    workers,
    ...(followUpIssues?.length ? { followUpIssues } : {}),
  })
  const failure = workers.find((worker) => {
    const exitCode = worker.session.exitCode
    return worker.taskRecord.status === 'failed'
      || worker.delivery.status === 'failed'
      || worker.session.status === 'failed'
      || (typeof exitCode === 'number' && exitCode !== 0)
  })
  if (failure) {
    const exitCode = typeof failure.session.exitCode === 'number' ? failure.session.exitCode : undefined
    const error = failure.session.error
      ?? failure.delivery.error
      ?? failure.taskRecord.error
      ?? (exitCode !== undefined ? `Backend ${failure.session.backend} exited with code ${exitCode}` : `Worker ${failure.taskRecord.title} failed.`)
    return {
      status: 'failed',
      issueStatus: 'blocked',
      blocker: {
        kind: 'worker_failure',
        error,
        ...(exitCode !== undefined ? { exitCode } : {}),
        worker: failure,
      },
      plan: withSymphonyRunPlanPrimaryWorker({
        ...basePlan,
        issue: withSymphonyIssueStatus(basePlan.issue, 'blocked', { error, now: input.now }),
      }),
    }
  }

  const acceptanceBlockedWorker = workers.find((worker) => {
    const review = worker.taskRecord.acceptanceReview
      ?? worker.delivery.acceptanceReview
      ?? worker.session.acceptanceReview
    return Boolean(review && !review.accepted)
  })
  if (acceptanceBlockedWorker) {
    const review = acceptanceBlockedWorker.taskRecord.acceptanceReview
      ?? acceptanceBlockedWorker.delivery.acceptanceReview
      ?? acceptanceBlockedWorker.session.acceptanceReview
    const error = review ? summarizeSymphonyAcceptanceBlocker(review) : `Worker ${acceptanceBlockedWorker.taskRecord.title} was not accepted.`
    return {
      status: 'completed',
      issueStatus: 'blocked',
      blocker: {
        kind: 'acceptance',
        error,
        worker: acceptanceBlockedWorker,
      },
      plan: withSymphonyRunPlanPrimaryWorker({
        ...basePlan,
        issue: withSymphonyIssueStatus(basePlan.issue, 'blocked', { error, now: input.now }),
      }),
    }
  }

  return {
    status: 'completed',
    issueStatus: 'resolved',
    plan: withSymphonyRunPlanPrimaryWorker({
      ...basePlan,
      issue: withSymphonyIssueStatus(basePlan.issue, 'resolved', { now: input.now }),
    }),
  }
}

export function summarizeSymphonyAcceptanceBlocker(
  review: SymphonyAcceptanceReview,
): string {
  const blocking = review.followUps.find((followUp) => followUp.disposition === 'same_issue_task' || followUp.disposition === 'ask_user')
  return blocking
    ? `${review.summary}: ${blocking.summary}`
    : review.summary
}

function applySymphonyDecision<T extends { reconciler?: SymphonyReconcilerState }>(
  record: T,
  decision?: ReconcileDecision | ReconcileDecisionSummary,
): T {
  return decision ? appendSymphonyReconcilerDecision(record, decision) : record
}

export function reconcileSymphonyWorkerDelivery(
  input: ReconcileSymphonyWorkerDeliveryInput,
): ReconcileSymphonyWorkerDeliveryResult {
  const review = createSymphonyAcceptanceReview({
    issue: input.issue,
    worker: input.worker,
    status: input.status,
    exitCode: input.exitCode,
    reportText: input.reportText,
    now: input.now,
  })
  const followUpIssues = createFollowUpIssuesFromAcceptanceReview({
    issue: input.issue,
    worker: input.worker,
    review,
    now: input.now,
    randomId: input.randomId,
  })
  const followUps = review.followUps.map((followUp) => {
    const createdIssue = followUpIssues.find((issue) => issue.description?.includes(followUp.summary))
    return followUp.disposition === 'new_issue' && createdIssue
      ? { ...followUp, issue: createdIssue.uri }
      : followUp
  })
  const acceptanceReview = {
    ...review,
    followUps,
    reusableExtraction: {
      ...review.reusableExtraction,
      candidates: review.reusableExtraction.candidates.map((candidate) => {
        const updated = followUps.find((followUp) => followUp.summary === candidate.summary && followUp.kind === candidate.kind)
        return updated ?? candidate
      }),
    },
  }
  const taskRecord = withSymphonyWorkerAcceptanceTaskStatus(input.worker.taskRecord, acceptanceReview, input.status)
  const terminalStep = createSymphonyRunStepRecord({
    worker: input.worker,
    stepType: input.status === 'completed' ? 'run.completed' : 'run.failed',
    message: input.status === 'completed'
      ? `${input.worker.taskRecord.title} completed and entered Secretary reconciliation.`
      : `${input.worker.taskRecord.title} failed before Secretary acceptance.`,
    payload: {
      status: input.status,
      exitCode: input.exitCode,
      autoModeSessionId: input.autoModeSessionId,
      acceptanceOutcome: acceptanceReview.outcome,
      accepted: acceptanceReview.accepted,
    },
    now: input.now,
    randomId: `${normalizeSymphonyRandomId(input.randomId)}-terminal`,
  })

  return {
    acceptanceReview,
    followUpIssues,
    worker: withSymphonyWorkerRunStep({
      task: input.worker.task,
      taskRecord: {
        ...taskRecord,
        acceptanceReview,
      },
      delivery: {
        ...input.worker.delivery,
        ...(input.autoModeSessionId ? { autoModeSessionId: input.autoModeSessionId } : {}),
        acceptanceReview,
      },
      session: {
        ...input.worker.session,
        ...(input.autoModeSessionId ? { autoModeSessionId: input.autoModeSessionId } : {}),
        acceptanceReview,
      },
      ...(input.worker.runSteps?.length ? { runSteps: input.worker.runSteps } : {}),
    }, terminalStep),
  }
}

export function createSymphonyAcceptanceReview(input: {
  issue: SymphonyIssueRecord
  worker: SymphonyWorkerPlan
  status: 'completed' | 'failed'
  exitCode: number
  reportText?: string
  now?: Date
}): SymphonyAcceptanceReview {
  const now = input.now ?? new Date()
  const envelope = parseSymphonyFinalReportEnvelope(input.reportText)
  const reportSummary = normalizeOptionalText(envelope?.summary)
    ?? summarizeWorkerReportText(input.reportText)
    ?? defaultWorkerCompletionSummary(input.worker, input.status, input.exitCode)
  const followUps = (envelope?.followUps ?? inferFollowUpCandidatesFromReport(input.reportText))
    .map((candidate) => classifySymphonyFollowUpCandidate(candidate))
  const reusableCandidates = followUps.filter(isReusableExtractionFollowUp)
  const reusableExtraction = createReusableExtractionDecision(reusableCandidates)
  const blockingFollowUp = followUps.find((followUp) => followUp.disposition === 'same_issue_task' || followUp.disposition === 'ask_user')
  const accepted = input.status === 'completed' && !blockingFollowUp
  const outcome: SymphonyAcceptanceOutcome = input.status === 'failed' || blockingFollowUp
    ? 'blocked'
    : followUps.some((followUp) => followUp.disposition === 'new_issue' || followUp.disposition === 'idea')
      ? 'follow_up'
      : accepted
        ? 'accepted'
        : 'rejected'

  return {
    outcome,
    accepted,
    reviewedBy: '__secretary__',
    reviewedAt: now.toISOString(),
    summary: reportSummary,
    evidence: normalizeStringList(envelope?.evidence),
    risks: normalizeStringList(envelope?.risks),
    changedFiles: normalizeStringList(envelope?.changedFiles),
    commands: normalizeStringList(envelope?.commands),
    followUps,
    reusableExtraction,
    ...buildSymphonyImplementationChangeRequest({
      issue: input.issue,
      worker: input.worker,
      status: input.status,
      exitCode: input.exitCode,
      summary: reportSummary,
      evidence: normalizeStringList(envelope?.evidence),
      risks: normalizeStringList(envelope?.risks),
      blockingFollowUp,
      now,
    }),
  }
}

function buildSymphonyImplementationChangeRequest(input: {
  issue: SymphonyIssueRecord
  worker: SymphonyWorkerPlan
  status: 'completed' | 'failed'
  exitCode: number
  summary: string
  evidence: string[]
  risks: string[]
  blockingFollowUp?: SymphonyClassifiedFollowUp
  now: Date
}): { implementationChangeRequest: SymphonyImplementationChangeRequest } | {} {
  const trigger = input.status === 'failed'
    ? 'worker_failed'
    : input.blockingFollowUp
      ? 'acceptance_blocked'
      : undefined
  if (!trigger) {
    return {}
  }

  const failureEvidence = [
    ...input.evidence,
    ...(input.worker.runSteps?.map((step) => `${step.stepType}: ${step.message}`) ?? []),
  ].slice(0, 12)
  const blockingSummary = input.blockingFollowUp?.summary
  const summary = trigger === 'worker_failed'
    ? input.summary
    : blockingSummary ?? input.summary
  const recommendedNextShape: SymphonyImplementationChangeRequest['recommendedNextShape'] = input.blockingFollowUp?.disposition === 'ask_user'
    ? 'request_authority'
    : input.blockingFollowUp?.disposition === 'same_issue_task'
      ? 'split'
      : input.status === 'failed'
        ? 'redesign'
        : 'retry'

  return {
    implementationChangeRequest: {
      trigger,
      task: input.worker.task,
      delivery: input.worker.delivery.uri,
      session: input.worker.session.uri,
      summary,
      failedAssumption: trigger === 'worker_failed'
        ? `Worker could complete "${input.worker.taskRecord.title}" under the current task plan.`
        : `Current acceptance can be satisfied without resolving "${summary}".`,
      evidence: failureEvidence,
      risks: input.risks,
      recommendedNextShape,
      basedOnRunSteps: input.worker.runSteps?.map((step) => step.uri) ?? [],
      createdAt: input.now.toISOString(),
    },
  }
}

function withSymphonyWorkerAcceptanceTaskStatus(
  taskRecord: SymphonyTaskRecord,
  acceptanceReview: SymphonyAcceptanceReview,
  status: 'completed' | 'failed',
): SymphonyTaskRecord {
  if (status === 'failed' || acceptanceReview.accepted) {
    return taskRecord
  }

  const { completedAt: _completedAt, ...rest } = taskRecord
  return {
    ...rest,
    status: 'blocked',
    error: acceptanceReview.summary,
  }
}

export function classifySymphonyFollowUpCandidate(
  candidate: SymphonyFollowUpCandidate,
): SymphonyClassifiedFollowUp {
  const normalized = normalizeSymphonyFollowUpCandidate(candidate)
  const suggested = normalizeDisposition(candidate.suggestedDisposition)
  let disposition: SymphonyFollowUpDisposition
  let reason: string

  if (normalized.userDecisionRequired) {
    disposition = 'ask_user'
    reason = normalized.reason ?? 'The follow-up requires user-owned intent, authority, priority, or acceptance.'
  } else if (normalized.requiredBeforeAcceptance) {
    disposition = 'same_issue_task'
    reason = normalized.reason ?? 'The follow-up must be resolved before the current delivery can be accepted.'
  } else if (suggested) {
    disposition = suggested
    reason = normalized.reason ?? `Worker suggested ${suggested}.`
  } else if (isReusableExtractionKind(normalized.kind)) {
    disposition = 'new_issue'
    reason = normalized.reason ?? 'The finding is reusable across surfaces or workers and should be tracked independently.'
  } else if (normalized.kind === 'live_verification_gap' || normalized.kind === 'new_defect') {
    disposition = 'new_issue'
    reason = normalized.reason ?? 'The finding is actionable follow-up work discovered during the run.'
  } else if (normalized.kind === 'documentation' || normalized.kind === 'cleanup') {
    disposition = 'idea'
    reason = normalized.reason ?? 'The finding is useful but needs scope or priority before it becomes work.'
  } else {
    disposition = 'evidence_only'
    reason = normalized.reason ?? 'The finding is recorded as evidence and does not currently create new work.'
  }

  return {
    ...normalized,
    disposition,
    reason,
    source: 'worker_report',
  }
}

export function parseSymphonyFinalReportEnvelope(text: string | undefined): SymphonyFinalReportEnvelope | null {
  const normalized = normalizeOptionalText(text)
  if (!normalized) {
    return null
  }

  const explicit = extractSymphonyFinalJsonBlocks(normalized)
  for (const block of explicit) {
    const parsed = parseJsonObject(block)
    const envelope = normalizeFinalReportEnvelope(parsed)
    if (envelope) {
      return envelope
    }
  }

  for (const block of extractGenericJsonBlocks(normalized)) {
    const parsed = parseJsonObject(block)
    const envelope = normalizeFinalReportEnvelope(parsed)
    if (envelope) {
      return envelope
    }
  }

  const parsed = parseJsonObject(normalized)
  return normalizeFinalReportEnvelope(parsed)
}

export function parseSymphonyRuntimeDeliveryResult(text: string | undefined): SymphonyRuntimeDeliveryResult | null {
  const normalized = normalizeOptionalText(text)
  if (!normalized) {
    return null
  }

  const explicit = extractSymphonyDeliveryJsonBlocks(normalized)
  for (const block of explicit) {
    const result = normalizeSymphonyRuntimeDeliveryResult(parseJsonObject(block))
    if (result) {
      return result
    }
  }

  for (const block of extractGenericJsonBlocks(normalized)) {
    const result = normalizeSymphonyRuntimeDeliveryResult(parseJsonObject(block))
    if (result) {
      return result
    }
  }

  return normalizeSymphonyRuntimeDeliveryResult(parseJsonObject(normalized))
}

export function normalizeSymphonyRuntimeDeliveryResult(value: unknown): SymphonyRuntimeDeliveryResult | null {
  if (!isRecord(value)) {
    return null
  }

  const finalReport = normalizeRuntimeDeliveryReportText(value)
  const events = normalizeRuntimeDeliveryEvents(value.events)
  const exitCode = normalizeRuntimeDeliveryExitCode(value.exitCode ?? value.exit_code)
  const status = normalizeRuntimeDeliveryStatus(value.status)
    ?? (exitCode !== undefined && exitCode !== 0 ? 'failed' : 'completed')
  const normalizedExitCode = exitCode ?? (status === 'completed' ? 0 : 1)
  const hasSignal = value.symphonyDelivery === true
    || value.symphonyFinal === true
    || normalizeOptionalText(value.kind)?.toLowerCase().includes('symphony') === true
    || normalizeOptionalText(value.type)?.toLowerCase().includes('symphony') === true
    || finalReport !== undefined
    || events.length > 0
    || value.status !== undefined
    || value.exitCode !== undefined
    || value.exit_code !== undefined
  if (!hasSignal) {
    return null
  }

  return {
    status,
    exitCode: normalizedExitCode,
    ...(normalizeOptionalText(value.autoModeSessionId ?? value.auto_mode_session_id ?? value.sessionId ?? value.session_id ?? value.externalRunId ?? value.external_run_id) ? {
      autoModeSessionId: normalizeOptionalText(value.autoModeSessionId ?? value.auto_mode_session_id ?? value.sessionId ?? value.session_id ?? value.externalRunId ?? value.external_run_id),
    } : {}),
    ...(finalReport ? { reportText: finalReport } : {}),
    events,
  }
}

export function renderSymphonyRuntimePrompt(input: {
  issue?: SymphonyIssueRecord
  task: string
  objective: string
  acceptanceCriteria?: string[]
  workspace: WorkerWorkspace
  backend: AutoModeWorkerBackend
  mode: AutoModeMode
  secretaryAutoEnabled?: boolean
  session: string
  target?: SymphonyDelegationTarget
  issuer?: SymphonyIssuerRef
  workerIndex?: number
  workerCount?: number
}): string {
  const acceptanceCriteria = normalizeSymphonyAcceptanceCriteria(input.acceptanceCriteria)
  const criteria = acceptanceCriteria.length > 0
    ? acceptanceCriteria.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : [
      '1. Infer concrete acceptance criteria from the delegated objective, source context, and repository state.',
      '2. If the objective cannot be made testable without a user decision, report the blocker to AI Secretary instead of guessing.',
      '3. Otherwise complete the objective and report concrete verification evidence.',
    ].join('\n')
  const workThread = normalizeOptionalText(input.target?.thread ?? input.issue?.thread ?? input.issuer?.thread)

  return [
    '# LinX Symphony Task',
    '',
    ...(input.issue ? [`Issue URI: ${input.issue.uri}`] : []),
    `Task URI: ${input.task}`,
    `Session URI: ${input.session}`,
    `Backend: ${input.backend}`,
    `Worker mode: ${input.mode}`,
    `Secretary auto: ${input.secretaryAutoEnabled === true ? 'on' : 'off'}`,
    ...(input.issuer?.webId ? [`Issuer WebID: ${input.issuer.webId}`] : []),
    ...(input.issuer?.agent ? [`Issuer agent: ${input.issuer.agent}`] : []),
    ...(input.issuer?.chat ? [`Issuer chat: ${input.issuer.chat}`] : []),
    ...(input.issuer?.thread ? [`Issuer thread: ${input.issuer.thread}`] : []),
    ...(input.target?.chat ? [`Target chat: ${input.target.chat}`] : []),
    ...(input.target?.thread ? [`Target thread: ${input.target.thread}`] : []),
    ...(input.target?.agent ? [`Target agent: ${input.target.agent}`] : []),
    ...(input.workerIndex && input.workerCount ? [`Worker: ${input.workerIndex}/${input.workerCount}`] : []),
    ...(workThread ? [`Work thread: ${workThread}`] : []),
    `Workspace: ${input.workspace.path}`,
    `Workspace kind: ${input.workspace.kind}`,
    ...(input.workspace.container ? [`Workspace container: ${input.workspace.container}`] : []),
    ...(input.workspace.repository ? [`Workspace repository: ${input.workspace.repository}`] : []),
    ...(input.workspace.branch ? [`Workspace branch: ${input.workspace.branch}`] : []),
    ...(input.workspace.baseRevision ? [`Workspace base revision: ${input.workspace.baseRevision}`] : []),
    ...(input.workspace.environment ? [`Workspace environment: ${formatSymphonyWorkerEnvironment(input.workspace.environment)}`] : []),
    '',
    '## Runtime Space Contract',
    '- Shared control space: Issue, Task, Delivery, Session, Run, and Evidence URIs are the common coordination surface with AI Secretary and product UI.',
    '- Explicit session topology: you may be collaborating in the same room as Secretary or running in a runtime-projected worker session reached through control events. Follow the provided chat/thread/session targets; do not infer topology from workspace sharing.',
    '- Thread reconciliation: messages, input/approval requests, blockers, schedule ticks, and Delivery submissions enter the Thread first; the Reconciler/Scheduler wakes Secretary or workers.',
    '- Report through Delivery/Evidence: return progress, blockers, implementation change requests, and verification for AI Secretary to persist or route.',
    '- Thread workspace: workers assigned to the same Thread in the same environment should normally share this workspace; independent Threads may use separate worktrees.',
    '- Environment-scoped identity: cross-environment file identity requires revision, artifact, patch, checksum, or evidence references.',
    '',
    '## Objective',
    input.objective,
    '',
    '## Acceptance Criteria',
    criteria,
    '',
    '## Execution Contract',
    '- Start and maintain this as the active goal for the worker session until the acceptance criteria are met.',
    '- Work only inside the workspace unless the task explicitly requires otherwise.',
    '- Treat this prompt as a delegated task from the user via AI Secretary.',
    '- Treat later Secretary messages in this session as Steer or follow-up Delivery updates, not as a replacement for the Goal.',
    '- Report blockers to AI Secretary instead of asking the user directly.',
    '- Do not read sibling worker transcripts unless Secretary explicitly includes them in a Delivery.',
    '- Preserve a concise report with changed files, commands run, and remaining risks.',
    '- If blocked by missing credentials, destructive actions, or unclear scope, report the blocker instead of guessing.',
    '- Your workspace path is local to this worker environment. Same-Thread workers in this environment may share it, but do not assume Secretary, the user, or workers in other environments can access the same absolute path.',
    '- When reporting file work across environments, include repo-relative paths plus base revision, checksums/etags, patch or artifact references, and verification evidence.',
    '',
    '## Final Report And Follow-Up Candidates',
    '- Final output must separate assigned-work evidence from follow-up candidates.',
    '- Include changed files, commands/tests run, verification evidence, remaining risks, and blockers.',
    '- If you created app-local glue that another surface or worker will likely need, report it as a follow-up candidate instead of hiding it in the summary.',
    '- Candidate signals include missing shared abstractions, repeated model/ORM helpers, duplicated CLI/Web/service lifecycle logic, runtime adapter normalization, reusable test harnesses, live-verification gaps, defects, cleanup, or documentation work.',
    '- You may recommend a disposition, but AI Secretary owns the final classification: same_issue_task, new_issue, idea, evidence_only, or ask_user.',
    '- Prefer this machine-readable envelope at the end of the report so LinX can archive it:',
    '```json',
    '{',
    '  "symphonyFinal": true,',
    '  "summary": "one sentence result",',
    '  "changedFiles": ["repo-relative/path.ts"],',
    '  "commands": ["test command actually run"],',
    '  "evidence": ["what proves acceptance"],',
    '  "risks": ["known risk or not-tested gap"],',
    '  "followUps": [',
    '    {',
    '      "kind": "missing_shared_abstraction",',
    '      "summary": "shared extraction or follow-up work",',
    '      "evidence": ["file or observation"],',
    '      "suggestedDisposition": "new_issue",',
    '      "reason": "why it is separate from this delivery"',
    '    }',
    '  ]',
    '}',
    '```',
    '',
    '## Pod And Control Record Boundary',
    '- In LinX runtime, Pod control records are authoritative. Local files are mirrors, logs, or portable-runtime fallbacks.',
    '- If Pod/model tools are available, read only the assigned Issue, Task, Delivery, Run, source context, and existing evidence needed for this task.',
    '- Write only execution facts for the assigned work: Run/RunStep progress, blockers, Evidence, Delivery report, or Implementation Change Request.',
    '- Do not close Issues, rewrite Spec/current truth, change acceptance criteria, change work split, alter release or roadmap state, create grants, or mutate sibling worker state.',
    '- Use shared model/ORM surfaces when writing structured Pod data. Do not hand-patch business TTL or invent Pod paths.',
    '- If Pod access is unavailable, return the same facts as a structured report so AI Secretary can persist them.',
    '',
    '## Documentation Authority',
    '- Pod Issue/Spec/Task records are the control authority for status, scope, acceptance, split, ownership, closure, and cross-client coordination.',
    '- Repository docs are the implementation authority for code-adjacent design, behavior notes, tests, examples, migration details, and file-level evidence.',
    '- When you edit repository docs, reference the Pod Issue/Spec/Task URI instead of creating a second Issue truth.',
    '- If repository findings contradict the Pod control record, write an Implementation Change Request instead of silently changing acceptance or scope.',
  ].join('\n')
}

function createFollowUpIssuesFromAcceptanceReview(input: {
  issue: SymphonyIssueRecord
  worker: SymphonyWorkerPlan
  review: SymphonyAcceptanceReview
  now?: Date
  randomId?: string
}): SymphonyIssueRecord[] {
  const now = input.now ?? new Date()
  const timestamp = now.toISOString()
  return input.review.followUps
    .filter((followUp) => followUp.disposition === 'new_issue')
    .map((followUp, index): SymphonyIssueRecord => {
      const uri = createSymphonyIssueUri({
        now,
        randomId: `${normalizeSymphonyRandomId(input.randomId)}-fu${index + 1}`,
      })
      return {
        uri,
        title: createSymphonyTitle(followUp.summary),
        description: [
          followUp.summary,
          '',
          `Origin issue: ${input.issue.uri}`,
          `Origin task: ${input.worker.task}`,
          `Origin delivery: ${input.worker.delivery.uri}`,
          `Origin session: ${input.worker.session.uri}`,
          `Disposition reason: ${followUp.reason}`,
          ...(followUp.evidence?.length ? ['', 'Evidence:', ...followUp.evidence.map((item) => `- ${item}`)] : []),
        ].join('\n'),
        status: 'open',
        priority: input.issue.priority,
        source: input.issue.source,
        issuer: input.issue.issuer,
        parentIssue: input.issue.uri,
        labels: ['symphony', 'follow-up', followUp.kind],
        tasks: [],
        deliveries: [],
        sessions: [],
        ...(input.issue.chat ? { chat: input.issue.chat } : {}),
        ...(input.issue.thread ? { thread: input.issue.thread } : {}),
        ...(input.issue.messages ? { messages: input.issue.messages } : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    })
}

function createReusableExtractionDecision(
  candidates: SymphonyClassifiedFollowUp[],
): SymphonyReusableExtractionDecision {
  if (candidates.length === 0) {
    return {
      disposition: 'evidence_only',
      reason: 'No reusable-module extraction candidate was reported or detected for this delivery.',
      candidates: [],
    }
  }

  const blocking = candidates.find((candidate) => candidate.disposition === 'same_issue_task')
  if (blocking) {
    return {
      disposition: 'same_issue_task',
      reason: blocking.reason,
      candidates,
    }
  }

  const newIssue = candidates.find((candidate) => candidate.disposition === 'new_issue')
  if (newIssue) {
    return {
      disposition: 'new_issue',
      reason: newIssue.reason,
      candidates,
    }
  }

  const askUser = candidates.find((candidate) => candidate.disposition === 'ask_user')
  if (askUser) {
    return {
      disposition: 'ask_user',
      reason: askUser.reason,
      candidates,
    }
  }

  const idea = candidates.find((candidate) => candidate.disposition === 'idea')
  if (idea) {
    return {
      disposition: 'idea',
      reason: idea.reason,
      candidates,
    }
  }

  return {
    disposition: 'evidence_only',
    reason: 'Reusable extraction candidates were recorded as evidence only.',
    candidates,
  }
}

function normalizeSymphonyFollowUpCandidate(candidate: SymphonyFollowUpCandidate): SymphonyFollowUpCandidate {
  return {
    kind: normalizeFollowUpKind(candidate.kind),
    summary: normalizeOptionalText(candidate.summary) ?? 'Unspecified Symphony follow-up',
    evidence: normalizeStringList(candidate.evidence),
    ...(normalizeDisposition(candidate.suggestedDisposition) ? { suggestedDisposition: normalizeDisposition(candidate.suggestedDisposition) } : {}),
    ...(normalizeOptionalText(candidate.reason) ? { reason: normalizeOptionalText(candidate.reason) } : {}),
    ...(candidate.requiredBeforeAcceptance ? { requiredBeforeAcceptance: true } : {}),
    ...(candidate.userDecisionRequired ? { userDecisionRequired: true } : {}),
    ...(normalizeOptionalText(candidate.targetPackage) ? { targetPackage: normalizeOptionalText(candidate.targetPackage) } : {}),
  }
}

function normalizeFollowUpKind(value: unknown): SymphonyFollowUpCandidateKind {
  if (value === 'new_defect'
    || value === 'missing_shared_abstraction'
    || value === 'app_local_glue'
    || value === 'models_gap'
    || value === 'orm_gap'
    || value === 'runtime_api_gap'
    || value === 'shared_runtime_utility'
    || value === 'test_harness'
    || value === 'live_verification_gap'
    || value === 'documentation'
    || value === 'cleanup'
    || value === 'other') {
    return value
  }

  const text = normalizeOptionalText(typeof value === 'string' ? value : undefined)?.toLowerCase() ?? ''
  if (text.includes('shared') || text.includes('abstraction') || text.includes('reuse')) return 'missing_shared_abstraction'
  if (text.includes('glue') || text.includes('local')) return 'app_local_glue'
  if (text.includes('model')) return 'models_gap'
  if (text.includes('orm')) return 'orm_gap'
  if (text.includes('runtime')) return 'runtime_api_gap'
  if (text.includes('harness') || text.includes('fixture')) return 'test_harness'
  if (text.includes('verify') || text.includes('validation')) return 'live_verification_gap'
  if (text.includes('doc')) return 'documentation'
  if (text.includes('cleanup')) return 'cleanup'
  if (text.includes('bug') || text.includes('defect')) return 'new_defect'
  return 'other'
}

function normalizeDisposition(value: unknown): SymphonyFollowUpDisposition | undefined {
  if (value === 'same_issue_task'
    || value === 'new_issue'
    || value === 'idea'
    || value === 'evidence_only'
    || value === 'ask_user') {
    return value
  }
  return undefined
}

function isReusableExtractionFollowUp(candidate: SymphonyClassifiedFollowUp): boolean {
  return isReusableExtractionKind(candidate.kind)
}

function isReusableExtractionKind(kind: SymphonyFollowUpCandidateKind): boolean {
  return kind === 'missing_shared_abstraction'
    || kind === 'app_local_glue'
    || kind === 'models_gap'
    || kind === 'orm_gap'
    || kind === 'runtime_api_gap'
    || kind === 'shared_runtime_utility'
    || kind === 'test_harness'
}

function inferFollowUpCandidatesFromReport(text: string | undefined): SymphonyFollowUpCandidate[] {
  const normalized = normalizeOptionalText(text)
  if (!normalized) {
    return []
  }
  const lower = normalized.toLowerCase()
  const candidates: SymphonyFollowUpCandidate[] = []

  if (/(shared abstraction|reusable module|抽.*复用|复用.*模块|app-local glue|local glue|duplicated .*logic|duplicate .*helper)/iu.test(normalized)) {
    candidates.push({
      kind: 'missing_shared_abstraction',
      summary: extractFollowUpSummary(normalized, 'Reusable extraction candidate detected from worker report.'),
      evidence: extractEvidenceLines(normalized),
    })
  }
  if (/(models?|schema|resource helper|iri|uri|id helper)/u.test(lower)) {
    candidates.push({
      kind: 'models_gap',
      summary: extractFollowUpSummary(normalized, 'Model/helper gap detected from worker report.'),
      evidence: extractEvidenceLines(normalized),
    })
  }
  if (/(verification gap|not tested|not-tested|未验证|manual verification|live verification)/iu.test(normalized)) {
    candidates.push({
      kind: 'live_verification_gap',
      summary: extractFollowUpSummary(normalized, 'Verification follow-up detected from worker report.'),
      evidence: extractEvidenceLines(normalized),
      suggestedDisposition: 'new_issue',
    })
  }

  return dedupeFollowUpCandidates(candidates)
}

function dedupeFollowUpCandidates(candidates: SymphonyFollowUpCandidate[]): SymphonyFollowUpCandidate[] {
  const seen = new Set<string>()
  const deduped: SymphonyFollowUpCandidate[] = []
  for (const candidate of candidates) {
    const key = `${candidate.kind}\0${candidate.summary}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(candidate)
  }
  return deduped
}

function extractFollowUpSummary(text: string, fallback: string): string {
  const lines = text.split(/\r?\n/u)
    .map((line) => line.replace(/^[-*]\s*/u, '').trim())
    .filter(Boolean)
  const match = lines.find((line) => /(shared|reusable|复用|models?|schema|verification|not tested|未验证|helper|runtime|adapter|glue|duplicate)/iu.test(line))
  return createSymphonyTitle(match ?? fallback)
}

function extractEvidenceLines(text: string): string[] {
  return text.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /(\bapps\/|\bpackages\/|\bdocs\/|\btests?\/|\.ts\b|\.tsx\b|\.mjs\b|\.md\b|not tested|未验证)/iu.test(line))
    .slice(0, 8)
}

function summarizeWorkerReportText(text: string | undefined): string | undefined {
  const normalized = normalizeOptionalText(text)
  if (!normalized) {
    return undefined
  }
  const line = normalized.split(/\r?\n/u).map((item) => item.trim()).find(Boolean)
  return line ? createSymphonyTitle(line) : undefined
}

function defaultWorkerCompletionSummary(
  worker: SymphonyWorkerPlan,
  status: 'completed' | 'failed',
  exitCode: number,
): string {
  return status === 'completed'
    ? `${worker.taskRecord.title} completed.`
    : `${worker.taskRecord.title} failed with exit code ${exitCode}.`
}

function defaultSymphonyRunStepMessage(
  stepType: SymphonyRuntimeEventType,
  worker: SymphonyWorkerPlan,
): string {
  if (stepType === 'session.started') return `${worker.session.backend} worker session started.`
  if (stepType === 'session.resumed') return `${worker.session.backend} worker session resumed.`
  if (stepType === 'run.started') return `${worker.session.backend} worker run started.`
  if (stepType === 'run.step') return `${worker.session.backend} worker progress heartbeat.`
  if (stepType === 'approval.required') return `${worker.session.backend} worker requires approval.`
  if (stepType === 'input.required') return `${worker.session.backend} worker requires input.`
  if (stepType === 'worker.blocked') return `${worker.session.backend} worker is blocked.`
  if (stepType === 'delivery.submitted') return `${worker.session.backend} worker submitted a delivery.`
  if (stepType === 'delivery.completed') return `${worker.session.backend} worker delivery completed.`
  if (stepType === 'delivery.failed') return `${worker.session.backend} worker delivery failed.`
  if (stepType === 'run.completed') return `${worker.session.backend} worker run completed.`
  return `${worker.session.backend} worker run failed.`
}

function sanitizeSymphonyRunStepPayload(payload: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!payload) {
    return undefined
  }

  const entries = Object.entries(payload).filter(([, value]) => value !== undefined)
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function normalizeSymphonyStatusTimestamp(value: Date | string | undefined): string {
  if (value instanceof Date) {
    return value.toISOString()
  }
  const text = normalizeOptionalText(value)
  if (text) {
    const parsed = new Date(text)
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : text
  }
  return new Date().toISOString()
}

function normalizeSymphonyThreadReconcileEvent(
  value: SymphonyThreadReconcileEventInput,
  input: ReconcileSymphonyThreadEventsInput,
  index: number,
): ThreadControlEvent {
  const hookEventName = normalizeOptionalText(value.hookEventName ?? value.hook_event_name)
  if (value.symphonyHookEvent === true || hookEventName) {
    return normalizeSymphonyCodexHookThreadEvent(value, input, index, hookEventName ?? 'unknown')
  }

  const data = normalizeSymphonyThreadEventData(value, {
    source: normalizeOptionalText(value.source) ?? 'codex-mcp',
  })
  return {
    id: normalizeOptionalText(value.id) ?? `event_${input.randomId ?? 'symphony'}_${index + 1}`,
    type: normalizeSymphonyThreadEventType(value.type ?? value.eventType ?? value.event_type) ?? 'run.updated',
    ...(normalizeOptionalText(value.chat ?? input.chat) ? { chat: normalizeOptionalText(value.chat ?? input.chat)! } : {}),
    ...(normalizeOptionalText(value.thread ?? input.thread) ? { thread: normalizeOptionalText(value.thread ?? input.thread)! } : {}),
    ...(normalizeOptionalText(value.resource) ? { resource: normalizeOptionalText(value.resource)! } : {}),
    ...(normalizeSymphonyThreadEventActor(value.actor) ? { actor: normalizeSymphonyThreadEventActor(value.actor)! } : {}),
    ...(normalizeOptionalText(value.content ?? value.message) ? { content: normalizeOptionalText(value.content ?? value.message)! } : {}),
    ...(normalizeOptionalText(value.createdAt ?? value.created_at) ? { createdAt: normalizeOptionalText(value.createdAt ?? value.created_at)! } : {}),
    ...(data ? { data } : {}),
  }
}

function normalizeSymphonyCodexHookThreadEvent(
  value: SymphonyThreadReconcileEventInput,
  input: ReconcileSymphonyThreadEventsInput,
  index: number,
  hookEventName: string,
): ThreadControlEvent {
  const sessionId = normalizeOptionalText(value.sessionId ?? value.session_id)
  const commonData = normalizeSymphonyThreadEventData(value, {
    source: 'codex-native-hook',
    hookEventName,
    ...(sessionId ? { sessionId } : {}),
  })
  const id = normalizeOptionalText(value.id)
    ?? `codex_hook_${safeSymphonyIdSegment(sessionId ?? 'session')}_${safeSymphonyIdSegment(hookEventName)}_${index + 1}`
  const content = normalizeOptionalText(value.content ?? value.message)
    ?? `Codex hook ${hookEventName}${sessionId ? ` for ${sessionId}` : ''}.`
  const createdAt = normalizeOptionalText(value.createdAt ?? value.created_at)

  if (hookEventName === 'UserPromptSubmit') {
    return {
      id,
      type: 'message.appended',
      ...(normalizeOptionalText(input.chat) ? { chat: normalizeOptionalText(input.chat)! } : {}),
      ...(normalizeOptionalText(input.thread) ? { thread: normalizeOptionalText(input.thread)! } : {}),
      actor: { role: 'user' },
      content,
      ...(createdAt ? { createdAt } : {}),
      data: {
        ...(commonData ?? {}),
        role: 'user',
      },
    }
  }

  if (hookEventName === 'PreToolUse') {
    return {
      id,
      type: 'approval.required',
      ...(normalizeOptionalText(input.chat) ? { chat: normalizeOptionalText(input.chat)! } : {}),
      ...(normalizeOptionalText(input.thread) ? { thread: normalizeOptionalText(input.thread)! } : {}),
      actor: { role: 'tool' },
      content,
      ...(createdAt ? { createdAt } : {}),
      data: commonData,
    }
  }

  return {
    id,
    type: 'run.updated',
    ...(normalizeOptionalText(input.chat) ? { chat: normalizeOptionalText(input.chat)! } : {}),
    ...(normalizeOptionalText(input.thread) ? { thread: normalizeOptionalText(input.thread)! } : {}),
    actor: { role: 'runtime' },
    content,
    ...(createdAt ? { createdAt } : {}),
    data: commonData,
  }
}

function normalizeSymphonyThreadEventData(
  value: SymphonyThreadReconcileEventInput,
  defaults: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const data = isPlainSymphonyRecord(value.data) ? value.data : {}
  return sanitizeSymphonyRunStepPayload({
    ...data,
    ...defaults,
  })
}

function normalizeSymphonyThreadEventActor(value: unknown): ReconcilerActorRef | undefined {
  if (!isPlainSymphonyRecord(value)) {
    return undefined
  }
  const id = normalizeOptionalText(value.id)
  const role = normalizeOptionalText(value.role)
  const label = normalizeOptionalText(value.label)
  if (!id && !role && !label) {
    return undefined
  }
  return {
    ...(id ? { id } : {}),
    ...(role ? { role: role as ReconcilerActorRef['role'] } : {}),
    ...(label ? { label } : {}),
  }
}

function normalizeSymphonyThreadEventType(value: unknown): ReconcilerEventType | undefined {
  return normalizeOptionalText(value) as ReconcilerEventType | undefined
}

function resolveSymphonyThreadReconcilerNextAction(
  wakeJobs: WakeJobSummary[],
  notificationEvents: ReconcilerNotificationEvent[],
): SymphonyThreadReconcilerNextAction {
  if (wakeJobs.some((job) => job.targetRole === 'secretary')) {
    return 'wake_secretary'
  }
  if (wakeJobs.some((job) => job.targetRole === 'worker')) {
    return 'wake_worker'
  }
  if (wakeJobs.some((job) => job.targetRole === 'reviewer')) {
    return 'wake_reviewer'
  }
  if (notificationEvents.length > 0) {
    return 'notify_user'
  }
  return 'noop'
}

function summarizeSymphonyThreadReconcilerResult(
  eventCount: number,
  nextAction: SymphonyThreadReconcilerNextAction,
  wakeJobCount: number,
  notificationCount: number,
): string {
  if (eventCount === 0) {
    return 'No Symphony thread events to reconcile.'
  }
  if (nextAction === 'wake_secretary') {
    return `Reconciled ${eventCount} event(s); wake Secretary with ${wakeJobCount} queued job(s).`
  }
  if (nextAction === 'wake_worker') {
    return `Reconciled ${eventCount} event(s); wake worker with ${wakeJobCount} queued job(s).`
  }
  if (nextAction === 'wake_reviewer') {
    return `Reconciled ${eventCount} event(s); wake reviewer with ${wakeJobCount} queued job(s).`
  }
  if (nextAction === 'notify_user') {
    return `Reconciled ${eventCount} event(s); notify user with ${notificationCount} notification(s).`
  }
  return `Reconciled ${eventCount} event(s); no wake job is required.`
}

function safeSymphonyIdSegment(value: string): string {
  const normalized = value
    .replace(/[^a-zA-Z0-9._:-]/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 96)
  return normalized || 'unknown'
}

function isPlainSymphonyRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value)
}

function extractSymphonyFinalJsonBlocks(text: string): string[] {
  const blocks: string[] = []
  for (const match of text.matchAll(/```(?:json)?\s*(?:symphony-final|linx-symphony-final)?\s*\n([\s\S]*?)```/giu)) {
    const body = match[1]?.trim()
    if (body && /"symphonyFinal"|"followUps"|"summary"/u.test(body)) {
      blocks.push(body)
    }
  }
  return blocks
}

function extractSymphonyDeliveryJsonBlocks(text: string): string[] {
  const blocks: string[] = []
  for (const match of text.matchAll(/```(?:json)?\s*(?:symphony-delivery|linx-symphony-delivery)?\s*\n([\s\S]*?)```/giu)) {
    const body = match[1]?.trim()
    if (body && /"symphonyDelivery"|"symphonyFinal"|"events"|"reportText"|"exitCode"/u.test(body)) {
      blocks.push(body)
    }
  }
  return blocks
}

function extractGenericJsonBlocks(text: string): string[] {
  const blocks: string[] = []
  for (const match of text.matchAll(/```json\s*\n([\s\S]*?)```/giu)) {
    const body = match[1]?.trim()
    if (body) {
      blocks.push(body)
    }
  }
  return blocks
}

function normalizeRuntimeDeliveryReportText(value: Record<string, unknown>): string | undefined {
  const explicitReport = normalizeOptionalText(value.reportText ?? value.report_text)
  if (explicitReport) {
    return explicitReport
  }

  const report = value.report ?? value.finalReport ?? value.final_report
  const reportText = normalizeOptionalText(report)
  if (reportText) {
    return reportText
  }
  const reportEnvelope = normalizeFinalReportEnvelope(report)
  if (reportEnvelope) {
    return stringifySymphonyFinalReportEnvelope(reportEnvelope)
  }

  const envelope = normalizeFinalReportEnvelope(value)
  return envelope ? stringifySymphonyFinalReportEnvelope(envelope) : undefined
}

function stringifySymphonyFinalReportEnvelope(envelope: SymphonyFinalReportEnvelope): string {
  return [
    '```json',
    JSON.stringify({ symphonyFinal: true, ...envelope }),
    '```',
  ].join('\n')
}

function normalizeRuntimeDeliveryEvents(value: unknown): SymphonyRuntimeDeliveryEvent[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => normalizeRuntimeDeliveryEvent(item))
    .filter((item): item is SymphonyRuntimeDeliveryEvent => Boolean(item))
}

function normalizeRuntimeDeliveryEvent(value: unknown): SymphonyRuntimeDeliveryEvent | null {
  if (!isRecord(value)) {
    return null
  }
  const stepType = normalizeRuntimeEventType(value.stepType ?? value.step_type ?? value.type)
  if (!stepType) {
    return null
  }
  const payload = isRecord(value.payload) ? value.payload : undefined
  return {
    stepType,
    ...(normalizeOptionalText(value.message) ? { message: normalizeOptionalText(value.message) } : {}),
    ...(payload ? { payload } : {}),
    ...(normalizeRuntimeDeliveryTimestamp(value.createdAt ?? value.created_at ?? value.timestamp) ? {
      createdAt: normalizeRuntimeDeliveryTimestamp(value.createdAt ?? value.created_at ?? value.timestamp),
    } : {}),
    ...(normalizeOptionalText(value.randomId ?? value.random_id) ? { randomId: normalizeOptionalText(value.randomId ?? value.random_id) } : {}),
  }
}

function normalizeRuntimeEventType(value: unknown): SymphonyRuntimeEventType | undefined {
  const normalized = normalizeOptionalText(value)
  if (
    normalized === 'session.started'
    || normalized === 'session.resumed'
    || normalized === 'run.started'
    || normalized === 'run.step'
    || normalized === 'approval.required'
    || normalized === 'input.required'
    || normalized === 'worker.blocked'
    || normalized === 'delivery.submitted'
    || normalized === 'delivery.completed'
    || normalized === 'delivery.failed'
    || normalized === 'run.completed'
    || normalized === 'run.failed'
  ) {
    return normalized
  }
  return undefined
}

function normalizeRuntimeDeliveryStatus(value: unknown): SymphonyRuntimeDeliveryResult['status'] | undefined {
  const normalized = normalizeOptionalText(value)
  if (normalized === 'completed' || normalized === 'success' || normalized === 'succeeded' || normalized === 'ok') {
    return 'completed'
  }
  if (normalized === 'failed' || normalized === 'failure' || normalized === 'error') {
    return 'failed'
  }
  return undefined
}

function normalizeRuntimeDeliveryExitCode(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  const normalized = normalizeOptionalText(value)
  if (!normalized) {
    return undefined
  }
  const parsed = Number.parseInt(normalized, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeRuntimeDeliveryTimestamp(value: unknown): string | undefined {
  const normalized = normalizeOptionalText(value)
  if (!normalized) {
    return undefined
  }
  const parsed = new Date(normalized)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : normalized
}

function parseJsonObject(text: string | undefined): unknown {
  const normalized = normalizeOptionalText(text)
  if (!normalized) {
    return null
  }
  try {
    return JSON.parse(normalized) as unknown
  } catch {
    return null
  }
}

function normalizeFinalReportEnvelope(value: unknown): SymphonyFinalReportEnvelope | null {
  if (!isRecord(value)) {
    return null
  }

  const followUps = normalizeFollowUpCandidateList(value.followUps ?? value.follow_up_candidates ?? value.followUpCandidates)
  const evidence = normalizeStringList(value.evidence)
  const risks = normalizeStringList(value.risks)
  const changedFiles = normalizeStringList(value.changedFiles ?? value.changed_files)
  const commands = normalizeStringList(value.commands)
  const envelope: SymphonyFinalReportEnvelope = {
    ...(normalizeOptionalText(value.summary) ? { summary: normalizeOptionalText(value.summary) } : {}),
    evidence,
    risks,
    changedFiles,
    commands,
    followUps,
  }

  const hasEnvelopeSignal = value.symphonyFinal === true
    || envelope.summary
    || evidence.length > 0
    || risks.length > 0
    || changedFiles.length > 0
    || commands.length > 0
    || followUps.length > 0

  return hasEnvelopeSignal ? envelope : null
}

function normalizeFollowUpCandidateList(value: unknown): SymphonyFollowUpCandidate[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => normalizeFollowUpCandidateFromUnknown(item))
    .filter((item): item is SymphonyFollowUpCandidate => Boolean(item))
}

function normalizeFollowUpCandidateFromUnknown(value: unknown): SymphonyFollowUpCandidate | null {
  if (!isRecord(value)) {
    return null
  }
  const summary = normalizeOptionalText(value.summary)
  if (!summary) {
    return null
  }

  return normalizeSymphonyFollowUpCandidate({
    kind: normalizeFollowUpKind(value.kind),
    summary,
    evidence: normalizeStringList(value.evidence),
    ...(normalizeDisposition(value.suggestedDisposition ?? value.suggested_disposition ?? value.disposition) ? {
      suggestedDisposition: normalizeDisposition(value.suggestedDisposition ?? value.suggested_disposition ?? value.disposition),
    } : {}),
    ...(normalizeOptionalText(value.reason) ? { reason: normalizeOptionalText(value.reason) } : {}),
    ...(value.requiredBeforeAcceptance === true || value.required_before_acceptance === true ? { requiredBeforeAcceptance: true } : {}),
    ...(value.userDecisionRequired === true || value.user_decision_required === true ? { userDecisionRequired: true } : {}),
    ...(normalizeOptionalText(value.targetPackage ?? value.target_package) ? { targetPackage: normalizeOptionalText(value.targetPackage ?? value.target_package) } : {}),
  })
}

function createSymphonyDispatchReconcilerState(input: {
  issue: string
  task: string
  delivery: string
  session: string
  chat?: string
  thread?: string
  targetAgent: string
  now: Date
  randomId: string
}): SymphonyReconcilerState {
  const { summary } = decideThreadControlEvent({
    policy: {
      kind: 'symphony',
      assignedWorkerAgent: input.targetAgent,
      secretaryAgent: '__secretary__',
    },
    event: {
      type: 'delivery.submitted',
      ...(input.chat ? { chat: input.chat } : {}),
      ...(input.thread ? { thread: input.thread } : {}),
      resource: input.delivery,
      actor: {
        id: '__secretary__',
        role: 'secretary',
      },
      data: {
        deliveryType: 'task_dispatch',
        issue: input.issue,
        task: input.task,
        delivery: input.delivery,
        session: input.session,
      },
    },
    now: input.now,
    randomId: input.randomId,
  })
  return {
    decisions: [summary],
  }
}

function isReconcileDecisionSummary(
  decision: ReconcileDecision | ReconcileDecisionSummary,
): decision is ReconcileDecisionSummary {
  return 'eventType' in decision
}

export function formatSymphonySessionSummary(session: SymphonySessionRecord): string {
  const linked = session.autoModeSessionId ? ` -> ${session.autoModeSessionId}` : ''
  return `${formatSymphonyUri(session.uri)} ${session.status} ${session.backend}/${session.mode}${linked} (${session.cwd})`
}

export function formatSymphonyDeliverySummary(delivery: SymphonyDeliveryRecord): string {
  return `${formatSymphonyUri(delivery.uri)} ${delivery.status} ${delivery.sourceAgent} -> ${delivery.targetBackend} (${formatSymphonyUri(delivery.issue)}/${formatSymphonyUri(delivery.task)})`
}

export function formatSymphonyIssueSummary(issue: SymphonyIssueRecord): string {
  return `${formatSymphonyUri(issue.uri)} ${issue.status} ${issue.title} (${issue.tasks.length} task${issue.tasks.length === 1 ? '' : 's'})`
}

export function getSymphonyArchiveKey(uri: string): string {
  const trimmed = uri.trim()
  if (!trimmed) {
    throw new Error('Missing Symphony resource URI')
  }
  const tail = trimmed.match(/[:/#]([^:/#]+)$/u)?.[1] ?? trimmed
  const key = decodeURIComponent(tail)
    .replace(/[^a-zA-Z0-9._-]/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
  return key || Buffer.from(trimmed).toString('base64url')
}

function createSymphonyResourceUri(kind: SymphonyResourceKind, options: { now?: Date; randomId?: string } = {}): string {
  const key = `${kind}_${formatSymphonyTimestamp(options.now)}_${normalizeSymphonyRandomId(options.randomId)}`
  return `${SYMPHONY_URI_PREFIX}:${kind}:${key}`
}

function formatSymphonyUri(uri: string): string {
  return getSymphonyArchiveKey(uri)
}

function createSymphonyTitle(objective: string): string {
  const compact = objective.replace(/\s+/gu, ' ').trim()
  return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact
}

function normalizeSymphonyAcceptanceCriteria(criteria?: string[]): string[] {
  return (criteria ?? [])
    .flatMap((item) => item.split(/\r?\n/u))
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeRequiredText(value: string | undefined, name: string): string {
  const normalized = normalizeOptionalText(value)
  if (!normalized) {
    throw new Error(`Missing Symphony ${name}`)
  }
  return normalized
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || undefined
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => normalizeOptionalText(item))
    .filter((item): item is string => Boolean(item))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeSymphonyChatThreadRef(
  input: Pick<CreateSymphonyRunPlanInput, 'chat' | 'thread' | 'messages'>,
): SymphonyChatThreadRef {
  const chat = normalizeOptionalText(input.chat)
  const thread = normalizeOptionalText(input.thread)
  const messages = (input.messages ?? [])
    .map((item) => normalizeOptionalText(item))
    .filter((item): item is string => Boolean(item))
  return {
    ...(chat ? { chat } : {}),
    ...(thread ? { thread } : {}),
    ...(messages.length > 0 ? { messages } : {}),
  }
}

function createSymphonyWorkerUris(
  options: { now?: Date; randomId?: string },
  index: number,
): { task: string; delivery: string; session: string } {
  if (index === 0) {
    return {
      task: createTaskUri(options),
      delivery: createSymphonyDeliveryUri(options),
      session: createSymphonySessionUri(options),
    }
  }

  const suffix = `w${index + 1}`
  return {
    task: createTaskUri({ ...options, randomId: `${normalizeSymphonyRandomId(options.randomId)}-${suffix}` }),
    delivery: createSymphonyDeliveryUri({ ...options, randomId: `${normalizeSymphonyRandomId(options.randomId)}-${suffix}` }),
    session: createSymphonySessionUri({ ...options, randomId: `${normalizeSymphonyRandomId(options.randomId)}-${suffix}` }),
  }
}

function normalizeSymphonyWorkerWorkspace(
  root: WorkerWorkspace,
  override: Partial<WorkerWorkspace> | undefined,
  backend: AutoModeWorkerBackend,
): WorkerWorkspace {
  const path = normalizeOptionalText(override?.path) ?? root.path
  return {
    path,
    kind: override?.kind ?? root.kind,
    ...(normalizeOptionalText(override?.repository ?? root.repository) ? { repository: normalizeOptionalText(override?.repository ?? root.repository) } : {}),
    ...(normalizeOptionalText(override?.branch ?? root.branch) ? { branch: normalizeOptionalText(override?.branch ?? root.branch) } : {}),
    ...(normalizeOptionalText(override?.worktree ?? root.worktree) ? { worktree: normalizeOptionalText(override?.worktree ?? root.worktree) } : {}),
    ...(normalizeOptionalText(override?.container ?? root.container) ? { container: normalizeOptionalText(override?.container ?? root.container) } : {}),
    ...(normalizeOptionalText(override?.baseRevision ?? root.baseRevision) ? { baseRevision: normalizeOptionalText(override?.baseRevision ?? root.baseRevision) } : {}),
    environment: normalizeSymphonyWorkerEnvironment(override?.environment ?? root.environment, backend),
  }
}

function normalizeSymphonyWorkerEnvironment(
  environment: Partial<WorkerEnvironment> | undefined,
  backend: AutoModeWorkerBackend,
): WorkerEnvironment {
  const kind = environment?.kind ?? (backend === 'codex' || backend === 'claude' || backend === 'codebuddy' ? 'backend-runtime' : 'local-shell')
  return {
    kind,
    ...(normalizeOptionalText(environment?.id) ? { id: normalizeOptionalText(environment?.id) } : {}),
    ...(normalizeOptionalText(environment?.label) ? { label: normalizeOptionalText(environment?.label) } : {}),
    runtime: normalizeOptionalText(environment?.runtime) ?? backend,
  }
}

function formatSymphonyWorkerEnvironment(environment: WorkerEnvironment): string {
  return [
    environment.kind,
    environment.runtime ? `runtime=${environment.runtime}` : undefined,
    environment.id ? `id=${environment.id}` : undefined,
    environment.label ? `label=${environment.label}` : undefined,
  ].filter(Boolean).join(' ')
}

function normalizeSymphonyIssuer(input: CreateSymphonyRunPlanInput): SymphonyIssuerRef {
  const explicit = input.issuer ?? {}
  const chatThread = normalizeSymphonyChatThreadRef({
    chat: explicit.chat ?? input.chat,
    thread: explicit.thread ?? input.thread,
    messages: explicit.messages ?? input.messages,
  })

  return {
    source: explicit.source ?? 'user',
    ...(normalizeOptionalText(explicit.webId) ? { webId: normalizeOptionalText(explicit.webId) } : {}),
    ...(normalizeOptionalText(explicit.agent) ? { agent: normalizeOptionalText(explicit.agent) } : {}),
    ...(normalizeOptionalText(explicit.label) ? { label: normalizeOptionalText(explicit.label) } : {}),
    ...chatThread,
  }
}

function normalizeSymphonyWorkerSpecs(input: CreateSymphonyRunPlanInput): Array<{
  target: SymphonyDelegationTarget
  title?: string
  objective: string
  acceptanceCriteria: string[]
  model?: string
  supervisor?: SymphonySupervisorPolicy
  workspace?: Partial<WorkerWorkspace>
}> {
  const workers: SymphonyWorkerSpec[] = input.workers && input.workers.length > 0 ? input.workers : [input.target ?? {}]
  const rootObjective = normalizeRequiredText(input.objective, 'objective')
  const rootAcceptanceCriteria = normalizeSymphonyAcceptanceCriteria(input.acceptanceCriteria)
  return workers.map((worker, index) => {
    const target = normalizeSymphonyDelegationTarget({
      ...input,
      target: {
        ...worker,
        backend: worker.backend ?? input.backend,
      },
    })
    const objective = normalizeOptionalText(worker.objective) ?? rootObjective
    const label = normalizeOptionalText(worker.label) ?? normalizeOptionalText(worker.agent)
    const title = normalizeOptionalText(worker.title)
      ?? (workers.length > 1 && label ? createSymphonyTitle(`${label}: ${objective}`) : undefined)
      ?? (workers.length > 1 ? createSymphonyTitle(`Worker ${index + 1}: ${objective}`) : undefined)
    const acceptanceCriteria = normalizeSymphonyAcceptanceCriteria(worker.acceptanceCriteria)
    const model = normalizeOptionalText(worker.model) ?? normalizeOptionalText(input.workerModel) ?? normalizeOptionalText(input.model)
    const supervisor = createSymphonySupervisorPolicy(worker.supervisorIntervalMs ?? input.workerSupervisorIntervalMs)

    return {
      target,
      ...(title ? { title } : {}),
      objective,
      acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : rootAcceptanceCriteria,
      ...(model ? { model } : {}),
      ...(supervisor ? { supervisor } : {}),
      ...(worker.workspace ? { workspace: worker.workspace } : {}),
    }
  })
}

function createSymphonySupervisorPolicy(intervalMs: unknown): SymphonySupervisorPolicy | undefined {
  const normalized = typeof intervalMs === 'number' && Number.isFinite(intervalMs)
    ? Math.trunc(intervalMs)
    : undefined
  if (!normalized || normalized <= 0) {
    return undefined
  }

  return {
    strategy: 'interval',
    intervalMs: normalized,
    immediateWakeKinds: ['approval', 'question', 'blocked', 'failed', 'completed'],
  }
}

function normalizeSymphonyDelegationTarget(input: CreateSymphonyRunPlanInput): SymphonyDelegationTarget {
  const explicit = input.target ?? {}
  const chatThread = normalizeSymphonyChatThreadRef({
    chat: explicit.chat ?? input.chat,
    thread: explicit.thread ?? input.thread,
    messages: explicit.messages ?? input.messages,
  })
  const agent = normalizeOptionalText(explicit.agent) ?? `${input.backend}-worker`
  const label = normalizeOptionalText(explicit.label)
  const source = explicit.source
    ?? (chatThread.chat || chatThread.thread
      ? 'active-session'
      : input.target
        ? 'explicit-backend'
        : 'default')

  return {
    source,
    backend: explicit.backend ?? input.backend,
    agent,
    ...(label ? { label } : {}),
    ...chatThread,
  }
}

function formatSymphonyTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/gu, '-')
}

function normalizeSymphonyRandomId(randomId?: string): string {
  const normalized = typeof randomId === 'string'
    ? randomId.replace(/[^a-zA-Z0-9_-]/gu, '')
    : ''
  if (!normalized) {
    return Math.random().toString(36).slice(2, 10)
  }
  if (normalized.length <= 12) {
    return normalized
  }
  return `${normalized.slice(0, 6)}${hashSymphonyRandomId(normalized)}`
}

function hashSymphonyRandomId(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36).slice(0, 6).padStart(6, '0')
}
