import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

function writeExecutable(path, source) {
  writeFileSync(path, source)
  chmodSync(path, 0o755)
}

function createAutoModeSandbox(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix))
  const binDir = join(root, 'bin')
  const autoModeHome = join(root, 'auto-mode-home')
  mkdirSync(binDir, { recursive: true })
  return { root, binDir, autoModeHome }
}

function writeFakeAcpBackend(path, options) {
  const sessionId = options.sessionId
  const reply = options.reply
  const envKeys = options.envKeys ?? []
  const extra = options.extra ?? {}
  writeExecutable(path, `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({
  argv: process.argv.slice(2),
  env: Object.fromEntries(${JSON.stringify(envKeys)}.map((key) => [key, process.env[key] ?? null])),
  extra: ${JSON.stringify(extra)},
}) + '\\n')

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }
  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: ${JSON.stringify(sessionId)} } })
    return
  }
  if (message.method === 'session/prompt') {
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: ${JSON.stringify(sessionId)},
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: ${JSON.stringify(reply)} },
        },
      },
    })
    write({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } })
  }
})
`)
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

function mockPodBackendCredential(t, module, backend = 'codex', env, options = {}) {
  const credentialEnv = env ?? {
    CODEX_API_KEY: 'sk-pod-openai',
  }

  t.mock.method(module.autoModeRuntime, 'loadPodBackendCredential', async (requestedBackend) => {
    assert.equal(requestedBackend, backend)
    return {
      backend,
      provider: backend === 'claude' ? 'anthropic' : backend === 'codebuddy' ? 'codebuddy' : 'openai',
      env: credentialEnv,
    }
  })

  if (options.persist !== false) {
    t.mock.method(module.autoModeRuntime, 'persistAutoModeConversationToPod', async () => {})
  }
}

test('auto-mode reuses one ACP session across multiple turns', async (t) => {
  const { root, binDir, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-runner-')
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

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  mockPodBackendCredential(t, module, 'claude', {
    ANTHROPIC_API_KEY: 'sk-pod-anthropic',
  })

  let promptCount = 0
  t.mock.method(module.autoModeRuntime, 'promptText', async () => {
    promptCount += 1
    return promptCount === 1 ? 'first question' : promptCount === 2 ? 'second question' : '/exit'
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
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

  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  assert.equal(sessionDirs.length, 1)

  const session = JSON.parse(readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'session.json'), 'utf-8'))
  assert.equal(session.backendSessionId, 'sess_claude_acp_123')
  assert.equal(session.transport, 'acp')
  assert.equal(session.status, 'completed')

  const events = readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
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

test('auto-mode injects cloud-backed claude credentials into claude-code-acp', async (t) => {
  const { root, binDir, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-claude-cloud-')
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

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  t.mock.method(module.autoModeRuntime, 'preflightAutoModeAuth', async () => {
    throw new Error('should not preflight local auth for cloud credential source')
  })

  t.mock.method(module.autoModeRuntime, 'loadPodBackendCredential', async () => ({
    backend: 'claude',
    provider: 'anthropic',
    env: {
      ANTHROPIC_API_KEY: 'sk-pod-key',
    },
  }))
  t.mock.method(module.autoModeRuntime, 'persistAutoModeConversationToPod', async () => {})

  t.mock.method(module.autoModeRuntime, 'promptText', async () => '/exit')

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
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

  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  const session = JSON.parse(readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'session.json'), 'utf-8'))
  assert.equal(session.credentialSource, 'cloud')
  assert.equal(session.resolvedCredentialSource, 'cloud')
  assert.equal(session.transport, 'acp')
})

test('auto-mode prompts for missing Pod provider key, saves it, and retries startup without archiving the key', async (t) => {
  const { root, binDir, autoModeHome } = createAutoModeSandbox('linx-auto-mode-missing-key-')
  const logFile = join(root, 'missing-key-codex-log.jsonl')

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
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_missing_key_123' } })
    return
  }
  if (message.method === 'session/prompt') {
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_missing_key_123',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'started after key save' },
        },
      },
    })
    write({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } })
  }
})
`)

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  let loadCalls = 0
  t.mock.method(module.autoModeRuntime, 'loadPodBackendCredential', async (backend) => {
    assert.equal(backend, 'codex')
    loadCalls += 1
    if (loadCalls === 1) {
      return null
    }
    return {
      backend: 'codex',
      provider: 'openai',
      env: {
        CODEX_API_KEY: 'sk-entered-openai',
      },
    }
  })

  const savedCredentials = []
  t.mock.method(module.autoModeRuntime, 'connectAiProviderCredential', async (input) => {
    savedCredentials.push(input)
    return {
      providerId: input.provider,
      maskedApiKey: 'sk-e****enai',
    }
  })
  t.mock.method(module.autoModeRuntime, 'persistAutoModeConversationToPod', async () => {})

  let promptCount = 0
  t.mock.method(module.autoModeRuntime, 'promptText', async (prompt) => {
    promptCount += 1
    if (prompt === 'secret> ') {
      return 'sk-entered-openai'
    }
    return '/exit'
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
    LINX_AUTO_MODE_PLAIN: '1',
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
      mode: 'smart',
      cwd: process.cwd(),
      prompt: 'hello after missing key',
      passthroughArgs: [],
      commandOverride: join(binDir, 'codex-acp'),
    })

    assert.equal(exitCode, 0)
  })

  assert.equal(loadCalls, 2)
  assert.equal(promptCount, 1)
  assert.deepEqual(savedCredentials, [{
    provider: 'openai',
    apiKey: 'sk-entered-openai',
  }])

  const invocation = JSON.parse(readFileSync(logFile, 'utf-8').trim())
  assert.equal(invocation.openaiKey, null)
  assert.equal(invocation.codexKey, 'sk-entered-openai')

  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  assert.equal(sessionDirs.length, 1)
  const events = readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.doesNotMatch(events, /sk-entered-openai/)
})

test('auto-mode injects cloud-backed codebuddy credentials into built-in ACP mode', async (t) => {
  const { root, binDir, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-codebuddy-cloud-')
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

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  t.mock.method(module.autoModeRuntime, 'preflightAutoModeAuth', async () => {
    throw new Error('should not preflight local auth for cloud credential source')
  })

  t.mock.method(module.autoModeRuntime, 'loadPodBackendCredential', async () => ({
    backend: 'codebuddy',
    provider: 'codebuddy',
    env: {
      CODEBUDDY_API_KEY: 'sk-codebuddy-key',
      CODEBUDDY_BASE_URL: 'https://proxy.codebuddy.example/v1',
    },
  }))
  t.mock.method(module.autoModeRuntime, 'persistAutoModeConversationToPod', async () => {})

  t.mock.method(module.autoModeRuntime, 'promptText', async () => '/exit')

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
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

test('auto-mode expands OpenAI pod credentials for codex-acp', async (t) => {
  const { root, binDir, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-codex-cloud-')
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
  codexBaseUrl: process.env.CODEX_BASE_URL ?? null,
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

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  t.mock.method(module.autoModeRuntime, 'preflightAutoModeAuth', async () => {
    throw new Error('should not preflight local auth for cloud credential source')
  })

  t.mock.method(module.autoModeRuntime, 'loadPodBackendCredential', async () => ({
    backend: 'codex',
    provider: 'openai',
    env: {
      CODEX_API_KEY: 'sk-openai-key',
      CODEX_BASE_URL: 'https://api.openai.com/v1',
    },
  }))
  t.mock.method(module.autoModeRuntime, 'persistAutoModeConversationToPod', async () => {})

  t.mock.method(module.autoModeRuntime, 'promptText', async () => '/exit')

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
      mode: 'smart',
      cwd: process.cwd(),
      prompt: 'hello from codex cloud',
      passthroughArgs: [],
      credentialSource: 'cloud',
      commandOverride: join(binDir, 'codex-acp'),
    })

    assert.equal(exitCode, 0)
  })

  const invocations = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(invocations.length, 1)
  assert.equal(invocations[0].openaiKey, null)
  assert.equal(invocations[0].codexKey, 'sk-openai-key')
  assert.equal(invocations[0].codexBaseUrl, 'https://api.openai.com/v1')
  assert.deepEqual(invocations[0].argv, ['-c', 'openai_base_url="https://api.openai.com/v1"'])
})

test('auto-mode runs every backend through Pod credentials, ACP chat, and Pod persistence', async (t) => {
  const cases = [
    {
      backend: 'codex',
      command: 'codex-acp',
      commandOverride: 'codex-acp',
      sessionId: 'sess_matrix_codex_123',
      reply: 'codex matrix reply',
      credentialEnv: { CODEX_API_KEY: 'sk-matrix-openai' },
      expectedEnv: {
        CODEX_API_KEY: 'sk-matrix-openai',
      },
      expectedArgs: [],
    },
    {
      backend: 'claude',
      command: 'claude-code-acp',
      sessionId: 'sess_matrix_claude_123',
      reply: 'claude matrix reply',
      credentialEnv: { ANTHROPIC_API_KEY: 'sk-matrix-anthropic' },
      expectedEnv: { ANTHROPIC_API_KEY: 'sk-matrix-anthropic' },
      expectedArgs: [],
    },
    {
      backend: 'codebuddy',
      command: 'codebuddy',
      sessionId: 'sess_matrix_codebuddy_123',
      reply: 'codebuddy matrix reply',
      credentialEnv: {
        CODEBUDDY_API_KEY: 'sk-matrix-codebuddy',
        CODEBUDDY_BASE_URL: 'https://proxy.codebuddy.example/v1',
      },
      expectedEnv: {
        CODEBUDDY_API_KEY: 'sk-matrix-codebuddy',
        CODEBUDDY_BASE_URL: 'https://proxy.codebuddy.example/v1',
      },
      expectedArgs: ['--acp', '--acp-transport', 'stdio'],
    },
  ]

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  for (const item of cases) {
    await t.test(item.backend, async (t) => {
      const { root, binDir, autoModeHome } = createAutoModeSandbox(`linx-auto-mode-matrix-${item.backend}-`)
      const logFile = join(root, `${item.backend}-matrix-log.jsonl`)
      const commandPath = join(binDir, item.command)
      const persisted = []

      t.after(() => {
        rmSync(root, { recursive: true, force: true })
      })

      writeFakeAcpBackend(commandPath, {
        sessionId: item.sessionId,
        reply: item.reply,
        envKeys: Object.keys(item.expectedEnv),
      })

      t.mock.method(module.autoModeRuntime, 'preflightAutoModeAuth', async () => {
        throw new Error('auto-mode backend validation must not fall back to local auth')
      })
      t.mock.method(module.autoModeRuntime, 'loadPodBackendCredential', async (requestedBackend) => {
        assert.equal(requestedBackend, item.backend)
        return {
          backend: item.backend,
          provider: item.backend === 'claude' ? 'anthropic' : item.backend === 'codebuddy' ? 'codebuddy' : 'openai',
          env: item.credentialEnv,
        }
      })
      t.mock.method(module.autoModeRuntime, 'persistAutoModeConversationToPod', async (record) => {
        persisted.push(record)
        return true
      })
      t.mock.method(module.autoModeRuntime, 'promptText', async () => '/exit')

      await withPatchedEnv(t, {
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        LINX_AUTO_MODE_HOME: autoModeHome,
        FAKE_ACP_LOG: logFile,
      }, async () => {
        const exitCode = await module.runAutoMode({
          backend: item.backend,
          mode: 'smart',
          cwd: process.cwd(),
          prompt: `matrix ${item.backend}`,
          passthroughArgs: [],
          credentialSource: 'cloud',
          ...(item.commandOverride ? { commandOverride: commandPath } : {}),
        })

        assert.equal(exitCode, 0)
      })

      const invocations = readFileSync(logFile, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
      assert.equal(invocations.length, 1)
      assert.deepEqual(invocations[0].env, item.expectedEnv)
      assert.deepEqual(invocations[0].argv, item.expectedArgs)

      assert.equal(persisted.length, 1)
      assert.equal(persisted[0].backend, item.backend)
      assert.equal(persisted[0].backendSessionId, item.sessionId)
      assert.equal(persisted[0].credentialSource, 'cloud')
      assert.equal(persisted[0].resolvedCredentialSource, 'cloud')
      assert.equal(persisted[0].transport, 'acp')
      assert.equal(persisted[0].status, 'completed')

      const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
      assert.equal(sessionDirs.length, 1)
      const events = readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
      assert.match(events, new RegExp(`matrix ${item.backend}`))
      assert.match(events, new RegExp(item.reply))
    })
  }
})

test('auto-mode runs every backend through ACP approval control and Pod persistence', async (t) => {
  const cases = [
    {
      backend: 'codex',
      command: 'codex-acp',
      commandOverride: 'codex-acp',
      sessionId: 'sess_matrix_approval_codex_123',
      credentialEnv: { CODEX_API_KEY: 'sk-approval-openai' },
      expectedEnv: {
        CODEX_API_KEY: 'sk-approval-openai',
      },
      expectedArgs: [],
    },
    {
      backend: 'claude',
      command: 'claude-code-acp',
      sessionId: 'sess_matrix_approval_claude_123',
      credentialEnv: { ANTHROPIC_API_KEY: 'sk-approval-anthropic' },
      expectedEnv: { ANTHROPIC_API_KEY: 'sk-approval-anthropic' },
      expectedArgs: [],
    },
    {
      backend: 'codebuddy',
      command: 'codebuddy',
      sessionId: 'sess_matrix_approval_codebuddy_123',
      credentialEnv: {
        CODEBUDDY_API_KEY: 'sk-approval-codebuddy',
        CODEBUDDY_BASE_URL: 'https://proxy.codebuddy.example/v1',
      },
      expectedEnv: {
        CODEBUDDY_API_KEY: 'sk-approval-codebuddy',
        CODEBUDDY_BASE_URL: 'https://proxy.codebuddy.example/v1',
      },
      expectedArgs: ['--acp', '--acp-transport', 'stdio'],
    },
  ]

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  for (const item of cases) {
    await t.test(item.backend, async (t) => {
      const { root, binDir, autoModeHome } = createAutoModeSandbox(`linx-auto-mode-approval-matrix-${item.backend}-`)
      const logFile = join(root, `${item.backend}-approval-matrix-log.jsonl`)
      const commandPath = join(binDir, item.command)
      const persisted = []
      const createdApprovals = []
      const resolvedApprovals = []

      t.after(() => {
        rmSync(root, { recursive: true, force: true })
      })

      writeExecutable(commandPath, `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({
  kind: 'invoke',
  argv: process.argv.slice(2),
  env: Object.fromEntries(${JSON.stringify(Object.keys(item.expectedEnv))}.map((key) => [key, process.env[key] ?? null])),
}) + '\\n')

