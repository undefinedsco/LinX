import {
  createRunPlan,
  type CreateSymphonyRunPlanInput,
  type SymphonyDelegationTarget,
  type SymphonyRunPlan,
  type WorkerWorkspaceKind,
} from '@linx/agent-runtime/symphony'
import type { AutoModeInteractionRequest, AutoModeMode, AutoModeWorkerBackend } from '@linx/agent-runtime/auto-mode'
import {
  persistSymphonyControlState,
  persistSymphonyInteractionRequest,
  persistSymphonyWorkerDelivery,
  runAndPersistSymphonyWorkerGoalPlan,
  type PersistSymphonyControlStateResult,
  type PersistSymphonyInteractionRequestResult,
  type PersistSymphonyWorkerDeliveryResult,
  type SymphonyControlStage,
  type SymphonyRuntimeAdapter,
  type SymphonyRuntimeAdapterEvent,
  type RunAndPersistSymphonyWorkerGoalPlanResult,
} from '@linx/stores/symphony-control'
import type { ExactRecordDatabase } from '@undefineds.co/drizzle-solid'
import type { SolidDatabase } from '@undefineds.co/models'
import { createServiceRuntimeSymphonyAdapter } from './runtime-adapter'

export interface CreateWebSymphonyWorkerGoalInput {
  objective: string
  title?: string
  acceptanceCriteria?: string[]
  workspacePath: string
  workspaceKind?: WorkerWorkspaceKind
  repository?: string
  branch?: string
  worktree?: string
  container?: string
  baseRevision?: string
  backend?: AutoModeWorkerBackend
  mode?: AutoModeMode
  secretaryAutoEnabled?: boolean
  model?: string
  workerModel?: string
  workerSupervisorIntervalMs?: number
  chat?: string
  thread?: string
  messages?: string[]
  target?: Partial<SymphonyDelegationTarget>
  now?: Date
  randomId?: string
}

export function createWebSymphonyWorkerGoalPlan(
  input: CreateWebSymphonyWorkerGoalInput,
): SymphonyRunPlan {
  return createRunPlan(normalizeWebSymphonyWorkerGoalInput(input))
}

export interface CreateAndPersistWebSymphonyWorkerGoalInput extends CreateWebSymphonyWorkerGoalInput {
  db: SolidDatabase & ExactRecordDatabase
  webId: string
  stage?: SymphonyControlStage
  stages?: SymphonyControlStage[]
}

export async function createAndPersistWebSymphonyWorkerGoalPlan(
  input: CreateAndPersistWebSymphonyWorkerGoalInput,
): Promise<PersistSymphonyControlStateResult> {
  const plan = createWebSymphonyWorkerGoalPlan(input)
  return persistSymphonyControlState({
    db: input.db,
    webId: input.webId,
    plan,
    ...(input.stage ? { stage: input.stage } : {}),
    ...(input.stages ? { stages: input.stages } : {}),
  })
}

export type WebSymphonyRuntimeEvent = SymphonyRuntimeAdapterEvent
export type WebSymphonyRuntimeAdapter = SymphonyRuntimeAdapter

export interface RunAndPersistWebSymphonyWorkerGoalInput extends CreateWebSymphonyWorkerGoalInput {
  db: SolidDatabase & ExactRecordDatabase
  webId: string
  runtimeAdapter?: WebSymphonyRuntimeAdapter
  signal?: AbortSignal
}

export interface RunAndPersistWebSymphonyWorkerGoalResult {
  plan: RunAndPersistSymphonyWorkerGoalPlanResult['plan']
  worker: RunAndPersistSymphonyWorkerGoalPlanResult['worker']
  status: RunAndPersistSymphonyWorkerGoalPlanResult['status']
  exitCode: RunAndPersistSymphonyWorkerGoalPlanResult['exitCode']
  autoModeSessionId?: RunAndPersistSymphonyWorkerGoalPlanResult['autoModeSessionId']
}

