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

import { createLocalChatKitFetch, ensureAiServiceAccessForSession } from '../fetch-handler'

describe('LocalChatKitFetch service access and artifacts', () => {
  it('does not rewrite access policies or initialize documents when interactive service uses the owner identity', async () => {
    const podBaseUrl = 'https://pod.example/alice/'
    const ownerWebId = `${podBaseUrl}profile/card#me`
    const authFetch = vi.fn(async () => Response.json({
      appletId: 'co.undefineds.ai-connections',
      service: { webId: ownerWebId, label: 'Xpod AI Connection' },
      resources: [{
        id: 'gatewayAccessKeySecrets',
        url: `${podBaseUrl}.data/ai/gateway/access-key-secrets.json`,
        mediaType: 'application/json',
        access: { read: true, append: true, write: true },
      }],
    }))
    await ensureAiServiceAccessForSession({ podBaseUrl, webId: ownerWebId, authFetch })
    expect(authFetch).toHaveBeenCalledOnce()
    expect(mocks.setAgentAccess).not.toHaveBeenCalled()
  })

  it('still rejects a different applet even if its service WebID equals the owner', async () => {
    const podBaseUrl = 'https://pod.example/alice/'
    const ownerWebId = `${podBaseUrl}profile/card#me`
    const authFetch = vi.fn(async () => Response.json({
      appletId: 'untrusted-applet', service: { webId: ownerWebId }, resources: [],
    }))
    await expect(ensureAiServiceAccessForSession({ podBaseUrl, webId: ownerWebId, authFetch }))
      .rejects.toThrow('无效的 AI 服务授权信息')
    expect(mocks.setAgentAccess).not.toHaveBeenCalled()
  })

  it('creates missing resources as the owner before granting service access, without overwriting concurrent writes', async () => {
    const podBaseUrl = 'https://pod.example/alice/'
    const resources = [
      ['providerCredentials', 'settings/credentials.ttl'],
      ['providerDefinitions', 'settings/providers/'],
      ['gatewayAccessKeys', 'settings/gateway-access-keys.ttl'],
      ['quotaSnapshots', 'settings/quota-snapshots.ttl'],
    ].map(([id, path]) => ({ id, url: podBaseUrl + path, ...(id === 'providerDefinitions' ? { members: true } : {}), access: { read: true, append: true, write: true } }))
    const created = new Set<string>()
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/applets/service-access/ai-connections')) return Response.json({ appletId: 'co.undefineds.ai-connections', service: { webId: 'https://xpod.example/service/profile/card#me' }, resources })
      if (init?.method === 'HEAD') return new Response(null, { status: created.has(url) ? 200 : 404, headers: { Link: `<${url}.acr>; rel="acl"` } })
      if (init?.method === 'PUT' && !url.endsWith('.acr')) {
        expect(new Headers(init.headers).get('If-None-Match')).toBe('*')
        created.add(url)
        return new Response(null, { status: 412 })
      }
      if (url.endsWith('.acr')) return new Response(null, { status: init?.method === 'PUT' ? 201 : 404 })
      throw new Error(`Unexpected request: ${url}`)
    })
    mocks.setAgentAccess.mockImplementation(async (url: string) => {
      expect(created.has(url)).toBe(true)
      return { read: true, append: true, write: true }
    })
    await ensureAiServiceAccessForSession({ podBaseUrl, webId: `${podBaseUrl}profile/card#me`, authFetch })
    expect(created.size).toBe(4)
  })
  const webId = 'https://id.example/alice#me'

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.serviceOptions = null
    localStorage.clear()
    mocks.setAgentAccess.mockResolvedValue({ read: true, append: true, write: true })
    mocks.saveSolidDatasetAt.mockResolvedValue(undefined)
  })

  afterEach(() => vi.restoreAllMocks())

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
      if (init?.method === 'HEAD' && resources.some((resource) => resource.url === url)) return new Response(null, { status: 200 })
      throw new Error(`Unexpected request: ${url}`)
    })
    const localFetch = createLocalChatKitFetch({
      db: { getDialect: () => ({ getPodUrl: () => podBaseUrl }) } as any,
      webId,
      authFetch: authFetch as any,
    })

    mocks.serviceOptions.onServiceAccessRequired()
    await localFetch.ensureAiServiceAccess()

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
      if (init?.method === 'HEAD' && resources.some((resource) => resource.url === url)) return new Response(null, { status: 200 })
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
      if (init?.method === 'HEAD' && resources.some((resource) => resource.url === url)) return new Response(null, { status: 200 })
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
