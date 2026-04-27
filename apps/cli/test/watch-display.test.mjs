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

test('summarizeWatchToolCall keeps tool activity short and avoids dumping raw JSON', () => {
  assert.equal(
    displayModule.summarizeWatchToolCall('commandExecution', {
      command: 'git status',
      cwd: '/Users/ganlu/develop/linx-cli',
      process_id: 123,
      turn_id: 'turn_1',
    }),
    'commandExecution · git status',
  )

  assert.equal(
    displayModule.summarizeWatchToolCall('List', {
      path: '/Users/ganlu/develop/linx-cli/apps/cli/src/lib/watch/display.ts',
    }),
    'List · .../watch/display.ts',
  )
})

test('summarizeWatchDebugPayload keeps a readable summary plus optional detail', () => {
  assert.deepEqual(
    displayModule.summarizeWatchDebugPayload({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'tool_call',
          rawInput: {
            command: 'git status',
          },
        },
      },
    }),
    {
      text: 'session/update',
      detail: '{"jsonrpc":"2.0","method":"session/update","params":{"update":{"sessionUpdate":"tool_call","rawInput":{"command":"git status"}}}}',
    },
  )

  assert.deepEqual(
    displayModule.summarizeWatchDebugPayload('short raw line'),
    {
      text: 'short raw line',
    },
  )
})

test('formatWatchFooterContext keeps session metadata compact', () => {
  assert.equal(
    displayModule.formatWatchFooterContext(createRecord()),
    '/tmp/demo | session=watch_2026-0...deadbeef | model=gpt-5-codex | source=cloud',
  )
})

test('formatWatchFooterLine uses codex-like hinting for ready and running phases', () => {
  const ready = stripAnsi(displayModule.formatWatchFooterLine({
    width: 140,
    phase: 'ready',
    record: createRecord(),
    hasDraft: false,
  }))

  const runningDraft = stripAnsi(displayModule.formatWatchFooterLine({
    width: 120,
    phase: 'running',
    record: createRecord(),
    hasDraft: true,
  }))

  const tightReady = stripAnsi(displayModule.formatWatchFooterLine({
    width: 72,
    phase: 'ready',
    record: createRecord(),
    hasDraft: false,
  }))

  assert.match(ready, /\/help · \/exit · \/model <id> · \/debug on\|off/)
  assert.match(ready, /source=cloud\s*$/)
  assert.match(runningDraft, /Enter steer · Shift\+Enter newline · Alt\+Enter follow-up/)
  assert.doesNotMatch(runningDraft, /model=gpt-5-codex/)
  assert.doesNotMatch(tightReady, /source=cloud/)
  assert.match(tightReady, /\/help · \/exit · \/model <id>/)
})

test('activity panel renders as a titled box when debug content is present', async () => {
  const compactPanelLines = displayModule.formatWatchActivityPanelLines({
    width: 72,
    maxHeight: 10,
    debugMode: true,
    entries: [
      {
        kind: 'tool',
        text: 'commandExecution · git status',
      },
      {
        kind: 'note',
        text: 'Approval required for git status',
      },
      {
        kind: 'debug',
        text: 'session/update',
        detail: '{"sessionUpdate":"usage_update"}',
      },
    ],
  }).map((line) => stripAnsi(line).trimEnd())

  const tallPanelLines = displayModule.formatWatchActivityPanelLines({
    width: 72,
    maxHeight: 14,
    debugMode: true,
    entries: [
      {
        kind: 'tool',
        text: 'commandExecution · git status',
      },
      {
        kind: 'note',
        text: 'Approval required for git status',
      },
      {
        kind: 'debug',
        text: 'session/update',
        detail: '{"sessionUpdate":"usage_update"}',
      },
    ],
  }).map((line) => stripAnsi(line).trimEnd())

  assert.ok(compactPanelLines.length > 0)
  assert.match(compactPanelLines[0] ?? '', /activity \| debug/)
  assert.ok(compactPanelLines.some((line) => line.includes('status')))
  assert.ok(compactPanelLines.some((line) => line.includes('[approval] Approval required')))
  assert.ok(compactPanelLines.some((line) => line.includes('tools')))
  assert.ok(compactPanelLines.some((line) => line.includes('commandExecution')))
  assert.ok(compactPanelLines.every((line) => !line.includes('session/update')))

  assert.ok(tallPanelLines.some((line) => line.includes('status')))
  assert.ok(tallPanelLines.some((line) => line.includes('tools')))
  assert.ok(tallPanelLines.some((line) => line.includes('debug')))
  assert.ok(tallPanelLines.some((line) => line.includes('commandExecution')))
  assert.ok(tallPanelLines.some((line) => line.includes('session/update')))
})

test('selectWatchFooterSectionCounts keeps prompt/footer visible on short terminals', () => {
  const counts = displayModule.selectWatchFooterSectionCounts({
    totalHeight: 4,
    headerCount: 2,
    contextCount: 3,
    showStatus: true,
    queueCount: 1,
    promptCount: 3,
  })

  assert.deepEqual(counts, {
    contextCount: 0,
    statusCount: 0,
    queueCount: 0,
  })
})

test('selectWatchFooterSectionCounts uses remaining space in priority order', () => {
  const counts = displayModule.selectWatchFooterSectionCounts({
    totalHeight: 10,
    headerCount: 2,
    contextCount: 5,
    showStatus: true,
    queueCount: 1,
    promptCount: 3,
  })

  assert.deepEqual(counts, {
    contextCount: 2,
    statusCount: 1,
    queueCount: 1,
  })
})
