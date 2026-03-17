import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadWatchModule } from './watch-test-bundle.mjs'

test('watch archive creates, updates, and lists sessions', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-'))
  process.env.LINX_WATCH_HOME = root

  t.after(() => {
    delete process.env.LINX_WATCH_HOME
    rmSync(root, { recursive: true, force: true })
  })

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  const {
    appendWatchEvent,
    createWatchSession,
    finishWatchSession,
    listWatchSessions,
    loadWatchSession,
  } = module

  const record = createWatchSession(
    {
      backend: 'codex',
      mode: 'smart',
      cwd: '/tmp/demo',
      prompt: 'fix tests',
      passthroughArgs: [],
    },
    {
      command: 'codex',
      args: ['exec', '--json', 'fix tests'],
    },
  )

  appendWatchEvent(record, {
    timestamp: '2026-03-14T00:00:00.000Z',
    stream: 'stdout',
    line: '{"type":"assistant.delta","text":"hello"}',
    events: [{ type: 'assistant.delta', text: 'hello' }],
  })

  const finished = finishWatchSession(record, {
    status: 'completed',
    exitCode: 0,
    signal: null,
  })

  assert.equal(finished.status, 'completed')
  assert.equal(loadWatchSession(record.id)?.status, 'completed')

  const listed = listWatchSessions()
  assert.equal(listed.length, 1)
  assert.equal(listed[0].id, record.id)

  const eventsFile = readFileSync(record.eventsFile, 'utf-8').trim().split('\n')
  assert.equal(eventsFile.length, 1)
  assert.match(eventsFile[0], /assistant\.delta/)
})

test('watch archive ignores legacy LINX_WORKER_HOME override', async (t) => {
  const originalHome = process.env.HOME
  const tempHome = mkdtempSync(join(tmpdir(), 'linx-watch-home-'))
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-legacy-'))
  process.env.HOME = tempHome
  process.env.LINX_WORKER_HOME = root

  t.after(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    delete process.env.LINX_WORKER_HOME
    rmSync(tempHome, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  })

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  const { createWatchSession } = module
  const record = createWatchSession(
    {
      backend: 'claude',
      mode: 'smart',
      cwd: '/tmp/demo',
      prompt: 'legacy path',
      passthroughArgs: [],
    },
    {
      command: 'claude',
      args: ['--print', 'legacy path'],
    },
  )

  assert.equal(record.archiveDir.startsWith(root), false)
  assert.match(
    record.archiveDir,
    new RegExp(`^${join(tempHome, '.linx', 'watch').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  )
})
