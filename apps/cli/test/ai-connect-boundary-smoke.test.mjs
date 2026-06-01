import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

function tableName(table) {
  return table?.config?.name ?? table?.name ?? 'unknown'
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
    resolveLocatorId(table, locator) {
      const name = tableName(table)
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
    insert(table) {
      return {
        values(row) {
          return {
            async execute() {
              const name = tableName(table)
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
    rows(name) {
      return Array.from(tableStore(name).values())
    },
    dependencies: {
      async resolvePodWriteContext(urlOverride) {
        contexts.push(urlOverride)
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
        return new Date('2026-05-21T00:00:00.000Z')
      },
      onSyncResult(result) {
        syncResults.push(result)
      },
    },
  }
}

test('linx ai connect smoke covers API-key provider shell-to-core writes', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/ai-command.ts')
  t.after(() => cleanup())

  const cases = [
    {
      inputProvider: 'codex',
      providerId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
    },
    {
      inputProvider: 'openrouter',
      providerId: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
    },
    {
      inputProvider: 'deepseek',
      providerId: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
    },
    {
      inputProvider: 'groq',
      providerId: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
    },
  ]

  for (const item of cases) {
    const harness = createPodConfigHarness()

    await module.runAiCommand({
      action: 'connect',
      provider: item.inputProvider,
      'api-key': `sk-${item.providerId}-boundary`,
      model: 'boundary-smoke-model',
    }, harness.dependencies)

    assert.deepEqual(harness.contexts, [undefined], item.inputProvider)
    assert.match(harness.output.join(''), new RegExp(`Connected AI provider: ${item.providerId}`))

    const provider = harness.row('aiProvider', item.providerId)
    const credential = harness.row('credential', `${item.providerId}-default`)
    const model = harness.row('aiModel', `${item.providerId}.ttl#boundary-smoke-model`)

    assert.ok(provider, `provider row should be written for ${item.inputProvider}`)
    assert.ok(credential, `credential row should be written for ${item.inputProvider}`)
    assert.ok(model, `model row should be written for ${item.inputProvider}`)
    assert.equal(provider.baseUrl, item.baseUrl)
    assert.equal(provider.hasModel, `/settings/providers/${item.providerId}.ttl#boundary-smoke-model`)
    assert.equal(credential.provider, `/settings/providers/${item.providerId}.ttl`)
    assert.equal(credential.service, 'ai')
    assert.equal(credential.status, 'active')
    assert.equal(credential.apiKey, `sk-${item.providerId}-boundary`)
    assert.equal(model.isProvidedBy, `/settings/providers/${item.providerId}.ttl`)
    assert.equal(harness.syncResults.length, 1)
    assert.equal(harness.syncResults[0].metadata.resourceBindings.provider.uri, `/settings/providers/${item.providerId}.ttl`)
  }
})

test('Pod-backed OpenRouter credential can be marked as Codex-compatible and consumed by runtime', async (t) => {
  const [{ module: aiModule, cleanup: aiCleanup }, { module: podAiModule, cleanup: podAiCleanup }] = await Promise.all([
    loadAutoModeModule('lib/ai-command.ts'),
    loadAutoModeModule('lib/auto-mode/pod-ai.ts'),
  ])
  t.after(() => aiCleanup())
  t.after(() => podAiCleanup())

  const harness = createPodConfigHarness()
  await aiModule.connectAiProviderCredential({
    provider: 'openrouter',
    apiKey: 'sk-openrouter-codex',
    supportsBackend: 'codex',
    rotationPolicy: 'round_robin',
    model: 'boundary-smoke-model',
  }, harness.dependencies)

  assert.equal(harness.row('aiProvider', 'openrouter').supportsBackend, 'codex')
  assert.equal(harness.row('aiProvider', 'openrouter').rotationPolicy, 'round_robin')

  const credential = await podAiModule.loadPodBackendCredential('codex', {
    async getPodDataSession() {
      return {
        webId: 'https://pod.example/profile/card#me',
        podUrl: 'https://pod.example/profile/',
        solidSession: {},
      }
    },
    createDb() {
      return harness.db
    },
  })

  assert.deepEqual(credential, {
    backend: 'codex',
    provider: 'openrouter',
    env: {
      CODEX_API_KEY: 'sk-openrouter-codex',
      CODEX_BASE_URL: 'https://openrouter.ai/api/v1',
    },
  })
  assert.ok(harness.row('credential', 'openrouter-default').lastUsedAt instanceof Date)
})

async function resolveOpenRouterSmokeModel(baseUrl, apiKey) {
  const configured = process.env.OPENROUTER_MODEL?.trim()
  if (configured) {
    return configured
  }

  const response = await fetch(`${baseUrl}/models`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(30_000),
  })
  assert.equal(response.ok, true, `OpenRouter model list failed: ${response.status} ${await response.text()}`)
  const payload = await response.json()
  const model = payload?.data?.find((entry) => typeof entry?.id === 'string' && entry.id.endsWith(':free'))
  assert.ok(model?.id, 'No OpenRouter :free model found; set OPENROUTER_MODEL to smoke a specific model.')
  return model.id
}

const runOpenRouterSmoke = process.env.LINX_OPENROUTER_SMOKE === '1' && Boolean(process.env.OPENROUTER_API_KEY)

test('optional live OpenRouter OpenAI-compatible request smoke', { skip: !runOpenRouterSmoke }, async () => {
  const apiKey = process.env.OPENROUTER_API_KEY
  const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
  const model = await resolveOpenRouterSmokeModel(baseUrl, apiKey)

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'http-referer': 'https://linx.undefineds.co',
      'x-title': 'LinX CLI smoke',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      max_tokens: 8,
    }),
    signal: AbortSignal.timeout(45_000),
  })

  assert.equal(response.ok, true, `OpenRouter chat completion failed: ${response.status} ${await response.text()}`)
  const payload = await response.json()
  const content = payload?.choices?.[0]?.message?.content
  assert.equal(typeof content, 'string')
  assert.match(content, /\S/)
})
