import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { AssistantRuntime } from '@assistant-ui/react'
import { usePersistVersionChoice } from './usePersistVersionChoice'

function fakeRuntime(initial: { isRunning: boolean; ids: string[] }) {
  let state = initial
  const listeners = new Set<() => void>()
  const runtime = {
    thread: {
      getState: () => ({ isRunning: state.isRunning, messages: state.ids.map((id) => ({ id })) }),
      subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    },
  } as unknown as AssistantRuntime
  return { runtime, set: (next: typeof initial) => { state = next; listeners.forEach((listener) => listener()) } }
}

describe('usePersistVersionChoice', () => {
  it('saves the shown path when it changes, but not while a run is in flight', () => {
    const agent = { persistVisibleVersions: vi.fn(async () => undefined) }
    const { runtime, set } = fakeRuntime({ isRunning: false, ids: ['u1', 'a1'] })
    renderHook(() => usePersistVersionChoice(runtime, agent))
    expect(agent.persistVisibleVersions).toHaveBeenLastCalledWith(['u1', 'a1'])
    set({ isRunning: true, ids: ['u1', 'a1', 'u2'] })
    expect(agent.persistVisibleVersions).toHaveBeenCalledTimes(1)
    set({ isRunning: false, ids: ['u1', 'a1', 'u2'] })
    expect(agent.persistVisibleVersions).toHaveBeenLastCalledWith(['u1', 'a1', 'u2'])
    set({ isRunning: false, ids: ['u1', 'a1', 'u2'] })
    expect(agent.persistVisibleVersions).toHaveBeenCalledTimes(2)
  })

  it('reports a save that failed', async () => {
    const onError = vi.fn()
    const agent = { persistVisibleVersions: vi.fn(async () => { throw new Error('offline') }) }
    const { runtime } = fakeRuntime({ isRunning: false, ids: ['u1'] })
    renderHook(() => usePersistVersionChoice(runtime, agent, onError))
    await Promise.resolve()
    await Promise.resolve()
    expect(onError).toHaveBeenCalled()
  })
})
