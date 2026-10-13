import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AUTO_JUDGE_HIGH_IMPACT_TAG,
  AUTO_JUDGE_LEASE_OWNER,
  DEFAULT_AUTO_JUDGE_WINDOWS,
  assessAutoJudgeConfidence,
  autoJudgeConfidenceFromScore,
  autoJudgePhase,
  autoJudgeRemainingMs,
  autoJudgeTargetMatch,
  buildAutoJudgeApprovePatch,
  buildAutoJudgeReturnedPatch,
  buildAutoJudgeReviewedPatch,
  buildAutoJudgeTakeOverPatch,
  buildAutoJudgeWaitingPatch,
  encodeAutoJudgeGrantTags,
  isAutoJudgeDue,
  isHighImpactAutoJudgeAction,
  isHighImpactConfirmedGrant,
  matchAutoJudgeGrants,
  needsAutoJudgePlan,
  planAutoJudge,
  readAutoJudgeState,
  toAutoJudgeGrant,
  type AutoJudgeGrant,
  type AutoJudgeRequest,
} from '../src/auto-judge'

const POD = 'https://pod.example/alice/'
const READ = 'http://www.w3.org/ns/odrl/2/read'
const SEND = 'https://undefineds.co/ns#sendInvites'
const NOW = new Date('2026-10-11T10:00:00.000Z')
const AGENT = `${POD}agents/__secretary__/`
const USER = `${POD}profile/card#me`

const readFile: AutoJudgeRequest = {
  target: `${POD}files/schedule-2025.pdf`,
  action: READ,
  risk: 'low',
}

function grant(overrides: Partial<AutoJudgeGrant> = {}): AutoJudgeGrant {
  return { id: 'grant-read', target: POD, action: READ, riskCeiling: 'low', ...overrides }
}

test('without any grant the request waits for the user forever', () => {
  assert.deepEqual(planAutoJudge({ request: readFile, grants: [], confidence: 'high', now: NOW }), {
    mode: 'wait-user',
    reason: 'no-grant',
  })
})

test('a grant covering the target container auto-approves after the confidence window', () => {
  const plan = planAutoJudge({ request: readFile, grants: [grant()], confidence: 'high', now: NOW })
  assert.equal(plan.mode, 'auto')
  if (plan.mode !== 'auto') return
  assert.equal(plan.grantId, 'grant-read')
  assert.equal(plan.confidence, 'high')
  assert.equal(plan.decideAt.toISOString(), '2026-10-11T10:10:00.000Z')

  const medium = planAutoJudge({ request: readFile, grants: [grant()], confidence: 'medium', now: NOW })
  assert.equal(medium.mode === 'auto' && medium.decideAt.toISOString(), '2026-10-11T12:00:00.000Z')
})

test('low confidence goes back to the user and names the covering grant', () => {
  assert.deepEqual(planAutoJudge({ request: readFile, grants: [grant()], confidence: 'low', now: NOW }), {
    mode: 'wait-user',
    reason: 'low-confidence',
    grantId: 'grant-read',
  })
})

test('the user can change the three waits', () => {
  const plan = planAutoJudge({
    request: readFile,
    grants: [grant()],
    confidence: 'low',
    now: NOW,
    windows: { high: 5 * 60_000, medium: null, low: 60 * 60_000 },
  })
  assert.equal(plan.mode === 'auto' && plan.decideAt.toISOString(), '2026-10-11T11:00:00.000Z')
  assert.equal(planAutoJudge({
    request: readFile,
    grants: [grant()],
    confidence: 'medium',
    now: NOW,
    windows: { ...DEFAULT_AUTO_JUDGE_WINDOWS, medium: null },
  }).mode, 'wait-user')
})

test('grants match by action, target and risk ceiling, and revoked or deny grants never count', () => {
  const other = grant({ id: 'grant-modify', action: 'http://www.w3.org/ns/odrl/2/modify' })
  const elsewhere = grant({ id: 'grant-elsewhere', target: 'https://pod.example/bob/' })
  const tooLow = grant({ id: 'grant-low' })
  const revoked = grant({ id: 'grant-revoked', riskCeiling: 'high', revokedAt: '2026-10-10T00:00:00.000Z' })
  const deny = grant({ id: 'grant-deny', riskCeiling: 'high', effect: 'deny' })
  const mediumRead = { ...readFile, risk: 'medium' }

  assert.deepEqual(matchAutoJudgeGrants(mediumRead, [other, elsewhere, tooLow, revoked, deny]), [])
  assert.equal(planAutoJudge({ request: mediumRead, grants: [revoked], confidence: 'high', now: NOW }).mode, 'wait-user')

  const exact = grant({ id: 'grant-exact', target: readFile.target, riskCeiling: 'medium' })
  const container = grant({ id: 'grant-container', riskCeiling: 'high' })
  assert.deepEqual(
    matchAutoJudgeGrants(mediumRead, [container, exact]).map(({ grant: g, match }) => [g.id, match]),
    [['grant-exact', 'exact'], ['grant-container', 'contained']],
  )
})

