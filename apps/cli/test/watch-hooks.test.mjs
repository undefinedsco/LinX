import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWatchModule } from './watch-test-bundle.mjs'

let watchModulePromise

async function getWatchModule() {
  if (!watchModulePromise) {
    watchModulePromise = loadWatchModule()
  }

  return watchModulePromise
}

test('codex hook maps to codex-acp transport', async () => {
  const { module } = await getWatchModule()
  const { getWatchHook } = module
  const hook = getWatchHook('codex')
  const plan = hook.buildSpawnPlan({
    backend: 'codex',
    mode: 'smart',
    cwd: '/tmp/demo',
    model: 'o3',
    prompt: 'fix lint',
    passthroughArgs: ['--search'],
  })

  assert.match(plan.command, /codex-acp(?:\\.js)?$/)
  assert.deepEqual(plan.args, ['--search'])
})

test('claude hook maps to claude-code-acp transport', async () => {
  const { module } = await getWatchModule()
  const { getWatchHook } = module
  const hook = getWatchHook('claude')
  const plan = hook.buildSpawnPlan({
    backend: 'claude',
    mode: 'auto',
    cwd: '/tmp/demo',
    model: 'sonnet',
    prompt: 'summarize',
    passthroughArgs: ['--verbose'],
  })

  assert.equal(plan.command, 'claude-code-acp')
  assert.deepEqual(plan.args, ['--verbose'])
})

test('codebuddy hook maps to built-in ACP mode and preserves model arg', async () => {
  const { module } = await getWatchModule()
  const { getWatchHook } = module
  const hook = getWatchHook('codebuddy')
  const plan = hook.buildSpawnPlan({
    backend: 'codebuddy',
    mode: 'manual',
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
  const loaded = watchModulePromise ? await watchModulePromise : null
  loaded?.cleanup()
})
