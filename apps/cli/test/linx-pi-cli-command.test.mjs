import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))

test('shell lifecycle exposes restart-aware interactive cleanup stop', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/shell-lifecycle.ts')
  t.after(() => cleanup())

  const events = []
  const childHandlers = {}
  const interactive = {
    stop() {
      events.push('stop')
    },
  }
  const runtime = {
    execPath: '/usr/local/bin/node',
    argv: ['/usr/local/bin/node', '/usr/local/bin/linx', '--session', 'session_restart_123'],
    env: {},
    cwd() {
      return '/workspace/project'
    },
    spawnProcess() {
      return {
        on(event, handler) {
          childHandlers[event] = handler
          return this
        },
      }
    },
    exitProcess(code) {
      events.push(`exit:${code}`)
    },
    defer(callback) {
      callback()
    },
  }

  assert.equal(typeof module.stopInteractiveShellUnlessRestarting, 'function')
  const restart = module.restartInteractiveShellProcess(interactive, { runtime })

  assert.deepEqual(events, ['stop'])
  module.stopInteractiveShellUnlessRestarting(interactive)
  assert.deepEqual(events, ['stop'])

  childHandlers.close(0, null)
  await restart

  module.stopInteractiveShellUnlessRestarting(interactive)
  assert.deepEqual(events, ['stop', 'exit:0', 'stop'])
})

test('runLinxCliRuntime cleanup delegates interactive stop to restart-aware shell lifecycle', () => {
  const source = readFileSync(`${cliRoot}/src/lib/linx-pi-runtime-execution.ts`, 'utf8')

  assert.match(source, /stopInteractiveShellUnlessRestarting\(interactive\)/)
  assert.doesNotMatch(source, /finally\s*\{[\s\S]*?interactive\.stop\(\)/)
})

test('runLinxDefaultCommand rejects conflicting Pi session selectors before side effects', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-pi-cli-command.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.assertLinxDefaultCliSessionSelectorCompatibility, 'function')
  assert.throws(
    () => module.assertLinxDefaultCliSessionSelectorCompatibility({
      session: 'existing-session',
      'session-id': 'new-session',
    }),
    /--session-id cannot be combined with --session/,
  )
  assert.throws(
    () => module.assertLinxDefaultCliSessionSelectorCompatibility({
      resume: true,
      'session-id': 'new-session',
    }),
    /--session-id cannot be combined with --continue or --resume/,
  )
  assert.throws(
    () => module.assertLinxDefaultCliSessionSelectorCompatibility({
      continue: true,
      'session-id': 'new-session',
    }),
    /--session-id cannot be combined with --continue or --resume/,
  )
})
