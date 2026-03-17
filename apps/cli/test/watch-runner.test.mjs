import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { loadWatchModule } from './watch-test-bundle.mjs'

test('per-turn watch sessions resume backend ids across repl turns', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-runner-'))
  const binDir = join(root, 'bin')
  const watchHome = join(root, 'watch-home')
  const logFile = join(root, 'claude-invocations.jsonl')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  mkdirSync(binDir, { recursive: true })

  const fakeClaudePath = join(binDir, 'claude')
  writeFileSync(
    fakeClaudePath,
    `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const args = process.argv.slice(2)
appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ args }) + '\\n')
if (args[0] === 'auth' && args[1] === 'status' && args[2] === '--json') {
  process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: 'oauth_token', apiProvider: 'firstParty' }) + '\\n')
  process.exit(0)
}
const resumeIndex = args.indexOf('--resume')
const resumed = resumeIndex !== -1 ? args[resumeIndex + 1] : null
if (!resumed) {
  process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess_test_123' }) + '\\n')
}
process.stdout.write(JSON.stringify({ type: 'assistant', text: resumed ? 'second turn' : 'first turn' }) + '\\n')
process.stdout.write(JSON.stringify({ type: 'result', text: resumed ? 'done second' : 'done first' }) + '\\n')
`,
  )
  chmodSync(fakeClaudePath, 0o755)

  const { entryPath, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import(${JSON.stringify(pathToFileURL(entryPath).href)})
          .then(({ runWatch }) => runWatch({
            backend: 'claude',
            mode: 'smart',
            cwd: ${JSON.stringify(process.cwd())},
            passthroughArgs: []
          }))
          .then((exitCode) => {
            process.exit(exitCode);
          })
          .catch((error) => {
            console.error(error instanceof Error ? error.stack ?? error.message : String(error));
            process.exit(1);
          });
      `,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        LINX_WATCH_HOME: watchHome,
        FAKE_CLAUDE_LOG: logFile,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )

  let stdout = ''
  let stderr = ''
  let sentLines = 0
  let stdinClosed = false
  const inputs = ['first question\n', 'second question\n', '/exit\n']

  function maybeSendNextInput() {
    const promptCount = stdout.match(/you> /g)?.length ?? 0

    while (sentLines < inputs.length && promptCount > sentLines) {
      child.stdin.write(inputs[sentLines])
      sentLines += 1
    }

    if (!stdinClosed && sentLines === inputs.length) {
      stdinClosed = true
      child.stdin.end()
    }
  }

  child.stdout.setEncoding('utf-8')
  child.stderr.setEncoding('utf-8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
    maybeSendNextInput()
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => resolve(code))
  })

  assert.equal(exitCode, 0, stderr)
  assert.match(stdout, /LinX watch/)
  assert.match(stdout, /first turn/)
  assert.match(stdout, /second turn/)
  assert.match(stdout, /\[session\] completed/)

  const invocations = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(invocations.length, 3)
  assert.deepEqual(invocations[0].args, ['auth', 'status', '--json'])
  assert.ok(invocations[1].args.includes('--print'))
  assert.ok(!invocations[1].args.includes('--resume'))
  assert.equal(invocations[1].args.at(-1), 'first question')
  assert.deepEqual(
    invocations[2].args.slice(invocations[2].args.indexOf('--resume'), invocations[2].args.indexOf('--resume') + 2),
    ['--resume', 'sess_test_123'],
  )
  assert.equal(invocations[2].args.at(-1), 'second question')

  const sessionDirs = readdirSync(join(watchHome, 'sessions'))
  assert.equal(sessionDirs.length, 1)

  const session = JSON.parse(readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'session.json'), 'utf-8'))
  assert.equal(session.backendSessionId, 'sess_test_123')
  assert.equal(session.status, 'completed')

  const events = readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))

  const turnStarts = events.filter((entry) => {
    try {
      return JSON.parse(entry.line).type === 'turn.start'
    } catch {
      return false
    }
  })

  assert.equal(turnStarts.length, 2)
})

test('runWatch injects cloud-backed claude credentials and skips local auth preflight for cloud credential-source', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-pod-runner-'))
  const binDir = join(root, 'bin')
  const watchHome = join(root, 'watch-home')
  const logFile = join(root, 'claude-invocations.jsonl')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  mkdirSync(binDir, { recursive: true })

  const fakeClaudePath = join(binDir, 'claude')
  writeFileSync(
    fakeClaudePath,
    `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const args = process.argv.slice(2)
appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ args, apiKey: process.env.ANTHROPIC_API_KEY ?? null }) + '\\n')
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess_pod_123' }) + '\\n')
process.stdout.write(JSON.stringify({ type: 'assistant', text: 'pod-backed turn' }) + '\\n')
process.stdout.write(JSON.stringify({ type: 'result', text: 'pod-backed done' }) + '\\n')
`,
  )
  chmodSync(fakeClaudePath, 0o755)

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  const originalPath = process.env.PATH
  const originalWatchHome = process.env.LINX_WATCH_HOME

  process.env.PATH = `${binDir}:${process.env.PATH ?? ''}`
  process.env.LINX_WATCH_HOME = watchHome
  process.env.FAKE_CLAUDE_LOG = logFile

  t.after(() => {
    if (originalPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = originalPath
    }

    if (originalWatchHome === undefined) {
      delete process.env.LINX_WATCH_HOME
    } else {
      process.env.LINX_WATCH_HOME = originalWatchHome
    }

    delete process.env.FAKE_CLAUDE_LOG
  })

  let preflightCalls = 0

  t.mock.method(module.watchRuntime, 'preflightWatchAuth', async () => {
    preflightCalls += 1
    return { state: 'authenticated' }
  })

  t.mock.method(module.watchRuntime, 'loadPodBackendCredential', async (backend) => {
    assert.equal(backend, 'claude')
    return {
      backend: 'claude',
      provider: 'anthropic',
      env: {
        ANTHROPIC_API_KEY: 'sk-pod-key',
      },
    }
  })

  t.mock.method(module.watchRuntime, 'promptText', async () => '/exit')

  const exitCode = await module.runWatch({
    backend: 'claude',
    mode: 'smart',
    cwd: process.cwd(),
    prompt: 'hello from cloud',
    passthroughArgs: [],
    credentialSource: 'cloud',
  })

  assert.equal(exitCode, 0)
  assert.equal(preflightCalls, 0)

  const invocations = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(invocations.length, 1)
  assert.equal(invocations[0].apiKey, 'sk-pod-key')
  assert.ok(invocations[0].args.includes('--print'))
  assert.equal(invocations[0].args.at(-1), 'hello from cloud')

  const sessionDirs = readdirSync(join(watchHome, 'sessions'))
  assert.equal(sessionDirs.length, 1)

  const session = JSON.parse(readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'session.json'), 'utf-8'))
  assert.equal(session.credentialSource, 'cloud')
  assert.equal(session.resolvedCredentialSource, 'cloud')
  assert.equal(session.backendSessionId, 'sess_pod_123')
  assert.equal(session.status, 'completed')

  const events = readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /credentials\.resolve/)
})

test('runWatch injects cloud-backed codebuddy credentials for cloud credential-source', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-codebuddy-runner-'))
  const binDir = join(root, 'bin')
  const watchHome = join(root, 'watch-home')
  const logFile = join(root, 'codebuddy-invocations.jsonl')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  mkdirSync(binDir, { recursive: true })

  const fakeCodebuddyPath = join(binDir, 'codebuddy')
  writeFileSync(
    fakeCodebuddyPath,
    `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const args = process.argv.slice(2)
