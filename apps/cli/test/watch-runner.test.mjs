import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadWatchModule } from './watch-test-bundle.mjs'

function writeExecutable(path, source) {
  writeFileSync(path, source)
  chmodSync(path, 0o755)
}

function createWatchSandbox(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix))
  const binDir = join(root, 'bin')
  const watchHome = join(root, 'watch-home')
  mkdirSync(binDir, { recursive: true })
  return { root, binDir, watchHome }
}

async function withPatchedEnv(t, env, fn) {
  const originals = new Map()

  for (const [key, value] of Object.entries(env)) {
    originals.set(key, process.env[key])
    process.env[key] = value
  }

  t.after(() => {
    for (const [key, value] of originals.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  return fn()
}

test('watch reuses one ACP session across multiple turns', async (t) => {
  const { root, binDir, watchHome } = createWatchSandbox('linx-watch-acp-runner-')
  const logFile = join(root, 'claude-acp-log.jsonl')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  writeExecutable(join(binDir, 'claude'), `#!/usr/bin/env node
if (process.argv[2] === 'auth' && process.argv[3] === 'status' && process.argv[4] === '--json') {
  process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: 'oauth_token', apiProvider: 'firstParty' }) + '\\n')
  process.exit(0)
}
process.exit(1)
`)

  writeExecutable(join(binDir, 'claude-code-acp'), `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({
  argv: process.argv.slice(2),
  apiKey: process.env.ANTHROPIC_API_KEY ?? null,
}) + '\\n')

const rl = readline.createInterface({ input: process.stdin })
let promptCount = 0
const sessionId = 'sess_claude_acp_123'

rl.on('line', (line) => {
  const message = JSON.parse(line)
  appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({ message }) + '\\n')

  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }

  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId } })
    return
  }

  if (message.method === 'session/prompt') {
    promptCount += 1
    const prompt = message.params.prompt[0].text
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: promptCount === 1 ? 'first turn' : 'second turn' },
        },
      },
    })
    write({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } })
    return
  }

  if (message.method === 'session/set_model') {
    write({ jsonrpc: '2.0', id: message.id, result: {} })
  }
})
`)

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  let promptCount = 0
  t.mock.method(module.watchRuntime, 'promptText', async () => {
    promptCount += 1
    return promptCount === 1 ? 'first question' : promptCount === 2 ? 'second question' : '/exit'
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_WATCH_HOME: watchHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runWatch({
      backend: 'claude',
      mode: 'smart',
      cwd: process.cwd(),
      passthroughArgs: [],
    })

    assert.equal(exitCode, 0)
  })

  const logLines = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  const rpcMessages = logLines
    .filter((entry) => entry.message)
    .map((entry) => entry.message)

  const prompts = rpcMessages.filter((message) => message.method === 'session/prompt')
  assert.equal(prompts.length, 2)
  assert.equal(prompts[0].params.sessionId, 'sess_claude_acp_123')
  assert.equal(prompts[1].params.sessionId, 'sess_claude_acp_123')
  assert.equal(prompts[0].params.prompt[0].text, 'first question')
  assert.equal(prompts[1].params.prompt[0].text, 'second question')

  const sessionDirs = readdirSync(join(watchHome, 'sessions'))
  assert.equal(sessionDirs.length, 1)

  const session = JSON.parse(readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'session.json'), 'utf-8'))
  assert.equal(session.backendSessionId, 'sess_claude_acp_123')
  assert.equal(session.transport, 'acp')
  assert.equal(session.status, 'completed')

  const events = readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(events.some((entry) => {
    if (entry.stream !== 'system') {
      return false
    }

    try {
      return JSON.parse(entry.line).type === 'turn.start'
    } catch {
      return false
    }
  }), true)
  assert.equal(events.some((entry) => JSON.stringify(entry).includes('first turn')), true)
  assert.equal(events.some((entry) => JSON.stringify(entry).includes('second turn')), true)
})

test('runWatch injects cloud-backed claude credentials into claude-code-acp', async (t) => {
  const { root, binDir, watchHome } = createWatchSandbox('linx-watch-acp-claude-cloud-')
  const logFile = join(root, 'claude-cloud-log.jsonl')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  writeExecutable(join(binDir, 'claude-code-acp'), `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({
  argv: process.argv.slice(2),
  apiKey: process.env.ANTHROPIC_API_KEY ?? null,
}) + '\\n')

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }
  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_claude_cloud_123' } })
    return
  }
  if (message.method === 'session/prompt') {
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_claude_cloud_123',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'pod-backed turn' },
        },
      },
    })
    write({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } })
  }
})
`)

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  t.mock.method(module.watchRuntime, 'preflightWatchAuth', async () => {
    throw new Error('should not preflight local auth for cloud credential source')
  })

  t.mock.method(module.watchRuntime, 'loadPodBackendCredential', async () => ({
    backend: 'claude',
    provider: 'anthropic',
    env: {
      ANTHROPIC_API_KEY: 'sk-pod-key',
    },
  }))

  t.mock.method(module.watchRuntime, 'promptText', async () => '/exit')

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_WATCH_HOME: watchHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runWatch({
      backend: 'claude',
      mode: 'smart',
      cwd: process.cwd(),
      prompt: 'hello from cloud',
      passthroughArgs: [],
      credentialSource: 'cloud',
    })

    assert.equal(exitCode, 0)
  })

  const invocations = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(invocations.length, 1)
  assert.equal(invocations[0].apiKey, 'sk-pod-key')
  assert.deepEqual(invocations[0].argv, [])

  const sessionDirs = readdirSync(join(watchHome, 'sessions'))
  const session = JSON.parse(readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'session.json'), 'utf-8'))
  assert.equal(session.credentialSource, 'cloud')
  assert.equal(session.resolvedCredentialSource, 'cloud')
  assert.equal(session.transport, 'acp')
})

