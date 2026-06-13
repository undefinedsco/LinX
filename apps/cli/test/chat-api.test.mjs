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

test('listRemoteModels normalizes LinX cloud provider display metadata', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({
      data: [
        {
          id: 'linx',
          provider: 'openai',
          owned_by: 'openai',
          context_window: 1000000,
        },
        {
          id: 'linx-lite',
          provider: 'openai',
          owned_by: 'openai',
          context_window: 200000,
        },
      ],
    }),
  })

  const { listRemoteModels } = await import('../dist/lib/chat-api.js')
  const models = await listRemoteModels({}, 'https://api.undefineds.co', 'token')

  assert.deepEqual(models.map((model) => ({ id: model.id, provider: model.provider, ownedBy: model.ownedBy })), [
    { id: 'linx', provider: 'undefineds', ownedBy: 'undefineds' },
    { id: 'linx-lite', provider: 'undefineds', ownedBy: 'undefineds' },
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

test('listRemoteModels reports explicit cloud timeout when fallback is disabled', async () => {
  const { listRemoteModels, RemoteChatRequestError } = await import('../dist/lib/chat-api.js')

  await assert.rejects(
    listRemoteModels(
      async () => {
        const error = new Error('The operation was aborted due to timeout')
        error.name = 'TimeoutError'
        throw error
      },
      'https://api.undefineds.co/v1',
      { fallback: false, timeoutMs: 5 },
    ),
    (error) => {
      assert.equal(error instanceof RemoteChatRequestError, true)
      assert.equal(error.status, 0)
      assert.equal(error.message, 'LinX Cloud models request timed out after 1s.')
      assert.match(error.responseBody, /aborted due to timeout/)
      return true
    },
  )
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

test('createRemoteCompletionResult prefers runtimeFetch over Pod data fetch on session-like auth', async () => {
  const calls = []
  const { createRemoteCompletionResult } = await import('../dist/lib/chat-api.js')
  const result = await createRemoteCompletionResult({
    runtimeUrl: 'https://api.undefineds.co/v1',
    authSession: {
      async runtimeFetch(url) {
        calls.push({ kind: 'runtime', url: String(url) })
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: 'runtime fetch ok',
                },
              },
            ],
          }),
        }
      },
      async fetch(url) {
        calls.push({ kind: 'pod', url: String(url) })
        throw new Error(`LinX Pod request timed out after 30s: POST ${url}`)
      },
    },
    model: 'linx-lite',
    messages: [{ role: 'user', content: 'hi' }],
  })

  assert.equal(result.content, 'runtime fetch ok')
  assert.deepEqual(calls, [
    { kind: 'runtime', url: 'https://api.undefineds.co/v1/chat/completions' },
  ])
})

test('createRemoteCompletionResult normalizes misclassified Pod timeout for Cloud completions', async () => {
  const { createRemoteCompletionResult, RemoteChatRequestError } = await import('../dist/lib/chat-api.js')

  await assert.rejects(
    createRemoteCompletionResult({
      runtimeUrl: 'https://api.undefineds.co/v1',
      authFetch: async () => {
        throw new Error('LinX Pod request timed out after 30s: POST https://api.undefineds.co/v1/chat/completions')
      },
      model: 'linx-lite',
      messages: [{ role: 'user', content: 'hi' }],
    }),
    (error) => {
      assert.equal(error instanceof RemoteChatRequestError, true)
      assert.equal(error.status, 0)
      assert.equal(error.message, 'LinX Cloud is temporarily unavailable. Request exceeded 30s. Please retry shortly.')
      assert.match(error.responseBody, /LinX Pod request timed out after 30s/)
      return true
    },
  )
})

test('createRemoteCompletionResult normalizes prefixed misclassified Pod timeout for Cloud completions', async () => {
  const { createRemoteCompletionResult, RemoteChatRequestError } = await import('../dist/lib/chat-api.js')

  await assert.rejects(
    createRemoteCompletionResult({
      runtimeUrl: 'https://api.undefineds.co/v1',
      authFetch: async () => {
        throw new Error('Retry failed after 3 attempts: LinX Pod request timed out after 30s: POST https://api.undefineds.co/v1/chat/completions')
      },
      model: 'linx-lite',
      messages: [{ role: 'user', content: 'hi' }],
    }),
    (error) => {
      assert.equal(error instanceof RemoteChatRequestError, true)
      assert.equal(error.status, 0)
      assert.equal(error.message, 'LinX Cloud is temporarily unavailable. Request exceeded 30s. Please retry shortly.')
      assert.match(error.responseBody, /Retry failed after 3 attempts/)
      return true
    },
  )
})

