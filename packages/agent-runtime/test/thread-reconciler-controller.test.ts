import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createThreadReconcilerController,
  decideThreadControlEvent,
  runThreadReconcilerCycle,
} from '../src/thread-reconciler-controller'

test('thread reconciler controller dispatches wake jobs through the scheduler', async () => {
  const handled: string[] = []
  const hooks: string[] = []
  const controller = createThreadReconcilerController({
    policy: {
      kind: 'auto',
      secretaryAgent: 'secretary-a',
    },
    handleWakeJob: ({ job, decisionSummary }) => {
      handled.push(`${decisionSummary.eventType}:${job.targetAgent}:${job.targetRole}`)
      return `handled:${job.id}`
    },
    onWakeJobQueued: (record, decision) => hooks.push(`queued:${decision.eventType}:${record.job.targetAgent}`),
    onWakeJobStarted: (record, decision) => hooks.push(`started:${decision.eventType}:${record.job.targetAgent}`),
    onWakeJobCompleted: (record, decision) => hooks.push(`completed:${decision.eventType}:${record.job.targetAgent}:${String(record.result)}`),
    now: fixedNow(),
  })

  const result = await controller.dispatchAndDrain({
    type: 'approval.required',
    thread: 'thread:auto',
    chat: 'chat:auto',
    actor: { role: 'runtime' },
  }, {
    randomId: 'approval-1',
  })

  assert.equal(result.summary.policyKind, 'auto')
  assert.equal(result.summary.wakeJobs.length, 1)
  assert.equal(result.wakeRecords.length, 1)
  assert.equal(result.wakeRecordSummaries[0].status, 'running')
  assert.equal(result.scheduler.completed.length, 1)
  assert.equal(result.schedulerSummary.completed[0].status, 'completed')
  assert.deepEqual(handled, ['approval.required:secretary-a:secretary'])
  assert.deepEqual(hooks, [
    'queued:approval.required:secretary-a',
    'started:approval.required:secretary-a',
    'completed:approval.required:secretary-a:handled:wake_approval-1',
  ])
  assert.equal(controller.snapshot().completed.length, 1)
})

test('thread reconciler controller keeps skipped events out of the scheduler', async () => {
  const handled: string[] = []
  const decisions: string[] = []
  const controller = createThreadReconcilerController({
    policy: 'auto',
    handleWakeJob: ({ job }) => {
      handled.push(job.id)
    },
    onDecision: (decision) => decisions.push(`${decision.eventType}:${decision.skippedReason ?? 'wake'}`),
    now: fixedNow(),
  })

  const result = controller.dispatch({
    type: 'schedule.tick',
    thread: 'thread:auto',
    actor: { role: 'scheduler' },
  }, {
    randomId: 'unhandled-schedule',
  })
  await controller.drain()

  assert.equal(result.summary.wakeJobs.length, 0)
  assert.match(result.summary.skippedReason, /does not wake/)
  assert.deepEqual(decisions, ['schedule.tick:Policy auto does not wake an agent for schedule.tick.'])
  assert.deepEqual(handled, [])
  assert.equal(controller.snapshot().all.length, 0)
})

test('run thread reconciler cycle exposes one shared dispatch/drain flow', async () => {
  const events: string[] = []
  const result = await runThreadReconcilerCycle({
    policy: {
      kind: 'symphony',
      assignedWorkerAgent: 'worker-a',
    },
    handleWakeJob: ({ job }) => {
      events.push(`handled:${job.targetAgent}`)
      return { ok: true }
    },
    event: {
      type: 'delivery.submitted',
      thread: 'thread:worker',
      actor: { role: 'secretary' },
      data: {
        deliveryType: 'task_dispatch',
        dispatch: true,
      },
    },
    dispatchOptions: {
      randomId: 'dispatch-1',
    },
    onDispatched: (dispatch) => {
      events.push(`dispatched:${dispatch.summary.wakeJobs[0].targetAgent}:${dispatch.wakeRecordSummaries[0].status}`)
    },
    now: fixedNow(),
  })

  assert.deepEqual(events, [
    'dispatched:worker-a:queued',
    'handled:worker-a',
  ])
  assert.equal(result.summary.policyKind, 'symphony')
  assert.equal(result.schedulerSummary.completed.length, 1)
  assert.deepEqual(result.schedulerSummary.completed[0].result, { ok: true })
})

test('decide thread control event records reconciliation without scheduling wake jobs', () => {
  const result = decideThreadControlEvent({
    policy: {
      kind: 'auto',
      secretaryAgent: 'secretary-a',
    },
    event: {
      type: 'input.required',
      thread: 'thread:auto',
      actor: { role: 'runtime' },
    },
    randomId: 'input-1',
    now: new Date('2026-05-29T00:00:00.000Z'),
  })

  assert.equal(result.summary.policyKind, 'auto')
  assert.equal(result.summary.eventType, 'input.required')
  assert.equal(result.summary.wakeJobs[0].targetAgent, 'secretary-a')
})

function fixedNow(): () => Date {
  return () => new Date('2026-05-29T00:00:00.000Z')
}
