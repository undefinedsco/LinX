import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

const WEB_ID = 'https://id.undefineds.co/alice/profile/card#me'
const POD_BASE = 'https://id.undefineds.co/alice'

test('LinX session manager lives outside the Pi adapter', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-session-manager.ts')
  t.after(() => cleanup())

  assert.equal(typeof module.createLinxPiSessionManager, 'function')
  assert.equal(typeof module.listLinxPiSessions, 'function')
  assert.equal(typeof module.resolveLinxPiSession, 'function')
})

test('createLinxPiSessionManager creates persisted sessions by default', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-session-manager.ts')
  t.after(() => cleanup())

  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-session-cwd-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-session-agent-'))
  t.after(() => {
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const manager = await module.createLinxPiSessionManager({ cwd, agentDir })
  assert.equal(manager.isPersisted(), true)
  assert.equal(manager.getCwd(), cwd)
  assert.match(manager.getSessionFile(), /\.jsonl$/)
  assert.match(manager.getSessionDir(), /sessions/)
})

test('resolveLinxPiSession accepts full and short session ids', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-session-manager.ts')
  t.after(() => cleanup())

  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-session-resume-cwd-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-session-resume-agent-'))
  t.after(() => {
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const manager = await module.createLinxPiSessionManager({ cwd, agentDir })
  manager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'persist me' }],
    api: 'openai-completions',
    provider: 'undefineds',
    model: 'linx-lite',
    usage: {
      input: 1,
      output: 2,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 3,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  })

  const resolved = await module.resolveLinxPiSession(manager.getSessionId(), cwd, manager.getSessionDir())
  assert.equal(resolved.id, manager.getSessionId())

  const shortResolved = await module.resolveLinxPiSession(manager.getSessionId().slice(0, 13), cwd, manager.getSessionDir())
  assert.equal(shortResolved.id, manager.getSessionId())

  const reopened = await module.createLinxPiSessionManager({
    cwd,
    agentDir,
    session: manager.getSessionId().slice(0, 13),
  })
  assert.equal(reopened.getSessionId(), manager.getSessionId())
  assert.equal(reopened.getEntries().some((entry) => entry.type === 'message'), true)
})

test('resuming a session repairs dangling assistant tool calls before continuation', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-session-manager.ts')
  t.after(() => cleanup())

  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-session-dangling-tool-cwd-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-session-dangling-tool-agent-'))
  t.after(() => {
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const manager = await module.createLinxPiSessionManager({ cwd, agentDir })
  manager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: 'find well-known files' }],
    timestamp: Date.now(),
  })
  manager.appendMessage({
    role: 'assistant',
    content: [{
      type: 'toolCall',
      id: 'call_dangling_1',
      name: 'bash',
      arguments: {
        command: 'grep -r "well-known" --include="*.ts" --include="*.json" -l 2>/dev/null | head -20',
      },
    }],
    api: 'openai-completions',
    provider: 'undefineds',
    model: 'linx-lite',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'toolUse',
    timestamp: Date.now(),
  })
  manager.appendMessage({
    role: 'user',
    content: [{ type: 'text', text: '继续' }],
    timestamp: Date.now(),
  })

  const reopened = await module.createLinxPiSessionManager({
    cwd,
    agentDir,
    session: manager.getSessionId().slice(0, 13),
  })
  const messages = reopened.buildSessionContext().messages
  const assistantIndex = messages.findIndex((message) => message.role === 'assistant')
  const toolResultIndex = messages.findIndex((message) => (
    message.role === 'toolResult' && message.toolCallId === 'call_dangling_1'
  ))
  const userContinueIndex = messages.findIndex((message) => (
    message.role === 'user'
    && Array.isArray(message.content)
    && message.content.some((part) => part.type === 'text' && part.text === '继续')
  ))

  assert.ok(assistantIndex >= 0)
  assert.ok(toolResultIndex > assistantIndex)
  assert.ok(userContinueIndex > toolResultIndex)
  assert.equal(messages[toolResultIndex].isError, true)
  assert.match(messages[toolResultIndex].content[0].text, /interrupted/)

  const reopenedAgain = await module.createLinxPiSessionManager({
    cwd,
    agentDir,
    session: manager.getSessionId().slice(0, 13),
  })
  const repairedResults = reopenedAgain.buildSessionContext().messages.filter((message) => (
    message.role === 'toolResult' && message.toolCallId === 'call_dangling_1'
  ))
  assert.equal(repairedResults.length, 1)
})