test('runWatch injects cloud-backed codebuddy credentials into built-in ACP mode', async (t) => {
  const { root, binDir, watchHome } = createWatchSandbox('linx-watch-acp-codebuddy-cloud-')
  const logFile = join(root, 'codebuddy-cloud-log.jsonl')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  writeExecutable(join(binDir, 'codebuddy'), `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({
  argv: process.argv.slice(2),
  apiKey: process.env.CODEBUDDY_API_KEY ?? null,
  baseUrl: process.env.CODEBUDDY_BASE_URL ?? null,
}) + '\\n')

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }
  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_codebuddy_cloud_123' } })
    return
  }
  if (message.method === 'session/prompt') {
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_codebuddy_cloud_123',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'codebuddy pod-backed turn' },
        },
      },
    })
    write({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } })
  }
})
`)

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  t.mock.method(module.watchRuntime, 'preflightWatchAuth', async () => {
    throw new Error('should not preflight local auth for cloud credential source')
  })

  t.mock.method(module.watchRuntime, 'loadPodBackendCredential', async () => ({
    backend: 'codebuddy',
    provider: 'codebuddy',
    env: {
      CODEBUDDY_API_KEY: 'sk-codebuddy-key',
      CODEBUDDY_BASE_URL: 'https://proxy.codebuddy.example/v1',
    },
  }))

  t.mock.method(module.watchRuntime, 'promptText', async () => '/exit')

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_WATCH_HOME: watchHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runWatch({
      backend: 'codebuddy',
      mode: 'smart',
      cwd: process.cwd(),
      prompt: 'hello from codebuddy cloud',
      passthroughArgs: [],
      credentialSource: 'cloud',
    })

    assert.equal(exitCode, 0)
  })

  const invocations = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(invocations.length, 1)
  assert.equal(invocations[0].apiKey, 'sk-codebuddy-key')
  assert.equal(invocations[0].baseUrl, 'https://proxy.codebuddy.example/v1')
  assert.deepEqual(invocations[0].argv, ['--acp', '--acp-transport', 'stdio'])
})

