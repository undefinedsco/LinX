import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createThreadReconciler,
  reconcileThreadEvent,
  resolveThreadPlacement,
  summarizeReconcileDecision,
} from '../src/reconciler'

test('auto policy wakes same-thread Secretary for runtime input and approval', () => {
  const decision = reconcileThreadEvent({
    policy: 'auto',
    event: {
      type: 'approval.required',
      thread: 'thread:auto-1',
      chat: 'chat:auto',
      actor: { role: 'runtime', id: 'codex-runtime' },
      data: { requestKind: 'command-approval' },
    },
    now: new Date('2026-05-28T00:00:00.000Z'),
    randomId: 'auto-approval',
  })

  assert.equal(decision.policyKind, 'auto')
  assert.equal(decision.placement.thread, 'thread:auto-1')
  assert.equal(decision.wakeJobs.length, 1)
  assert.equal(decision.wakeJobs[0].targetAgent, 'ai-secretary')
  assert.equal(decision.wakeJobs[0].targetRole, 'secretary')
  assert.equal(decision.wakeJobs[0].trigger, 'approval.required')
  assert.equal(decision.wakeJobs[0].priority, 'high')
  const summary = summarizeReconcileDecision(decision)
  assert.equal(summary.wakeJobs[0].sourceEventId, decision.event.id)
  assert.equal(summary.wakeJobs[0].sourceEventType, 'approval.required')
  assert.equal(summary.wakeJobs[0].controlGate, 'authority')
})

test('auto policy treats backend messages as candidate next user-input slots', () => {
  const reconciler = createThreadReconciler({
    kind: 'auto',
    secretaryAgent: 'secretary-a',
  })
  const decision = reconciler.reconcile({
    type: 'message.appended',
    thread: 'thread:auto-game',
    actor: { role: 'primary-agent', id: 'codex' },
    content: '翼字太难接，我被卡住了。有招吗？',
  }, {
    now: new Date('2026-05-28T00:00:01.000Z'),
    randomId: 'auto-message',
  })

  assert.equal(decision.wakeJobs.length, 1)
  assert.equal(decision.wakeJobs[0].targetAgent, 'secretary-a')
  assert.match(decision.wakeJobs[0].reason, /next user-input slot/)
})

test('auto policy routes user messages to Secretary before runtime projection', () => {
  const decision = reconcileThreadEvent({
    policy: {
      kind: 'auto',
      secretaryAgent: 'secretary-a',
    },
    event: {
      type: 'message.appended',
      thread: 'thread:auto-steer',
      actor: { role: 'user', id: 'user:webid' },
      content: '继续按这个方向做',
    },
    now: new Date('2026-05-28T00:00:01.500Z'),
    randomId: 'auto-user-message',
  })

  assert.equal(decision.wakeJobs.length, 1)
  assert.equal(decision.wakeJobs[0].targetAgent, 'secretary-a')
  assert.equal(decision.wakeJobs[0].targetRole, 'secretary')
  assert.match(decision.wakeJobs[0].reason, /before runtime projection/)
})

test('symphony task dispatch Delivery wakes assigned worker through WakeJob', () => {
  const decision = reconcileThreadEvent({
    policy: {
      kind: 'symphony',
      assignedWorkerAgent: 'codex-worker',
    },
    event: {
      type: 'delivery.submitted',
      chat: 'chat:symphony',
      thread: 'thread:worker',
      actor: { role: 'secretary', id: 'ai-secretary' },
      resource: 'delivery:1',
      data: {
        deliveryType: 'task_dispatch',
        task: 'task:1',
      },
    },
    now: new Date('2026-05-28T00:00:02.000Z'),
    randomId: 'dispatch',
  })

  assert.equal(decision.wakeJobs.length, 1)
  assert.equal(decision.wakeJobs[0].targetAgent, 'codex-worker')
  assert.equal(decision.wakeJobs[0].targetRole, 'worker')
  assert.equal(decision.wakeJobs[0].thread, 'thread:worker')
  assert.match(decision.wakeJobs[0].reason, /task-dispatch Delivery/)
  const summary = summarizeReconcileDecision(decision)
  assert.equal(summary.wakeJobs[0].sourceResource, 'delivery:1')
})

