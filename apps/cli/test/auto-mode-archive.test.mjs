import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('auto-mode archive creates, updates, and lists sessions', async (t) => {
  const originalLinxHome = process.env.LINX_HOME
  const linxHome = mkdtempSync(join(tmpdir(), 'linx-auto-mode-'))
  const root = join(linxHome, 'auto-mode')
  process.env.LINX_HOME = linxHome

  t.after(() => {
    if (originalLinxHome === undefined) {
      delete process.env.LINX_HOME
    } else {
      process.env.LINX_HOME = originalLinxHome
    }
    rmSync(linxHome, { recursive: true, force: true })
  })

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const {
    appendAutoModeEvent,
    createAutoModeSession,
    finishAutoModeSession,
    loadAutoModeEvents,
    loadAutoModeSyncCheckpoints,
    listAutoModeSessionsWithPendingSync,
    listAutoModeSessions,
    loadAutoModeSession,
    writeAutoModeSyncCheckpoint,
  } = module

  const record = createAutoModeSession(
    {
      backend: 'codex',
autoEnabled: true,
mode: 'auto',
      cwd: '/tmp/demo',
      prompt: 'fix tests',
      passthroughArgs: [],
    },
    {
      command: 'codex',
      args: ['exec', '--json', 'fix tests'],
    },
  )

  appendAutoModeEvent(record, {
    timestamp: '2026-03-14T00:00:00.000Z',
    stream: 'stdout',
    line: '{"type":"assistant.delta","text":"hello"}',
    events: [{ type: 'assistant.delta', text: 'hello' }],
  })

  const finished = finishAutoModeSession(record, {
    status: 'completed',
    exitCode: 0,
    signal: null,
  })

  assert.equal(finished.status, 'completed')
  assert.equal(finished.approvalSource, 'hybrid')
  assert.match(record.id, /^auto_/)
  assert.match(record.archiveDir, new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  assert.equal(loadAutoModeSession(record.id)?.status, 'completed')

  const listed = listAutoModeSessions()
  assert.equal(listed.length, 1)
  assert.equal(listed[0].id, record.id)
  assert.equal(loadAutoModeEvents(record.id).length, 1)
  assert.deepEqual(listAutoModeSessionsWithPendingSync().map((item) => item.id), [record.id])

  writeAutoModeSyncCheckpoint(record, {
    id: 'auto-mode-archive:pod:projection',
    source: 'auto-mode-archive',
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
    startedAt: '2026-03-14T00:00:01.000Z',
    completedAt: '2026-03-14T00:00:02.000Z',
    metadata: { sessionId: record.id },
  })
  assert.equal(loadAutoModeSyncCheckpoints(record.id)['auto-mode-archive:pod:projection'].status, 'completed')
  assert.deepEqual(listAutoModeSessionsWithPendingSync(), [])

  const eventsFile = readFileSync(record.eventsFile, 'utf-8').trim().split('\n')
  assert.equal(eventsFile.length, 1)
  assert.match(eventsFile[0], /assistant\.delta/)
})

test('auto-mode archive defaults under HOME-derived SOLID_HOME when LINX_HOME is unset', async (t) => {
  const originalHome = process.env.HOME
  const originalSolidHome = process.env.SOLID_HOME
  const originalLinxHome = process.env.LINX_HOME
  const tempHome = mkdtempSync(join(tmpdir(), 'linx-auto-mode-home-'))
  process.env.HOME = tempHome
  delete process.env.SOLID_HOME
  delete process.env.LINX_HOME

  t.after(() => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    if (originalSolidHome === undefined) {
      delete process.env.SOLID_HOME
    } else {
      process.env.SOLID_HOME = originalSolidHome
    }
    if (originalLinxHome === undefined) {
      delete process.env.LINX_HOME
    } else {
      process.env.LINX_HOME = originalLinxHome
    }
    rmSync(tempHome, { recursive: true, force: true })
  })

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const { createAutoModeSession } = module
  const record = createAutoModeSession(
    {
      backend: 'claude',
autoEnabled: true,
mode: 'auto',
      cwd: '/tmp/demo',
      prompt: 'legacy path',
      passthroughArgs: [],
    },
    {
      command: 'claude',
      args: ['--print', 'default path'],
    },
  )

  assert.match(
    record.archiveDir,
    new RegExp(`^${join(tempHome, '.solid', 'apps', 'linx', 'auto-mode').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  )
})
