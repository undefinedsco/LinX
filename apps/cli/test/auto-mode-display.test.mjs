import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

let displayModule
let cleanup

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

function createRecord(overrides = {}) {
  return {
    id: 'auto_2026-03-17T00-00-00-000Z_deadbeef',
    backend: 'codex',
    runtime: 'local',
    autoEnabled: true,
    mode: 'auto',
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
    archiveDir: '/tmp/demo/.solid/apps/linx/auto-mode/session',
    eventsFile: '/tmp/demo/.solid/apps/linx/auto-mode/session/events.jsonl',
    ...overrides,
  }
}

test.before(async () => {
  const loaded = await loadAutoModeModule('lib/auto-mode/display.ts')
  displayModule = loaded.module
  cleanup = loaded.cleanup
})

test.after(() => {
  cleanup?.()
})

test('formatAutoModeElapsed keeps compact codex-like durations', () => {
  assert.equal(displayModule.formatAutoModeElapsed(0), '0s')
  assert.equal(displayModule.formatAutoModeElapsed(59_000), '59s')
  assert.equal(displayModule.formatAutoModeElapsed(61_000), '1m 01s')
  assert.equal(displayModule.formatAutoModeElapsed(3_661_000), '1h 01m 01s')
})

test('formatAutoModeHeaderLine keeps backend and Secretary control state separate', () => {
  const line = displayModule.formatAutoModeHeaderLine(createRecord(), 88)

  assert.match(line, /Codex \| controlled by LinX \| running \| auto=on \| mode=auto/)
  assert.doesNotMatch(line, /smart/)
  assert.equal(line.length, 88)
})