test('runWatch expands OpenAI pod credentials for codex-acp', async (t) => {
  const { root, binDir, watchHome } = createWatchSandbox('linx-watch-acp-codex-cloud-')
  const logFile = join(root, 'codex-cloud-log.jsonl')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  writeExecutable(join(binDir, 'codex-acp'), `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({
  argv: process.argv.slice(2),
  openaiKey: process.env.OPENAI_API_KEY ?? null,
  codexKey: process.env.CODEX_API_KEY ?? null,
}) + '\\n')

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }
  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_codex_cloud_123' } })
    return
  }
  if (message.method === 'session/prompt') {
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_codex_cloud_123',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'codex pod-backed turn' },
        },
      },
    })
    write({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } })
  }
})
`)

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  t.mock.method(module.watchRuntime, 'preflightWatchAuth', async () => {
    throw new Error('should not preflight local auth for cloud credential source')
  })

  t.mock.method(module.watchRuntime, 'loadPodBackendCredential', async () => ({
    backend: 'codex',
    provider: 'openai',
    env: {
      OPENAI_API_KEY: 'sk-openai-key',
    },
  }))

  t.mock.method(module.watchRuntime, 'promptText', async () => '/exit')

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_WATCH_HOME: watchHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runWatch({
      backend: 'codex',
      mode: 'smart',
      cwd: process.cwd(),
      prompt: 'hello from codex cloud',
      passthroughArgs: [],
      credentialSource: 'cloud',
    })

    assert.equal(exitCode, 0)
  })

  const invocations = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(invocations.length, 1)
  assert.equal(invocations[0].openaiKey, 'sk-openai-key')
  assert.equal(invocations[0].codexKey, 'sk-openai-key')
})

test('watch auto-approves trusted ACP permission requests in smart mode', async (t) => {
  const { root, binDir, watchHome } = createWatchSandbox('linx-watch-acp-approval-')
  const logFile = join(root, 'approval-log.jsonl')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  writeExecutable(join(binDir, 'codex-acp'), `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

const rl = readline.createInterface({ input: process.stdin })
let pendingPromptId = null
let pendingPermissionId = null

rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }
  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_approval_123' } })
    return
  }
  if (message.method === 'session/prompt') {
    pendingPromptId = message.id
    pendingPermissionId = 700
    write({
      jsonrpc: '2.0',
      id: pendingPermissionId,
      method: 'session/request_permission',
      params: {
        sessionId: 'sess_approval_123',
        toolCall: {
          toolCallId: 'tool_1',
          title: 'Run shell command',
          kind: 'execute',
          rawInput: { command: 'pwd', cwd: '/tmp/demo' },
        },
        options: [
          { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'allow_always', name: 'Allow always', kind: 'allow_always' },
          { optionId: 'reject_once', name: 'Reject once', kind: 'reject_once' }
        ],
      },
    })
    return
  }
  if (pendingPermissionId !== null && message.id === pendingPermissionId) {
    appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify(message) + '\\n')
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_approval_123',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'approved trusted command' },
        },
      },
    })
    write({ jsonrpc: '2.0', id: pendingPromptId, result: { stopReason: 'end_turn' } })
  }
})
`)

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  t.mock.method(module.watchRuntime, 'promptText', async () => '/exit')

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_WATCH_HOME: watchHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runWatch({
      backend: 'codex',
      mode: 'smart',
      cwd: process.cwd(),
      prompt: 'inspect trusted command',
      passthroughArgs: [],
      credentialSource: 'local',
    })

    assert.equal(exitCode, 0)
  })

  const responses = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(responses.length, 1)
  assert.deepEqual(responses[0].result, {
    outcome: {
      outcome: 'selected',
      optionId: 'allow_once',
    },
  })

  const sessionDirs = readdirSync(join(watchHome, 'sessions'))
  const events = readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /"type":"approval.required"/)
  assert.match(events, /"command":"pwd"/)
})

