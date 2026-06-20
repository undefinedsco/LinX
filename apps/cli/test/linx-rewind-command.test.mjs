import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'
import { initTheme } from '@earendil-works/pi-coding-agent'

process.env.PI_OFFLINE = '1'
initTheme('dark')

test('rewind shell command module materializes a clean active session', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-rewind-command.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@earendil-works/pi-coding-agent')
  const sessionManager = SessionManager.inMemory('/tmp/linx-rewind-command-test')
  const originalSessionId = sessionManager.getSessionId()
  const firstUser = sessionManager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'first turn' }],
    timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
  })
  const firstAssistant = sessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'first answer' }],
    provider: 'undefineds',
    model: 'linx-lite',
    stopReason: 'stop',
    timestamp: Date.parse('2026-04-01T00:00:01.000Z'),
  })
  const dirtyUser = sessionManager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'dirty turn' }],
    timestamp: Date.parse('2026-04-01T00:00:02.000Z'),
  })
  sessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'dirty answer' }],
    provider: 'undefineds',
    model: 'linx-lite',
    stopReason: 'stop',
    timestamp: Date.parse('2026-04-01T00:00:03.000Z'),
  })

  const events = []
  const agentState = {
    ...sessionManager.buildSessionContext(),
  }
  const interactive = {
    session: {
      sessionManager,
      agent: {
        state: agentState,
      },
    },
    ui: {
      requestRender() {
        events.push('render')
      },
    },
    rebuildChatFromMessages() {
      events.push(['transcript', sessionManager.buildSessionContext().messages.map((message) => message.content[0].text)])
    },
    showStatus(message) {
      events.push(['status', message])
    },
    showError(message) {
      throw new Error(message)
    },
  }

  await module.handleInteractiveRewindTurnsCommand(interactive, {}, 1)

  assert.notEqual(sessionManager.getSessionId(), originalSessionId)
  assert.equal(sessionManager.getLeafId(), firstAssistant)
  assert.equal(sessionManager.getEntry(dirtyUser), undefined)
  assert.deepEqual(sessionManager.getEntries().map((entry) => entry.id), [firstUser, firstAssistant])
  assert.deepEqual(agentState.messages.map((message) => message.content[0].text), ['first turn', 'first answer'])
  assert.deepEqual(events.find((event) => Array.isArray(event) && event[0] === 'transcript'), ['transcript', ['first turn', 'first answer']])
  assert.match(events.filter((event) => Array.isArray(event) && event[0] === 'status').map((event) => event[1]).join('\n'), /Rewound 1 turn/)
  assert.equal(events.includes('render'), true)
})
