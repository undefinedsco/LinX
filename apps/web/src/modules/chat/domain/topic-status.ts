import { codingToolName, isCodingTool, type CodingRunStatus } from './coding-run'

/**
 * What a topic (话题) is waiting on or doing right now, in one or two words.
 * Shown after the topic name in the list preview and in the “# 话题 ▾” switcher.
 */
export type TopicStatusKind = 'login' | 'decision' | 'answer' | 'coding' | 'running' | 'paused' | 'failed'

export interface TopicStatus {
  kind: TopicStatusKind
  label: string
  /** Waiting on you → needs attention. */
  needsYou: boolean
}

export interface TopicSignals {
  pendingApprovals?: number
  pendingInputs?: number
  pendingLogins?: number
  runtime?: { status: CodingRunStatus; tool?: string | null } | null
}

export function projectTopicStatus(signals: TopicSignals): TopicStatus | null {
  if ((signals.pendingLogins ?? 0) > 0) return { kind: 'login', label: '等你登录', needsYou: true }
  if ((signals.pendingApprovals ?? 0) > 0) return { kind: 'decision', label: '等你决定', needsYou: true }
  if ((signals.pendingInputs ?? 0) > 0) return { kind: 'answer', label: '等你回答', needsYou: true }

  const runtime = signals.runtime
  if (!runtime) return null
  if (runtime.status === 'active') {
    return isCodingTool(runtime.tool)
      ? { kind: 'coding', label: `${codingToolName(runtime.tool)} 在改`, needsYou: false }
      : { kind: 'running', label: '运行中', needsYou: false }
  }
  if (runtime.status === 'paused') return { kind: 'paused', label: '已暂停', needsYou: false }
  if (runtime.status === 'error') return { kind: 'failed', label: '没成功', needsYou: true }
  return null
}

/** Picks the topic to mention in a list row: the one that needs you first, then the busiest. */
export function pickHeadlineTopic<T extends { status: TopicStatus | null; updatedAt: number }>(topics: readonly T[]): T | null {
  const withStatus = topics.filter((topic) => topic.status)
  if (withStatus.length === 0) return null
  return [...withStatus].sort((left, right) => (
    Number(right.status!.needsYou) - Number(left.status!.needsYou)
    || right.updatedAt - left.updatedAt
  ))[0] ?? null
}
