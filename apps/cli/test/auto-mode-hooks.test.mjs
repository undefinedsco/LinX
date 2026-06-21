import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

let autoModeModulePromise

async function getAutoModeModule() {
  if (!autoModeModulePromise) {
    autoModeModulePromise = loadAutoModeModule('lib/auto-mode/hooks/index.ts')
  }

  return autoModeModulePromise
}

test('codex hook maps to codex-acp transport', async () => {
  const { module } = await getAutoModeModule()
  const { getAutoModeHook } = module
  const hook = getAutoModeHook('codex')
  assert.equal(hook.capabilities.protocol, 'acp')
  assert.equal(hook.capabilities.canSetModel, false)
  const plan = hook.buildSpawnPlan({
    backend: 'codex',
autoEnabled: true,
mode: 'auto',
    cwd: '/tmp/demo',
    model: 'o3',
    prompt: 'fix lint',
    passthroughArgs: ['--search'],
  })

  assert.match(plan.command, /codex-acp(?:\.js)?$/)
  assert.deepEqual(plan.args, ['-c', 'model="o3"', '--search'])
})

test('codex hook rejects provider-routed worker models', async () => {
  const { module } = await getAutoModeModule()
  const { getAutoModeHook } = module
  const hook = getAutoModeHook('codex')

  assert.throws(() => hook.buildSpawnPlan({
    backend: 'codex',
autoEnabled: true,
mode: 'auto',
    cwd: '/tmp/demo',
    model: 'deepseek-v4',
    prompt: 'fix lint',
    passthroughArgs: [],
  }), /codex backend cannot run model deepseek-v4/)
})

test('claude hook maps to claude-code-acp transport', async () => {
  const { module } = await getAutoModeModule()
  const { getAutoModeHook } = module
  const hook = getAutoModeHook('claude')
  assert.equal(hook.capabilities.protocol, 'acp')
  assert.equal(hook.capabilities.canSetModel, true)
  const plan = hook.buildSpawnPlan({
    backend: 'claude',
    mode: 'auto',
    cwd: '/tmp/demo',
    model: 'opus',
    prompt: 'summarize',
    passthroughArgs: ['--verbose'],
  })

  assert.equal(plan.command, 'claude-code-acp')
  assert.deepEqual(plan.args, ['--verbose'])
})

test('claude hook rejects provider-routed worker models before ACP startup', async () => {
  const { module } = await getAutoModeModule()
  const { getAutoModeHook } = module
  const hook = getAutoModeHook('claude')

  assert.throws(() => hook.buildSpawnPlan({
    backend: 'claude',
autoEnabled: true,
mode: 'auto',
    cwd: '/tmp/demo',
    model: 'deepseek-v4',
    prompt: 'summarize',
    passthroughArgs: [],
  }), /claude backend cannot set provider-routed model deepseek-v4/)
})

test('claude hook honors command override for smoke and packaged runtimes', async () => {
  const { module } = await getAutoModeModule()
  const { getAutoModeHook } = module
  const hook = getAutoModeHook('claude')
  const plan = hook.buildSpawnPlan({
    backend: 'claude',
autoEnabled: false,
mode: 'off',
    cwd: '/tmp/demo',
    model: 'opus',
    prompt: 'summarize',
    commandOverride: '/tmp/fake-claude-code-acp',
    passthroughArgs: [],
  })

  assert.equal(plan.command, '/tmp/fake-claude-code-acp')
  assert.deepEqual(plan.args, [])
})

test('codebuddy hook maps to built-in ACP mode and preserves model arg', async () => {
  const { module } = await getAutoModeModule()
  const { getAutoModeHook } = module
  const hook = getAutoModeHook('codebuddy')
  assert.equal(hook.capabilities.protocol, 'acp')
  const plan = hook.buildSpawnPlan({
    backend: 'codebuddy',
autoEnabled: false,
mode: 'off',
    cwd: '/tmp/demo',
    model: 'deepseek-v3.1-thinking',
    prompt: 'inspect repo',
    passthroughArgs: ['--tools', 'Read,Edit'],
  })

  assert.equal(plan.command, 'codebuddy')
  assert.deepEqual(plan.args, [
    '--acp',
    '--acp-transport',
    'stdio',
    '--model',
    'deepseek-v3.1-thinking',
    '--tools',
    'Read,Edit',
  ])
})

test.after(async () => {
  const loaded = autoModeModulePromise ? await autoModeModulePromise : null
  loaded?.cleanup()
})
