import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadWatchModule } from './watch-test-bundle.mjs'

test('pi runtime can prompt through the backend-shaped stream adapter contract', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/runtime.ts')
  t.after(() => cleanup())

  const { SessionManager } = await import('@mariozechner/pi-coding-agent')
  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-prompt-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-runtime-prompt-agent-'))
  t.after(() => {
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const completionCalls = []
  const adapter = module.createPiRuntimeAdapter({
    async createRemoteCompletion(input) {
      completionCalls.push(input)
      return 'hi'
    },
  }, {
    cwd,
    model: 'gpt-5-codex',
    providerConfig: {
      baseUrl: 'https://api.undefineds.co/v1',
      oauth: {
        name: 'LinX Cloud',
        async login() {
          return {
            refresh: 'refresh-token',
            access: 'access-token',
            expires: Date.now() + 60_000,
          }
        },
        async refreshToken(credentials) {
          return credentials
        },
        getApiKey() {
          return 'cloud-access-token'
        },
      },
    },
  })

  const runtime = await adapter.createRuntime({
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(cwd),
  })

  await runtime.session.prompt('say hi')

  assert.equal(completionCalls.length, 1)
  assert.equal(completionCalls[0].apiKey, 'cloud-access-token')
  assert.deepEqual(completionCalls[0].messages.at(-1), { role: 'user', content: 'say hi' })
  const assistantMessages = runtime.session.messages.filter((message) => message.role === 'assistant')
  assert.ok(assistantMessages.length > 0)
  assert.equal(assistantMessages.at(-1).content[0].text, 'hi')
})