test('watch lets remote approval win by default and aborts the local approval prompt', async (t) => {
  const { root, binDir, watchHome } = createWatchSandbox('linx-watch-acp-remote-approval-')
  const logFile = join(root, 'remote-approval-log.jsonl')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  writeExecutable(join(binDir, 'codex-acp'), `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

const rl = readline.createInterface({ input: process.stdin })
let pendingPromptId = null
let pendingPermissionId = null

rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }
  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_remote_approval_123' } })
    return
  }
  if (message.method === 'session/prompt') {
    pendingPromptId = message.id
    pendingPermissionId = 711
    write({
      jsonrpc: '2.0',
      id: pendingPermissionId,
      method: 'session/request_permission',
      params: {
        sessionId: 'sess_remote_approval_123',
        toolCall: {
          toolCallId: 'tool_remote_1',
          title: 'Run shell command',
          kind: 'execute',
          rawInput: { command: 'git status', cwd: '/tmp/demo' },
        },
        options: [
          { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'allow_always', name: 'Allow always', kind: 'allow_always' },
          { optionId: 'reject_once', name: 'Reject once', kind: 'reject_once' }
        ],
      },
    })
    return
  }
  if (pendingPermissionId !== null && message.id === pendingPermissionId) {
    appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify(message) + '\\n')
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_remote_approval_123',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'remote approval applied' },
        },
      },
    })
    write({ jsonrpc: '2.0', id: pendingPromptId, result: { stopReason: 'end_turn' } })
  }
})
`)

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  const prompts = []
  const createdApprovals = []
  const waitedApprovals = []
  const resolvedApprovals = []

  t.mock.method(module.watchRuntime, 'promptText', async (prompt, signal) => {
    prompts.push(prompt)
    if (prompt === 'you> ') {
      return '/exit'
    }
    return await new Promise((resolve, reject) => {
      signal?.addEventListener('abort', () => {
        const error = new Error('The operation was aborted.')
        error.name = 'AbortError'
        reject(error)
      }, { once: true })
    })
  })
  t.mock.method(module.watchRuntime, 'createRemoteWatchApproval', async (payload) => {
    createdApprovals.push(payload)
    return { id: 'approval_remote_1' }
  })
  t.mock.method(module.watchRuntime, 'waitForRemoteWatchApproval', async (payload) => {
    waitedApprovals.push(payload)
    return 'accept_for_session'
  })
  t.mock.method(module.watchRuntime, 'resolveRemoteWatchApproval', async (payload) => {
    resolvedApprovals.push(payload)
    return { id: payload.approvalId, decision: payload.decision }
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_WATCH_HOME: watchHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runWatch({
      backend: 'codex',
      mode: 'manual',
      cwd: process.cwd(),
      prompt: 'request remote approval',
      passthroughArgs: [],
      credentialSource: 'local',
    })

    assert.equal(exitCode, 0)
  })

  assert.equal(createdApprovals.length, 1)
  assert.equal(createdApprovals[0].request.kind, 'command-approval')
  assert.equal(createdApprovals[0].request.command, 'git status')
  assert.equal(waitedApprovals.length, 1)
  assert.equal(waitedApprovals[0].approvalId, 'approval_remote_1')
  assert.equal(resolvedApprovals.length, 0)
  assert.equal(prompts.includes('select> '), true)

  const responses = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(responses.length, 1)
  assert.deepEqual(responses[0].result, {
    outcome: {
      outcome: 'selected',
      optionId: 'allow_always',
    },
  })

  const sessionDirs = readdirSync(join(watchHome, 'sessions'))
  const events = readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /Remote approval opened \| approval_remote_1/)
  assert.match(events, /Remote approval resolved \| accept_for_session/)
})