test('symphony completion failure and blocker events wake Secretary with control gates', () => {
  const completed = summarizeReconcileDecision(reconcileThreadEvent({
    policy: 'symphony',
    event: {
      type: 'delivery.completed',
      thread: 'thread:worker',
      resource: 'delivery:done',
      actor: { role: 'worker', id: 'codex-worker' },
    },
    now: new Date('2026-05-28T00:00:02.500Z'),
    randomId: 'completed',
  }))
  assert.equal(completed.wakeJobs[0].targetAgent, 'ai-secretary')
  assert.equal(completed.wakeJobs[0].targetRole, 'secretary')
  assert.equal(completed.wakeJobs[0].priority, 'high')
  assert.equal(completed.wakeJobs[0].controlGate, 'quality')
  assert.equal(completed.wakeJobs[0].sourceResource, 'delivery:done')
  assert.match(completed.wakeJobs[0].reason, /acceptance/)

  const failed = summarizeReconcileDecision(reconcileThreadEvent({
    policy: 'symphony',
    event: {
      type: 'delivery.failed',
      thread: 'thread:worker',
      resource: 'delivery:failed',
      actor: { role: 'worker', id: 'codex-worker' },
    },
    now: new Date('2026-05-28T00:00:02.600Z'),
    randomId: 'failed',
  }))
  assert.equal(failed.wakeJobs[0].priority, 'high')
  assert.equal(failed.wakeJobs[0].controlGate, 'feasibility')
  assert.match(failed.wakeJobs[0].reason, /retry/)

  const blocked = summarizeReconcileDecision(reconcileThreadEvent({
    policy: 'symphony',
    event: {
      type: 'worker.blocked',
      thread: 'thread:worker',
      resource: 'run:blocked',
      actor: { role: 'worker', id: 'codex-worker' },
    },
    now: new Date('2026-05-28T00:00:02.700Z'),
    randomId: 'blocked',
  }))
  assert.equal(blocked.wakeJobs[0].priority, 'high')
  assert.equal(blocked.wakeJobs[0].controlGate, 'feasibility')
  assert.match(blocked.wakeJobs[0].reason, /blocker/)
})

test('review policy treats Delivery as stage boundary and wakes reviewer', () => {
  const decision = reconcileThreadEvent({
    policy: {
      kind: 'review',
      reviewerAgent: 'qa-reviewer',
    },
    event: {
      type: 'delivery.submitted',
      thread: 'thread:review',
      actor: { role: 'worker', id: 'codex-worker' },
      resource: 'delivery:2',
    },
    now: new Date('2026-05-28T00:00:03.000Z'),
    randomId: 'review',
  })

  assert.equal(decision.wakeJobs.length, 1)
  assert.equal(decision.wakeJobs[0].targetAgent, 'qa-reviewer')
  assert.equal(decision.wakeJobs[0].targetRole, 'reviewer')
})

test('schedule ticks stay on a stable main thread or split execution thread explicitly', () => {
  const main = resolveThreadPlacement({
    event: {
      type: 'schedule.tick',
      chat: 'chat:system',
      data: {
        scheduleId: 'daily-quality',
      },
    },
  })
  assert.equal(main.thread, 'urn:undefineds:linx:thread:schedule:daily-quality')
  assert.equal(main.kind, 'schedule')
  assert.equal(main.chat, 'chat:system')

  const split = resolveThreadPlacement({
    event: {
      type: 'schedule.tick',
      chat: 'chat:system',
      data: {
        scheduleId: 'daily-quality',
        longRunning: true,
      },
    },
    randomId: 'tick-1',
  })
  assert.equal(split.kind, 'schedule_run')
  assert.equal(split.parentThread, 'urn:undefineds:linx:thread:schedule:daily-quality')
  assert.equal(split.rootThread, 'urn:undefineds:linx:thread:schedule:daily-quality')
  assert.equal(split.splitFrom, 'urn:undefineds:linx:thread:schedule:daily-quality')

  const decision = summarizeReconcileDecision(reconcileThreadEvent({
    policy: 'symphony',
    event: {
      type: 'schedule.tick',
      chat: 'chat:system',
      data: {
        scheduleId: 'daily-quality',
        longRunning: true,
      },
    },
    now: new Date('2026-05-28T00:00:03.500Z'),
    randomId: 'tick-1',
  }))
  assert.equal(decision.thread, 'urn:undefineds:linx:thread:schedule-run:daily-quality-tick-1')
  assert.equal(decision.wakeJobs[0].targetRole, 'secretary')
  assert.equal(decision.wakeJobs[0].controlGate, 'binding')
  assert.match(decision.wakeJobs[0].reason, /Schedule ticks are Thread events/)
})

test('decision summaries are compact metadata for control records', () => {
  const decision = reconcileThreadEvent({
    policy: 'direct',
    event: {
      type: 'message.appended',
      thread: 'thread:direct',
      actor: { role: 'user' },
      content: 'hello',
    },
    now: new Date('2026-05-28T00:00:04.000Z'),
    randomId: 'direct',
  })
  const summary = summarizeReconcileDecision(decision)

  assert.deepEqual(Object.keys(summary).sort(), ['createdAt', 'eventType', 'id', 'policyKind', 'thread', 'wakeJobs'])
  assert.equal(summary.policyKind, 'direct')
  assert.equal(summary.eventType, 'message.appended')
  assert.equal(summary.wakeJobs[0].targetRole, 'primary-agent')
  assert.deepEqual(Object.keys(summary.wakeJobs[0]).sort(), [
    'id',
    'priority',
    'reason',
    'sourceEventId',
    'sourceEventType',
    'status',
    'targetAgent',
    'targetRole',
    'thread',
    'trigger',
  ])
})
