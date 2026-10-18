import {
  autoJudgePhase,
  autoJudgeRemainingMs,
  readAutoJudgeState,
  type AutoJudgeConfidence,
  type AutoJudgePhase,
  type AutoJudgeState,
} from '@linx/agent-runtime/auto-judge'

/**
 * R6 (W7 / W7c / K11) view helpers. The auto-judge state lives on the Approval
 * itself (see the field table in `@linx/agent-runtime/auto-judge`); this file
 * only turns it into the plain-language pieces the inbox shows.
 */
export type { AutoJudgeConfidence, AutoJudgePhase, AutoJudgeState }

export interface AutoJudgeApprovalInput {
  status?: string | null
  assignedTo?: string | null
  leaseOwner?: string | null
  leaseExpiresAt?: string | Date | null
  decisionRole?: string | null
  context?: string | null
}

/** Phase of an approval in the auto-judge flow; null when LinX never judged it. */
export function approvalAutoPhase(approval: AutoJudgeApprovalInput | null | undefined, now: Date = new Date()): AutoJudgePhase | null {
  return approval ? autoJudgePhase(approval, now) : null
}

/** LinX is waiting to approve it: shown in "LinX 会自动通过", not counted as pending. */
export function isAutoWaitingPhase(phase: AutoJudgePhase | null | undefined): boolean {
  return phase === 'waiting' || phase === 'due'
}

export function autoJudgeStateOf(approval: AutoJudgeApprovalInput | null | undefined): AutoJudgeState | null {
  return approval ? readAutoJudgeState(approval) : null
}

export function autoJudgeRemaining(approval: AutoJudgeApprovalInput | null | undefined, now: Date): number | null {
  return approval ? autoJudgeRemainingMs(approval, now) : null
}

export const AUTO_JUDGE_CONFIDENCE_LABEL: Record<AutoJudgeConfidence, string> = {
  high: '把握高',
  medium: '把握中',
  low: '把握低',
}

/** "9 分钟后" / "1 小时后" for the countdown. */
export function formatAutoJudgeRemaining(ms: number | null): string {
  if (ms === null) return ''
  if (ms <= 0) return '马上'
  const minutes = Math.ceil(ms / 60_000)
  if (minutes <= 1) return '1 分钟内'
  if (minutes < 60) return `${minutes} 分钟后`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时后`
  return `${Math.round(hours / 24)} 天后`
}

/** "10 分钟" / "2 小时" for a wait length (K11, review). */
export function formatAutoJudgeWindow(ms: number | null): string {
  if (ms === null) return '不自动，交给你'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} 分钟`
  if (minutes % 60 === 0) return `${minutes / 60} 小时`
  return `${minutes} 分钟`
}

export type HighImpactKind = 'send' | 'spend' | 'delete'

export const HIGH_IMPACT_LABEL: Record<HighImpactKind, string> = {
  send: '对外发送',
  spend: '花钱',
  delete: '删除',
}

const IMPACT_PATTERNS: Array<[HighImpactKind, RegExp]> = [
  ['delete', /(?:^|[^a-z])(?:delete|remove|destroy|drop|purge|erase|unlink|rm)(?:[^a-z]|$)/i],
  ['spend', /(?:^|[^a-z])(?:pay|payment|purchase|buy|spend|charge|transfer|order|checkout)(?:[^a-z]|$)/i],
  ['send', /(?:^|[^a-z])(?:send|email|mail|invite|invitation|publish|post|share|distribute|upload|push|outbound|external|notify)(?:[^a-z]|$)/i],
]

function words(value: string | null | undefined): string {
  if (!value) return ''
  const trimmed = value.trim()
  const local = trimmed.slice(Math.max(trimmed.lastIndexOf('#'), trimmed.lastIndexOf('/')) + 1) || trimmed
  return local.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ')
}

/** Spending, deleting or sending out: authorising these takes one more confirmation. */
export function detectHighImpact(input: { action?: string | null; toolName?: string | null }): HighImpactKind | null {
  const text = `${words(input.action)} ${words(input.toolName)}`
  for (const [kind, pattern] of IMPACT_PATTERNS) {
    if (pattern.test(text)) return kind
  }
  return null
}

/** Plain name of what a grant lets LinX decide, from its title or action. */
export function describeGrantAction(grant: { title?: string | null; summary?: string | null; action?: string | null }): string {
  const title = grant.title?.trim() || grant.summary?.trim()
  if (title) return title
  return words(grant.action) || '一类事'
}
