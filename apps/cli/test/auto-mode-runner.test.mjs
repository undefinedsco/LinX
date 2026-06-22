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
  const linxHome = join(root, 'linx-home')
  const autoModeHome = join(linxHome, 'auto-mode')
  mkdirSync(binDir, { recursive: true })
  return { root, binDir, linxHome, autoModeHome }
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
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
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

test('auto-mode backend process inherits Solid auth home for xpod CLI tools', async (t) => {
  const { root, binDir, linxHome } = createAutoModeSandbox('linx-auto-mode-xpod-auth-env-')
  const solidHome = join(root, 'solid-home')
  const home = join(root, 'home')
  const logFile = join(root, 'xpod-auth-env-log.jsonl')
  const commandPath = join(binDir, 'codex-acp')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  mkdirSync(solidHome, { recursive: true })
  mkdirSync(home, { recursive: true })
  writeFakeAcpBackend(commandPath, {
    sessionId: 'sess_xpod_auth_env_123',
    reply: 'xpod auth env ready',
    envKeys: ['HOME', 'SOLID_HOME', 'LINX_HOME', 'CODEX_API_KEY'],
  })

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  mockPodBackendCredential(t, module, 'codex', { CODEX_API_KEY: 'sk-pod-openai' })
  t.mock.method(module.autoModeRuntime, 'promptText', async () => '/exit')

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    HOME: home,
    SOLID_HOME: solidHome,
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: logFile,
    OPENAI_API_KEY: undefined,
    CODEX_API_KEY: undefined,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
      autoEnabled: false,
      mode: 'off',
      cwd: root,
      prompt: 'verify xpod auth environment',
      passthroughArgs: [],
      credentialSource: 'cloud',
      commandOverride: commandPath,
    })

    assert.equal(exitCode, 0)
  })

  const invocations = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  assert.equal(invocations[0].env.HOME, home)
  assert.equal(invocations[0].env.SOLID_HOME, solidHome)
  assert.equal(invocations[0].env.LINX_HOME, linxHome)
  assert.equal(invocations[0].env.CODEX_API_KEY, 'sk-pod-openai')
})

test('auto-mode can run LinX native worker through session-managed runtime auth', async (t) => {
  const { root, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-native-worker-')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const sessions = []
  const completionCalls = []
  const persisted = []
  t.mock.method(module.autoModeRuntime, 'createPodDataSession', async () => {
    const session = {
      webId: `https://id.undefineds.co/gcloud/profile/card#me-${sessions.length + 1}`,
      podUrl: 'https://id.undefineds.co/gcloud/',
      credentials: {
        url: 'https://id.undefineds.co/',
      },
      runtimeFetch: async () => new Response('{}'),
      async close() {
        session.closed = true
      },
      closed: false,
    }
    sessions.push(session)
    return session
  })
  t.mock.method(module.autoModeRuntime, 'createRemoteCompletionResult', async (options) => {
    completionCalls.push(options)
    return {
      content: 'native worker completed',
      reasoningContent: 'checked by linx native worker',
      toolCalls: [{
        id: 'tool-call-1',
        type: 'function',
        function: {
          name: 'report_status',
          arguments: '{"status":"ok"}',
        },
      }],
      finishReason: 'stop',
      usage: {
        input: 12,
        output: 8,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 20,
      },
    }
  })
  t.mock.method(module.autoModeRuntime, 'persistAutoModeConversationToPod', async (record) => {
    persisted.push(record)
  })

  await withPatchedEnv(t, {
    LINX_HOME: linxHome,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'linx',
      autoEnabled: false,
      mode: 'off',
      cwd: root,
      prompt: 'run native worker once',
      model: 'deepseek-v4',
      passthroughArgs: [],
      credentialSource: 'cloud',
      quiet: true,
    })

    assert.equal(exitCode, 0)
  })

  assert.equal(sessions.length, 2)
  assert.equal(sessions.every((session) => session.closed), true)
  assert.equal(completionCalls.length, 1)
  assert.match(completionCalls[0].runtimeUrl, /^https:\/\/api\.undefineds\.co/)
  assert.equal(completionCalls[0].authSession, sessions[1])
  assert.equal(completionCalls[0].model, 'deepseek-v4')
  assert.deepEqual(completionCalls[0].messages, [{ role: 'user', content: 'run native worker once' }])
  assert.equal(persisted.length, 1)
  assert.equal(persisted[0].backend, 'linx')
  assert.equal(persisted[0].transport, 'native')
  assert.equal(persisted[0].model, 'deepseek-v4')
  assert.equal(persisted[0].status, 'completed')

  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  assert.equal(sessionDirs.length, 1)
  const sessionDir = join(autoModeHome, 'sessions', sessionDirs[0])
  const session = JSON.parse(readFileSync(join(sessionDir, 'session.json'), 'utf-8'))
  assert.equal(session.backend, 'linx')
  assert.equal(session.transport, 'native')
  assert.equal(session.model, 'deepseek-v4')
  assert.equal(session.status, 'completed')

  const events = readFileSync(join(sessionDir, 'events.jsonl'), 'utf-8')
  assert.match(events, /run native worker once/)
  assert.match(events, /native worker completed/)
  assert.match(events, /report_status/)
})