const rl = readline.createInterface({ input: process.stdin })
let pendingPromptId = null
let pendingPermissionId = null
const sessionId = ${JSON.stringify(item.sessionId)}

rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }
  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId } })
    return
  }
  if (message.method === 'session/prompt') {
    pendingPromptId = message.id
    pendingPermissionId = 880
    write({
      jsonrpc: '2.0',
      id: pendingPermissionId,
      method: 'session/request_permission',
      params: {
        sessionId,
        toolCall: {
          toolCallId: 'tool_${item.backend}_approval_1',
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
    appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({ kind: 'approval-response', message }) + '\\n')
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: ${JSON.stringify(`${item.backend} approval applied`)} },
        },
      },
    })
    write({ jsonrpc: '2.0', id: pendingPromptId, result: { stopReason: 'end_turn' } })
  }
})
`)

      t.mock.method(module.autoModeRuntime, 'preflightAutoModeAuth', async () => {
        throw new Error('auto-mode backend validation must not fall back to local auth')
      })
      t.mock.method(module.autoModeRuntime, 'loadPodBackendCredential', async (requestedBackend) => {
        assert.equal(requestedBackend, item.backend)
        return {
          backend: item.backend,
          provider: item.backend === 'claude' ? 'anthropic' : item.backend === 'codebuddy' ? 'codebuddy' : 'openai',
          env: item.credentialEnv,
        }
      })
      t.mock.method(module.autoModeRuntime, 'resolveExistingRemoteAutoModeGrant', async () => null)
      t.mock.method(module.autoModeRuntime, 'resolveAutoModeSecretaryRecommendation', async (input) => {
        assert.equal(input.mode, 'smart')
        assert.equal(input.request.kind, 'command-approval')
        assert.equal(input.request.command, 'pwd')
        return {
          kind: 'command-approval',
          canAutoDecide: true,
          decision: 'accept',
          confidence: 0.93,
          reason: `${item.backend} read-only command can be approved once`,
          reactionWindowMs: 0,
          source: 'fallback',
        }
      })
      t.mock.method(module.autoModeRuntime, 'createRemoteAutoModeApproval', async (payload) => {
        createdApprovals.push(payload)
        return { id: `approval_matrix_${item.backend}_1` }
      })
      t.mock.method(module.autoModeRuntime, 'waitForRemoteAutoModeApproval', async () => await new Promise(() => {}))
      t.mock.method(module.autoModeRuntime, 'resolveRemoteAutoModeApproval', async (payload) => {
        resolvedApprovals.push(payload)
        return { id: payload.approvalId, decision: payload.decision }
      })
      t.mock.method(module.autoModeRuntime, 'persistAutoModeConversationToPod', async (record) => {
        persisted.push(record)
        return true
      })
      t.mock.method(module.autoModeRuntime, 'promptText', async () => '/exit')

      await withPatchedEnv(t, {
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        LINX_AUTO_MODE_HOME: autoModeHome,
        FAKE_ACP_LOG: logFile,
      }, async () => {
        const exitCode = await module.runAutoMode({
          backend: item.backend,
          mode: 'smart',
          cwd: process.cwd(),
          prompt: `approval matrix ${item.backend}`,
          passthroughArgs: [],
          credentialSource: 'cloud',
          ...(item.commandOverride ? { commandOverride: commandPath } : {}),
        })

        assert.equal(exitCode, 0)
      })

      const logLines = readFileSync(logFile, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
      const invocations = logLines.filter((entry) => entry.kind === 'invoke')
      const responses = logLines.filter((entry) => entry.kind === 'approval-response').map((entry) => entry.message)

      assert.equal(invocations.length, 1)
      assert.deepEqual(invocations[0].env, item.expectedEnv)
      assert.deepEqual(invocations[0].argv, item.expectedArgs)
      assert.equal(responses.length, 1)
      assert.deepEqual(responses[0].result, {
        outcome: {
          outcome: 'selected',
          optionId: 'allow_once',
        },
      })

      assert.equal(createdApprovals.length, 1)
      assert.equal(createdApprovals[0].request.kind, 'command-approval')
      assert.equal(createdApprovals[0].request.command, 'pwd')
      assert.equal(resolvedApprovals.length, 1)
      assert.equal(resolvedApprovals[0].approvalId, `approval_matrix_${item.backend}_1`)
      assert.equal(resolvedApprovals[0].decision, 'accept')
      assert.equal(resolvedApprovals[0].decisionRole, 'secretary')

      assert.equal(persisted.length, 1)
      assert.equal(persisted[0].backend, item.backend)
      assert.equal(persisted[0].backendSessionId, item.sessionId)
      assert.equal(persisted[0].status, 'completed')

      const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
      assert.equal(sessionDirs.length, 1)
      const events = readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
      assert.match(events, new RegExp(`approval matrix ${item.backend}`))
      assert.match(events, /"type":"approval.required"/)
      assert.match(events, /"command":"pwd"/)
      assert.match(events, new RegExp(`Remote approval opened \\| approval_matrix_${item.backend}_1`))
      assert.match(events, /Local approval resolved \| accept/)
      assert.match(events, new RegExp(`${item.backend} approval applied`))
    })
  }
})

test('auto-mode secretary countdown detail shrinks over time and clamps to a five second minimum', async (t) => {
  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  assert.equal(module.formatAutoModeSecretaryCountdownDetail(5000, 5000), 'auto [##########] 5s')
  assert.equal(module.formatAutoModeSecretaryCountdownDetail(2500, 5000), 'auto [#####-----] 3s')
  assert.equal(module.formatAutoModeSecretaryCountdownDetail(0, 5000), 'auto [----------] 0s')
  assert.equal(module.__testResolveSecretaryReactionWindowMs({
    canAutoDecide: true,
    reactionWindowMs: 1,
    source: 'model',
  }), 5000)
  assert.equal(module.__testResolveSecretaryReactionWindowMs({
    canAutoDecide: true,
    reactionWindowMs: 0,
    source: 'fallback',
  }), 0)
})

test('auto-mode auto-approves trusted ACP permission requests when remote approval is unavailable', async (t) => {
  const { root, binDir, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-approval-')
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

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  mockPodBackendCredential(t, module, 'codex')

  t.mock.method(module.autoModeRuntime, 'resolveAutoModeSecretaryRecommendation', async () => ({
    kind: 'command-approval',
    canAutoDecide: true,
    decision: 'accept',
    confidence: 0.95,
    reason: 'matched fallback policy for safe read-only command',
    reactionWindowMs: 0,
    source: 'fallback',
  }))
  t.mock.method(module.autoModeRuntime, 'resolveExistingRemoteAutoModeGrant', async () => null)
  t.mock.method(module.autoModeRuntime, 'createRemoteAutoModeApproval', async () => {
    throw new Error('remote unavailable')
  })
  t.mock.method(module.autoModeRuntime, 'promptText', async () => '/exit')

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
      mode: 'smart',
      cwd: process.cwd(),
      prompt: 'inspect trusted command',
      passthroughArgs: [],
      credentialSource: 'cloud',
      commandOverride: join(binDir, 'codex-acp'),
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

  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  const events = readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /"type":"approval.required"/)
  assert.match(events, /"command":"pwd"/)
  assert.match(events, /Remote approval unavailable \| remote unavailable/)
})

test('auto-mode lets remote approval win by default and aborts the local approval prompt', async (t) => {
  const { root, binDir, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-remote-approval-')
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

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const prompts = []
  const createdApprovals = []
  const waitedApprovals = []
  const resolvedApprovals = []

  mockPodBackendCredential(t, module, 'codex')

  t.mock.method(module.autoModeRuntime, 'resolveExistingRemoteAutoModeGrant', async () => null)
  t.mock.method(module.autoModeRuntime, 'promptText', async (prompt, signal) => {
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
  t.mock.method(module.autoModeRuntime, 'createRemoteAutoModeApproval', async (payload) => {
    createdApprovals.push(payload)
    return { id: 'approval_remote_1' }
  })
  t.mock.method(module.autoModeRuntime, 'waitForRemoteAutoModeApproval', async (payload) => {
    waitedApprovals.push(payload)
    return 'accept_for_session'
  })
  t.mock.method(module.autoModeRuntime, 'resolveRemoteAutoModeApproval', async (payload) => {
    resolvedApprovals.push(payload)
    return { id: payload.approvalId, decision: payload.decision }
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
      mode: 'manual',
      cwd: process.cwd(),
      prompt: 'request remote approval',
      passthroughArgs: [],
      credentialSource: 'cloud',
      commandOverride: join(binDir, 'codex-acp'),
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

  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  const events = readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /Remote approval opened \| approval_remote_1/)
  assert.match(events, /Remote approval resolved \| accept_for_session/)
})

test('auto-mode mirrors a local approval decision back into Pod remote approval state by default', async (t) => {
  const { root, binDir, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-hybrid-local-first-')
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

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const createdApprovals = []
  const waitedApprovals = []
  const resolvedApprovals = []

  mockPodBackendCredential(t, module, 'codex')

  t.mock.method(module.autoModeRuntime, 'resolveExistingRemoteAutoModeGrant', async () => null)
  t.mock.method(module.autoModeRuntime, 'promptText', async (prompt) => {
    if (prompt === 'select> ') {
      return 's'
    }
    return '/exit'
  })
  t.mock.method(module.autoModeRuntime, 'createRemoteAutoModeApproval', async (payload) => {
    createdApprovals.push(payload)
    return { id: 'approval_local_1' }
  })
  t.mock.method(module.autoModeRuntime, 'waitForRemoteAutoModeApproval', async (payload) => {
    waitedApprovals.push(payload)
    return await new Promise(() => {})
  })
  t.mock.method(module.autoModeRuntime, 'resolveRemoteAutoModeApproval', async (payload) => {
    resolvedApprovals.push(payload)
    return { id: payload.approvalId, decision: payload.decision }
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
      mode: 'manual',
      cwd: process.cwd(),
      prompt: 'request local approval first',
      passthroughArgs: [],
      credentialSource: 'cloud',
      commandOverride: join(binDir, 'codex-acp'),
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

  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  const events = readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /Remote approval opened \| approval_local_1/)
  assert.match(events, /Local approval resolved \| accept_for_session/)
})

test('auto-mode lets AI secretary allow approval after a reaction window and mirrors it to Pod', async (t) => {
  const { root, binDir, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-secretary-approval-')
  const logFile = join(root, 'secretary-approval-log.jsonl')

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
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_secretary_approval_123' } })
    return
  }
  if (message.method === 'session/prompt') {
    pendingPromptId = message.id
    pendingPermissionId = 713
    write({
      jsonrpc: '2.0',
      id: pendingPermissionId,
      method: 'session/request_permission',
      params: {
        sessionId: 'sess_secretary_approval_123',
        toolCall: {
          toolCallId: 'tool_secretary_1',
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
    write({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'sess_secretary_approval_123', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'secretary approved' } } } })
    write({ jsonrpc: '2.0', id: pendingPromptId, result: { stopReason: 'end_turn' } })
  }
})
`)

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const resolvedApprovals = []
  mockPodBackendCredential(t, module, 'codex')
  t.mock.method(module.autoModeRuntime, 'resolveExistingRemoteAutoModeGrant', async () => null)
  t.mock.method(module.autoModeRuntime, 'resolveAutoModeSecretaryRecommendation', async () => ({
    kind: 'command-approval',
    canAutoDecide: true,
    decision: 'accept',
    confidence: 0.91,
    reason: 'read-only git status is safe to approve once',
    reactionWindowMs: 5000,
    source: 'model',
  }))
  t.mock.method(module.autoModeRuntime, 'promptText', async (prompt, signal) => {
    if (prompt === 'select> ') {
      return await new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted.')
          error.name = 'AbortError'
          reject(error)
        }, { once: true })
      })
    }
    return '/exit'
  })
  t.mock.method(module.autoModeRuntime, 'createRemoteAutoModeApproval', async () => ({ id: 'approval_secretary_1' }))
  t.mock.method(module.autoModeRuntime, 'waitForRemoteAutoModeApproval', async () => await new Promise(() => {}))
  t.mock.method(module.autoModeRuntime, 'resolveRemoteAutoModeApproval', async (payload) => {
    resolvedApprovals.push(payload)
    return { id: payload.approvalId, decision: payload.decision }
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
      mode: 'smart',
      cwd: process.cwd(),
      prompt: 'request secretary approval',
      passthroughArgs: [],
      credentialSource: 'cloud',
      commandOverride: join(binDir, 'codex-acp'),
    })

    assert.equal(exitCode, 0)
  })

  assert.equal(resolvedApprovals.length, 1)
  assert.equal(resolvedApprovals[0].decision, 'accept')
  assert.equal(resolvedApprovals[0].decisionRole, 'secretary')

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
})

