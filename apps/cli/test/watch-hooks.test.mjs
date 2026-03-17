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

test('codex hook maps to app-server multi-turn transport', async () => {
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

  assert.equal(plan.command, 'codex')
  assert.deepEqual(plan.args, ['app-server', '--listen', 'stdio://', '--search'])
})

test('claude hook maps auto mode to print/resume stream-json', async () => {
  const { module } = await getWatchModule()
  const { getWatchHook } = module
  const hook = getWatchHook('claude')
  const plan = hook.buildSpawnPlan({
    backend: 'claude',
    mode: 'auto',
    cwd: '/tmp/demo',
    model: 'sonnet',
    prompt: 'summarize',
    passthroughArgs: [],
  })

  assert.deepEqual(plan.args, [
    '--print',
    '--verbose',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--permission-mode',
    'bypassPermissions',
    '--dangerously-skip-permissions',
    '--model',
    'sonnet',
  ])
})

test('codebuddy hook maps manual mode to print/resume stream-json', async () => {
  const { module } = await getWatchModule()
  const { getWatchHook } = module
  const hook = getWatchHook('codebuddy')
  const plan = hook.buildSpawnPlan({
    backend: 'codebuddy',
    mode: 'manual',
    cwd: '/tmp/demo',
    prompt: 'inspect repo',
    passthroughArgs: ['--tools', 'Read,Edit'],
  })

  assert.deepEqual(plan.args, [
    '--print',
    '--verbose',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--permission-mode',
    'default',
    '--tools',
    'Read,Edit',
  ])
})

test('claude hook resumes backend session ids per turn', async () => {
  const { module } = await getWatchModule()
  const { getWatchHook } = module
  const hook = getWatchHook('claude')
  const plan = hook.buildTurnPlan({
    backend: 'claude',
    mode: 'smart',
    cwd: '/tmp/demo',
    prompt: undefined,
    passthroughArgs: [],
  }, {
    backendSessionId: '123e4567-e89b-12d3-a456-426614174000',
    prompt: 'continue',
    turnIndex: 1,
  })

  assert.deepEqual(plan.args, [
    '--print',
    '--verbose',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--permission-mode',
    'auto',
    '--resume',
    '123e4567-e89b-12d3-a456-426614174000',
    'continue',
  ])
})

test('codebuddy hook extracts session ids from stream-json init lines', async () => {
  const { module } = await getWatchModule()
  const { getWatchHook } = module
  const hook = getWatchHook('codebuddy')

  assert.equal(
    hook.extractSessionId('{"type":"system","subtype":"init","session_id":"sess_123"}'),
    'sess_123',
  )
})

test('generic json parser emits approval and tool events', async () => {
  const { module } = await getWatchModule()
  const { getWatchHook } = module
  const hook = getWatchHook('claude')
  const events = hook.parseLine(JSON.stringify({
    type: 'tool_permission',
    message: 'Run yarn test?',
    toolName: 'Bash',
    arguments: { command: 'yarn test' },
  }), 'stdout')

  assert.deepEqual(events, [
    {
      type: 'approval.required',
      message: 'Run yarn test?',
      raw: {
        type: 'tool_permission',
        message: 'Run yarn test?',
        toolName: 'Bash',
        arguments: { command: 'yarn test' },
      },
    },
    {
      type: 'tool.call',
      name: 'Bash',
      arguments: { command: 'yarn test' },
      raw: {
        type: 'tool_permission',
        message: 'Run yarn test?',
        toolName: 'Bash',
        arguments: { command: 'yarn test' },
      },
    },
  ])
})

test.after(async () => {
  const loaded = watchModulePromise ? await watchModulePromise : null
  loaded?.cleanup()
})
