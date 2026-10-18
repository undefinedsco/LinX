import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  parseWhiteboardCanvas,
  serializeWhiteboardCanvas,
  type WhiteboardCanvas,
} from '../../../domain/structured/structured-whiteboard-canvas'
import {
  WhiteboardCanvasRequestError,
  type WhiteboardCanvasPodAccess,
} from '../../../data/queries/whiteboard-canvas-queries'
import { useWhiteboardCanvasState } from './useWhiteboardCanvasState'

vi.mock('../../../data/queries/whiteboard-canvas-queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../data/queries/whiteboard-canvas-queries')>()
  return { ...actual, useWhiteboardCanvasPodAccess: () => ({ podRootUri: null, ready: false, read: vi.fn(), write: vi.fn() }) }
})

const POD = 'https://pod.example/'
const DOC = `${POD}data/people.ttl`
const legacy = { selectedSubjects: ['#a'], positions: { '#a': { x: 10, y: 20 } } }

function makeAccess(overrides: Partial<WhiteboardCanvasPodAccess> = {}): WhiteboardCanvasPodAccess {
  return {
    podRootUri: POD,
    ready: true,
    read: vi.fn(async (uri: string) => ({ uri, state: 'missing', content: null, etag: null }) as const),
    write: vi.fn(async () => ({ etag: '"1"' })),
    ...overrides,
  }
}

const card = (id: string, x: number): WhiteboardCanvas['nodes'][number] => ({
  id, type: 'file', file: `data/${id}.ttl`, x, y: 0, width: 240, height: 140,
})

describe('useWhiteboardCanvasState', () => {
  it('migrates the earlier layout once when no board exists yet', async () => {
    const access = makeAccess()
    const { result } = renderHook(() => useWhiteboardCanvasState({ documentUri: DOC, legacy, access, saveDelayMs: 5 }))
    await waitFor(() => expect(access.write).toHaveBeenCalledTimes(1))
    expect(result.current.canvas.nodes).toHaveLength(1)
    const call = vi.mocked(access.write).mock.calls[0][0]
    expect(call.expect).toEqual({ kind: 'absent' })
    expect(parseWhiteboardCanvas(call.content)?.canvas.nodes[0]).toMatchObject({ type: 'file', x: 10, y: 20 })
  })

  it('reads an existing board and saves edits against its etag', async () => {
    const remote: WhiteboardCanvas = { nodes: [card('c1', 0)], edges: [] }
    const access = makeAccess({
      read: vi.fn(async (uri: string) => ({ uri, state: 'exists', content: serializeWhiteboardCanvas(remote, { viewOf: DOC }), etag: '"7"' }) as const),
    })
    const { result } = renderHook(() => useWhiteboardCanvasState({ documentUri: DOC, legacy, access, saveDelayMs: 5 }))
    await waitFor(() => expect(result.current.status).toBe('saved'))
    expect(access.write).not.toHaveBeenCalled()
    act(() => result.current.updateCanvas((c) => ({ ...c, nodes: [{ ...c.nodes[0], x: 99 }] })))
    await waitFor(() => expect(access.write).toHaveBeenCalledTimes(1))
    expect(vi.mocked(access.write).mock.calls[0][0].expect).toEqual({ kind: 'etag', etag: '"7"' })
  })

  it('reports offline and keeps the edit', async () => {
    const access = makeAccess({
      read: vi.fn(async (uri: string) => ({ uri, state: 'exists', content: serializeWhiteboardCanvas({ nodes: [card('c1', 0)], edges: [] }, { viewOf: DOC }), etag: '"1"' }) as const),
      write: vi.fn(async () => { throw new WhiteboardCanvasRequestError('offline', 'x') }),
    })
    const { result } = renderHook(() => useWhiteboardCanvasState({ documentUri: DOC, legacy, access, saveDelayMs: 5 }))
    await waitFor(() => expect(result.current.status).toBe('saved'))
    act(() => result.current.updateCanvas((c) => ({ ...c, nodes: [{ ...c.nodes[0], x: 5 }] })))
    await waitFor(() => expect(result.current.status).toBe('offline'))
    expect(result.current.canvas.nodes[0].x).toBe(5)
  })

  it('describes a conflict and lets the person take the latest', async () => {
    const mine = { nodes: [card('c1', 0)], edges: [] }
    const theirs = { nodes: [card('c1', 300)], edges: [] }
    let reads = 0
    const access = makeAccess({
      read: vi.fn(async (uri: string) => {
        reads += 1
        const canvas = reads === 1 ? mine : theirs
        return { uri, state: 'exists', content: serializeWhiteboardCanvas(canvas, { viewOf: DOC }), etag: reads === 1 ? '"1"' : '"2"' } as const
      }),
      write: vi.fn(async () => { throw new WhiteboardCanvasRequestError('conflict', 'x', 412) }),
    })
    const { result } = renderHook(() => useWhiteboardCanvasState({ documentUri: DOC, legacy, access, saveDelayMs: 5 }))
    await waitFor(() => expect(result.current.status).toBe('saved'))
    act(() => result.current.updateCanvas((c) => ({ ...c, nodes: [{ ...c.nodes[0], y: 50 }] })))
    await waitFor(() => expect(result.current.status).toBe('conflict'))
    expect(result.current.conflict?.moved).toBe(1)
    act(() => result.current.takeLatest())
    expect(result.current.canvas.nodes[0].x).toBe(300)
    expect(result.current.status).toBe('saved')
  })
})
