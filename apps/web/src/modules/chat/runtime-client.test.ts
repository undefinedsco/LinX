import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createRuntimeSession,
  resolveLocalContainer,
  subscribeRuntimeSessionEvents,
} from './runtime-client'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }
}

describe('runtime client', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    FakeEventSource.instances = []
    delete (window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__
  })

  it('posts runtime session requests to the service without duplicating workspace normalization', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'runtime-1',
      threadId: 'thread-pod',
      container: 'https://node-0000.undefineds.co/.data/workspaces/thread-pod/',
      workspaceKind: 'pod-container',
      title: 'Pod',
      runnerType: 'xpod-pty',
      tool: 'codex',
      status: 'idle',
      tokenUsage: 0,
      createdAt: '2026-06-13T00:00:00.000Z',
      updatedAt: '2026-06-13T00:00:00.000Z',
      lastActivityAt: '2026-06-13T00:00:00.000Z',
      baseRef: 'HEAD',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createRuntimeSession({
      threadId: 'thread-pod',
      title: 'Pod',
      container: ' https://node-0000.undefineds.co/.data/workspaces/thread-pod/ ',
      workspaceKind: 'pod-container',
    })).resolves.toMatchObject({
      id: 'runtime-1',
      workspaceKind: 'pod-container',
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/runtime/threads', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        threadId: 'thread-pod',
        title: 'Pod',
        container: ' https://node-0000.undefineds.co/.data/workspaces/thread-pod/ ',
        workspaceKind: 'pod-container',
      }),
    }))
  })

  it('builds device-scoped local containers from service deviceId, not SP nodeId', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      nodeId: 'node-123',
      deviceId: 'device-abc',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    ;(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__ = true

    await expect(resolveLocalContainer('/repo/linx')).resolves.toBe('linx://device-abc/repo/linx')

    expect(fetchMock).toHaveBeenCalledWith('/api/setup/config', expect.any(Object))
  })

  it('reconnects runtime event streams after transport failures and stops after cleanup', () => {
    vi.useFakeTimers()
    const onEvent = vi.fn()
    const onConnectionStateChange = vi.fn()
    const unsubscribe = subscribeRuntimeSessionEvents('runtime-1', onEvent, {
      eventSourceFactory: (url) => new FakeEventSource(url) as unknown as EventSource,
      onConnectionStateChange,
      retryBaseMs: 10,
      retryMaxMs: 20,
    })

    expect(FakeEventSource.instances).toHaveLength(1)
    expect(FakeEventSource.instances[0]?.url).toBe('/api/runtime/threads/runtime-1/events')
    FakeEventSource.instances[0]?.onopen?.()
    expect(onConnectionStateChange).toHaveBeenLastCalledWith('connected')

    FakeEventSource.instances[0]?.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({ type: 'assistant_delta', ts: 1, threadId: 'runtime-1', text: 'hello' }),
    }))
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'assistant_delta', text: 'hello' }))

    FakeEventSource.instances[0]?.onerror?.()
    expect(FakeEventSource.instances[0]?.close).toHaveBeenCalledTimes(1)
    expect(onConnectionStateChange).toHaveBeenLastCalledWith('reconnecting')
    vi.advanceTimersByTime(10)
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(FakeEventSource.instances[1]?.url).toBe('/api/runtime/threads/runtime-1/events?after=1')

    FakeEventSource.instances[1]?.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({ type: 'assistant_delta', ts: 1, threadId: 'runtime-1', text: 'hello' }),
    }))
    FakeEventSource.instances[1]?.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify({ type: 'assistant_done', ts: 2, threadId: 'runtime-1', text: 'hello' }),
    }))
    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(onEvent).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'assistant_done', ts: 2 }))

    unsubscribe()
    expect(FakeEventSource.instances[1]?.close).toHaveBeenCalledTimes(1)
    FakeEventSource.instances[1]?.onerror?.()
    vi.runAllTimers()
    expect(FakeEventSource.instances).toHaveLength(2)
  })
})
