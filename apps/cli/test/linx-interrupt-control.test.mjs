import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('interrupt control hands auto back before Pi clear semantics', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-interrupt-control.ts')
  t.after(() => cleanup())

  const calls = []
  const interactive = {
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
      target.runtime.autoEnabled = false
    },
  })

  interactive.defaultEditor.actionHandlers.get('app.clear')()

  assert.equal(interactive.runtime.autoEnabled, false)
  assert.deepEqual(calls, ['abort', ['auto-off', true]])
})

test('interrupt control reports async auto handoff failures without unhandled rejection', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-interrupt-control.ts')
  t.after(() => cleanup())

  const errors = []
  const unhandled = []
  const onUnhandled = (reason) => {
    unhandled.push(reason)
  }
  process.on('unhandledRejection', onUnhandled)
  t.after(() => process.off('unhandledRejection', onUnhandled))

  const interactive = {
    runtime: { autoEnabled: true },
    defaultEditor: {
      actionHandlers: new Map([
        ['app.clear', () => {
          throw new Error('Pi clear should not run while auto is active')
        }],
      ]),
    },
    session: {
      abort() {},
    },
    showError(message) {
      errors.push(message)
    },
  }

  module.installLinxEscapeInterrupt(interactive, {
    async disableAutoMode() {
      interactive.runtime.autoEnabled = false
      throw new Error('control sync failed')
    },
  })

  interactive.defaultEditor.actionHandlers.get('app.clear')()
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(interactive.runtime.autoEnabled, false)
  assert.deepEqual(unhandled, [])
  assert.deepEqual(errors, ['Auto mode handoff failed: control sync failed'])
})

test('post-init interrupt wiring returns auto command failures to interrupt control', async (t) => {
  const [
    { module: postInitModule, cleanup: postInitCleanup },
    { module: shellStateModule, cleanup: shellStateCleanup },
  ] = await Promise.all([
    loadAutoModeModule('lib/linx-interactive-post-init.ts'),
    loadAutoModeModule('lib/linx-interactive-shell-state.ts'),
  ])
  t.after(() => postInitCleanup())
  t.after(() => shellStateCleanup())

  const errors = []
  const unhandled = []
  const onUnhandled = (reason) => {
    unhandled.push(reason)
  }
  process.on('unhandledRejection', onUnhandled)
  t.after(() => process.off('unhandledRejection', onUnhandled))

  const interactive = {
    runtime: { autoEnabled: true },
    defaultEditor: {
      actionHandlers: new Map([
        ['app.clear', () => {
          throw new Error('Pi clear should not run while auto is active')
        }],
      ]),
    },
    session: {
      abort() {},
    },
    showStatus() {},
    showError(message) {
      errors.push(message)
    },
  }

  shellStateModule.configureLinxInteractiveShellState(interactive, {
    autoModeEnabled: true,
    autoControlChange: async () => {
      throw new Error('pod sync failed')
    },
  })

  postInitModule.installLinxEscapeInterrupt(interactive)
  interactive.defaultEditor.actionHandlers.get('app.clear')()
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(interactive.runtime.autoEnabled, false)
  assert.deepEqual(unhandled, [])
  assert.deepEqual(errors, ['Auto mode handoff failed: pod sync failed'])
})