test('watch mirrors a local approval decision back into Pod remote approval state by default', async (t) => {
  const { root, binDir, watchHome } = createWatchSandbox('linx-watch-acp-hybrid-local-first-')
  const logFile = join(root, 'hybrid-local-first-log.jsonl')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  writeExecutable(join(binDir, 'codex-acp'), `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

const rl = readline.createInterface({ input: process.stdin })
let pendingPromptId = null
let pendingPermissionId = null

rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }
  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_hybrid_local_123' } })
    return
  }
  if (message.method === 'session/prompt') {
    pendingPromptId = message.id
    pendingPermissionId = 712
    write({
      jsonrpc: '2.0',
      id: pendingPermissionId,
      method: 'session/request_permission',
      params: {
        sessionId: 'sess_hybrid_local_123',
        toolCall: {
          toolCallId: 'tool_hybrid_local_1',
          title: 'Run shell command',
          kind: 'execute',
          rawInput: { command: 'git diff --stat', cwd: '/tmp/demo' },
        },
        options: [
          { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'allow_always', name: 'Allow always', kind: 'allow_always' },
          { optionId: 'reject_once', name: 'Reject once', kind: 'reject_once' }
        ],
      },
    })
    return
  }
  if (pendingPermissionId !== null && message.id === pendingPermissionId) {
    appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify(message) + '\\n')
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_hybrid_local_123',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'local approval applied' },
        },
      },
    })
    write({ jsonrpc: '2.0', id: pendingPromptId, result: { stopReason: 'end_turn' } })
  }
})
`)

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  const createdApprovals = []
  const waitedApprovals = []
  const resolvedApprovals = []

  t.mock.method(module.watchRuntime, 'promptText', async (prompt) => {
    if (prompt === 'select> ') {
      return 's'
    }
    return '/exit'
  })
  t.mock.method(module.watchRuntime, 'createRemoteWatchApproval', async (payload) => {
    createdApprovals.push(payload)
    return { id: 'approval_local_1' }
  })
  t.mock.method(module.watchRuntime, 'waitForRemoteWatchApproval', async (payload) => {
    waitedApprovals.push(payload)
    return await new Promise(() => {})
  })
  t.mock.method(module.watchRuntime, 'resolveRemoteWatchApproval', async (payload) => {
    resolvedApprovals.push(payload)
    return { id: payload.approvalId, decision: payload.decision }
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_WATCH_HOME: watchHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runWatch({
      backend: 'codex',
      mode: 'manual',
      cwd: process.cwd(),
      prompt: 'request local approval first',
      passthroughArgs: [],
      credentialSource: 'local',
    })

    assert.equal(exitCode, 0)
  })

  assert.equal(createdApprovals.length, 1)
  assert.equal(waitedApprovals.length, 1)
  assert.equal(resolvedApprovals.length, 1)
  assert.equal(resolvedApprovals[0].approvalId, 'approval_local_1')
  assert.equal(resolvedApprovals[0].decision, 'accept_for_session')

  const responses = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(responses.length, 1)
  assert.deepEqual(responses[0].result, {
    outcome: {
      outcome: 'selected',
      optionId: 'allow_always',
    },
  })

  const sessionDirs = readdirSync(join(watchHome, 'sessions'))
  const events = readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /Remote approval opened \| approval_local_1/)
  assert.match(events, /Local approval resolved \| accept_for_session/)
})