test('auto-mode supported backends includes LinX native worker', async (t) => {
  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const backends = module.listSupportedAutoModeBackends()
  assert.deepEqual(backends.map((backend) => backend.backend), ['linx', 'codex', 'claude', 'codebuddy'])
  const linx = backends.find((backend) => backend.backend === 'linx')
  assert.equal(linx.label, 'LinX')
  assert.match(linx.description, /LinX Cloud\/Pi runtime directly/)
})

test('auto-mode archives command args and every normalized event type for ACP backends', async (t) => {
  const cases = [
    {
      backend: 'codex',
      command: 'codex-acp',
      useCommandOverride: true,
      sessionId: 'sess_codex_all_events_123',
      model: 'gpt-5.5',
      passthroughArgs: ['--sandbox', 'workspace-write'],
      expectedArgs: ['-c', 'model="gpt-5.5"', '--sandbox', 'workspace-write'],
      credentialEnv: { CODEX_API_KEY: 'sk-all-events-openai' },
    },
    {
      backend: 'claude',
      command: 'claude-code-acp',
      sessionId: 'sess_claude_all_events_123',
      model: 'opus',
      passthroughArgs: ['--debug-acp'],
      expectedArgs: ['--debug-acp'],
      credentialEnv: { ANTHROPIC_API_KEY: 'sk-all-events-anthropic' },
    },
    {
      backend: 'codebuddy',
      command: 'codebuddy',
      sessionId: 'sess_codebuddy_all_events_123',
      model: 'codebuddy-worker',
      passthroughArgs: ['--trace'],
      expectedArgs: ['--acp', '--acp-transport', 'stdio', '--model', 'codebuddy-worker', '--trace'],
      credentialEnv: { CODEBUDDY_API_KEY: 'sk-all-events-codebuddy' },
    },
  ]

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  for (const item of cases) {
    await t.test(item.backend, async (t) => {
      const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox(`linx-auto-mode-${item.backend}-all-events-`)
      const logFile = join(root, `${item.backend}-all-events-log.jsonl`)
      const commandPath = join(binDir, item.command)
      const expectedCommand = item.useCommandOverride ? commandPath : item.command

      t.after(() => {
        rmSync(root, { recursive: true, force: true })
      })

      writeExecutable(commandPath, `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

function log(obj) {
  appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify(obj) + '\\n')
}

log({ kind: 'spawn', argv: process.argv.slice(2) })

const rl = readline.createInterface({ input: process.stdin })
const sessionId = ${JSON.stringify(item.sessionId)}
let pendingPromptId = null
let pendingPermissionId = null
let pendingInputId = null

rl.on('line', (line) => {
  const message = JSON.parse(line)
  log({ kind: 'rpc', message })

  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }

  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId } })
    return
  }

  if (message.method === 'session/set_model') {
    write({ jsonrpc: '2.0', id: message.id, result: {} })
    return
  }

  if (message.method === 'session/prompt') {
    pendingPromptId = message.id
    pendingPermissionId = 701
    pendingInputId = 702
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: ${JSON.stringify(`${item.backend} delta before tools`)} },
        },
      },
    })
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId,
        update: {
          sessionUpdate: 'tool_call',
          title: 'Inspect workspace',
          rawInput: { command: 'ls -la', cwd: process.cwd() },
        },
      },
    })
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId,
        update: {
          sessionUpdate: 'progress_update',
          message: ${JSON.stringify(`planning note from ${item.backend} acp`)},
        },
      },
    })
    write({
      jsonrpc: '2.0',
      id: pendingPermissionId,
      method: 'session/request_permission',
      params: {
        sessionId,
        toolCall: {
          toolCallId: 'tool_pwd',
          title: 'Run pwd',
          kind: 'execute',
          rawInput: { command: 'pwd', cwd: process.cwd() },
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
    write({
      jsonrpc: '2.0',
      id: pendingInputId,
      method: 'session/request_input',
      params: {
        sessionId,
        questions: [{
          id: 'confirm',
          header: 'Confirm',
          question: 'Which verification path should Codex use?',
          options: [
            { label: 'archive' },
            { label: 'skip' }
          ],
        }],
      },
    })
    return
  }

  if (pendingInputId !== null && message.id === pendingInputId) {
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: ${JSON.stringify(`${item.backend} delta after input`)} },
        },
      },
    })
    write({ jsonrpc: '2.0', id: pendingPromptId, result: { stopReason: 'end_turn' } })
  }
})
`)

      mockPodBackendCredential(t, module, item.backend, item.credentialEnv)
      t.mock.method(module.autoModeRuntime, 'resolveAutoModeSecretaryRecommendation', async ({ request }) => {
        if (request.kind === 'user-input') {
          return {
            kind: 'user-input',
            canAutoDecide: true,
            answers: {
              confirm: {
                answers: ['archive'],
              },
            },
            confidence: 0.9,
            reason: 'archive path verifies event retention',
            reactionWindowMs: 0,
            source: 'fallback',
          }
        }

        return {
          kind: request.kind,
          canAutoDecide: true,
          decision: 'accept',
          confidence: 0.95,
          reason: 'safe verification command in test harness',
          reactionWindowMs: 0,
          source: 'fallback',
        }
      })
      t.mock.method(module.autoModeRuntime, 'resolveExistingRemoteAutoModeGrant', async () => null)
      t.mock.method(module.autoModeRuntime, 'createRemoteAutoModeApproval', async () => {
        throw new Error('remote unavailable')
      })
      t.mock.method(module.autoModeRuntime, 'promptText', async () => '/exit')

      await withPatchedEnv(t, {
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        LINX_HOME: linxHome,
        FAKE_ACP_LOG: logFile,
      }, async () => {
        const exitCode = await module.runAutoMode({
          backend: item.backend,
          autoEnabled: true,
          mode: 'auto',
          cwd: root,
          prompt: `verify ${item.backend} acp event archive`,
          model: item.model,
          passthroughArgs: item.passthroughArgs,
          credentialSource: 'cloud',
          ...(item.useCommandOverride ? { commandOverride: commandPath } : {}),
        })

        assert.equal(exitCode, 0)
      })

      const logLines = readFileSync(logFile, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
      const spawn = logLines.find((entry) => entry.kind === 'spawn')
      assert.deepEqual(spawn.argv, item.expectedArgs)

      const setModelRequest = logLines.find((entry) => entry.kind === 'rpc' && entry.message.method === 'session/set_model')
      if (item.backend === 'claude') {
        assert.equal(setModelRequest.message.params.modelId, item.model)
      } else {
        assert.equal(setModelRequest, undefined)
      }

      const permissionResponse = logLines.find((entry) => entry.kind === 'rpc' && entry.message.id === 701 && entry.message.result)
      assert.deepEqual(permissionResponse.message.result, {
        outcome: {
          outcome: 'selected',
          optionId: 'allow_once',
        },
      })

      const inputResponse = logLines.find((entry) => entry.kind === 'rpc' && entry.message.id === 702 && entry.message.result)
      assert.deepEqual(inputResponse.message.result, {
        answers: {
          confirm: {
            answers: ['archive'],
          },
        },
      })

      const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
      assert.deepEqual(sessionDirs, [item.sessionId])

      const sessionDir = join(autoModeHome, 'sessions', sessionDirs[0])
      const session = JSON.parse(readFileSync(join(sessionDir, 'session.json'), 'utf-8'))
      assert.equal(session.command, expectedCommand)
      assert.deepEqual(session.args, item.expectedArgs)
      assert.deepEqual(session.passthroughArgs, item.passthroughArgs)
      assert.equal(session.backendSessionId, item.sessionId)
      assert.equal(session.transport, 'acp')
      assert.equal(session.status, 'completed')

      const archiveEntries = readFileSync(join(sessionDir, 'events.jsonl'), 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))

      const turnStart = archiveEntries
        .map((entry) => {
          try {
            return JSON.parse(entry.line)
          } catch {
            return null
          }
        })
        .find((entry) => entry?.type === 'turn.start')
      assert.equal(turnStart.command, expectedCommand)
      assert.deepEqual(turnStart.args, item.expectedArgs)

      const eventTypes = new Set(archiveEntries.flatMap((entry) => entry.events.map((event) => event.type)))
      for (const type of ['assistant.delta', 'assistant.done', 'tool.call', 'approval.required', 'input.required', 'session.note']) {
        assert.equal(eventTypes.has(type), true, `${item.backend} should archive ${type}`)
      }

      assert.equal(archiveEntries.some((entry) => JSON.stringify(entry).includes(`verify ${item.backend} acp event archive`)), true)
      assert.equal(archiveEntries.some((entry) => JSON.stringify(entry).includes(`${item.backend} delta before tools`)), true)
      assert.equal(archiveEntries.some((entry) => JSON.stringify(entry).includes(`${item.backend} delta after input`)), true)
      assert.equal(archiveEntries.some((entry) => JSON.stringify(entry).includes('Inspect workspace')), true)
      assert.equal(archiveEntries.some((entry) => JSON.stringify(entry).includes('"command":"pwd"')), true)
      assert.equal(archiveEntries.some((entry) => JSON.stringify(entry).includes('Which verification path should Codex use?')), true)
      assert.equal(archiveEntries.some((entry) => JSON.stringify(entry).includes(`planning note from ${item.backend} acp`)), true)
    })
  }
})

