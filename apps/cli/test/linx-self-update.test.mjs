import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

function createInstallChild() {
  const child = new EventEmitter()
  child.stderr = new Readable({ read() {} })
  return child
}

test('linx self-update installs the CLI package before restarting the interactive shell', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-self-update.ts')
  t.after(() => cleanup())

  const events = []
  let child
  const interactive = {
    showStatus(message) {
      events.push({ type: 'status', message })
    },
    showError(message) {
      events.push({ type: 'error', message })
    },
    ui: {
      requestRender() {
        events.push({ type: 'render' })
      },
    },
  }
  const runtime = {
    env: { npm_execpath: '/usr/local/bin/npm' },
    spawnProcess(command, args, options) {
      events.push({ type: 'spawn', command, args, options })
      child = createInstallChild()
      return child
    },
    restartShell(shell) {
      events.push({ type: 'restart', shell })
    },
  }

  const installing = module.installLinxSelfUpdateAndRestart(interactive, '0.3.27', { runtime })
  await new Promise((resolve) => setImmediate(resolve))
  child.emit('close', 0)
  await installing

  assert.deepEqual(events[0], { type: 'status', message: 'Installing LinX 0.3.27...' })
  assert.equal(events[2].type, 'spawn')
  assert.equal(events[2].command, '/usr/local/bin/npm')
  assert.deepEqual(events[2].args, ['install', '-g', '--omit=peer', '@undefineds.co/linx@latest'])
  assert.deepEqual(events[2].options, { stdio: ['ignore', 'pipe', 'pipe'], shell: false })
  assert.deepEqual(events.at(-2), { type: 'render' })
  assert.equal(events.at(-1).type, 'restart')
  assert.equal(events.at(-1).shell, interactive)
})

test('linx self-update reports npm failure and does not restart the interactive shell', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-self-update.ts')
  t.after(() => cleanup())

  const events = []
  let child
  const interactive = {
    showStatus(message) {
      events.push({ type: 'status', message })
    },
    showError(message) {
      events.push({ type: 'error', message })
    },
    ui: {
      requestRender() {
        events.push({ type: 'render' })
      },
    },
  }
  const runtime = {
    env: {},
    spawnProcess(command, args, options) {
      events.push({ type: 'spawn', command, args, options })
      child = createInstallChild()
      return child
    },
    restartShell(shell) {
      events.push({ type: 'restart', shell })
    },
  }

  const installing = module.installLinxSelfUpdateAndRestart(interactive, '0.3.27', { runtime })
  await new Promise((resolve) => setImmediate(resolve))
  child.stderr.push('registry unavailable')
  child.stderr.push(null)
  child.emit('close', 1)
  await installing

  assert.equal(events.some((event) => event.type === 'restart'), false)
  assert.deepEqual(events.at(-1), { type: 'error', message: 'LinX update failed: registry unavailable' })
})
