import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWatchModule } from './watch-test-bundle.mjs'

let displayModule
let cleanup

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

function createRecord(overrides = {}) {
  return {
    id: 'watch_2026-03-17T00-00-00-000Z_deadbeef',
    backend: 'codex',
    runtime: 'local',
    mode: 'smart',
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    prompt: 'hello',
    passthroughArgs: [],
    credentialSource: 'auto',
    resolvedCredentialSource: 'cloud',
    command: 'codex',
    args: ['app-server', '--listen', 'stdio://'],
    status: 'running',
    startedAt: '2026-03-17T00:00:00.000Z',
    archiveDir: '/tmp/demo/.linx/watch/session',
    eventsFile: '/tmp/demo/.linx/watch/session/events.jsonl',
    ...overrides,
  }
}

test.before(async () => {
  const loaded = await loadWatchModule('lib/watch/display.ts')
  displayModule = loaded.module
  cleanup = loaded.cleanup
})

test.after(() => {
  cleanup?.()
})

test('formatWatchElapsed keeps compact codex-like durations', () => {
  assert.equal(displayModule.formatWatchElapsed(0), '0s')
  assert.equal(displayModule.formatWatchElapsed(59_000), '59s')
  assert.equal(displayModule.formatWatchElapsed(61_000), '1m 01s')
  assert.equal(displayModule.formatWatchElapsed(3_661_000), '1h 01m 01s')
})

test('formatWatchHeaderLine keeps watch metadata on one clipped row', () => {
  const line = displayModule.formatWatchHeaderLine(createRecord(), 88)

  assert.match(line, /LinX watch \| codex \| running/)
  assert.match(line, /source=cloud/)
  assert.equal(line.length, 88)
})

test('formatWatchStatusLine switches hints by phase and clips long details', () => {
  const running = displayModule.formatWatchStatusLine(
    {
      phase: 'running',
      detail: 'Continuing turn with a detail that should be clipped before it reaches the right edge',
      since: 0,
    },
    72,
    125_000,
  )
  const approval = displayModule.formatWatchStatusLine(
    {
      phase: 'approval',
      detail: 'Approve command: pwd',
      since: 0,
    },
    72,
    5_000,
  )

  assert.match(running, /Working \(2m 05s\)/)
  assert.match(running, /Ctrl\+C to exit/)
  assert.equal(running.length, 72)

  assert.match(approval, /Approval required \(5s\)/)
  assert.match(approval, /Approve command: pwd/)
  assert.match(approval, /y\/s\/n\/c/)
  assert.equal(approval.length, 72)
})

test('formatWatchTranscriptLine maps live roles to codex-like prefixes', () => {
  const userLines = displayModule.formatWatchTranscriptLine('you> hello linx', 32).map((line) => stripAnsi(line).trimEnd())
  const assistantLines = displayModule.formatWatchTranscriptLine('assistant> hello user', 32).map((line) => stripAnsi(line).trimEnd())

  assert.deepEqual(userLines, ['you hello linx'])
  assert.deepEqual(assistantLines, ['linx hello user'])
})
