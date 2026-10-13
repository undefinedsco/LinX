/**
 * R6 auto-judge contract (W2 / W7 / K11).
 *
 * A request either waits for the user forever, or — when an active grant
 * covers it — is auto-approved after a confidence-based window during which
 * the user can still approve, reject or take over.
 *
 * Rules (spec §2 "决定与授权"):
 * - No grant → wait for the user. There is no expiry auto-approve.
 * - Grant found → wait by confidence: high 10 min, medium 2 h, low never
 *   (low goes back to the user). The user can change the three waits (K11).
 * - Sending out, spending money and deleting need a grant that was confirmed
 *   separately for that impact; otherwise they always ask.
 * - When the window elapses with nobody acting, LinX approves and records that
 *   it decided on the user's behalf.
 *
 * ## How the state lives on an Approval (existing `approvalResource` fields only)
 *
 * The shared models package has no auto-judge fields yet, so the state is
 * spread over fields that already mean something close:
 *
 * | Approval field   | While LinX waits (`waiting`)                      | User took over (`taken-over`) / LinX unsure (`returned`) | LinX approved (`auto-approved`)              |
 * |------------------|---------------------------------------------------|---------------------------------------------------------|----------------------------------------------|
 * | `status`         | `pending` (every existing reader keeps waiting)   | `pending`                                               | `approved`                                   |
 * | `assignedTo`     | the LinX assistant (agent IRI) — who decides      | the user's WebID                                        | unchanged (the LinX assistant)               |
 * | `leaseOwner`     | `linx:auto-judge`                                 | cleared                                                 | unchanged                                    |
 * | `leaseExpiresAt` | `decideAt` — when LinX approves if nobody acts    | cleared                                                 | unchanged (when it was due)                  |
 * | `decisionBy`     | —                                                 | —                                                       | the LinX assistant (agent IRI)               |
 * | `decisionRole`   | —                                                 | —                                                       | `secretary`                                  |
 * | `onBehalfOf`     | —                                                 | —                                                       | the user's WebID                             |
 * | `reason`         | —                                                 | —                                                       | JSON `{source:"linx-auto-judge",decision:"accept",note}` |
 * | `policyVersion`  | —                                                 | —                                                       | `r6-auto-judge-v1`                           |
 * | `context`        | JSON; key `linxAutoJudge` holds {@link AutoJudgeState} (grant, confidence, decideAt, plannedAt …). Other keys of the original context are kept; a non-JSON context is kept under `text`. |
 *
 * `expiresAt` is deliberately not used: an expired request must never be
 * approved, and requests without a grant never expire into an approval.
 * The lease marks the approval as handled by LinX so other secretaries do not
 * claim it while the window runs; it ends at `decideAt`.
 *
 * The audit entry written when LinX approves uses `auditResource` with
 * `action: inbox.approval.auto_approved`, `actorRole: secretary`,
 * `onBehalfOf: <user>`, `approval: <approval IRI>` and `policy: <grant IRI>`.
 *
 * ## High-impact confirmation on a grant (existing `grantResource` fields)
 *
 * A grant confirmed for sending / spending / deleting carries the tag
 * {@link AUTO_JUDGE_HIGH_IMPACT_TAG} in its `tags` JSON array.
 */
export type AutoJudgeConfidence = 'high' | 'medium' | 'low'

export interface AutoJudgeWindows {
  /** Milliseconds to wait before auto-approving; null = never auto-approve. */
  high: number | null
  medium: number | null
  low: number | null
}

export const DEFAULT_AUTO_JUDGE_WINDOWS: AutoJudgeWindows = {
  high: 10 * 60_000,
  medium: 2 * 60 * 60_000,
  low: null,
}

export interface AutoJudgeGrant {
  id: string
  target: string
  action: string
  riskCeiling?: string | null
  revokedAt?: string | Date | null
  /** Only `allow` grants delegate; anything else is ignored. Missing = allow. */
  effect?: string | null
  /** Confirmed separately for send / spend / delete (see {@link isHighImpactConfirmedGrant}). */
  highImpactConfirmed?: boolean | null
}

