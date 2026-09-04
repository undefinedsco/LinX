import { describe, expect, it, vi } from 'vitest'
import { agentResourceId } from './resource-identity'
import { createAgentHome } from './agent-home'

function createDb(fetchMock: typeof fetch) {
  return {
    getDialect: () => ({
      getPodUrl: () => 'https://alice.example/',
      getAuthenticatedFetch: () => fetchMock,
    }),
  } as any
}

describe('Agent Home creation receipt', () => {
  it('rolls back a newly-created home from leaves to containers', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response('', { status: 404 })
      if (init?.method === 'DELETE') return new Response(null, { status: 204 })
      return new Response('', { status: 201 })
    })

    const receipt = await createAgentHome(createDb(fetchMock as typeof fetch), {
      agentId: agentResourceId('agent-1'),
      name: 'Agent One',
      provider: 'openai',
      model: 'gpt-4o-mini',
    })

    expect(receipt.created).toBe(true)
    await receipt.rollback()

    const deleteTargets = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'DELETE')
      .map(([input]) => String(input))
    expect(deleteTargets).toEqual([
      'https://alice.example/agents/agent-1/skills/README.md',
      'https://alice.example/agents/agent-1/skills/',
      'https://alice.example/agents/agent-1/.meta',
      'https://alice.example/agents/agent-1/AGENTS.md',
      'https://alice.example/agents/agent-1/',
    ])
  })

  it('never deletes a home that existed before initialization', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response('', { status: 200 })
      return new Response('', { status: 200 })
    })

    const receipt = await createAgentHome(createDb(fetchMock as typeof fetch), {
      agentId: agentResourceId('agent-1'),
      name: 'Existing Agent',
      provider: 'openai',
      model: 'gpt-4o-mini',
    })

    expect(receipt.created).toBe(false)
    await receipt.rollback()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
