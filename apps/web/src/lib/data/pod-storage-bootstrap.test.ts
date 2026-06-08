import { describe, expect, it, vi } from 'vitest'
import { initializeLinxPodStorage } from './pod-storage-bootstrap'

describe('initializeLinxPodStorage', () => {
  it('connects and registers LinX schema resources before callers use the db', async () => {
    const fetchMock = vi.fn()
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
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports connect and schema init progress without probing Pod containers', async () => {
    const onEvent = vi.fn()
    const fetchMock = vi.fn()
    const db = {
      connect: vi.fn(async () => undefined),
      init: vi.fn(async () => undefined),
      getDialect: () => ({
        getPodUrl: () => 'https://node.example/alice/',
        getAuthenticatedFetch: () => fetchMock,
      }),
    }

    await initializeLinxPodStorage(db as any, { onEvent })

    expect(onEvent).toHaveBeenNthCalledWith(1, { stage: 'connect:start' })
    expect(onEvent).toHaveBeenNthCalledWith(2, { stage: 'connect:done' })
    expect(onEvent).toHaveBeenNthCalledWith(3, { stage: 'schema:init:start' })
    expect(onEvent).toHaveBeenNthCalledWith(4, { stage: 'schema:init:done' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not precreate containers for a Local SP Pod even when the WebID belongs to Cloud', async () => {
    const fetchMock = vi.fn()
    const connect = vi.fn(async () => undefined)
    const init = vi.fn(async () => undefined)
    const db = {
      connect,
      init,
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

    expect(connect).toHaveBeenCalledTimes(1)
    expect(init).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