test('watch batches multi-question ACP user input responses into one payload', async (t) => {
  const { root, binDir, watchHome } = createWatchSandbox('linx-watch-acp-input-')
  const logFile = join(root, 'input-log.jsonl')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  writeExecutable(join(binDir, 'codex-acp'), `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

const rl = readline.createInterface({ input: process.stdin })
let pendingPromptId = null
let pendingInputId = null

rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }
  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_input_123' } })
    return
  }
  if (message.method === 'session/prompt') {
    pendingPromptId = message.id
    pendingInputId = 901
    write({
      jsonrpc: '2.0',
      id: pendingInputId,
      method: 'session/request_input',
      params: {
        questions: [
          {
            id: 'runtime',
            header: 'Runtime',
            question: 'Choose runtime',
            options: [
              { label: 'local' },
              { label: 'cloud', description: 'Use Pod credentials' }
            ]
          },
          {
            id: 'goal',
            header: 'Goal',
            question: 'Describe the goal',
            options: []
          }
        ]
      },
    })
    return
  }
  if (pendingInputId !== null && message.id === pendingInputId) {
    appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify(message) + '\\n')
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_input_123',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'received structured input' },
        },
      },
    })
    write({ jsonrpc: '2.0', id: pendingPromptId, result: { stopReason: 'end_turn' } })
  }
})
`)

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  const prompts = []
  t.mock.method(module.watchRuntime, 'promptText', async (prompt) => {
    prompts.push(prompt)
    if (prompt === 'select> ') {
      return '2'
    }
    if (prompt === 'answer> ') {
      return 'Need a Codex-like multi-step request flow'
    }
    return '/exit'
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_WATCH_HOME: watchHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runWatch({
      backend: 'codex',
      mode: 'manual',
      cwd: process.cwd(),
      prompt: 'answer multiple questions',
      passthroughArgs: [],
      credentialSource: 'local',
    })

    assert.equal(exitCode, 0)
  })

  assert.ok(prompts.includes('select> '))
  assert.ok(prompts.includes('answer> '))

  const responses = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(responses.length, 1)
  assert.deepEqual(responses[0].result, {
    answers: {
      runtime: {
        answers: ['cloud'],
      },
      goal: {
        answers: ['Need a Codex-like multi-step request flow'],
      },
    },
  })

  const sessionDirs = readdirSync(join(watchHome, 'sessions'))
  const events = readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /"type":"input.required"/)
  assert.match(events, /"question":"Choose runtime"/)
  assert.match(events, /"question":"Describe the goal"/)
})


test('watch with an initial prompt does not emit an extra empty prompt turn before the scripted turn', async (t) => {
  const { root, binDir, watchHome } = createWatchSandbox('linx-watch-initial-prompt-')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  writeExecutable(join(binDir, 'codex-acp'), `#!/usr/bin/env node
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }
  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_initial_prompt_123' } })
    return
  }
  if (message.method === 'session/prompt') {
    write({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'sess_initial_prompt_123', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } } } })
    write({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } })
  }
})
`)

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  const prompts = []
  t.mock.method(module.watchRuntime, 'promptText', async (prompt) => {
    prompts.push(prompt)
    return '/exit'
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_WATCH_HOME: watchHome,
  }, async () => {
    const exitCode = await module.runWatch({
      backend: 'codex',
      mode: 'smart',
      cwd: process.cwd(),
      prompt: 'Reply with exactly hi',
      passthroughArgs: [],
      credentialSource: 'local',
    })

    assert.equal(exitCode, 0)
  })

  assert.deepEqual(prompts, [])
})

test('watch /model surfaces ACP failure without mutating the model state', async (t) => {
  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  const root = mkdtempSync(join(tmpdir(), 'linx-watch-model-command-'))
  const archiveDir = join(root, 'session')
  mkdirSync(archiveDir, { recursive: true })
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const activity = []
  const record = {
    id: 'watch_model_command_123',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
    mode: 'manual',
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    prompt: undefined,
    passthroughArgs: [],
    credentialSource: 'local',
    resolvedCredentialSource: 'local',
    approvalSource: 'hybrid',
    command: 'codex-acp',
    args: [],
    status: 'running',
    startedAt: '2026-04-17T00:00:00.000Z',
    archiveDir,
    eventsFile: join(archiveDir, 'events.jsonl'),
  }

  const display = {
    showHelp() {},
    showQuestion() {},
    showUserTurn() {},
    renderEvents() {},
    renderRawLine() {},
    start() {},
    updateRecord() {},
    updateQueue() {},
    bindInputController() {},
    setPhase() {},
    chooseOption: async () => 'y',
    chooseQuestions: async () => ({}),
    chooseQuestion: async () => '',
    promptInput: async () => ({ text: '', mode: 'send' }),
    finish() {},
    showActivity(message, tone = 'note') {
      activity.push({ message, tone })
    },
  }

  await module.__testHandleWatchShellCommand({
    input: '/model gpt-5.4',
    session: {
      async setModel() {
        throw new Error('Invalid params')
      },
    },
    display,
    queueState: { steeringCount: 0, followUpCount: 0 },
    backend: 'codex',
    record,
  })

  assert.deepEqual(activity, [
    { message: 'Model switch failed | Invalid params', tone: 'error' },
  ])
  assert.equal(record.model, 'gpt-5-codex')
})

