import { describe, expect, it, vi } from 'vitest'
import { probeChatConnectivity } from './chat-connectivity'

describe('probeChatConnectivity', () => {
  it('treats any HTTP response as reachable, including authorization failures', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 401 }))

    await expect(probeChatConnectivity({
      fetcher: fetcher as typeof fetch,
      podBaseUrl: 'http://localhost:5737/alice/',
    })).resolves.toBe(true)
    expect(fetcher).toHaveBeenCalledWith('http://localhost:5737/alice/profile/card', expect.objectContaining({
      method: 'HEAD',
      cache: 'no-store',
    }))
  })

  it('reports an unreachable Pod when the transport fails', async () => {
    const fetcher = vi.fn(async () => { throw new TypeError('Failed to fetch') })

    await expect(probeChatConnectivity({
      fetcher: fetcher as typeof fetch,
      podBaseUrl: 'http://localhost:5737/alice/',
    })).resolves.toBe(false)
  })

  it('does not claim connectivity before a Pod is selected', async () => {
    const fetcher = vi.fn()

    await expect(probeChatConnectivity({
      fetcher: fetcher as typeof fetch,
      podBaseUrl: null,
    })).resolves.toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
