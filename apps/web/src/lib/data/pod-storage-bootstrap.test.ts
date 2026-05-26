import { describe, expect, it, vi } from 'vitest'
import { initializeLinxPodStorage } from './pod-storage-bootstrap'

describe('initializeLinxPodStorage', () => {
  it('connects and creates LinX storage containers before callers use the db', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 404 })
      }

      return new Response(null, { status: 201 })
    })
    const connect = vi.fn(async () => undefined)
    const init = vi.fn(async () => undefined)
    const db = {
      connect,
      init,
      getDialect: () => ({
        getPodUrl: () => 'https://node.example/alice/',
        getAuthenticatedFetch: () => fetchMock,
      }),
    }

    await initializeLinxPodStorage(db as any)

    expect(connect.mock.invocationCallOrder[0]).toBeLessThan(init.mock.invocationCallOrder[0])
    expect(init).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('https://node.example/alice/.data/', { method: 'HEAD' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://node.example/alice/.data/chat/',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://node.example/alice/.data/agents/',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('falls back to PUT when HEAD is not authoritative', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 401 })
      }

      return new Response(null, { status: 201 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node.example/alice/',
        getAuthenticatedFetch: () => fetchMock,
      }),
    }

    await initializeLinxPodStorage(db as any)

    expect(fetchMock).toHaveBeenCalledWith('https://node.example/alice/.data/', { method: 'HEAD' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://node.example/alice/.data/',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('creates LinX containers under the selected SP Pod URL even when the WebID belongs to Cloud', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      expect(url.startsWith('https://id.undefineds.co/')).toBe(false)
      expect(url.startsWith('https://node-0000.undefineds.co/alice/')).toBe(true)

      if (init?.method === 'HEAD') {
        return new Response(null, { status: 404 })
      }
      return new Response(null, { status: 201 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
        getAuthenticatedFetch: () => fetchMock,
      }),
      getSession: () => ({
        info: {
          webId: 'https://id.undefineds.co/alice/profile/card#me',
        },
      }),
    }

    await initializeLinxPodStorage(db as any)

    expect(fetchMock).toHaveBeenCalledWith('https://node-0000.undefineds.co/alice/.data/', { method: 'HEAD' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://node-0000.undefineds.co/alice/.data/chat/',
      expect.objectContaining({ method: 'PUT' }),
    )
  })
})