export interface AutoJudgeRequest {
  target: string
  action: string
  risk: string
  /** Outbound send, spend or delete: needs a grant confirmed separately. Inferred from `action` when omitted. */
  highImpact?: boolean
}

export type AutoJudgeWaitReason =
  /** No active grant covers the request. */
  | 'no-grant'
  /** Only grants not confirmed for send / spend / delete cover it. */
  | 'needs-confirmed-grant'
  /** A grant covers it, but LinX is not sure enough to auto-approve. */
  | 'low-confidence'

export type AutoJudgePlan =
  | {
      mode: 'wait-user'
      /** Why the request waits for the user (optional for older callers). */
      reason?: AutoJudgeWaitReason
      /** The grant that covered the request, when one did. */
      grantId?: string
    }
  | {
      mode: 'auto'
      grantId: string
      confidence: AutoJudgeConfidence
      /** When LinX approves if nobody acts first. */
      decideAt: Date
    }

export interface PlanAutoJudgeInput {
  request: AutoJudgeRequest
  grants: AutoJudgeGrant[]
  confidence: AutoJudgeConfidence
  now: Date
  windows?: AutoJudgeWindows
}

export type AutoJudgeTargetMatch = 'exact' | 'contained'

export interface AutoJudgeGrantMatch<TGrant extends AutoJudgeGrant = AutoJudgeGrant> {
  grant: TGrant
  match: AutoJudgeTargetMatch
}

export const AUTO_JUDGE_LEASE_OWNER = 'linx:auto-judge'
export const AUTO_JUDGE_CONTEXT_KEY = 'linxAutoJudge'
export const AUTO_JUDGE_POLICY_VERSION = 'r6-auto-judge-v1'
export const AUTO_JUDGE_DECISION_SOURCE = 'linx-auto-judge'
export const AUTO_JUDGE_AUDIT_ACTION = 'inbox.approval.auto_approved'
export const AUTO_JUDGE_HIGH_IMPACT_TAG = 'high-impact-confirmed'

const RISK_LEVELS: Record<string, number> = {
  low: 1,
  '低': 1,
  medium: 2,
  '中': 2,
  high: 3,
  '高': 3,
  critical: 4,
}

/** 1 = low … 4 = critical. Unknown request risk counts as high. */
export function autoJudgeRiskLevel(risk: string | null | undefined): number | null {
  const normalized = typeof risk === 'string' ? risk.trim().toLowerCase() : ''
  if (!normalized) return null
  return RISK_LEVELS[normalized] ?? null
}

const HIGH_IMPACT_PATTERN = /(?:^|[^a-z])(?:send|email|mail|invite|invitation|publish|post|share|distribute|upload|push|outbound|external|notify|pay|payment|purchase|buy|spend|charge|transfer|order|delete|remove|destroy|drop|purge|erase|unlink|rm)(?:[^a-z]|$)/i

function actionLocalName(action: string): string {
  const trimmed = action.trim()
  const hash = trimmed.lastIndexOf('#')
  const slash = trimmed.lastIndexOf('/')
  const local = trimmed.slice(Math.max(hash, slash) + 1) || trimmed
  // camelCase / snake / kebab → words, so `sendInvites` reads as "send invites".
  return local.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ')
}

/** Sending out, spending money or deleting — judged from the action (and tool name) words. */
export function isHighImpactAutoJudgeAction(action: string | null | undefined, toolName?: string | null): boolean {
  const words = [action ? actionLocalName(action) : '', toolName ? actionLocalName(toolName) : '']
    .join(' ')
    .trim()
  return words.length > 0 && HIGH_IMPACT_PATTERN.test(words)
}

function isRevoked(grant: AutoJudgeGrant): boolean {
  const value = grant.revokedAt
  if (value === null || value === undefined) return false
  if (value instanceof Date) return Number.isFinite(value.getTime())
  return String(value).trim().length > 0
}

function isAllowGrant(grant: AutoJudgeGrant): boolean {
  const effect = typeof grant.effect === 'string' ? grant.effect.trim().toLowerCase() : ''
  return !effect || effect === 'allow'
}

