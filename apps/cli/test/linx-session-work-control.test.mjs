import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('active session stop absorbs async abort failures while repairing shell state', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-session-work-control.ts')
  t.after(() => cleanup())

  const unhandled = []
  const onUnhandled = (reason) => {
    unhandled.push(reason)
  }
  process.on('unhandledRejection', onUnhandled)
  t.after(() => process.off('unhandledRejection', onUnhandled))

  await module.stopLinxActiveSessionWork({
    isBashRunning: true,
    isStreaming: true,
    async abortBash() {
      throw new Error('bash abort failed')
    },
    async abort() {
      throw new Error('agent abort failed')
    },
    agent: {
      async waitForIdle() {},
    },
  }, { waitTimeoutMs: 1 })
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(unhandled, [])
})

test('session work control reports async bash abort failures without unhandled rejection', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-session-work-control.ts')
  t.after(() => cleanup())

  const errors = []
  const unhandled = []
  const onUnhandled = (reason) => {
    unhandled.push(reason)
  }
  process.on('unhandledRejection', onUnhandled)
  t.after(() => process.off('unhandledRejection', onUnhandled))

  const handled = module.stopLinxInteractiveSessionWorkNow({
    session: {
      isBashRunning: true,
      async abortBash() {
        throw new Error('bash abort failed')
      },
    },
    showError(message) {
      errors.push(message)
    },
  })
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(handled, true)
  assert.deepEqual(unhandled, [])
  assert.deepEqual(errors, ['LinX session interrupt failed: bash abort failed'])
})

test('session work control reports async agent abort failures without unhandled rejection', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-session-work-control.ts')
  t.after(() => cleanup())

  const errors = []
  const unhandled = []
  const onUnhandled = (reason) => {
    unhandled.push(reason)
  }
  process.on('unhandledRejection', onUnhandled)
  t.after(() => process.off('unhandledRejection', onUnhandled))

  const handled = module.stopLinxInteractiveSessionWorkNow({
    loadingAnimation: true,
    session: {
      async abort() {
        throw new Error('agent abort failed')
      },
    },
    showError(message) {
      errors.push(message)
    },
  })
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(handled, true)
  assert.deepEqual(unhandled, [])
  assert.deepEqual(errors, ['LinX session interrupt failed: agent abort failed'])
})
