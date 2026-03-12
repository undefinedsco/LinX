import test from 'node:test'
import assert from 'node:assert/strict'

const originalFetch = globalThis.fetch

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

test('listRemoteModels maps remote model metadata', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: [
        {
          id: 'claude-test',
          provider: 'anthropic',
          owned_by: 'anthropic',
          context_window: 200000,
        },
      ],
    }),
  })

  const { listRemoteModels } = await import('../dist/lib/chat-api.cjs')
  const models = await listRemoteModels({}, 'https://xpod.example', 'token')

  assert.deepEqual(models, [
    {
      id: 'claude-test',
      provider: 'anthropic',
      ownedBy: 'anthropic',
      contextWindow: 200000,
    },
  ])
})

test('listRemoteModels falls back to builtin catalog on request failure', async () => {
  globalThis.fetch = async () => {
    throw new Error('unreachable')
  }

  const { listRemoteModels } = await import('../dist/lib/chat-api.cjs')
  const models = await listRemoteModels({}, 'https://xpod.example', 'token')

  assert.ok(models.length > 0)
  assert.ok(models.some((model) => typeof model.id === 'string' && model.id.length > 0))
})

test('createRemoteCompletion reads string content payloads', async () => {
  globalThis.fetch = async () => ({
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
  })

  const { createRemoteCompletion } = await import('../dist/lib/chat-api.cjs')
  const reply = await createRemoteCompletion({
    xpodUrl: 'https://xpod.example',
    apiKey: 'token',
    messages: [{ role: 'user', content: 'hi' }],
  })

  assert.equal(reply, 'hello from xpod')
})

test('createRemoteCompletion joins structured content payloads', async () => {
  globalThis.fetch = async () => ({
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
  })

  const { createRemoteCompletion } = await import('../dist/lib/chat-api.cjs')
  const reply = await createRemoteCompletion({
    xpodUrl: 'https://xpod.example',
    apiKey: 'token',
    messages: [{ role: 'user', content: 'hi' }],
  })

  assert.equal(reply, 'hello world')
})
