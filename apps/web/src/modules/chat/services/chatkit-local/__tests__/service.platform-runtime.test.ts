import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  chatTable: { name: 'chat' },
  contactTable: { name: 'contact' },
  agentTable: { name: 'agent' },
  credentialResource: { name: 'credential' },
  aiProviderResource: { name: 'ai_provider' },
}))

vi.mock('@undefineds.co/models/client', () => ({
  resolveLinxRuntimeApiBaseUrlForIssuerUrl: (url: string) => {
    const clean = url.replace(/\/$/, '')
    return clean === 'https://id.undefineds.co' ? 'https://api.undefineds.co/v1' : `${clean}/v1`
  },
}))

vi.mock('@undefineds.co/models', () => ({
  agentTable: mocked.agentTable,
  aiProviderResource: mocked.aiProviderResource,
  chatTable: mocked.chatTable,
  contactTable: mocked.contactTable,
  credentialResource: mocked.credentialResource,
  extractChatIdFromChatRef: (value?: string | null) => {
    if (!value) return null
    const direct = value.match(/^([^/]+)\/index\.ttl#this$/)
    if (direct) return direct[1]
    const command = value.match(/^(?:chat|task)\/([^/]+)\//)
    if (command) return command[1]
    const iri = value.match(/\/\.data\/chat\/([^/]+)\/index\.ttl#this$/)
    if (iri) return iri[1]
    return null
  },
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
  selectAIConfigCredential: (
    provider: string,
    credentialRows: Array<Record<string, unknown>>,
    providerRows: Array<Record<string, unknown>>,
  ) => {
    const normalizeProvider = (value?: unknown) => {
      if (typeof value !== 'string' || !value) return ''
      const tail = value.includes('#') ? value.split('#').pop() : value.split('/').pop()
      return (tail ?? value).replace(/\.ttl$/, '').toLowerCase()
    }
    const providerId = normalizeProvider(provider)
    const credential = credentialRows.find((row) => normalizeProvider(row.provider ?? row.id) === providerId && row.apiKey)
    if (!credential) return undefined
    const providerRow = providerRows.find((row) => normalizeProvider(row.id) === providerId)
    return {
      providerId,
      credential,
      apiKey: credential.apiKey,
      baseUrl: credential.baseUrl ?? providerRow?.baseUrl,
    }
  },
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

function createMockDb(
  agent: { provider: string; model: string },
  credentialRows: Array<Record<string, unknown>> = [],
  options: {
    findByIdError?: Error
    contactEntityUri?: string
    selectError?: Error
  } = {},
) {
  const chat = {
    id: 'chat-1',
    participants: ['contact-1'],
  }
  const contact = {
    id: 'contact-1',
    entityUri: options.contactEntityUri ?? 'agent-1/index.ttl#this',
    contactType: 'agent',
  }
  const agentRow = {
    id: 'agent-1/index.ttl#this',
    provider: agent.provider,
    model: agent.model,
  }

  return {
    getDialect: () => ({
      getPodUrl: () => null,
    }),
    findById: vi.fn(async (table: unknown, id?: string) => {
      if (options.findByIdError) {
        throw options.findByIdError
      }
      if (table === mocked.chatTable) return chat
      if (table === mocked.agentTable && id === agentRow.id) return agentRow
      if (table === mocked.aiProviderResource) {
        return {
          id,
          baseUrl: id === 'openai' ? 'https://openrouter.ai/api/v1' : undefined,
        }
      }
      return null
    }),
    findByIri: vi.fn(async (table: unknown, iri?: string) => {
      if (table === mocked.agentTable && iri === 'https://node-0000.undefineds.co/alice/.data/agents/agent-1/index.ttl#this') {
        return agentRow
      }
      return null
    }),
    select: vi.fn(() => ({
      from: (table: unknown) => {
        const execute = async () => {
          if (options.selectError) {
            throw options.selectError
          }
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

function createMockDbWithPodUrl(
  agent: { provider: string; model: string },
  podUrl: string,
  credentialRows: Array<Record<string, unknown>> = [],
) {
  return {
    ...createMockDb(agent, credentialRows),
    getDialect: () => ({
      getPodUrl: () => podUrl,
    }),
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

  it('does not stream raw implementation errors to the user', async () => {
    const store = createMockStore()
    store.loadThread.mockRejectedValueOnce(
      new Error("Cannot find module 'jsonld'\nRequire stack:\n- /Users/ganlu/Library/Application Support/@linx/xpod.js"),
    )
    const db = createMockDb({
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    })
    const authFetch = vi.fn()
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service)

    expect(events).toContainEqual(expect.objectContaining({
      type: 'error',
      error: expect.objectContaining({
        code: 'internal_error',
        message: '本地空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本地空间设置修复。',
      }),
    }))
    expect(JSON.stringify(events)).not.toMatch(/jsonld|Require stack|Application Support|\/Users|xpod/i)
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

  it('routes platform runtime calls through the selected Local SP, not the Cloud WebID origin', async () => {
    const store = createMockStore()
    const db = createMockDbWithPodUrl({
      provider: '/settings/providers/undefineds.ttl',
      model: 'undefineds/linx-lite',
    }, 'https://node-0000.undefineds.co/alice/')
    const authFetch = vi.fn(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"本地空间"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service)

    expect(authFetch).toHaveBeenCalledWith(
      'https://node-0000.undefineds.co/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(authFetch).not.toHaveBeenCalledWith(
      'https://api.undefineds.co/v1/chat/completions',
      expect.anything(),
    )
    expect(events.some((event) => event.type === 'thread.item.updated' && event.update?.delta === '本地空间')).toBe(true)
  })

  it('resolves an Agent contact entity IRI with findByIri instead of deriving a row id from the IRI', async () => {
    const store = createMockStore()
    const agentIri = 'https://node-0000.undefineds.co/alice/.data/agents/agent-1/index.ttl#this'
    const db = createMockDb({
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    }, [], {
      contactEntityUri: agentIri,
    })
    const authFetch = vi.fn(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"IRI OK"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service)

    expect((db as any).findByIri).toHaveBeenCalledWith(mocked.agentTable, agentIri)
    expect((db as any).findById).not.toHaveBeenCalledWith(mocked.agentTable, expect.stringContaining('https://'))
    expect(authFetch).toHaveBeenCalledWith(
      'https://api.undefineds.co/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(events.some((event) => event.type === 'thread.item.updated' && event.update?.delta === 'IRI OK')).toBe(true)
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

  it('surfaces shared credential query failures instead of pretending the API key is missing', async () => {
    const store = createMockStore()
    const db = createMockDb({
      provider: 'openai',
      model: 'gpt-4o-mini',
    }, [], {
      findByIdError: new Error('findById failed'),
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

    expect(providerFetch).not.toHaveBeenCalled()
    expect(findAssistantDone(events)?.item?.status).toBe('incomplete')
    expect(findAssistantDone(events)?.item?.content?.[0]?.text).toBe('消息生成失败。请稍后重试。')
    expect(events).toContainEqual(expect.objectContaining({
      type: 'error',
      error: expect.objectContaining({
        code: 'generation_error',
        message: '消息生成失败。请稍后重试。',
      }),
    }))
  })

  it('surfaces agent config query failures instead of falling back to generic AI config', async () => {
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
    }], {
      selectError: new Error('contact query failed'),
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

    expect(providerFetch).not.toHaveBeenCalled()
    expect(findAssistantDone(events)?.item?.status).toBe('incomplete')
    expect(events).toContainEqual(expect.objectContaining({
      type: 'error',
      error: expect.objectContaining({
        code: 'generation_error',
        message: '消息生成失败。请稍后重试。',
      }),
    }))
  })
})
