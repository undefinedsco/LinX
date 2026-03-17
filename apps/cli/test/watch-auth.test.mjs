import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { loadWatchModule } from './watch-test-bundle.mjs'

let watchModulePromise

async function getWatchBundle() {
  if (!watchModulePromise) {
    watchModulePromise = loadWatchModule()
  }

  return watchModulePromise
}

async function runWatch(entryPath, options, env) {
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import(${JSON.stringify(pathToFileURL(entryPath).href)})
          .then(({ runWatch }) => runWatch(${JSON.stringify(options)}))
          .then((exitCode) => {
            process.exit(exitCode);
          })
          .catch((error) => {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          });
      `,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf-8')
  child.stderr.setEncoding('utf-8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => resolve(code))
  })

  return {
    exitCode,
    stdout,
    stderr,
  }
}

test('claude auth preflight parser recognizes logged-out status json', async () => {
  const { module } = await getWatchBundle()
  const parsed = module.__internal.parseClaudeAuthStatus(JSON.stringify({
    loggedIn: false,
    authMethod: 'none',
    apiProvider: 'firstParty',
  }))

  assert.equal(parsed.state, 'unauthenticated')
  assert.match(parsed.message, /claude auth login/)
})

test('runtime auth failure detection prefers protocol payloads', async () => {
  const { module } = await getWatchBundle()
  const failure = module.detectWatchAuthFailure('claude', JSON.stringify({
    type: 'assistant',
    error: 'authentication_failed',
    message: {
      content: [{ type: 'text', text: 'Not logged in · Please run /login' }],
    },
  }))

  assert.ok(failure)
  assert.match(failure.message, /Claude Code is not authenticated/)
  assert.match(failure.message, /claude auth login/)
})

test('pod ai selector prefers active anthropic credentials', async () => {
  const { module } = await getWatchBundle()
  const match = module.__podInternal.selectPodCredentialForBackend('claude', [
    {
      id: 'cred-openai',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-openai',
      provider: 'https://pod.example/settings/ai/providers.ttl#openai',
    },
    {
      id: 'cred-anthropic',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-anthropic',
      provider: 'https://pod.example/settings/ai/providers.ttl#anthropic',
    },
  ], [
    {
      id: 'anthropic',
      '@id': 'https://pod.example/settings/ai/providers.ttl#anthropic',
    },
    {
      id: 'openai',
      '@id': 'https://pod.example/settings/ai/providers.ttl#openai',
    },
  ])

  assert.deepEqual(match, {
    providerId: 'anthropic',
    apiKey: 'sk-anthropic',
    baseUrl: undefined,
  })
})

test('pod ai selector maps openai credentials to codex backend', async () => {
  const { module } = await getWatchBundle()
  const match = module.__podInternal.selectPodCredentialForBackend('codex', [
    {
      id: 'cred-openai',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-openai',
      provider: 'https://pod.example/settings/ai/providers.ttl#openai',
    },
  ], [
    {
      id: 'openai',
      '@id': 'https://pod.example/settings/ai/providers.ttl#openai',
      baseUrl: 'https://api.openai.com/v1',
    },
  ])

  assert.deepEqual(match, {
    providerId: 'openai',
    apiKey: 'sk-openai',
    baseUrl: 'https://api.openai.com/v1',
  })
})

test('pod ai selector maps codebuddy credentials and prefers credential baseUrl', async () => {
  const { module } = await getWatchBundle()
  const match = module.__podInternal.selectPodCredentialForBackend('codebuddy', [
    {
      id: 'cred-codebuddy',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-codebuddy',
      provider: 'https://pod.example/settings/ai/providers.ttl#codebuddy',
      baseUrl: 'https://proxy.codebuddy.example/v1',
    },
  ], [
    {
      id: 'codebuddy',
      '@id': 'https://pod.example/settings/ai/providers.ttl#codebuddy',
      baseUrl: 'https://api.codebuddy.ai/v1',
    },
  ])

  assert.deepEqual(match, {
    providerId: 'codebuddy',
    apiKey: 'sk-codebuddy',
    baseUrl: 'https://proxy.codebuddy.example/v1',
  })
})

test('auto credential source falls back to cloud for claude when local auth is unavailable', async (t) => {
  const { module } = await getWatchBundle()

  let preflightCalls = 0
  let podCalls = 0

  t.mock.method(module.watchRuntime, 'preflightWatchAuth', async (backend) => {
    preflightCalls += 1
    assert.equal(backend, 'claude')
    return {
      state: 'unauthenticated',
      message: 'Claude Code is not authenticated. Run `claude auth login` and try again.',
    }
  })

  t.mock.method(module.watchRuntime, 'loadPodBackendCredential', async (backend) => {
    podCalls += 1
    assert.equal(backend, 'claude')
    return {
      backend: 'claude',
      provider: 'anthropic',
      env: {
        ANTHROPIC_API_KEY: 'sk-pod-key',
      },
    }
  })

  const resolved = await module.resolveWatchRunOptions({
    backend: 'claude',
    mode: 'smart',
    cwd: process.cwd(),
    prompt: 'hello',
    passthroughArgs: [],
    credentialSource: 'auto',
  })

  assert.equal(preflightCalls, 1)
  assert.equal(podCalls, 1)
  assert.equal(resolved.options.credentialSource, 'auto')
  assert.equal(resolved.options.resolvedCredentialSource, 'cloud')
  assert.deepEqual(resolved.options.commandEnv, {
    ANTHROPIC_API_KEY: 'sk-pod-key',
  })
  assert.equal(resolved.authPreflight.state, 'authenticated')
})

test('cloud credential source resolves pod-backed codex credentials and skips local auth preflight', async (t) => {
  const { module } = await getWatchBundle()
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
        OPENAI_API_KEY: 'sk-openai',
      },
    }
  })

  const resolved = await module.resolveWatchRunOptions({
    backend: 'codex',
    mode: 'smart',
    cwd: process.cwd(),
    passthroughArgs: [],
    credentialSource: 'cloud',
  })

  assert.equal(preflightCalls, 0)
  assert.equal(resolved.options.resolvedCredentialSource, 'cloud')
  assert.deepEqual(resolved.options.commandEnv, {
    OPENAI_API_KEY: 'sk-openai',
  })
  assert.equal(resolved.authPreflight.state, 'authenticated')
})

test('cloud credential source resolves pod-backed codebuddy credentials and skips local auth preflight', async (t) => {
  const { module } = await getWatchBundle()
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
        CODEBUDDY_API_KEY: 'sk-codebuddy',
        CODEBUDDY_BASE_URL: 'https://proxy.codebuddy.example/v1',
      },
    }
  })

  const resolved = await module.resolveWatchRunOptions({
    backend: 'codebuddy',
    mode: 'smart',
    cwd: process.cwd(),
    passthroughArgs: [],
    credentialSource: 'cloud',
  })

  assert.equal(preflightCalls, 0)
  assert.equal(resolved.options.resolvedCredentialSource, 'cloud')
  assert.deepEqual(resolved.options.commandEnv, {
    CODEBUDDY_API_KEY: 'sk-codebuddy',
    CODEBUDDY_BASE_URL: 'https://proxy.codebuddy.example/v1',
  })
  assert.equal(resolved.authPreflight.state, 'authenticated')
})

test('watch fails fast when claude auth preflight reports logged out', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-auth-preflight-'))
  const binDir = join(root, 'bin')
  const watchHome = join(root, 'watch-home')
  const logFile = join(root, 'claude-auth-log.jsonl')

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
  process.stdout.write(JSON.stringify({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' }) + '\\n')
  process.exit(1)
}
process.stdout.write(JSON.stringify({ type: 'assistant', text: 'unexpected turn start' }) + '\\n')
process.exit(0)
`,
  )
  chmodSync(fakeClaudePath, 0o755)

  const { entryPath } = await getWatchBundle()

  const result = await runWatch(entryPath, {
    backend: 'claude',
    mode: 'smart',
    cwd: process.cwd(),
    passthroughArgs: [],
  }, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_WATCH_HOME: watchHome,
    FAKE_CLAUDE_LOG: logFile,
  })

  assert.equal(result.exitCode, 1)
  assert.match(result.stderr, /Claude Code is not authenticated/)
  assert.match(result.stderr, /claude auth login/)

  const invocations = readFileSync(logFile, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  assert.deepEqual(invocations.map((entry) => entry.args), [['auth', 'status', '--json']])

  const sessionDirs = readdirSync(join(watchHome, 'sessions'))
  assert.equal(sessionDirs.length, 1)

  const session = JSON.parse(readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'session.json'), 'utf-8'))
  assert.equal(session.status, 'failed')
  assert.match(session.error, /Claude Code is not authenticated/)

  const events = readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'events.jsonl'), 'utf-8')
  assert.match(events, /auth\.preflight/)
})

