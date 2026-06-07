import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

const originalHome = process.env.HOME
const originalUserProfile = process.env.USERPROFILE

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function readLocalCodexApiKey() {
  const authPath = process.env.LINX_CODEX_AUTH_JSON
    || (originalHome ? join(originalHome, '.codex', 'auth.json') : '')
  if (!authPath || !existsSync(authPath)) {
    return null
  }

  const parsed = JSON.parse(readFileSync(authPath, 'utf-8'))
  const key = typeof parsed.OPENAI_API_KEY === 'string'
    ? parsed.OPENAI_API_KEY.trim()
    : typeof parsed.CODEX_API_KEY === 'string'
      ? parsed.CODEX_API_KEY.trim()
      : ''
  return key || null
}

function tableName(resource) {
  return resource?.config?.name ?? resource?.name ?? 'unknown'
}

function createPodConfigHarness() {
  const operations = []
  const contexts = []
  const output = []
  const syncResults = []
  const stored = new Map()

  const tableStore = (name) => {
    if (!stored.has(name)) {
      stored.set(name, new Map())
    }
    return stored.get(name)
  }

  const recordId = (name, row) => {
    if (name === 'aiModel') {
      const providerRef = String(row.isProvidedBy ?? '')
      const provider = providerRef.includes('#') ? providerRef.split('#').pop() : providerRef.split('/').pop()
      return `${provider?.replace(/\.ttl$/, '')}.ttl#${row.id}`
    }
    return String(row.id)
  }

  const db = {
    resolveLocatorId(resource, locator) {
      const name = tableName(resource)
      if (name !== 'aiModel') {
        return typeof locator === 'string' ? locator : String(locator.id)
      }
      const providerRef = String(locator.isProvidedBy ?? '')
      const provider = providerRef.includes('#') ? providerRef.split('#').pop() : providerRef.split('/').pop()
      return `${provider?.replace(/\.ttl$/, '')}.ttl#${locator.id}`
    },
    select() {
      return {
        from(resource) {
          return {
            async execute() {
              return Array.from(tableStore(tableName(resource)).values())
            },
          }
        },
      }
    },
    async findById(resource, id) {
      return tableStore(tableName(resource)).get(id) ?? null
    },
    async updateById(resource, id, update) {
      const name = tableName(resource)
      const rows = tableStore(name)
      const next = { ...(rows.get(id) ?? {}), ...update }
      rows.set(id, next)
      operations.push({ op: 'update', table: name, id, row: next })
      return next
    },
    async deleteById(resource, id) {
      const name = tableName(resource)
      const rows = tableStore(name)
      const row = rows.get(id) ?? null
      rows.delete(id)
      operations.push({ op: 'delete', table: name, id, row })
      return row
    },
    insert(resource) {
      return {
        values(row) {
          return {
            async execute() {
              const name = tableName(resource)
              const id = recordId(name, row)
              tableStore(name).set(id, row)
              operations.push({ op: 'insert', table: name, id, row })
              return [row]
            },
          }
        },
      }
    },
  }

  return {
    db,
    operations,
    contexts,
    output,
    syncResults,
    row(name, id) {
      return tableStore(name).get(id)
    },
    dependencies: {
      async resolvePodWriteContext() {
        contexts.push(true)
        return {
          accessToken: 'test-access-token',
          podUrl: 'https://pod.example/profile/',
          webId: 'https://pod.example/profile/card#me',
        }
      },
      createDb() {
        return db
      },
      write(chunk) {
        output.push(chunk)
      },
      syncNow() {
        return new Date('2026-06-01T00:00:00.000Z')
      },
      onSyncResult(result) {
        syncResults.push(result)
      },
    },
  }
}

function writeFakeCodexAcpBackend(path) {
  writeFileSync(path, `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const { createHash } = require('node:crypto')
const readline = require('node:readline')

function write(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n')
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

const key = process.env.CODEX_API_KEY || ''
appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify({
  argv: process.argv.slice(2),
  codexKeyPresent: Boolean(key),
  codexKeyMatches: Boolean(process.env.EXPECTED_CODEX_KEY_SHA256) && sha256(key) === process.env.EXPECTED_CODEX_KEY_SHA256,
  codexBaseUrl: process.env.CODEX_BASE_URL || null,
  openaiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
}) + '\\n')

const rl = readline.createInterface({ input: process.stdin })
const sessionId = 'sess_local_codex_credentials'

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
    write({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'local codex credential smoke ok' },
        },
      },
    })
    write({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } })
  }
})
`)
  chmodSync(path, 0o755)
}