test('target matching covers the resource itself, its document and granted containers', () => {
  assert.equal(autoJudgeTargetMatch(`${POD}a.ttl#x`, `${POD}a.ttl#x`), 'exact')
  assert.equal(autoJudgeTargetMatch(`${POD}a.ttl`, `${POD}a.ttl#x`), 'contained')
  assert.equal(autoJudgeTargetMatch(`${POD}files/`, `${POD}files/a.pdf`), 'contained')
  assert.equal(autoJudgeTargetMatch(`${POD}files`, `${POD}files-old/a.pdf`), null)
  assert.equal(autoJudgeTargetMatch(`${POD}a.ttl#x`, `${POD}a.ttl#y`), null)
})

test('sending, spending and deleting need a grant confirmed separately for it', () => {
  const sendInvites: AutoJudgeRequest = { target: `${POD}calendar/`, action: SEND, risk: 'high' }
  const plain = grant({ id: 'grant-send', target: `${POD}calendar/`, action: SEND, riskCeiling: 'high' })
  assert.deepEqual(planAutoJudge({ request: sendInvites, grants: [plain], confidence: 'high', now: NOW }), {
    mode: 'wait-user',
    reason: 'needs-confirmed-grant',
    grantId: 'grant-send',
  })

  const confirmed = { ...plain, id: 'grant-send-confirmed', highImpactConfirmed: true }
  const plan = planAutoJudge({ request: sendInvites, grants: [plain, confirmed], confidence: 'high', now: NOW })
  assert.equal(plan.mode === 'auto' && plan.grantId, 'grant-send-confirmed')

  // An explicit flag wins over the inferred one.
  assert.equal(planAutoJudge({ request: { ...readFile, highImpact: true }, grants: [grant()], confidence: 'high', now: NOW }).mode, 'wait-user')
})

test('high impact is read from the action words', () => {
  assert.equal(isHighImpactAutoJudgeAction('https://undefineds.co/ns#sendInvites'), true)
  assert.equal(isHighImpactAutoJudgeAction('http://www.w3.org/ns/odrl/2/delete'), true)
  assert.equal(isHighImpactAutoJudgeAction('https://undefineds.co/ns#purchase_order'), true)
  assert.equal(isHighImpactAutoJudgeAction('https://undefineds.co/ns#runtimeApproval', 'payment.charge'), true)
  assert.equal(isHighImpactAutoJudgeAction(READ), false)
  assert.equal(isHighImpactAutoJudgeAction('https://undefineds.co/ns#commandExecution'), false)
  assert.equal(isHighImpactAutoJudgeAction('https://undefineds.co/ns#reorderRows'), false)
})

test('confidence comes from a score, or from where the target lives and how risky it is', () => {
  assert.equal(autoJudgeConfidenceFromScore(0.92), 'high')
  assert.equal(autoJudgeConfidenceFromScore(70), 'medium')
  assert.equal(autoJudgeConfidenceFromScore(0.3), 'low')
  assert.equal(autoJudgeConfidenceFromScore(undefined), 'low')

  assert.equal(assessAutoJudgeConfidence({ request: readFile, podBaseUrl: POD }), 'high')
  assert.equal(assessAutoJudgeConfidence({ request: { ...readFile, risk: 'medium' }, podBaseUrl: POD }), 'medium')
  assert.equal(assessAutoJudgeConfidence({
    request: { ...readFile, target: 'https://pod.example/zhouhe/expenses.pdf' },
    podBaseUrl: POD,
  }), 'low')
})

test('the waiting state lives on existing approval fields and becomes due at decideAt', () => {
  const approval = { status: 'pending', context: '{"kind":"command-approval"}' }
  assert.equal(needsAutoJudgePlan(approval), true)
  assert.equal(needsAutoJudgePlan({ ...approval, assignedTo: USER }), false)

  const plan = planAutoJudge({ request: readFile, grants: [grant()], confidence: 'high', now: NOW })
  assert.equal(plan.mode, 'auto')
  if (plan.mode !== 'auto') return
  const patch = buildAutoJudgeWaitingPatch({ approval, plan, agentIri: AGENT, grantIri: `${POD}settings/autonomy/grants/grant-read.ttl`, now: NOW })
  assert.equal(patch.assignedTo, AGENT)
  assert.equal(patch.leaseOwner, AUTO_JUDGE_LEASE_OWNER)
  assert.equal(patch.leaseExpiresAt?.toISOString(), '2026-10-11T10:10:00.000Z')
  assert.equal(JSON.parse(patch.context).kind, 'command-approval')

  const waiting = { ...approval, ...patch }
  assert.equal(needsAutoJudgePlan(waiting), false)
  assert.deepEqual(readAutoJudgeState(waiting), {
    grantId: 'grant-read',
    grant: `${POD}settings/autonomy/grants/grant-read.ttl`,
    confidence: 'high',
    decideAt: '2026-10-11T10:10:00.000Z',
    plannedAt: NOW.toISOString(),
  })
  assert.equal(autoJudgePhase(waiting, NOW), 'waiting')
  assert.equal(autoJudgeRemainingMs(waiting, NOW), 10 * 60_000)
  assert.equal(isAutoJudgeDue(waiting, new Date('2026-10-11T10:09:59.000Z')), false)
  assert.equal(isAutoJudgeDue(waiting, new Date('2026-10-11T10:10:00.000Z')), true)
})