test('auto-mode reuses one ACP session across multiple turns', async (t) => {
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-runner-')
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
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'claude',
autoEnabled: true,
mode: 'auto',
      cwd: process.cwd(),
      model: 'opus',
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
  const setModelRequests = rpcMessages.filter((message) => message.method === 'session/set_model')
  assert.equal(setModelRequests.length, 1)
  assert.deepEqual(setModelRequests[0].params, {
    sessionId: 'sess_claude_acp_123',
    modelId: 'opus',
  })
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
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-claude-cloud-')
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
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'claude',
autoEnabled: true,
mode: 'auto',
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
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-missing-key-')
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
      provider: 'deepseek',
      env: {
        CODEX_API_KEY: 'sk-entered-deepseek',
        CODEX_BASE_URL: 'https://api.deepseek.com/v1',
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
  const promptCalls = []
  t.mock.method(module.autoModeRuntime, 'promptText', async (prompt) => {
    promptCalls.push(prompt)
    promptCount += 1
    if (prompt === 'answer> ') return 'deepseek'
    if (prompt === 'secret> ') return 'sk-entered-deepseek'
    return '/exit'
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_HOME: linxHome,
    LINX_AUTO_MODE_PLAIN: '1',
    FAKE_ACP_LOG: logFile,
    OPENAI_API_KEY: undefined,
    CODEX_API_KEY: undefined,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
autoEnabled: true,
mode: 'auto',
      cwd: process.cwd(),
      prompt: 'hello after missing key',
      passthroughArgs: [],
      commandOverride: join(binDir, 'codex-acp'),
    })

    assert.equal(exitCode, 0)
  })

  assert.equal(loadCalls, 2)
  assert.equal(promptCount, 2)
  assert.deepEqual(promptCalls, ['answer> ', 'secret> '])
  assert.deepEqual(savedCredentials, [{
    provider: 'deepseek',
    apiKey: 'sk-entered-deepseek',
    supportsBackend: 'codex',
    rotationPolicy: 'round_robin',
  }])

  const invocation = JSON.parse(readFileSync(logFile, 'utf-8').trim())
  assert.equal(invocation.openaiKey, null)
  assert.equal(invocation.codexKey, 'sk-entered-deepseek')

  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  assert.equal(sessionDirs.length, 1)
  const events = readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.doesNotMatch(events, /sk-entered-deepseek/)
})