test('watch /debug toggles full-fidelity protocol view without affecting the main session state', async (t) => {
  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  const root = mkdtempSync(join(tmpdir(), 'linx-watch-debug-command-'))
  const archiveDir = join(root, 'session')
  mkdirSync(archiveDir, { recursive: true })
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const debugModes = []
  const record = {
    id: 'watch_debug_command_123',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
    mode: 'manual',
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    prompt: undefined,
    passthroughArgs: [],
    credentialSource: 'local',
    resolvedCredentialSource: 'local',
    approvalSource: 'hybrid',
    command: 'codex-acp',
    args: [],
    status: 'running',
    startedAt: '2026-04-17T00:00:00.000Z',
    archiveDir,
    eventsFile: join(archiveDir, 'events.jsonl'),
  }

  const display = {
    showHelp() {},
    showQuestion() {},
    showUserTurn() {},
    renderEvents() {},
    renderRawLine() {},
    start() {},
    updateRecord() {},
    updateQueue() {},
    bindInputController() {},
    setPhase() {},
    chooseOption: async () => 'y',
    chooseQuestions: async () => ({}),
    chooseQuestion: async () => '',
    promptInput: async () => ({ text: '', mode: 'send' }),
    finish() {},
    showActivity() {},
    setDebugMode(enabled) {
      debugModes.push(enabled)
    },
  }

  await module.__testHandleWatchShellCommand({
    input: '/debug on',
    session: { async setModel() {} },
    display,
    queueState: { steeringCount: 0, followUpCount: 0 },
    backend: 'codex',
    record,
  })

  await module.__testHandleWatchShellCommand({
    input: '/debug off',
    session: { async setModel() {} },
    display,
    queueState: { steeringCount: 0, followUpCount: 0 },
    backend: 'codex',
    record,
  })

  assert.deepEqual(debugModes, [true, false])
})

test('watch persists the final conversation to Pod opportunistically without breaking local success', async (t) => {
  const { root, binDir, watchHome } = createWatchSandbox('linx-watch-pod-persist-')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  writeExecutable(join(binDir, 'codex-acp'), `#!/usr/bin/env node
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }
  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_codex_persist_123' } })
    return
  }
  if (message.method === 'session/prompt') {
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_codex_persist_123',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'persist me to pod' },
        },
      },
    })
    write({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } })
  }
})
`)

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  const persisted = []
  t.mock.method(module.watchRuntime, 'promptText', async () => '/exit')
  t.mock.method(module.watchRuntime, 'persistWatchConversationToPod', async (record) => {
    persisted.push(record)
    throw new Error('ignore pod persistence errors')
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_WATCH_HOME: watchHome,
  }, async () => {
    const exitCode = await module.runWatch({
      backend: 'codex',
      mode: 'smart',
      cwd: process.cwd(),
      prompt: 'persist conversation',
      passthroughArgs: [],
      credentialSource: 'local',
    })

    assert.equal(exitCode, 0)
  })

  assert.equal(persisted.length, 1)
  assert.equal(persisted[0].status, 'completed')
  assert.equal(persisted[0].backend, 'codex')
  assert.equal(typeof persisted[0].endedAt, 'string')
})
