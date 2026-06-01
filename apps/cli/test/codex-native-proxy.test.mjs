import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

function useTempAutoModeHome(t) {
  const previous = process.env.LINX_AUTO_MODE_HOME
  const dir = mkdtempSync(join(tmpdir(), 'linx-auto-mode-native-proxy-'))
  process.env.LINX_AUTO_MODE_HOME = dir
  t.after(() => {
    if (previous === undefined) {
      delete process.env.LINX_AUTO_MODE_HOME
    } else {
      process.env.LINX_AUTO_MODE_HOME = previous
    }
    rmSync(dir, { recursive: true, force: true })
  })
}

function createFakeChild() {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killed = false
  child.kill = () => {
    child.killed = true
    child.emit('exit', 0, null)
    return true
  }
  return child
}

function bindJsonRpcResponder(child, requests, responder = {}) {
  let buffer = ''
  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      if (line.trim()) {
        const message = JSON.parse(line)
        requests.push(message)
        if (message.id !== undefined) {
          const result = typeof responder[message.method] === 'function'
            ? responder[message.method](message)
            : {}
          child.stdout.write(`${JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result,
          })}\n`)
        }
      }
      newlineIndex = buffer.indexOf('\n')
    }
  })
}

test('codex native proxy lazily injects Pod credentials and Codex base URL at start', async (t) => {
  useTempAutoModeHome(t)
  const { module, cleanup } = await loadAutoModeModule('lib/codex-plugin/codex-native-proxy.ts')
  t.after(() => cleanup())

  const fakeChild = createFakeChild()
  const spawnCalls = []
  let resolveEnvCalls = 0
  const proxy = module.createCodexNativeProxy({
    cwd: '/tmp/demo',
    autoEnabled: true,
    listenPort: 0,
    env: {
      CODEX_API_KEY: 'sk-static',
    },
    async resolveEnv() {
      resolveEnvCalls += 1
      return {
        CODEX_BASE_URL: 'https://codex.example/v1',
        CODEX_API_KEY: 'sk-resolved',
      }
    },
    passthroughArgs: ['--profile', 'linx'],
    spawnProcess(command, args, options) {
      spawnCalls.push({ command, args, options })
      fakeChild.stdin.on('data', () => {
        fakeChild.stdout.write(`${JSON.stringify({
          jsonrpc: '2.0',
          id: 'linx-internal-1',
          result: {},
        })}\n`)
      })
      return fakeChild
    },
    persistToPod: async () => undefined,
    log: { write() {} },
  })
  t.after(() => proxy.close())

  assert.equal(proxy.record.mode, 'auto')
  assert.equal(resolveEnvCalls, 0)

  await proxy.start()

  assert.equal(resolveEnvCalls, 1)
  assert.equal(spawnCalls.length, 1)
  assert.equal(spawnCalls[0].command, 'codex')
  assert.deepEqual(spawnCalls[0].args, [
    'app-server',
    '--listen',
    'stdio://',
    '-c',
    'openai_base_url="https://codex.example/v1"',
    '--profile',
    'linx',
  ])
  assert.equal(spawnCalls[0].options.cwd, '/tmp/demo')
  assert.equal(spawnCalls[0].options.env.CODEX_API_KEY, 'sk-resolved')
  assert.equal(spawnCalls[0].options.env.CODEX_BASE_URL, 'https://codex.example/v1')
  assert.deepEqual(proxy.record.args, spawnCalls[0].args)

})