test('createRemoteCompletionResult passes external abort signal and reports user abort', async () => {
  const controller = new AbortController()
  let receivedSignal = null
  globalThis.fetch = async (_url, init) => {
    receivedSignal = init?.signal
    controller.abort()
    throw new DOMException('Aborted', 'AbortError')
  }

  const { createRemoteCompletionResult, RemoteChatRequestError } = await import('../dist/lib/chat-api.js')
  await assert.rejects(
    createRemoteCompletionResult({
      runtimeUrl: 'https://api.undefineds.co/v1',
      apiKey: 'token',
      model: 'linx-lite',
      messages: [{ role: 'user', content: 'abort me' }],
      signal: controller.signal,
    }),
    (error) => {
      assert.equal(error instanceof RemoteChatRequestError, true)
      assert.equal(error.status, 0)
      assert.match(error.message, /aborted by user/)
      assert.doesNotMatch(error.message, /timed out/)
      return true
    },
  )
  assert.ok(receivedSignal instanceof AbortSignal)
})

test('createRemoteCompletionResult forwards tools and parses tool calls', async () => {
  let requestBody = null
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body ?? '{}'))
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'bash', arguments: '{"command":"pwd"}' },
                },
              ],
            },
          },
        ],
      }),
    }
  }

  const { createRemoteCompletionResult } = await import('../dist/lib/chat-api.js')
  const result = await createRemoteCompletionResult({
    runtimeUrl: 'https://api.undefineds.co/v1',
    apiKey: 'token',
    model: 'linx-lite',
    messages: [{ role: 'user', content: 'run pwd' }],
    tools: [{ type: 'function', function: { name: 'bash', parameters: { type: 'object' } } }],
  })

  assert.equal(requestBody.model, 'linx-lite')
  assert.equal(requestBody.stream, false)
  assert.equal(requestBody.tools[0].function.name, 'bash')
  assert.equal(requestBody.tool_choice, 'auto')
  assert.equal(result.finishReason, 'tool_calls')
  assert.equal(result.toolCalls[0].function.name, 'bash')
})

test('createRemoteCompletionResult parses OpenAI-compatible reasoning fields', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            reasoning_content: 'short reasoning trace',
            content: 'final answer',
          },
        },
      ],
    }),
  })

  const { createRemoteCompletionResult } = await import('../dist/lib/chat-api.js')
  const result = await createRemoteCompletionResult({
    runtimeUrl: 'https://api.undefineds.co/v1',
    apiKey: 'token',
    model: 'linx-lite',
    messages: [{ role: 'user', content: 'think' }],
  })

  assert.equal(result.reasoningContent, 'short reasoning trace')
  assert.equal(result.content, 'final answer')
})

test('createRemoteCompletionResult maps OpenAI-compatible usage and cache tokens', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        prompt_tokens_details: {
          cached_tokens: 40,
          cache_write_tokens: 10,
        },
        completion_tokens_details: {
          reasoning_tokens: 5,
        },
      },
      choices: [
        {
          message: {
            content: 'final answer',
          },
        },
      ],
    }),
  })

  const { createRemoteCompletionResult } = await import('../dist/lib/chat-api.js')
  const result = await createRemoteCompletionResult({
    runtimeUrl: 'https://api.undefineds.co/v1',
    apiKey: 'token',
    model: 'linx-lite',
    messages: [{ role: 'user', content: 'usage' }],
  })

  assert.deepEqual(result.usage, {
    input: 60,
    output: 25,
    cacheRead: 30,
    cacheWrite: 10,
    totalTokens: 125,
  })
})

test('createRemoteCompletionResult marks invalid Solid token as expired cloud auth', async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    text: async () => JSON.stringify({
      error: 'Unauthorized',
      message: 'Invalid Solid token',
    }),
  })

  const { createRemoteCompletionResult, RemoteChatRequestError } = await import('../dist/lib/chat-api.js')
  await assert.rejects(
    createRemoteCompletionResult({
      runtimeUrl: 'https://api.undefineds.co/v1',
      apiKey: 'expired-token',
      model: 'linx-lite',
      messages: [{ role: 'user', content: 'hi' }],
    }),
    (error) => {
      assert.equal(error instanceof RemoteChatRequestError, true)
      assert.equal(error.status, 401)
      assert.equal(error.authExpired, true)
      assert.match(error.message, /LinX Cloud login expired/)
      assert.doesNotMatch(error.message, /Invalid Solid token/)
      return true
    },
  )
})

