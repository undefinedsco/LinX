import test from 'node:test'
import assert from 'node:assert/strict'
import type { WakeJob } from '../src/reconciler'
import {
  createWakeJobScheduler,
  defaultWakeJobDedupeKey,
  summarizeWakeJobExecutionRecord,
  summarizeWakeJobSchedulerSnapshot,
} from '../src/wake-scheduler'

test('wake scheduler dedupes jobs with the same semantic key', async () => {
  const handled: string[] = []
  const scheduler = createWakeJobScheduler({
    handler: (job) => {
      handled.push(job.id)
    },
    now: fixedNow(),
  })
  const job = makeWakeJob({ id: 'wake-1', sourceEventId: 'event-1' })
  const duplicate = makeWakeJob({ id: 'wake-2', sourceEventId: 'event-1' })

  const [first, second] = scheduler.submit([job, duplicate])
  scheduler.start()
  await scheduler.drain()

  assert.equal(first.key, second.key)
  assert.equal(handled.length, 1)
  assert.equal(scheduler.snapshot().all.length, 1)
  assert.equal(scheduler.snapshot().completed.length, 1)
})

test('wake scheduler runs higher priority jobs before lower priority jobs', async () => {
  const order: string[] = []
  const scheduler = createWakeJobScheduler({
    handler: (job) => {
      order.push(job.id)
    },
    now: fixedNow(),
  })

  scheduler.submit([
    makeWakeJob({ id: 'low', priority: 'low', sourceEventId: 'event-low' }),
    makeWakeJob({ id: 'normal', priority: 'normal', sourceEventId: 'event-normal' }),
    makeWakeJob({ id: 'high', priority: 'high', sourceEventId: 'event-high' }),
    makeWakeJob({ id: 'normal-2', priority: 'normal', sourceEventId: 'event-normal-2' }),
  ])
  scheduler.start()
  await scheduler.drain()

  assert.deepEqual(order, ['high', 'normal', 'normal-2', 'low'])
})

test('wake scheduler respects concurrency limit', async () => {
  let active = 0
  let maxActive = 0
  const scheduler = createWakeJobScheduler({
    concurrency: 2,
    handler: async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await wait(10)
      active -= 1
    },
    now: fixedNow(),
  })

  scheduler.submit([
    makeWakeJob({ id: 'job-1', sourceEventId: 'event-1' }),
    makeWakeJob({ id: 'job-2', sourceEventId: 'event-2' }),
    makeWakeJob({ id: 'job-3', sourceEventId: 'event-3' }),
    makeWakeJob({ id: 'job-4', sourceEventId: 'event-4' }),
  ])
  scheduler.start()
  await scheduler.drain()

  assert.equal(maxActive, 2)
  assert.equal(scheduler.snapshot().completed.length, 4)
})

test('wake scheduler calls lifecycle hooks in execution order', async () => {
  const events: string[] = []
  const scheduler = createWakeJobScheduler({
    handler: (job) => `handled:${job.id}`,
    onQueued: (record) => events.push(`queued:${record.job.id}:${record.status}`),
    onStarted: (record) => events.push(`started:${record.job.id}:${record.status}`),
    onCompleted: (record) => events.push(`completed:${record.job.id}:${record.status}:${String(record.result)}`),
    onFailed: (record) => events.push(`failed:${record.job.id}:${record.status}`),
    now: fixedNow(),
  })

  scheduler.submit(makeWakeJob({ id: 'job-hooks', sourceEventId: 'event-hooks' }))
  scheduler.start()
  await scheduler.drain()

  assert.deepEqual(events, [
    'queued:job-hooks:queued',
    'started:job-hooks:running',
    'completed:job-hooks:completed:handled:job-hooks',
  ])
})

