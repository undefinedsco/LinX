import type { AutoModeBackend, AutoModeMode } from './auto-mode.js'

export const LINX_SYMPHONY_HOME_DIRNAME = 'symphony'
export const LINX_SYMPHONY_TASKS_DIRNAME = 'tasks'
export const LINX_SYMPHONY_DELIVERIES_DIRNAME = 'deliveries'
export const LINX_SYMPHONY_SESSIONS_DIRNAME = 'sessions'

export const LINX_SYMPHONY_TASK_FILE_NAME = 'task.json'
export const LINX_SYMPHONY_DELIVERY_FILE_NAME = 'delivery.json'
export const LINX_SYMPHONY_SESSION_FILE_NAME = 'session.json'

export type LinxSymphonyWorkspaceKind = 'git' | 'folder'
export type LinxSymphonyTaskStatus = 'pending' | 'running' | 'completed' | 'failed'
export type LinxSymphonyDeliveryStatus = 'pending' | 'dispatched' | 'completed' | 'failed'
export type LinxSymphonySessionStatus = 'planned' | 'running' | 'completed' | 'failed'
export type LinxSymphonyProjectionRole = 'user' | 'system' | 'tool'

export interface LinxSymphonyWorkspaceRef {
  path: string
  kind: LinxSymphonyWorkspaceKind
  repository?: string
  branch?: string
  worktree?: string
}