test('createRemoteCompletionResult normalizes upstream timeout errors', async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    text: async () => JSON.stringify({
      error: {
        message: 'The operation was aborted due to timeout',
      },
    }),
  })

  const { createRemoteCompletionResult, RemoteChatRequestError } = await import('../dist/lib/chat-api.js')
  await assert.rejects(
    createRemoteCompletionResult({
      runtimeUrl: 'https://api.undefineds.co/v1',
      apiKey: 'token',
      model: 'linx-lite',
      messages: [{ role: 'user', content: 'hi' }],
    }),
    (error) => {
      assert.equal(error instanceof RemoteChatRequestError, true)
      assert.equal(error.status, 500)
      assert.equal(error.message, 'LinX Cloud is temporarily unavailable. Upstream did not return in time. Please retry shortly.')
      assert.match(error.responseBody, /aborted due to timeout/)
      assert.doesNotMatch(error.message, /500|timeout|timed out|aborted/i)
      return true
    },
  )
})

test('createRemoteCompletionResult reports short upstream timeout responses without adding retry', async () => {
  let requestCount = 0
  globalThis.fetch = async () => {
    requestCount += 1
    return {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => JSON.stringify({
        error: {
          message: 'outgoing request timed out after 3500ms',
        },
      }),
    }
  }

  const { createRemoteCompletionResult, RemoteChatRequestError } = await import('../dist/lib/chat-api.js')
  await assert.rejects(
    createRemoteCompletionResult({
      runtimeUrl: 'https://api.undefineds.co/v1',
      apiKey: 'token',
      model: 'linx-lite',
      messages: [{ role: 'user', content: 'hi' }],
    }),
    (error) => {
      assert.equal(error instanceof RemoteChatRequestError, true)
      assert.equal(error.status, 500)
      assert.equal(requestCount, 1)
      assert.equal(error.message, 'LinX Cloud is temporarily unavailable. Upstream did not return in time. Please retry shortly.')
      assert.match(error.responseBody, /outgoing request timed out after 3500ms/)
      assert.doesNotMatch(error.message, /500|timeout|timed out/i)
      return true
    },
  )
})

test('createRemoteCompletionResult reports thrown fetch failed cloud 500 errors without adding retry', async () => {
  let requestCount = 0
  globalThis.fetch = async () => {
    requestCount += 1
    throw new Error('Chat request failed (500): fetch failed')
  }

  const { createRemoteCompletionResult, RemoteChatRequestError } = await import('../dist/lib/chat-api.js')
  await assert.rejects(
    createRemoteCompletionResult({
      runtimeUrl: 'https://api.undefineds.co/v1',
      apiKey: 'token',
      model: 'linx-lite',
      messages: [{ role: 'user', content: 'hi' }],
    }),
    (error) => {
      assert.equal(error instanceof RemoteChatRequestError, true)
      assert.equal(error.status, 500)
      assert.equal(requestCount, 1)
      assert.equal(error.message, 'LinX Cloud is temporarily unavailable. Please retry shortly.')
      assert.match(error.responseBody, /fetch failed/)
      assert.doesNotMatch(error.message, /500|fetch failed/i)
      return true
    },
  )
})

test('createRemoteCompletionResult reports response fetch failed cloud 500 errors without adding retry', async () => {
  let requestCount = 0
  globalThis.fetch = async () => {
    requestCount += 1
    return {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => JSON.stringify({
        error: {
          message: 'fetch failed',
        },
      }),
    }
  }

  const { createRemoteCompletionResult, RemoteChatRequestError } = await import('../dist/lib/chat-api.js')
  await assert.rejects(
    createRemoteCompletionResult({
      runtimeUrl: 'https://api.undefineds.co/v1',
      apiKey: 'token',
      model: 'linx-lite',
      messages: [{ role: 'user', content: 'hi' }],
    }),
    (error) => {
      assert.equal(error instanceof RemoteChatRequestError, true)
      assert.equal(error.status, 500)
      assert.equal(requestCount, 1)
      assert.equal(error.message, 'LinX Cloud is temporarily unavailable. Please retry shortly.')
      assert.match(error.responseBody, /fetch failed/)
      assert.doesNotMatch(error.message, /500|fetch failed/i)
      return true
    },
  )
})

