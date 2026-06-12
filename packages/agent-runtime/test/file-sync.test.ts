import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createFileSyncMetadata,
  createFileSyncScope,
  parseFileSyncJsonList,
  type FileSyncMaterializedEvent,
  type FileSyncWriteInput,
} from '../src/file-sync'
import { createInMemoryLinxSyncCheckpointStore, listLinxSyncCheckpoints } from '../src/sync'

test('copies file artifacts with caller-provided readers and writers', async () => {
  const writes: FileSyncWriteInput[] = []
  const events: FileSyncMaterializedEvent[] = []
  const results: unknown[] = []
  const scope = createFileSyncScope({
    source: 'local-runtime',
    target: 'pod',
    now: () => new Date('2026-05-21T00:00:00.000Z'),
    metadata: { pipeline: 'artifact' },
    onEvent(event, result) {
      events.push(event)
      results.push(result)
    },
  })

  const event = await scope.fileToFile({
    sourceFile: {
      local: '/tmp/session.jsonl',
      contentType: 'application/x-ndjson',
      etag: 'local-v1',
    },
    targetFile: {
      uri: 'https://pod.example/alice/sessions/session.jsonl',
    },
    read(ref) {
      assert.equal(ref.local, '/tmp/session.jsonl')
      return {
        content: 'one\n',
        contentType: ref.contentType,
        etag: 'local-v2',
        checksum: 'sha256-local',
      }
    },
    write(input) {
      writes.push(input)
      return {
        uri: input.target.uri,
        etag: 'pod-v1',
        checksum: 'sha256-pod',
        bytesWritten: 4,
      }
    },
  })

  assert.equal(writes.length, 1)
  assert.equal(writes[0].mode, 'overwrite')
  assert.equal(writes[0].content, 'one\n')
  assert.equal(writes[0].contentType, 'application/x-ndjson')
  assert.equal(event.kind, 'artifact.materialized')
  assert.equal(event.shape, 'file-to-file')
  assert.equal(event.writeMode, 'overwrite')
  assert.equal(event.bytesRead, 4)
  assert.equal(event.bytesWritten, 4)
  assert.equal(event.source.local, '/tmp/session.jsonl')
  assert.equal(event.source.etag, 'local-v2')
  assert.equal(event.target.uri, 'https://pod.example/alice/sessions/session.jsonl')
  assert.equal(event.target.etag, 'pod-v1')
  assert.deepEqual(event.metadata, { pipeline: 'artifact' })
  assert.deepEqual(events, [event])
  assert.equal(scope.getLastResult()?.metadata?.shape, 'file-to-file')
  assert.deepEqual((scope.getLastResult()?.metadata?.artifacts as Record<string, unknown> | undefined)?.source, {
    local: '/tmp/session.jsonl',
    contentType: 'application/x-ndjson',
    etag: 'local-v1',
  })
  assert.deepEqual((scope.getLastResult()?.metadata?.artifacts as Record<string, unknown> | undefined)?.target, {
    uri: 'https://pod.example/alice/sessions/session.jsonl',
  })
  assert.equal((results[0] as { metadata?: Record<string, unknown> }).metadata?.bytesWritten, 4)
})

test('requires append safety conditions when requested', async () => {
  const scope = createFileSyncScope({
    source: 'pod',
    target: 'local-cache',
  })

  await assert.rejects(
    () => scope.fileToFile({
      sourceFile: { uri: 'https://pod.example/alice/events.jsonl' },
      targetFile: { local: '/tmp/events.jsonl' },
      writeMode: 'append',
      requireAppendCondition: true,
      read() {
        return { content: '{"id":"e1"}\n' }
      },
      write() {
        throw new Error('append should not run')
      },
    }),
    /expected target etag or offset/,
  )

  let appendInput: FileSyncWriteInput | null = null
  const event = await scope.fileToFile({
    sourceFile: { uri: 'https://pod.example/alice/events.jsonl' },
    targetFile: { local: '/tmp/events.jsonl' },
    writeMode: 'append',
    requireAppendCondition: true,
    expectedTarget: { offset: 42 },
    read() {
      return { content: '{"id":"e1"}\n' }
    },
    write(input) {
      appendInput = input
      return { offset: 54, bytesWritten: 12 }
    },
  })

  assert.equal(appendInput?.mode, 'append')
  assert.deepEqual(appendInput?.expectedTarget, { offset: 42 })
  assert.equal(event.writeMode, 'append')
  assert.equal(event.target.offset, 54)
})

