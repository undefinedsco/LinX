import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  addThreadItem: vi.fn(),
  generateItemId: vi.fn(() => 'assistant-artifact'),
  setAgentAccess: vi.fn(),
  getSolidDataset: vi.fn(),
  saveSolidDatasetAt: vi.fn(),
  serviceOptions: null as any,
}))

vi.mock('@inrupt/solid-client', () => ({
  universalAccess: { setAgentAccess: mocks.setAgentAccess },
  getSolidDataset: mocks.getSolidDataset,
  saveSolidDatasetAt: mocks.saveSolidDatasetAt,
  getThingAll: (dataset: { things: any[] }) => dataset.things,
  getUrlAll: (thing: any, predicate: string) => thing.urls?.[predicate] ?? [],
  addUrl: (thing: any, predicate: string, value: string) => ({
    ...thing,
    urls: { ...thing.urls, [predicate]: [...(thing.urls?.[predicate] ?? []), value] },
  }),
  setThing: (dataset: { things: any[] }, thing: any) => ({
    ...dataset,
    things: [...dataset.things.filter((current) => current.url !== thing.url), thing],
  }),
  createThing: ({ url }: { url: string }) => ({ url, urls: {} }),
  buildThing: (initial: any) => {
    let thing = initial
    const builder = {
      addUrl(predicate: string, value: string) {
        thing = {
          ...thing,
          urls: { ...thing.urls, [predicate]: [...(thing.urls?.[predicate] ?? []), value] },
        }
        return builder
      },
      build: () => thing,
    }
    return builder
  },
}))

vi.mock('../store', () => ({
  LocalChatKitStore: class LocalChatKitStore {
    refreshThreadItems = vi.fn()
    loadAttachmentObjectUrl = vi.fn()
    addThreadItem = mocks.addThreadItem
    generateItemId = mocks.generateItemId
    loadThread = vi.fn(async (threadId: string) => ({ id: threadId, status: { type: 'active' }, created_at: 1, updated_at: 1 }))
    dispose = vi.fn()
  },
}))

vi.mock('../service', () => ({
  LocalChatKitService: class LocalChatKitService {
    constructor(options: any) {
      mocks.serviceOptions = options
    }
    process = mocks.process
  },
}))

import { createLocalChatKitFetch } from '../fetch-handler'
import { enqueueChatGeneration, listChatGenerationOutbox } from '../generation-outbox'

function streamingResult(events: Array<Record<string, unknown>>) {
  const encoder = new TextEncoder()
  return {
    type: 'streaming' as const,
    stream: async function* () {
      for (const event of events) {
        yield encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
      }
    },
  }
}

