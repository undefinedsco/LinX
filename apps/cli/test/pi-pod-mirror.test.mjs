import test from 'node:test'
import assert from 'node:assert/strict'
import { loadWatchModule } from './watch-test-bundle.mjs'

function createSessionManager() {
  const entries = []
  return {
    getSessionId() {
      return '019df000-aaaa-bbbb-cccc-000000000001'
    },
    getSessionFile() {
      return '/tmp/demo/session.jsonl'
    },
    getSessionName() {
      return undefined
    },
    getEntries() {
      return entries
    },
    appendTestEntry(entry) {
      entries.push(entry)
    },
  }
}

function createFakePodRuntime() {
  const resources = new Map()
  const writes = []
  return {
    runtime: {
      async getPodDataSession() {
        return {
          credentials: {
            authType: 'oidc_oauth',
            url: 'https://id.undefineds.co/',
            webId: 'https://id.undefineds.co/alice/profile/card#me',
          },
          webId: 'https://id.undefineds.co/alice/profile/card#me',
          async close() {},
          async fetch(url, init = {}) {
            const method = init.method ?? 'GET'
            if (method === 'GET') {
              if (!resources.has(url)) {
                return new Response('missing', { status: 404, statusText: 'Not Found' })
              }
              return new Response(resources.get(url), {
                status: 200,
                headers: { 'Content-Type': 'text/turtle' },
              })
            }
            if (method === 'HEAD') {
              return new Response(null, { status: resources.has(url) ? 200 : 404 })
            }
            if (method === 'PUT') {
              const body = typeof init.body === 'string' ? init.body : ''
              resources.set(url, body)
              writes.push({ url, body })
              return new Response(null, { status: 201 })
            }
            return new Response('unsupported', { status: 405 })
          }
        }
      },
    },
    resources,
    writes,
  }
}

test('buildPodMessageRow maps Pi user and assistant messages into standard Pod message rows', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/pod-mirror-mapping.ts')
  t.after(() => cleanup())

  const userRow = module.buildPodMessageRow(
    'https://id.undefineds.co/alice/profile/card#me',
    { sessionManager: createSessionManager() },
    {
      type: 'message',
      id: 'u1',
      parentId: null,
      timestamp: '2026-04-01T00:00:00.000Z',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'hello pod' }],
        timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
      },
    },
  )

  assert.equal(userRow.id, '019df000-aaaa-bbbb-cccc-000000000001-u1')
  assert.match(userRow.chat, /\/\.data\/chat\/ai-secretary\/index\.ttl#this$/)
  assert.match(userRow.thread, /\/\.data\/chat\/ai-secretary\/index\.ttl#019df000-aaaa-bbbb-cccc-000000000001$/)
  assert.equal(userRow.maker, 'https://id.undefineds.co/alice/profile/card#me')
  assert.equal(userRow.role, 'user')
  assert.equal(userRow.content, 'hello pod')
  assert.equal(userRow.status, 'sent')

  const assistantRow = module.buildPodMessageRow(
    'https://id.undefineds.co/alice/profile/card#me',
    { sessionManager: createSessionManager() },
    {
      type: 'message',
      id: 'a1',
      parentId: 'u1',
      timestamp: '2026-04-01T00:00:01.000Z',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'reasoning', thinkingSignature: 'reasoning_content' },
          { type: 'text', text: 'answer' },
          { type: 'toolCall', id: 'call_1', name: 'bash', arguments: { cmd: 'pwd' } },
        ],
        api: 'openai-completions',
        provider: 'undefineds',
        model: 'linx-lite',
        usage: {
          input: 10,
          output: 5,
          cacheRead: 2,
          cacheWrite: 0,
          totalTokens: 17,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'toolUse',
        timestamp: Date.parse('2026-04-01T00:00:01.000Z'),
      },
    },
  )

  assert.equal(assistantRow.maker, 'https://id.undefineds.co/alice/.data/agents/ai-secretary.ttl')
  assert.equal(assistantRow.role, 'assistant')
  assert.match(assistantRow.content, /answer/)
  assert.match(assistantRow.content, /tool-call:bash/)
})

