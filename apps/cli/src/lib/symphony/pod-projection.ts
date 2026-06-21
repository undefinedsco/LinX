import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  SymphonyDeliveryRecord,
  SymphonyIdeaRecord,
  SymphonyIssueRecord,
  SymphonyRunPlan,
  SymphonySessionRecord,
  SymphonySessionStatus,
  WorkerWorkspace,
} from '@linx/agent-runtime/symphony'
import { getSymphonyArchiveKey } from '@linx/agent-runtime/symphony'
import { appendChatReconcilerMetadata, reconcileChatAppend } from '@linx/agent-runtime'
import { DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_ID } from '@linx/agent-runtime/companion-model'
import { decideThreadControlEvent } from '@linx/agent-runtime/thread-reconciler-controller'
import type { AutoModeWorkerBackend } from '@linx/agent-runtime/auto-mode'
import { createLinxPodSyncScope, type LinxSyncOperation } from '@linx/agent-runtime/sync'
import {
  buildSymphonyChatRow as buildSharedSymphonyChatRow,
  buildSymphonyContactRows as buildSharedSymphonyContactRows,
  buildSymphonyControlRows,
  buildSymphonyDeliveryRow as buildSharedSymphonyDeliveryRow,
  buildSymphonyIssueRow as buildSharedSymphonyIssueRow,
  buildSymphonyMessageIri as buildSharedSymphonyMessageIri,
  buildSymphonyRunRow as buildSharedSymphonyRunRow,
  buildSymphonyRunStepRow as buildSharedSymphonyRunStepRow,
  buildSymphonyRuntimeRunStepRow as buildSharedSymphonyRuntimeRunStepRow,
  buildSymphonySessionRow as buildSharedSymphonySessionRow,
  buildSymphonyStatusMessageRow as buildSharedSymphonyStatusMessageRow,
  buildSymphonyTaskRow as buildSharedSymphonyTaskRow,
  buildSymphonyThreadRow as buildSharedSymphonyThreadRow,
  buildSymphonyThreadRows as buildSharedSymphonyThreadRows,
  listOpenSymphonyIssuesFromControlState,
  listRecentSymphonyReportsFromControlState,
  listRunningSymphonyWorkersFromControlState,
  type SymphonyControlReportStatus,
  type SymphonyControlWorkerStatus,
} from '@linx/stores/symphony-control'
import {
  type ExactRecordDatabase,
  insertExactRecordOnce,
  type PodResource,
  upsertExactRecord,
} from '@undefineds.co/drizzle-solid'
import { getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js'
import {
  ContactClass,
  ContactType,
  chatRepository,
  agentResource,
  contactResource,
  deliveryResource,
  evidenceResource,
  ideaResource,
  issueResource,
  messageResource,
  reportResource,
  runResource,
  runStepResource,
  sessionResource,
  taskResource,
  threadRepository,
  type AuditInsert,
  type ChatInsert,
  type DeliveryInsert,
  type EvidenceInsert,
  type IdeaInsert,
  type InboxNotificationInsert,
  type IssueInsert,
  type MessageInsert,
  type ReportInsert,
  type RunInsert,
  type RunStepInsert,
  type SessionInsert,
  type SolidDatabase,
  type TaskInsert,
  type ThreadInsert,
} from '../models.js'
import { pathToWorkspaceUri } from '../pod-mirror-mapping.js'
import { getSymphonyHome } from './archive.js'

const SYMPHONY_CHAT_ID = 'symphony'
const SYMPHONY_SECRETARY_AGENT_ID = '__secretary__'
const SYMPHONY_CONTACT_ID = 'symphony'
const SYMPHONY_POLICY_VERSION = 'linx-symphony-session/v1'
const SYMPHONY_WORKER_POD_ACCESS_POLICY_VERSION = 'linx-symphony-worker-pod-access/v1'
const SYMPHONY_ARCHIVE_PROVENANCE_VERSION = 'linx-symphony-archive/v1'

type ProjectionStage = 'planned' | 'running' | 'completed' | 'failed'
type SymphonyArchiveRefs = Partial<Record<'idea' | 'issue' | 'task' | 'delivery' | 'session', string>>

export interface SymphonyPodProjectionResult {
  plan: SymphonyRunPlan
  chat: string
  thread: string
  messages: string[]
  resources: SymphonyPodProjectionResource[]
}

export interface SymphonyPodProjectionResource {
  kind: string
  uri: string
  document: string
}

export interface SymphonyJsonLdMirrorFile {
  resource: SymphonyPodProjectionResource
  path: string
  row: Record<string, unknown>
}

export interface SymphonyJsonLdMirrorResult {
  dir: string
  files: SymphonyJsonLdMirrorFile[]
}

export interface SymphonyPodProjectionRuntime {
  getPodDataSession: () => Promise<PodDataSession | null>
  createDb: (session: PodDataSession) => PodProjectionDb
  chatResource: PodResource<any>
  threadResource: PodResource<any>
  messageResource: PodResource<any>
  sessionResource: PodResource<any>
  ideaResource: PodResource<any>
  issueResource: PodResource<any>
  taskResource: PodResource<any>
  deliveryResource: PodResource<any>
  runResource: PodResource<any>
  runStepResource: PodResource<any>
  evidenceResource: PodResource<any>
  reportResource: PodResource<any>
  agentResource: PodResource<any>
  contactResource: PodResource<any>
  auditResource: PodResource<any>
  inboxNotificationResource?: PodResource<any>
}

type PodProjectionDb = SolidDatabase & ExactRecordDatabase

export type SymphonyPodWorkerStatus = SymphonyControlWorkerStatus
export type SymphonyPodReportStatus = SymphonyControlReportStatus

export interface SymphonyPodIssueLookupResult {
  issues: SymphonyIssueRecord[]
}

interface SymphonyAgentRow extends Record<string, unknown> {
  id: string
  name: string
  provider: string
  model: string
  description?: string
  createdAt: Date
  updatedAt: Date
}

interface SymphonyContactRow extends Record<string, unknown> {
  id: string
  name: string
  about: string
  rdfType: string
  contactType: string
  createdAt: Date
  updatedAt: Date
}

function normalizeSymphonyRunPlan(plan: SymphonyRunPlan): SymphonyRunPlan {
  const workers = Array.isArray(plan.workers) && plan.workers.length > 0
    ? plan.workers
    : [{
      task: plan.task,
      taskRecord: plan.taskRecord ?? {
        uri: plan.task,
        issue: plan.issue.uri,
        title: plan.issue.title,
        objective: plan.issue.description ?? plan.issue.title,
        acceptanceCriteria: [],
        status: plan.session.status === 'completed'
          ? 'completed'
          : plan.session.status === 'failed'
            ? 'failed'
            : plan.session.status === 'running'
              ? 'running'
              : 'pending',
        target: plan.session.target,
        backend: plan.session.backend,
        agent: plan.session.target.agent,
        delivery: plan.delivery.uri,
        session: plan.session.uri,
        createdAt: plan.session.createdAt,
        updatedAt: plan.session.updatedAt,
      },
      delivery: plan.delivery,
      session: plan.session,
    }]
  const normalizedWorkers = workers.map((worker) => ({
    ...worker,
    taskRecord: worker.taskRecord ?? {
      uri: worker.task,
      issue: worker.session.issue,
      title: plan.issue.title,
      objective: plan.issue.description ?? plan.issue.title,
      acceptanceCriteria: [],
      status: worker.session.status === 'completed'
        ? 'completed'
        : worker.session.status === 'failed'
          ? 'failed'
          : worker.session.status === 'running'
            ? 'running'
            : 'pending',
      target: worker.session.target,
      backend: worker.session.backend,
      agent: worker.session.target.agent,
      delivery: worker.delivery.uri,
      session: worker.session.uri,
      chat: worker.session.chat,
      thread: worker.session.thread,
      messages: worker.session.messages,
      createdAt: worker.session.createdAt,
      updatedAt: worker.session.updatedAt,
    },
  }))
  const primary = normalizedWorkers[0]!
  const issue = {
    ...plan.issue,
    issuer: plan.issue.issuer ?? {
      source: 'user',
      ...(plan.issue.chat ? { chat: plan.issue.chat } : {}),
      ...(plan.issue.thread ? { thread: plan.issue.thread } : {}),
      ...(plan.issue.messages ? { messages: plan.issue.messages } : {}),
    },
    tasks: plan.issue.tasks?.length ? plan.issue.tasks : normalizedWorkers.map((worker) => worker.task),
    deliveries: plan.issue.deliveries?.length ? plan.issue.deliveries : normalizedWorkers.map((worker) => worker.delivery.uri),
    sessions: plan.issue.sessions?.length ? plan.issue.sessions : normalizedWorkers.map((worker) => worker.session.uri),
  }

  return {
    issue,
    task: primary.task,
    taskRecord: primary.taskRecord,
    delivery: primary.delivery,
    session: primary.session,
    workers: normalizedWorkers,
    ...(plan.followUpIssues?.length ? { followUpIssues: plan.followUpIssues } : {}),
  }
}

async function dynamicImport(specifier: string): Promise<Record<string, any>> {
  const loader = new Function('modulePath', 'return import(modulePath)') as (modulePath: string) => Promise<Record<string, any>>
  return loader(specifier)
}

async function createDefaultRuntime(): Promise<SymphonyPodProjectionRuntime> {
  const models = await dynamicImport(new URL('../models.js', import.meta.url).href)

  return {
    getPodDataSession: getDefaultPodDataSession,
    createDb(podSession) {
      return models.drizzle(podSession.solidSession, {
        logger: false,
        disableInteropDiscovery: true,
        podUrl: podSession.podUrl,
        resourcePreparation: 'best-effort' as never,
        schema: models.solidResources,
      }) as unknown as PodProjectionDb
    },
    chatResource: models.chatResource,
    threadResource: models.threadResource,
    messageResource: models.messageResource,
    sessionResource: models.sessionResource,
    ideaResource: models.ideaResource,
    issueResource: models.issueResource,
    taskResource: models.taskResource,
    deliveryResource: models.deliveryResource,
    runResource: models.runResource,
    runStepResource: models.runStepResource,
    evidenceResource: models.evidenceResource,
    reportResource: models.reportResource,
    agentResource: models.agentResource,
    contactResource: models.contactResource,
    auditResource: models.auditResource,
    inboxNotificationResource: models.inboxNotificationResource,
  }
}

function selectTargetChatIri(value: string | undefined, webId: string, plan?: SymphonyRunPlan): string {
  if (!value) {
    const thread = plan?.session.target?.thread
    if (thread) {
      return chatRepository.iri(webId, threadRepository.chatIdFromRef(thread) ?? SYMPHONY_CHAT_ID)
    }
    return buildSymphonyChatUri(webId)
  }
  return chatRepository.iri(webId, value)
}

function selectTargetThreadIri(value: string | undefined, webId: string, plan: SymphonyRunPlan): string {
  if (!value) {
    return selectDefaultThreadIri(webId, plan)
  }
  return threadRepository.iriForChat(webId, selectTargetChatIri(plan.session.target?.chat, webId, plan), value)
}

function buildTargetChatId(plan: SymphonyRunPlan, webId: string): string {
  return chatRepository.target(selectTargetChatIri(plan.session.target?.chat, webId, plan)).id
}

function buildSymphonyChatUri(webId: string): string {
  return chatRepository.iri(webId, SYMPHONY_CHAT_ID)
}

function buildSymphonyThreadUri(webId: string, plan: SymphonyRunPlan): string {
  return threadRepository.iriForChat(webId, SYMPHONY_CHAT_ID, buildSymphonyThreadId(plan))
}

function selectDefaultThreadIri(webId: string, plan: SymphonyRunPlan): string {
  const targetThread = plan.session.target?.thread
  if (targetThread) {
    return targetThread
  }

  return threadRepository.iriForChat(webId, selectTargetChatIri(plan.session.target?.chat, webId, plan), buildSymphonyThreadId(plan))
}

function buildSymphonyControlSessionUri(webId: string, plan: SymphonyRunPlan): string {
  return sessionResource.buildIri(webId,  {
    id: buildSymphonyThreadId(plan),
    createdAt: plan.session.createdAt,
  })
}

function buildSymphonyWorkerSessionUri(webId: string, worker: SymphonyRunPlan['workers'][number]): string {
  return sessionResource.buildIri(webId,  {
    id: buildSymphonySessionRecordId(worker.session),
    createdAt: worker.session.createdAt,
  })
}

function buildSymphonyMessageUri(webId: string, plan: SymphonyRunPlan, row: Pick<MessageInsert, 'id' | 'createdAt'>): string {
  const chat = selectTargetChatIri(plan.session.target?.chat, webId, plan)
  return messageResource.buildIri(webId,  {
    id: String(row.id),
    parent: chat,
    chat,
    thread: selectTargetThreadIri(plan.session.target?.thread, webId, plan),
    createdAt: row.createdAt,
  })
}

function buildSymphonyIssueId(issue: SymphonyIssueRecord): string {
  return getSymphonyArchiveKey(issue.uri)
}

function buildSymphonyIssueIri(webId: string, issue: SymphonyIssueRecord): string {
  return issueResource.buildIri(webId,  { id: buildSymphonyIssueId(issue) })
}

function normalizeSymphonyIssueIri(webId: string, issue: string): string {
  if (/^https?:\/\//u.test(issue)) {
    return issue
  }
  return buildSymphonyIssueIri(webId, {
    uri: issue,
    title: '',
    status: 'open',
    priority: 'medium',
    source: 'cli',
    issuer: { source: 'system' },
    tasks: [],
    deliveries: [],
    sessions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
}

function buildSymphonyTaskKey(task: string): string {
  return getSymphonyArchiveKey(task)
}

function buildSymphonyTaskIri(webId: string, task: string): string {
  return taskResource.buildIri(webId,  { id: buildSymphonyTaskKey(task) })
}

function normalizeSymphonyTaskIri(webId: string, task: string): string {
  if (/^https?:\/\//u.test(task)) {
    return task
  }
  return buildSymphonyTaskIri(webId, task)
}

function buildSymphonyDeliveryIri(webId: string, worker: SymphonyRunPlan['workers'][number]): string {
  return deliveryResource.buildIri(webId,  {
    id: getSymphonyArchiveKey(worker.delivery.uri),
    task: buildSymphonyTaskIri(webId, worker.task),
    createdAt: safeDate(worker.delivery.createdAt),
  })
}

function buildSymphonyReportDeliveryIri(webId: string, worker: SymphonyRunPlan['workers'][number]): string {
  return deliveryResource.buildIri(webId,  {
    id: `${getSymphonyArchiveKey(worker.session.uri)}-report`,
    task: buildSymphonyTaskIri(webId, worker.task),
    createdAt: safeDate(worker.session.completedAt ?? worker.session.updatedAt),
  })
}

function buildSymphonyRunIri(webId: string, worker: SymphonyRunPlan['workers'][number]): string {
  return runResource.buildIri(webId,  {
    id: getSymphonyArchiveKey(worker.session.uri),
    task: buildSymphonyTaskIri(webId, worker.task),
    createdAt: safeDate(worker.session.createdAt),
  })
}

function buildSymphonyRunStepIri(webId: string, worker: SymphonyRunPlan['workers'][number], stage: ProjectionStage): string {
  return runStepResource.buildIri(webId,  {
    id: `${getSymphonyArchiveKey(worker.session.uri)}-${stage}`,
    run: buildSymphonyRunIri(webId, worker),
  })
}

function buildSymphonyRuntimeRunStepIri(
  webId: string,
  worker: SymphonyRunPlan['workers'][number],
  step: NonNullable<SymphonyRunPlan['workers'][number]['runSteps']>[number],
): string {
  return runStepResource.buildIri(webId, {
    id: getSymphonyArchiveKey(step.uri),
    run: buildSymphonyRunIri(webId, worker),
  })
}

function buildSymphonyWorkerPodAccessPolicy(
  plan: SymphonyRunPlan,
  webId: string,
  worker: SymphonyRunPlan['workers'][number],
): Record<string, unknown> {
  return {
    version: SYMPHONY_WORKER_POD_ACCESS_POLICY_VERSION,
    authority: '__secretary__-control-lane',
    assigned: {
      issue: buildSymphonyIssueIri(webId, plan.issue),
      task: buildSymphonyTaskIri(webId, worker.task),
      delivery: buildSymphonyDeliveryIri(webId, worker),
      run: buildSymphonyRunIri(webId, worker),
      session: buildSymphonyWorkerSessionUri(webId, worker),
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

function buildSymphonyArchiveRefs(refs: SymphonyArchiveRefs): Record<string, string> {
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

function buildSymphonyArchiveMetadata(refs: SymphonyArchiveRefs): { archive: Record<string, string> } {
  return {
    archive: buildSymphonyArchiveRefs(refs),
  }
}

function buildSymphonySpaceContract(
  plan: SymphonyRunPlan,
  webId: string,
  worker: SymphonyRunPlan['workers'][number],
): Record<string, unknown> {
  return {
    control: {
      authority: 'pod-control-records',
      sharedRecords: [
        buildSymphonyIssueIri(webId, plan.issue),
        buildSymphonyTaskIri(webId, worker.task),
        buildSymphonyDeliveryIri(webId, worker),
        buildSymphonyRunIri(webId, worker),
        buildSymphonyWorkerSessionUri(webId, worker),
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

function resolveSymphonyRuntimeSessionRelation(
  plan: SymphonyRunPlan,
  webId: string,
  worker: SymphonyRunPlan['workers'][number],
): string {
  const secretaryThread = selectTargetThreadIri(plan.issue.thread, webId, plan)
  const workerThread = selectWorkerThreadIri(plan, webId, worker)
  if (secretaryThread === workerThread) {
    return 'same-thread-or-room'
  }
  return 'runtime-projected-worker-session'
}

function buildSymphonyWorkspaceMetadata(
  plan: SymphonyRunPlan,
  worker: SymphonyRunPlan['workers'][number],
): Record<string, unknown> {
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

function normalizeWorkerWorkspace(
  workspace: WorkerWorkspace | undefined,
  fallbackPath: string,
): WorkerWorkspace {
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

function safeDate(input: string | Date | undefined): Date {
  const date = input instanceof Date ? input : new Date(input ?? Date.now())
  return Number.isFinite(date.getTime()) ? date : new Date()
}

function buildSymphonySessionRecordId(session: Pick<SymphonySessionRecord, 'uri'>): string {
  return session.uri
    .trim()
    .replace(/^urn:undefineds:linx:session:/u, '')
    .replace(/[^a-zA-Z0-9._-]/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '') || 'symphony-session'
}

function buildSymphonyThreadId(plan: Pick<SymphonyRunPlan, 'session'>): string {
  return buildSymphonySessionRecordId(plan.session)
}

function readWorkerChatRef(worker: SymphonyRunPlan['workers'][number]): string | undefined {
  return worker.session.target?.chat
    ?? worker.session.chat
    ?? worker.taskRecord.chat
    ?? worker.delivery.chat
}

function readWorkerThreadRef(worker: SymphonyRunPlan['workers'][number]): string | undefined {
  return worker.session.target?.thread
    ?? worker.session.thread
    ?? worker.taskRecord.thread
    ?? worker.delivery.thread
}

function readWorkerMessages(worker: SymphonyRunPlan['workers'][number]): string[] {
  return worker.session.target?.messages
    ?? worker.session.messages
    ?? worker.taskRecord.messages
    ?? worker.delivery.messages
    ?? []
}

function selectWorkerChatIri(
  plan: SymphonyRunPlan,
  webId: string,
  worker: SymphonyRunPlan['workers'][number],
): string {
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

function selectWorkerThreadIri(
  plan: SymphonyRunPlan,
  webId: string,
  worker: SymphonyRunPlan['workers'][number],
): string {
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

function buildWorkerThreadId(plan: SymphonyRunPlan, webId: string, worker: SymphonyRunPlan['workers'][number]): string {
  return threadRepository.idFromRef(selectWorkerThreadIri(plan, webId, worker))
    ?? buildSymphonySessionRecordId(worker.session)
}

function withChatThreadRefs(plan: SymphonyRunPlan, refs: { chat: string; thread: string; messages: string[] }): SymphonyRunPlan {
  const workers = plan.workers.map((worker) => ({
    task: worker.task,
    taskRecord: {
      ...worker.taskRecord,
      chat: refs.chat,
      thread: refs.thread,
      messages: refs.messages,
    },
    delivery: {
      ...worker.delivery,
      chat: refs.chat,
      thread: refs.thread,
      messages: refs.messages,
    },
    session: {
      ...worker.session,
      chat: refs.chat,
      thread: refs.thread,
      messages: refs.messages,
    },
    ...(worker.runSteps?.length ? { runSteps: worker.runSteps } : {}),
  }))
  const primary = workers[0] ?? {
    task: plan.task,
    taskRecord: {
      ...plan.taskRecord,
      chat: refs.chat,
      thread: refs.thread,
      messages: refs.messages,
    },
    delivery: {
      ...plan.delivery,
      chat: refs.chat,
      thread: refs.thread,
      messages: refs.messages,
    },
    session: {
      ...plan.session,
      chat: refs.chat,
      thread: refs.thread,
      messages: refs.messages,
    },
  }

  return {
    issue: {
      ...plan.issue,
      chat: refs.chat,
      thread: refs.thread,
      messages: refs.messages,
    },
    task: primary.task,
    taskRecord: primary.taskRecord,
    delivery: primary.delivery,
    session: primary.session,
    workers,
    ...(plan.followUpIssues?.length ? { followUpIssues: plan.followUpIssues } : {}),
  }
}

function withTargetRefs(
  plan: SymphonyRunPlan,
  refs: { chat: string; thread: string; messages: string[] },
  webId: string,
): SymphonyRunPlan {
  const workers = plan.workers.map((worker, index) => {
    const workerThread = selectWorkerThreadIri(plan, webId, worker)
    const sameThreadAsControl = workerThread === refs.thread
    const workerRefs = index === 0
      ? refs
      : {
        chat: selectWorkerChatIri(plan, webId, worker),
        thread: workerThread,
        messages: sameThreadAsControl ? refs.messages : readWorkerMessages(worker),
      }
    const target = {
      ...worker.session.target,
      chat: workerRefs.chat,
      thread: workerRefs.thread,
      messages: workerRefs.messages,
    }

    return {
      task: worker.task,
      taskRecord: {
        ...worker.taskRecord,
        chat: workerRefs.chat,
        thread: workerRefs.thread,
        messages: workerRefs.messages,
        target,
      },
      delivery: {
        ...worker.delivery,
        chat: workerRefs.chat,
        thread: workerRefs.thread,
        messages: workerRefs.messages,
        target,
      },
      session: {
        ...worker.session,
        chat: workerRefs.chat,
        thread: workerRefs.thread,
        messages: workerRefs.messages,
        target,
      },
      ...(worker.runSteps?.length ? { runSteps: worker.runSteps } : {}),
    }
  })
  const primary = workers[0] ?? {
    task: plan.task,
    taskRecord: {
      ...plan.taskRecord,
      chat: refs.chat,
      thread: refs.thread,
      messages: refs.messages,
    },
    delivery: {
      ...plan.delivery,
      chat: refs.chat,
      thread: refs.thread,
      messages: refs.messages,
    },
    session: {
      ...plan.session,
      chat: refs.chat,
      thread: refs.thread,
      messages: refs.messages,
    },
  }

  return {
    issue: {
      ...plan.issue,
      chat: refs.chat,
      thread: refs.thread,
      messages: refs.messages,
    },
    task: primary.task,
    taskRecord: primary.taskRecord,
    delivery: primary.delivery,
    session: primary.session,
    workers,
    ...(plan.followUpIssues?.length ? { followUpIssues: plan.followUpIssues } : {}),
  }
}

function buildSymphonyWorkerSummary(
  plan: SymphonyRunPlan,
  webId: string,
  worker: SymphonyRunPlan['workers'][number],
): Record<string, unknown> {
  return {
    task: worker.task,
    title: worker.taskRecord.title,
    objective: worker.taskRecord.objective,
    acceptanceCriteria: worker.taskRecord.acceptanceCriteria,
    taskStatus: worker.taskRecord.status,
    delivery: worker.delivery.uri,
    session: worker.session.uri,
    sessionResource: buildSymphonyWorkerSessionUri(webId, worker),
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

function buildSymphonyReconcilerMetadata(worker: SymphonyRunPlan['workers'][number]): Record<string, unknown> {
  const fallbackDispatch = createFallbackSymphonyDispatchDecision(worker)
  const taskDecisions = worker.taskRecord.reconciler?.decisions ?? [fallbackDispatch]
  const deliveryDecisions = worker.delivery.reconciler?.decisions ?? [fallbackDispatch]
  const sessionDecisions = worker.session.reconciler?.decisions ?? [fallbackDispatch]
  const allDecisions = [...taskDecisions, ...deliveryDecisions, ...sessionDecisions]
  const latest = allDecisions.at(-1)

  return {
    taskDecisions,
    deliveryDecisions,
    sessionDecisions,
    ...(latest ? { latest } : {}),
  }
}

function createFallbackSymphonyDispatchDecision(worker: SymphonyRunPlan['workers'][number]) {
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

function buildSymphonyIdeaRow(idea: SymphonyIdeaRecord, webId: string): IdeaInsert {
  const createdAt = safeDate(idea.createdAt)
  const updatedAt = safeDate(idea.updatedAt)
  return {
    id: getSymphonyArchiveKey(idea.uri),
    summary: idea.summary,
    input: idea.input,
    status: idea.status,
    commitment: idea.commitment,
    affectedArea: idea.affectedArea,
    currentUnderstanding: idea.currentUnderstanding,
    openQuestions: idea.openQuestions,
    related: idea.relatedRecords,
    conflicts: idea.conflicts,
    nextStep: idea.nextStep,
    promotedTo: idea.promotedTo,
    chat: idea.chat,
    thread: idea.thread,
    sourceMessages: idea.messages,
    createdBy: webId,
    metadata: {
      surface: 'symphony',
      ...buildSymphonyArchiveMetadata({ idea: idea.uri }),
    },
    createdAt,
    updatedAt,
  } as IdeaInsert
}

function buildSymphonyReportDeliveryRow(
  plan: SymphonyRunPlan,
  webId: string,
  worker: SymphonyRunPlan['workers'][number],
  stage: Extract<ProjectionStage, 'completed' | 'failed'>,
): DeliveryInsert {
  const completedAt = safeDate(worker.session.completedAt ?? worker.session.updatedAt)
  const workerAgent = agentResource.buildIri(webId,  {
    id: buildWorkerAgentId(worker.session.backend, worker.session.target.agent),
  })
  const secretaryAgent = agentResource.buildIri(webId,  { id: SYMPHONY_SECRETARY_AGENT_ID })
  const run = buildSymphonyRunIri(webId, worker)
  const task = buildSymphonyTaskIri(webId, worker.task)
  const originalDelivery = buildSymphonyDeliveryIri(webId, worker)
  const status = worker.session.status === 'failed' || stage === 'failed' ? 'failed' : 'completed'
  const summary = status === 'completed'
    ? `${worker.taskRecord.title} completed.`
    : `${worker.taskRecord.title} failed: ${worker.session.error ?? worker.delivery.error ?? 'worker did not complete successfully.'}`

  return {
    id: deliveryResource.buildId( {
      id: `${getSymphonyArchiveKey(worker.session.uri)}-report`,
      task: buildSymphonyTaskIri(webId, worker.task),
      createdAt: completedAt,
    }),
    kind: 'report',
    status: 'completed',
    task,
    source: workerAgent,
    target: secretaryAgent,
    chat: selectWorkerChatIri(plan, webId, worker),
    thread: selectWorkerThreadIri(plan, webId, worker),
    targetThread: selectTargetThreadIri(plan.issue.thread ?? worker.session.target?.thread, webId, plan),
    targetSession: buildSymphonyControlSessionUri(webId, plan),
    actor: workerAgent,
    object: run,
    objective: summary,
    payload: {
      kind: 'symphony_report',
      outcome: status,
      summary,
      issue: buildSymphonyIssueIri(webId, plan.issue),
      task,
      delivery: originalDelivery,
      reportDelivery: buildSymphonyReportDeliveryIri(webId, worker),
      session: buildSymphonyControlSessionUri(webId, plan),
      run,
      backend: worker.session.backend,
      agent: worker.session.target.agent,
      autoModeSessionId: worker.session.autoModeSessionId,
      exitCode: worker.session.exitCode,
      error: worker.session.error ?? worker.delivery.error ?? worker.taskRecord.error,
      acceptanceReview: worker.delivery.acceptanceReview ?? worker.taskRecord.acceptanceReview ?? worker.session.acceptanceReview,
      evidence: {
        statusMessage: buildSharedSymphonyMessageIri(webId, plan, buildSharedSymphonyStatusMessageRow(plan, webId, stage)),
        runStep: buildSymphonyRunStepIri(webId, worker, stage),
      },
    },
    projection: {
      runtimeRole: 'system',
      message: summary,
    },
    projectedRole: 'system',
    metadata: {
      surface: 'symphony',
      ...buildSymphonyArchiveMetadata({
        issue: plan.issue.uri,
        task: worker.task,
        delivery: worker.delivery.uri,
        session: worker.session.uri,
      }),
      reportKind: 'worker-completion',
      acceptanceReview: worker.delivery.acceptanceReview ?? worker.taskRecord.acceptanceReview ?? worker.session.acceptanceReview,
    },
    error: status === 'failed' ? worker.session.error ?? worker.delivery.error ?? worker.taskRecord.error : undefined,
    createdAt: completedAt,
    dispatchedAt: completedAt,
    consumedAt: completedAt,
    completedAt,
    updatedAt: completedAt,
  } as DeliveryInsert
}

function buildWorkerAgentId(backend: AutoModeWorkerBackend, agent?: string): string {
  const suffix = (agent ?? `${backend}-worker`)
    .trim()
    .replace(/[^a-zA-Z0-9._-]/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
  return `symphony-${suffix || `${backend}-worker`}`
}

function buildSymphonyAgents(plan: SymphonyRunPlan): SymphonyAgentRow[] {
  const now = safeDate(plan.session.updatedAt)
  const agents = [
    {
      id: SYMPHONY_SECRETARY_AGENT_ID,
      name: 'AI Secretary',
      description: 'LinX Secretary that delegates Symphony tasks and manages worker progress.',
      provider: 'undefineds',
      model: DEFAULT_AGENT_RUNTIME_COMPANION_MODEL_ID,
      createdAt: now,
      updatedAt: now,
    },
  ]
  const seen = new Set(agents.map((agent) => agent.id))
  for (const worker of plan.workers) {
    const id = buildWorkerAgentId(worker.session.backend, worker.session.target.agent)
    if (seen.has(id)) {
      continue
    }
    seen.add(id)
    agents.push({
      id,
      name: worker.session.target.label ?? worker.session.target.agent ?? backendDisplayName(worker.session.backend),
      description: `Worker runtime controlled through Symphony by AI Secretary.`,
      provider: worker.session.backend,
      model: worker.session.model ?? worker.session.backend,
      createdAt: now,
      updatedAt: now,
    })
  }
  return agents
}

function auditActionForStage(stage: ProjectionStage): string {
  if (stage === 'running') return 'symphony.dispatched'
  return `symphony.${stage}`
}

function stableAuditId(plan: SymphonyRunPlan, stage: ProjectionStage): string {
  const hash = createHash('sha256')
  hash.update(plan.session.uri)
  hash.update('\0')
  hash.update(stage)
  return `symphony-${hash.digest('hex').slice(0, 16)}`
}

function stableReportInboxNotificationId(worker: SymphonyRunPlan['workers'][number]): string {
  const hash = createHash('sha256')
  hash.update(worker.session.uri)
  hash.update('\0report')
  return `symphony-report-${hash.digest('hex').slice(0, 16)}`
}

function buildSymphonyReportInboxNotificationRow(
  webId: string,
  worker: SymphonyRunPlan['workers'][number],
): InboxNotificationInsert {
  const createdAt = safeDate(worker.session.completedAt ?? worker.session.updatedAt)
  return {
    id: stableReportInboxNotificationId(worker),
    actor: agentResource.buildIri(webId,  {
      id: buildWorkerAgentId(worker.session.backend, worker.session.target.agent),
    }),
    object: buildSymphonyReportDeliveryIri(webId, worker),
    createdAt,
  } as InboxNotificationInsert
}

function buildSymphonyAuditRow(plan: SymphonyRunPlan, webId: string, stage: ProjectionStage): AuditInsert {
  const message = buildSharedSymphonyStatusMessageRow(plan, webId, stage)
  const createdAt = safeDate(message.createdAt)

  return {
    id: stableAuditId(plan, stage),
    action: auditActionForStage(stage),
    actor: agentResource.buildIri(webId,  { id: SYMPHONY_SECRETARY_AGENT_ID }),
    actorRole: 'secretary',
    onBehalfOf: webId,
    session: buildSymphonyControlSessionUri(webId, plan),
    entry: buildSharedSymphonyMessageIri(webId, plan, message),
    policyVersion: SYMPHONY_POLICY_VERSION,
    createdAt,
  } as AuditInsert
}

async function upsertChat(db: PodProjectionDb, runtime: SymphonyPodProjectionRuntime, row: ChatInsert): Promise<void> {
  await upsertExactRecord(db, runtime.chatResource, { id: row.id }, row as Record<string, unknown>, {
    title: row.title,
    participants: row.participants,
    metadata: row.metadata,
    lastActiveAt: row.lastActiveAt,
    lastMessagePreview: row.lastMessagePreview,
    updatedAt: row.updatedAt,
  })
}

async function upsertThread(db: PodProjectionDb, runtime: SymphonyPodProjectionRuntime, row: ThreadInsert): Promise<void> {
  await upsertExactRecord(db, runtime.threadResource, { id: row.id }, row as Record<string, unknown>, {
    title: row.title,
    metadata: row.metadata,
    updatedAt: row.updatedAt,
  })
}

async function upsertMessage(db: PodProjectionDb, runtime: SymphonyPodProjectionRuntime, row: MessageInsert): Promise<void> {
  await upsertExactRecord(db, runtime.messageResource, {
    id: row.id,
    parent: row.parent,
    chat: row.chat,
    createdAt: row.createdAt,
  }, row as Record<string, unknown>, {
    maker: row.maker,
    role: row.role,
    content: row.content,
    richContent: row.richContent,
    status: row.status,
    senderName: row.senderName,
    routedBy: row.routedBy,
    routeTargetAgent: row.routeTargetAgent,
    coordinationId: row.coordinationId,
    metadata: row.metadata,
    updatedAt: row.updatedAt,
  })
}

async function upsertSession(db: PodProjectionDb, runtime: SymphonyPodProjectionRuntime, row: SessionInsert): Promise<void> {
  await upsertExactRecord(db, runtime.sessionResource, {
    id: row.id,
    createdAt: row.createdAt,
  }, row as Record<string, unknown>, {
    owner: row.owner,
    chat: row.chat,
    thread: row.thread,
    sessionType: row.sessionType,
    status: row.status,
    tool: row.tool,
    tokenUsage: row.tokenUsage,
    messages: row.messages,
    policyVersion: row.policyVersion,
    metadata: row.metadata,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  })
}

async function upsertIssue(db: PodProjectionDb, runtime: SymphonyPodProjectionRuntime, row: IssueInsert): Promise<void> {
  await upsertExactRecord(db, runtime.issueResource, { id: row.id }, row as Record<string, unknown>, {
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

async function upsertIdea(db: PodProjectionDb, runtime: SymphonyPodProjectionRuntime, row: IdeaInsert): Promise<void> {
  await upsertExactRecord(db, runtime.ideaResource, { id: row.id }, row as Record<string, unknown>, {
    summary: row.summary,
    input: row.input,
    status: row.status,
    commitment: row.commitment,
    affectedArea: row.affectedArea,
    currentUnderstanding: row.currentUnderstanding,
    openQuestions: row.openQuestions,
    related: row.related,
    conflicts: row.conflicts,
    nextStep: row.nextStep,
    promotedTo: row.promotedTo,
    chat: row.chat,
    thread: row.thread,
    sourceMessages: row.sourceMessages,
    metadata: row.metadata,
    updatedAt: row.updatedAt,
  })
}

async function upsertTask(db: PodProjectionDb, runtime: SymphonyPodProjectionRuntime, row: TaskInsert): Promise<void> {
  await upsertExactRecord(db, runtime.taskResource, { id: row.id }, row as Record<string, unknown>, {
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

async function upsertDelivery(db: PodProjectionDb, runtime: SymphonyPodProjectionRuntime, row: DeliveryInsert): Promise<void> {
  await upsertExactRecord(db, runtime.deliveryResource, { id: row.id }, row as Record<string, unknown>, {
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

async function upsertRun(db: PodProjectionDb, runtime: SymphonyPodProjectionRuntime, row: RunInsert): Promise<void> {
  await upsertExactRecord(db, runtime.runResource, { id: row.id }, row as Record<string, unknown>, {
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
    error: row.error,
    metadata: row.metadata,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
  })
}

async function insertRunStepOnce(db: PodProjectionDb, runtime: SymphonyPodProjectionRuntime, row: RunStepInsert): Promise<void> {
  await insertExactRecordOnce(db, runtime.runStepResource, String(row.id), row as Record<string, unknown>)
}

async function insertEvidenceOnce(db: PodProjectionDb, runtime: SymphonyPodProjectionRuntime, row: EvidenceInsert): Promise<void> {
  await insertExactRecordOnce(db, runtime.evidenceResource, String(row.id), row as Record<string, unknown>)
}

async function upsertReport(db: PodProjectionDb, runtime: SymphonyPodProjectionRuntime, row: ReportInsert): Promise<void> {
  await upsertExactRecord(db, runtime.reportResource, { id: row.id }, row as Record<string, unknown>, {
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

async function upsertAgent(db: PodProjectionDb, runtime: SymphonyPodProjectionRuntime, row: SymphonyAgentRow): Promise<void> {
  const target = { id: row.id }
  const agentResourceWithId = runtime.agentResource as PodResource<any> & {
    buildId?: (target: Record<string, unknown>) => string
  }
  await upsertExactRecord(db, runtime.agentResource, target, {
    ...row,
    id: typeof agentResourceWithId.buildId === 'function'
      ? agentResourceWithId.buildId(target)
      : row.id,
  }, {
    name: row.name,
    description: row.description,
    provider: row.provider,
    model: row.model,
    updatedAt: row.updatedAt,
  })
}

async function upsertContact(db: PodProjectionDb, runtime: SymphonyPodProjectionRuntime, row: SymphonyContactRow): Promise<void> {
  await upsertExactRecord(db, runtime.contactResource, { id: row.id }, row, {
    name: row.name,
    about: row.about,
    rdfType: row.rdfType,
    contactType: row.contactType,
    updatedAt: row.updatedAt,
  })
}

async function insertAuditOnce(db: PodProjectionDb, runtime: SymphonyPodProjectionRuntime, row: AuditInsert): Promise<void> {
  await insertExactRecordOnce(db, runtime.auditResource, {
    id: String(row.id),
    createdAt: row.createdAt,
  }, row as Record<string, unknown>)
}

async function insertInboxNotificationOnce(
  db: PodProjectionDb,
  runtime: SymphonyPodProjectionRuntime,
  row: InboxNotificationInsert,
): Promise<void> {
  if (!runtime.inboxNotificationResource) {
    return
  }

  await insertExactRecordOnce(db, runtime.inboxNotificationResource, String(row.id), row as Record<string, unknown>)
}

function collectMessageUris(webId: string, plan: SymphonyRunPlan, stages: ProjectionStage[]): string[] {
  return Array.from(new Set(stages.map((stage) => buildSharedSymphonyMessageIri(webId, plan, buildSharedSymphonyStatusMessageRow(plan, webId, stage)))))
}

function collectSymphonyProjectionResources(
  webId: string,
  plan: SymphonyRunPlan,
  stages: ProjectionStage[],
): SymphonyPodProjectionResource[] {
  const resources: SymphonyPodProjectionResource[] = []
  const add = (kind: string, uri: string | undefined) => {
    if (!uri) return
    resources.push({
      kind,
      uri,
      document: uri.split('#')[0] ?? uri,
    })
  }

  add('chat', selectTargetChatIri(plan.session.target?.chat, webId, plan))
  add('issue', buildSymphonyIssueIri(webId, plan.issue))
  for (const issue of plan.followUpIssues ?? []) {
    add('issue', buildSymphonyIssueIri(webId, issue))
  }

  for (const message of collectMessageUris(webId, plan, stages)) {
    add('message', message)
  }

  for (const agent of buildSymphonyAgents(plan)) {
    add('agent', agentResource.buildIri(webId,  { id: agent.id }))
  }
  for (const contact of buildSharedSymphonyContactRows(plan, webId)) {
    add('contact', contactResource.buildIri(webId,  { id: contact.id }))
  }

  for (const worker of plan.workers) {
    add('chat', selectWorkerChatIri(plan, webId, worker))
    add('thread', selectWorkerThreadIri(plan, webId, worker))
    add('session', buildSymphonyWorkerSessionUri(webId, worker))
    add('task', buildSymphonyTaskIri(webId, worker.task))
    add('delivery', buildSymphonyDeliveryIri(webId, worker))
    add('run', buildSymphonyRunIri(webId, worker))
    for (const stage of stages) {
      add('runStep', buildSymphonyRunStepIri(webId, worker, stage))
    }
    for (const step of worker.runSteps ?? []) {
      add('runStep', buildSymphonyRuntimeRunStepIri(webId, worker, step))
    }
    if (worker.session.status === 'completed' || worker.session.status === 'failed') {
      add('delivery', buildSymphonyReportDeliveryIri(webId, worker))
    }
  }

  return resources
}

function projectionStagesForStatus(status: SymphonySessionStatus): ProjectionStage[] {
  if (status === 'running') return ['planned', 'running']
  if (status === 'completed') return ['planned', 'running', 'completed']
  if (status === 'failed') return ['planned', 'running', 'failed']
  return ['planned']
}

export async function persistSymphonyControlStateToPod(
  plan: SymphonyRunPlan,
  options: { stage?: ProjectionStage; runtime?: SymphonyPodProjectionRuntime } = {},
): Promise<SymphonyPodProjectionResult | null> {
  const normalizedPlan = normalizeSymphonyRunPlan(plan)
  const runtime = options.runtime ?? await createDefaultRuntime()
  const podSession = await runtime.getPodDataSession()
  if (!podSession) {
    return null
  }

  const db = runtime.createDb(podSession)
  const stage = options.stage ?? (normalizedPlan.session.status === 'completed' || normalizedPlan.session.status === 'failed' || normalizedPlan.session.status === 'running'
    ? normalizedPlan.session.status
    : 'planned')
  const stages = projectionStagesForStatus(normalizedPlan.session.status).includes(stage)
    ? projectionStagesForStatus(normalizedPlan.session.status)
    : [stage]
  const messages = collectMessageUris(podSession.webId, normalizedPlan, stages)
  const refs = {
    chat: selectTargetChatIri(normalizedPlan.session.target?.chat, podSession.webId, normalizedPlan),
    thread: selectTargetThreadIri(normalizedPlan.session.target?.thread, podSession.webId, normalizedPlan),
    messages,
  }
  const projected = withTargetRefs(normalizedPlan, refs, podSession.webId)
  const resources = collectSymphonyProjectionResources(podSession.webId, projected, stages)

  const controlWrite = createLinxPodSyncScope({
    source: 'symphony-control-state',
    plane: 'control-plane',
  })
  await controlWrite.runOperations({
    action: 'symphony.write',
    resourceBindings: {
      session: {
        uri: buildSymphonyControlSessionUri(podSession.webId, projected),
        local: buildSymphonyThreadId(projected),
      },
      issue: {
        uri: projected.issue.uri,
        local: getSymphonyArchiveKey(projected.issue.uri),
      },
      chat: {
        uri: refs.chat,
        local: chatRepository.target(refs.chat).id,
      },
      thread: {
        uri: refs.thread,
        local: threadRepository.idFromRef(refs.thread) ?? buildSymphonyThreadId(projected),
      },
    },
    metadata: {
      session: projected.session.uri,
      issue: projected.issue.uri,
    },
    operations: buildSymphonyProjectionOperations({
      db,
      runtime,
      plan: projected,
      webId: podSession.webId,
      stage,
      stages,
      shouldUpsertChat: !normalizedPlan.session.target?.chat,
    }),
  })

  return {
    plan: projected,
    ...refs,
    resources,
  }
}

/** @deprecated Use persistSymphonyControlStateToPod for LinX-owned Symphony records. */
export const persistSymphonyProjectionToPod = persistSymphonyControlStateToPod

export async function mirrorSymphonyProjectionJsonLdFromPod(
  projection: SymphonyPodProjectionResult,
  options: { runtime?: SymphonyPodProjectionRuntime; dir?: string } = {},
): Promise<SymphonyJsonLdMirrorResult | null> {
  const runtime = options.runtime ?? await createDefaultRuntime()
  const podSession = await runtime.getPodDataSession()
  if (!podSession) {
    return null
  }

  const db = runtime.createDb(podSession)

  const resources = Array.from(new Map((projection.resources ?? [])
    .map((resource) => [resource.uri, resource] as const)).values())
  if (resources.length === 0) {
    return null
  }

  await db.init(collectProjectionResourceModels(runtime, resources)).catch(() => undefined)

  const dir = options.dir ?? join(getSymphonyHome(), 'jsonld')
  mkdirSync(dir, { recursive: true })
  const files: SymphonyJsonLdMirrorFile[] = []

  for (const resource of resources) {
    const model = resolveProjectionResourceModel(runtime, resource.kind)
    if (!model) {
      continue
    }

    const row = await db.findByIri(model, resource.uri)
    const record = asRecord(row)
    if (!record) {
      continue
    }

    const document = serializeOrmRowAsJsonLd(model, resource.uri, record)
    const path = join(dir, `${encodeURIComponent(resource.uri)}.jsonld`)
    writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, 'utf-8')
    files.push({ resource, path, row: record })
  }

  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify({
    mirroredAt: new Date().toISOString(),
    source: 'drizzle-solid-orm',
    files: files.map((file) => ({
      resource: file.resource,
      path: file.path,
    })),
  }, null, 2)}\n`, 'utf-8')

  return { dir, files }
}

function collectProjectionResourceModels(
  runtime: SymphonyPodProjectionRuntime,
  resources: SymphonyPodProjectionResource[],
): Array<PodResource<any>> {
  return Array.from(new Set(resources
    .map((resource) => resolveProjectionResourceModel(runtime, resource.kind))
    .filter((resource): resource is PodResource<any> => Boolean(resource))))
}

function resolveProjectionResourceModel(runtime: SymphonyPodProjectionRuntime, kind: string): PodResource<any> | null {
  if (kind === 'chat') return runtime.chatResource
  if (kind === 'thread') return runtime.threadResource
  if (kind === 'message') return runtime.messageResource
  if (kind === 'session') return runtime.sessionResource
  if (kind === 'idea') return runtime.ideaResource
  if (kind === 'issue') return runtime.issueResource
  if (kind === 'task') return runtime.taskResource
  if (kind === 'delivery') return runtime.deliveryResource
  if (kind === 'run') return runtime.runResource
  if (kind === 'runStep') return runtime.runStepResource
  if (kind === 'agent') return runtime.agentResource
  if (kind === 'contact') return runtime.contactResource
  if (kind === 'audit') return runtime.auditResource
  if (kind === 'inbox') return runtime.inboxNotificationResource ?? null
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function serializeOrmRowAsJsonLd(model: unknown, iri: string, row: Record<string, unknown>): Record<string, unknown> {
  const context: Record<string, unknown> = {}
  const document: Record<string, unknown> = {
    '@context': context,
    '@id': iri,
  }
  const rdfType = normalizeString(readModelMapping(model)?.type)
  if (rdfType) {
    document['@type'] = rdfType
  }

  for (const [field, value] of Object.entries(row)) {
    if (value === undefined || value === null) {
      continue
    }
    const column = readOrmColumnMapping(model, field)
    if (!column || column.predicate === '@id') {
      continue
    }

    context[field] = jsonLdContextForColumn(column)
    document[field] = jsonLdValueForColumn(value, column)
  }

  return document
}

function readModelMapping(model: unknown): Record<string, unknown> | null {
  const record = asRecord(model)
  return asRecord(record?.mapping) ?? asRecord(record?.config)
}

function readOrmColumnMapping(model: unknown, field: string): {
  predicate: string
  kind?: string
  dataType?: string
  datatype?: string
  isArray?: boolean
} | null {
  const mappingColumn = asRecord(asRecord(readModelMapping(model)?.columns)?.[field])
  const modelColumn = asRecord(asRecord(model)?.columns)?.[field]
  const columnOptions = asRecord(asRecord(modelColumn)?.options)
  const predicate = normalizeString(mappingColumn?.predicate) ?? normalizeString(columnOptions?.predicate)
  if (!predicate) {
    return null
  }
  return {
    predicate,
    kind: normalizeString(mappingColumn?.kind),
    dataType: normalizeString(asRecord(modelColumn)?.dataType),
    datatype: normalizeString(mappingColumn?.datatype),
    isArray: Boolean(mappingColumn?.isArray ?? columnOptions?.isArray),
  }
}

function jsonLdContextForColumn(column: {
  predicate: string
  kind?: string
  dataType?: string
  datatype?: string
  isArray?: boolean
}): unknown {
  if (column.kind === 'object' || column.dataType === 'uri') {
    return {
      '@id': column.predicate,
      '@type': '@id',
      ...(column.isArray ? { '@container': '@set' } : {}),
    }
  }

  if (column.dataType === 'object' || column.dataType === 'json' || column.datatype?.endsWith('#json')) {
    return {
      '@id': column.predicate,
      '@type': '@json',
    }
  }

  if (column.dataType === 'datetime' || column.datatype?.endsWith('#dateTime')) {
    return {
      '@id': column.predicate,
      '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
      ...(column.isArray ? { '@container': '@set' } : {}),
    }
  }

  if (column.isArray) {
    return {
      '@id': column.predicate,
      '@container': '@set',
    }
  }

  return column.predicate
}

function jsonLdValueForColumn(value: unknown, column: { dataType?: string; kind?: string }): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => jsonLdValueForColumn(item, column))
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  return value
}

export async function persistSymphonyIdeaToPod(
  idea: SymphonyIdeaRecord,
  options: { runtime?: SymphonyPodProjectionRuntime } = {},
): Promise<SymphonyIdeaRecord | null> {
  const runtime = options.runtime ?? await createDefaultRuntime()
  const podSession = await runtime.getPodDataSession()
  if (!podSession) {
    return null
  }

  const db = runtime.createDb(podSession)
  const ideaWrite = createLinxPodSyncScope({
    source: 'symphony-control-state',
    plane: 'control-plane',
  })
  await ideaWrite.runOperations({
    action: 'symphony.idea.write',
    resourceBindings: {
      idea: {
        uri: ideaResource.buildIri(podSession.webId,  {
          id: getSymphonyArchiveKey(idea.uri),
          createdAt: idea.createdAt,
        }),
        local: getSymphonyArchiveKey(idea.uri),
      },
      ...(idea.chat ? { chat: { uri: idea.chat, local: chatRepository.target(idea.chat).id } } : {}),
      ...(idea.thread ? { thread: { uri: idea.thread, local: threadRepository.idFromRef(idea.thread) } } : {}),
    },
    metadata: {
      idea: idea.uri,
      status: idea.status,
      commitment: idea.commitment,
    },
    operations: [
      {
        id: 'symphony.idea.prepare-resources',
        kind: 'prepare',
        apply: async () => {
          await db.init([
            runtime.ideaResource,
            runtime.chatResource,
            runtime.threadResource,
          ]).catch(() => undefined)
        },
      },
      {
        id: 'symphony.idea.upsert',
        kind: 'upsert',
        apply: () => upsertIdea(db, runtime, buildSymphonyIdeaRow(idea, podSession.webId)),
      },
    ],
  })

  return idea
}

export async function listOpenSymphonyIssuesFromPod(
  options: { runtime?: SymphonyPodProjectionRuntime } = {},
): Promise<SymphonyIssueRecord[] | null> {
  const runtime = options.runtime ?? await createDefaultRuntime()
  const podSession = await runtime.getPodDataSession()
  if (!podSession) {
    return null
  }

  const db = runtime.createDb(podSession)

  try {
    return await listOpenSymphonyIssuesFromControlState({
      db,
      webId: podSession.webId,
    })
  } catch {
    return null
  }
}

export async function listRunningSymphonyWorkersFromPod(
  options: { runtime?: SymphonyPodProjectionRuntime } = {},
): Promise<SymphonyPodWorkerStatus[] | null> {
  const runtime = options.runtime ?? await createDefaultRuntime()
  const podSession = await runtime.getPodDataSession()
  if (!podSession) {
    return null
  }

  const db = runtime.createDb(podSession)

  try {
    return await listRunningSymphonyWorkersFromControlState({ db })
  } catch {
    return null
  }
}

export async function listRecentSymphonyReportsFromPod(
  options: { runtime?: SymphonyPodProjectionRuntime; limit?: number } = {},
): Promise<SymphonyPodReportStatus[] | null> {
  const runtime = options.runtime ?? await createDefaultRuntime()
  const podSession = await runtime.getPodDataSession()
  if (!podSession || !runtime.deliveryResource) {
    return null
  }

  const db = runtime.createDb(podSession)

  try {
    return await listRecentSymphonyReportsFromControlState({
      db,
      limit: options.limit ?? 5,
    })
  } catch {
    return null
  }
}

function buildSymphonyProjectionOperations(input: {
  db: PodProjectionDb
  runtime: SymphonyPodProjectionRuntime
  plan: SymphonyRunPlan
  webId: string
  stage: ProjectionStage
  stages: ProjectionStage[]
  shouldUpsertChat: boolean
}): LinxSyncOperation[] {
  const controlRows = buildSymphonyControlRows({
    plan: input.plan,
    webId: input.webId,
    stage: input.stage,
    stages: input.stages,
  })

  return [
    {
      id: 'symphony.prepare-resources',
      kind: 'prepare',
      apply: async () => {
        await input.db.init([
          input.runtime.chatResource,
          input.runtime.threadResource,
          input.runtime.messageResource,
          input.runtime.sessionResource,
          input.runtime.issueResource,
          input.runtime.taskResource,
          input.runtime.deliveryResource,
          input.runtime.runResource,
          input.runtime.runStepResource,
          input.runtime.evidenceResource,
          input.runtime.reportResource,
          input.runtime.agentResource,
          input.runtime.contactResource,
          input.runtime.auditResource,
          ...(input.runtime.inboxNotificationResource ? [input.runtime.inboxNotificationResource] : []),
        ]).catch(() => undefined)
      },
    },
    {
      id: 'symphony.upsert-issue',
      kind: 'upsert',
      apply: () => upsertIssue(input.db, input.runtime, controlRows.issue),
    },
    ...controlRows.issues.slice(1).map((row, index): LinxSyncOperation => ({
      id: `symphony.upsert-follow-up-issue:${index + 1}`,
      kind: 'upsert',
      apply: () => upsertIssue(input.db, input.runtime, row),
    })),
    ...controlRows.tasks.map((row, index): LinxSyncOperation => ({
      id: `symphony.upsert-task:${index + 1}`,
      kind: 'upsert',
      apply: () => upsertTask(input.db, input.runtime, row),
    })),
    ...controlRows.deliveries.map((row, index): LinxSyncOperation => ({
      id: `symphony.upsert-delivery:${index + 1}`,
      kind: 'upsert',
      apply: () => upsertDelivery(input.db, input.runtime, row),
    })),
    ...controlRows.runs.map((row, index): LinxSyncOperation => ({
      id: `symphony.upsert-run:${index + 1}`,
      kind: 'upsert',
      apply: () => upsertRun(input.db, input.runtime, row),
    })),
    ...controlRows.runSteps.map((row, index): LinxSyncOperation => ({
      id: `symphony.insert-run-step:${index + 1}`,
      kind: 'insert',
      apply: () => insertRunStepOnce(input.db, input.runtime, row),
    })),
    ...controlRows.evidence.map((row, index): LinxSyncOperation => ({
      id: `symphony.insert-evidence:${index + 1}`,
      kind: 'insert',
      apply: () => insertEvidenceOnce(input.db, input.runtime, row),
    })),
    ...controlRows.reports.map((row, index): LinxSyncOperation => ({
      id: `symphony.upsert-report:${index + 1}`,
      kind: 'upsert',
      apply: () => upsertReport(input.db, input.runtime, row),
    })),
    ...buildSymphonyReportOperations(input),
    ...buildSymphonyAgents(input.plan).map((agent): LinxSyncOperation => ({
      id: `symphony.upsert-agent:${agent.id}`,
      kind: 'upsert',
      apply: () => upsertAgent(input.db, input.runtime, agent),
    })),
    ...controlRows.contacts.map((contact): LinxSyncOperation => ({
      id: `symphony.upsert-contact:${contact.id}`,
      kind: 'upsert',
      apply: () => upsertContact(input.db, input.runtime, contact as SymphonyContactRow),
    })),
    ...controlRows.chats.map((row, index): LinxSyncOperation => ({
      id: 'symphony.upsert-chat',
      kind: 'upsert',
      shouldRun: () => input.shouldUpsertChat,
      apply: () => upsertChat(input.db, input.runtime, row),
    })),
    ...controlRows.threads.map((row, index): LinxSyncOperation => ({
      id: `symphony.upsert-thread:${index + 1}`,
      kind: 'upsert',
      apply: () => upsertThread(input.db, input.runtime, row),
    })),
    ...controlRows.sessions.map((row, index): LinxSyncOperation => ({
      id: `symphony.upsert-session:${index + 1}`,
      kind: 'upsert',
      apply: () => upsertSession(input.db, input.runtime, row),
    })),
    ...controlRows.messages.flatMap((row, index): LinxSyncOperation[] => [
      {
        id: `symphony.upsert-message:${input.stages[index] ?? index + 1}`,
        kind: 'upsert',
        apply: () => upsertMessage(input.db, input.runtime, row),
      },
    ]),
    ...input.stages.map((stage): LinxSyncOperation => (
      {
        id: `symphony.insert-audit:${stage}`,
        kind: 'insert',
        apply: () => insertAuditOnce(input.db, input.runtime, buildSymphonyAuditRow(input.plan, input.webId, stage)),
      }
    )),
  ]
}

function buildSymphonyReportOperations(input: {
  db: PodProjectionDb
  runtime: SymphonyPodProjectionRuntime
  plan: SymphonyRunPlan
  webId: string
  stage: ProjectionStage
}): LinxSyncOperation[] {
  if (input.stage !== 'completed' && input.stage !== 'failed') {
    return []
  }
  const terminalStage = input.stage

  return input.plan.workers.flatMap((worker, index): LinxSyncOperation[] => [
    {
      id: `symphony.upsert-report-delivery:${index + 1}`,
      kind: 'upsert',
      apply: () => upsertDelivery(
        input.db,
        input.runtime,
        buildSymphonyReportDeliveryRow(input.plan, input.webId, worker, terminalStage),
      ),
    },
    {
      id: `symphony.insert-report-inbox:${index + 1}`,
      kind: 'insert',
      shouldRun: () => Boolean(input.runtime.inboxNotificationResource),
      apply: () => insertInboxNotificationOnce(
        input.db,
        input.runtime,
        buildSymphonyReportInboxNotificationRow(input.webId, worker),
      ),
    },
  ])
}

export const __symphonyPodProjectionInternal = {
  SYMPHONY_CHAT_ID,
  SYMPHONY_SECRETARY_AGENT_ID,
  SYMPHONY_CONTACT_ID,
  SYMPHONY_POLICY_VERSION,
  buildSymphonyChatUri,
  buildSymphonyThreadId,
  buildSymphonyThreadUri,
  buildSymphonyControlSessionUri,
  buildSymphonyMessageUri,
  auditActionForStage,
  buildSymphonyAuditRow,
  buildStatusMessageRow: buildSharedSymphonyStatusMessageRow,
  buildSymphonyChatRow: buildSharedSymphonyChatRow,
  buildSymphonyThreadRow: buildSharedSymphonyThreadRow,
  buildSymphonySessionRow: buildSharedSymphonySessionRow,
  buildSymphonyIssueRow: buildSharedSymphonyIssueRow,
  buildSymphonyIdeaRow,
  buildSymphonyTaskRow: buildSharedSymphonyTaskRow,
  buildSymphonyDeliveryRow: buildSharedSymphonyDeliveryRow,
  buildSymphonyReportDeliveryRow,
  buildSymphonyReportInboxNotificationRow,
  buildSymphonyRunRow: buildSharedSymphonyRunRow,
  buildSymphonyRunStepRow: buildSharedSymphonyRunStepRow,
  buildSymphonyRuntimeRunStepRow: buildSharedSymphonyRuntimeRunStepRow,
  buildSymphonyAgents,
  buildSymphonyContacts: buildSharedSymphonyContactRows,
  withChatThreadRefs,
  normalizeSymphonyRunPlan,
}