test('auto-mode batches multi-question ACP user input responses into one payload', async (t) => {
  const { root, binDir, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-input-')
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

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const prompts = []
  mockPodBackendCredential(t, module, 'codex')
  t.mock.method(module.autoModeRuntime, 'promptText', async (prompt) => {
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
    LINX_AUTO_MODE_HOME: autoModeHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
      mode: 'manual',
      cwd: process.cwd(),
      prompt: 'answer multiple questions',
      passthroughArgs: [],
      credentialSource: 'cloud',
      commandOverride: join(binDir, 'codex-acp'),
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

  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  const events = readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /"type":"input.required"/)
  assert.match(events, /"question":"Choose runtime"/)
  assert.match(events, /"question":"Describe the goal"/)
})

test('auto-mode lets AI secretary answer ACP user input after a reaction window', async (t) => {
  const { root, binDir, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-secretary-input-')
  const logFile = join(root, 'secretary-input-log.jsonl')

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
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_secretary_input_123' } })
    return
  }
  if (message.method === 'session/prompt') {
    pendingPromptId = message.id
    pendingInputId = 902
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
          }
        ]
      },
    })
    return
  }
  if (pendingInputId !== null && message.id === pendingInputId) {
    appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify(message) + '\\n')
    write({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'sess_secretary_input_123', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'secretary answered' } } } })
    write({ jsonrpc: '2.0', id: pendingPromptId, result: { stopReason: 'end_turn' } })
  }
})
`)

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  t.mock.method(module.autoModeRuntime, 'resolveAutoModeSecretaryRecommendation', async () => ({
    kind: 'user-input',
    canAutoDecide: true,
    answers: {
      runtime: {
        answers: ['cloud'],
      },
    },
    confidence: 0.9,
    reason: 'Pod credentials are the requested runtime source',
    reactionWindowMs: 5000,
    source: 'model',
  }))

  mockPodBackendCredential(t, module, 'codex')

  t.mock.method(module.autoModeRuntime, 'promptText', async (prompt, signal) => {
    if (prompt === 'select> ') {
      return await new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted.')
          error.name = 'AbortError'
          reject(error)
        }, { once: true })
      })
    }
    return '/exit'
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
      mode: 'smart',
      cwd: process.cwd(),
      prompt: 'answer runtime for me',
      passthroughArgs: [],
      credentialSource: 'cloud',
      commandOverride: join(binDir, 'codex-acp'),
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
    answers: {
      runtime: {
        answers: ['cloud'],
      },
    },
  })
})


test('auto-mode with an initial prompt does not emit an extra empty prompt turn before the scripted turn', async (t) => {
  const { root, binDir, autoModeHome } = createAutoModeSandbox('linx-auto-mode-initial-prompt-')

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

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const prompts = []
  mockPodBackendCredential(t, module, 'codex')
  t.mock.method(module.autoModeRuntime, 'promptText', async (prompt) => {
    prompts.push(prompt)
    return '/exit'
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
    FAKE_ACP_LOG: join(root, 'persist-timeout-log.jsonl'),
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
      mode: 'smart',
      cwd: process.cwd(),
      prompt: 'Reply with exactly hi',
      passthroughArgs: [],
      credentialSource: 'cloud',
      commandOverride: join(binDir, 'codex-acp'),
    })

    assert.equal(exitCode, 0)
  })

  assert.deepEqual(prompts, [])
})

test('auto-mode goal sessions keep running after the initial goal and apply steer before follow-up', async (t) => {
  const { root, binDir, autoModeHome } = createAutoModeSandbox('linx-auto-mode-goal-queue-')
  const logFile = join(root, 'goal-queue-log.jsonl')

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
let promptCount = 0
const sessionId = 'sess_goal_queue_123'

rl.on('line', (line) => {
  const message = JSON.parse(line)
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
    const text = message.params?.prompt?.[0]?.text ?? ''
    appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({
      kind: 'prompt',
      index: promptCount,
      text,
    }) + '\\n')
    setTimeout(() => {
      write({
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'turn ' + promptCount + ' complete' },
          },
        },
      })
      write({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } })
    }, promptCount === 1 ? 80 : 0)
  }
})
`)

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  mockPodBackendCredential(t, module, 'codex')

  const scriptedInputs = [
    'Secretary steer: stay on the login recovery path',
    '/follow-up Secretary follow-up delivery: also add a regression test',
    '/exit',
  ]
  t.mock.method(module.autoModeRuntime, 'promptText', async (prompt) => {
    if (prompt === 'you> ') {
      return scriptedInputs.shift() ?? '/exit'
    }
    return '/exit'
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
      mode: 'auto',
      cwd: process.cwd(),
      prompt: '# LinX Symphony Task\\n\\n## Goal\\nFix login',
      goalMode: true,
      passthroughArgs: [],
      credentialSource: 'cloud',
      commandOverride: join(binDir, 'codex-acp'),
    })

    assert.equal(exitCode, 0)
  })

  const prompts = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.kind === 'prompt')

  assert.equal(prompts.length, 3)
  assert.match(prompts[0].text, /# LinX Symphony Task/)
  assert.match(prompts[1].text, /Secretary steer: stay on the login recovery path/)
  assert.match(prompts[2].text, /Secretary follow-up delivery: also add a regression test/)

  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  const session = JSON.parse(readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'session.json'), 'utf-8'))
  assert.equal(session.goalMode, true)

  const events = readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /Queued steering message/)
  assert.match(events, /Queued follow-up message/)
})