appendFileSync(process.env.FAKE_CODEBUDDY_LOG, JSON.stringify({
  args,
  apiKey: process.env.CODEBUDDY_API_KEY ?? null,
  baseUrl: process.env.CODEBUDDY_BASE_URL ?? null,
}) + '\\n')
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess_codebuddy_123' }) + '\\n')
process.stdout.write(JSON.stringify({ type: 'assistant', text: 'codebuddy pod-backed turn' }) + '\\n')
process.stdout.write(JSON.stringify({ type: 'result', text: 'codebuddy pod-backed done' }) + '\\n')
`,
  )
  chmodSync(fakeCodebuddyPath, 0o755)

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  const originalPath = process.env.PATH
  const originalWatchHome = process.env.LINX_WATCH_HOME

  process.env.PATH = `${binDir}:${process.env.PATH ?? ''}`
  process.env.LINX_WATCH_HOME = watchHome
  process.env.FAKE_CODEBUDDY_LOG = logFile

  t.after(() => {
    if (originalPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = originalPath
    }

    if (originalWatchHome === undefined) {
      delete process.env.LINX_WATCH_HOME
    } else {
      process.env.LINX_WATCH_HOME = originalWatchHome
    }

    delete process.env.FAKE_CODEBUDDY_LOG
  })

  let preflightCalls = 0

  t.mock.method(module.watchRuntime, 'preflightWatchAuth', async () => {
    preflightCalls += 1
    return { state: 'authenticated' }
  })

  t.mock.method(module.watchRuntime, 'loadPodBackendCredential', async (backend) => {
    assert.equal(backend, 'codebuddy')
    return {
      backend: 'codebuddy',
      provider: 'codebuddy',
      env: {
        CODEBUDDY_API_KEY: 'sk-codebuddy-key',
        CODEBUDDY_BASE_URL: 'https://proxy.codebuddy.example/v1',
      },
    }
  })

  t.mock.method(module.watchRuntime, 'promptText', async () => '/exit')

  const exitCode = await module.runWatch({
    backend: 'codebuddy',
    mode: 'smart',
    cwd: process.cwd(),
    prompt: 'hello from codebuddy cloud',
    passthroughArgs: [],
    credentialSource: 'cloud',
  })

  assert.equal(exitCode, 0)
  assert.equal(preflightCalls, 0)

  const invocations = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(invocations.length, 1)
  assert.equal(invocations[0].apiKey, 'sk-codebuddy-key')
  assert.equal(invocations[0].baseUrl, 'https://proxy.codebuddy.example/v1')
  assert.ok(invocations[0].args.includes('--print'))
  assert.equal(invocations[0].args.at(-1), 'hello from codebuddy cloud')

  const sessionDirs = readdirSync(join(watchHome, 'sessions'))
  assert.equal(sessionDirs.length, 1)

  const session = JSON.parse(readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'session.json'), 'utf-8'))
  assert.equal(session.credentialSource, 'cloud')
  assert.equal(session.resolvedCredentialSource, 'cloud')
  assert.equal(session.backendSessionId, 'sess_codebuddy_123')
  assert.equal(session.status, 'completed')
})

test('runWatch injects cloud-backed codex credentials for cloud credential-source', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-codex-runner-'))
  const binDir = join(root, 'bin')
  const watchHome = join(root, 'watch-home')
  const logFile = join(root, 'codex-invocations.jsonl')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  mkdirSync(binDir, { recursive: true })

  const fakeCodexPath = join(binDir, 'codex')
  writeFileSync(
    fakeCodexPath,
    `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')
appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({
  args: process.argv.slice(2),
  apiKey: process.env.OPENAI_API_KEY ?? null,
}) + '\\n')
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }) + '\\n')
    return
  }
  if (message.method === 'thread/start') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result: { thread: { id: 'thread_codex_123' } },
    }) + '\\n')
    return
  }
  if (message.method === 'turn/start') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result: { turn: { id: 'turn_codex_123' } },
    }) + '\\n')
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'item/agentMessage/delta',
      params: { delta: 'codex pod-backed turn' },
    }) + '\\n')
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { turn: { id: 'turn_codex_123' } },
    }) + '\\n')
  }
})
`,
  )
  chmodSync(fakeCodexPath, 0o755)

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  const originalPath = process.env.PATH
  const originalWatchHome = process.env.LINX_WATCH_HOME

  process.env.PATH = `${binDir}:${process.env.PATH ?? ''}`
  process.env.LINX_WATCH_HOME = watchHome
  process.env.FAKE_CODEX_LOG = logFile

  t.after(() => {
    if (originalPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = originalPath
    }

    if (originalWatchHome === undefined) {
      delete process.env.LINX_WATCH_HOME
    } else {
      process.env.LINX_WATCH_HOME = originalWatchHome
    }

    delete process.env.FAKE_CODEX_LOG
  })

  let preflightCalls = 0

  t.mock.method(module.watchRuntime, 'preflightWatchAuth', async () => {
    preflightCalls += 1
    return { state: 'authenticated' }
  })

  t.mock.method(module.watchRuntime, 'loadPodBackendCredential', async (backend) => {
    assert.equal(backend, 'codex')
    return {
      backend: 'codex',
      provider: 'openai',
      env: {
        OPENAI_API_KEY: 'sk-openai-key',
      },
    }
  })

  t.mock.method(module.watchRuntime, 'promptText', async () => '/exit')

  const exitCode = await module.runWatch({
    backend: 'codex',
    mode: 'smart',
    cwd: process.cwd(),
    prompt: 'hello from codex cloud',
    passthroughArgs: [],
    credentialSource: 'cloud',
  })

  assert.equal(exitCode, 0)
  assert.equal(preflightCalls, 0)

  const invocations = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(invocations.length, 1)
  assert.deepEqual(invocations[0].args, ['app-server', '--listen', 'stdio://'])
  assert.equal(invocations[0].apiKey, 'sk-openai-key')

  const sessionDirs = readdirSync(join(watchHome, 'sessions'))
  assert.equal(sessionDirs.length, 1)

  const session = JSON.parse(readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'session.json'), 'utf-8'))
  assert.equal(session.credentialSource, 'cloud')
  assert.equal(session.resolvedCredentialSource, 'cloud')
  assert.equal(session.status, 'completed')
})

test('codex watch smart mode auto-approves trusted command requests via shared interaction rules', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-codex-approval-'))
  const binDir = join(root, 'bin')
  const watchHome = join(root, 'watch-home')
  const requestLog = join(root, 'codex-requests.jsonl')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  mkdirSync(binDir, { recursive: true })

  const fakeCodexPath = join(binDir, 'codex')
  writeFileSync(
    fakeCodexPath,
    `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')