test('when the window elapses LinX approves on the user\'s behalf', () => {
  const plan = planAutoJudge({ request: readFile, grants: [grant()], confidence: 'high', now: NOW })
  if (plan.mode !== 'auto') throw new Error('expected auto plan')
  const waiting = { status: 'pending', ...buildAutoJudgeWaitingPatch({ approval: { status: 'pending' }, plan, agentIri: AGENT, now: NOW }) }
  const later = new Date('2026-10-11T10:10:05.000Z')
  const patch = buildAutoJudgeApprovePatch({ approval: waiting, agentIri: AGENT, userWebId: USER, now: later })
  assert.ok(patch)
  assert.equal(patch.status, 'approved')
  assert.equal(patch.decisionBy, AGENT)
  assert.equal(patch.decisionRole, 'secretary')
  assert.equal(patch.onBehalfOf, USER)
  assert.equal(JSON.parse(patch.reason ?? '{}').source, 'linx-auto-judge')

  const approved = { ...waiting, ...patch }
  assert.equal(autoJudgePhase(approved, later), 'auto-approved')
  assert.equal(readAutoJudgeState(approved)?.decidedAt, later.toISOString())

  const reviewed = { ...approved, ...buildAutoJudgeReviewedPatch({ approval: approved, userWebId: USER, now: later }) }
  assert.equal(readAutoJudgeState(reviewed)?.reviewedBy, USER)
})

test('"我来判断" stops the timer and hands it to the user', () => {
  const plan = planAutoJudge({ request: readFile, grants: [grant()], confidence: 'medium', now: NOW })
  if (plan.mode !== 'auto') throw new Error('expected auto plan')
  const waiting = { status: 'pending', ...buildAutoJudgeWaitingPatch({ approval: { status: 'pending' }, plan, agentIri: AGENT, now: NOW }) }
  const patch = buildAutoJudgeTakeOverPatch({ approval: waiting, userWebId: USER, now: NOW })
  assert.ok(patch)
  assert.equal(patch.assignedTo, USER)
  assert.equal(patch.leaseOwner, null)
  assert.equal(patch.leaseExpiresAt, null)
  const takenOver = { ...waiting, ...patch }
  assert.equal(autoJudgePhase(takenOver, new Date('2026-10-12T00:00:00.000Z')), 'taken-over')
  assert.equal(isAutoJudgeDue(takenOver, new Date('2026-10-12T00:00:00.000Z')), false)
  assert.equal(buildAutoJudgeApprovePatch({ approval: { status: 'pending' }, agentIri: AGENT, userWebId: USER, now: NOW }), null)
})

test('a covered request LinX will not decide is returned to the user, not timed', () => {
  const plan = planAutoJudge({ request: readFile, grants: [grant()], confidence: 'low', now: NOW })
  if (plan.mode !== 'wait-user') throw new Error('expected wait-user plan')
  const patch = buildAutoJudgeReturnedPatch({ approval: { status: 'pending' }, plan, confidence: 'low', userWebId: USER, now: NOW })
  assert.ok(patch)
  const returned = { status: 'pending', ...patch }
  assert.equal(autoJudgePhase(returned, NOW), 'returned')
  assert.equal(readAutoJudgeState(returned)?.returnedReason, 'low-confidence')
  assert.equal(buildAutoJudgeReturnedPatch({
    approval: { status: 'pending' },
    plan: { mode: 'wait-user', reason: 'no-grant' },
    confidence: 'high',
    userWebId: USER,
    now: NOW,
  }), null)
})

test('a free-text context is kept when the state is added', () => {
  const plan = planAutoJudge({ request: readFile, grants: [grant()], confidence: 'high', now: NOW })
  if (plan.mode !== 'auto') throw new Error('expected auto plan')
  const patch = buildAutoJudgeWaitingPatch({ approval: { context: 'from the files proposal' }, plan, agentIri: AGENT, now: NOW })
  assert.equal(JSON.parse(patch.context).text, 'from the files proposal')
  assert.equal(readAutoJudgeState({ context: 'not json' }), null)
})

test('grant rows carry the high-impact confirmation in their tags', () => {
  const tags = encodeAutoJudgeGrantTags(['autonomy', 'grant'], true)
  assert.equal(isHighImpactConfirmedGrant({ tags }), true)
  assert.equal(isHighImpactConfirmedGrant({ tags: encodeAutoJudgeGrantTags(JSON.parse(tags), false) }), false)
  assert.deepEqual(toAutoJudgeGrant({ id: 'g1', target: POD, action: SEND, tags: JSON.stringify([AUTO_JUDGE_HIGH_IMPACT_TAG]) }), {
    id: 'g1',
    target: POD,
    action: SEND,
    riskCeiling: null,
    revokedAt: null,
    effect: null,
    highImpactConfirmed: true,
  })
  assert.equal(toAutoJudgeGrant({ id: 'g2', target: null, action: SEND }), null)
})
