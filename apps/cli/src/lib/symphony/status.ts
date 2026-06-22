import { listSymphonyIssues, listSymphonySessions } from './archive.js'
import {
  listOpenSymphonyIssuesFromPod,
  listRecentSymphonyReportsFromPod,
  listRunningSymphonyWorkersFromPod,
  type SymphonyPodProjectionRuntime,
  type SymphonyPodReportStatus,
  type SymphonyPodWorkerStatus,
} from './pod-projection.js'

const DEFAULT_SYMPHONY_STATUS_POD_TIMEOUT_MS = 1_200

type SymphonyWorkerStatus = SymphonyPodWorkerStatus | ReturnType<typeof listSymphonySessions>[number]
type SymphonyIssueStatus = ReturnType<typeof listSymphonyIssues>[number]
type SymphonyReportStatus = SymphonyPodReportStatus | ReturnType<typeof listSymphonySessions>[number]

type SymphonyStatusReadSource = 'pod' | 'local' | 'none'

interface SymphonyStatusRead<T> {
  items: T[]
  source: SymphonyStatusReadSource
  error?: string
}

export interface SymphonyStatusSourceContext {
  chat: string
  thread: string
  sessionId?: string
}

export interface FormatSymphonyStatusOptions {
  enabled: boolean
  source?: SymphonyStatusSourceContext
  podProjectionRuntime?: SymphonyPodProjectionRuntime
  statusPodTimeoutMs?: unknown
  listLocalIssues?: () => ReturnType<typeof listSymphonyIssues>
  listLocalSessions?: () => ReturnType<typeof listSymphonySessions>
}

export async function formatSymphonyStatus(options: FormatSymphonyStatusOptions): Promise<string> {
  const [workersRead, issuesRead, reportsRead] = await Promise.all([
    listRunningSymphonyWorkers(options),
    listOpenSymphonyIssues(options),
    listRecentSymphonyReports(options),
  ])
  const workers = workersRead.items
  const issues = issuesRead.items
  const reports = reportsRead.items
  const controlStateErrors = Array.from(new Set([
    workersRead.error,
    issuesRead.error,
    reportsRead.error,
  ].filter((item): item is string => Boolean(item))))
  const controlStateSources = new Set([workersRead.source, issuesRead.source, reportsRead.source])
  const lines = [
    `Symphony is ${options.enabled ? 'on' : 'off'}.`,
    `Current chat peer: ${options.enabled ? 'Secretary' : 'worker/backend peer'}.`,
    `Open issues: ${issues.length}`,
    `Running workers: ${workers.length}`,
    `Recent reports: ${reports.length}`,
    controlStateErrors.length > 0
      ? `Pod control state: unavailable (${formatSymphonyStatusError(controlStateErrors[0]!)})`
      : controlStateSources.has('pod')
        ? 'Pod control state: active.'
        : 'Pod control state: portable local archive mode.',
    'Skills: issue triage, existing issue lookup, create/update/ask decision, task split, worker dispatch, status/report tracking.',
    'Delegation target: AI Secretary must choose a Chat resource before dispatch.',
    'Allowed targets: personal AI contact chat or group chat.',
    'Thread role: concrete work timeline under the selected Chat.',
    'Session role: backend runtime lifecycle only.',
  ]
  for (const issue of issues.slice(0, 5)) {
    lines.push(`  - ${formatSymphonyIssueStatus(issue)}`)
  }
  if (issues.length > 5) {
    lines.push(`  ... ${issues.length - 5} more open issue(s)`)
  }

  for (const worker of workers.slice(0, 5)) {
    lines.push(`  - ${formatSymphonyWorkerStatus(worker)}`)
  }
  if (workers.length > 5) {
    lines.push(`  ... ${workers.length - 5} more running worker(s)`)
  }

  for (const report of reports.slice(0, 5)) {
    lines.push(`  - ${formatSymphonyReportStatus(report)}`)
  }
  if (reports.length > 5) {
    lines.push(`  ... ${reports.length - 5} more recent report(s)`)
  }

  if (options.source) {
    lines.push(
      'Source conversation:',
      `  Chat: ${options.source.chat}`,
      `  Thread: ${options.source.thread}`,
      ...(options.source.sessionId ? [`  Runtime session: ${options.source.sessionId}`] : []),
    )
  } else {
    lines.push('Source conversation: unavailable until LinX has WebID and session id.')
  }

  lines.push('Commands: /symphony on chat with Secretary, /symphony status inspect workers, /symphony off chat with worker/backend.')
  return lines.join('\n')
}

function formatSymphonyStatusError(message: string): string {
  return message.replace(/\s+/gu, ' ').trim().slice(0, 180)
}

function resolveSymphonyStatusPodTimeoutMs(options: FormatSymphonyStatusOptions): number {
  const value = Number(options.statusPodTimeoutMs)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SYMPHONY_STATUS_POD_TIMEOUT_MS
}