export async function runAndPersistWebSymphonyWorkerGoal(
  input: RunAndPersistWebSymphonyWorkerGoalInput,
): Promise<RunAndPersistWebSymphonyWorkerGoalResult> {
  const plan = createWebSymphonyWorkerGoalPlan(input)
  const runtimeAdapter = input.runtimeAdapter ?? createServiceRuntimeSymphonyAdapter({
    onInteractionRequest: async ({ request }) => {
      await persistSymphonyInteractionRequest({
        db: input.db,
        webId: input.webId,
        plan,
        request,
        ...(input.now ? { now: input.now } : {}),
        ...(input.randomId?.trim() ? { randomId: `${input.randomId.trim()}-runtime-request` } : {}),
        source: 'runtime',
      })
    },
  })
  return runAndPersistSymphonyWorkerGoalPlan({
    db: input.db,
    webId: input.webId,
    plan,
    runtimeAdapter,
    ...(input.now ? { now: input.now } : {}),
    ...(input.randomId?.trim() ? { randomId: input.randomId.trim() } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  })
}

export interface PersistWebSymphonyInteractionRequestInput {
  db: SolidDatabase & ExactRecordDatabase
  webId: string
  plan: SymphonyRunPlan
  request: AutoModeInteractionRequest
  workerIndex?: number
  now?: Date
  randomId?: string
  source?: 'codex-app-server' | 'codex-acp' | 'acp' | 'runtime' | (string & {})
}

export async function persistWebSymphonyInteractionRequest(
  input: PersistWebSymphonyInteractionRequestInput,
): Promise<PersistSymphonyInteractionRequestResult> {
  return persistSymphonyInteractionRequest({
    db: input.db,
    webId: input.webId,
    plan: input.plan,
    request: input.request,
    ...(input.workerIndex !== undefined ? { worker: input.plan.workers[input.workerIndex] } : {}),
    ...(input.now ? { now: input.now } : {}),
    ...(input.randomId?.trim() ? { randomId: input.randomId.trim() } : {}),
    ...(input.source ? { source: input.source } : {}),
  })
}

export interface PersistWebSymphonyWorkerDeliveryInput {
  db: SolidDatabase & ExactRecordDatabase
  webId: string
  plan: SymphonyRunPlan
  workerIndex?: number
  delivery: unknown
  now?: Date
  randomId?: string
}

export async function persistWebSymphonyWorkerDelivery(
  input: PersistWebSymphonyWorkerDeliveryInput,
): Promise<PersistSymphonyWorkerDeliveryResult> {
  return persistSymphonyWorkerDelivery({
    db: input.db,
    webId: input.webId,
    plan: input.plan,
    ...(input.workerIndex !== undefined ? { worker: input.plan.workers[input.workerIndex] } : {}),
    delivery: input.delivery,
    ...(input.now ? { now: input.now } : {}),
    ...(input.randomId?.trim() ? { randomId: input.randomId.trim() } : {}),
  })
}

function normalizeWebSymphonyWorkerGoalInput(
  input: CreateWebSymphonyWorkerGoalInput,
): CreateSymphonyRunPlanInput {
  const objective = input.objective.trim()
  if (!objective) {
    throw new Error('请先输入要交给 worker 的目标。')
  }
  const workspacePath = input.workspacePath.trim()
  if (!workspacePath) {
    throw new Error('请先选择 worker 的工作区。')
  }

  return {
    source: 'web',
    objective,
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.acceptanceCriteria ? { acceptanceCriteria: input.acceptanceCriteria } : {}),
    workspacePath,
    ...(input.workspaceKind ? { workspaceKind: input.workspaceKind } : {}),
    ...(input.repository?.trim() ? { repository: input.repository.trim() } : {}),
    ...(input.branch?.trim() ? { branch: input.branch.trim() } : {}),
    ...(input.worktree?.trim() ? { worktree: input.worktree.trim() } : {}),
    ...(input.container?.trim() ? { container: input.container.trim() } : {}),
    ...(input.baseRevision?.trim() ? { baseRevision: input.baseRevision.trim() } : {}),
    backend: input.backend ?? 'codex',
    mode: input.mode ?? 'off',
    ...(input.secretaryAutoEnabled !== undefined ? { secretaryAutoEnabled: input.secretaryAutoEnabled } : {}),
    ...(input.model?.trim() ? { model: input.model.trim() } : {}),
    ...(input.workerModel?.trim() ? { workerModel: input.workerModel.trim() } : {}),
    ...(input.workerSupervisorIntervalMs ? { workerSupervisorIntervalMs: input.workerSupervisorIntervalMs } : {}),
    ...(input.chat?.trim() ? { chat: input.chat.trim() } : {}),
    ...(input.thread?.trim() ? { thread: input.thread.trim() } : {}),
    ...(input.messages ? { messages: input.messages } : {}),
    ...(input.target ? { target: input.target } : {}),
    issuer: {
      source: 'user',
      ...(input.chat?.trim() ? { chat: input.chat.trim() } : {}),
      ...(input.thread?.trim() ? { thread: input.thread.trim() } : {}),
      ...(input.messages ? { messages: input.messages } : {}),
    },
    ...(input.now ? { now: input.now } : {}),
    ...(input.randomId?.trim() ? { randomId: input.randomId.trim() } : {}),
  }
}
