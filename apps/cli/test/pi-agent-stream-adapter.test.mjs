import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWatchModule } from './watch-test-bundle.mjs'

test('pi agent stream adapter captures session metadata and exposes a streamFn hook', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const sentTurns = []
  let listener = null
  const adapter = module.createPiAgentStreamAdapter({
    sessionId: 'watch_native_proxy_123',
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    backend: {
      async sendTurn(input) {
        sentTurns.push(input)
        queueMicrotask(() => {
          listener?.({ type: 'assistant.delta', text: 'hel' })
          listener?.({ type: 'assistant.delta', text: 'lo' })
          listener?.({ type: 'assistant.done' })
        })
      },
      subscribe(next) {
        listener = next
        return () => {
          listener = null
        }
      },
    },
  })

  assert.equal(adapter.sessionId, 'watch_native_proxy_123')
  assert.equal(adapter.cwd, '/tmp/demo')
  assert.equal(adapter.model, 'gpt-5-codex')
  assert.equal(typeof adapter.streamFn, 'function')

  const stream = adapter.streamFn(undefined, {
    messages: [{ role: 'user', content: 'hello' }],
  })
  const events = []
  for await (const event of stream) {
    events.push(event)
  }

  assert.deepEqual(sentTurns, ['hello'])
  assert.equal(events[0].type, 'start')
  assert.equal(events[1].type, 'text_start')
  assert.equal(events[2].type, 'text_delta')
  assert.equal(events[2].delta, 'hel')
  assert.equal(events[3].type, 'text_delta')
  assert.equal(events[3].delta, 'lo')
  assert.equal(events[4].type, 'text_end')
  assert.equal(events[4].content, 'hello')
  assert.equal(events[5].type, 'done')
  assert.equal(events[5].message.model, 'gpt-5-codex')
  assert.equal(events[5].message.content[0].text, 'hello')
})

test('pi agent stream adapter can use a direct completion backend with full context', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const completionCalls = []
  const adapter = module.createPiAgentStreamAdapter({
    sessionId: 'undefineds_pi_frontend',
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    completionBackend: {
      async complete(input) {
        completionCalls.push(input)
        return 'cloud hello'
      },
    },
  })

  const stream = adapter.streamFn(undefined, {
    messages: [
      { role: 'system', content: 'be concise' },
      { role: 'user', content: 'hello' },
    ],
  }, {
    apiKey: 'cloud-access-token',
  })
  const events = []
  for await (const event of stream) {
    events.push(event)
  }

  assert.equal(completionCalls.length, 1)
  assert.equal(completionCalls[0].apiKey, 'cloud-access-token')
  assert.deepEqual(completionCalls[0].messages, [
    { role: 'system', content: 'be concise' },
    { role: 'user', content: 'hello' },
  ])
  assert.equal(events[1].type, 'text_start')
  assert.equal(events[2].type, 'text_delta')
  assert.equal(events[2].delta, 'cloud hello')
  assert.equal(events[4].type, 'done')
  assert.equal(events[4].message.content[0].text, 'cloud hello')
})

test('pi agent stream adapter defaults assistant metadata to linx-lite', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const adapter = module.createPiAgentStreamAdapter({
    sessionId: 'undefineds_pi_frontend',
    cwd: '/tmp/demo',
    completionBackend: {
      async complete() {
        return 'cloud default'
      },
    },
  })

  const events = []
  for await (const event of adapter.streamFn(undefined, {
    messages: [{ role: 'user', content: 'hello' }],
  })) {
    events.push(event)
  }

  assert.equal(events[0].type, 'start')
  assert.equal(events[0].partial.model, 'linx-lite')
  assert.equal(events.at(-1).type, 'done')
  assert.equal(events.at(-1).message.model, 'linx-lite')
})

test('pi agent stream adapter uses the current session model instead of the bootstrap model', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const completionCalls = []
  const adapter = module.createPiAgentStreamAdapter({
    sessionId: 'undefineds_pi_frontend',
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    completionBackend: {
      async complete(input) {
        completionCalls.push(input)
        return 'switched model reply'
      },
    },
  })

  const events = []
  for await (const event of adapter.streamFn({ id: 'linx-lite' }, {
    messages: [{ role: 'user', content: 'hello' }],
  })) {
    events.push(event)
  }

  assert.equal(completionCalls.length, 1)
  assert.equal(completionCalls[0].model, 'linx-lite')
  assert.equal(events[0].partial.model, 'linx-lite')
  assert.equal(events.at(-1).message.model, 'linx-lite')
})

test('pi agent stream adapter forwards tools and emits tool calls for Pi agent loop', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const completionCalls = []
  const adapter = module.createPiAgentStreamAdapter({
    sessionId: 'undefineds_pi_frontend',
    cwd: '/tmp/demo',
    model: 'linx-lite',
    completionBackend: {
      async complete(input) {
        completionCalls.push(input)
        return {
          content: '',
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'bash',
                arguments: JSON.stringify({ command: 'pwd' }),
              },
            },
          ],
        }
      },
    },
  })

  const events = []
  for await (const event of adapter.streamFn(undefined, {
    messages: [{ role: 'user', content: 'run pwd' }],
    tools: [{ name: 'bash', description: 'Run a shell command', parameters: { type: 'object' } }],
  })) {
    events.push(event)
  }

  assert.equal(completionCalls.length, 1)
  assert.equal(completionCalls[0].tools[0].function.name, 'bash')
  assert.equal(events[1].type, 'toolcall_start')
  assert.equal(events[2].type, 'toolcall_delta')
  assert.equal(events[3].type, 'toolcall_end')
  assert.deepEqual(events[3].toolCall.arguments, { command: 'pwd' })
  assert.equal(events[4].type, 'done')
  assert.equal(events[4].reason, 'toolUse')
  assert.equal(events[4].message.stopReason, 'toolUse')
})

test('pi agent stream adapter preserves assistant tool calls and tool results in history', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const completionCalls = []
  const adapter = module.createPiAgentStreamAdapter({
    completionBackend: {
      async complete(input) {
        completionCalls.push(input)
        return 'done'
      },
    },
  })

  for await (const _event of adapter.streamFn(undefined, {
    messages: [
      { role: 'assistant', content: [{ type: 'toolCall', id: 'call_1', name: 'bash', arguments: { command: 'pwd' } }] },
      { role: 'toolResult', toolCallId: 'call_1', toolName: 'bash', content: [{ type: 'text', text: '/tmp/demo' }] },
      { role: 'user', content: 'what did it print?' },
    ],
  })) {
    // drain
  }

  assert.deepEqual(completionCalls[0].messages.slice(0, 2), [
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'bash',
            arguments: JSON.stringify({ command: 'pwd' }),
          },
        },
      ],
    },
    {
      role: 'tool',
      content: '/tmp/demo',
      tool_call_id: 'call_1',
      name: 'bash',
    },
  ])
})