test('codex native proxy maps backend commands to app-server thread requests', async (t) => {
  useTempAutoModeHome(t)
  const { module, cleanup } = await loadAutoModeModule('lib/codex-plugin/codex-native-proxy.ts')
  t.after(() => cleanup())

  const fakeChild = createFakeChild()
  const requests = []
  const proxy = module.createCodexNativeProxy({
    cwd: '/tmp/demo',
    listenPort: 0,
    spawnProcess() {
      bindJsonRpcResponder(fakeChild, requests, {
        'thread/start': () => ({
          thread: { id: 'codex-thread-1' },
          cwd: '/tmp/demo',
          model: 'gpt-5-codex',
        }),
        'thread/rollback': () => ({
          thread: { id: 'codex-thread-1' },
        }),
      })
      return fakeChild
    },
    persistToPod: async () => undefined,
    log: { write() {} },
  })
  t.after(() => proxy.close())

  const compact = await proxy.executeCommand('/compact')
  const rollback = await proxy.executeCommand('/rollback 2')
  const unknown = await proxy.executeCommand('/unknown')

  assert.equal(compact.handled, true)
  assert.match(compact.message, /Compacting Codex thread codex-thread-1/)
  assert.equal(rollback.handled, true)
  assert.match(rollback.message, /Rolled back 2 Codex turns/)
  assert.deepEqual(unknown, { handled: false })
  assert.equal(proxy.record.backendSessionId, 'codex-thread-1')
  assert.deepEqual(
    requests
      .filter((request) => request.id !== undefined)
      .map((request) => [request.method, request.params]),
    [
      ['initialize', {
        clientInfo: {
          name: 'linx-codex-native-proxy',
          version: '0.1.0',
        },
        capabilities: {
          experimentalApi: true,
        },
      }],
      ['thread/start', {
        cwd: '/tmp/demo',
        sandbox: 'workspace-write',
      }],
      ['thread/compact/start', {
        threadId: 'codex-thread-1',
      }],
      ['thread/rollback', {
        threadId: 'codex-thread-1',
        numTurns: 2,
      }],
    ],
  )

})

test('codex native proxy keeps LinX mode separate from native approval policy', async (t) => {
  useTempAutoModeHome(t)
  const { module, cleanup } = await loadAutoModeModule('lib/codex-plugin/codex-native-proxy.ts')
  t.after(() => cleanup())

  const fakeChild = createFakeChild()
  const requests = []
  let forkCount = 0
  const proxy = module.createCodexNativeProxy({
    cwd: '/tmp/demo',
    autoEnabled: false,
    codexApprovalPolicy: 'on-request',
    listenPort: 0,
    spawnProcess() {
      bindJsonRpcResponder(fakeChild, requests, {
        'thread/start': () => ({
          thread: { id: 'codex-thread-manual' },
          cwd: '/tmp/demo',
        }),
        'thread/fork': () => {
          forkCount += 1
          return {
            thread: { id: `codex-thread-fork-${forkCount}` },
            cwd: '/tmp/demo',
          }
        },
      })
      return fakeChild
    },
    persistToPod: async () => undefined,
    log: { write() {} },
  })
  t.after(() => proxy.close())

  await proxy.startThread()
  await proxy.setAutoEnabled(true)
  await proxy.executeCommand('/fork')

  const threadStart = requests.find((request) => request.method === 'thread/start')
  const forks = requests.filter((request) => request.method === 'thread/fork')

  assert.equal(threadStart.params.approvalPolicy, 'on-request')
  assert.equal(forks.length, 2)
  assert.equal(forks[0].params.approvalPolicy, 'on-request')
  assert.equal(forks[1].params.approvalPolicy, 'on-request')
  assert.equal(proxy.record.mode, 'auto')
})

test('codex native proxy inherits native approval policy unless explicitly configured', async (t) => {
  useTempAutoModeHome(t)
  const { module, cleanup } = await loadAutoModeModule('lib/codex-plugin/codex-native-proxy.ts')
  t.after(() => cleanup())

  const fakeChild = createFakeChild()
  const requests = []
  const proxy = module.createCodexNativeProxy({
    cwd: '/tmp/demo',
    autoEnabled: true,
    listenPort: 0,
    spawnProcess() {
      bindJsonRpcResponder(fakeChild, requests, {
        'thread/start': () => ({
          thread: { id: 'codex-thread-inherit' },
          cwd: '/tmp/demo',
        }),
      })
      return fakeChild
    },
    persistToPod: async () => undefined,
    log: { write() {} },
  })
  t.after(() => proxy.close())

  await proxy.startThread()

  const threadStart = requests.find((request) => request.method === 'thread/start')

  assert.equal(proxy.record.mode, 'auto')
  assert.equal('approvalPolicy' in threadStart.params, false)
})