test('list and resume recover from Pod when local JSONL cache is missing', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/linx-session-manager.ts')
  t.after(() => cleanup())

  const cwd = mkdtempSync(join(tmpdir(), 'linx-pi-pod-session-cwd-'))
  const agentDir = mkdtempSync(join(tmpdir(), 'linx-pi-pod-session-agent-'))
  t.after(() => {
    rmSync(cwd, { recursive: true, force: true })
    rmSync(agentDir, { recursive: true, force: true })
  })

  const podSessionSource = {
    async listSessions(requestedCwd) {
      assert.equal(requestedCwd, cwd)
      return [{
        id: '019df111-pod-only-session',
        cwd: '/tmp/original-session-cwd',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:02.000Z',
        messages: [{
          id: '019df111-pod-only-session-u1',
          role: 'user',
          content: 'from pod only',
          richContent: JSON.stringify({
            linxPiSessionEntry: {
              type: 'message',
              id: 'u1',
              parentId: null,
              timestamp: '2026-04-01T00:00:00.000Z',
              message: {
                role: 'user',
                content: [{ type: 'text', text: 'from pod only' }],
                timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
              },
            },
          }),
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        }],
      }]
    },
    async findSession(input, requestedCwd) {
      const sessions = await this.listSessions(requestedCwd)
      return sessions.find((session) => session.id.startsWith(input)) ?? null
    },
  }

  const sessions = await module.listLinxPiSessions(cwd, agentDir, { podSessionSource })
  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].id, '019df111-pod-only-session')
  assert.match(sessions[0].path, /\.jsonl$/)
  assert.equal(sessions[0].firstMessage, 'from pod only')

  rmSync(sessions[0].path, { force: true })

  const resumed = await module.createLinxPiSessionManager({
    cwd,
    agentDir,
    session: '019df111',
    podSessionSource,
  })
  assert.equal(resumed.getSessionId(), '019df111-pod-only-session')
  assert.equal(resumed.getCwd(), '/tmp/original-session-cwd')
  assert.equal(resumed.getEntries().length, 1)
  assert.equal(resumed.getEntries()[0].message.content[0].text, 'from pod only')
})

