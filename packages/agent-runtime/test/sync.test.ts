import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LinxSyncOperationError,
  createInMemoryLinxSyncCheckpointStore,
  createLinxPodSyncMetadata,
  createLinxPodSyncQueue,
  createLinxPodSyncScope,
  createLinxSyncQueue,
  deleteLinxSyncCheckpoint,
  isPendingLinxSyncCheckpoint,
  listLinxSyncCheckpoints,
  readLinxSyncCheckpoint,
  runLinxSyncOperations,
  runLinxSyncTask,
  type LinxSyncOperation,
} from '../src/sync'

test('runs sync operations in order with shared default context', async () => {
  const calls: string[] = []
  const result = await runLinxSyncOperations([
    {
      id: 'prepare',
      kind: 'prepare',
      apply(context) {
        calls.push(`${context.source}->${context.target}:${context.plane}:${context.authority}:prepare`)
      },
    },
    {
      id: 'message',
      kind: 'upsert',
      apply(context) {
        calls.push(`${context.source}->${context.target}:${context.plane}:${context.authority}:message`)
      },
    },
  ], {
    source: 'local-archive',
    target: 'pod',
  })

  assert.deepEqual(calls, [
    'local-archive->pod:projection:core:prepare',
    'local-archive->pod:projection:core:message',
  ])
  assert.equal(result.attempted, 2)
  assert.equal(result.applied, 2)
  assert.equal(result.skipped, 0)
  assert.equal(result.failed, 0)
  assert.equal(result.status, 'completed')
  assert.match(result.startedAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.match(result.completedAt, /^\d{4}-\d{2}-\d{2}T/)
})

test('supports per-operation context and skip decisions', async () => {
  const calls: string[] = []
  const operations: LinxSyncOperation[] = [
    {
      id: 'runtime-log',
      plane: 'runtime-log',
      authority: 'local-runtime',
      apply(context) {
        calls.push(`${context.plane}:${context.authority}`)
      },
    },
    {
      id: 'skip-empty',
      shouldRun: () => false,
      apply() {
        throw new Error('should not run')
      },
    },
  ]

  const result = await runLinxSyncOperations(operations, {
    source: 'pi',
    target: 'pod',
    direction: 'local-to-core',
  })

  assert.deepEqual(calls, ['runtime-log:local-runtime'])
  assert.equal(result.attempted, 2)
  assert.equal(result.applied, 1)
  assert.equal(result.skipped, 1)
})

test('can collect operation failures without aborting the remaining projection', async () => {
  const calls: string[] = []
  const result = await runLinxSyncOperations([
    {
      id: 'bad',
      apply() {
        throw new Error('boom')
      },
    },
    {
      id: 'after',
      apply() {
        calls.push('after')
      },
    },
  ], {
    source: 'local',
    target: 'pod',
    continueOnError: true,
  })

  assert.deepEqual(calls, ['after'])
  assert.equal(result.applied, 1)
  assert.equal(result.failed, 1)
  assert.equal(result.status, 'partial')
  assert.equal(result.failures[0]?.operationId, 'bad')
  assert.match(result.failures[0]?.message ?? '', /boom/)
})

test('throws a typed operation error by default', async () => {
  await assert.rejects(
    () => runLinxSyncOperations([
      {
        id: 'bad',
        kind: 'upsert',
        apply() {
          throw new Error('boom')
        },
      },
    ], {
      source: 'local',
      target: 'pod',
    }),
    (error) => {
      assert.ok(error instanceof LinxSyncOperationError)
      assert.equal(error.operationId, 'bad')
      assert.equal(error.operationKind, 'upsert')
      return true
    },
  )
})

test('runs a value-returning sync task and reports the run result', async () => {
  const results: unknown[] = []
  const run = await runLinxSyncTask({
    operationId: 'message.write',
    kind: 'upsert',
    description: 'write message',
    source: 'local-store',
    target: 'pod',
    plane: 'projection',
    now: () => new Date('2026-05-21T00:00:00.000Z'),
    metadata: { messageId: 'm1' },
    onResult(result) {
      results.push(result)
    },
    task(context) {
      return {
        id: context.metadata?.messageId,
        plane: context.plane,
      }
    },
  })

  assert.deepEqual(run.value, {
    id: 'm1',
    plane: 'projection',
  })
  assert.equal(run.result.status, 'completed')
  assert.equal(run.result.applied, 1)
  assert.deepEqual(results, [run.result])
})

test('can derive sync task metadata from the returned value', async () => {
  const run = await runLinxSyncTask({
    operationId: 'contact.create',
    kind: 'insert',
    source: 'app-contact-ops',
    target: 'pod',
    metadata(value) {
      return {
        action: 'contact.create',
        contactId: value.contactId,
        chatId: value.chatId,
      }
    },
    task() {
      return {
        contactId: 'contact-1',
        chatId: 'chat-1',
      }
    },
  })

  assert.deepEqual(run.result.metadata, {
    action: 'contact.create',
    contactId: 'contact-1',
    chatId: 'chat-1',
  })
})

test('creates Pod sync metadata with resource bindings and local relation values', () => {
  assert.deepEqual(createLinxPodSyncMetadata({
    action: 'message.create',
    resourceBindings: {
      chat: {
        uri: 'https://pod.example/.data/chat/chat-1/index.ttl#this',
        local: 'chat-1',
      },
      message: {
        uri: 'https://pod.example/.data/chat/chat-1/2026/05/21/messages.ttl#m1',
        local: 'm1',
      },
    },
    metadata: {
      role: 'user',
      skipped: undefined,
      empty: null,
    },
  }), {
    action: 'message.create',
    resourceBindings: {
      chat: {
        uri: 'https://pod.example/.data/chat/chat-1/index.ttl#this',
        local: 'chat-1',
      },
      message: {
        uri: 'https://pod.example/.data/chat/chat-1/2026/05/21/messages.ttl#m1',
        local: 'm1',
      },
    },
    role: 'user',
  })
})

test('runs a Pod sync scope with derived resource bindings and collected results', async () => {
  const scope = createLinxPodSyncScope({
    source: 'app-chat-ops',
    now: () => new Date('2026-05-21T00:00:00.000Z'),
  })

  const value = await scope.run({
    action: 'thread.create',
    kind: 'insert',
    subject: 'thread-1',
    resourceBindings: (row) => ({
      chat: { uri: row.chatUri, local: row.chatId },
      thread: { uri: row.threadUri, local: row.threadId },
    }),
    metadata: { title: 'Main' },
    task() {
      return {
        chatId: 'chat-1',
        threadId: 'thread-1',
        chatUri: 'https://pod.example/.data/chat/chat-1/index.ttl#this',
        threadUri: 'https://pod.example/.data/chat/chat-1/index.ttl#thread-1',
      }
    },
  })

  assert.equal(value.threadId, 'thread-1')
  assert.equal(scope.getResults().length, 1)
  assert.equal(scope.getLastResult()?.failed, 0)
  assert.equal(scope.getLastResult()?.failures.length, 0)
  assert.deepEqual(scope.getLastResult()?.metadata, {
    action: 'thread.create',
    resourceBindings: {
      chat: {
        uri: 'https://pod.example/.data/chat/chat-1/index.ttl#this',
        local: 'chat-1',
      },
      thread: {
        uri: 'https://pod.example/.data/chat/chat-1/index.ttl#thread-1',
        local: 'thread-1',
      },
    },
    title: 'Main',
  })
  assert.equal(scope.getLastResult()?.source, 'app-chat-ops')
  assert.equal(scope.getLastResult()?.target, 'pod')
  assert.equal(scope.getLastResult()?.direction, 'local-to-core')
  assert.equal(scope.getLastResult()?.plane, 'projection')
  assert.equal(scope.getLastResult()?.authority, 'core')
})

test('runs Pod sync batch operations with shared metadata and checkpoints', async () => {
  const checkpoints: unknown[] = []
  const scope = createLinxPodSyncScope({
    source: 'auto-mode-archive',
    metadata: { backend: 'codex' },
    checkpoint: {
      writeCheckpoint(value) {
        checkpoints.push(value)
      },
    },
    now: () => new Date('2026-05-21T00:00:00.000Z'),
  })
  const applied: string[] = []

  const result = await scope.runOperations({
    action: 'conversation.project',
    checkpointId: 'conversation-1',
    resourceBindings: {
      session: {
        uri: 'https://pod.example/.data/sessions/2026/05/21/session-1.ttl',
        local: 'session-1',
      },
      chat: {
        uri: 'https://pod.example/.data/chat/chat-1/index.ttl#this',
        local: 'chat-1',
      },
    },
    metadata: {
      backend: 'codex',
    },
    operations: [
      {
        id: 'prepare',
        kind: 'prepare',
        apply() {
          applied.push('prepare')
        },
      },
      {
        id: 'message',
        kind: 'upsert',
        apply() {
          applied.push('message')
        },
      },
    ],
  })

  assert.deepEqual(applied, ['prepare', 'message'])
  assert.equal(result.status, 'completed')
  assert.equal(scope.getLastResult(), result)
  assert.deepEqual(result.metadata, {
    action: 'conversation.project',
    resourceBindings: {
      session: {
        uri: 'https://pod.example/.data/sessions/2026/05/21/session-1.ttl',
        local: 'session-1',
      },
      chat: {
        uri: 'https://pod.example/.data/chat/chat-1/index.ttl#this',
        local: 'chat-1',
      },
    },
    backend: 'codex',
  })
  assert.equal((checkpoints[0] as { id?: string }).id, 'conversation-1')
})

test('preserves original sync task failures and still reports the failed result', async () => {
  const results: unknown[] = []
  await assert.rejects(
    () => runLinxSyncTask({
      operationId: 'bad-task',
      source: 'local-store',
      target: 'pod',
      onResult(result) {
        results.push(result)
      },
      task() {
        throw new Error('task failed')
      },
    }),
    (error) => {
      assert.ok(error instanceof Error)
      assert.equal(error.name, 'Error')
      assert.equal(error.message, 'task failed')
      return true
    },
  )
  assert.equal(results.length, 1)
  const result = results[0] as {
    source: string
    target: string
    status: string
    attempted: number
    applied: number
    failed: number
    failures: Array<{ operationId: string; message: string; cause?: unknown }>
  }
  assert.equal(result.source, 'local-store')
  assert.equal(result.target, 'pod')
  assert.equal(result.status, 'failed')
  assert.equal(result.attempted, 1)
  assert.equal(result.applied, 0)
  assert.equal(result.failed, 1)
  assert.equal(result.failures[0]?.operationId, 'bad-task')
  assert.match(result.failures[0]?.message ?? '', /task failed/)
  assert.ok(result.failures[0]?.cause instanceof Error)
  assert.equal((result.failures[0]?.cause as Error).message, 'task failed')
})

test('writes sync checkpoints for successful and failed runs', async () => {
  const checkpoints: unknown[] = []
  const checkpoint = {
    writeCheckpoint(value: unknown) {
      checkpoints.push(value)
    },
  }

  const completed = await runLinxSyncOperations([
    {
      id: 'ok',
      apply() {},
    },
  ], {
    source: 'local',
    target: 'pod',
    checkpoint,
    metadata: { resourceBindings: { session: { local: 's1' } } },
  })

  assert.equal(completed.status, 'completed')
  assert.deepEqual(checkpoints[0], {
    id: 'local:pod:projection',
    source: 'local',
    target: 'pod',
    direction: 'local-to-core',
    plane: 'projection',
    authority: 'core',
    status: 'completed',
    attempted: 1,
    applied: 1,
    skipped: 0,
    failed: 0,
    failures: [],
    startedAt: completed.startedAt,
    completedAt: completed.completedAt,
    metadata: { resourceBindings: { session: { local: 's1' } } },
  })

  await assert.rejects(() => runLinxSyncOperations([
    {
      id: 'bad',
      apply() {
        throw new Error('boom')
      },
    },
  ], {
    source: 'local',
    target: 'pod',
    checkpoint,
  }))

  assert.equal((checkpoints[1] as { status?: string }).status, 'failed')
  assert.equal((checkpoints[1] as { failed?: number }).failed, 1)
})

test('serializes streaming sync tasks through a queue', async () => {
  const calls: string[] = []
  const checkpoints: unknown[] = []
  const results: unknown[] = []
  const queue = createLinxSyncQueue({
    source: 'runtime',
    target: 'pod',
    checkpoint: {
      writeCheckpoint(value) {
        checkpoints.push(value)
      },
    },
    onResult(result) {
      results.push(result)
    },
  })

  void queue.enqueue({
    id: 'first',
    async run() {
      calls.push('first:start')
      await Promise.resolve()
      calls.push('first:end')
    },
  })
  void queue.enqueue({
    id: 'second',
    run() {
      calls.push('second')
    },
  })

  await queue.flush()
  assert.deepEqual(calls, ['first:start', 'first:end', 'second'])
  assert.equal(queue.getResults().length, 2)
  assert.equal(results.length, 2)
  assert.deepEqual(checkpoints.map((item) => (item as { id: string }).id), ['first', 'second'])
})

test('supports per-task queue sync plane overrides', async () => {
  const seen: string[] = []
  const queue = createLinxSyncQueue({
    source: 'runtime',
    target: 'pod',
    plane: 'projection',
  })

  void queue.enqueue({
    id: 'control',
    plane: 'control-plane',
    authority: 'core',
    run(context) {
      seen.push(`${context.source}:${context.target}:${context.plane}:${context.authority}`)
    },
  })

  await queue.flush()
  assert.deepEqual(seen, ['runtime:pod:control-plane:core'])
  assert.equal(queue.getResults()[0].plane, 'control-plane')
})

test('queues Pod sync tasks with local resource bindings and resolves URI bindings during execution', async () => {
  const checkpoints: unknown[] = []
  const results: unknown[] = []
  const queue = createLinxPodSyncQueue({
    source: 'pi-runtime',
    target: 'pod',
    metadata: { cwd: '/repo' },
    checkpoint: {
      writeCheckpoint(value) {
        checkpoints.push(value)
      },
    },
    onResult(result, task) {
      results.push({ result, action: task.action })
    },
  })

  void queue.enqueue({
    id: 'message-task',
    action: 'message.project',
    description: 'message_end',
    resourceBindings: {
      session: { local: 'session-1' },
      chat: { local: 'chat-1' },
      thread: { local: 'thread-1' },
    },
    resolveResourceBindings() {
      return {
        session: { uri: 'https://pod.example/.data/sessions/session-1.ttl' },
        chat: { uri: 'https://pod.example/.data/chat/chat-1/index.ttl#this' },
        thread: { uri: 'https://pod.example/.data/chat/chat-1/index.ttl#thread-1' },
      }
    },
    metadata: { role: 'assistant' },
    run(context) {
      assert.deepEqual((context.metadata?.resourceBindings as Record<string, unknown> | undefined)?.session, {
        uri: 'https://pod.example/.data/sessions/session-1.ttl',
        local: 'session-1',
      })
    },
  })

  await queue.flush()

  assert.deepEqual(queue.getResults()[0].metadata, {
    action: 'message.project',
    resourceBindings: {
      session: {
        uri: 'https://pod.example/.data/sessions/session-1.ttl',
        local: 'session-1',
      },
      chat: {
        uri: 'https://pod.example/.data/chat/chat-1/index.ttl#this',
        local: 'chat-1',
      },
      thread: {
        uri: 'https://pod.example/.data/chat/chat-1/index.ttl#thread-1',
        local: 'thread-1',
      },
    },
    cwd: '/repo',
    role: 'assistant',
    syncTask: 'message-task',
    syncTaskDescription: 'message_end',
  })
  assert.deepEqual((checkpoints[0] as { metadata?: unknown }).metadata, queue.getResults()[0].metadata)
  assert.deepEqual((results[0] as { action?: string }).action, 'message.project')
})

test('keeps queued Pod sync checkpoints queryable by local resource bindings when URI resolution fails', async () => {
  const store = createInMemoryLinxSyncCheckpointStore()
  const queue = createLinxPodSyncQueue({
    source: 'local-runtime',
    target: 'pod',
    checkpoint: store,
  })

  void queue.enqueue({
    id: 'failed-task',
    action: 'session.project',
    resourceBindings: {
      session: { local: 'session-1' },
    },
    run() {
      throw new Error('pod unavailable')
    },
  })

  await queue.flush()

  const pending = await listLinxSyncCheckpoints(store, {
    status: 'failed',
    metadata: { resourceBindings: { session: { local: 'session-1' } } },
  })
  assert.deepEqual(pending.map((item) => item.id), ['failed-task'])
  assert.deepEqual(pending[0].metadata, {
    action: 'session.project',
    resourceBindings: {
      session: {
        local: 'session-1',
      },
    },
    syncTask: 'failed-task',
    syncTaskDescription: 'session.project',
  })
})

test('provides queryable checkpoint stores without binding to storage', async () => {
  const store = createInMemoryLinxSyncCheckpointStore()

  const completed = await runLinxSyncOperations([
    {
      id: 'ok',
      apply() {},
    },
  ], {
    source: 'archive',
    target: 'pod',
    checkpoint: store,
    checkpointId: 'archive-ok',
    metadata: { resourceBindings: { session: { local: 's1' } } },
  })

  await runLinxSyncOperations([
    {
      id: 'bad',
      apply() {
        throw new Error('pod unavailable')
      },
    },
  ], {
    source: 'runtime',
    target: 'pod',
    checkpoint: store,
    checkpointId: 'runtime-failed',
    metadata: { resourceBindings: { session: { local: 's2' } } },
    continueOnError: true,
  })

  assert.equal((await readLinxSyncCheckpoint(store, 'archive-ok'))?.status, completed.status)
  assert.deepEqual(
    (await listLinxSyncCheckpoints(store, { target: 'pod', metadata: { resourceBindings: { session: { local: 's2' } } } })).map((item) => item.id),
    ['runtime-failed'],
  )

  const pending = await listLinxSyncCheckpoints(store, { status: ['failed', 'partial'] })
  assert.deepEqual(pending.map((item) => item.id), ['runtime-failed'])
  assert.equal(isPendingLinxSyncCheckpoint(pending[0]), true)

  await deleteLinxSyncCheckpoint(store, 'runtime-failed')
  assert.deepEqual(await listLinxSyncCheckpoints(store, { status: 'failed' }), [])
})

test('keeps checkpoint metadata source-scoped when multiple apps share a store', async () => {
  const store = createInMemoryLinxSyncCheckpointStore()

  await runLinxSyncOperations([
    {
      id: 'app-a',
      apply() {},
    },
  ], {
    source: 'app-a',
    target: 'pod',
    checkpoint: store,
    checkpointId: 'shared-checkpoint-a',
    metadata: { resourceBindings: { session: { local: 'session-1' } } },
  })

  await runLinxSyncOperations([
    {
      id: 'app-b',
      apply() {},
    },
  ], {
    source: 'app-b',
    target: 'pod',
    checkpoint: store,
    checkpointId: 'shared-checkpoint-b',
    metadata: { resourceBindings: { session: { local: 'session-1' } } },
  })

  assert.deepEqual(
    (await listLinxSyncCheckpoints(store, {
      source: 'app-a',
      metadata: { resourceBindings: { session: { local: 'session-1' } } },
    })).map((item) => item.id),
    ['shared-checkpoint-a'],
  )
  assert.deepEqual(
    (await listLinxSyncCheckpoints(store, {
      source: 'app-b',
      metadata: { resourceBindings: { session: { local: 'session-1' } } },
    })).map((item) => item.id),
    ['shared-checkpoint-b'],
  )
})
