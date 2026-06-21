import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

test('LinX chat completion projection helper lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-chat-completion-projection.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.normalizeChatCompletionMessagesFromPiContext, 'function')
  assert.equal(typeof module.normalizeChatCompletionToolsFromPiContext, 'function')
  assert.equal(typeof module.sanitizeChatCompletionMessages, 'function')
})

test('LinX stream error formatter lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-stream-error-formatting.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.formatLinxStreamErrorMessage, 'function')
  assert.equal(typeof module.isLinxStreamAbortError, 'function')
})

test('LinX completion result Pi event bridge lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-pi-completion-events.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.createLinxPiAssistantMessage, 'function')
  assert.equal(typeof module.resolveLinxPiModelId, 'function')
  assert.equal(typeof module.emitLinxCompletionResultToPiStream, 'function')
})

test('LinX backend event source bridge lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-backend-event-source.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.createLinxBackendEventSource, 'function')
})

test('LinX normalized backend event Pi text bridge lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-pi-normalized-event-stream.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.emitNormalizedBackendEventsToPiStream, 'function')
})

test('pi agent stream adapter captures session metadata and exposes a streamFn hook', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const sentTurns = []
  let listener = null
  const adapter = module.createLinxAgentStreamAdapter({
    sessionId: 'auto_native_proxy_123',
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

  assert.equal(adapter.sessionId, 'auto_native_proxy_123')
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
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const completionCalls = []
  const adapter = module.createLinxAgentStreamAdapter({
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

test('pi agent stream adapter forwards abort signal to completion backend', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const controller = new AbortController()
  const completionCalls = []
  const adapter = module.createLinxAgentStreamAdapter({
    completionBackend: {
      async complete(input) {
        completionCalls.push(input)
        controller.abort()
        throw new DOMException('Aborted', 'AbortError')
      },
    },
  })

  const events = []
  for await (const event of adapter.streamFn(undefined, {
    messages: [{ role: 'user', content: 'hello' }],
  }, {
    signal: controller.signal,
  })) {
    events.push(event)
  }

  assert.equal(completionCalls.length, 1)
  assert.equal(completionCalls[0].signal, controller.signal)
  const errorEvent = events.find((event) => event.type === 'error')
  assert.ok(errorEvent)
  assert.equal(errorEvent.reason, 'aborted')
  assert.equal(errorEvent.error.stopReason, 'aborted')
  assert.equal(errorEvent.error.errorMessage, 'Request was aborted.')
})

test('pi agent stream adapter defaults assistant metadata to linx-lite', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const adapter = module.createLinxAgentStreamAdapter({
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
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const completionCalls = []
  const adapter = module.createLinxAgentStreamAdapter({
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
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const completionCalls = []
  const adapter = module.createLinxAgentStreamAdapter({
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

test('pi agent stream adapter keeps remote reasoning content out of visible TUI output', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const adapter = module.createLinxAgentStreamAdapter({
    completionBackend: {
      async complete() {
        return {
          reasoningContent: 'model reasoning trace',
          content: 'final answer',
          finishReason: 'stop',
          toolCalls: [],
        }
      },
    },
  })

  const events = []
  for await (const event of adapter.streamFn(undefined, {
    messages: [{ role: 'user', content: 'think' }],
  })) {
    events.push(event)
  }

  assert.equal(events.some((event) => event.type.startsWith('thinking_')), false)
  assert.equal(events[1].type, 'text_start')
  assert.equal(events[2].type, 'text_delta')
  assert.equal(events[2].delta, 'final answer')
  assert.equal(events.at(-1).type, 'done')
  assert.deepEqual(events.at(-1).message.content, [
    { type: 'text', text: 'final answer' },
  ])
})

test('pi agent stream adapter attaches remote usage for Pi footer context and cache stats', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const adapter = module.createLinxAgentStreamAdapter({
    completionBackend: {
      async complete() {
        return {
          content: 'usage answer',
          usage: {
            input: 60,
            output: 25,
            cacheRead: 30,
            cacheWrite: 10,
            totalTokens: 125,
          },
        }
      },
    },
  })

  const events = []
  for await (const event of adapter.streamFn(undefined, {
    messages: [{ role: 'user', content: 'usage' }],
  })) {
    events.push(event)
  }

  assert.deepEqual(events.at(-1).message.usage, {
    input: 60,
    output: 25,
    cacheRead: 30,
    cacheWrite: 10,
    totalTokens: 125,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  })
})

test('pi agent stream adapter preserves assistant tool calls and tool results in history', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const completionCalls = []
  const adapter = module.createLinxAgentStreamAdapter({
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
      content: '',
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

test('pi agent stream adapter drops interrupted dangling tool calls from resumed history', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const completionCalls = []
  const adapter = module.createLinxAgentStreamAdapter({
    completionBackend: {
      async complete(input) {
        completionCalls.push(input)
        return 'continued'
      },
    },
  })

  for await (const _event of adapter.streamFn(undefined, {
    messages: [
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'need to inspect files', thinkingSignature: 'reasoning_content' },
          { type: 'text', text: 'I will inspect the repo.' },
          {
            type: 'toolCall',
            id: 'call_interrupted',
            name: 'bash',
            arguments: { command: 'grep -r "well-known" --include="*.ts" --include="*.json" -l' },
          },
        ],
      },
      { role: 'user', content: '继续' },
    ],
  })) {
    // drain
  }

  assert.deepEqual(completionCalls[0].messages, [
    {
      role: 'assistant',
      content: 'I will inspect the repo.',
    },
    {
      role: 'user',
      content: '继续',
    },
  ])
})

test('pi agent stream adapter preserves DeepSeek reasoning content for tool-result history', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const completionCalls = []
  const adapter = module.createLinxAgentStreamAdapter({
    completionBackend: {
      async complete(input) {
        completionCalls.push(input)
        return 'done'
      },
    },
  })

  for await (const _event of adapter.streamFn(undefined, {
    messages: [
      {
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'need to inspect cwd',
            thinkingSignature: 'reasoning_content',
          },
          { type: 'toolCall', id: 'call_1', name: 'bash', arguments: { command: 'pwd' } },
        ],
      },
      { role: 'toolResult', toolCallId: 'call_1', toolName: 'bash', content: [{ type: 'text', text: '/tmp/demo' }] },
      { role: 'user', content: 'continue' },
    ],
  })) {
    // drain
  }

  assert.equal(completionCalls[0].messages[0].reasoning_content, 'need to inspect cwd')
  assert.equal(completionCalls[0].messages[0].content, '')
  assert.equal(completionCalls[0].messages[0].tool_calls[0].id, 'call_1')
})

test('pi agent stream adapter materializes oversized tool results before remote completion', async (t) => {
  const previousSolidHome = process.env.SOLID_HOME
  const previousInlineLimit = process.env.LINX_TOOL_RESULT_INLINE_CHAR_LIMIT
  const previousHeadChars = process.env.LINX_TOOL_RESULT_EXCERPT_HEAD_CHARS
  const previousTailChars = process.env.LINX_TOOL_RESULT_EXCERPT_TAIL_CHARS
  const solidHome = mkdtempSync(join(tmpdir(), 'linx-tool-result-artifacts-'))

  process.env.SOLID_HOME = solidHome
  process.env.LINX_TOOL_RESULT_INLINE_CHAR_LIMIT = '80'
  process.env.LINX_TOOL_RESULT_EXCERPT_HEAD_CHARS = '24'
  process.env.LINX_TOOL_RESULT_EXCERPT_TAIL_CHARS = '16'

  t.after(() => {
    restoreEnv('SOLID_HOME', previousSolidHome)
    restoreEnv('LINX_TOOL_RESULT_INLINE_CHAR_LIMIT', previousInlineLimit)
    restoreEnv('LINX_TOOL_RESULT_EXCERPT_HEAD_CHARS', previousHeadChars)
    restoreEnv('LINX_TOOL_RESULT_EXCERPT_TAIL_CHARS', previousTailChars)
    rmSync(solidHome, { recursive: true, force: true })
  })

  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const longToolResult = `fetch result start\n${'x'.repeat(160)}\nfetch result end`
  const completionCalls = []
  const adapter = module.createLinxAgentStreamAdapter({
    completionBackend: {
      async complete(input) {
        completionCalls.push(input)
        return 'done'
      },
    },
  })

  for await (const _event of adapter.streamFn(undefined, {
    messages: [
      { role: 'assistant', content: [{ type: 'toolCall', id: 'call_fetch', name: 'fetch', arguments: { url: 'https://example.test/long' } }] },
      { role: 'toolResult', toolCallId: 'call_fetch', toolName: 'fetch', content: [{ type: 'text', text: longToolResult }] },
      { role: 'user', content: 'summarize the fetched page' },
    ],
  })) {
    // drain
  }

  const toolMessage = completionCalls[0].messages[1]
  assert.equal(toolMessage.role, 'tool')
  assert.match(toolMessage.content, /^\[LinX large tool result materialized\]/)
  assert.match(toolMessage.content, /tool: fetch/)
  assert.match(toolMessage.content, /original_chars:/)
  assert.match(toolMessage.content, /\[\.\.\. omitted \d+ chars; full output is in the artifact file \.\.\.\]/)
  assert.doesNotMatch(toolMessage.content, /x{80}/)

  const pathMatch = toolMessage.content.match(/^path: (.+)$/m)
  assert.ok(pathMatch)
  assert.equal(existsSync(pathMatch[1]), true)
  assert.equal(readFileSync(pathMatch[1], 'utf-8'), longToolResult)
})

test('pi agent stream adapter maps expired LinX cloud auth errors to a compact TUI error', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const adapter = module.createLinxAgentStreamAdapter({
    completionBackend: {
      async complete() {
        const error = new Error('Chat request failed (401): {"error":"Unauthorized","message":"Invalid Solid token"}')
        error.authExpired = true
        throw error
      },
    },
  })

  const events = []
  for await (const event of adapter.streamFn(undefined, {
    messages: [{ role: 'user', content: 'hello' }],
  })) {
    events.push(event)
  }

  const errorEvent = events.find((event) => event.type === 'error')
  assert.ok(errorEvent)
  assert.equal(errorEvent.error.errorMessage, 'LinX Cloud login expired.')
  assert.doesNotMatch(errorEvent.error.errorMessage, /Invalid Solid token/)
})

test('pi agent stream adapter maps misclassified cloud completion Pod timeouts to cloud errors', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const adapter = module.createLinxAgentStreamAdapter({
    completionBackend: {
      async complete() {
        throw new Error('LinX Pod request timed out after 30s: POST https://api.undefineds.co/v1/chat/completions')
      },
    },
  })

  const events = []
  for await (const event of adapter.streamFn(undefined, {
    messages: [{ role: 'user', content: 'hello' }],
  })) {
    events.push(event)
  }

  const errorEvent = events.find((event) => event.type === 'error')
  assert.ok(errorEvent)
  assert.equal(errorEvent.error.errorMessage, 'LinX Cloud is temporarily unavailable. Request exceeded 30s. Please retry shortly.')
})

test('pi agent stream adapter can expose raw cloud error details in debug mode', async (t) => {
  const previous = process.env.LINX_DEBUG_CLOUD
  process.env.LINX_DEBUG_CLOUD = '1'
  t.after(() => restoreEnv('LINX_DEBUG_CLOUD', previous))

  const { module, cleanup } = await loadAutoModeModule('lib/pi-adapter/stream.ts')
  t.after(() => cleanup())

  const adapter = module.createLinxAgentStreamAdapter({
    completionBackend: {
      async complete() {
        const error = new Error('LinX Cloud is temporarily unavailable. Please retry shortly.')
        error.status = 500
        error.responseBody = '{"error":"Platform AI error: fetch failed"}'
        throw error
      },
    },
  })

  const events = []
  for await (const event of adapter.streamFn(undefined, {
    messages: [{ role: 'user', content: 'hello' }],
  })) {
    events.push(event)
  }

  const errorEvent = events.find((event) => event.type === 'error')
  assert.ok(errorEvent)
  assert.match(errorEvent.error.errorMessage, /LinX Cloud is temporarily unavailable/)
  assert.match(errorEvent.error.errorMessage, /Cloud debug: status=500/)
  assert.match(errorEvent.error.errorMessage, /Platform AI error: fetch failed/)
})

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}