test('buildPodMessageRow keeps tool results as system messages linked to the same chat/thread', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/pod-mirror-mapping.ts')
  t.after(() => cleanup())

  const row = module.buildPodMessageRow(
    'https://id.undefineds.co/alice/profile/card#me',
    { sessionManager: createSessionManager() },
    {
      type: 'message',
      id: 't1',
      parentId: 'a1',
      timestamp: '2026-04-01T00:00:02.000Z',
      message: {
        role: 'toolResult',
        toolCallId: 'call_1',
        toolName: 'bash',
        content: [{ type: 'text', text: '/tmp/demo' }],
        isError: false,
        timestamp: Date.parse('2026-04-01T00:00:02.000Z'),
      },
    },
  )

  assert.match(row.chat, /\/\.data\/chat\/ai-secretary\/index\.ttl#this$/)
  assert.match(row.thread, /\/\.data\/chat\/ai-secretary\/index\.ttl#019df000-aaaa-bbbb-cccc-000000000001$/)
  assert.equal(row.role, 'system')
  assert.equal(row.content, '[tool:bash] /tmp/demo')
})

test('LinxPiPodMirror persists Pi session events into Pod tables', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/pod-mirror.ts')
  t.after(() => cleanup())

  const sessionManager = createSessionManager()
  const message = {
    role: 'user',
    content: [{ type: 'text', text: 'persist through mirror' }],
    timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
  }
  sessionManager.appendTestEntry({
    type: 'message',
    id: 'u1',
    parentId: null,
    timestamp: '2026-04-01T00:00:00.000Z',
    message,
  })

  const { runtime, resources, writes } = createFakePodRuntime()
  const mirror = new module.LinxPiPodMirror({
    cwd: '/tmp/demo',
    sessionManager,
    runtime,
  })

  mirror.handleEvent({ type: 'message_end', message })
  await mirror.flush()
  await mirror.close()

  const allTurtle = [...resources.values()].join('\n')
  assert.match(allTurtle, /https:\/\/undefineds\.co\/ns#Session/)
  assert.match(allTurtle, /https:\/\/undefineds\.co\/ns#Agent/)
  assert.match(allTurtle, /http:\/\/www\.w3\.org\/ns\/pim\/meeting#LongChat/)
  assert.match(allTurtle, /http:\/\/rdfs\.org\/sioc\/ns#Thread/)
  assert.match(allTurtle, /http:\/\/www\.w3\.org\/ns\/pim\/meeting#Message/)
  assert.match(allTurtle, /persist through mirror/)
  assert.match(allTurtle, new RegExp(`${sessionManager.getSessionId()}-u1`))
  assert.equal(writes.some((write) => write.url.endsWith('/.data/chat/ai-secretary/index.ttl')), true)
  assert.equal(writes.some((write) => /\/\.data\/sessions\/\d{4}\/\d{2}\.ttl$/.test(write.url)), true)
  assert.equal(writes.some((write) => /\/\.data\/chat\/ai-secretary\/2026\/04\/01\/messages\.ttl$/.test(write.url)), true)
  assert.equal(writes.some((write) => write.url.includes('/.data/audits/')), false)
})

test('LinxPiPodMirror writes tool execution audits to Pod tables', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/pod-mirror.ts')
  t.after(() => cleanup())

  const sessionManager = createSessionManager()
  const { runtime, resources } = createFakePodRuntime()
  const mirror = new module.LinxPiPodMirror({
    cwd: '/tmp/demo',
    sessionManager,
    runtime,
  })

  mirror.handleEvent({
    type: 'tool_execution_start',
    toolCallId: 'call-1',
    toolName: 'bash',
    args: { command: 'pwd' },
  })
  mirror.handleEvent({
    type: 'tool_execution_end',
    toolCallId: 'call-1',
    toolName: 'bash',
    result: { content: [{ type: 'text', text: '/tmp/demo' }] },
    isError: false,
  })

  await mirror.flush()
  await mirror.close()

  const auditResources = [...resources.entries()].filter(([url]) => url.includes('/.data/audits/') && url.endsWith('.ttl'))
  assert.equal(auditResources.length, 1)
  assert.equal(auditResources.every(([url]) => /\/\.data\/audits\/\d{4}\/\d{2}\/\d{2}\.ttl$/.test(url)), true)
  assert.equal(auditResources.some(([url]) => url.includes(sessionManager.getSessionId())), false)
  assert.equal(auditResources.some(([url]) => url.includes('call-1')), false)
  const auditTurtle = auditResources.map(([, body]) => body).join('\n')
  assert.match(auditTurtle, /tool_execution_started/)
  assert.match(auditTurtle, /tool_execution_completed/)
  assert.match(auditTurtle, /call-1/)
  assert.match(auditTurtle, /https:\/\/undefineds\.co\/ns#entry/)
  assert.match(auditTurtle, /https:\/\/undefineds\.co\/ns#toolName/)
  assert.match(auditTurtle, /"bash"/)
  assert.doesNotMatch(auditTurtle, /https:\/\/undefineds\.co\/ns#context/)
  assert.doesNotMatch(auditTurtle, /pwd/)
})
