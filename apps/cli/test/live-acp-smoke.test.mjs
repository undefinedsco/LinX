import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

const LIVE_GATE = process.env.LINX_LIVE_ACP_SMOKE === '1'
const LIVE_PROMPT = process.env.LINX_LIVE_ACP_PROMPT?.trim()
  || 'Reply with exactly "linx-live-acp-ok". Do not use tools.'
const LIVE_TIMEOUT_MS = Number(process.env.LINX_LIVE_ACP_TIMEOUT_MS || 180_000)

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function commandExists(command) {
  if (!command) {
    return false
  }

  if (command.includes('/') || command.includes('\\')) {
    return existsSync(resolve(command))
  }

  const lookup = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], {
    encoding: 'utf-8',
    timeout: 3_000,
  })
  return lookup.status === 0 && lookup.stdout.trim().length > 0
}

function commandVersionOk(command, args = ['--version']) {
  if (!commandExists(command)) {
    return false
  }

  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    timeout: 5_000,
  })
  return result.status === 0
}

function hasLocalCodexCredential() {
  if (process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY) {
    return true
  }

  const authPath = process.env.LINX_CODEX_AUTH_JSON || join(homedir(), '.codex', 'auth.json')
  const auth = readJson(authPath)
  return typeof auth?.CODEX_API_KEY === 'string' || typeof auth?.OPENAI_API_KEY === 'string'
}

function claudeAuthLoggedIn() {
  if (process.env.ANTHROPIC_API_KEY) {
    return true
  }

  if (!commandExists('claude')) {
    return false
  }

  const result = spawnSync('claude', ['auth', 'status', '--json'], {
    encoding: 'utf-8',
    timeout: 6_000,
  })
  if (result.status !== 0 || !result.stdout.trim()) {
    return false
  }

  const parsed = readJsonFromString(result.stdout)
  return parsed?.loggedIn === true
    || parsed?.authenticated === true
    || parsed?.status === 'authenticated'
}