test('native Pod session source reads session and messages through shared ORM resources', async (t) => {
  const { module: sessionModule, cleanup } = await loadAutoModeModule('lib/linx-session-manager.ts')
  t.after(() => cleanup())

  const sessionId = '019d4657-0000-7000-8000-000000000001'
  const sessionResourceId = '2026/04/01/019d4657-0000-7000-8000-000000000001.ttl'
  const cwd = '/tmp/native-pod-cwd'
  const chatUri = `${POD_BASE}/.data/chat/__secretary__/index.ttl#this`
  const threadUri = `${POD_BASE}/.data/chat/__secretary__/index.ttl#${sessionId}`
  const idReads = []

  const db = {
    resolveLocatorIri(resource, locator) {
      if (resource?.config?.name === 'chats') {
        return `${POD_BASE}/.data/chat/${locator.id}/index.ttl#this`
      }
      throw new Error(`Unexpected resource: ${resource?.config?.name}`)
    },
    async findById(resource, id) {
      idReads.push({ resource: resource?.config?.name, id })
      if (resource?.config?.name === 'session' && id === sessionResourceId) {
        return {
          id: sessionResourceId,
          owner: WEB_ID,
          chat: chatUri,
          thread: threadUri,
          tool: 'linx',
          status: 'active',
          metadata: { cwd, threadUri },
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          updatedAt: new Date('2026-04-01T00:00:01.000Z'),
        }
      }
      return null
    },
    select() {
      return {
        from(resource) {
          const resourceName = resource?.config?.name
          return {
            where() {
              return this
            },
            orderBy() {
              return this
            },
	            async execute() {
	              if (resourceName === 'session') {
	                return [
	                  {
	                    id: 'https://pod.example/.data/session/legacy-session.ttl',
	                    owner: WEB_ID,
	                    chat: chatUri,
	                    tool: 'linx',
	                    status: 'active',
	                    metadata: { cwd },
	                  },
	                  {
	                    id: '2026/04/01/019d4657-0000-7000-8000-000000000009.ttl',
	                    owner: WEB_ID,
	                    chat: '__secretary__',
	                    thread: `${POD_BASE}/.data/chat/__secretary__/index.ttl#019d4657-0000-7000-8000-000000000009`,
	                    tool: 'linx',
	                    status: 'archived',
	                    metadata: { cwd },
	                    createdAt: new Date('2026-04-01T00:00:00.000Z'),
	                    updatedAt: new Date('2026-04-01T00:00:02.000Z'),
	                  },
	                  {
	                    id: sessionId,
	                    owner: WEB_ID,
	                    chat: '__secretary__',
	                    thread: threadUri,
	                    tool: 'linx',
	                    status: 'active',
	                    metadata: { cwd, threadUri },
	                    createdAt: new Date('2026-04-01T00:00:00.000Z'),
	                    updatedAt: new Date('2026-04-01T00:00:01.000Z'),
	                  },
	                ]
	              }
              if (resourceName === 'chat_message') {
                return [{
                  id: `${sessionId}-u1`,
                  thread: threadUri,
                  role: 'user',
                  content: 'native orm hello',
                  richContent: JSON.stringify({
        linxPiSessionEntry: {
          type: 'message',
          id: 'u1',
          parentId: null,
          timestamp: '2026-04-01T00:00:00.000Z',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'native orm hello' }],
            timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
          },
        },
                  }),
                  createdAt: new Date('2026-04-01T00:00:00.000Z'),
                }]
              }
              return []
            },
          }
        },
      }
    },
  }

  const source = sessionModule.createNativeLinxPiPodSessionSource({
    webId: WEB_ID,
    db,
  })

  const sessions = await source.listSessions('/tmp/another-cwd')
  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].id, sessionId)
  assert.equal(sessions[0].messages.length, 1)
  assert.equal(sessions[0].messages[0].content, 'native orm hello')

  const found = await source.findSession(sessionId, '/tmp/another-cwd')
  assert.equal(found.id, sessionId)
  assert.deepEqual(idReads, [{ resource: 'session', id: sessionResourceId }])
})