test('watch normalizes runtime auth failures for codebuddy sessions', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-auth-runtime-'))
  const binDir = join(root, 'bin')
  const watchHome = join(root, 'watch-home')

  t.after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  mkdirSync(binDir, { recursive: true })

  const fakeCodebuddyPath = join(binDir, 'codebuddy')
  writeFileSync(
    fakeCodebuddyPath,
    `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess_auth_fail' }) + '\\n')
process.stdout.write(JSON.stringify({
  type: 'assistant',
  error: 'authentication_failed',
  message: {
    content: [{ type: 'text', text: 'Not logged in · Please sign in first' }],
  },
  session_id: 'sess_auth_fail',
}) + '\\n')
process.stdout.write(JSON.stringify({
  type: 'result',
  is_error: true,
  result: 'Not logged in · Please sign in first',
  session_id: 'sess_auth_fail',
}) + '\\n')
process.exit(1)
`,
  )
  chmodSync(fakeCodebuddyPath, 0o755)

  const { entryPath } = await getWatchBundle()

  const result = await runWatch(entryPath, {
    backend: 'codebuddy',
    mode: 'smart',
    cwd: process.cwd(),
    prompt: 'hello',
    passthroughArgs: [],
  }, {
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    LINX_WATCH_HOME: watchHome,
  })

  assert.equal(result.exitCode, 1)
  assert.match(result.stdout, /Not logged in/)
  assert.match(result.stderr, /CodeBuddy Code is not authenticated/)

  const sessionDirs = readdirSync(join(watchHome, 'sessions'))
  assert.equal(sessionDirs.length, 1)

  const session = JSON.parse(readFileSync(join(watchHome, 'sessions', sessionDirs[0], 'session.json'), 'utf-8'))
  assert.equal(session.status, 'failed')
  assert.equal(session.backendSessionId, 'sess_auth_fail')
  assert.match(session.error, /CodeBuddy Code is not authenticated/)

  const eventsFile = join(watchHome, 'sessions', sessionDirs[0], 'events.jsonl')
  assert.equal(existsSync(eventsFile), true)
  const events = readFileSync(eventsFile, 'utf-8')
  assert.match(events, /authentication_failed/)
})

test.after(async () => {
  const loaded = watchModulePromise ? await watchModulePromise : null
  loaded?.cleanup()
})