describe('LocalChatKitFetch generation outbox', () => {
  const webId = 'https://id.example/alice#me'

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.serviceOptions = null
    localStorage.clear()
    mocks.setAgentAccess.mockResolvedValue({ read: true, append: true, write: true })
    mocks.saveSolidDatasetAt.mockResolvedValue(undefined)
  })

  afterEach(() => vi.restoreAllMocks())

  it('replays queued generations in order and removes successful entries', async () => {
    enqueueChatGeneration({ accountScope: webId, threadId: 'thread-1', userItemId: 'user-1' })
    enqueueChatGeneration({ accountScope: webId, threadId: 'thread-2', userItemId: 'user-2' })
    const outboxCounts: number[] = []
    mocks.process.mockResolvedValue(streamingResult([{ type: 'thread.item.done' }]))
    const localFetch = createLocalChatKitFetch({
      db: {} as any,
      webId,
      authFetch: vi.fn() as any,
      onOutboxChange: (count) => outboxCounts.push(count),
    })

    const result = await localFetch.flushOutbox({ force: true })

    expect(result).toEqual({ completed: 2, pending: 0 })
    expect(mocks.process).toHaveBeenNthCalledWith(1, expect.stringContaining('"thread_id":"thread-1"'), {})
    expect(mocks.process).toHaveBeenNthCalledWith(2, expect.stringContaining('"thread_id":"thread-2"'), {})
    expect(listChatGenerationOutbox(webId)).toEqual([])
    expect(outboxCounts.at(-1)).toBe(0)
  })

  it('shows and replays only pending generations for the current thread', async () => {
    enqueueChatGeneration({ accountScope: webId, threadId: 'thread-1', userItemId: 'user-1' })
    enqueueChatGeneration({ accountScope: webId, threadId: 'thread-2', userItemId: 'user-2' })
    mocks.process.mockResolvedValue(streamingResult([{ type: 'thread.item.done' }]))
    const localFetch = createLocalChatKitFetch({
      db: {} as any,
      webId,
      authFetch: vi.fn() as any,
      initialThread: {
        id: 'thread-2',
        status: { type: 'active' },
        created_at: 1,
        updated_at: 1,
      },
    })

    expect(localFetch.getOutboxSize()).toBe(1)
    await expect(localFetch.flushOutbox({ force: true })).resolves.toEqual({ completed: 1, pending: 0 })
    expect(mocks.process).toHaveBeenCalledOnce()
    expect(mocks.process).toHaveBeenCalledWith(expect.stringContaining('"thread_id":"thread-2"'), {})
    expect(listChatGenerationOutbox(webId)).toEqual([
      expect.objectContaining({ threadId: 'thread-1', userItemId: 'user-1' }),
    ])
  })

  it('keeps the failed entry and later entries queued after a replay error', async () => {
    enqueueChatGeneration({ accountScope: webId, threadId: 'thread-1', userItemId: 'user-1' })
    enqueueChatGeneration({ accountScope: webId, threadId: 'thread-2', userItemId: 'user-2' })
    mocks.process.mockResolvedValue(streamingResult([{
      type: 'error',
      error: { message: 'provider remains unavailable' },
    }]))
    const localFetch = createLocalChatKitFetch({ db: {} as any, webId, authFetch: vi.fn() as any })

    const result = await localFetch.flushOutbox({ force: true })

    expect(result).toEqual({ completed: 0, pending: 2 })
    expect(mocks.process).toHaveBeenCalledTimes(1)
    expect(listChatGenerationOutbox(webId)[0]).toEqual(expect.objectContaining({ attempts: 1 }))
  })

  it('drops a queued generation when its original user item no longer exists', async () => {
    enqueueChatGeneration({ accountScope: webId, threadId: 'thread-1', userItemId: 'user-deleted' })
    mocks.process.mockRejectedValue(new Error('Item not found: user-deleted'))
    const localFetch = createLocalChatKitFetch({ db: {} as any, webId, authFetch: vi.fn() as any })

    await expect(localFetch.flushOutbox({ force: true })).resolves.toEqual({ completed: 0, pending: 0 })
    expect(listChatGenerationOutbox(webId)).toEqual([])
  })

  it('coalesces concurrent reconnect flushes so one queued generation is replayed once', async () => {
    enqueueChatGeneration({ accountScope: webId, threadId: 'thread-1', userItemId: 'user-1' })
    mocks.process.mockResolvedValue(streamingResult([{ type: 'thread.item.done' }]))
    const localFetch = createLocalChatKitFetch({ db: {} as any, webId, authFetch: vi.fn() as any })

    const [first, second] = await Promise.all([
      localFetch.flushOutbox({ force: true }),
      localFetch.flushOutbox({ force: true }),
    ])

    expect(first).toEqual({ completed: 1, pending: 0 })
    expect(second).toEqual(first)
    expect(mocks.process).toHaveBeenCalledTimes(1)
  })

  it('pauses queued generation retries across thread runtimes until service access is granted', async () => {
    const db = {} as any
    enqueueChatGeneration({ accountScope: webId, threadId: 'thread-1', userItemId: 'user-1' })
    const onServiceAccessRequired = vi.fn()
    const firstFetch = createLocalChatKitFetch({
      db,
      webId,
      authFetch: vi.fn() as any,
      onServiceAccessRequired,
    })

    mocks.serviceOptions.onServiceAccessRequired()
    await expect(firstFetch.flushOutbox({ force: true })).resolves.toEqual({ completed: 0, pending: 1 })
    expect(onServiceAccessRequired).toHaveBeenCalledOnce()
    expect(mocks.process).not.toHaveBeenCalled()

    const secondFetch = createLocalChatKitFetch({ db, webId, authFetch: vi.fn() as any })
    await expect(secondFetch.flushOutbox({ force: true })).resolves.toEqual({ completed: 0, pending: 1 })
    expect(mocks.process).not.toHaveBeenCalled()
  })

  it('grants only the four Xpod-declared AI resources to its service identity', async () => {
    const podBaseUrl = 'https://pod.example/alice'
    const resources = [
      ['providerCredentials', 'settings/credentials.ttl'],
      ['providerDefinitions', 'settings/providers/'],
      ['gatewayAccessKeys', 'settings/gateway-access-keys.ttl'],
      ['quotaSnapshots', 'settings/quota-snapshots.ttl'],
    ].map(([id, path]) => ({
      id,
      url: `${podBaseUrl}/${path}`,
      ...(id === 'providerDefinitions' ? { members: true as const } : {}),
      access: { read: true, append: true, write: true },
    }))
    const providerUrl = resources[1].url
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/applets/service-access/ai-connections')) return Response.json({
        appletId: 'co.undefineds.ai-connections',
        service: { webId: 'https://xpod.example/service/profile/card#me' },
        resources,
      })
      if (url === providerUrl && init?.method === 'HEAD') {
        return new Response(null, { status: 200, headers: { Link: `<${providerUrl}.acr>; rel="acl"` } })
      }
      if (url === `${providerUrl}.acr` && !init?.method) return new Response(null, { status: 404 })
      if (url === `${providerUrl}.acr` && init?.method === 'PUT') return new Response(null, { status: 201 })
      throw new Error(`Unexpected request: ${url}`)
    })
    const localFetch = createLocalChatKitFetch({
      db: { getDialect: () => ({ getPodUrl: () => podBaseUrl }) } as any,
      webId,
      authFetch: authFetch as any,
    })

    mocks.serviceOptions.onServiceAccessRequired()
    await localFetch.ensureAiServiceAccess()
    enqueueChatGeneration({ accountScope: webId, threadId: 'thread-1', userItemId: 'user-1' })
    mocks.process.mockResolvedValue(streamingResult([{ type: 'thread.item.done' }]))
    await expect(localFetch.flushOutbox({ force: true })).resolves.toEqual({ completed: 1, pending: 0 })

    expect(mocks.setAgentAccess).toHaveBeenCalledTimes(3)
    expect(mocks.setAgentAccess).toHaveBeenNthCalledWith(
      1,
      resources[0].url,
      'https://xpod.example/service/profile/card#me',
      resources[0].access,
      { fetch: authFetch },
    )
  })

  it('rejects an AI service descriptor that points outside the current Pod', async () => {
    const podBaseUrl = 'https://pod.example/alice'
    const authFetch = vi.fn(async () => Response.json({
      appletId: 'co.undefineds.ai-connections',
      service: { webId: 'https://xpod.example/service/profile/card#me' },
      resources: [
        ['providerCredentials', 'https://evil.example/credentials.ttl'],
        ['providerDefinitions', `${podBaseUrl}/settings/ai-providers.ttl`],
        ['gatewayAccessKeys', `${podBaseUrl}/settings/gateway-access-keys.ttl`],
        ['quotaSnapshots', `${podBaseUrl}/settings/quota-snapshots.ttl`],
      ].map(([id, url]) => ({
        id,
        url,
        ...(id === 'providerDefinitions' ? { members: true as const } : {}),
        access: { read: true, append: true, write: true },
      })),
    }))
    const localFetch = createLocalChatKitFetch({
      db: { getDialect: () => ({ getPodUrl: () => podBaseUrl }) } as any,
      webId,
      authFetch: authFetch as any,
    })

    await expect(localFetch.ensureAiServiceAccess()).rejects.toThrow('越界或不完整')
    expect(mocks.setAgentAccess).not.toHaveBeenCalled()
  })

  it('initializes a missing Xpod ACP document before retrying the service grant', async () => {
    const podBaseUrl = 'https://pod.example/alice'
    const resourceUrl = `${podBaseUrl}/settings/credentials.ttl`
    const resources = [
      ['providerCredentials', resourceUrl],
      ['providerDefinitions', `${podBaseUrl}/settings/providers/`],
      ['gatewayAccessKeys', `${podBaseUrl}/settings/access-keys.ttl`],
      ['quotaSnapshots', `${podBaseUrl}/settings/quota.ttl`],
    ].map(([id, url]) => ({
      id,
      url,
      ...(id === 'providerDefinitions' ? { members: true as const } : {}),
      access: { read: true, append: true, write: true },
    }))
    mocks.setAgentAccess
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ read: true, append: true, write: true })
    const memberUrl = resources[1].url
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/applets/service-access/ai-connections')) {
        return Response.json({
          appletId: 'co.undefineds.ai-connections',
          service: { webId: 'https://xpod.example/service/profile/card#me' },
          resources,
        })
      }
      if (url === resourceUrl && init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: { Link: `<${resourceUrl}.acr>; rel="acl"` },
        })
      }
      if (url === `${resourceUrl}.acr` && !init?.method) return new Response(null, { status: 404 })
      if (url === `${resourceUrl}.acr` && init?.method === 'PUT') return new Response(null, { status: 201 })
      if (url === memberUrl && init?.method === 'HEAD') {
        return new Response(null, { status: 200, headers: { Link: `<${memberUrl}.acr>; rel="acl"` } })
      }
      if (url === `${memberUrl}.acr` && !init?.method) return new Response(null, { status: 404 })
      if (url === `${memberUrl}.acr` && init?.method === 'PUT') return new Response(null, { status: 201 })
      throw new Error(`Unexpected request: ${url}`)
    })
    const localFetch = createLocalChatKitFetch({
      db: { getDialect: () => ({ getPodUrl: () => podBaseUrl }) } as any,
      webId,
      authFetch: authFetch as any,
    })

    await localFetch.ensureAiServiceAccess()

    expect(authFetch).toHaveBeenCalledWith(`${resourceUrl}.acr`, expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining(`acp:agent <${webId}>`),
    }))
    expect(mocks.setAgentAccess).toHaveBeenCalledTimes(3)
  })

  it('adds member access to an existing provider container ACR without replacing owner policies', async () => {
    const podBaseUrl = 'https://pod.example/alice'
    const providerUrl = `${podBaseUrl}/settings/providers/`
    const acrUrl = `${providerUrl}.acr`
    const resources = [
      ['providerCredentials', `${podBaseUrl}/settings/credentials.ttl`],
      ['providerDefinitions', providerUrl],
      ['gatewayAccessKeys', `${podBaseUrl}/settings/access-keys.ttl`],
      ['quotaSnapshots', `${podBaseUrl}/settings/quota.ttl`],
    ].map(([id, url]) => ({
      id,
      url,
      ...(id === 'providerDefinitions' ? { members: true as const } : {}),
      access: { read: true, append: true, write: true },
    }))
    const root = {
      url: `${acrUrl}#acr`,
      urls: {
        'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': ['http://www.w3.org/ns/solid/acp#AccessControlResource'],
        'http://www.w3.org/ns/solid/acp#accessControl': [`${acrUrl}#owner`],
      },
    }
    const owner = { url: `${acrUrl}#owner`, urls: {} }
    mocks.getSolidDataset.mockResolvedValue({ things: [root, owner] })
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/applets/service-access/ai-connections')) {
        return Response.json({
          appletId: 'co.undefineds.ai-connections',
          service: { webId: 'https://xpod.example/service/profile/card#me' },
          resources,
        })
      }
      if (url === providerUrl && init?.method === 'HEAD') {
        return new Response(null, { status: 200, headers: { Link: `<${acrUrl}>; rel="acl"` } })
      }
      if (url === acrUrl && !init?.method) return new Response('', { status: 200 })
      throw new Error(`Unexpected request: ${url}`)
    })
    const localFetch = createLocalChatKitFetch({
      db: { getDialect: () => ({ getPodUrl: () => podBaseUrl }) } as any,
      webId,
      authFetch: authFetch as any,
    })

    await localFetch.ensureAiServiceAccess()

    expect(mocks.saveSolidDatasetAt).toHaveBeenCalledWith(
      acrUrl,
      expect.objectContaining({
        things: expect.arrayContaining([
          owner,
          expect.objectContaining({ url: `${acrUrl}#linxServiceMemberAccess` }),
          expect.objectContaining({ url: `${acrUrl}#linxServiceMemberPolicy` }),
          expect.objectContaining({ url: `${acrUrl}#linxServiceMemberMatcher` }),
        ]),
      }),
      { fetch: authFetch },
    )
  })

  it('waits for the retry deadline and backs off after provider failures', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T00:00:00.000Z'))
    try {
      enqueueChatGeneration({ accountScope: webId, threadId: 'thread-1', userItemId: 'user-1' })
      const localFetch = createLocalChatKitFetch({ db: {} as any, webId, authFetch: vi.fn() as any })
      mocks.process.mockResolvedValue(streamingResult([{
        type: 'error',
        error: { message: 'provider remains unavailable' },
      }]))

      expect(localFetch.getOutboxRetryAt()).toBe(Date.now() + 15_000)
      await expect(localFetch.flushOutbox()).resolves.toEqual({ completed: 0, pending: 1 })
      expect(mocks.process).not.toHaveBeenCalled()

      vi.advanceTimersByTime(15_000)
      await expect(localFetch.flushOutbox()).resolves.toEqual({ completed: 0, pending: 1 })
      expect(mocks.process).toHaveBeenCalledTimes(1)
      expect(localFetch.getOutboxRetryAt()).toBe(Date.now() + 30_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('writes edited Canvas content as a new Pod file and records a versioned chat artifact', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_723_344_000_000)
    const authFetch = vi.fn(async () => new Response('', { status: 201 }))
    const localFetch = createLocalChatKitFetch({ db: {} as any, webId, authFetch: authFetch as any })

    const result = await localFetch.saveArtifactVersion({
      threadId: 'thread-1',
      uri: 'https://pod.example/work/plan.md',
      name: 'plan.md',
      mimeType: 'text/markdown',
      content: '# Updated plan',
    })

    expect(result.uri).toBe('https://pod.example/work/plan.v-1723344000000.md')
    expect(authFetch).toHaveBeenCalledWith(result.uri, expect.objectContaining({
      method: 'PUT',
      body: '# Updated plan',
    }))
    expect(mocks.addThreadItem).toHaveBeenCalledWith('thread-1', expect.objectContaining({
      id: 'assistant-artifact',
      artifacts: [expect.objectContaining({ resourceUri: result.uri, type: 'artifact' })],
    }), {})
  })
})
