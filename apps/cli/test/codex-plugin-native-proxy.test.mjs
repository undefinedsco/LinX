import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { loadWatchModule } from './watch-test-bundle.mjs'

function randomPort(base = 8800) {
  return base + Math.floor(Math.random() * 1000)
}

function createFakeChild() {
  const stdinWrites = []
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const child = {
    stdin: {
      write(chunk) {
        stdinWrites.push(String(chunk))
        return true
      },
    },
    stdout,
    stderr,
    killed: false,
    on(event, handler) {
      if (event === 'exit') {
        child._onExit = handler
      }
      return child
    },
    kill() {
      child.killed = true
      if (child._onExit) {
        child._onExit(0, null)
      }
      return true
    },
    stdoutSetEncoding: null,
    stderrSetEncoding: null,
    _onExit: null,
  }

  stdout.setEncoding('utf-8')
  stderr.setEncoding('utf-8')
  child.stdout.setEncoding = () => {}
  child.stderr.setEncoding = () => {}

  return { child, stdinWrites, stdout, stderr }
}

test('codex native proxy answers initialize/account and forwards unknown requests to app-server child', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/codex-plugin/codex-native-proxy.ts')
  t.after(() => cleanup())

  const { child, stdinWrites, stdout } = createFakeChild()
  const logChunks = []

  const proxy = module.createCodexNativeProxy({
    cwd: '/tmp/demo',
    listenPort: randomPort(),
    spawnProcess() {
      return child
    },
    log: {
      write(chunk) {
        logChunks.push(String(chunk))
        return true
      },
    },
  })

  await proxy.start()

  const { WebSocket } = await import('ws')
  const ws = new WebSocket(proxy.remoteUrl)
  const received = []

  await new Promise((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })

  ws.on('message', (buf) => {
    received.push(JSON.parse(String(buf)))
  })

  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 'initialize',
    method: 'initialize',
    params: {
      clientInfo: {
        name: 'codex-tui',
        version: '0.121.0',
      },
    },
  }))

  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'account/read',
    params: {
      refreshToken: false,
    },
  }))

  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'thread/start',
    params: {
      cwd: '/tmp/demo',
    },
  }))

  stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    result: {
      thread: {
        id: 'thread_proxy_1',
      },
      cwd: '/tmp/demo',
      model: 'gpt-5-codex',
    },
  })}\n`)
  stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'thread/started',
    params: {
      thread: {
        id: 'thread_proxy_1',
      },
    },
  })}\n`)

  await new Promise((resolve) => setTimeout(resolve, 100))

  const initializeResponse = received.find((message) => message.id === 'initialize')
  const accountResponse = received.find((message) => message.id === 1)
  const threadStartResponse = received.find((message) => message.id === 2)
  const threadStarted = received.find((message) => message.method === 'thread/started')

  assert.equal(initializeResponse.result.platformFamily, 'unix')
  assert.equal(accountResponse.result.requiresOpenaiAuth, false)
  assert.equal(threadStartResponse.result.thread.id, 'thread_proxy_1')
  assert.equal(threadStarted.method, 'thread/started')
  assert.equal(stdinWrites.length, 1)
  assert.match(stdinWrites[0], /"method":"thread\/start"/)
  assert.match(logChunks.join(''), /codex native proxy listening/)

  ws.close()
  await proxy.close()
})

