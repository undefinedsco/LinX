import { describe, expect, it, vi } from 'vitest'
import { agentResourceId } from '@undefineds.co/models'
import { buildAgentHomePath, ensureAgentHome } from './agent-home'

describe('agent-home', () => {
  it('creates default Agent Home containers and files in the Pod', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response('', { status: 404 })
      }
      return new Response('', { status: 201 })
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
      instructions: 'Help the user.',
    })

    expect(buildAgentHomePath(agentResourceId('agent-1'))).toBe('/.data/agents/agent-1/')
    expect(buildAgentHomePath(agentResourceId('__secretary__'))).toBe('/.data/agents/__secretary__/')

    const putTargets = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'PUT')
      .map(([input]) => String(input))

    expect(putTargets).toContain('https://alice.example/.data/agents/agent-1/')
    expect(putTargets).toContain('https://alice.example/.data/agents/agent-1/skills/')
    expect(putTargets).not.toContain('https://alice.example/.data/agents/agent-1.ttl/skills/')
    expect(putTargets).toContain('https://alice.example/.data/agents/agent-1/AGENTS.md')
    expect(putTargets).toContain('https://alice.example/.data/agents/agent-1/config.json')
    expect(putTargets).toContain('https://alice.example/.data/agents/agent-1/rules.md')
    expect(putTargets).toContain('https://alice.example/.data/agents/agent-1/mcp.json')
    expect(putTargets).toContain('https://alice.example/.data/agents/agent-1/skills/README.md')
    expect(putTargets).toContain('https://alice.example/.data/agents/agent-1/memory.md')

    const agentsMdPut = fetchMock.mock.calls.find(([input, init]) =>
      String(input).endsWith('/AGENTS.md') && init?.method === 'PUT'
    )
    expect(String(agentsMdPut?.[1]?.body)).toContain('This directory is the Agent Home')
    expect(String(agentsMdPut?.[1]?.body)).toContain('Help the user.')
  })

  it('rejects full Agent IRIs because callers must pass Agent row.id', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response('', { status: 404 })
      }
      return new Response('', { status: 201 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://alice.example/',
        getAuthenticatedFetch: () => fetchMock,
      }),
    } as any

    expect(() => buildAgentHomePath('https://alice.example/.data/agents/__secretary__.ttl#this'))
      .toThrow('Agent resource id must be a base-relative resource id')

    await expect(ensureAgentHome(db, {
      agentId: 'https://alice.example/.data/agents/__secretary__.ttl#this' as any,
      name: 'AI Secretary',
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
    })).rejects.toThrow('Agent resource id must be a base-relative resource id')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
