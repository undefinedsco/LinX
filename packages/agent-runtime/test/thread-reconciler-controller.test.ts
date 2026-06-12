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

test('thread reconciler controller emits Inbox notification events separately from claimed Secretary wake jobs', async () => {
  const handled: string[] = []
  const notifications: string[] = []
  const result = await runThreadReconcilerCycle({
    policy: {
      kind: 'symphony',
      secretaryAgent: '__secretary__',
    },
    handleWakeJob: ({ job, decisionSummary }) => {
      handled.push(`${decisionSummary.eventType}:${job.targetRole}:${job.targetAgent}`)
      return { checkedInbox: true }
    },
    onNotificationEvent: (event, decision) => {
      notifications.push(`${decision.eventType}:${event.audience}:${event.channel}:${event.sourceResource}:${event.requestKind}`)
    },
    event: {
      type: 'inbox.notification.created',
      thread: 'thread:main',
      chat: 'chat:main',
      resource: 'https://pod.example/.data/approvals/2026/05/28.ttl#approval-1',
      actor: { role: 'runtime', id: 'pod-subscription' },
      data: {
        status: 'pending',
        requestKind: 'approval.required',
        sourceThread: 'thread:worker',
      },
    },
    dispatchOptions: {
      randomId: 'inbox-notice-1',
      client: {
        id: 'client:cli',
        agentCapable: true,
        secretaryRuntimeAvailable: true,
        focusState: 'focused',
        controlResourceClaim: {
          status: 'claimed',
          controlResource: 'https://pod.example/.data/approvals/2026/05/28.ttl#approval-1',
          leaseOwner: 'client:cli',
          leaseExpiresAt: '2026-05-29T00:05:00.000Z',
        },
      },
    },
    now: fixedNow(),
  })

  assert.deepEqual(notifications, ['inbox.notification.created:user:inbox:https://pod.example/.data/approvals/2026/05/28.ttl#approval-1:approval.required'])
  assert.deepEqual(handled, ['inbox.notification.created:secretary:__secretary__'])
  assert.equal(result.summary.notificationEvents?.[0]?.audience, 'user')
  assert.equal(result.summary.notificationEvents?.[0]?.channel, 'inbox')
  assert.equal(result.summary.wakeJobs[0].targetRole, 'secretary')
  assert.deepEqual(result.schedulerSummary.completed[0].result, { checkedInbox: true })
})

test('thread reconciler controller keeps unclaimed Inbox notifications display-only', async () => {
  const handled: string[] = []
  const notifications: string[] = []
  const result = await runThreadReconcilerCycle({
    policy: 'symphony',
    handleWakeJob: ({ job }) => {
      handled.push(job.id)
    },
    onNotificationEvent: (event) => {
      notifications.push(`${event.channel}:${event.sourceResource}`)
    },
    event: {
      type: 'inbox.notification.created',
      thread: 'thread:main',
      resource: 'https://pod.example/.data/approvals/2026/05/28.ttl#approval-unclaimed',
      actor: { role: 'runtime', id: 'pod-subscription' },
      data: { status: 'pending', requestKind: 'approval.required' },
    },
    dispatchOptions: { randomId: 'inbox-display-only' },
    now: fixedNow(),
  })

  assert.deepEqual(notifications, ['inbox:https://pod.example/.data/approvals/2026/05/28.ttl#approval-unclaimed'])
  assert.deepEqual(handled, [])
  assert.equal(result.summary.wakeJobs.length, 0)
  assert.match(result.summary.skippedReason ?? '', /display-only/)
  assert.equal(result.schedulerSummary.completed.length, 0)
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