test('createRemoteCompletionResult retries transient service unavailable responses once', async () => {
  let requestCount = 0
  globalThis.fetch = async () => {
    requestCount += 1
    if (requestCount === 1) {
      return {
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => JSON.stringify({
          error: 'Service Unavailable',
          details: '',
        }),
      }
    }
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'recovered',
            },
          },
        ],
      }),
    }
  }

  const { createRemoteCompletionResult } = await import('../dist/lib/chat-api.js')
  const result = await createRemoteCompletionResult({
    runtimeUrl: 'https://api.undefineds.co/v1',
    apiKey: 'token',
    model: 'linx-lite',
    messages: [{ role: 'user', content: 'hi' }],
  })

  assert.equal(requestCount, 2)
  assert.equal(result.content, 'recovered')
})

test('createRemoteCompletionResult reports persistent service unavailable as a cloud outage', async () => {
  let requestCount = 0
  globalThis.fetch = async () => {
    requestCount += 1
    return {
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => JSON.stringify({
        error: 'Service Unavailable',
        details: '',
      }),
    }
  }

  const { createRemoteCompletionResult, RemoteChatRequestError } = await import('../dist/lib/chat-api.js')
  await assert.rejects(
    createRemoteCompletionResult({
      runtimeUrl: 'https://api.undefineds.co/v1',
      apiKey: 'token',
      model: 'linx-lite',
      messages: [{ role: 'user', content: 'hi' }],
    }),
    (error) => {
      assert.equal(error instanceof RemoteChatRequestError, true)
      assert.equal(error.status, 502)
      assert.equal(requestCount, 4)
      assert.equal(error.message, 'LinX Cloud is temporarily unavailable. Please retry shortly.')
      assert.match(error.responseBody, /Service Unavailable/)
      assert.doesNotMatch(error.message, /context_length_exceeded/)
      assert.doesNotMatch(error.message, /"details"/)
      assert.doesNotMatch(error.message, /502|Service Unavailable/i)
      return true
    },
  )
})

test('createRemoteCompletionResult hides upstream HTML Bad Gateway bodies from user-visible errors', async () => {
  let requestCount = 0
  globalThis.fetch = async () => {
    requestCount += 1
    return {
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => '<html><body><h1>502 Bad Gateway</h1><hr><center>nginx</center></body></html>',
    }
  }

  const { createRemoteCompletionResult, RemoteChatRequestError } = await import('../dist/lib/chat-api.js')
  await assert.rejects(
    createRemoteCompletionResult({
      runtimeUrl: 'https://api.undefineds.co/v1',
      apiKey: 'token',
      model: 'linx-lite',
      messages: [{ role: 'user', content: 'hi' }],
    }),
    (error) => {
      assert.equal(error instanceof RemoteChatRequestError, true)
      assert.equal(error.status, 502)
      assert.equal(requestCount, 4)
      assert.equal(error.message, 'LinX Cloud is temporarily unavailable. Please retry shortly.')
      assert.match(error.responseBody, /Bad Gateway/)
      assert.doesNotMatch(error.message, /context_length_exceeded/)
      assert.doesNotMatch(error.message, /<html|<\/html>|nginx/i)
      assert.doesNotMatch(error.message, /502|Bad Gateway/i)
      return true
    },
  )
})

test('createRemoteCompletionResult reports thrown Bad Gateway errors as cloud outages', async () => {
  let requestCount = 0
  globalThis.fetch = async () => {
    requestCount += 1
    throw new Error('expected 200 OK, got: 502 Bad Gateway')
  }

  const { createRemoteCompletionResult, RemoteChatRequestError } = await import('../dist/lib/chat-api.js')
  await assert.rejects(
    createRemoteCompletionResult({
      runtimeUrl: 'https://api.undefineds.co/v1',
      apiKey: 'token',
      model: 'linx-lite',
      messages: [{ role: 'user', content: 'hi' }],
    }),
    (error) => {
      assert.equal(error instanceof RemoteChatRequestError, true)
      assert.equal(error.status, 502)
      assert.equal(requestCount, 4)
      assert.equal(error.message, 'LinX Cloud is temporarily unavailable. Please retry shortly.')
      assert.match(error.responseBody, /expected 200 OK, got: 502 Bad Gateway/)
      assert.doesNotMatch(error.message, /context_length_exceeded/)
      assert.doesNotMatch(error.message, /502|Bad Gateway/i)
      return true
    },
  )
})