test('auto-mode /model surfaces ACP failure without mutating the model state', async (t) => {
  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const root = mkdtempSync(join(tmpdir(), 'linx-auto-mode-model-command-'))
  const archiveDir = join(root, 'session')
  mkdirSync(archiveDir, { recursive: true })
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const activity = []
  const record = {
    id: 'auto_model_command_123',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
    mode: 'manual',
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    prompt: undefined,
    passthroughArgs: [],
    credentialSource: 'cloud',
    resolvedCredentialSource: 'cloud',
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

  await module.__testHandleAutoModeShellCommand({
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

test('auto-mode exposes /hotkeys as the LinX keymap help command', async (t) => {
  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const root = mkdtempSync(join(tmpdir(), 'linx-auto-mode-hotkeys-command-'))
  const archiveDir = join(root, 'session')
  mkdirSync(archiveDir, { recursive: true })
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  let helpCalls = 0
  const record = {
    id: 'auto_hotkeys_command_123',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
    mode: 'manual',
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    prompt: undefined,
    passthroughArgs: [],
    credentialSource: 'cloud',
    resolvedCredentialSource: 'cloud',
    approvalSource: 'hybrid',
    command: 'codex-acp',
    args: [],
    status: 'running',
    startedAt: '2026-04-17T00:00:00.000Z',
    archiveDir,
    eventsFile: join(archiveDir, 'events.jsonl'),
  }

  const result = await module.__testHandleAutoModeShellCommand({
    input: '/hotkeys',
    session: { async setModel() {} },
    display: {
      showHelp() {
        helpCalls += 1
      },
    },
    queueState: { steeringCount: 0, followUpCount: 0 },
    backend: 'codex',
    record,
  })

  assert.equal(result, 'handled')
  assert.equal(helpCalls, 1)
})

test('auto-mode shell can switch approval mode after entering an auto-mode session', async (t) => {
  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const root = mkdtempSync(join(tmpdir(), 'linx-auto-mode-mode-command-'))
  const archiveDir = join(root, 'session')
  mkdirSync(archiveDir, { recursive: true })
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const activity = []
  const record = {
    id: 'auto_mode_command_123',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
    mode: 'manual',
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    prompt: undefined,
    passthroughArgs: [],
    credentialSource: 'cloud',
    resolvedCredentialSource: 'cloud',
    approvalSource: 'hybrid',
    command: 'codex-acp',
    args: [],
    status: 'running',
    startedAt: '2026-04-17T00:00:00.000Z',
    archiveDir,
    eventsFile: join(archiveDir, 'events.jsonl'),
  }

  const result = await module.__testHandleAutoModeShellCommand({
    input: '/auto',
    session: {
      async setModel() {},
      applyResolvedOptions(options) {
        record.mode = options.mode
      },
    },
    display: {
      showHelp() {},
      showActivity(message, tone = 'note') {
        activity.push({ message, tone })
      },
      setPhase() {},
      updateRecord() {},
    },
    queueState: { steeringCount: 0, followUpCount: 0 },
    backend: 'codex',
    record,
  })

  assert.equal(result, 'handled')
  assert.equal(record.mode, 'auto')
  assert.deepEqual(activity, [
    { message: 'Approval mode set to auto', tone: 'success' },
  ])
})

test('auto-mode /debug toggles full-fidelity protocol view without affecting the main session state', async (t) => {
  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const root = mkdtempSync(join(tmpdir(), 'linx-auto-mode-debug-command-'))
  const archiveDir = join(root, 'session')
  mkdirSync(archiveDir, { recursive: true })
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const debugModes = []
  const record = {
    id: 'auto_debug_command_123',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
    mode: 'manual',
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    prompt: undefined,
    passthroughArgs: [],
    credentialSource: 'cloud',
    resolvedCredentialSource: 'cloud',
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

  await module.__testHandleAutoModeShellCommand({
    input: '/debug on',
    session: { async setModel() {} },
    display,
    queueState: { steeringCount: 0, followUpCount: 0 },
    backend: 'codex',
    record,
  })

  await module.__testHandleAutoModeShellCommand({
    input: '/debug off',
    session: { async setModel() {} },
    display,
    queueState: { steeringCount: 0, followUpCount: 0 },
    backend: 'codex',
    record,
  })

  assert.deepEqual(debugModes, [true, false])
})

test('auto-mode persists the final conversation to Pod opportunistically without breaking local success', async (t) => {
  const { root, binDir, autoModeHome } = createAutoModeSandbox('linx-auto-mode-pod-persist-')

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

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const persisted = []
  const warnings = []
  mockPodBackendCredential(t, module, 'codex', undefined, { persist: false })
  t.mock.method(module.autoModeRuntime, 'promptText', async () => '/exit')
  t.mock.method(module.autoModeRuntime, 'persistAutoModeConversationToPod', async (record) => {
    persisted.push(record)
    throw new Error('ignore pod persistence errors')
  })
  const warningListener = (warning) => {
    warnings.push(warning)
  }
  process.on('warning', warningListener)
  t.after(() => {
    process.off('warning', warningListener)
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
    FAKE_ACP_LOG: join(root, 'persist-timeout-log.jsonl'),
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
      mode: 'smart',
      cwd: process.cwd(),
      prompt: 'persist conversation',
      passthroughArgs: [],
      credentialSource: 'cloud',
      commandOverride: join(binDir, 'codex-acp'),
    })

    assert.equal(exitCode, 0)
  })

  assert.equal(persisted.length, 1)
  assert.equal(persisted[0].status, 'completed')
  assert.equal(persisted[0].backend, 'codex')
  assert.equal(typeof persisted[0].endedAt, 'string')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(warnings.some((warning) => String(warning.message).includes('LinX auto-mode Pod sync failed: ignore pod persistence errors')), true)

  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  const events = readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /Pod sync failed \| ignore pod persistence errors/)
})

test('auto-mode times out final Pod persistence without blocking local success', async (t) => {
  const { root, binDir, autoModeHome } = createAutoModeSandbox('linx-auto-mode-pod-persist-timeout-')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  writeFakeAcpBackend(join(binDir, 'codex-acp'), {
    sessionId: 'sess_codex_persist_timeout_123',
    reply: 'persist timeout turn',
  })

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const warnings = []
  mockPodBackendCredential(t, module, 'codex', undefined, { persist: false })
  t.mock.method(module.autoModeRuntime, 'promptText', async () => '/exit')
  let syncSignal
  let aborted = false
  t.mock.method(module.autoModeRuntime, 'persistAutoModeConversationToPod', async (_record, _runtime, options) => {
    syncSignal = options?.signal
    await new Promise((_resolve, reject) => {
      syncSignal?.addEventListener('abort', () => {
        aborted = true
        reject(syncSignal.reason ?? new Error('aborted'))
      }, { once: true })
    })
  })
  const warningListener = (warning) => {
    warnings.push(warning)
  }
  process.on('warning', warningListener)
  t.after(() => {
    process.off('warning', warningListener)
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_AUTO_MODE_HOME: autoModeHome,
    FAKE_ACP_LOG: join(root, 'persist-timeout-log.jsonl'),
  }, async () => {
    const startedAt = Date.now()
    const exitCode = await module.runAutoMode({
      backend: 'codex',
      mode: 'smart',
      cwd: process.cwd(),
      prompt: 'persist timeout',
      passthroughArgs: [],
      credentialSource: 'cloud',
      commandOverride: join(binDir, 'codex-acp'),
    })

    assert.equal(exitCode, 0)
    assert.ok(Date.now() - startedAt < 8_000)
  })

  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(syncSignal instanceof AbortSignal, true)
  assert.equal(aborted, true)
  assert.equal(warnings.some((warning) => String(warning.message).includes('LinX auto-mode Pod sync failed: timed out after 5000ms')), true)

  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  const events = readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /Pod sync failed \| timed out after 5000ms/)
})