function documentOf(iri: string): string {
  return iri.split('#', 1)[0] ?? iri
}

/** Whether a grant target covers a request target: same resource, or inside the granted container/document. */
export function autoJudgeTargetMatch(grantTarget: string, requestTarget: string): AutoJudgeTargetMatch | null {
  const granted = grantTarget.trim()
  const requested = requestTarget.trim()
  if (!granted || !requested) return null
  if (granted === requested) return 'exact'
  if (granted.endsWith('/') && requested.startsWith(granted)) return 'contained'
  if (!granted.includes('#') && documentOf(requested) === granted) return 'contained'
  return null
}

function riskWithinCeiling(grant: AutoJudgeGrant, requestRisk: string): boolean {
  const ceiling = autoJudgeRiskLevel(grant.riskCeiling)
  if (ceiling === null) return true
  const risk = autoJudgeRiskLevel(requestRisk) ?? RISK_LEVELS.high
  return risk <= ceiling
}

/**
 * Active (not revoked, `allow`) grants that cover the request by target,
 * action and risk ceiling — best first: exact target before a container.
 */
export function matchAutoJudgeGrants<TGrant extends AutoJudgeGrant>(
  request: AutoJudgeRequest,
  grants: readonly TGrant[],
): AutoJudgeGrantMatch<TGrant>[] {
  const matches: AutoJudgeGrantMatch<TGrant>[] = []
  for (const grant of grants) {
    if (isRevoked(grant) || !isAllowGrant(grant)) continue
    if (grant.action.trim() !== request.action.trim()) continue
    if (!riskWithinCeiling(grant, request.risk)) continue
    const match = autoJudgeTargetMatch(grant.target, request.target)
    if (match) matches.push({ grant, match })
  }
  return matches.sort((left, right) => (left.match === right.match ? 0 : left.match === 'exact' ? -1 : 1))
}

export function resolveAutoJudgeWindowMs(
  confidence: AutoJudgeConfidence,
  windows: AutoJudgeWindows = DEFAULT_AUTO_JUDGE_WINDOWS,
): number | null {
  const value = windows[confidence]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/** Maps a 0..1 confidence score (for example from the AI secretary) to a band. */
export function autoJudgeConfidenceFromScore(score: number | null | undefined): AutoJudgeConfidence {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'low'
  const normalized = score > 1 && score <= 100 ? score / 100 : score
  if (normalized >= 0.85) return 'high'
  if (normalized >= 0.6) return 'medium'
  return 'low'
}

function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin && left.startsWith(right)
  } catch {
    return false
  }
}

/**
 * Confidence when no AI secretary scores the request (the Web inbox check):
 * - low: the target is not in the user's own space (someone shared it);
 * - high: low-risk request;
 * - medium: everything else a grant covers.
 */
export function assessAutoJudgeConfidence(input: {
  request: AutoJudgeRequest
  /** The user's Pod root, e.g. `https://pod.example/alice/`. */
  podBaseUrl?: string | null
}): AutoJudgeConfidence {
  if (input.podBaseUrl && !sameOrigin(input.request.target, input.podBaseUrl)) return 'low'
  const risk = autoJudgeRiskLevel(input.request.risk) ?? RISK_LEVELS.high
  return risk <= RISK_LEVELS.low ? 'high' : 'medium'
}

export function planAutoJudge(input: PlanAutoJudgeInput): AutoJudgePlan {
  const { request, grants, confidence, now } = input
  const matches = matchAutoJudgeGrants(request, grants)
  if (matches.length === 0) return { mode: 'wait-user', reason: 'no-grant' }

  const highImpact = request.highImpact ?? isHighImpactAutoJudgeAction(request.action)
  const usable = highImpact ? matches.filter(({ grant }) => grant.highImpactConfirmed === true) : matches
  if (usable.length === 0) {
    return { mode: 'wait-user', reason: 'needs-confirmed-grant', grantId: matches[0].grant.id }
  }

  const grantId = usable[0].grant.id
  const windowMs = resolveAutoJudgeWindowMs(confidence, input.windows ?? DEFAULT_AUTO_JUDGE_WINDOWS)
  if (windowMs === null) return { mode: 'wait-user', reason: 'low-confidence', grantId }

  return {
    mode: 'auto',
    grantId,
    confidence,
    decideAt: new Date(now.getTime() + windowMs),
  }
}