test('codex native proxy stores /model for later turn/start requests', async (t) => {
  useTempAutoModeHome(t)
  const { module, cleanup } = await loadAutoModeModule('lib/codex-plugin/codex-native-proxy.ts')
  t.after(() => cleanup())

  const fakeChild = createFakeChild()
  const requests = []
  const proxy = module.createCodexNativeProxy({
    cwd: '/tmp/demo',
    listenPort: 0,
    spawnProcess() {
      bindJsonRpcResponder(fakeChild, requests, {
        'thread/start': () => ({
          thread: { id: 'codex-thread-model' },
          cwd: '/tmp/demo',
        }),
      })
      return fakeChild
    },
    persistToPod: async () => undefined,
    log: { write() {} },
  })
  t.after(() => proxy.close())

  const result = await proxy.executeCommand('/model gpt-5.4-mini')
  await proxy.sendTurn('hello')

  assert.equal(result.handled, true)
  assert.match(result.message, /gpt-5\.4-mini/)
  assert.equal(proxy.record.model, 'gpt-5.4-mini')
  const turnStart = requests.find((request) => request.method === 'turn/start')
  assert.deepEqual(turnStart.params, {
    threadId: 'codex-thread-model',
    input: [{ type: 'text', text: 'hello' }],
    model: 'gpt-5.4-mini',
  })

})

test('codex native proxy lists models through the backend command router', async (t) => {
  useTempAutoModeHome(t)
  const { module, cleanup } = await loadAutoModeModule('lib/codex-plugin/codex-native-proxy.ts')
  t.after(() => cleanup())

  const fakeChild = createFakeChild()
  const requests = []
  const proxy = module.createCodexNativeProxy({
    cwd: '/tmp/demo',
    listenPort: 0,
    spawnProcess() {
      bindJsonRpcResponder(fakeChild, requests, {
        'model/list': () => ({
          data: [
            { id: 'gpt-5.4-mini', isDefault: true },
            { id: 'gpt-5.4' },
          ],
        }),
      })
      return fakeChild
    },
    persistToPod: async () => undefined,
    log: { write() {} },
  })
  t.after(() => proxy.close())

  const result = await proxy.executeCommand('/models')

  assert.equal(result.handled, true)
  assert.match(result.message, /gpt-5\.4-mini \(default\)/)
  assert.match(result.message, /gpt-5\.4/)
  assert.equal(requests.some((request) => request.method === 'model/list'), true)

})

test('codex native proxy handles the complete backend slash command surface', async (t) => {
  useTempAutoModeHome(t)
  const { module, cleanup } = await loadAutoModeModule('lib/codex-plugin/codex-native-proxy.ts')
  t.after(() => cleanup())

  const fakeChild = createFakeChild()
  const requests = []
  let threadCounter = 0
  let forkCounter = 0
  const proxy = module.createCodexNativeProxy({
    cwd: '/tmp/demo',
    listenPort: 0,
    spawnProcess() {
      bindJsonRpcResponder(fakeChild, requests, {
        'thread/start': () => {
          threadCounter += 1
          return {
            thread: { id: `codex-thread-${threadCounter}` },
            cwd: '/tmp/demo',
            model: 'gpt-5.4',
          }
        },
        'thread/read': (message) => ({
          thread: {
            id: message.params.threadId,
            name: 'Smoke Thread',
            cwd: '/tmp/demo',
            model: 'gpt-5.4',
          },
        }),
        'thread/name/set': () => ({
          thread: { id: 'codex-thread-2', name: 'Named Thread' },
        }),
        'thread/fork': () => {
          forkCounter += 1
          return {
            thread: { id: `codex-fork-${forkCounter}` },
            cwd: '/tmp/demo',
          }
        },
      })
      return fakeChild
    },
    persistToPod: async () => undefined,
    log: { write() {} },
  })
  t.after(() => proxy.close())

  const commands = [
    ['/commands', /Codex backend commands/],
    ['/new', /Started new Codex thread codex-thread-1/],
    ['/session', /codex-thread-1/],
    ['/status', /codex-thread-1/],
    ['/name Smoke', /Renamed Codex thread codex-thread-1/],
    ['/fork', /Forked Codex thread codex-fork-1/],
  ]

  for (const [command, expectedMessage] of commands) {
    const result = await proxy.executeCommand(command)
    assert.equal(result.handled, true, `${command} should be handled`)
    assert.match(result.message, expectedMessage)
  }

  assert.deepEqual(
    requests
      .filter((request) => [
        'thread/start',
        'thread/read',
        'thread/name/set',
        'thread/fork',
      ].includes(request.method))
      .map((request) => request.method),
    [
      'thread/start',
      'thread/read',
      'thread/read',
      'thread/name/set',
      'thread/fork',
    ],
  )
  assert.equal(proxy.record.backendSessionId, 'codex-fork-1')
})
