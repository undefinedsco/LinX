import { describe, expect, it, vi } from 'vitest'
import { agentResource } from '@undefineds.co/models'
import { agentResourceId } from '@/lib/data/resource-identity'
import { buildAgentHomePath, ensureAgentHome, updateAgentHomeMetadata } from './agent-home'

describe('agent-home', () => {
  it('creates default Agent Home files at canonical Agent Home paths', async () => {
    const fetchMock = vi.fn(async (_input, init) => new Response('', { status: init?.method === 'HEAD' ? 404 : 201 }))
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://alice.example/',
        getAuthenticatedFetch: () => fetchMock,
      }),
    } as any

    await ensureAgentHome(db, {
      agentId: agentResourceId('agent-1'),
      name: 'AI Secretary',
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
      instructions: 'Help the user.',
    })

    expect(buildAgentHomePath(agentResourceId('agent-1'))).toBe('/agents/agent-1/')
    expect(buildAgentHomePath(agentResourceId('__secretary__'))).toBe('/agents/__secretary__/')

    const putTargets = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'PUT')
      .map(([input]) => String(input))
    const patchTargets = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'PATCH')
      .map(([input]) => String(input))

    expect(putTargets).not.toContain('https://alice.example/.data/agents/agent-1/')
    expect(putTargets).toEqual([
      'https://alice.example/agents/agent-1/AGENTS.md',
      'https://alice.example/agents/agent-1/skills/README.md',
    ])
    expect(patchTargets).toEqual([
      'https://alice.example/agents/agent-1/.meta',
    ])

    const agentsMdPut = fetchMock.mock.calls.find(([input, init]) =>
      String(input).endsWith('/AGENTS.md') && init?.method === 'PUT'
    )
    expect(String(agentsMdPut?.[1]?.body)).toContain('This directory is the Agent Home')
    expect(String(agentsMdPut?.[1]?.body)).toContain('If the AI runtime runs on the client, access Pod workspaces through the xpod CLI')
    expect(String(agentsMdPut?.[1]?.body)).toContain('If the AI runtime runs on server/xpod, Pod storage may be exposed as a local folder')
    expect(String(agentsMdPut?.[1]?.body)).toContain('Help the user.')
    expect(agentsMdPut?.[1]?.headers).toMatchObject({
      'If-None-Match': '*',
    })

    const metaPatch = fetchMock.mock.calls.find(([input, init]) =>
      String(input).endsWith('/.meta') && init?.method === 'PATCH'
    )
    expect(metaPatch?.[1]?.headers).toMatchObject({
      'Content-Type': 'application/sparql-update',
    })
    expect(String(metaPatch?.[1]?.body)).toContain('INSERT DATA')
    expect(String(metaPatch?.[1]?.body)).toContain('<https://alice.example/agents/agent-1/>')
    expect(String(metaPatch?.[1]?.body)).not.toContain('.meta#config')
    expect(agentResourceId('__secretary__')).toBe('__secretary__/')
  })

  it('writes app-owned createdAt and never the server-managed modified predicate', async () => {
    const fetchMock = vi.fn(async (_input, init) => new Response('', { status: init?.method === 'HEAD' ? 404 : 201 }))
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://alice.example/',
        getAuthenticatedFetch: () => fetchMock,
      }),
    } as any
    const createdAt = new Date('2026-11-16T16:00:00.000Z')

    await ensureAgentHome(db, {
      agentId: agentResourceId('agent-1'),
      name: 'AI Secretary',
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
      createdAt,
    })

    const metaPatch = fetchMock.mock.calls.find(([input, init]) =>
      String(input).endsWith('/.meta') && init?.method === 'PATCH'
    )
    const body = String(metaPatch?.[1]?.body)
    expect(body).toContain('BASE <https://alice.example/>')
    expect(body).toContain(`<${agentResource.createdAt.getPredicate()}> "2026-11-16T16:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>`)
    // The Pod rejects client edits to dcterms:modified on a .meta resource.
    expect(body).not.toContain(agentResource.updatedAt.getPredicate())
    expect(body).toContain(`<${agentResource.getRdfClass()}>`)
    expect(body).toContain('<https://undefineds.co/ns#AgentConfig>')
  })

  it('does not invent timestamps when reconciling pre-existing metadata', async () => {
    const fetchMock = vi.fn(async (_input, init) => {
      if (init?.method === 'HEAD') return new Response('', { status: 200 })
      if (!init?.method) {
        return new Response([
          '<https://alice.example/agents/agent-1/> a <https://undefineds.co/ns#AgentConfig> .',
          '<https://alice.example/agents/agent-1/> <http://xmlns.com/foaf/0.1/name> "Legacy" .',
        ].join('\n'), { status: 200 })
      }
      return new Response('', { status: 200 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://alice.example/',
        getAuthenticatedFetch: () => fetchMock,
      }),
    } as any

    await ensureAgentHome(db, {
      agentId: agentResourceId('agent-1'),
      name: 'AI Secretary',
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    })

    const metaPatch = fetchMock.mock.calls.find(([input, init]) =>
      String(input).endsWith('/.meta') && init?.method === 'PATCH'
    )
    const body = String(metaPatch?.[1]?.body)
    expect(body).toContain('<http://xmlns.com/foaf/0.1/Agent>')
    expect(body).not.toContain('dcterms/created')
    expect(body).not.toContain('dcterms/modified')
  })

  it('publishes timestamps from the authoritative row on first creation', async () => {
    const fetchMock = vi.fn(async (_input, init) => new Response('', { status: init?.method === 'HEAD' ? 404 : 201 }))
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://alice.example/',
        getAuthenticatedFetch: () => fetchMock,
      }),
    } as any

    const before = Date.now()
    await ensureAgentHome(db, {
      agentId: agentResourceId('agent-1'),
      name: 'AI Secretary',
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    })
    const after = Date.now()

    const metaPatch = fetchMock.mock.calls.find(([input, init]) =>
      String(input).endsWith('/.meta') && init?.method === 'PATCH'
    )
    const body = String(metaPatch?.[1]?.body)
    const created = body.match(new RegExp(`<${agentResource.createdAt.getPredicate()}> "([^"]+)"`))?.[1]
    expect(created).toBeTruthy()
    expect(body).not.toContain(agentResource.updatedAt.getPredicate())
    const parsed = Date.parse(created as string)
    expect(Number.isNaN(parsed)).toBe(false)
    expect(parsed).toBeGreaterThanOrEqual(before)
    expect(parsed).toBeLessThanOrEqual(after)
  })

  it('rejects full Agent IRIs because callers must pass Agent row.id', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 201 }))
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://alice.example/',
        getAuthenticatedFetch: () => fetchMock,
      }),
    } as any

    expect(() => buildAgentHomePath('https://alice.example/.data/agents/__secretary__.ttl#this'))
      .toThrow('Agent resource id must be a base-relative resource id')
    expect(() => buildAgentHomePath('__secretary__/profile/card#me'))
      .toThrow('Agent resource id must use {agentKey}/.')

    await expect(ensureAgentHome(db, {
      agentId: 'https://alice.example/.data/agents/__secretary__.ttl#this' as any,
      name: 'AI Secretary',
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    })).rejects.toThrow('Agent resource id must be a base-relative resource id')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('updates directory-backed agents through the .meta sidecar', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }))
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://alice.example/',
        getAuthenticatedFetch: () => fetchMock,
      }),
    } as any

    await updateAgentHomeMetadata(db, agentResourceId('agent-1'), {
      name: 'Updated Agent',
      metadata: { linx: { aiRuntimeLocation: 'server' } },
    }, {
      name: 'Previous Agent',
      metadata: { linx: { aiRuntimeLocation: 'client' } },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.every(([target, init]) =>
      String(target) === 'https://alice.example/agents/agent-1/.meta' && init?.method === 'PATCH'
    )).toBe(true)
    const body = String(fetchMock.mock.calls[0]?.[1]?.body)
    expect(body).toContain('DELETE {')
    expect(body).toContain('INSERT DATA')
    expect(body).toContain('?previousValue')
    expect(body).toContain('<https://alice.example/agents/agent-1/>')
    expect(body).toContain('aiRuntimeLocation')
    expect(body).toContain('XMLSchema#json')
  })

  it('updates provider, model, and tools atomically using their schema RDF terms', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }))
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://alice.example/',
        getAuthenticatedFetch: () => fetchMock,
      }),
    } as any

    await updateAgentHomeMetadata(db, agentResourceId('agent-1'), {
      provider: 'openai',
      model: 'gpt-5',
      tools: ['web-search', 'filesystem'],
    }, {
      provider: 'undefineds',
      model: 'linx-lite',
      tools: ['web-search'],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = String(fetchMock.mock.calls[0]?.[1]?.body)
    expect(body).toContain('DELETE {')
    expect(body).toContain('INSERT DATA')
    expect(body).toContain('https://undefineds.co/ns#provider')
    expect(body).toContain('https://undefineds.co/ns#model')
    expect(body).toContain('https://undefineds.co/ns#tools')
    expect(body).toContain('"filesystem"')
    expect(body).toContain('BASE <https://alice.example/>')
    expect(body).toContain('DELETE {')
    expect(body).toContain('WHERE {')
    expect(body).toContain('?previousValue')
  })

  it('treats existing Agent Home files as initialized', async () => {
    const fetchMock = vi.fn(async (_input, init) => {
      if (init?.method === 'HEAD') return new Response('', { status: 200 })
      if (!init?.method) {
        return new Response([
          '<https://alice.example/agents/agent-1/> a <http://xmlns.com/foaf/0.1/Agent> .',
          '<https://alice.example/agents/agent-1/> a <https://undefineds.co/ns#AgentConfig> .',
        ].join('\n'), { status: 200 })
      }
      return new Response('', { status: 200 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://alice.example/',
        getAuthenticatedFetch: () => fetchMock,
      }),
    } as any

    await expect(ensureAgentHome(db, {
      agentId: agentResourceId('agent-1'),
      name: 'AI Secretary',
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    })).resolves.toBeUndefined()

    const writeCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT' || init?.method === 'PATCH')
    expect(writeCalls).toHaveLength(0)
  })
})
