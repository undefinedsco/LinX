import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('linx shell command router recognizes shell-owned commands without backend handlers', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-shell-command-router.ts')
  t.after(() => cleanup())

  assert.deepEqual(module.parseLinxShellCommand('/cd'), { action: 'cd' })
  assert.deepEqual(module.parseLinxShellCommand('/cd ../demo'), { action: 'cd', target: '../demo' })
  assert.deepEqual(module.parseLinxShellCommand('/update'), { action: 'update' })
  assert.deepEqual(module.parseLinxShellCommand('/upgrade'), { action: 'update' })
  assert.deepEqual(module.parseLinxShellCommand('/rewind'), { action: 'rewind-select' })
  assert.deepEqual(module.parseLinxShellCommand('/rewind 3'), { action: 'rewind-turns', turns: 3 })
  assert.deepEqual(module.parseLinxShellCommand('/rewind nope'), { action: 'rewind-turns', turns: 0 })
})

test('linx shell command router parses ai-connect and statusline quoted arguments', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-shell-command-router.ts')
  t.after(() => cleanup())

  assert.deepEqual(module.parseLinxShellCommand('/ai connect'), { action: 'ai-connect' })
  assert.deepEqual(module.parseLinxShellCommand('/ai connect stepfun --model "step 3.7" --base-url=https://api.example/v1'), {
    action: 'ai-connect',
    provider: 'stepfun',
    model: 'step 3.7',
    baseUrl: 'https://api.example/v1',
  })
  assert.deepEqual(module.parseLinxShellCommand('/statusline set model-with-reasoning "git branch" context-remaining'), {
    action: 'statusline',
    args: ['set', 'model-with-reasoning', 'git branch', 'context-remaining'],
  })
  assert.deepEqual(module.parseLinxShellCommand('/status-line colors off'), {
    action: 'statusline',
    args: ['colors', 'off'],
  })
})

test('linx shell command router separates Secretary control from backend-owned slash commands', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-shell-command-router.ts')
  t.after(() => cleanup())

  assert.equal(module.shouldRouteToBackendCommand('/models'), true)
  assert.equal(module.shouldRouteToBackendCommand('/status'), true)
  assert.equal(module.shouldRouteToBackendCommand('/commands'), true)
  assert.equal(module.shouldRouteToBackendCommand('/rollback 1'), true)
  assert.equal(module.shouldRouteToBackendCommand('/auto'), false)
  assert.equal(module.shouldRouteToBackendCommand('/goal ship login'), false)
  assert.equal(module.shouldRouteToBackendCommand('/unknown'), false)
  assert.equal(module.shouldRouteToBackendCommand('hello'), false)

  assert.equal(module.parseLinxShellCommand('/unknown'), null)
  assert.equal(module.parseLinxShellCommand('hello'), null)

  const auto = module.parseLinxShellCommand('/auto on')
  assert.equal(auto.action, 'auto')
  assert.equal(auto.route.kind, 'control-command')

  const goal = module.parseLinxShellCommand('/goal ship login')
  assert.equal(goal.action, 'peer-command')
  assert.equal(goal.route.kind, 'peer-command')
})

test('linx shell command router leaves Pi-native slash commands on the original submit path', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-shell-command-router.ts')
  t.after(() => cleanup())

  for (const command of [
    '/compact',
    '/model gpt-5.4-mini',
    '/new',
    '/session',
    '/fork',
    '/name ship-it',
    '/help',
  ]) {
    assert.equal(module.shouldRouteToBackendCommand(command), false, `${command} should not be LinX-proxied`)
    assert.equal(module.parseLinxShellCommand(command), null, `${command} should not be LinX shell-owned`)
  }
})