const rl = readline.createInterface({ input: process.stdin })
let pendingApprovalId = null
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }) + '\\n')
    return
  }
  if (message.method === 'thread/start') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result: { thread: { id: 'thread_codex_approval_123' } },
    }) + '\\n')
    return
  }
  if (message.method === 'turn/start') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result: { turn: { id: 'turn_codex_approval_123' } },
    }) + '\\n')
    pendingApprovalId = 200
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: pendingApprovalId,
      method: 'item/commandExecution/requestApproval',
      params: { command: 'pwd', cwd: '/tmp/demo' },
    }) + '\\n')
    return
  }
  if (pendingApprovalId !== null && message.id === pendingApprovalId) {
    appendFileSync(process.env.FAKE_CODEX_REQUEST_LOG, JSON.stringify(message) + '\\n')
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { turn: { id: 'turn_codex_approval_123' } },
    }) + '\\n')
  }
})
`,
  )
  chmodSync(fakeCodexPath, 0o755)

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  const originalPath = process.env.PATH
  const originalWatchHome = process.env.LINX_WATCH_HOME
  const originalRequestLog = process.env.FAKE_CODEX_REQUEST_LOG

  process.env.PATH = `${binDir}:${process.env.PATH ?? ''}`
  process.env.LINX_WATCH_HOME = watchHome
  process.env.FAKE_CODEX_REQUEST_LOG = requestLog

  t.after(() => {
    if (originalPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = originalPath
    }

    if (originalWatchHome === undefined) {
      delete process.env.LINX_WATCH_HOME
    } else {
      process.env.LINX_WATCH_HOME = originalWatchHome
    }

    if (originalRequestLog === undefined) {
      delete process.env.FAKE_CODEX_REQUEST_LOG
    } else {
      process.env.FAKE_CODEX_REQUEST_LOG = originalRequestLog
    }
  })

  t.mock.method(module.watchRuntime, 'preflightWatchAuth', async () => ({ state: 'authenticated' }))

  let promptCalls = 0
  t.mock.method(module.watchRuntime, 'promptText', async () => {
    promptCalls += 1
    return '/exit'
  })

  const exitCode = await module.runWatch({
    backend: 'codex',
    mode: 'smart',
    cwd: process.cwd(),
    prompt: 'inspect trusted command',
    passthroughArgs: [],
    credentialSource: 'local',
  })

  assert.equal(exitCode, 0)
  assert.equal(promptCalls, 1)

  const responses = readFileSync(requestLog, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.equal(responses.length, 1)
  assert.deepEqual(responses[0].result, {
    decision: 'accept',
  })

  const sessionDirs = readdirSync(join(watchHome, 'sessions'))
  const events = readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /"type":"approval.required"/)
  assert.match(events, /"command":"pwd"/)
})

test('codex watch maps structured user input answers through shared watch questions', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-codex-input-'))
  const binDir = join(root, 'bin')
  const watchHome = join(root, 'watch-home')
  const requestLog = join(root, 'codex-input-requests.jsonl')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  mkdirSync(binDir, { recursive: true })

  const fakeCodexPath = join(binDir, 'codex')
  writeFileSync(
    fakeCodexPath,
    `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const readline = require('node:readline')
