import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

function createSessionControlSnapshot(cwd) {
  const now = new Date().toISOString()
  return {
    version: 1,
    autoEnabled: true,
    controlSession: {
      id: 'control-session',
      cwd,
    },
    businessSession: {
      id: 'business-session',
      cwd,
    },
    blockedEvents: [],
    createdAt: now,
    updatedAt: now,
  }
}

function createSessionControlStub(cwd) {
  const snapshot = createSessionControlSnapshot(cwd)
  return {
    ensureControlSession() {
      return snapshot
    },
    recordAutoInputEvent() {},
    recordSecretaryRuntimeIntent() {
      return null
    },
  }
}

function createInteractiveStub(cwd, options = {}) {
  const messages = options.messages ?? [{
    type: 'message',
    message: {
      role: 'assistant',
      content: '需要下一句',
    },
  }]
  const sentUserMessages = []
  return {
    __autoEnabled: true,
    sessionManager: {
      getSessionId() {
        return 'business-session'
      },
      getSessionFile() {
        return join(cwd, 'session.json')
      },
      getCwd() {
        return cwd
      },
      getEntries() {
        return messages
      },
    },
    session: {
      cwd,
      isStreaming: false,
      model: { id: 'gpt-5-codex' },
      async sendUserMessage(text) {
        sentUserMessages.push(text)
      },
      subscribe() {
        return () => {}
      },
    },
    ui: {
      requestRender() {},
    },
    showStatus() {},
    stop() {},
    sentUserMessages,
  }
}

async function waitFor(condition, timeoutMs = 2000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('Timed out waiting for condition')
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

test('Secretary auto input reuses runtime Pod session instead of ~/.linx fallback', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/auto-input-controller.ts')
  t.after(() => cleanup())

  const home = mkdtempSync(join(tmpdir(), 'linx-secretary-home-'))
  const cwd = mkdtempSync(join(tmpdir(), 'linx-secretary-cwd-'))
  t.after(() => {
    rmSync(home, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  const runtimeFetchCalls = []
  let podSessionCalls = 0
  const runtimeSession = {
    credentials: {
      url: 'https://id.undefineds.co/',
      webId: 'https://alice.example/profile/card#me',
      authType: 'oidc_oauth',
      sourceDir: home,
      secrets: {
        oidcRefreshToken: 'refresh-token',
        oidcAccessToken: 'access-token',
        oidcExpiresAt: '2030-01-01T00:00:00.000Z',
      },
    },
    runtimeFetch: async (url, init) => {
      runtimeFetchCalls.push({
        url: String(url),
        method: init?.method ?? 'GET',
      })
      return new Response(JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: '下一句',
            },
          },
        ],
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    },
  }

  const interactive = createInteractiveStub(cwd)
  const runtime = {
    backend: 'linx',
    cwd,
    model: 'gpt-5-codex',
    async getPodDataSession() {
      podSessionCalls += 1
      return runtimeSession
    },
  }

  await withPatchedEnv(t, {
    HOME: home,
    LINX_TUI_NO_EXIT_MESSAGE: '1',
  }, async () => {
    const controller = module.getSecretaryAutoInputController(interactive, runtime, createSessionControlStub(cwd))
    controller.start()
    await waitFor(() => interactive.sentUserMessages.length > 0)
    controller.stop()
  })

  assert.equal(podSessionCalls > 0, true)
  assert.equal(runtimeFetchCalls.length > 0, true)
  assert.equal(interactive.sentUserMessages[0], '下一句')
})

test('Secretary auto input stop aborts the in-flight runtime turn', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/auto-input-controller.ts')
  t.after(() => cleanup())

  const home = mkdtempSync(join(tmpdir(), 'linx-secretary-abort-home-'))
  const cwd = mkdtempSync(join(tmpdir(), 'linx-secretary-abort-cwd-'))
  t.after(() => {
    rmSync(home, { recursive: true, force: true })
    rmSync(cwd, { recursive: true, force: true })
  })

  let podSessionCalls = 0
  let fetchStarted = false
  let fetchAborted = false
  const runtimeSession = {
    credentials: {
      url: 'https://id.undefineds.co/',
      webId: 'https://alice.example/profile/card#me',
      authType: 'oidc_oauth',
      sourceDir: home,
      secrets: {
        oidcRefreshToken: 'refresh-token',
        oidcAccessToken: 'access-token',
        oidcExpiresAt: '2030-01-01T00:00:00.000Z',
      },
    },
    runtimeFetch: async (_url, init) => {
      fetchStarted = true
      return await new Promise((resolve, reject) => {
        const signal = init?.signal
        if (signal?.aborted) {
          fetchAborted = true
          reject(new Error('aborted'))
          return
        }
        signal?.addEventListener('abort', () => {
          fetchAborted = true
          reject(new Error('aborted'))
        }, { once: true })
      })
    },
  }

  const interactive = createInteractiveStub(cwd)
  const runtime = {
    backend: 'linx',
    cwd,
    model: 'gpt-5-codex',
    async getPodDataSession() {
      podSessionCalls += 1
      return runtimeSession
    },
  }

  await withPatchedEnv(t, {
    HOME: home,
    LINX_TUI_NO_EXIT_MESSAGE: '1',
  }, async () => {
    const controller = module.getSecretaryAutoInputController(interactive, runtime, createSessionControlStub(cwd))
    controller.start()
    await waitFor(() => fetchStarted)
    controller.stop()
    await waitFor(() => fetchAborted)
  })

  assert.equal(podSessionCalls > 0, true)
  assert.equal(fetchStarted, true)
  assert.equal(fetchAborted, true)
  assert.deepEqual(interactive.sentUserMessages, [])
})