async function withPatchedEnv(env, fn) {
  const originals = new Map()
  for (const [key, value] of Object.entries(env)) {
    originals.set(key, process.env[key])
    process.env[key] = value
  }

  try {
    return await fn()
  } finally {
    for (const [key, value] of originals.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test('local .codex credentials flow through standard LinX AI config into codex auto-mode', async (t) => {
  const localCodexKey = readLocalCodexApiKey()
  if (!localCodexKey) {
    t.skip('No local .codex/auth.json API key found.')
    return
  }

  const root = mkdtempSync(join(tmpdir(), 'linx-local-codex-credential-smoke-'))
  const tempHome = join(root, 'home')
  const binDir = join(root, 'bin')
  const linxHome = join(root, 'linx-home')
  const logFile = join(root, 'codex-acp-log.jsonl')
  mkdirSync(tempHome, { recursive: true })
  mkdirSync(binDir, { recursive: true })
  writeFakeCodexAcpBackend(join(binDir, 'codex-acp'))

  const [
    { module: credentialsModule, cleanup: credentialsCleanup },
    { module: aiModule, cleanup: aiCleanup },
    { module: podAiModule, cleanup: podAiCleanup },
    { module: autoModeModule, cleanup: autoCleanup },
  ] = await Promise.all([
    loadAutoModeModule('lib/credentials-store.ts'),
    loadAutoModeModule('lib/ai-command.ts'),
    loadAutoModeModule('lib/auto-mode/pod-ai.ts'),
    loadAutoModeModule('lib/auto-mode/index.ts'),
  ])
  t.after(() => credentialsCleanup())
  t.after(() => aiCleanup())
  t.after(() => podAiCleanup())
  t.after(() => autoCleanup())

  const harness = createPodConfigHarness()
  let credentialsCleared = false

  t.after(async () => {
    await withPatchedEnv({
      HOME: tempHome,
      USERPROFILE: tempHome,
    }, async () => {
      try {
        credentialsModule.clearCredentials()
        credentialsCleared = true
      } catch {
        // Best-effort cleanup; the whole temp HOME is removed below.
      }
    })
    rmSync(root, { recursive: true, force: true })
  })

  const keyHash = sha256(localCodexKey)

  await withPatchedEnv({
    HOME: tempHome,
    USERPROFILE: tempHome,
    LINX_HOME: linxHome,
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    FAKE_ACP_LOG: logFile,
    EXPECTED_CODEX_KEY_SHA256: keyHash,
    OPENAI_API_KEY: '',
  }, async () => {
    credentialsModule.saveCredentials({
      url: 'https://id.undefineds.co/',
      webId: 'https://pod.example/profile/card#me',
      authType: 'client_credentials',
      secrets: {
        clientId: 'local-codex-smoke-client',
        clientSecret: 'local-codex-smoke-secret',
      },
    })
    assert.equal(credentialsModule.loadCredentials()?.sourceDir, join(tempHome, '.solid', 'auth'))

    await aiModule.runAiCommand({
      action: 'connect',
      provider: 'openai',
      'api-key': localCodexKey,
    }, harness.dependencies)

    assert.deepEqual(harness.contexts, [true])
    assert.match(harness.output.join(''), /Connected AI provider: openai/)
    assert.doesNotMatch(harness.output.join(''), new RegExp(localCodexKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.ok(harness.row('credential', 'openai-default'))
    assert.ok(harness.row('aiProvider', 'openai'))

    const podCredential = await podAiModule.loadPodBackendCredential('codex', {
      async getPodDataSession() {
        const credentials = credentialsModule.loadCredentials()
        assert.equal(credentials?.authType, 'client_credentials')
        return {
          credentials,
          webId: 'https://pod.example/profile/card#me',
          podUrl: 'https://pod.example/profile/',
          solidSession: { info: { isLoggedIn: true } },
        }
      },
      createDb() {
        return harness.db
      },
    })

    assert.equal(podCredential.backend, 'codex')
    assert.equal(podCredential.provider, 'openai')
    assert.equal(sha256(podCredential.env.CODEX_API_KEY), keyHash)
    assert.equal(podCredential.env.CODEX_BASE_URL, 'https://api.openai.com/v1')

    t.mock.method(autoModeModule.autoModeRuntime, 'loadPodBackendCredential', async (backend) => {
      assert.equal(backend, 'codex')
      return podCredential
    })
    t.mock.method(autoModeModule.autoModeRuntime, 'persistAutoModeConversationToPod', async () => true)

    const exitCode = await autoModeModule.runAutoMode({
      backend: 'codex',
      autoEnabled: true,
      mode: 'auto',
      cwd: process.cwd(),
      prompt: 'local credential smoke',
      passthroughArgs: [],
      credentialSource: 'cloud',
      commandOverride: join(binDir, 'codex-acp'),
    })

    assert.equal(exitCode, 0)

    const invocations = readFileSync(logFile, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    assert.equal(invocations.length, 1)
    assert.equal(invocations[0].codexKeyPresent, true)
    assert.equal(invocations[0].codexKeyMatches, true)
    assert.equal(invocations[0].codexBaseUrl, 'https://api.openai.com/v1')
    assert.deepEqual(invocations[0].argv, ['-c', 'openai_base_url="https://api.openai.com/v1"'])

    await aiModule.runAiCommand({
      action: 'disconnect',
      provider: 'openai',
    }, {
      ...harness.dependencies,
      write() {},
    })
    assert.equal(harness.row('credential', 'openai-default'), undefined)

    credentialsModule.clearCredentials()
    credentialsCleared = true
    assert.equal(credentialsModule.loadCredentials(), null)
  })

  assert.equal(credentialsCleared, true)
})