test('wake scheduler marks handler failures without blocking later jobs', async () => {
  const handled: string[] = []
  const scheduler = createWakeJobScheduler({
    handler: (job) => {
      handled.push(job.id)
      if (job.id === 'bad') {
        throw new Error('boom')
      }
      return `ok:${job.id}`
    },
    now: fixedNow(),
  })

  scheduler.submit([
    makeWakeJob({ id: 'bad', sourceEventId: 'event-bad' }),
    makeWakeJob({ id: 'good', sourceEventId: 'event-good' }),
  ])
  scheduler.start()
  await scheduler.drain()

  const snapshot = scheduler.snapshot()
  assert.deepEqual(handled, ['bad', 'good'])
  assert.equal(snapshot.failed.length, 1)
  assert.equal(snapshot.failed[0].error, 'boom')
  assert.equal(snapshot.completed.length, 1)
  assert.equal(snapshot.completed[0].result, 'ok:good')
})

test('wake scheduler drain waits for active jobs', async () => {
  let release: () => void = () => undefined
  let drained = false
  const blocker = new Promise<void>((resolve) => {
    release = resolve
  })
  const scheduler = createWakeJobScheduler({
    handler: async () => {
      await blocker
    },
    now: fixedNow(),
  })

  scheduler.submit(makeWakeJob({ id: 'blocked', sourceEventId: 'event-blocked' }))
  scheduler.start()
  const drainedPromise = scheduler.drain().then(() => {
    drained = true
  })
  await wait(0)

  assert.equal(drained, false)
  release()
  await drainedPromise
  assert.equal(drained, true)
  assert.equal(scheduler.snapshot().completed.length, 1)
})

test('default wake job dedupe key includes thread, target, source event, and trigger', () => {
  assert.equal(
    defaultWakeJobDedupeKey(makeWakeJob({
      chat: 'chat:1',
      thread: 'thread:1',
      targetAgent: 'secretary',
      targetRole: 'secretary',
      trigger: 'approval.required',
      sourceEventId: 'approval:1',
    })),
    'thread:1|chat:1|secretary|secretary|approval:1|approval.required',
  )
})

test('wake scheduler exposes reusable metadata summaries for controller callers', async () => {
  const scheduler = createWakeJobScheduler({
    handler: (job) => `ok:${job.id}`,
    now: fixedNow(),
  })

  scheduler.submit(makeWakeJob({ id: 'summary', sourceEventId: 'event-summary' }))
  scheduler.start()
  await scheduler.drain()

  const snapshot = scheduler.snapshot()
  assert.deepEqual(summarizeWakeJobExecutionRecord(snapshot.completed[0]), {
    key: 'thread:default||__secretary__|secretary|event-summary|message.appended',
    status: 'completed',
    targetAgent: '__secretary__',
    targetRole: 'secretary',
    trigger: 'message.appended',
    priority: 'normal',
    queuedAt: '2026-05-29T00:00:00.000Z',
    startedAt: '2026-05-29T00:00:00.000Z',
    completedAt: '2026-05-29T00:00:00.000Z',
    error: undefined,
    result: 'ok:summary',
  })
  assert.equal(summarizeWakeJobSchedulerSnapshot(snapshot).completed.length, 1)
})

function makeWakeJob(input: Partial<WakeJob> = {}): WakeJob {
  return {
    id: input.id ?? 'wake',
    thread: input.thread ?? 'thread:default',
    ...(input.chat ? { chat: input.chat } : {}),
    targetAgent: input.targetAgent ?? '__secretary__',
    targetRole: input.targetRole ?? 'secretary',
    trigger: input.trigger ?? 'message.appended',
    priority: input.priority ?? 'normal',
    status: 'queued',
    reason: input.reason ?? 'test wake',
    ...(input.sourceEventId ? { sourceEventId: input.sourceEventId } : {}),
    sourceEventType: input.sourceEventType ?? input.trigger ?? 'message.appended',
    createdAt: input.createdAt ?? '2026-05-29T00:00:00.000Z',
  }
}

function fixedNow(): () => Date {
  return () => new Date('2026-05-29T00:00:00.000Z')
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