test('auto-mode exits cleanly when LinX Cloud auth recovery is cancelled', async (t) => {
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-cancel-auth-')
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  writeFakeAcpBackend(join(binDir, 'codex-acp'), {
    sessionId: 'sess_cancel_auth_123',
    reply: 'should not start backend',
  })

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  t.mock.method(module.autoModeRuntime, 'loadPodBackendCredential', async () => {
    throw new Error('LinX cloud credential source is not connected yet. Run `linx login` first.')
  })
  const persisted = []
  t.mock.method(module.autoModeRuntime, 'persistAutoModeConversationToPod', async (record) => {
    persisted.push(record)
  })

  const prompts = []
  t.mock.method(module.autoModeRuntime, 'promptText', async (prompt) => {
    prompts.push(prompt)
    return '3'
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_HOME: linxHome,
    LINX_AUTO_MODE_PLAIN: '1',
    FAKE_ACP_LOG: join(root, 'cancel-auth-log.jsonl'),
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
autoEnabled: false,
mode: 'off',
      cwd: process.cwd(),
      prompt: 'should not run',
      passthroughArgs: [],
      commandOverride: join(binDir, 'codex-acp'),
    })

    assert.equal(exitCode, 1)
  })

  assert.deepEqual(prompts, ['select> '])
  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  assert.equal(sessionDirs.length, 1)
  const session = JSON.parse(readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'session.json'), 'utf-8'))
  assert.equal(session.status, 'failed')
  assert.equal(session.error, 'Backend startup cancelled before LinX Cloud authorization.')
  assert.equal(persisted.length, 1)
  assert.equal(persisted[0].status, 'failed')
  const events = readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /Backend startup cancelled before LinX Cloud authorization/)
})

