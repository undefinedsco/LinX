import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRuntimeSession } from './runtime-client'

describe('runtime client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts runtime session requests to the service without duplicating workspace normalization', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'runtime-1',
      threadId: 'thread-pod',
      workspaceUri: 'https://node-0000.undefineds.co/.data/workspaces/thread-pod/',
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
      workspaceUri: ' https://node-0000.undefineds.co/.data/workspaces/thread-pod/ ',
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
        workspaceUri: ' https://node-0000.undefineds.co/.data/workspaces/thread-pod/ ',
        workspaceKind: 'pod-container',
      }),
    }))
  })
})