// ---------------------------------------------------------------------------
// Approval persistence (see the table at the top of this file)
// ---------------------------------------------------------------------------

export type AutoJudgePhase = 'waiting' | 'due' | 'taken-over' | 'returned' | 'auto-approved'

export interface AutoJudgeState {
  /** Grant row id. */
  grantId: string
  /** Grant IRI, cited by the audit entry and the review. */
  grant?: string
  confidence: AutoJudgeConfidence
  /** ISO time LinX approves if nobody acts (mirrors `leaseExpiresAt`). */
  decideAt?: string
  plannedAt: string
  /** Set when LinX is not sure (`low-confidence`) or the grant is not confirmed for the impact. */
  returnedReason?: AutoJudgeWaitReason
  takenOverAt?: string
  takenOverBy?: string
  /** Set when LinX approved. */
  decidedAt?: string
  /** Set when the user looked at the auto approval and said it was fine. */
  reviewedAt?: string
  reviewedBy?: string
}

/** The Approval fields auto-judge reads and writes. Structural, so CLI and Web rows both fit. */
export interface AutoJudgeApprovalLike {
  status?: string | null
  assignedTo?: string | null
  leaseOwner?: string | null
  leaseExpiresAt?: string | Date | null
  decisionRole?: string | null
  context?: string | null
}

export interface AutoJudgeApprovalPatch {
  status?: string
  assignedTo?: string | null
  leaseOwner?: string | null
  leaseExpiresAt?: Date | null
  decisionBy?: string
  decisionRole?: string
  onBehalfOf?: string
  reason?: string
  resolvedAt?: Date
  policyVersion?: string
  context: string
}

function parseContextObject(context: string | null | undefined): Record<string, unknown> {
  const text = typeof context === 'string' ? context.trim() : ''
  if (!text) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch {
    // Free text context is kept under `text`.
  }
  return { text }
}

function toIso(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

const CONFIDENCES: readonly AutoJudgeConfidence[] = ['high', 'medium', 'low']
const WAIT_REASONS: readonly AutoJudgeWaitReason[] = ['no-grant', 'needs-confirmed-grant', 'low-confidence']

function readStateRecord(raw: unknown): AutoJudgeState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const grantId = typeof record.grantId === 'string' ? record.grantId : null
  const confidence = CONFIDENCES.find((value) => value === record.confidence)
  const plannedAt = typeof record.plannedAt === 'string' ? record.plannedAt : null
  if (!grantId || !confidence || !plannedAt) return null
  const optionalString = (key: keyof AutoJudgeState) => (typeof record[key] === 'string' ? { [key]: record[key] as string } : {})
  const returnedReason = WAIT_REASONS.find((value) => value === record.returnedReason)
  return {
    grantId,
    confidence,
    plannedAt,
    ...optionalString('grant'),
    ...optionalString('decideAt'),
    ...(returnedReason ? { returnedReason } : {}),
    ...optionalString('takenOverAt'),
    ...optionalString('takenOverBy'),
    ...optionalString('decidedAt'),
    ...optionalString('reviewedAt'),
    ...optionalString('reviewedBy'),
  }
}

/** Reads the auto-judge state from an Approval's `context`, or null when LinX never judged it. */
export function readAutoJudgeState(approval: AutoJudgeApprovalLike): AutoJudgeState | null {
  const state = readStateRecord(parseContextObject(approval.context)[AUTO_JUDGE_CONTEXT_KEY])
  if (!state) return null
  const leaseDecideAt = approval.leaseOwner === AUTO_JUDGE_LEASE_OWNER ? toIso(approval.leaseExpiresAt) : undefined
  return leaseDecideAt ? { ...state, decideAt: leaseDecideAt } : state
}

