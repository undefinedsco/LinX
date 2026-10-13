/**
 * W10 / W10b: a coding tool (Claude Code / Codex / CodeBuddy) working in a
 * folder. Projects the runtime session into the one line under the title and
 * the “这次运行” group of 聊天信息, in plain words.
 */

export type CodingRunStatus = 'idle' | 'active' | 'paused' | 'completed' | 'error'

export type CodingRunPhase =
  | 'running'
  | 'waiting'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'reconnecting'
  | 'completed'

export type CodingRunAction = 'pause' | 'resume' | 'stop' | 'copyLog' | 'retry'

export interface CodingRunActivity {
  label: string
  /** Tool name as the runtime reported it; only shown under “详情”. */
  technicalName?: string
  tone: 'running' | 'waiting'
}

export interface CodingRunLineInput {
  status: CodingRunStatus
  tool?: string | null
  folderName?: string | null
  activity?: CodingRunActivity | null
  isStopping?: boolean
  /** Set when the user asked to stop and the runtime confirmed it ended. */
  wasStopped?: boolean
  isReconnecting?: boolean
}

export interface CodingRunLine {
  phase: CodingRunPhase
  toolName: string
  /** Text after the tool name, e.g. 在“书店网站”文件夹里. */
  text: string
  /** What it is doing right now, e.g. 正在改报名表单. */
  detail?: string
  actions: CodingRunAction[]
}

const TOOL_NAMES: Record<string, string> = {
  claude: 'Claude Code',
  'claude-code': 'Claude Code',
  codex: 'Codex',
  codebuddy: 'CodeBuddy',
}

export function codingToolName(tool?: string | null): string {
  const key = tool?.trim().toLocaleLowerCase() ?? ''
  return TOOL_NAMES[key] ?? '编程工具'
}

export function isCodingTool(tool?: string | null): boolean {
  const key = tool?.trim().toLocaleLowerCase() ?? ''
  return key in TOOL_NAMES
}

/** Last path segment of a local folder or Pod container, without the trailing slash. */
export function folderDisplayName(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (!value) continue
    const withoutQuery = value.replace(/[?#].*$/u, '').replace(/[\\/]+$/u, '')
    const segment = withoutQuery.split(/[\\/]/u).filter(Boolean).pop()
    if (segment && !/^[a-z]+:$/iu.test(segment)) {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    }
  }
  return null
}

function inFolder(folderName?: string | null): string {
  return folderName ? `在“${folderName}”文件夹里` : ''
}

function join(...parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(' · ')
}

export function projectCodingRunLine(input: CodingRunLineInput): CodingRunLine {
  const toolName = codingToolName(input.tool)
  const where = inFolder(input.folderName)

  if (input.isReconnecting) {
    return { phase: 'reconnecting', toolName, text: '连接断了，正在确认结果…不会重复执行', actions: [] }
  }
  if (input.isStopping) {
    return { phase: 'stopping', toolName, text: '正在停止…已经改的文件会保留', actions: [] }
  }

  switch (input.status) {
    case 'active': {
      if (input.activity?.tone === 'waiting') {
        return { phase: 'waiting', toolName, text: where, detail: input.activity.label, actions: ['stop'] }
      }
      return {
        phase: 'running',
        toolName,
        text: where,
        detail: input.activity?.label ?? '正在干活',
        actions: ['pause', 'stop'],
      }
    }
    case 'paused':
      return { phase: 'paused', toolName, text: join(where, '已暂停（停在两步之间，不丢进度）'), actions: ['resume', 'stop'] }
    case 'error':
      return { phase: 'failed', toolName, text: '中途出错退出了', actions: ['copyLog'] }
    case 'completed':
    case 'idle':
    default:
      return input.wasStopped
        ? { phase: 'stopped', toolName, text: '已停止', actions: ['copyLog'] }
        : { phase: 'completed', toolName, text: '完成', actions: ['copyLog'] }
  }
}

export function formatRunDuration(start?: string | Date | null, end: number = Date.now()): string {
  if (!start) return '刚刚开始'
  const startedAt = start instanceof Date ? start.getTime() : new Date(start).getTime()
  if (Number.isNaN(startedAt)) return '刚刚开始'
  const minutes = Math.floor(Math.max(0, end - startedAt) / 60_000)
  if (minutes < 1) return '不到 1 分钟'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}

export function formatModelUsage(tokens?: number | null): string {
  if (!tokens || tokens <= 0) return '还没有用量'
  if (tokens >= 10_000) return `约 ${(tokens / 10_000).toFixed(1).replace(/\.0$/u, '')} 万 tokens`
  return `约 ${tokens} tokens`
}
