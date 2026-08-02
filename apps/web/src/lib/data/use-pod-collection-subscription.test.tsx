import { StrictMode } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePodCollectionSubscription } from './use-pod-collection-subscription'

function Consumer({
  enabled,
  identity,
  subscribe,
}: {
  enabled: boolean
  identity: object | null
  subscribe: () => Promise<() => void>
}) {
  usePodCollectionSubscription(enabled, identity, subscribe)
  return null
}

describe('usePodCollectionSubscription', () => {
  afterEach(() => vi.useRealTimers())

  it('acquires only while the module is active and releases after unmount', async () => {
    vi.useFakeTimers()
    const release = vi.fn()
    const subscribe = vi.fn().mockResolvedValue(release)
    const db = {}
    const view = render(<Consumer enabled={false} identity={db} subscribe={subscribe} />)
    expect(subscribe).not.toHaveBeenCalled()

    view.rerender(<Consumer enabled identity={db} subscribe={subscribe} />)
    await act(async () => Promise.resolve())
    expect(subscribe).toHaveBeenCalledTimes(1)

    view.unmount()
    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('transfers the lease when the database identity changes', async () => {
    vi.useFakeTimers()
    const releases: Array<ReturnType<typeof vi.fn>> = []
    const subscribe = vi.fn(async () => {
      const release = vi.fn()
      releases.push(release)
      return release
    })
    const firstDb = {}
    const secondDb = {}
    const view = render(<Consumer enabled identity={firstDb} subscribe={subscribe} />)
    await act(async () => Promise.resolve())

    view.rerender(<Consumer enabled identity={secondDb} subscribe={subscribe} />)
    await act(async () => Promise.resolve())
    expect(subscribe).toHaveBeenCalledTimes(2)
    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(releases[0]).toHaveBeenCalledTimes(1)
    expect(releases[1]).not.toHaveBeenCalled()
  })

  it('transfers leases when the visible module subscription changes', async () => {
    vi.useFakeTimers()
    const releaseChat = vi.fn()
    const releaseFiles = vi.fn()
    const subscribeChat = vi.fn().mockResolvedValue(releaseChat)
    const subscribeFiles = vi.fn().mockResolvedValue(releaseFiles)
    const db = {}
    const view = render(<Consumer enabled identity={db} subscribe={subscribeChat} />)
    await act(async () => Promise.resolve())

    view.rerender(<Consumer enabled identity={db} subscribe={subscribeFiles} />)
    await act(async () => Promise.resolve())
    expect(subscribeChat).toHaveBeenCalledTimes(1)
    expect(subscribeFiles).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(releaseChat).toHaveBeenCalledTimes(1)
    expect(releaseFiles).not.toHaveBeenCalled()
  })

  it('keeps one logical subscription through a Strict Mode remount', async () => {
    vi.useFakeTimers()
    const release = vi.fn()
    const subscribe = vi.fn().mockResolvedValue(release)
    const db = {}

    const view = render(
      <StrictMode>
        <Consumer enabled identity={db} subscribe={subscribe} />
      </StrictMode>,
    )
    await act(async () => Promise.resolve())
    await act(async () => vi.advanceTimersByTimeAsync(250))

    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(release).not.toHaveBeenCalled()
    view.unmount()
    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('releases a subscription that finishes connecting after unmount', async () => {
    vi.useFakeTimers()
    let resolveConnection!: (release: () => void) => void
    const release = vi.fn()
    const subscribe = vi.fn(() => new Promise<() => void>((resolve) => {
      resolveConnection = resolve
    }))
    const view = render(<Consumer enabled identity={{}} subscribe={subscribe} />)
    await act(async () => Promise.resolve())
    view.unmount()

    await act(async () => {
      resolveConnection(release)
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(250)
    })

    expect(release).toHaveBeenCalledTimes(1)
  })
})