test('auto-mode injects cloud-backed codebuddy credentials into built-in ACP mode', async (t) => {
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-codebuddy-cloud-')
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
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codebuddy',
autoEnabled: true,
mode: 'auto',
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
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-codex-cloud-')
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
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: logFile,
    OPENAI_API_KEY: undefined,
    CODEX_API_KEY: undefined,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
autoEnabled: true,
mode: 'auto',
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
      const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox(`linx-auto-mode-matrix-${item.backend}-`)
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
        LINX_HOME: linxHome,
        FAKE_ACP_LOG: logFile,
      }, async () => {
        const exitCode = await module.runAutoMode({
          backend: item.backend,
autoEnabled: true,
mode: 'auto',
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
      const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox(`linx-auto-mode-approval-matrix-${item.backend}-`)
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
        assert.equal(input.mode, 'auto')
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
        LINX_HOME: linxHome,
        FAKE_ACP_LOG: logFile,
      }, async () => {
        const exitCode = await module.runAutoMode({
          backend: item.backend,
autoEnabled: true,
mode: 'auto',
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
      assert.match(events, /Thread Reconciler dispatched command-approval/)
      assert.match(events, /"policyKind":"auto"/)
      assert.match(events, /"eventType":"approval.required"/)
      assert.match(events, /"targetAgent":"__secretary__"/)
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
})

test('auto-mode auto-approves trusted ACP permission requests when remote approval is unavailable', async (t) => {
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-approval-')
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
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
autoEnabled: true,
mode: 'auto',
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
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-remote-approval-')
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
  const materializedGrants = []

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
  t.mock.method(module.autoModeRuntime, 'materializeRemoteAutoModeGrant', async (payload) => {
    materializedGrants.push(payload)
    return { id: 'grant_remote_1' }
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
autoEnabled: false,
mode: 'off',
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
  assert.equal(materializedGrants.length, 1)
  assert.equal(materializedGrants[0].approvalId, 'approval_remote_1')
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

test('auto-mode can force remote-only approval from run options', async (t) => {
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-remote-only-')
  const logFile = join(root, 'remote-only-approval-log.jsonl')

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
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_remote_only_approval_123' } })
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
        sessionId: 'sess_remote_only_approval_123',
        toolCall: {
          toolCallId: 'tool_remote_only_1',
          title: 'Run shell command',
          kind: 'execute',
          rawInput: { command: 'pwd', cwd: '/tmp/demo' },
        },
        options: [
          { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'reject_once', name: 'Reject once', kind: 'reject_once' }
        ],
      },
    })
    return
  }
  if (pendingPermissionId !== null && message.id === pendingPermissionId) {
    appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify(message) + '\\n')
    write({ jsonrpc: '2.0', id: pendingPromptId, result: { stopReason: 'end_turn' } })
  }
})
`)

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  const prompts = []
  const createdApprovals = []
  const waitedApprovals = []

  mockPodBackendCredential(t, module, 'codex')

  t.mock.method(module.autoModeRuntime, 'resolveExistingRemoteAutoModeGrant', async () => null)
  t.mock.method(module.autoModeRuntime, 'promptText', async (prompt) => {
    prompts.push(prompt)
    return '/exit'
  })
  t.mock.method(module.autoModeRuntime, 'createRemoteAutoModeApproval', async (payload) => {
    createdApprovals.push(payload)
    return { id: 'approval_remote_only_1', approvalUri: 'https://pod.example/.data/approvals/approval_remote_only_1.ttl#it' }
  })
  t.mock.method(module.autoModeRuntime, 'waitForRemoteAutoModeApproval', async (payload) => {
    waitedApprovals.push(payload)
    return 'accept'
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
      autoEnabled: false,
      mode: 'off',
      cwd: process.cwd(),
      prompt: 'request remote-only approval',
      passthroughArgs: [],
      credentialSource: 'cloud',
      approvalStrategy: 'remote',
      commandOverride: join(binDir, 'codex-acp'),
    })

    assert.equal(exitCode, 0)
  })

  assert.equal(prompts.includes('select> '), false)
  assert.equal(createdApprovals.length, 1)
  assert.equal(createdApprovals[0].record.approvalSource, 'hybrid')
  assert.equal(waitedApprovals.length, 1)
  assert.equal(waitedApprovals[0].approvalId, 'approval_remote_only_1')

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
  const session = JSON.parse(readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'session.json'), 'utf-8'))
  assert.equal(session.approvalSource, 'hybrid')
  const events = readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /Waiting for remote approval \| Approve command: pwd/)
  assert.match(events, /Remote approval resolved \| accept/)
})

test('auto-mode mirrors a local approval decision back into Pod remote approval state by default', async (t) => {
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-hybrid-local-first-')
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
  const materializedGrants = []

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
  t.mock.method(module.autoModeRuntime, 'materializeRemoteAutoModeGrant', async (payload) => {
    materializedGrants.push(payload)
    return { id: 'grant_local_1' }
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
autoEnabled: false,
mode: 'off',
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
  assert.equal(materializedGrants.length, 1)
  assert.equal(materializedGrants[0].approvalId, 'approval_local_1')

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
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-secretary-approval-')
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
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
autoEnabled: true,
mode: 'auto',
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
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-input-')
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
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
autoEnabled: false,
mode: 'off',
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
  assert.match(events, /Thread Reconciler dispatched user-input/)
  assert.match(events, /"policyKind":"direct"/)
  assert.match(events, /"eventType":"input.required"/)
  assert.match(events, /"skippedReason":"Policy direct does not wake an agent for input.required."/)
})

test('auto-mode lets AI secretary answer ACP user input after a reaction window', async (t) => {
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-acp-secretary-input-')
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
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
autoEnabled: true,
mode: 'auto',
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

  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  const events = readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /Thread Reconciler dispatched user-input/)
  assert.match(events, /"policyKind":"auto"/)
  assert.match(events, /"eventType":"input.required"/)
  assert.match(events, /"targetAgent":"__secretary__"/)
})


test('auto-mode with an initial prompt does not emit an extra empty prompt turn before the scripted turn', async (t) => {
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-initial-prompt-')

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
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: join(root, 'persist-timeout-log.jsonl'),
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
autoEnabled: true,
mode: 'auto',
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
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-goal-queue-')
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
    LINX_HOME: linxHome,
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
  const { module, cleanup } = await loadAutoModeModule('lib/auto-mode/shell-command.ts')
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
autoEnabled: false,
mode: 'off',
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

  await module.handleAutoModeShellCommand({
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
  const { module, cleanup } = await loadAutoModeModule('lib/auto-mode/shell-command.ts')
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
autoEnabled: false,
mode: 'off',
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

  const result = await module.handleAutoModeShellCommand({
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

test('auto-mode shell can switch auto after entering an auto-mode session', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/auto-mode/shell-command.ts')
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
autoEnabled: false,
mode: 'off',
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

  const result = await module.handleAutoModeShellCommand({
    input: '/auto on',
    session: {
      async setModel() {},
      applyResolvedOptions(options) {
        record.mode = options.mode
        record.autoEnabled = options.autoEnabled
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
  assert.equal(record.autoEnabled, true)
  assert.deepEqual(activity, [
    {
      message: 'Auto on: Secretary drives the session and asks when blocked.',
      tone: 'success',
    },
  ])
})

test('auto-mode shell reports auto status and retires old mode commands', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/auto-mode/shell-command.ts')
  t.after(() => cleanup())

  const root = mkdtempSync(join(tmpdir(), 'linx-auto-mode-status-command-'))
  const archiveDir = join(root, 'session')
  mkdirSync(archiveDir, { recursive: true })
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const activity = []
  const record = {
    id: 'auto_status_command_123',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
autoEnabled: false,
mode: 'off',
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
  const base = {
    session: {
      async setModel() {},
      applyResolvedOptions(options) {
        record.mode = options.mode
        record.autoEnabled = options.autoEnabled
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
  }

  assert.equal(await module.handleAutoModeShellCommand({ ...base, input: '/auto status' }), 'handled')
  assert.equal(await module.handleAutoModeShellCommand({ ...base, input: '/manual' }), 'pass')

  assert.deepEqual(activity, [
    { message: 'Auto is off. Use /auto on or /auto off.', tone: 'note' },
  ])
})

test('auto-mode keeps Secretary control separate from goal mode', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/auto-mode/shell-command.ts')
  t.after(() => cleanup())

  const root = mkdtempSync(join(tmpdir(), 'linx-auto-mode-control-command-'))
  const archiveDir = join(root, 'session')
  mkdirSync(archiveDir, { recursive: true })
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const activity = []
  const record = {
    id: 'auto_control_command_123',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
    autoEnabled: true,
    mode: 'off',
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

  const result = await module.handleAutoModeShellCommand({
    input: '/auto status',
    session: {
      async setModel() {},
      applyResolvedOptions() {
        throw new Error('status must not rewrite goal mode')
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
  assert.equal(record.mode, 'off')
  assert.deepEqual(activity, [
    { message: 'Auto is on. Use /auto on or /auto off.', tone: 'note' },
  ])
})

test('auto-mode shell switches peer goal mode without changing Secretary auto control', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/auto-mode/shell-command.ts')
  t.after(() => cleanup())

  const root = mkdtempSync(join(tmpdir(), 'linx-auto-mode-goal-command-'))
  const archiveDir = join(root, 'session')
  mkdirSync(archiveDir, { recursive: true })
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const activity = []
  const appliedOptions = []
  const record = {
    id: 'auto_goal_command_123',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
    autoEnabled: true,
    mode: 'auto',
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
  const base = {
    session: {
      async setModel() {},
      applyResolvedOptions(options) {
        appliedOptions.push(options)
        record.mode = options.mode
        record.autoEnabled = options.autoEnabled
        record.goalMode = options.goalMode || undefined
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
  }

  const status = await module.handleAutoModeShellCommand({ ...base, input: '/goal status' })
  assert.deepEqual(status, { kind: 'send', text: '/goal status' })
  const resumed = await module.handleAutoModeShellCommand({ ...base, input: '/goal resume' })
  assert.deepEqual(resumed, { kind: 'send', text: '/goal resume' })
  const projected = await module.handleAutoModeShellCommand({ ...base, input: '/goal ship the login fix' })
  assert.deepEqual(projected, { kind: 'send', text: '/goal ship the login fix' })
  const paused = await module.handleAutoModeShellCommand({ ...base, input: '/goal pause' })
  assert.deepEqual(paused, { kind: 'send', text: '/goal pause' })
  const closed = await module.handleAutoModeShellCommand({ ...base, input: '/goal close' })
  assert.deepEqual(closed, { kind: 'send', text: '/goal close' })
  const cancelled = await module.handleAutoModeShellCommand({ ...base, input: '/goal cancel' })
  assert.deepEqual(cancelled, { kind: 'send', text: '/goal cancel' })

  assert.equal(record.autoEnabled, true)
  assert.equal(record.mode, 'auto')
  assert.equal(record.goalMode, undefined)
  assert.equal(appliedOptions.length, 5)
  assert.deepEqual(appliedOptions.map((options) => options.goalMode), [true, true, false, false, false])
  assert.deepEqual(activity, [
    { message: 'Goal command routed to current chat peer.', tone: 'note' },
    { message: 'Goal command routed to current chat peer; local supervision mirror is active.', tone: 'success' },
    { message: 'Goal command routed to current chat peer; local supervision mirror is active.', tone: 'success' },
    { message: 'Goal command routed to current chat peer; local supervision mirror is paused.', tone: 'success' },
    { message: 'Goal command routed to current chat peer; local supervision mirror is paused.', tone: 'success' },
    { message: 'Goal command routed to current chat peer; local supervision mirror is paused.', tone: 'success' },
  ])
})

test('auto-mode shell routes /auto startup commands through shared ownership before peer delivery', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/auto-mode/shell-command.ts')
  t.after(() => cleanup())

  const root = mkdtempSync(join(tmpdir(), 'linx-auto-mode-startup-route-'))
  const archiveDir = join(root, 'session')
  mkdirSync(archiveDir, { recursive: true })
  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const activity = []
  const appliedOptions = []
  const record = {
    id: 'auto_startup_route_123',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
    autoEnabled: false,
    mode: 'off',
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
  const base = {
    session: {
      async setModel() {},
      applyResolvedOptions(options) {
        appliedOptions.push(options)
        record.mode = options.mode
        record.autoEnabled = options.autoEnabled
        record.goalMode = options.goalMode || undefined
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
  }

  const goal = await module.handleAutoModeShellCommand({ ...base, input: '/auto /goal ship the login fix' })
  assert.deepEqual(goal, { kind: 'send', text: '/goal ship the login fix' })
  assert.equal(record.autoEnabled, true)
  assert.equal(record.mode, 'auto')
  assert.equal(record.goalMode, true)

  const nestedControl = await module.handleAutoModeShellCommand({ ...base, input: '/auto /auto off' })
  assert.equal(nestedControl, 'handled')
  assert.equal(record.autoEnabled, false)
  assert.equal(record.mode, 'off')
  assert.equal(record.goalMode, true)

  assert.deepEqual(appliedOptions.map((options) => ({
    autoEnabled: options.autoEnabled,
    mode: options.mode,
    goalMode: options.goalMode,
  })), [
    { autoEnabled: true, mode: 'auto', goalMode: undefined },
    { autoEnabled: true, mode: 'auto', goalMode: true },
    { autoEnabled: true, mode: 'auto', goalMode: true },
    { autoEnabled: false, mode: 'off', goalMode: true },
  ])
  assert.deepEqual(activity, [
    { message: 'Auto on: Secretary drives the session and asks when blocked.', tone: 'success' },
    { message: 'Goal command routed to current chat peer; local supervision mirror is active.', tone: 'success' },
    { message: 'Auto on: Secretary drives the session and asks when blocked.', tone: 'success' },
    { message: 'Auto off: user drives the session directly.', tone: 'success' },
  ])
})

test('auto-mode /debug toggles full-fidelity protocol view without affecting the main session state', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/auto-mode/shell-command.ts')
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
autoEnabled: false,
mode: 'off',
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

  await module.handleAutoModeShellCommand({
    input: '/debug on',
    session: { async setModel() {} },
    display,
    queueState: { steeringCount: 0, followUpCount: 0 },
    backend: 'codex',
    record,
  })

  await module.handleAutoModeShellCommand({
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
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-pod-persist-')

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
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: join(root, 'persist-timeout-log.jsonl'),
  }, async () => {
    const exitCode = await module.runAutoMode({
      backend: 'codex',
autoEnabled: true,
mode: 'auto',
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
  const sessionDir = join(autoModeHome, 'sessions', sessionDirs[0])
  const events = readFileSync(join(sessionDir, 'events.jsonl'), 'utf-8')
  assert.match(events, /Pod sync failed \| ignore pod persistence errors/)
  const sync = JSON.parse(readFileSync(join(sessionDir, 'sync.json'), 'utf-8'))
  assert.equal(sync['auto-mode-archive:pod:projection'].status, 'failed')
  assert.equal(sync['auto-mode-archive:pod:projection'].failures[0].message, 'ignore pod persistence errors')
})

test('auto-mode times out final Pod persistence without blocking local success', async (t) => {
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-pod-persist-timeout-')

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
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: join(root, 'persist-timeout-log.jsonl'),
  }, async () => {
    const startedAt = Date.now()
    const exitCode = await module.runAutoMode({
      backend: 'codex',
autoEnabled: true,
mode: 'auto',
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
  const sessionDir = join(autoModeHome, 'sessions', sessionDirs[0])
  const events = readFileSync(join(sessionDir, 'events.jsonl'), 'utf-8')
  assert.match(events, /Pod sync failed \| timed out after 5000ms/)
  const sync = JSON.parse(readFileSync(join(sessionDir, 'sync.json'), 'utf-8'))
  assert.equal(sync['auto-mode-archive:pod:projection'].status, 'failed')
  assert.equal(sync['auto-mode-archive:pod:projection'].failures[0].message, 'timed out after 5000ms')
})

test('auto-mode abort signal terminates a running ACP backend turn', async (t) => {
  const { root, binDir, linxHome, autoModeHome } = createAutoModeSandbox('linx-auto-mode-abort-signal-')
  const logFile = join(root, 'abort-signal-log.jsonl')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  writeExecutable(join(binDir, 'codex-acp'), `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')

function log(event) {
  appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({ event }) + '\\n')
}

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

process.on('SIGTERM', () => {
  log('sigterm')
  process.exit(143)
})

log('started')
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    write({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: 1 } })
    return
  }
  if (message.method === 'session/new') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'sess_abort_signal_123' } })
    return
  }
  if (message.method === 'session/prompt') {
    log('prompt')
  }
})
`)

  const { module, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())

  mockPodBackendCredential(t, module, 'codex')
  const controller = new AbortController()
  let persisted
  t.mock.method(module.autoModeRuntime, 'persistAutoModeConversationToPod', async (record) => {
    persisted = record
  })

  await withPatchedEnv(t, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_HOME: linxHome,
    FAKE_ACP_LOG: logFile,
  }, async () => {
    const run = module.runAutoMode({
      backend: 'codex',
      autoEnabled: false,
      mode: 'off',
      cwd: process.cwd(),
      prompt: 'long running turn',
      passthroughArgs: [],
      commandOverride: join(binDir, 'codex-acp'),
      signal: controller.signal,
    })

    await waitForLogEvent(logFile, 'prompt')
    controller.abort(new Error('test abort signal'))
    await assert.rejects(run, /test abort signal/)
  })

  const log = readFileSync(logFile, 'utf-8')
  assert.match(log, /"event":"sigterm"/)
  const sessionDirs = readdirSync(join(autoModeHome, 'sessions'))
  assert.equal(sessionDirs.length, 1)
  const session = JSON.parse(readFileSync(join(autoModeHome, 'sessions', sessionDirs[0], 'session.json'), 'utf-8'))
  assert.equal(session.status, 'failed')
  assert.equal(session.error, 'test abort signal')
  assert.equal(persisted.status, 'failed')
  assert.equal(persisted.error, 'test abort signal')
})

async function waitForLogEvent(path, event, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const lines = readFileSync(path, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
      if (lines.some((line) => line.event === event)) {
        return
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for log event: ${event}`)
}