/** Returns `context` with the auto-judge state merged in, keeping everything else. */
export function writeAutoJudgeContext(context: string | null | undefined, state: AutoJudgeState): string {
  return JSON.stringify({ ...parseContextObject(context), [AUTO_JUDGE_CONTEXT_KEY]: state })
}

function isPendingStatus(status: string | null | undefined): boolean {
  return !status || status === 'pending' || status === 'handling'
}

export function autoJudgePhase(approval: AutoJudgeApprovalLike, now: Date): AutoJudgePhase | null {
  const state = readAutoJudgeState(approval)
  if (!state) return null
  if (approval.status === 'approved' && approval.decisionRole === 'secretary' && state.decidedAt) return 'auto-approved'
  if (!isPendingStatus(approval.status)) return null
  if (state.takenOverAt) return 'taken-over'
  if (state.returnedReason) return 'returned'
  if (approval.leaseOwner !== AUTO_JUDGE_LEASE_OWNER || !state.decideAt) return null
  return new Date(state.decideAt).getTime() <= now.getTime() ? 'due' : 'waiting'
}

export function isAutoJudgeDue(approval: AutoJudgeApprovalLike, now: Date): boolean {
  return autoJudgePhase(approval, now) === 'due'
}

/** Milliseconds until LinX approves; null when it is not waiting. */
export function autoJudgeRemainingMs(approval: AutoJudgeApprovalLike, now: Date): number | null {
  const phase = autoJudgePhase(approval, now)
  if (phase !== 'waiting' && phase !== 'due') return null
  const decideAt = readAutoJudgeState(approval)?.decideAt
  return decideAt ? Math.max(0, new Date(decideAt).getTime() - now.getTime()) : null
}

/** Whether nobody has planned this pending approval yet (a grant may now cover it). */
export function needsAutoJudgePlan(approval: AutoJudgeApprovalLike): boolean {
  if (approval.status !== 'pending') return false
  if (readAutoJudgeState(approval)) return false
  // A request already assigned to someone else stays with them.
  return !approval.assignedTo
}

/** LinX will decide at `plan.decideAt` unless someone acts first. */
export function buildAutoJudgeWaitingPatch(input: {
  approval: AutoJudgeApprovalLike
  plan: Extract<AutoJudgePlan, { mode: 'auto' }>
  agentIri: string
  grantIri?: string
  now: Date
}): AutoJudgeApprovalPatch {
  return {
    assignedTo: input.agentIri,
    leaseOwner: AUTO_JUDGE_LEASE_OWNER,
    leaseExpiresAt: input.plan.decideAt,
    context: writeAutoJudgeContext(input.approval.context, {
      grantId: input.plan.grantId,
      ...(input.grantIri ? { grant: input.grantIri } : {}),
      confidence: input.plan.confidence,
      decideAt: input.plan.decideAt.toISOString(),
      plannedAt: input.now.toISOString(),
    }),
  }
}

/** A grant covered it but LinX will not decide (low confidence / impact not confirmed): back to the user. */
export function buildAutoJudgeReturnedPatch(input: {
  approval: AutoJudgeApprovalLike
  plan: Extract<AutoJudgePlan, { mode: 'wait-user' }>
  confidence: AutoJudgeConfidence
  userWebId: string
  grantIri?: string
  now: Date
}): AutoJudgeApprovalPatch | null {
  if (!input.plan.grantId || !input.plan.reason || input.plan.reason === 'no-grant') return null
  return {
    assignedTo: input.userWebId,
    leaseOwner: null,
    leaseExpiresAt: null,
    context: writeAutoJudgeContext(input.approval.context, {
      grantId: input.plan.grantId,
      ...(input.grantIri ? { grant: input.grantIri } : {}),
      confidence: input.confidence,
      plannedAt: input.now.toISOString(),
      returnedReason: input.plan.reason,
    }),
  }
}

