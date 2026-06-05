import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  chatTable: { name: 'chat' },
  contactTable: { name: 'contact' },
  agentTable: { name: 'agent' },
  credentialResource: { name: 'credential' },
  aiProviderResource: { name: 'ai_provider' },
  resolvePodBaseUrlMock: vi.fn((value: string) => value.replace('/profile/card#me', '').replace(/\/+$/, '')),
}))

vi.mock('@undefineds.co/models/client', () => ({
  resolveLinxRuntimeApiBaseUrlForIssuerUrl: (url: string) => {
    const clean = url.replace(/\/$/, '')
    return clean === 'https://id.undefineds.co' ? 'https://api.undefineds.co/v1' : `${clean}/v1`
  },
}))

vi.mock('@undefineds.co/drizzle-solid', () => ({
  findExactRecord: async (db: any, table: unknown, target: string | Record<string, unknown>) => {
    return await db.findByResource(table, target)
  },
  resolvePodBaseUrl: mocked.resolvePodBaseUrlMock,
  resolveRowSubject: (record: Record<string, unknown> | null | undefined) => record?.['@id'] ?? record?.uri ?? record?.id ?? null,
}))

vi.mock('@undefineds.co/models', () => ({
  agentTable: mocked.agentTable,
  aiProviderResource: mocked.aiProviderResource,
  aiConfigRepository: {
    async loadCredentialForBackend(db: any, provider: string) {
      const normalizedProvider = provider.includes('#') ? provider.split('#').pop() : provider
      const credentialRows = await db.select().from(mocked.credentialResource).execute()
      const providerRow = await db.findById(mocked.aiProviderResource, normalizedProvider).catch(() => null)
      const credential = credentialRows.find((row: Record<string, unknown>) => {
        const rowProvider = String(row.provider ?? row.id ?? '')
        return rowProvider.endsWith(`#${normalizedProvider}`) || rowProvider.endsWith(`/${normalizedProvider}.ttl`)
      })
      return credential?.apiKey
        ? {
            providerId: normalizedProvider,
            credential,
            credentialId: credential.id,
            apiKey: credential.apiKey,
            baseUrl: credential.baseUrl ?? providerRow?.baseUrl,
          }
        : undefined
    },
    async markCredentialUsed(db: any, selection: { credentialId?: string }) {
      if (selection.credentialId) {
        await db.updateById(mocked.credentialResource, selection.credentialId, { lastUsedAt: new Date() })
      }
    },
  },
  chatTable: mocked.chatTable,
  contactTable: mocked.contactTable,
  credentialResource: mocked.credentialResource,
  normalizeAIConfigProviderId: (value?: string | null) => {
    if (!value) return ''
    const tail = value.includes('#') ? value.split('#').pop() : value.split('/').pop()
    return (tail ?? value).replace(/\.ttl$/, '').toLowerCase()
  },
  normalizeAIConfigResourceId: (value?: string | null) => {
    if (!value) return ''
    if (value.startsWith('undefineds/')) return value
    const tail = value.includes('#') ? value.split('#').pop() : value.split('/').pop()
    return (tail ?? value).replace(/\.ttl$/, '')
  },
  resolveRowId: (row: Record<string, unknown> | null | undefined) => row?.['@id'] ?? row?.uri ?? row?.id ?? null,
}))

vi.mock('../runtime-sidecar', () => ({
  RuntimeSidecarSink: class RuntimeSidecarSink {},
}))

vi.mock('@/lib/vendor/xpod-chatkit', () => ({
  extractUserMessageText: (content: Array<{ type: string; text?: string }>) => content
    .filter((part) => part.type === 'input_text')
    .map((part) => part.text ?? '')
    .join('\n'),
  generateId: (prefix: string) => `${prefix}-generated`,
  isStreamingReq: (request: { type?: string }) => request.type === 'threads.add_user_message',
  nowTimestamp: () => 1,
}))

import { LocalChatKitService } from '../service'

function createSseResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

async function collectStreamEvents(result: Awaited<ReturnType<LocalChatKitService['process']>>) {
  expect(result.type).toBe('streaming')
  if (result.type !== 'streaming') {
    throw new Error('Expected streaming result')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  const events: Array<Record<string, any>> = []

  for await (const chunk of result.stream()) {
    buffer += decoder.decode(chunk, { stream: true })

    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      boundary = buffer.indexOf('\n\n')

      if (!rawEvent.trim()) continue

      const payload = rawEvent
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n')

      if (payload) {
        events.push(JSON.parse(payload))
      }
    }
  }

  return events
}

function createMockStore() {
  const thread = {
    id: 'thread-1',
    status: { type: 'active' as const },
    created_at: 1,
    updated_at: 1,
    metadata: { chat_id: 'chat-1' },
  }
  const items: any[] = []
  let index = 0

  return {
    generateThreadId: vi.fn(() => 'thread-generated'),
    generateItemId: vi.fn((itemType: string) => `${itemType}-${++index}`),
    loadThread: vi.fn(async () => thread),
    saveThread: vi.fn(async () => undefined),
    loadThreads: vi.fn(async () => ({ data: [thread], has_more: false })),
    deleteThread: vi.fn(async () => undefined),
    loadThreadItems: vi.fn(async () => ({ data: [...items], has_more: false })),
    addThreadItem: vi.fn(async (_threadId: string, item: any) => {
      items.push(item)
    }),
    saveItem: vi.fn(async (_threadId: string, item: any) => {
      const itemIndex = items.findIndex((entry) => entry.id === item.id)
      if (itemIndex >= 0) {
        items[itemIndex] = item
      } else {
        items.push(item)
      }
    }),
    loadItem: vi.fn(),
    deleteThreadItem: vi.fn(),
    saveAttachment: vi.fn(),
    loadAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
  }
}

