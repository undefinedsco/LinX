import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('pi backend credential helper prompts, saves to Pod, and reloads missing codex credentials', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/backend-credentials.ts')
  t.after(() => cleanup())

  const loadCalls = []
  const saved = []
  const prompts = []
  const runtime = {
    async loadPodBackendCredential(backend) {
      loadCalls.push(backend)
      if (loadCalls.length === 1) {
        return null
      }
      return {
        backend: 'codex',
        provider: 'deepseek',
        env: {
          CODEX_API_KEY: 'sk-deepseek',
          CODEX_BASE_URL: 'https://api.deepseek.com/v1',
        },
      }
    },
    async connectAiProviderCredential(input) {
      saved.push(input)
      return {
        providerId: input.provider,
        maskedApiKey: 'sk-o****enai',
      }
    },
  }

  const credential = await module.loadOrPromptPiBackendCredential('codex', {
    runtime,
    async promptCredential(details) {
      prompts.push(details)
      return {
        providerId: '  deepseek  ',
        apiKey: '  sk-deepseek  ',
        baseUrl: '  https://api.deepseek.com/v1  ',
      }
    },
  })

  assert.deepEqual(loadCalls, ['codex', 'codex'])
  assert.deepEqual(prompts, [{
    providerIdPrompt: 'Codex provider id',
    apiKeyPrompt: 'Codex provider API key',
    baseUrlPrompt: 'Codex-compatible API base URL',
    providerId: 'openai',
    providerLabel: 'Codex-compatible provider',
    reason: 'missing',
  }])
  assert.deepEqual(saved, [{
    provider: 'deepseek',
    apiKey: 'sk-deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    supportsBackend: 'codex',
    rotationPolicy: 'round_robin',
  }])
  assert.deepEqual(credential.env, {
    CODEX_API_KEY: 'sk-deepseek',
    CODEX_BASE_URL: 'https://api.deepseek.com/v1',
  })
})

test('pi backend credential helper does not prompt when Pod already has credentials', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/backend-credentials.ts')
  t.after(() => cleanup())

  const runtime = {
    async loadPodBackendCredential() {
      return {
        backend: 'codex',
        provider: 'openai',
        env: {
          CODEX_API_KEY: 'sk-existing',
        },
      }
    },
    async connectAiProviderCredential() {
      throw new Error('should not save when credential already exists')
    },
  }

  const credential = await module.loadOrPromptPiBackendCredential('codex', {
    runtime,
    async promptCredential() {
      throw new Error('should not prompt when credential already exists')
    },
  })

  assert.deepEqual(credential.env, { CODEX_API_KEY: 'sk-existing' })
})

test('pi backend credential helper can force secretary repair for existing bad credentials', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/backend-credentials.ts')
  t.after(() => cleanup())

  const loadCalls = []
  const saved = []
  const runtime = {
    async loadPodBackendCredential() {
      loadCalls.push(true)
      return {
        backend: 'codex',
        provider: 'openai',
        env: {
          CODEX_API_KEY: saved.length === 0 ? 'sk-old' : 'sk-new',
          CODEX_BASE_URL: saved.length === 0 ? 'https://bad.example/v1' : 'https://api.openai.com/v1',
        },
      }
    },
    async connectAiProviderCredential(input) {
      saved.push(input)
      return {
        providerId: input.provider,
        maskedApiKey: 'sk-n****-key',
      }
    },
  }

  const credential = await module.promptAndSavePiBackendCredential('codex', {
    runtime,
    async promptCredential() {
      return {
        apiKey: 'sk-new',
      }
    },
    reason: 'invalid',
  })

  assert.equal(loadCalls.length, 1)
  assert.deepEqual(saved, [{
    provider: 'openai',
    apiKey: 'sk-new',
    supportsBackend: 'codex',
    rotationPolicy: 'round_robin',
  }])
  assert.deepEqual(credential.env, {
    CODEX_API_KEY: 'sk-new',
    CODEX_BASE_URL: 'https://api.openai.com/v1',
  })
})