async function withSymphonyStatusTimeout<T>(
  options: FormatSymphonyStatusOptions,
  label: string,
  task: Promise<T>,
): Promise<T> {
  const timeoutMs = resolveSymphonyStatusPodTimeoutMs(options)
  let timer: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

async function listOpenSymphonyIssues(options: FormatSymphonyStatusOptions): Promise<SymphonyStatusRead<SymphonyIssueStatus>> {
  const controlRuntime = options.podProjectionRuntime
  try {
    if (controlRuntime?.issueResource) {
      const podIssues = await withSymphonyStatusTimeout(
        options,
        'Symphony Pod issue status',
        listOpenSymphonyIssuesFromPod({ runtime: controlRuntime }),
      )
      if (podIssues) {
        return { items: podIssues, source: 'pod' }
      }
    }
  } catch (error) {
    return { items: [], source: 'none', error: error instanceof Error ? error.message : String(error) }
  }

  if (controlRuntime?.issueResource) {
    return {
      items: [],
      source: 'none',
      error: 'No active Pod session; Symphony control-plane state is Pod-authoritative.',
    }
  }

  try {
    const issues = options.listLocalIssues
      ? options.listLocalIssues()
      : listSymphonyIssues()
    return {
      items: issues.filter((issue: SymphonyIssueStatus) => issue.status !== 'closed' && issue.status !== 'resolved'),
      source: 'local',
    }
  } catch {
    return { items: [], source: 'none' }
  }
}

async function listRunningSymphonyWorkers(options: FormatSymphonyStatusOptions): Promise<SymphonyStatusRead<SymphonyWorkerStatus>> {
  const controlRuntime = options.podProjectionRuntime
  try {
    if (controlRuntime?.sessionResource) {
      const podWorkers = await withSymphonyStatusTimeout(
        options,
        'Symphony Pod worker status',
        listRunningSymphonyWorkersFromPod({ runtime: controlRuntime }),
      )
      if (podWorkers) {
        return { items: podWorkers, source: 'pod' }
      }
    }
  } catch (error) {
    return { items: [], source: 'none', error: error instanceof Error ? error.message : String(error) }
  }

  if (controlRuntime?.sessionResource) {
    return {
      items: [],
      source: 'none',
      error: 'No active Pod session; Symphony control-plane state is Pod-authoritative.',
    }
  }

  try {
    const sessions = options.listLocalSessions
      ? options.listLocalSessions()
      : listSymphonySessions()
    return {
      items: sessions.filter((session: ReturnType<typeof listSymphonySessions>[number]) => session.status === 'running'),
      source: 'local',
    }
  } catch {
    return { items: [], source: 'none' }
  }
}

async function listRecentSymphonyReports(options: FormatSymphonyStatusOptions): Promise<SymphonyStatusRead<SymphonyReportStatus>> {
  const controlRuntime = options.podProjectionRuntime
  try {
    if (controlRuntime?.deliveryResource) {
      const podReports = await withSymphonyStatusTimeout(
        options,
        'Symphony Pod report status',
        listRecentSymphonyReportsFromPod({
          runtime: controlRuntime,
          limit: 5,
        }),
      )
      if (podReports) {
        return { items: podReports, source: 'pod' }
      }
    }
  } catch (error) {
    return { items: [], source: 'none', error: error instanceof Error ? error.message : String(error) }
  }

  if (controlRuntime?.deliveryResource) {
    return {
      items: [],
      source: 'none',
      error: 'No active Pod session; Symphony control-plane state is Pod-authoritative.',
    }
  }

  try {
    const sessions = options.listLocalSessions
      ? options.listLocalSessions()
      : listSymphonySessions()
    return {
      items: sessions
        .filter((session: ReturnType<typeof listSymphonySessions>[number]) => session.status === 'completed' || session.status === 'failed')
        .slice(0, 5),
      source: 'local',
    }
  } catch {
    return { items: [], source: 'none' }
  }
}

function formatSymphonyWorkerStatus(session: SymphonyWorkerStatus): string {
  const target = session.target?.label
    ?? session.target?.agent
    ?? session.target?.chat
    ?? session.backend
  const suffix = [
    session.autoModeSessionId ? `runtime=${session.autoModeSessionId}` : undefined,
    session.target?.chat ? `chat=${session.target.chat}` : undefined,
    session.cwd ? `cwd=${session.cwd}` : undefined,
  ].filter(Boolean).join(' · ')
  return `${session.backend}/${session.mode} -> ${target}${suffix ? ` (${suffix})` : ''}`
}

function formatSymphonyReportStatus(report: SymphonyReportStatus): string {
  const status = report.status
  const reportRecord = report as Record<string, any>
  const target = reportRecord.agent
    ?? reportRecord.target?.label
    ?? reportRecord.target?.agent
    ?? report.backend
  const title = 'summary' in report && report.summary
    ? report.summary
    : 'title' in report && report.title
      ? report.title
      : 'task' in report && report.task
        ? formatSymphonyResourceTail(report.task)
        : undefined
  const suffix = [
    report.autoModeSessionId ? `runtime=${report.autoModeSessionId}` : undefined,
    'thread' in report && report.thread ? `thread=${report.thread}` : undefined,
    'completedAt' in report && report.completedAt ? `completed=${report.completedAt}` : undefined,
    report.error ? `error=${report.error}` : undefined,
  ].filter(Boolean).join(' · ')
  return `${status} ${report.backend} -> ${target}${title ? `: ${title}` : ''}${suffix ? ` (${suffix})` : ''}`
}

function formatSymphonyIssueStatus(issue: SymphonyIssueStatus): string {
  const taskCount = issue.tasks?.length ?? 0
  const suffix = [
    formatSymphonyResourceTail(issue.uri),
    taskCount > 0 ? `${taskCount} task${taskCount === 1 ? '' : 's'}` : undefined,
    issue.thread ? `thread=${issue.thread}` : undefined,
  ].filter(Boolean).join(' · ')
  return `${issue.status} ${issue.title}${suffix ? ` (${suffix})` : ''}`
}

function formatSymphonyResourceTail(uri: string | undefined): string | undefined {
  if (!uri) {
    return undefined
  }
  return uri.trim().match(/[:/#]([^:/#]+)$/u)?.[1] ?? uri
}
