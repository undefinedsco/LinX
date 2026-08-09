import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  chatResource: { name: 'chat', buildId: ({ id }: { id: string }) => `${id}/index.ttl#this` },
  threadResource: { name: 'thread', buildId: ({ id }: { id: string }) => id },
  contactResource: { name: 'contact' },
  agentResource: { name: 'agent' },
  credentialResource: { name: 'credential', buildId: ({ id }: { id: string }) => `credentials.ttl#${id}` },
  aiProviderResource: { name: 'ai_provider', buildId: ({ id }: { id: string }) => `${id}.ttl` },
}))

vi.mock('@undefineds.co/models/client', () => ({
  resolveLinxRuntimeApiBaseUrlForIssuerUrl: (url: string) => {
    const clean = url.replace(/\/$/, '')
    return clean === 'https://id.undefineds.co' ? 'https://api.undefineds.co/v1' : `${clean}/v1`
  },
}))

vi.mock('@undefineds.co/models', () => ({
  agentResource: mocked.agentResource,
  aiProviderResource: mocked.aiProviderResource,
  chatResource: mocked.chatResource,
  threadResource: mocked.threadResource,
  contactResource: mocked.contactResource,
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
  getDefaultAIConfigCredentialId: (providerId: string) => `${providerId}-default`,
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
  isStreamingReq: (request: { type?: string }) => request.type === 'threads.add_user_message'
    || request.type === 'threads.retry_after_item',
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

function createMockStore(initialItems: any[] = []) {
  const thread = {
    id: 'thread-1',
    status: { type: 'active' as const },
    created_at: 1,
    updated_at: 1,
    metadata: { chat_id: 'chat-1' },
  }
  const items: any[] = [...initialItems]
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
  agent: { provider: string; model: string; metadata?: Record<string, unknown>; contextRound?: number },
  credentialRows: Array<Record<string, unknown>> = [],
  options: {
    exactCredentialRow?: Record<string, unknown>
    findByIdError?: Error
    contactAbout?: string
    participantRef?: string
    selectError?: Error
  } = {},
) {
  const participantRef = options.participantRef ?? 'contact-1'
  const chat = {
    id: 'chat-1/index.ttl#this',
    participants: [participantRef],
  }
  const contact = {
    id: 'contact-1',
    about: options.contactAbout ?? 'agent-1/',
    contactType: 'agent',
  }
  const agentRow = {
    id: 'agent-1/',
    provider: agent.provider,
    model: agent.model,
    metadata: agent.metadata,
    contextRound: agent.contextRound,
  }

  return {
    getDialect: () => ({
      getPodUrl: () => null,
    }),
    resolveRowIri: vi.fn((resource: unknown, row: { id?: string }) => {
      const id = row?.id ?? ''
      if (resource === mocked.chatResource) return `https://node-0000.undefineds.co/alice/.data/chat/${id}`
      if (resource === mocked.threadResource) return `https://node-0000.undefineds.co/alice/.data/${id}`
      return `https://node-0000.undefineds.co/alice/.data/${id}`
    }),
    findById: vi.fn(async (resource: unknown, id?: string) => {
      if (options.findByIdError) {
        throw options.findByIdError
      }
      if (resource === mocked.chatResource && id === chat.id) return chat
      if (resource === mocked.contactResource && id === contact.id) return contact
      if (resource === mocked.agentResource && id === agentRow.id) return agentRow
      if (resource === mocked.aiProviderResource) {
        return {
          id,
          baseUrl: id === 'openai.ttl' ? 'https://openrouter.ai/api/v1' : undefined,
        }
      }
      if (resource === mocked.credentialResource) return options.exactCredentialRow ?? null
      return null
    }),
    findByIri: vi.fn(async (resource: unknown, iri?: string) => {
      if (resource === mocked.contactResource && iri === participantRef) {
        return contact
      }
      if (resource === mocked.agentResource && iri === 'https://node-0000.undefineds.co/alice/agents/agent-1/') {
        return agentRow
      }
      return null
    }),
    select: vi.fn(() => ({
      from: (resource: unknown) => {
        const execute = async () => {
          if (options.selectError) {
            throw options.selectError
          }
          if (resource === mocked.chatResource) return [chat]
          if (resource === mocked.contactResource) return [contact]
          if (resource === mocked.agentResource) return [agentRow]
          if (resource === mocked.credentialResource) return credentialRows
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

function createMockDbWithoutAgent(podUrl: string) {
  const db = createMockDbWithPodUrl({ provider: 'undefineds', model: 'linx-lite' }, podUrl)
  db.findById.mockImplementation(async (resource: unknown) => {
    if (resource === mocked.chatResource) {
      return { id: 'chat-1', participants: [] }
    }
    return null
  })
  db.select.mockImplementation(() => ({
    from: (resource: unknown) => ({
      execute: async () => resource === mocked.chatResource
        ? [{ id: 'chat-1', participants: [] }]
        : [],
      where: () => ({ execute: async () => [] }),
    }),
  }) as any)
  return db
}

function findAssistantDone(events: Array<Record<string, any>>) {
  return events.find((event) => event.type === 'thread.item.done' && event.item?.type === 'assistant_message')
}

async function sendMessage(service: LocalChatKitService, inferenceOptions?: Record<string, unknown>) {
  return collectStreamEvents(await service.process(JSON.stringify({
    type: 'threads.add_user_message',
    params: {
      thread_id: 'thread-1',
      input: {
        content: [{ type: 'input_text', text: '你好' }],
        ...(inferenceOptions ? { inference_options: inferenceOptions } : {}),
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
        message: '本机空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本机空间设置修复。',
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

  it('preserves streamed URL citations as ChatKit annotations and Pod history', async () => {
    const store = createMockStore()
    const db = createMockDb({
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    })
    const authFetch = vi.fn(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"有来源的回答","annotations":[{"type":"url_citation","url_citation":{"url":"https://example.com/report","title":"Example report","end_index":6}}]}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service)
    const completed = findAssistantDone(events)?.item

    expect(completed?.content?.[0]).toEqual({
      type: 'output_text',
      text: '有来源的回答',
      annotations: [{
        index: 6,
        source: {
          type: 'url',
          url: 'https://example.com/report',
          title: 'Example report',
        },
      }],
    })
    expect(store.saveItem).toHaveBeenCalledWith(
      'thread-1',
      expect.objectContaining({ content: completed.content }),
      expect.anything(),
    )
  })

  it('positions streamed citations without explicit indexes after all preceding text', async () => {
    const store = createMockStore()
    const db = createMockDb({
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    })
    const authFetch = vi.fn(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"第一段"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"第二段","annotations":[{"type":"url_citation","url":"https://example.com/stream","title":"Stream source"}]}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service)
    const completed = findAssistantDone(events)?.item

    expect(completed?.content?.[0]).toEqual({
      type: 'output_text',
      text: '第一段第二段',
      annotations: [{
        index: 6,
        source: {
          type: 'url',
          url: 'https://example.com/stream',
          title: 'Stream source',
        },
      }],
    })
  })

  it('runs the selected web search tool through Responses and persists clickable sources', async () => {
    const store = createMockStore()
    const db = createMockDbWithPodUrl({
      provider: 'undefineds',
      model: 'linx-lite',
    }, 'http://localhost:5737/')
    const authFetch = vi.fn(async () => new Response(JSON.stringify({
      id: 'resp-1',
      status: 'completed',
      output: [{
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'output_text',
          text: '今日结果',
          annotations: [{
            type: 'url_citation',
            url: 'https://example.com/today',
            title: 'Today report',
            end_index: 4,
          }],
        }],
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'http://localhost:5737/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service, { tool_choice: { id: 'web_search' } })

    expect(authFetch).toHaveBeenCalledWith(
      'http://localhost:5737/v1/responses',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse((authFetch.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(body).toEqual(expect.objectContaining({
      model: 'linx-lite',
      tools: [{ type: 'web_search' }],
      tool_choice: 'auto',
    }))
    expect(events).toContainEqual({
      type: 'progress_update',
      icon: 'search',
      text: '正在搜索网络并整理来源…',
    })
    expect(findAssistantDone(events)?.item?.content?.[0]).toEqual({
      type: 'output_text',
      text: '今日结果',
      annotations: [{
        index: 4,
        source: {
          type: 'url',
          url: 'https://example.com/today',
          title: 'Today report',
        },
      }],
    })
  })

  it('routes explicit web search ahead of an existing coding runtime session', async () => {
    const store = createMockStore()
    const db = createMockDbWithPodUrl({
      provider: 'undefineds',
      model: 'linx-lite',
    }, 'http://localhost:5737/')
    const browserFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith('/api/runtime/threads')) {
        return new Response(JSON.stringify({
          items: [{ id: 'runtime-1', threadId: 'thread-1', status: 'active' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', browserFetch)
    const authFetch = vi.fn(async () => new Response(JSON.stringify({
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: '搜索结果', annotations: [] }],
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'http://localhost:5737/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service, { tool_choice: { id: 'web_search' } })

    expect(authFetch).toHaveBeenCalledWith(
      'http://localhost:5737/v1/responses',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(browserFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/messages'),
      expect.anything(),
    )
    expect(findAssistantDone(events)?.item?.content?.[0]?.text).toBe('搜索结果')
  })

  it('uses LinX Lite search when a legacy chat has no resolvable Agent config', async () => {
    const store = createMockStore()
    const db = createMockDbWithoutAgent('http://localhost:5737/')
    const authFetch = vi.fn(async () => new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: '平台搜索', annotations: [] }] }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'http://localhost:5737/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service, { tool_choice: { id: 'web_search' } })

    const body = JSON.parse((authFetch.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(body.model).toBe('linx-lite')
    expect(findAssistantDone(events)?.item?.content?.[0]?.text).toBe('平台搜索')
  })

  it('finishes the search activity with actionable copy when xpod search fails', async () => {
    const store = createMockStore()
    const db = createMockDbWithPodUrl({ provider: 'undefineds', model: 'linx-lite' }, 'http://localhost:5737/')
    const authFetch = vi.fn(async () => new Response(JSON.stringify({
      error: 'upstream TLS details that should not be shown',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } }))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'http://localhost:5737/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service, { tool_choice: { id: 'web_search' } })

    expect(events).toContainEqual({
      type: 'progress_update',
      icon: 'search',
      text: '联网搜索失败',
    })
    expect(findAssistantDone(events)?.item).toEqual(expect.objectContaining({
      status: 'incomplete',
      content: [expect.objectContaining({
        text: '联网搜索暂不可用。请检查本地 xpod 的 AI 上游配置后重试。',
      })],
    }))
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'error' }))
    expect(JSON.stringify(events)).not.toContain('TLS details')
  })

  it('rejects web search for custom chat-completions providers instead of faking it', async () => {
    const store = createMockStore()
    const db = createMockDb({
      provider: 'openai',
      model: 'gpt-4o-mini',
    }, [{
      id: 'openai-default',
      provider: 'openai',
      apiKey: 'test-key',
      baseUrl: 'https://openrouter.ai/api/v1',
    }])
    const authFetch = vi.fn()
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service, { tool_choice: { id: 'web_search' } })

    expect(findAssistantDone(events)?.item?.status).toBe('incomplete')
    expect(findAssistantDone(events)?.item?.content?.[0]?.text).toBe(
      '当前自定义 AI 供应商不支持 LinX 联网搜索。请切换到 LinX 平台模型后重试。',
    )
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'error' }))
  })

  it('routes Matrix group user messages through Matrix send without local duplicate persistence', async () => {
    const store = createMockStore()
    store.loadThread.mockResolvedValue({
      id: 'chat/matrix-room/index.ttl#thread',
      status: { type: 'active' as const },
      created_at: 1,
      updated_at: 1,
      metadata: {
        chat_id: 'matrix-room/index.ttl#this',
        roomId: '!room:node-0000.undefineds.co',
      },
    })
    const db = createMockDbWithPodUrl({
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    }, 'https://node-0000.undefineds.co/alice/')
    const authFetch = vi.fn(async () => new Response(JSON.stringify({
      event_id: '$event:node-0000.undefineds.co',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service)

    expect(store.addThreadItem).not.toHaveBeenCalled()
    expect(authFetch).toHaveBeenCalledWith(
      'https://node-0000.undefineds.co/_matrix/client/v3/rooms/!room%3Anode-0000.undefineds.co/send/m.room.message/user_message-1',
      expect.objectContaining({ method: 'PUT' }),
    )
    const body = JSON.parse((authFetch.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(body.body).toBe('你好')
    expect(body['co.undefineds.linx'].chat).toBe('https://node-0000.undefineds.co/alice/.data/chat/matrix-room/index.ttl#this')
    expect(body['co.undefineds.linx'].thread).toBe('https://node-0000.undefineds.co/alice/.data/chat/matrix-room/index.ttl#thread')
    expect(body['co.undefineds.linx'].reconciler.latest.eventType).toBe('message.appended')
    expect(body['co.undefineds.linx'].reconciler.latest.chat).toBe('https://node-0000.undefineds.co/alice/.data/chat/matrix-room/index.ttl#this')
    expect(body['co.undefineds.linx'].reconciler.latest.thread).toBe('https://node-0000.undefineds.co/alice/.data/chat/matrix-room/index.ttl#thread')
    expect(events.map((event) => event.type)).toEqual(['thread.item.added', 'thread.item.done'])
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

  it('defaults platform runtime calls to client-originated Pod access', async () => {
    const store = createMockStore()
    const db = createMockDbWithPodUrl({
      provider: 'undefineds',
      model: 'linx-lite',
    }, 'https://node-0000.undefineds.co/alice/')
    const browserFetch = vi.fn()
    vi.stubGlobal('fetch', browserFetch)
    const authFetch = vi.fn(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"客户端"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      authFetch: authFetch as any,
    })

    await sendMessage(service)

    expect(authFetch).toHaveBeenCalledWith(
      'https://node-0000.undefineds.co/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(browserFetch).not.toHaveBeenCalledWith('/api/ai/chat/completions', expect.anything())
  })

  it('routes server-selected platform runtime calls through the local service bridge', async () => {
    ;(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__ = true
    const store = createMockStore()
    const db = createMockDbWithPodUrl({
      provider: 'undefineds',
      model: 'linx-lite',
      metadata: {
        linx: {
          aiRuntimeLocation: 'server',
        },
      },
    }, 'https://node-0000.undefineds.co/alice/')
    const browserFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/runtime/threads')) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === '/api/ai/chat/completions') {
        return createSseResponse([
          'data: {"choices":[{"delta":{"content":"服务端"}}]}\n\n',
          'data: [DONE]\n\n',
        ])
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', browserFetch)
    const authFetch = vi.fn(async () => new Response('', { status: 404 }))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service)

    expect(browserFetch).toHaveBeenCalledWith('/api/ai/chat/completions', expect.objectContaining({
      method: 'POST',
    }))
    expect(authFetch).not.toHaveBeenCalled()
    const body = JSON.parse((browserFetch.mock.calls.find(([input]) => input === '/api/ai/chat/completions')?.[1] as RequestInit).body as string)
    expect(body.model).toBe('linx-lite')
    expect(events.some((event) => event.type === 'thread.item.updated' && event.update?.delta === '服务端')).toBe(true)
  })

  it('does not silently fall back when server-selected runtime is unavailable', async () => {
    const store = createMockStore()
    const db = createMockDb({
      provider: 'undefineds',
      model: 'linx-lite',
      metadata: {
        linx: {
          aiRuntimeLocation: 'server',
        },
      },
    })
    const browserFetch = vi.fn()
    vi.stubGlobal('fetch', browserFetch)
    const authFetch = vi.fn(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"fallback"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service)

    expect(authFetch).not.toHaveBeenCalled()
    expect(browserFetch).not.toHaveBeenCalledWith('/api/ai/chat/completions', expect.anything())
    expect(findAssistantDone(events)?.item?.status).toBe('incomplete')
    expect(events).toContainEqual(expect.objectContaining({
      type: 'error',
      error: expect.objectContaining({
        code: 'generation_error',
        message: '服务端 AI 运行只支持 LinX 桌面或本地服务。请切回客户端运行，或先启动本机空间。',
      }),
    }))
  })

  it('lets ChatKit platform model selection override the default LinX Lite model', async () => {
    const store = createMockStore()
    const db = createMockDb({
      provider: 'undefineds',
      model: 'linx-lite',
    })
    const authFetch = vi.fn(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"深度"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/profile/card#me',
      authFetch: authFetch as any,
    })

    await sendMessage(service, { model: 'linx' })

    const body = JSON.parse((authFetch.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(body.model).toBe('linx')
  })


  it('routes platform runtime calls through the selected Local SP, not the Cloud WebID origin', async () => {
    const store = createMockStore()
    const db = createMockDbWithPodUrl({
      provider: '/settings/providers/undefineds.ttl',
      model: 'undefineds/linx-lite',
    }, 'https://node-0000.undefineds.co/alice/')
    const authFetch = vi.fn(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"本机空间"}}]}\n\n',
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
    expect(events.some((event) => event.type === 'thread.item.updated' && event.update?.delta === '本机空间')).toBe(true)
  })

  it('resolves an Agent contact about IRI with findByIri instead of deriving a row id from the IRI', async () => {
    const store = createMockStore()
    const agentIri = 'https://node-0000.undefineds.co/alice/agents/agent-1/'
    const db = createMockDb({
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    }, [], {
      contactAbout: agentIri,
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

    expect((db as any).findByIri).toHaveBeenCalledWith(mocked.agentResource, agentIri)
    expect((db as any).findById).not.toHaveBeenCalledWith(mocked.agentResource, expect.stringContaining('https://'))
    expect(authFetch).toHaveBeenCalledWith(
      'https://api.undefineds.co/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(events.some((event) => event.type === 'thread.item.updated' && event.update?.delta === 'IRI OK')).toBe(true)
  })

  it('routes non-platform providers through the authenticated Pod runtime', async () => {
    const store = createMockStore()
    const db = createMockDb({
      provider: 'timecc',
      model: 'codex-auto-review',
    }, [{
      id: 'credentials.ttl#timecc-default',
      provider: '/settings/providers/timecc.ttl',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-test',
      baseUrl: 'https://timicc.example/v1',
    }], {
      participantRef: 'https://node-0000.undefineds.co/alice/.data/contacts/contact-1.ttl',
      contactAbout: 'https://node-0000.undefineds.co/alice/agents/agent-1/',
    })
    const providerFetch = vi.fn()
    vi.stubGlobal('fetch', providerFetch)
    const authFetch = vi.fn(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"用户模型"}}]}\n\n',
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
    expect(providerFetch).not.toHaveBeenCalled()
    const requestBody = JSON.parse((authFetch.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(requestBody.provider).toBe('timecc')
    expect(requestBody.model).toBe('timecc/codex-auto-review')
    expect(db.findByIri).toHaveBeenCalledWith(
      mocked.contactResource,
      'https://node-0000.undefineds.co/alice/.data/contacts/contact-1.ttl',
    )
    expect(db.findByIri).toHaveBeenCalledWith(
      mocked.agentResource,
      'https://node-0000.undefineds.co/alice/agents/agent-1/',
    )
    expect(events.some((event) => event.type === 'thread.item.updated' && event.update?.delta === '用户模型')).toBe(true)
  })

  it('limits provider history to the agent context rounds without starting on an assistant message', async () => {
    const store = createMockStore([
      { id: 'user-1', type: 'user_message', content: [{ type: 'input_text', text: 'old user' }] },
      { id: 'assistant-1', type: 'assistant_message', content: [{ type: 'output_text', text: 'old assistant' }] },
      { id: 'user-2', type: 'user_message', content: [{ type: 'input_text', text: 'recent user' }] },
      { id: 'assistant-2', type: 'assistant_message', content: [{ type: 'output_text', text: 'recent assistant' }] },
    ])
    const db = createMockDb({
      provider: 'timecc',
      model: 'codex-auto-review',
      contextRound: 2,
    })
    const authFetch = vi.fn(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"OK"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/profile/card#me',
      authFetch: authFetch as any,
    })

    await sendMessage(service)

    const requestBody = JSON.parse((authFetch.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(requestBody.messages).toEqual([
      expect.objectContaining({ role: 'system' }),
      { role: 'user', content: 'recent user' },
      { role: 'assistant', content: 'recent assistant' },
      { role: 'user', content: '你好' },
    ])
  })

  it('keeps the anchored user prompt when retry branch projection temporarily hides history', async () => {
    const store = createMockStore()
    const originalLoadItems = store.loadThreadItems
    const db = createMockDb({ provider: 'timecc', model: 'codex-auto-review', contextRound: 2 })
    const authFetch = vi.fn(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"OK"}}]}\n\n',
      'data: [DONE]\n\n',
    ]))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/profile/card#me',
      authFetch: authFetch as any,
    })
    await sendMessage(service)
    const persistedItems = (await originalLoadItems()).data
    const assistant = persistedItems.find((item: any) => item.type === 'assistant_message')
    store.loadThreadItems
      .mockResolvedValueOnce({ data: persistedItems, has_more: false })
      .mockResolvedValueOnce({ data: [], has_more: false })

    await collectStreamEvents(await service.process(JSON.stringify({
      type: 'threads.retry_after_item',
      params: { thread_id: 'thread-1', item_id: assistant.id },
    }), {}))

    const retryBody = JSON.parse((authFetch.mock.calls.at(-1)?.[1] as RequestInit).body as string)
    expect(retryBody.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: '你好' }),
    ]))
  })

  it('falls back to the scoped credential collection when the exact cached row is partial', async () => {
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
      exactCredentialRow: {
        id: 'credentials.ttl#openai-default',
        provider: '/settings/providers/openai.ttl',
        service: 'ai',
        status: 'active',
      },
    })
    const providerFetch = vi.fn()
    vi.stubGlobal('fetch', providerFetch)
    const authFetch = vi.fn(async () => createSseResponse([
      'data: {"choices":[{"delta":{"content":"缓存恢复"}}]}\n\n',
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
      expect.objectContaining({ method: 'POST' }),
    )
    expect(providerFetch).not.toHaveBeenCalled()
    expect(events.some((event) => event.type === 'thread.item.updated' && event.update?.delta === '缓存恢复')).toBe(true)
  })

  it('does not raw-fetch credentials.ttl when shared credential lookup has no match', async () => {
    const store = createMockStore()
    const db = createMockDb({
      provider: 'openai',
      model: 'gpt-4o-mini',
    })
    const providerFetch = vi.fn()
    vi.stubGlobal('fetch', providerFetch)
    const authFetch = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'model_not_configured', message: 'No AI provider configured.' },
    }), { status: 400 }))
    const service = new LocalChatKitService({
      store: store as any,
      db: db as any,
      webId: 'https://id.undefineds.co/profile/card#me',
      authFetch: authFetch as any,
    })

    const events = await sendMessage(service)

    expect(authFetch).toHaveBeenCalledWith(
      'https://api.undefineds.co/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(providerFetch).not.toHaveBeenCalled()
    expect(findAssistantDone(events)?.item?.content?.[0]?.text).toBe('消息生成失败。请稍后重试。')
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