test('formatAutoModeStatusLine switches hints by phase and clips long details', () => {
  const running = displayModule.formatAutoModeStatusLine(
    {
      phase: 'running',
      detail: 'Continuing turn with a detail that should be clipped before it reaches the right edge',
      since: 0,
    },
    72,
    125_000,
  )
  const approval = displayModule.formatAutoModeStatusLine(
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

test('formatAutoModeTranscriptLine maps live roles to codex-like prefixes', () => {
  const userLines = displayModule.formatAutoModeTranscriptLine('you> hello linx', 32).map((line) => stripAnsi(line).trimEnd())
  const assistantLines = displayModule.formatAutoModeTranscriptLine('assistant> hello user', 32).map((line) => stripAnsi(line).trimEnd())

  assert.deepEqual(userLines, ['you hello linx'])
  assert.deepEqual(assistantLines, ['linx hello user'])
})

test('auto-mode display normalizes cloud completion Pod timeout failures', async () => {
  const originalPlain = process.env.LINX_AUTO_MODE_PLAIN
  const originalWrite = process.stderr.write
  const chunks = []
  process.env.LINX_AUTO_MODE_PLAIN = '1'
  process.stderr.write = function patchedWrite(chunk, encodingOrCallback, maybeCallback) {
    chunks.push(String(chunk))
    const callback = typeof encodingOrCallback === 'function' ? encodingOrCallback : maybeCallback
    if (typeof callback === 'function') {
      callback()
    }
    return true
  }

  try {
    const display = displayModule.createAutoModeDisplay(createRecord(), async () => '')
    display.finish(
      'failed',
      createRecord(),
      'Retry failed after 3 attempts: LinX Pod request timed out after 30s: POST https://api.undefineds.co/v1/chat/completions',
    )
  } finally {
    process.stderr.write = originalWrite
    if (originalPlain === undefined) {
      delete process.env.LINX_AUTO_MODE_PLAIN
    } else {
      process.env.LINX_AUTO_MODE_PLAIN = originalPlain
    }
  }

  const output = chunks.join('')
  assert.match(output, /LinX Cloud is temporarily unavailable\. Request exceeded 30s\. Please retry shortly\./)
  assert.doesNotMatch(output, /LinX Pod request timed out/)
})

test('auto-mode plain display normalizes cloud completion Pod timeout raw output and prompts', async () => {
  const originalPlain = process.env.LINX_AUTO_MODE_PLAIN
  const originalWrite = process.stdout.write
  const chunks = []
  process.env.LINX_AUTO_MODE_PLAIN = '1'
  process.stdout.write = function patchedWrite(chunk, encodingOrCallback, maybeCallback) {
    chunks.push(String(chunk))
    const callback = typeof encodingOrCallback === 'function' ? encodingOrCallback : maybeCallback
    if (typeof callback === 'function') {
      callback()
    }
    return true
  }

  const raw = 'Error: LinX Pod request timed out after 30s: POST https://api.undefineds.co/v1/chat/completions'
  try {
    const display = displayModule.createAutoModeDisplay(createRecord(), async () => '')
    display.renderRawLine('stdout', raw)
    display.renderEvents([
      { type: 'approval.required', message: raw },
      { type: 'input.required', message: raw },
      { type: 'system.note', message: raw },
    ])
  } finally {
    process.stdout.write = originalWrite
    if (originalPlain === undefined) {
      delete process.env.LINX_AUTO_MODE_PLAIN
    } else {
      process.env.LINX_AUTO_MODE_PLAIN = originalPlain
    }
  }

  const output = chunks.join('')
  assert.match(output, /LinX Cloud is temporarily unavailable\. Request exceeded 30s\. Please retry shortly\./)
  assert.doesNotMatch(output, /LinX Pod request timed out/)
})

test('auto-mode archive transcript normalizes cloud completion Pod timeout raw lines', async (t) => {
  const loaded = await loadAutoModeModule('lib/auto-mode/format.ts')
  t.after(() => loaded.cleanup())
  const raw = 'Error: LinX Pod request timed out after 30s: POST https://api.undefineds.co/v1/chat/completions'

  const lines = loaded.module.renderAutoModeTranscript([
    { stream: 'stdout', line: raw, events: [] },
    { stream: 'stderr', line: raw, events: [] },
    { stream: 'stdout', line: JSON.stringify({ type: 'process.error', message: raw }), events: [] },
    { stream: 'stdout', line: '', events: [{ type: 'approval.required', message: raw }] },
  ])

  const output = lines.join('\n')
  assert.match(output, /LinX Cloud is temporarily unavailable\. Request exceeded 30s\. Please retry shortly\./)
  assert.doesNotMatch(output, /LinX Pod request timed out/)
})

test('summarizeAutoModeToolCall keeps tool activity short and avoids dumping raw JSON', () => {
  assert.equal(
    displayModule.summarizeAutoModeToolCall('commandExecution', {
      command: 'git status',
      cwd: '/Users/ganlu/develop/linx-cli',
      process_id: 123,
      turn_id: 'turn_1',
    }),
    'commandExecution · git status',
  )

  assert.equal(
    displayModule.summarizeAutoModeToolCall('List', {
      path: '/Users/ganlu/develop/linx-cli/apps/cli/src/lib/auto-mode/display.ts',
    }),
    'List · .../auto-mode/display.ts',
  )
})

test('summarizeAutoModeDebugPayload keeps a readable summary plus optional detail', () => {
  assert.deepEqual(
    displayModule.summarizeAutoModeDebugPayload({
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
    displayModule.summarizeAutoModeDebugPayload('short raw line'),
    {
      text: 'short raw line',
    },
  )
})

test('formatAutoModeFooterContext keeps session metadata compact', () => {
  assert.equal(
    displayModule.formatAutoModeFooterContext(createRecord()),
    '/tmp/demo | session=pending | model=gpt-5-codex | credentials=pod',
  )
})

test('formatAutoModeFooterLine uses LinX main TUI hinting for ready and running phases', () => {
  const ready = stripAnsi(displayModule.formatAutoModeFooterLine({
    width: 140,
    phase: 'ready',
    record: createRecord(),
    hasDraft: false,
  }))

  const runningDraft = stripAnsi(displayModule.formatAutoModeFooterLine({
    width: 120,
    phase: 'running',
    record: createRecord(),
    hasDraft: true,
  }))

  const tightReady = stripAnsi(displayModule.formatAutoModeFooterLine({
    width: 72,
    phase: 'ready',
    record: createRecord(),
    hasDraft: false,
  }))

  assert.match(ready, /enter send · ctrl\+l model · \/hotkeys keymap · \/exit/)
  assert.match(ready, /credentials=pod\s*$/)
  assert.doesNotMatch(ready, /source=/)
  assert.match(runningDraft, /enter steer · shift\+enter newline · alt\+enter follow-up/)
  assert.doesNotMatch(runningDraft, /model=gpt-5-codex/)
  assert.doesNotMatch(tightReady, /source=/)
  assert.match(tightReady, /enter send · ctrl\+l model/)
})

test('activity panel renders as a titled box when debug content is present', async () => {
  const compactPanelLines = displayModule.formatAutoModeActivityPanelLines({
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

  const tallPanelLines = displayModule.formatAutoModeActivityPanelLines({
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

test('selectAutoModeFooterSectionCounts keeps prompt/footer visible on short terminals', () => {
  const counts = displayModule.selectAutoModeFooterSectionCounts({
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

test('selectAutoModeFooterSectionCounts uses remaining space in priority order', () => {
  const counts = displayModule.selectAutoModeFooterSectionCounts({
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