test('native Pod session source uses session message resource refs before broad message scans', async (t) => {
  const { module: sessionModule, cleanup } = await loadAutoModeModule('lib/linx-session-manager.ts')
  t.after(() => cleanup())

  const sessionId = '019d4657-0000-7000-8000-000000000002'
  const sessionResourceId = '2026/04/01/019d4657-0000-7000-8000-000000000002.ttl'
  const cwd = '/tmp/native-pod-cwd'
  const chatUri = `${POD_BASE}/.data/chat/__secretary__/index.ttl#this`
  const threadUri = `${POD_BASE}/.data/chat/__secretary__/index.ttl#${sessionId}`
  const messageUri = `${POD_BASE}/.data/chat/__secretary__/2026/04/01/messages.ttl#${sessionId}-u1`
  const abandonedMessageUri = `${POD_BASE}/.data/chat/__secretary__/2026/04/01/messages.ttl#${sessionId}-u2`
  const idReads = []
  const iriReads = []
  let selectedMessages = false

  const db = {
    resolveLocatorIri(resource, locator) {
      if (resource?.config?.name === 'chats') {
        return `${POD_BASE}/.data/chat/${locator.id}/index.ttl#this`
      }
      throw new Error(`Unexpected resource: ${resource?.config?.name}`)
    },
    async findById(resource, id) {
      idReads.push({ resource: resource?.config?.name, id })
      if (resource?.config?.name === 'session' && id === sessionResourceId) {
        return {
          id: sessionResourceId,
          owner: WEB_ID,
          chat: chatUri,
          thread: threadUri,
          tool: 'linx',
          status: 'active',
          metadata: { cwd, threadUri, messages: [messageUri, abandonedMessageUri] },
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          updatedAt: new Date('2026-04-01T00:00:01.000Z'),
        }
      }
      return null
    },
    async findByIri(resource, iri) {
      iriReads.push({ resource: resource?.config?.name, iri })
      if (resource?.config?.name === 'chat_message' && iri === messageUri) {
        return {
          id: '2026/04/01/messages.ttl#019d4657-0000-7000-8000-000000000002-u1',
          role: 'user',
          content: 'exact resource hello',
          richContent: JSON.stringify({
            linxPiSessionEntry: {
              type: 'message',
              id: 'u1',
              parentId: null,
              timestamp: '2026-04-01T00:00:00.000Z',
              message: {
                role: 'user',
                content: [{ type: 'text', text: 'exact resource hello' }],
                timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
              },
            },
          }),
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
        }
      }
      if (resource?.config?.name === 'chat_message' && iri === abandonedMessageUri) {
        return {
          id: '2026/04/01/messages.ttl#019d4657-0000-7000-8000-000000000002-u2',
          thread: threadUri,
          role: 'user',
          content: 'dirty exact resource',
          status: 'abandoned',
          createdAt: new Date('2026-04-01T00:00:01.000Z'),
        }
      }
      return null
    },
    select() {
      return {
        from(resource) {
          const resourceName = resource?.config?.name
          if (resourceName === 'chat_message') {
            selectedMessages = true
          }
          return {
            where() {
              return this
            },
            orderBy() {
              return this
            },
            async execute() {
              if (resourceName === 'session') {
                return []
              }
              if (resourceName === 'chat_message') {
                throw new Error('message fallback scan should not run when session messages exist')
              }
              return []
            },
          }
        },
      }
    },
  }

  const source = sessionModule.createNativeLinxPiPodSessionSource({
    webId: WEB_ID,
    db,
  })

  const found = await source.findSession(sessionId, '/tmp/another-cwd')
  assert.equal(found.id, sessionId)
  assert.equal(found.messages.length, 1)
  assert.equal(found.messages[0].id, `${sessionId}-u1`)
  assert.equal(found.messages[0].content, 'exact resource hello')
  assert.equal(selectedMessages, false)
  assert.deepEqual(idReads, [
    { resource: 'session', id: sessionResourceId },
  ])
  assert.deepEqual(iriReads, [
    { resource: 'chat_message', iri: messageUri },
    { resource: 'chat_message', iri: abandonedMessageUri },
  ])
})

test('native Pod session source surfaces exact message resource read failures', async (t) => {
  const { module: sessionModule, cleanup } = await loadAutoModeModule('lib/linx-session-manager.ts')
  t.after(() => cleanup())

  const sessionId = '019d4657-0000-7000-8000-000000000003'
  const sessionResourceId = '2026/04/01/019d4657-0000-7000-8000-000000000003.ttl'
  const cwd = '/tmp/native-pod-cwd'
  const chatUri = `${POD_BASE}/.data/chat/__secretary__/index.ttl#this`
  const threadUri = `${POD_BASE}/.data/chat/__secretary__/index.ttl#${sessionId}`
  const messageUri = `${POD_BASE}/.data/chat/__secretary__/2026/04/01/messages.ttl#${sessionId}-u1`
  let selectedMessages = false

  const db = {
    resolveLocatorIri(resource, locator) {
      if (resource?.config?.name === 'chats') {
        return `${POD_BASE}/.data/chat/${locator.id}/index.ttl#this`
      }
      throw new Error(`Unexpected resource: ${resource?.config?.name}`)
    },
    async findById(resource, id) {
      if (resource?.config?.name === 'session' && id === sessionResourceId) {
        return {
          id: sessionResourceId,
          ownerWebId: WEB_ID,
          chat: chatUri,
          thread: threadUri,
          tool: 'linx',
          status: 'active',
          metadata: { cwd, threadUri, messageResources: [messageUri] },
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          updatedAt: new Date('2026-04-01T00:00:01.000Z'),
        }
      }
      return null
    },
    async findByIri(resource, iri) {
      if (resource?.config?.name === 'chat_message' && iri === messageUri) {
        throw new Error('exact message read failed')
      }
      return null
    },
    select() {
      return {
        from(resource) {
          const resourceName = resource?.config?.name
          if (resourceName === 'chat_message') {
            selectedMessages = true
          }
          return {
            where() {
              return this
            },
            orderBy() {
              return this
            },
            async execute() {
              if (resourceName === 'session') {
                return []
              }
              if (resourceName === 'chat_message') {
                throw new Error('message fallback scan should not run when messageResources exist')
              }
              return []
            },
          }
        },
      }
    },
  }

  const source = sessionModule.createNativeLinxPiPodSessionSource({
    webId: WEB_ID,
    db,
  })

  await assert.rejects(
    () => source.findSession(sessionId, '/tmp/another-cwd'),
    /exact message read failed/,
  )
  assert.equal(selectedMessages, false)
})

