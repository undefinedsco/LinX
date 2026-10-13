/**
 * What a card needs to know about the Pod resource it is bound to (W2 / W2b /
 * W2c). Pure functions, so the rules are testable without a Pod.
 */
import {
  autoJudgePhase,
  readAutoJudgeState,
  type AutoJudgeApprovalLike,
} from '@linx/agent-runtime/auto-judge'
import type { ApprovalRow } from '@undefineds.co/models'
import type { AutoJudgeConfidence } from '@linx/agent-runtime/auto-judge'

/** Does a row id ("2026/10/11.ttl#key", "key", …) name this resource URI? */
export function resourceMatches(rowId: string | null | undefined, uri: string): boolean {
  if (!rowId) return false
  if (uri === rowId) return true
  const hash = rowId.includes('#') ? rowId.slice(rowId.lastIndexOf('#')) : null
  if (uri.endsWith(`/${rowId}`) || uri.endsWith(rowId)) return true
  if (hash && uri.endsWith(hash) && uri.includes(rowId.slice(0, rowId.lastIndexOf('#')))) return true
  return !rowId.includes('/') && !rowId.includes('#') && (uri.endsWith(`#${rowId}`) || uri.endsWith(`/${rowId}`))
}

const HIGH_IMPACT = /(send|mail|email|invite|publish|post|share|pay|purchase|buy|spend|charge|transfer|delete|remove|erase|drop|发送|邮件|邀请|发布|付|买|花|转账|删除|移除)/iu

/**
 * Spending, deleting and sending outward need their grant confirmed a second
 * time (spec §2). The approval carries no explicit flag yet, so judge by risk
 * and by what the tool and action say.
 */
export function isHighImpactApproval(approval: Pick<ApprovalRow, 'risk' | 'toolName' | 'action'>): boolean {
  if (approval.risk === 'high') return true
  return HIGH_IMPACT.test(`${approval.toolName ?? ''} ${approval.action ?? ''}`)
}

export interface AutoJudgeState {
  confidence: AutoJudgeConfidence
  /** When LinX approves if nobody acts first. */
  decideAt: Date
  grantId: string | null
}

/**
 * Auto-judge state as the inbox track stores it on the approval (see
 * `@linx/agent-runtime/auto-judge`): only requests LinX is still waiting on
 * show a countdown.
 */
export function readAutoJudge(approval: ApprovalRow | null | undefined, now: Date = new Date()): AutoJudgeState | null {
  if (!approval) return null
  const like = approval as unknown as AutoJudgeApprovalLike
  const phase = autoJudgePhase(like, now)
  if (phase !== 'waiting' && phase !== 'due') return null
  const state = readAutoJudgeState(like)
  if (!state?.decideAt || state.confidence === 'low') return null
  const decideAt = new Date(state.decideAt)
  if (Number.isNaN(decideAt.getTime())) return null
  return { confidence: state.confidence, decideAt, grantId: state.grantId ?? null }
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return '马上'
  const minutes = Math.ceil(ms / 60_000)
  if (minutes < 1) return '不到 1 分钟'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`
}

export const CONFIDENCE_LABEL: Record<AutoJudgeConfidence, string> = { high: '高', medium: '中', low: '低' }

function parseContext(context: unknown): Record<string, unknown> | null {
  if (typeof context !== 'string' || !context.trim().startsWith('{')) return null
  try {
    const parsed: unknown = JSON.parse(context)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

export interface PermissionCommand {
  command: string
  folder: string | null
  network: boolean | null
}

/** The command a coding tool asks to run, from the approval's context. */
export function readPermissionCommand(approval: Pick<ApprovalRow, 'context' | 'toolName'>): PermissionCommand {
  const parsed = parseContext(approval.context)
  const command = [parsed?.command, parsed?.cmd, parsed?.input]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
  const folder = [parsed?.cwd, parsed?.folder, parsed?.workspace]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
  const network = typeof parsed?.network === 'boolean' ? parsed.network : null
  return { command: command ?? approval.toolName ?? '', folder: folder ?? null, network }
}

/** One sentence for the grant list: what the person delegated. */
export function grantTitleFor(approval: Pick<ApprovalRow, 'toolName' | 'action'>, question: string): string {
  return question.trim() || approval.toolName || String(approval.action ?? '')
}
