import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

function createRuntime(module, {
  credentialRows = [],
  providerRow = { id: 'jina' },
  fetchImpl = async () => new Response('', { status: 404 }),
} = {}) {
  const db = {
    updateCalls: [],
    findById: async (resource, id) => {
      if ((resource?.config?.name === 'aiProvider' || resource?.name === 'aiProvider') && id === 'jina') {
        return providerRow
      }
      return null
    },
    updateById: async (resource, id, data) => {
      db.updateCalls.push({ resource, id, data })
      return { id, ...data }
    },
    select() {
      return {
        from(resource) {
          return {
            async execute() {
              if (resource?.config?.name === 'credential' || resource?.name === 'credential') {
                return credentialRows
              }
              return []
            },
          }
        },
      }
    },
  }

  return {
    getPodDataSession: async () => ({
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      podUrl: 'https://id.undefineds.co/alice/',
      solidSession: { info: { isLoggedIn: true }, fetch: fetchImpl },
      fetch: fetchImpl,
      credentials: { url: 'https://id.undefineds.co/' },
      getRuntimeAuthToken: async () => 'runtime-token',
      close: async () => undefined,
    }),
    createDb: () => db,
    fetch: fetchImpl,
  }
}

test('web fetch/search tools do not expose apiKey parameters to the model', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/web-fetch.ts')
  t.after(() => cleanup())

  assert.equal('apiKey' in module.webFetchTool.parameters.properties, false)
  assert.equal('apiKey' in module.webSearchTool.parameters.properties, false)
})

test('resolveJinaApiKey reads active Jina credential through shared models', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/web-fetch.ts')
  t.after(() => cleanup())

  const runtime = createRuntime(module, {
    credentialRows: [{
      id: 'credentials.ttl#jina-default',
      provider: '/settings/providers/jina.ttl',
      service: 'ai',
      status: 'active',
      apiKey: 'jina_test_key',
    }],
  })
  const db = runtime.createDb()

  const apiKey = await module.resolveJinaApiKey(runtime)

  assert.equal(apiKey, 'jina_test_key')
  assert.equal(db.updateCalls.length, 1)
  assert.equal(db.updateCalls[0].id, 'credentials.ttl#jina-default')
})

test('web_fetch resolves Jina credential internally and calls Jina Reader', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/web-fetch.ts')
  t.after(() => {
    module.setJinaCredentialRuntime(null)
    cleanup()
  })

  const calls = []
  module.setJinaCredentialRuntime(createRuntime(module, {
    credentialRows: [{
      id: 'credentials.ttl#jina-default',
      provider: '/settings/providers/jina.ttl',
      service: 'ai',
      status: 'active',
      apiKey: 'jina_test_key',
    }],
    fetchImpl: async (url, init) => {
      calls.push({ url, authorization: init?.headers?.Authorization })
      return new Response('# Example', { status: 200, headers: { 'Content-Type': 'text/markdown' } })
    },
  }))

  const result = await module.webFetchTool.execute('call-1', { url: 'https://example.com/docs' })

  assert.equal(result.isError, undefined)
  assert.equal(calls[0].url, 'https://r.jina.ai/https://example.com/docs')
  assert.equal(calls[0].authorization, 'Bearer jina_test_key')
  assert.match(result.content[0].text, /# Example/)
})

test('web_fetch does not ask the model to read or write credential Turtle when key is missing', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/web-fetch.ts')
  t.after(() => {
    module.setJinaCredentialRuntime(null)
    cleanup()
  })

  module.setJinaCredentialRuntime(createRuntime(module))
  const result = await module.webFetchTool.execute('call-1', { url: 'https://example.com/docs' })

  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /No active Jina API key/)
  assert.doesNotMatch(result.content[0].text, /credentials\.ttl|xpod:apiKey|<#jina>|paste/i)
})