test('materializes JSON and JSONL files as neutral record events', async () => {
  const seen: FileSyncMaterializedEvent[] = []
  const scope = createFileSyncScope({
    source: 'pod',
    target: 'local-view',
    direction: 'core-to-local',
    now: () => new Date('2026-05-21T00:00:00.000Z'),
  })

  const event = await scope.fileToJsonList({
    sourceFile: {
      uri: 'https://pod.example/alice/export.jsonl',
      contentType: 'application/x-ndjson',
      etag: 'pod-v1',
    },
    metadata: { view: 'preview' },
    onEvent(item) {
      seen.push(item)
    },
    read() {
      return {
        content: '{"id":"one","value":1}\n{"id":"two","value":2}\n',
        contentType: 'application/x-ndjson',
        etag: 'pod-v2',
      }
    },
  })

  assert.equal(event.kind, 'records.materialized')
  assert.equal(event.shape, 'file-to-json-list')
  assert.equal(event.recordCount, 2)
  assert.deepEqual(event.records, [
    { id: 'one', value: 1 },
    { id: 'two', value: 2 },
  ])
  assert.equal(event.source.etag, 'pod-v2')
  assert.equal(event.bytesRead, 46)
  assert.deepEqual(event.metadata, { view: 'preview' })
  assert.deepEqual(seen, [event])
  assert.equal(scope.getLastResult()?.direction, 'core-to-local')
  assert.equal(scope.getLastResult()?.metadata?.recordCount, 2)
})

test('parses JSON arrays and single records without business semantics', () => {
  assert.deepEqual(parseFileSyncJsonList('[{"id":"a"},{"id":"b"}]'), [
    { id: 'a' },
    { id: 'b' },
  ])
  assert.deepEqual(parseFileSyncJsonList('{"id":"single"}'), [
    { id: 'single' },
  ])
  assert.throws(
    () => parseFileSyncJsonList('{"id":"single"}', { allowSingleRecord: false }),
    /Expected a JSON array/,
  )
  assert.throws(
    () => parseFileSyncJsonList('[1]'),
    /Expected JSON records to be objects/,
  )
})

test('keeps file sync checkpoints queryable by artifact refs', async () => {
  const checkpoint = createInMemoryLinxSyncCheckpointStore()
  const scope = createFileSyncScope({
    source: 'pod',
    target: 'local-cache',
    direction: 'core-to-local',
    checkpoint,
    now: () => new Date('2026-05-21T00:00:00.000Z'),
  })

  await scope.fileToJsonList({
    operationId: 'records.materialize:/tmp/export.json',
    sourceFile: {
      uri: 'https://pod.example/alice/export.json',
      local: 'export-cache',
      contentType: 'application/json',
    },
    read() {
      return { content: '[{"id":"one"}]' }
    },
  })

  const matches = await listLinxSyncCheckpoints(checkpoint, {
    direction: 'core-to-local',
    metadata: {
      shape: 'file-to-json-list',
      artifacts: {
        source: {
          uri: 'https://pod.example/alice/export.json',
          local: 'export-cache',
        },
      },
    },
  })

  assert.equal(matches.length, 1)
  assert.equal(matches[0].id, 'records.materialize:/tmp/export.json')
  assert.equal(matches[0].metadata?.shape, 'file-to-json-list')
  assert.equal(scope.getLastResult()?.metadata?.recordCount, 1)
})

test('builds compact file sync metadata', () => {
  assert.deepEqual(createFileSyncMetadata({
    action: 'file.copy',
    shape: 'file-to-file',
    source: { local: '/tmp/a.txt', contentType: 'text/plain' },
    target: { uri: 'https://pod.example/a.txt' },
    writeMode: 'overwrite',
    metadata: { ignored: undefined, kept: 'yes' },
  }), {
    action: 'file.copy',
    shape: 'file-to-file',
    artifacts: {
      source: {
        local: '/tmp/a.txt',
        contentType: 'text/plain',
      },
      target: {
        uri: 'https://pod.example/a.txt',
      },
    },
    contentType: 'text/plain',
    writeMode: 'overwrite',
    kept: 'yes',
  })
})