test('codex native proxy routes app-server approval requests through attach bridge responses', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/codex-plugin/codex-native-proxy.ts')
  t.after(() => cleanup())

  const { child, stdout } = createFakeChild()
  const proxy = module.createCodexNativeProxy({
    cwd: '/tmp/demo',
    listenPort: randomPort(),
    spawnProcess() {
      return child
    },
    runtime: {
      async createRemoteWatchApproval() {
        return { id: 'approval_native_proxy_1' }
      },
      async waitForRemoteWatchApproval() {
        return 'accept_for_session'
      },
    },
  })

  await proxy.start()

  const { WebSocket } = await import('ws')
  const ws = new WebSocket(proxy.remoteUrl)
  const received = []

  await new Promise((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })

  ws.on('message', (buf) => {
    received.push(JSON.parse(String(buf)))
  })

  stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 9,
    method: 'item/commandExecution/requestApproval',
    params: {
      command: 'pwd',
      cwd: '/tmp/demo',
      itemId: 'item_1',
      threadId: 'thread_1',
      turnId: 'turn_1',
    },
  })}\n`)

  await new Promise((resolve) => setTimeout(resolve, 100))

  assert.deepEqual(received, [
    {
      jsonrpc: '2.0',
      id: 9,
      result: { decision: 'acceptForSession' },
    },
  ])

  ws.close()
  await proxy.close()
})

test('codex native proxy forwards thread/start and turn/start through the child app-server', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/codex-plugin/codex-native-proxy.ts')
  t.after(() => cleanup())

  const { child, stdinWrites, stdout } = createFakeChild()
  const proxy = module.createCodexNativeProxy({
    cwd: '/tmp/demo',
    listenPort: randomPort(),
    spawnProcess() {
      return child
    },
  })

  await proxy.start()

  const { WebSocket } = await import('ws')
  const ws = new WebSocket(proxy.remoteUrl)
  const received = []

  await new Promise((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })

  ws.on('message', (buf) => {
    received.push(JSON.parse(String(buf)))
  })

  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 10,
    method: 'thread/start',
    params: {
      cwd: '/tmp/demo',
      model: 'gpt-5-codex',
    },
  }))

  stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 10,
    result: {
      thread: {
        id: 'thread_real_1',
      },
      cwd: '/tmp/demo',
      model: 'gpt-5-codex',
    },
  })}\n`)
  stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'thread/started',
    params: {
      thread: {
        id: 'thread_real_1',
      },
    },
  })}\n`)

  await new Promise((resolve) => setTimeout(resolve, 50))

  const threadId = received[0].result.thread.id
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 11,
    method: 'turn/start',
    params: {
      threadId,
      input: [{ type: 'text', text: 'reply with exactly hi' }],
    },
  }))

  stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 11,
    result: {
      turn: {
        id: 'turn_real_1',
        items: [],
        status: 'inProgress',
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null,
      },
    },
  })}\n`)
  stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'thread/status/changed',
    params: {
      threadId,
      status: {
        type: 'active',
        activeFlags: [],
      },
    },
  })}\n`)
  stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'turn/started',
    params: {
      threadId,
      turn: {
        id: 'turn_real_1',
        items: [],
        status: 'inProgress',
        startedAt: Date.now(),
      },
    },
  })}\n`)

  await new Promise((resolve) => setTimeout(resolve, 100))

  const threadStartResponse = received.find((message) => message.id === 10)
  const threadStarted = received.find((message) => message.method === 'thread/started')
  const turnStartResponse = received.find((message) => message.id === 11)
  const threadStatusChanged = received.find((message) => message.method === 'thread/status/changed')
  const turnStarted = received.find((message) => message.method === 'turn/started')

  assert.equal(threadStartResponse.id, 10)
  assert.equal(threadStarted.method, 'thread/started')
  assert.equal(turnStartResponse.id, 11)
  assert.equal(threadStatusChanged.method, 'thread/status/changed')
  assert.equal(turnStarted.method, 'turn/started')
  assert.equal(stdinWrites.length, 2)
  assert.match(stdinWrites[0], /"method":"thread\/start"/)
  assert.match(stdinWrites[1], /"method":"turn\/start"/)

  ws.close()
  await proxy.close()
})

test('codex native proxy startThread requests a thread id once and reuses it for later turns', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/codex-plugin/codex-native-proxy.ts')
  t.after(() => cleanup())

  const { child, stdinWrites, stdout } = createFakeChild()
  const proxy = module.createCodexNativeProxy({
    cwd: '/tmp/demo',
    listenPort: randomPort(),
    spawnProcess() {
      return child
    },
  })

  await proxy.start()

  const startThreadPromise = proxy.startThread()
  stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 'linx-internal-1',
    result: {
      thread: {
        id: 'thread_reused_1',
      },
      cwd: '/tmp/demo',
      model: 'gpt-5-codex',
    },
  })}\n`)

  const threadId = await startThreadPromise
  assert.equal(threadId, 'thread_reused_1')
  assert.equal(proxy.record.backendSessionId, 'thread_reused_1')

  await proxy.sendTurn('hello again')
  assert.equal(stdinWrites.length, 2)
  assert.match(stdinWrites[0], /"method":"thread\/start"/)
  assert.match(stdinWrites[1], /"method":"turn\/start"/)
  assert.doesNotMatch(stdinWrites[1], /linx-internal/)

  await proxy.close()
})

test('codex native proxy archives assistant deltas and turn completion from child notifications', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/codex-plugin/codex-native-proxy.ts')
  t.after(() => cleanup())

  const { child, stdout } = createFakeChild()
  const proxy = module.createCodexNativeProxy({
    cwd: '/tmp/demo',
    listenPort: randomPort(),
    spawnProcess() {
      return child
    },
  })

  await proxy.start()

  stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'item/agentMessage/delta',
    params: {
      delta: 'hello',
      threadId: 'thread_real_1',
      turnId: 'turn_real_1',
      itemId: 'item_assistant_1',
    },
  })}\n`)
  stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    method: 'turn/completed',
    params: {
      threadId: 'thread_real_1',
      turn: {
        id: 'turn_real_1',
        status: 'completed',
      },
    },
  })}\n`)

  await new Promise((resolve) => setTimeout(resolve, 100))

  const events = readFileSync(proxy.record.eventsFile, 'utf-8')
  assert.match(events, /item\/agentMessage\/delta/)
  assert.match(events, /turn\/completed/)
  assert.match(events, /"type":"assistant\.delta"/)
  assert.match(events, /"type":"assistant\.done"/)

  await proxy.close()
})

test('codex native proxy persists archived conversation to Pod on child exit', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/codex-plugin/codex-native-proxy.ts')
  t.after(() => cleanup())

  const persisted = []
  const { child } = createFakeChild()
  const proxy = module.createCodexNativeProxy({
    cwd: '/tmp/demo',
    listenPort: randomPort(),
    spawnProcess() {
      return child
    },
    async persistToPod(record) {
      persisted.push(record)
      return true
    },
  })

  await proxy.start()
  child.kill()
  await new Promise((resolve) => setTimeout(resolve, 100))

  assert.equal(persisted.length, 1)
  assert.equal(persisted[0].id, proxy.record.id)
})
