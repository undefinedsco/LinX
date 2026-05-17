import { describe, expect, it, vi } from 'vitest'
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
      agentId: 'agent-1',
      name: 'AI Secretary',
      provider: 'undefineds',
      model: 'undefineds/linx-lite',
      instructions: 'Help the user.',
    })

    expect(buildAgentHomePath('agent-1')).toBe('/.data/agents/agent-1/')

    const putTargets = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'PUT')
      .map(([input]) => String(input))

    expect(putTargets).toContain('https://alice.example/.data/agents/agent-1/')
    expect(putTargets).toContain('https://alice.example/.data/agents/agent-1/skills/')
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
})
