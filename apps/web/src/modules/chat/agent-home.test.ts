import { describe, expect, it, vi } from 'vitest'
import { agentResourceId } from '@/lib/data/resource-identity'
import { buildAgentHomePath, ensureAgentHome, readAgentHomeModel, updateAgentHomeModel } from './agent-home'

describe('agent-home', () => {
  it('creates default Agent Home files at canonical Agent Home paths', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 201 }))
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

  it('treats existing Agent Home files as initialized', async () => {
    const fetchMock = vi.fn(async (_input, init) => {
      if (init?.method === 'HEAD') return new Response('', { status: 200 })
      return new Response('', { status: init?.method === 'PATCH' ? 200 : 412 })
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
    expect(writeCalls).toHaveLength(3)
  })

  it('updates a directory-backed Agent model through its metadata resource', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }))
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://alice.example/',
        getAuthenticatedFetch: () => fetchMock,
      }),
    } as any

    await updateAgentHomeModel(db, {
      agentId: agentResourceId('__secretary__'),
      provider: 'timecc',
      model: 'gpt-5.4-mini',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [target, init] = fetchMock.mock.calls[0]!
    const body = String(init?.body)
    expect(String(target)).toBe('https://alice.example/agents/__secretary__/.meta')
    expect(init?.method).toBe('PATCH')
    expect(body.match(/DELETE WHERE/g)).toHaveLength(3)
    expect(body).not.toContain('OPTIONAL')
    expect(body).not.toContain('PREFIX')
    expect(body).toContain('<https://alice.example/agents/__secretary__/>')
    expect(body).toContain('</settings/providers/timecc.ttl>')
    expect(body).toContain('</settings/providers/timecc.ttl#gpt-5.4-mini>')
    expect(body).toContain('</settings/credentials.ttl#timecc-default>')
  })

  it('reads the effective model from Agent Home metadata', async () => {
    const metadata = `@prefix udfs: <https://undefineds.co/ns#>.\n<https://alice.example/agents/__secretary__/> udfs:provider <https://alice.example/settings/providers/timecc.ttl>; udfs:model <https://alice.example/settings/providers/timecc.ttl#gpt-5.4-mini>.`
    const fetchMock = vi.fn(async () => new Response(metadata, {
      status: 200,
      headers: { 'Content-Type': 'text/turtle' },
    }))
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://alice.example/',
        getAuthenticatedFetch: () => fetchMock,
      }),
    } as any

    await expect(readAgentHomeModel(
      db,
      'https://alice.example/agents/__secretary__/',
    )).resolves.toEqual({
      provider: 'https://alice.example/settings/providers/timecc.ttl',
      model: 'https://alice.example/settings/providers/timecc.ttl#gpt-5.4-mini',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://alice.example/agents/__secretary__/.meta',
      expect.objectContaining({ headers: { Accept: 'text/turtle' } }),
    )
  })

  it('does not send authenticated Agent Home reads to external origins', async () => {
    const fetchMock = vi.fn()
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://alice.example/',
        getAuthenticatedFetch: () => fetchMock,
      }),
    } as any

    await expect(readAgentHomeModel(
      db,
      'https://attacker.example/agents/stolen/',
    )).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