test('native Pod session list surfaces exact message resource read failures', async (t) => {
  const { module: sessionModule, cleanup } = await loadAutoModeModule('lib/linx-session-manager.ts')
  t.after(() => cleanup())

  const sessionId = '019d4657-0000-7000-8000-000000000004'
  const sessionResourceId = '2026/04/01/019d4657-0000-7000-8000-000000000004.ttl'
  const cwd = '/tmp/native-pod-cwd'
  const chatUri = `${POD_BASE}/.data/chat/__secretary__/index.ttl#this`
  const threadUri = `${POD_BASE}/.data/chat/__secretary__/index.ttl#${sessionId}`
  const messageUri = `${POD_BASE}/.data/chat/__secretary__/2026/04/01/messages.ttl#${sessionId}-u1`

  const db = {
    resolveLocatorIri(resource, locator) {
      if (resource?.config?.name === 'chats') {
        return `${POD_BASE}/.data/chat/${locator.id}/index.ttl#this`
      }
      throw new Error(`Unexpected resource: ${resource?.config?.name}`)
    },
    async findByIri(resource, iri) {
      if (resource?.config?.name === 'chat_message' && iri === messageUri) {
        throw new Error('exact list message read failed')
      }
      return null
    },
    select() {
      return {
        from(resource) {
          const resourceName = resource?.config?.name
          return {
            where() {
              return this
            },
            orderBy() {
              return this
            },
            async execute() {
              if (resourceName === 'session') {
                return [{
                  id: sessionResourceId,
                  ownerWebId: WEB_ID,
                  chat: chatUri,
                  thread: threadUri,
                  tool: 'linx',
                  status: 'active',
                  metadata: { cwd, threadUri, messageResources: [messageUri] },
                  createdAt: new Date('2026-04-01T00:00:00.000Z'),
                  updatedAt: new Date('2026-04-01T00:00:01.000Z'),
                }]
              }
              throw new Error(`Unexpected list query: ${resourceName}`)
            },
          }
        },
      }
    },
  }

  const source = sessionModule.createNativeLinxPiPodSessionSource({
    webId: WEB_ID,
    db,
  })

  await assert.rejects(
    () => source.listSessions(cwd),
    /exact list message read failed/,
  )
})

test('native Pod session list surfaces container read failures', async (t) => {
  const { module: sessionModule, cleanup } = await loadAutoModeModule('lib/linx-session-manager.ts')
  t.after(() => cleanup())

  const db = {
    resolveLocatorIri(resource, locator) {
      if (resource?.config?.name === 'chats') {
        return `${POD_BASE}/.data/chat/${locator.id}/index.ttl#this`
      }
      throw new Error(`Unexpected resource: ${resource?.config?.name}`)
    },
    select() {
      throw new Error('container listing path should run when fetch is available')
    },
  }

  const source = sessionModule.createNativeLinxPiPodSessionSource({
    webId: WEB_ID,
    db,
    fetch: async (url, init = {}) => {
      const method = init.method ?? 'GET'
      assert.equal(method, 'GET')
      if (url.includes('/.data/sessions/')) {
        return new Response('forbidden', { status: 403, statusText: 'Forbidden' })
      }
      return new Response('missing', { status: 404 })
    },
  })

  await assert.rejects(
    () => source.listSessions('/tmp/another-cwd'),
    /Failed to list Pod container .*\/\.data\/sessions\/.*: 403 Forbidden/,
  )
})