function readJsonFromString(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function claudeSmokeModel() {
  const configured = process.env.LINX_LIVE_CLAUDE_MODEL?.trim()
  if (configured) {
    return configured
  }

  const settings = readJson(join(homedir(), '.claude', 'settings.json'))
  if (settings?.env && typeof settings.env === 'object' && typeof settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL === 'string') {
    return 'haiku'
  }

  return undefined
}

function hasLocalCodeBuddyConfig() {
  if (process.env.CODEBUDDY_API_KEY) {
    return true
  }

  return existsSync(join(homedir(), '.codebuddy', 'user-state.json'))
    || existsSync(join(homedir(), '.codebuddy', 'sessions'))
}

function redact(value) {
  return String(value)
    .replace(/\bsk-[A-Za-z0-9._-]+/g, '[redacted-api-key]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted-token]')
    .replace(/((?:api[_-]?key|token|secret)["']?\s*[:=]\s*["']?)[^"',}\s]+/gi, '$1[redacted]')
}

function eventTypes(entries) {
  return new Set(entries.flatMap((entry) => (entry.events ?? []).map((event) => event.type)))
}

async function withPatchedEnv(env, fn) {
  const originals = new Map()
  for (const [key, value] of Object.entries(env)) {
    originals.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
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

function detectLiveAcpBackends(autoModeModule) {
  const codexPlan = autoModeModule.getAutoModeHook('codex').buildSpawnPlan({
    backend: 'codex',
    autoEnabled: false,
    mode: 'off',
    cwd: process.cwd(),
    passthroughArgs: [],
  })
  const codexCommandAvailable = commandExists(codexPlan.command)
  const codexCredentialAvailable = hasLocalCodexCredential()
  const claudeCommandAvailable = commandExists('claude-code-acp')
  const claudeAuthAvailable = claudeAuthLoggedIn()
  const codeBuddyCommandAvailable = commandVersionOk('codebuddy')
  const codeBuddyConfigAvailable = hasLocalCodeBuddyConfig()

  const cases = [
    {
      backend: 'codex',
      command: codexPlan.command,
      model: process.env.LINX_LIVE_CODEX_MODEL?.trim() || undefined,
      available: codexCommandAvailable && codexCredentialAvailable,
      reason: !codexCommandAvailable
        ? `codex-acp command not found (${codexPlan.command})`
        : !codexCredentialAvailable
          ? 'no local Codex auth marker found'
          : undefined,
    },
    {
      backend: 'claude',
      command: 'claude-code-acp',
      model: claudeSmokeModel(),
      available: claudeCommandAvailable && claudeAuthAvailable,
      reason: !claudeCommandAvailable
        ? 'claude-code-acp command not found'
        : !claudeAuthAvailable
          ? 'Claude auth is not logged in'
          : undefined,
    },
    {
      backend: 'codebuddy',
      command: 'codebuddy',
      model: process.env.LINX_LIVE_CODEBUDDY_MODEL?.trim() || undefined,
      available: codeBuddyCommandAvailable && codeBuddyConfigAvailable,
      reason: !codeBuddyCommandAvailable
        ? 'codebuddy command not found or --version failed'
        : !codeBuddyConfigAvailable
          ? 'no local CodeBuddy config marker found'
          : undefined,
    },
  ]

  return cases
}

test('optional live ACP backend smoke detects local environment and runs configured backends', { skip: !LIVE_GATE }, async (t) => {
  const { module: autoModeModule, cleanup } = await loadAutoModeModule()
  t.after(() => cleanup())
  t.mock.method(autoModeModule.autoModeRuntime, 'persistAutoModeConversationToPod', async () => {})

  const cases = detectLiveAcpBackends(autoModeModule)
  const runnable = cases.filter((item) => item.available)

  for (const item of cases) {
    t.diagnostic(`${item.backend}: ${item.available ? 'available' : `skip (${item.reason})`}${item.model ? ` model=${item.model}` : ''}`)
  }

  if (runnable.length === 0) {
    t.skip('No configured live ACP backend found in the current environment.')
    return
  }

  for (const item of runnable) {
    await t.test(`${item.backend} live ACP turn`, async () => {
      const root = mkdtempSync(join(tmpdir(), `linx-live-acp-${item.backend}-`))
      const workspace = join(root, 'workspace')
      const linxHome = join(root, 'linx-home')
      mkdirSync(workspace, { recursive: true })

      try {
        let record
        let events

        await withPatchedEnv({
          LINX_HOME: linxHome,
          LINX_BACKEND_PLAIN: '1',
        }, async () => {
          const exitCode = await autoModeModule.runAutoMode({
            backend: item.backend,
            autoEnabled: false,
            mode: 'off',
            cwd: workspace,
            plain: true,
            quiet: true,
            model: item.model,
            prompt: LIVE_PROMPT,
            passthroughArgs: [],
            credentialSource: 'local',
            signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
            metadata: {
              liveSmoke: true,
            },
          }).catch((error) => {
            throw new Error(redact(error instanceof Error ? error.message : String(error)))
          })

          assert.equal(exitCode, 0)
          const sessions = autoModeModule.listArchivedAutoModeSessions()
          record = sessions.find((session) => session.backend === item.backend)
          assert.ok(record, `expected archived ${item.backend} session`)
          events = autoModeModule.loadArchivedAutoModeEvents(record.id)
        })

        assert.equal(record.status, 'completed')
        assert.equal(record.backend, item.backend)
        assert.equal(record.credentialSource, 'local')
        assert.equal(record.resolvedCredentialSource, 'local')
        assert.equal(record.transport, 'acp')
        assert.ok(record.backendSessionId, 'expected ACP backend session id')
        assert.ok(events.length > 0, 'expected archived ACP events')

        const types = eventTypes(events)
        assert.equal(types.has('assistant.done'), true, 'expected assistant.done event')
        assert.equal(
          events.some((entry) => entry.line.includes('session/prompt') || entry.line.includes('turn.stop')),
          true,
          'expected prompt/turn marker in archive',
        )
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  }
})