const rl = readline.createInterface({ input: process.stdin })
let pendingInputId = null
rl.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.method === 'initialize') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }) + '\\n')
    return
  }
  if (message.method === 'thread/start') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result: { thread: { id: 'thread_codex_input_123' } },
    }) + '\\n')
    return
  }
  if (message.method === 'turn/start') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result: { turn: { id: 'turn_codex_input_123' } },
    }) + '\\n')
    pendingInputId = 201
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: pendingInputId,
      method: 'item/tool/requestUserInput',
      params: {
        questions: [{
          id: 'runtime',
          header: 'Runtime',
          question: 'Choose runtime',
          options: [
            { label: 'local' },
            { label: 'cloud', description: 'Use Pod credentials' }
          ]
        }]
      },
    }) + '\\n')
    return
  }
  if (pendingInputId !== null && message.id === pendingInputId) {
    appendFileSync(process.env.FAKE_CODEX_REQUEST_LOG, JSON.stringify(message) + '\\n')
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { turn: { id: 'turn_codex_input_123' } },
    }) + '\\n')
  }
})
`,
  )
  chmodSync(fakeCodexPath, 0o755)

  const { module, cleanup } = await loadWatchModule()
  t.after(() => cleanup())

  const originalPath = process.env.PATH
  const originalWatchHome = process.env.LINX_WATCH_HOME
  const originalRequestLog = process.env.FAKE_CODEX_REQUEST_LOG

  process.env.PATH = `${binDir}:${process.env.PATH ?? ''}`
  process.env.LINX_WATCH_HOME = watchHome
  process.env.FAKE_CODEX_REQUEST_LOG = requestLog

  t.after(() => {
    if (originalPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = originalPath
    }

    if (originalWatchHome === undefined) {
      delete process.env.LINX_WATCH_HOME
    } else {
      process.env.LINX_WATCH_HOME = originalWatchHome
    }

    if (originalRequestLog === undefined) {
      delete process.env.FAKE_CODEX_REQUEST_LOG
    } else {
      process.env.FAKE_CODEX_REQUEST_LOG = originalRequestLog
    }
  })

  t.mock.method(module.watchRuntime, 'preflightWatchAuth', async () => ({ state: 'authenticated' }))

  const prompts = []
  t.mock.method(module.watchRuntime, 'promptText', async (prompt) => {
    prompts.push(prompt)
    if (prompt === 'answer> ') {
      return '2'
    }
    return '/exit'
  })

  const exitCode = await module.runWatch({
    backend: 'codex',
    mode: 'manual',
    cwd: process.cwd(),
    prompt: 'answer runtime question',
    passthroughArgs: [],
    credentialSource: 'local',
  })

  assert.equal(exitCode, 0)
  assert.ok(prompts.includes('answer> '))
  assert.ok(prompts.includes('you> '))

  const responses = readFileSync(requestLog, 'utf-8')
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

  const sessionDirs = readdirSync(join(watchHome, 'sessions'))
  const events = readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /"type":"input.required"/)
  assert.match(events, /"question":"Choose runtime"/)
})
