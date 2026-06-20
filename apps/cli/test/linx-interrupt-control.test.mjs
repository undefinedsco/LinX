import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('interrupt control hands auto back before Pi clear semantics', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-interrupt-control.ts')
  t.after(() => cleanup())

  const calls = []
  const interactive = {
    __autoEnabled: true,
    runtime: { autoEnabled: true },
    defaultEditor: {
      actionHandlers: new Map([
        ['app.clear', () => {
          calls.push('pi-clear')
        }],
      ]),
      onEscape() {
        calls.push('pi-escape')
      },
    },
    session: {
      isStreaming: true,
      abort() {
        calls.push('abort')
      },
    },
  }

  module.installLinxEscapeInterrupt(interactive, {
    disableAutoMode(target) {
      calls.push(['auto-off', target === interactive])
      target.__autoEnabled = false
      target.runtime.autoEnabled = false
    },
  })

  interactive.defaultEditor.actionHandlers.get('app.clear')()

  assert.equal(interactive.__autoEnabled, false)
  assert.equal(interactive.runtime.autoEnabled, false)
  assert.deepEqual(calls, ['abort', ['auto-off', true]])
})
