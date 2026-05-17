import type { AutoModeBackend, AutoModeMode } from './auto-mode.js'

export const SYMPHONY_HOME_DIRNAME = 'symphony'
export const SYMPHONY_ISSUES_DIRNAME = 'issues'
export const SYMPHONY_DELIVERIES_DIRNAME = 'deliveries'
export const SYMPHONY_SESSIONS_DIRNAME = 'sessions'

export const SYMPHONY_ISSUE_FILE_NAME = 'issue.json'
export const SYMPHONY_DELIVERY_FILE_NAME = 'delivery.json'
export const SYMPHONY_SESSION_FILE_NAME = 'session.json'

const SYMPHONY_URI_PREFIX = 'urn:undefineds:linx'

export type SymphonyWorkspaceKind = 'git' | 'folder'
export type SymphonyIssueStatus = 'open' | 'triaging' | 'in_progress' | 'blocked' | 'resolved' | 'closed'
export type SymphonyDeliveryStatus = 'pending' | 'dispatched' | 'completed' | 'failed'
export type SymphonySessionStatus = 'planned' | 'running' | 'completed' | 'failed'
export type SymphonyProjectionRole = 'user' | 'system' | 'tool'
export type SymphonyResourceKind = 'issue' | 'task' | 'delivery' | 'session'

export interface SymphonyWorkspaceRef {
  path: string
  kind: SymphonyWorkspaceKind
  repository?: string
  branch?: string
  worktree?: string
}

export interface SymphonyChatThreadRef {
  chat?: string
  thread?: string
  messages?: string[]
}

export interface SymphonyIssueRecord extends SymphonyChatThreadRef {
  uri: string
  title: string
  description?: string
  status: SymphonyIssueStatus
  priority: 'low' | 'medium' | 'high' | 'urgent'
  source: 'cli'
  tasks: string[]
  createdAt: string
  updatedAt: string
  closedAt?: string
  error?: string
}

export interface SymphonyDeliveryRecord extends SymphonyChatThreadRef {
  uri: string
  issue: string
  task: string
  type: 'task_dispatch'
  status: SymphonyDeliveryStatus
  sourceAgent: 'ai-secretary'
  targetBackend: AutoModeBackend
  targetAgent: string
  projection: {
    runtimeRole: SymphonyProjectionRole
    prompt: string
  }
  session?: string
  autoModeSessionId?: string
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
  backend: AutoModeBackend
  mode: AutoModeMode
  status: SymphonySessionStatus
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

export interface SymphonyRunPlan {
  issue: SymphonyIssueRecord
  task: string
  delivery: SymphonyDeliveryRecord
  session: SymphonySessionRecord
}

export interface CreateSymphonyRunPlanInput {
  objective: string
  title?: string
  acceptanceCriteria?: string[]
  workspacePath: string
  workspaceKind?: SymphonyWorkspaceKind
  repository?: string
  branch?: string
  worktree?: string
  backend: AutoModeBackend
  mode: AutoModeMode
  model?: string
  chat?: string
  thread?: string
  messages?: string[]
  now?: Date
  randomId?: string
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

export function getSymphonyArchiveRelativePaths(uri: string, kind: 'issue' | 'delivery' | 'session'): {
  dir: string
  file: string
} {
  const key = getSymphonyArchiveKey(uri)
  const dirName = kind === 'issue'
    ? SYMPHONY_ISSUES_DIRNAME
    : kind === 'delivery'
      ? SYMPHONY_DELIVERIES_DIRNAME
      : SYMPHONY_SESSIONS_DIRNAME
  const fileName = kind === 'issue'
    ? SYMPHONY_ISSUE_FILE_NAME
    : kind === 'delivery'
      ? SYMPHONY_DELIVERY_FILE_NAME
      : SYMPHONY_SESSION_FILE_NAME

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
  const acceptanceCriteria = normalizeSymphonyAcceptanceCriteria(input.acceptanceCriteria)
  const chatThread = normalizeSymphonyChatThreadRef(input)
  const workspace: SymphonyWorkspaceRef = {
    path: normalizeRequiredText(input.workspacePath, 'workspacePath'),
    kind: input.workspaceKind ?? 'folder',
    ...(normalizeOptionalText(input.repository) ? { repository: normalizeOptionalText(input.repository) } : {}),
    ...(normalizeOptionalText(input.branch) ? { branch: normalizeOptionalText(input.branch) } : {}),
    ...(normalizeOptionalText(input.worktree) ? { worktree: normalizeOptionalText(input.worktree) } : {}),
  }
  const issueUri = createSymphonyIssueUri(uriOptions)
  const taskUri = createTaskUri(uriOptions)
  const deliveryUri = createSymphonyDeliveryUri(uriOptions)
  const sessionUri = createSymphonySessionUri(uriOptions)

  const issue: SymphonyIssueRecord = {
    uri: issueUri,
    title,
    description: objective,
    status: 'open',
    priority: 'medium',
    source: 'cli',
    tasks: [taskUri],
    ...chatThread,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const session: SymphonySessionRecord = {
    uri: sessionUri,
    issue: issueUri,
    task: taskUri,
    delivery: deliveryUri,
    backend: input.backend,
    mode: input.mode,
    status: 'planned',
    cwd: workspace.path,
    ...(normalizeOptionalText(input.model) ? { model: normalizeOptionalText(input.model) } : {}),
    ...chatThread,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const delivery: SymphonyDeliveryRecord = {
    uri: deliveryUri,
    issue: issueUri,
    task: taskUri,
    type: 'task_dispatch',
    status: 'pending',
    sourceAgent: 'ai-secretary',
    targetBackend: input.backend,
    targetAgent: `${input.backend}-worker`,
    projection: {
      runtimeRole: 'user',
      prompt: renderSymphonyRuntimePrompt({
        issue,
        task: taskUri,
        objective,
        acceptanceCriteria,
        workspace,
        backend: input.backend,
        mode: input.mode,
        session: sessionUri,
      }),
    },
    session: sessionUri,
    ...chatThread,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  return { issue, task: taskUri, delivery, session }
}

export function renderSymphonyRuntimePrompt(input: {
  issue?: SymphonyIssueRecord
  task: string
  objective: string
  acceptanceCriteria?: string[]
  workspace: SymphonyWorkspaceRef
  backend: AutoModeBackend
  mode: AutoModeMode
  session: string
}): string {
  const acceptanceCriteria = normalizeSymphonyAcceptanceCriteria(input.acceptanceCriteria)
  const criteria = acceptanceCriteria.length > 0
    ? acceptanceCriteria.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '1. Complete the objective and report concrete verification evidence.'

  return [
    '# LinX Symphony Task',
    '',
    ...(input.issue ? [`Issue URI: ${input.issue.uri}`] : []),
    `Task URI: ${input.task}`,
    `Session URI: ${input.session}`,
    `Backend: ${input.backend}`,
    `Mode: ${input.mode}`,
    `Workspace: ${input.workspace.path}`,
    `Workspace kind: ${input.workspace.kind}`,
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
    '- Preserve a concise report with changed files, commands run, and remaining risks.',
    '- If blocked by missing credentials, destructive actions, or unclear scope, report the blocker instead of guessing.',
  ].join('\n')
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

function normalizeOptionalText(value: string | undefined | null): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || undefined
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

function formatSymphonyTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/gu, '-')
}

function normalizeSymphonyRandomId(randomId?: string): string {
  const normalized = typeof randomId === 'string'
    ? randomId.replace(/[^a-zA-Z0-9_-]/gu, '').slice(0, 12)
    : ''
  return normalized || Math.random().toString(36).slice(2, 10)
}
