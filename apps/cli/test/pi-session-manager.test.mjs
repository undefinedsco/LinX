import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadWatchModule } from './watch-test-bundle.mjs'

const WEB_ID = 'https://id.undefineds.co/alice/profile/card#me'
const POD_BASE = 'https://id.undefineds.co/alice'

test('createLinxPiSessionManager creates persisted sessions by default', async (t) => {
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/session.ts')
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
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/session.ts')
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
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/session.ts')
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
  const { module, cleanup } = await loadWatchModule('lib/pi-adapter/session.ts')
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
        cwd,
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
  assert.equal(resumed.getEntries().length, 1)
  assert.equal(resumed.getEntries()[0].message.content[0].text, 'from pod only')
})

test('native Pod session source reads session and messages directly from TTL resources', async (t) => {
  const [{ module: sessionModule, cleanup: cleanupSession }, { module: podModule, cleanup: cleanupPod }] = await Promise.all([
    loadWatchModule('lib/pi-adapter/session.ts'),
    loadWatchModule('lib/pi-adapter/pod-native.ts'),
  ])
  t.after(() => {
    cleanupSession()
    cleanupPod()
  })

  const sessionId = '019df222-native-pod'
  const cwd = '/tmp/native-pod-cwd'
  const resources = new Map()
  const sessionDocUrl = `${POD_BASE}/.data/sessions/2026/04.ttl`
  const sessionSubject = `${sessionDocUrl}#${sessionId}`
  const messageUrl = `${POD_BASE}/.data/chat/ai-secretary/2026/04/01/messages.ttl`
  const messageSubject = `${messageUrl}#${sessionId}-u1`
  const chatUri = `${POD_BASE}/.data/chat/ai-secretary/index.ttl#this`
  const threadUri = `${POD_BASE}/.data/chat/ai-secretary/index.ttl#${sessionId}`

  resources.set(`${POD_BASE}/.data/sessions/`, '<2026/> .')
  resources.set(`${POD_BASE}/.data/sessions/2026/`, '<04.ttl> .')
  resources.set(`${POD_BASE}/.data/chat/ai-secretary/`, '<2026/> .')
  resources.set(`${POD_BASE}/.data/chat/ai-secretary/2026/`, '<04/> .')
  resources.set(`${POD_BASE}/.data/chat/ai-secretary/2026/04/`, '<01/> .')
  resources.set(`${POD_BASE}/.data/chat/ai-secretary/2026/04/01/`, '<messages.ttl> .')
  resources.set(sessionDocUrl, podModule.mergeManagedBlock('', {
    subject: sessionSubject,
    triples: [
      { predicate: podModule.UDFS_SESSION_TOOL, object: podModule.literal('linx') },
      { predicate: podModule.UDFS_CONVERSATION, object: podModule.iri(chatUri) },
      { predicate: podModule.UDFS_ACTOR, object: podModule.iri(WEB_ID) },
      { predicate: podModule.UDFS_IN_THREAD, object: podModule.iri(threadUri) },
      { predicate: podModule.UDFS_METADATA, object: podModule.literal(JSON.stringify({ cwd, threadUri, messageResources: [messageUrl] })) },
      { predicate: podModule.DCT_CREATED, object: podModule.literal('2026-04-01T00:00:00.000Z') },
      { predicate: podModule.DCT_MODIFIED, object: podModule.literal('2026-04-01T00:00:01.000Z') },
    ],
  }))
  resources.set(messageUrl, podModule.mergeManagedBlock('', {
    subject: messageSubject,
    triples: [
      { predicate: 'https://undefineds.co/ns#messageType', object: podModule.literal('user') },
      { predicate: podModule.SIOC_CONTENT, object: podModule.literal('native ttl hello') },
      { predicate: podModule.SIOC_RICH_CONTENT, object: podModule.literal(JSON.stringify({
        linxPiSessionEntry: {
          type: 'message',
          id: 'u1',
          parentId: null,
          timestamp: '2026-04-01T00:00:00.000Z',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'native ttl hello' }],
            timestamp: Date.parse('2026-04-01T00:00:00.000Z'),
          },
        },
      })) },
      { predicate: podModule.DCT_CREATED, object: podModule.literal('2026-04-01T00:00:00.000Z') },
    ],
    extraStatements: [`<${threadUri}> <${podModule.SIOC_HAS_MEMBER}> <${messageSubject}> .`],
  }))

  const source = sessionModule.createNativeLinxPiPodSessionSource({
    webId: WEB_ID,
    async fetch(url, init = {}) {
      const method = init.method ?? 'GET'
      if (method === 'GET') {
        return resources.has(url)
          ? new Response(resources.get(url), { status: 200, headers: { 'Content-Type': 'text/turtle' } })
          : new Response('missing', { status: 404 })
      }
      return new Response(null, { status: 405 })
    },
  })

  const sessions = await source.listSessions(cwd)
  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].id, sessionId)
  assert.equal(sessions[0].messages.length, 1)
  assert.equal(sessions[0].messages[0].content, 'native ttl hello')

  const found = await source.findSession('019df222', cwd)
  assert.equal(found.id, sessionId)
})
