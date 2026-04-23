import test from 'node:test'
import assert from 'node:assert/strict'

const originalFetch = globalThis.fetch

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

test('listRemoteModels maps remote model metadata', async () => {
  let requestedUrl = null
  globalThis.fetch = async (url) => {
    requestedUrl = url
    return {
      ok: true,
      text: async () => JSON.stringify({
        data: [
          {
            id: 'claude-test',
            provider: 'anthropic',
            owned_by: 'anthropic',
            context_window: 200000,
          },
        ],
      }),
    }
  }

  const { listRemoteModels } = await import('../dist/lib/chat-api.js')
  const models = await listRemoteModels({}, 'https://api.undefineds.co', 'token')

  assert.equal(requestedUrl, 'https://api.undefineds.co/v1/models')
  assert.deepEqual(models, [
    {
      id: 'claude-test',
      provider: 'anthropic',
      ownedBy: 'anthropic',
      contextWindow: 200000,
    },
  ])
})

test('listRemoteModels does not duplicate v1 when runtime url already targets the api base', async () => {
  let requestedUrl = null
  globalThis.fetch = async (url) => {
    requestedUrl = url
    return {
      ok: true,
      text: async () => JSON.stringify({
        data: [],
      }),
    }
  }

  const { listRemoteModels } = await import('../dist/lib/chat-api.js')
  await listRemoteModels({}, 'https://api.undefineds.co/v1/', 'token')

  assert.equal(requestedUrl, 'https://api.undefineds.co/v1/models')
})

test('listRemoteModels falls back to builtin catalog on request failure', async () => {
  globalThis.fetch = async () => {
    throw new Error('unreachable')
  }

  const { listRemoteModels } = await import('../dist/lib/chat-api.js')
  const models = await listRemoteModels({}, 'https://xpod.example', 'token')

  assert.ok(models.length > 0)
  assert.ok(models.some((model) => typeof model.id === 'string' && model.id.length > 0))
})

test('createRemoteCompletion reads string content payloads', async () => {
  let requestedUrl = null
  globalThis.fetch = async (url) => {
    requestedUrl = url
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'hello from xpod',
            },
          },
        ],
      }),
    }
  }

  const { createRemoteCompletion } = await import('../dist/lib/chat-api.js')
  const reply = await createRemoteCompletion({
    runtimeUrl: 'https://xpod.example',
    apiKey: 'token',
    messages: [{ role: 'user', content: 'hi' }],
  })

  assert.equal(requestedUrl, 'https://xpod.example/v1/chat/completions')
  assert.equal(reply, 'hello from xpod')
})

test('createRemoteCompletion joins structured content payloads', async () => {
  let requestedUrl = null
  globalThis.fetch = async (url) => {
    requestedUrl = url
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: 'hello ' },
                { type: 'text', text: 'world' },
              ],
            },
          },
        ],
      }),
    }
  }

  const { createRemoteCompletion } = await import('../dist/lib/chat-api.js')
  const reply = await createRemoteCompletion({
    runtimeUrl: 'https://api.undefineds.co/v1',
    apiKey: 'token',
    messages: [{ role: 'user', content: 'hi' }],
  })

  assert.equal(requestedUrl, 'https://api.undefineds.co/v1/chat/completions')
  assert.equal(reply, 'hello world')
})

test('createRemoteCompletion defaults to linx-lite when no model override is provided', async () => {
  let requestBody = null
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body ?? '{}'))
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'hello default model',
            },
          },
        ],
      }),
    }
  }

  const { createRemoteCompletion } = await import('../dist/lib/chat-api.js')
  const reply = await createRemoteCompletion({
    runtimeUrl: 'https://api.undefineds.co/v1',
    apiKey: 'token',
    messages: [{ role: 'user', content: 'hi' }],
  })

  assert.equal(requestBody.model, 'linx-lite')
  assert.equal(reply, 'hello default model')
})