export interface LinxSymphonyTaskRecord {
  id: string
  title: string
  objective: string
  acceptanceCriteria: string[]
  status: LinxSymphonyTaskStatus
  workspace: LinxSymphonyWorkspaceRef
  source: 'cli'
  deliveryIds: string[]
  sessionIds: string[]
  createdAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export interface LinxSymphonyDeliveryRecord {
  id: string
  taskId: string
  type: 'task_dispatch'
  status: LinxSymphonyDeliveryStatus
  sourceAgent: 'ai-secretary'
  targetBackend: AutoModeBackend
  targetAgent: string
  projection: {
    runtimeRole: LinxSymphonyProjectionRole
    prompt: string
  }
  sessionId?: string
  autoModeSessionId?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export interface LinxSymphonySessionRecord {
  id: string
  taskId: string
  deliveryId: string
  backend: AutoModeBackend
  mode: AutoModeMode
  status: LinxSymphonySessionStatus
  cwd: string
  model?: string
  autoModeSessionId?: string
  dryRun?: boolean
  exitCode?: number | null
  createdAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export interface LinxSymphonyRunPlan {
  task: LinxSymphonyTaskRecord
  delivery: LinxSymphonyDeliveryRecord
  session: LinxSymphonySessionRecord
}

export interface CreateLinxSymphonyRunPlanInput {
  objective: string
  title?: string
  acceptanceCriteria?: string[]
  workspacePath: string
  workspaceKind?: LinxSymphonyWorkspaceKind
  repository?: string
  branch?: string
  worktree?: string
  backend: AutoModeBackend
  mode: AutoModeMode
  model?: string
  now?: Date
  randomId?: string
}

export function createLinxSymphonyTaskId(options: { now?: Date; randomId?: string } = {}): string {
  return `sym_task_${formatLinxSymphonyTimestamp(options.now)}_${normalizeLinxSymphonyRandomId(options.randomId)}`
}

export function createLinxSymphonyDeliveryId(options: { now?: Date; randomId?: string } = {}): string {
  return `sym_delivery_${formatLinxSymphonyTimestamp(options.now)}_${normalizeLinxSymphonyRandomId(options.randomId)}`
}

export function createLinxSymphonySessionId(options: { now?: Date; randomId?: string } = {}): string {
  return `sym_session_${formatLinxSymphonyTimestamp(options.now)}_${normalizeLinxSymphonyRandomId(options.randomId)}`
}

export function getLinxSymphonyArchiveRelativePaths(id: string, kind: 'task' | 'delivery' | 'session'): {
  dir: string
  file: string
} {
  const dirName = kind === 'task'
    ? LINX_SYMPHONY_TASKS_DIRNAME
    : kind === 'delivery'
      ? LINX_SYMPHONY_DELIVERIES_DIRNAME
      : LINX_SYMPHONY_SESSIONS_DIRNAME
  const fileName = kind === 'task'
    ? LINX_SYMPHONY_TASK_FILE_NAME
    : kind === 'delivery'
      ? LINX_SYMPHONY_DELIVERY_FILE_NAME
      : LINX_SYMPHONY_SESSION_FILE_NAME

  return {
    dir: `${dirName}/${id}`,
    file: `${dirName}/${id}/${fileName}`,
  }
}

export function createLinxSymphonyRunPlan(input: CreateLinxSymphonyRunPlanInput): LinxSymphonyRunPlan {
  const now = input.now ?? new Date()
  const timestamp = now.toISOString()
  const randomId = normalizeLinxSymphonyRandomId(input.randomId)
  const idOptions = { now, randomId }
  const objective = normalizeRequiredText(input.objective, 'objective')
  const title = normalizeOptionalText(input.title) ?? createLinxSymphonyTitle(objective)
  const acceptanceCriteria = normalizeLinxSymphonyAcceptanceCriteria(input.acceptanceCriteria)
  const workspace: LinxSymphonyWorkspaceRef = {
    path: normalizeRequiredText(input.workspacePath, 'workspacePath'),
    kind: input.workspaceKind ?? 'folder',
    ...(normalizeOptionalText(input.repository) ? { repository: normalizeOptionalText(input.repository) } : {}),
    ...(normalizeOptionalText(input.branch) ? { branch: normalizeOptionalText(input.branch) } : {}),
    ...(normalizeOptionalText(input.worktree) ? { worktree: normalizeOptionalText(input.worktree) } : {}),
  }

  const task: LinxSymphonyTaskRecord = {
    id: createLinxSymphonyTaskId(idOptions),
    title,
    objective,
    acceptanceCriteria,
    status: 'pending',
    workspace,
    source: 'cli',
    deliveryIds: [],
    sessionIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const session: LinxSymphonySessionRecord = {
    id: createLinxSymphonySessionId(idOptions),
    taskId: task.id,
    deliveryId: createLinxSymphonyDeliveryId(idOptions),
    backend: input.backend,
    mode: input.mode,
    status: 'planned',
    cwd: workspace.path,
    ...(normalizeOptionalText(input.model) ? { model: normalizeOptionalText(input.model) } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const delivery: LinxSymphonyDeliveryRecord = {
    id: session.deliveryId,
    taskId: task.id,
    type: 'task_dispatch',
    status: 'pending',
    sourceAgent: 'ai-secretary',
    targetBackend: input.backend,
    targetAgent: `${input.backend}-worker`,
    projection: {
      runtimeRole: 'user',
      prompt: renderLinxSymphonyRuntimePrompt({
        task,
        backend: input.backend,
        mode: input.mode,
        sessionId: session.id,
      }),
    },
    sessionId: session.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  task.deliveryIds = [delivery.id]
  task.sessionIds = [session.id]

  return { task, delivery, session }
}

export function renderLinxSymphonyRuntimePrompt(input: {
  task: LinxSymphonyTaskRecord
  backend: AutoModeBackend
  mode: AutoModeMode
  sessionId: string
}): string {
  const criteria = input.task.acceptanceCriteria.length > 0
    ? input.task.acceptanceCriteria.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '1. Complete the objective and report concrete verification evidence.'

  return [
    '# LinX Symphony Task',
    '',
    `Task ID: ${input.task.id}`,
    `Session ID: ${input.sessionId}`,
    `Backend: ${input.backend}`,
    `Mode: ${input.mode}`,
    `Workspace: ${input.task.workspace.path}`,
    `Workspace kind: ${input.task.workspace.kind}`,
    '',
    '## Objective',
    input.task.objective,
    '',
    '## Acceptance Criteria',
    criteria,
    '',
    '## Execution Contract',
    '- Work only inside the workspace unless the task explicitly requires otherwise.',
    '- Treat this prompt as a delegated task from the user via AI Secretary.',
    '- Preserve a concise report with changed files, commands run, and remaining risks.',
    '- If blocked by missing credentials, destructive actions, or unclear scope, report the blocker instead of guessing.',
  ].join('\n')
}

export function formatLinxSymphonyTaskSummary(task: LinxSymphonyTaskRecord): string {
  return `${task.id} ${task.status} ${task.title} (${task.workspace.path})`
}

export function formatLinxSymphonySessionSummary(session: LinxSymphonySessionRecord): string {
  const linked = session.autoModeSessionId ? ` -> ${session.autoModeSessionId}` : ''
  return `${session.id} ${session.status} ${session.backend}/${session.mode}${linked} (${session.cwd})`
}

export function formatLinxSymphonyDeliverySummary(delivery: LinxSymphonyDeliveryRecord): string {
  return `${delivery.id} ${delivery.status} ${delivery.sourceAgent} -> ${delivery.targetBackend} (${delivery.taskId})`
}

function createLinxSymphonyTitle(objective: string): string {
  const compact = objective.replace(/\s+/gu, ' ').trim()
  return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact
}

function normalizeLinxSymphonyAcceptanceCriteria(criteria?: string[]): string[] {
  return (criteria ?? [])
    .flatMap((item) => item.split(/\r?\n/u))
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeRequiredText(value: string | undefined, name: string): string {
  const normalized = normalizeOptionalText(value)
  if (!normalized) {
    throw new Error(`Missing LinX Symphony ${name}`)
  }
  return normalized
}

function normalizeOptionalText(value: string | undefined | null): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || undefined
}

function formatLinxSymphonyTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/gu, '-')
}

function normalizeLinxSymphonyRandomId(randomId?: string): string {
  const normalized = typeof randomId === 'string'
    ? randomId.replace(/[^a-zA-Z0-9_-]/gu, '').slice(0, 12)
    : ''
  return normalized || Math.random().toString(36).slice(2, 10)
}
