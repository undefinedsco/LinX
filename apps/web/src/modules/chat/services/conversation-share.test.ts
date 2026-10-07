import { beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  markRevoked: vi.fn(),
}))

vi.mock('@undefineds.co/models', async (importOriginal) => ({
  ...await importOriginal<typeof import('@undefineds.co/models')>(),
  conversationShareRepository: shared,
  markConversationShareRevoked: shared.markRevoked,
}))

import { createConversationShare, listConversationShares, revokeConversationShare } from './conversation-share'

describe('conversation share persistence', () => {
  const resources = new Map<string, { body: string; contentType: string }>()
  let accessControlKind: 'acl' | 'acr' = 'acr'
  let rejectPermissionWrite = false
  let rejectPermissionDiscovery = false
  const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'PUT') {
      if (rejectPermissionWrite && /\.(?:acl|acr)$/u.test(url)) {
        resources.set(url, { body: String(init?.body ?? ''), contentType: new Headers(init?.headers).get('Content-Type') ?? '' })
        return new Response('', { status: 500 })
      }
      resources.set(url, { body: String(init?.body ?? ''), contentType: new Headers(init?.headers).get('Content-Type') ?? '' })
      return new Response('', { status: 201 })
    }
    if (method === 'DELETE') {
      resources.delete(url)
      return new Response(null, { status: 204 })
    }
    if (method === 'HEAD') {
      if (rejectPermissionDiscovery) return new Response('', { status: 500 })
      if (!resources.has(url)) return new Response('', { status: 404 })
      const relation = accessControlKind === 'acr'
        ? 'http://www.w3.org/ns/solid/acp#accessControl'
        : 'acl'
      return new Response(null, {
        status: 200,
        headers: { Link: `<${url}.${accessControlKind}>; rel="${relation}"` },
      })
    }
    const resource = resources.get(url)
    return resource
      ? new Response(resource.body, { status: 200, headers: { 'Content-Type': resource.contentType } })
      : new Response('', { status: 404 })
  })

  beforeEach(() => {
    resources.clear()
    accessControlKind = 'acr'
    rejectPermissionWrite = false
    rejectPermissionDiscovery = false
    vi.clearAllMocks()
    shared.list.mockResolvedValue([])
    shared.markRevoked.mockResolvedValue({ id: 'share.ttl', revokedAt: new Date() })
  })

  it('discovers and writes an ACP access-control resource while keeping structured metadata', async () => {
    const db = {} as import('@undefineds.co/models').SolidDatabase
    shared.create.mockImplementation(async (_db: unknown, input: Record<string, unknown>) => ({
      ...input,
      createdAt: input.createdAt,
    }))

    const share = await createConversationShare({
      db,
      authFetch: authFetch as typeof fetch,
      podBaseUrl: 'https://pod.example/',
      ownerWebId: 'https://id.example/alice#me',
      threadUri: 'https://pod.example/.data/chat/chat-1/index.ttl#thread-1',
      messages: [{ id: 'u1', role: 'user', content: 'hello' }],
      options: { title: 'Shared chat' },
    })

    expect(resources.get(share.url)?.body).toContain('hello')
    expect(resources.get(`${share.url}.acr`)?.body).toContain('acp:agent acp:PublicAgent')
    expect(resources.get(`${share.url}.acr`)?.body).toContain('https://id.example/alice#me')
    expect(shared.create).toHaveBeenCalledWith(db, expect.objectContaining({
      thread: 'https://pod.example/.data/chat/chat-1/index.ttl#thread-1',
      resourceUrl: share.url,
    }))

    shared.list.mockResolvedValue([{
      id: share.id,
      thread: 'https://pod.example/.data/chat/chat-1/index.ttl#thread-1',
      resourceUrl: share.url,
      includeToolDetails: false,
      excludedMessageIds: [],
      createdAt: new Date(share.createdAt),
    }])
    await expect(listConversationShares({ db, threadUri: 'https://pod.example/.data/chat/chat-1/index.ttl#thread-1' })).resolves.toEqual([share])

    await revokeConversationShare({ db, authFetch: authFetch as typeof fetch, podBaseUrl: 'https://pod.example/', share })
    expect(resources.has(share.url)).toBe(false)
    expect(resources.has(`${share.url}.acr`)).toBe(false)
    expect(shared.markRevoked).toHaveBeenCalledWith(db, share.id)
  })

  it('keeps compatibility with Pods that advertise a WAC resource', async () => {
    accessControlKind = 'acl'
    shared.create.mockImplementation(async (_db: unknown, input: Record<string, unknown>) => input)
    const share = await createConversationShare({
      db: {} as import('@undefineds.co/models').SolidDatabase,
      authFetch: authFetch as typeof fetch,
      podBaseUrl: 'https://pod.example/',
      ownerWebId: 'https://id.example/alice#me',
      threadUri: 'https://pod.example/.data/chat/chat-1/index.ttl#thread-1',
      messages: [{ id: 'u1', role: 'user', content: 'hello' }],
      options: { title: 'Shared chat' },
    })
    expect(resources.get(`${share.url}.acl`)?.body).toContain('acl:agentClass foaf:Agent')
  })

  it('removes public files if metadata persistence fails', async () => {
    const db = {} as import('@undefineds.co/models').SolidDatabase
    shared.create.mockRejectedValue(new Error('Pod metadata failed'))

    await expect(createConversationShare({
      db,
      authFetch: authFetch as typeof fetch,
      podBaseUrl: 'https://pod.example/',
      ownerWebId: 'https://id.example/alice#me',
      threadUri: 'https://pod.example/.data/chat/chat-1/index.ttl#thread-1',
      messages: [{ id: 'u1', role: 'user', content: 'hello' }],
      options: { title: 'Shared chat' },
    })).rejects.toThrow('Pod metadata failed')
    expect(resources.size).toBe(0)
  })

  it('removes the public file and advertised permission resource when permission creation fails', async () => {
    rejectPermissionWrite = true

    await expect(createConversationShare({
      db: {} as import('@undefineds.co/models').SolidDatabase,
      authFetch: authFetch as typeof fetch,
      podBaseUrl: 'https://pod.example/',
      ownerWebId: 'https://id.example/alice#me',
      threadUri: 'https://pod.example/.data/chat/chat-1/index.ttl#thread-1',
      messages: [{ id: 'u1', role: 'user', content: 'hello' }],
      options: { title: 'Shared chat' },
    })).rejects.toThrow('Permission write failed with HTTP 500')

    expect(resources.size).toBe(0)
    expect(shared.create).not.toHaveBeenCalled()
  })

  it('removes the public file when permission discovery fails', async () => {
    rejectPermissionDiscovery = true

    await expect(createConversationShare({
      db: {} as import('@undefineds.co/models').SolidDatabase,
      authFetch: authFetch as typeof fetch,
      podBaseUrl: 'https://pod.example/',
      ownerWebId: 'https://id.example/alice#me',
      threadUri: 'https://pod.example/.data/chat/chat-1/index.ttl#thread-1',
      messages: [{ id: 'u1', role: 'user', content: 'hello' }],
      options: { title: 'Shared chat' },
    })).rejects.toThrow('Permission discovery failed with HTTP 500')

    expect(resources.size).toBe(0)
    expect(shared.create).not.toHaveBeenCalled()
  })

  it('does not follow cross-origin permission links or revoke foreign share URLs', async () => {
    const db = {} as import('@undefineds.co/models').SolidDatabase
    const crossOriginFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response('', { status: 201 })
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 200, headers: { Link: '<https://attacker.example/share.acl>; rel="acl"' } })
      }
      if (init?.method === 'DELETE') return new Response(null, { status: 204 })
      return new Response('', { status: 404 })
    })

    await expect(createConversationShare({
      db,
      authFetch: crossOriginFetch as typeof fetch,
      podBaseUrl: 'https://pod.example/',
      ownerWebId: 'https://id.example/alice#me',
      threadUri: 'https://pod.example/.data/chat/chat-1/index.ttl#thread-1',
      messages: [{ id: 'u1', role: 'user', content: 'hello' }],
      options: { title: 'Shared chat' },
    })).rejects.toThrow('same origin')
    expect(crossOriginFetch.mock.calls.some(([url]) => String(url).startsWith('https://attacker.example/'))).toBe(false)

    await expect(revokeConversationShare({
      db,
      authFetch: crossOriginFetch as typeof fetch,
      podBaseUrl: 'https://pod.example/',
      share: { id: 'foreign', url: 'https://attacker.example/share.html', createdAt: new Date().toISOString(), includeToolDetails: false, excludedMessageIds: [] },
    })).rejects.toThrow('outside the selected Pod')
    expect(shared.markRevoked).not.toHaveBeenCalled()
  })
})
