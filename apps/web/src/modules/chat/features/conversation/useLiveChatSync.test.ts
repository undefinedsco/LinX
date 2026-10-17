import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLiveChatSync } from './useLiveChatSync'

function fakeAgent(knownIds: Set<string>, idle: Promise<void> = Promise.resolve()) {
  return { messageKnower: () => (id: string) => knownIds.has(id), whenIdle: () => idle }
}

describe('useLiveChatSync', () => {
  it('refreshes once when a row the surface has not seen shows up', async () => {
    const known = new Set(['a'])
    const agent = fakeAgent(known)
    const refresh = vi.fn(async () => { known.add('b') })
    const { rerender } = renderHook((props: { rows: Array<{ id: string }> }) => (
      useLiveChatSync({ agent, rows: props.rows, ready: true, refresh })
    ), { initialProps: { rows: [{ id: 'a' }] } })
    expect(refresh).not.toHaveBeenCalled()
    rerender({ rows: [{ id: 'a' }, { id: 'b' }] })
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    rerender({ rows: [{ id: 'a' }, { id: 'b' }] })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does not loop on rows that never become messages', async () => {
    const agent = fakeAgent(new Set())
    const refresh = vi.fn(async () => undefined)
    const { rerender } = renderHook((props: { rows: Array<{ id: string }> }) => (
      useLiveChatSync({ agent, rows: props.rows, ready: true, refresh })
    ), { initialProps: { rows: [{ id: 'tool-row' }] } })
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    rerender({ rows: [{ id: 'tool-row' }] })
    rerender({ rows: [{ id: 'tool-row' }, { id: 'tool-row' }] })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('waits for the surface\'s own run before looking, and skips rows the run produced', async () => {
    const known = new Set<string>()
    let finish: () => void = () => undefined
    const agent = fakeAgent(known, new Promise<void>((resolve) => { finish = resolve }))
    const refresh = vi.fn(async () => undefined)
    renderHook(() => useLiveChatSync({ agent, rows: [{ id: 'mine' }], ready: true, refresh }))
    known.add('mine') // the run registered its message while it was streaming
    finish()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(refresh).not.toHaveBeenCalled()
  })

  it('stays quiet until the first load is done', () => {
    const refresh = vi.fn(async () => undefined)
    renderHook(() => useLiveChatSync({ agent: fakeAgent(new Set()), rows: [{ id: 'x' }], ready: false, refresh }))
    expect(refresh).not.toHaveBeenCalled()
  })
})