/** "我来判断": the user takes the request back; it waits for them with no timer. */
export function buildAutoJudgeTakeOverPatch(input: {
  approval: AutoJudgeApprovalLike
  userWebId: string
  now: Date
}): AutoJudgeApprovalPatch | null {
  const state = readAutoJudgeState(input.approval)
  if (!state) return null
  const { decideAt: _decideAt, ...rest } = state
  return {
    assignedTo: input.userWebId,
    leaseOwner: null,
    leaseExpiresAt: null,
    context: writeAutoJudgeContext(input.approval.context, {
      ...rest,
      takenOverAt: input.now.toISOString(),
      takenOverBy: input.userWebId,
    }),
  }
}

/** The window elapsed with no human action: LinX approves on the user's behalf. */
export function buildAutoJudgeApprovePatch(input: {
  approval: AutoJudgeApprovalLike
  agentIri: string
  userWebId: string
  now: Date
}): AutoJudgeApprovalPatch | null {
  const state = readAutoJudgeState(input.approval)
  if (!state) return null
  return {
    status: 'approved',
    decisionBy: input.agentIri,
    decisionRole: 'secretary',
    onBehalfOf: input.userWebId,
    resolvedAt: input.now,
    policyVersion: AUTO_JUDGE_POLICY_VERSION,
    reason: JSON.stringify({
      source: AUTO_JUDGE_DECISION_SOURCE,
      decision: 'accept',
      note: `confidence ${state.confidence}; grant ${state.grant ?? state.grantId}`,
    }),
    context: writeAutoJudgeContext(input.approval.context, {
      ...state,
      decidedAt: input.now.toISOString(),
    }),
  }
}

/** "没问题" in the review: remember the user looked at it. */
export function buildAutoJudgeReviewedPatch(input: {
  approval: AutoJudgeApprovalLike
  userWebId: string
  now: Date
}): Pick<AutoJudgeApprovalPatch, 'context'> | null {
  const state = readAutoJudgeState(input.approval)
  if (!state) return null
  return {
    context: writeAutoJudgeContext(input.approval.context, {
      ...state,
      reviewedAt: input.now.toISOString(),
      reviewedBy: input.userWebId,
    }),
  }
}

// ---------------------------------------------------------------------------
// Grant helpers
// ---------------------------------------------------------------------------

function parseTags(tags: string | readonly string[] | null | undefined): string[] {
  if (Array.isArray(tags)) return tags.filter((tag): tag is string => typeof tag === 'string')
  if (typeof tags !== 'string' || !tags.trim()) return []
  try {
    const parsed: unknown = JSON.parse(tags)
    if (Array.isArray(parsed)) return parsed.filter((tag): tag is string => typeof tag === 'string')
  } catch {
    // Comma separated fallback.
  }
  return tags.split(',').map((tag) => tag.trim()).filter(Boolean)
}

export function isHighImpactConfirmedGrant(grant: { tags?: string | readonly string[] | null }): boolean {
  return parseTags(grant.tags).includes(AUTO_JUDGE_HIGH_IMPACT_TAG)
}

/** Adds or keeps the high-impact confirmation tag in a grant's `tags` JSON. */
export function encodeAutoJudgeGrantTags(tags: readonly string[], highImpactConfirmed: boolean): string {
  const set = new Set(tags.map((tag) => tag.trim()).filter(Boolean))
  if (highImpactConfirmed) set.add(AUTO_JUDGE_HIGH_IMPACT_TAG)
  else set.delete(AUTO_JUDGE_HIGH_IMPACT_TAG)
  return JSON.stringify([...set])
}

/** Reads a stored grant row (`grantResource`) into what {@link planAutoJudge} needs. */
export function toAutoJudgeGrant(row: {
  id?: string | null
  target?: string | null
  action?: string | null
  riskCeiling?: string | null
  revokedAt?: string | Date | null
  effect?: string | null
  tags?: string | null
}): AutoJudgeGrant | null {
  if (!row.id || !row.target || !row.action) return null
  return {
    id: row.id,
    target: row.target,
    action: row.action,
    riskCeiling: row.riskCeiling ?? null,
    revokedAt: row.revokedAt ?? null,
    effect: row.effect ?? null,
    highImpactConfirmed: isHighImpactConfirmedGrant(row),
  }
}