function createMockDb(agent: { provider: string; model: string }, credentialRows: Array<Record<string, unknown>> = []) {
  const chat = {
    id: 'chat-1',
    participants: ['contact-1'],
  }
  const contact = {
    id: 'contact-1',
    entity: 'agent-1',
    contactType: 'agent',
  }
  const agentRow = {
    id: 'agent-1',
    provider: agent.provider,
    model: agent.model,
  }

  return {
    findById: vi.fn(async (table: unknown, id?: string) => {
      if (table === mocked.chatTable) return chat
      if (table === mocked.aiProviderResource) {
        return {
          id,
          baseUrl: id === 'openai' ? 'https://openrouter.ai/api/v1' : undefined,
        }
      }
      return null
    }),
    findByResource: vi.fn(async (table: unknown, target: string | Record<string, unknown>) => {
      const id = typeof target === 'string' ? target : target.id
      if (table === mocked.chatTable && id === chat.id) return chat
      if (table === mocked.aiProviderResource) {
        return {
          id,
          baseUrl: id === 'openai' ? 'https://openrouter.ai/api/v1' : undefined,
        }
      }
      return null
    }),
    updateById: vi.fn(async () => ({})),
    select: vi.fn(() => ({
      from: (table: unknown) => {
        const execute = async () => {
          if (table === mocked.chatTable) return [chat]
          if (table === mocked.contactTable) return [contact]
          if (table === mocked.agentTable) return [agentRow]
          if (table === mocked.credentialResource) return credentialRows
          return []
        }

        return {
          execute,
          where: () => ({ execute }),
        }
      },
    })),
  }
}

function findAssistantDone(events: Array<Record<string, any>>) {
  return events.find((event) => event.type === 'thread.item.done' && event.item?.type === 'assistant_message')
}

async function sendMessage(service: LocalChatKitService) {
  return collectStreamEvents(await service.process(JSON.stringify({
    type: 'threads.add_user_message',
    params: {
      thread_id: 'thread-1',
      input: {
        content: [{ type: 'input_text', text: '你好' }],
      },
    },
  }), {}))
}

describe('LocalChatKitService platform runtime routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__ = false
  })

  it('routes the default LinX assistant to cloud runtime without a user API key', async () => {
    const store = createMockStore()
    const db = createMockDb({
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    })
    const authFetch = vi.fn(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"可以"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service)

    expect(authFetch).toHaveBeenCalledWith(
      'https://api.undefineds.co/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    const body = JSON.parse((authFetch.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(body.model).toBe('linx-lite')
    expect(events.some((event) => event.type === 'thread.item.updated' && event.update?.delta === '可以')).toBe(true)
    expect(findAssistantDone(events)?.item?.status).toBe('completed')
  })

  it('routes a local LinX assistant to the local xpod runtime', async () => {
    const store = createMockStore()
    const db = createMockDb({
      provider: '/settings/providers/undefineds.ttl',
      model: 'undefineds/linx-lite',
    })
    const authFetch = vi.fn(async () => new Response('本地可聊', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    }))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'http://localhost:5737/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service)

    expect(authFetch).toHaveBeenCalledWith(
      'http://localhost:5737/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(events.some((event) => event.type === 'thread.item.updated' && event.update?.delta === '本地可聊')).toBe(true)
  })

  it('uses shared Pod base resolution for malformed WebID fallback routing', async () => {
    const store = createMockStore()
    const db = createMockDb({
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    })
    const authFetch = vi.fn(async () => new Response('fallback ok', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    }))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'not-a-url/profile/card#me',
      authFetch: authFetch as any,
    })

    await sendMessage(service)

    expect(mocked.resolvePodBaseUrlMock).toHaveBeenCalledWith('not-a-url/profile/card#me')
    expect(authFetch).toHaveBeenCalledWith(
      'not-a-url/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('keeps non-platform providers on the user API key path', async () => {
    const store = createMockStore()
    const db = createMockDb({
      provider: 'openai',
      model: 'gpt-4o-mini',
    }, [{
      id: 'credentials.ttl#openai-default',
      provider: '/settings/providers/openai.ttl',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.example/v1',
    }])
    const providerFetch = vi.fn(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"用户模型"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    vi.stubGlobal('fetch', providerFetch)
    const authFetch = vi.fn(async () => new Response('', { status: 404 }))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service)

    expect(authFetch).not.toHaveBeenCalledWith(
      'https://api.undefineds.co/v1/chat/completions',
      expect.anything(),
    )
    expect(providerFetch).toHaveBeenCalledWith(
      'https://api.openai.example/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      }),
    )
    expect(events.some((event) => event.type === 'thread.item.updated' && event.update?.delta === '用户模型')).toBe(true)
  })

  it('does not raw-fetch credentials.ttl when shared credential lookup has no match', async () => {
    const store = createMockStore()
    const db = createMockDb({
      provider: 'openai',
      model: 'gpt-4o-mini',
    })
    const providerFetch = vi.fn()
    vi.stubGlobal('fetch', providerFetch)
    const authFetch = vi.fn(async () => new Response('', { status: 404 }))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service)

    expect(authFetch).not.toHaveBeenCalled()
    expect(providerFetch).not.toHaveBeenCalled()
    expect(findAssistantDone(events)?.item?.content?.[0]?.text).toBe('请先在设置中配置 AI API Key。')
  })
})
