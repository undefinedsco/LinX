import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; name: string }>,
  useLiveQuery: vi.fn(),
}))

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: mocks.useLiveQuery,
}))

vi.mock('@/modules/contacts/collections', () => ({
  agentCollection: { name: 'agent-collection' },
}))

import { useAgent, useAgents } from './useAgents'

describe('agent collection hooks', () => {
  beforeEach(() => {
    mocks.rows = [
      { id: 'agent-a', name: 'Agent A' },
      { id: 'agent-b', name: 'Agent B' },
    ]
    mocks.useLiveQuery.mockReset()
    mocks.useLiveQuery.mockImplementation(() => ({
      data: mocks.rows,
      isLoading: false,
      isError: false,
    }))
  })

  it('reads the shared agent collection without issuing a module-local query', () => {
    const { result } = renderHook(() => useAgents())

    expect(result.current.data).toEqual(mocks.rows)
    expect(mocks.useLiveQuery).toHaveBeenCalledOnce()
  })

  it('derives one agent from the same live collection', () => {
    const { result } = renderHook(() => useAgent('agent-b'))

    expect(result.current.data).toEqual({ id: 'agent-b', name: 'Agent B' })
    expect(mocks.useLiveQuery).toHaveBeenCalledOnce()
  })

  it('returns null when no agent is selected', () => {
    const { result } = renderHook(() => useAgent(null))

    expect(result.current.data).toBeNull()
  })
})
