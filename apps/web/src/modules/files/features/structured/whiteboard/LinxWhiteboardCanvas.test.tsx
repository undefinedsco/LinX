import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCardDialog } from '@/lib/card-dialog'
import type { WhiteboardCanvas } from '../../../domain/structured/structured-whiteboard-canvas'
import type { StructuredWhiteboardViewModel } from '../structured-whiteboard-view-model'
import { LinxWhiteboardCanvas, type WhiteboardCanvasState } from './LinxWhiteboardCanvas'

vi.mock('../../../data/queries', () => ({
  useFilesPodSearchEntries: () => ({ data: [{ uri: 'https://pod.example/docs/plan.md', name: 'plan.md', kind: 'file' }] }),
}))

const POD = 'https://pod.example/'
const DOC = `${POD}data/people.ttl`

beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  vi.stubGlobal('ResizeObserver', RO)
  class DM { m22 = 1; constructor(_?: string) {} }
  vi.stubGlobal('DOMMatrixReadOnly', DM)
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: { configurable: true, get() { return 600 } },
    offsetWidth: { configurable: true, get() { return 900 } },
  })
  ;(SVGElement.prototype as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 })
})

const model = { relations: [], availableRows: [], nodes: [] } as unknown as StructuredWhiteboardViewModel
const cards = [
  { subject: '#a', title: '维护成本', className: null, summary: '小团队不为一次活动承担长期维护负担。', tags: [] },
  { subject: '#b', title: '场地与押金', className: null, summary: '', tags: [] },
]

function makeState(canvas: WhiteboardCanvas, overrides: Partial<WhiteboardCanvasState> = {}) {
  const state = {
    canvas,
    updateCanvas: vi.fn(),
    status: 'saved',
    conflict: null,
    takeLatest: vi.fn(),
    keepMine: vi.fn(),
    podRootUri: POD,
    ...overrides,
  } as unknown as WhiteboardCanvasState
  return state
}

const board: WhiteboardCanvas = {
  nodes: [
    { id: 's1', type: 'group', x: 0, y: 0, width: 500, height: 300, label: '支持', color: '#F0D98C' },
    { id: 'c1', type: 'file', file: 'data/people.ttl', subpath: '#a', x: 20, y: 40, width: 240, height: 140 },
    { id: 'c2', type: 'file', file: 'data/people.ttl', subpath: '#gone', x: 300, y: 40, width: 240, height: 140 },
  ],
  edges: [],
}

describe('LinxWhiteboardCanvas', () => {
  beforeEach(() => useCardDialog.setState({ request: null }))

  it('shows card bodies, section pills and a deleted-card state', () => {
    render(<LinxWhiteboardCanvas documentUri={DOC} model={model} cards={cards} canvasState={makeState(board)} />)
    expect(screen.getByText('维护成本')).toBeTruthy()
    expect(screen.getByText('小团队不为一次活动承担长期维护负担。')).toBeTruthy()
    expect(screen.getByText('支持')).toBeTruthy()
    expect(screen.getByText('这张卡片已删除')).toBeTruthy()
  })

  it('opens the card dialog with Space on the selected card', async () => {
    const { container } = render(<LinxWhiteboardCanvas documentUri={DOC} model={model} cards={cards} canvasState={makeState(board)} />)
    const card = container.querySelector('[data-id="c1"]') as HTMLElement
    fireEvent.click(card)
    const wrapper = container.querySelector('[data-whiteboard-canvas-scroll]') as HTMLElement
    fireEvent.keyDown(wrapper, { key: ' ' })
    await waitFor(() => expect(useCardDialog.getState().request).toMatchObject({
      uri: `${DOC}#a`,
      from: 'whiteboard',
    }))
    expect(useCardDialog.getState().request?.siblings).toEqual([`${DOC}#a`])
  })

  it('offers the library with an empty-board hint and adds a card from it', () => {
    const state = makeState({ nodes: [], edges: [] })
    render(<LinxWhiteboardCanvas documentUri={DOC} model={model} cards={cards} canvasState={state} />)
    expect(screen.getByText('新白板')).toBeTruthy()
    fireEvent.click(screen.getByText('维护成本'))
    expect(state.updateCanvas).toHaveBeenCalledTimes(1)
    const next = (state.updateCanvas as ReturnType<typeof vi.fn>).mock.calls[0][0]({ nodes: [], edges: [] }) as WhiteboardCanvas
    expect(next.nodes[0]).toMatchObject({ type: 'file', file: 'data/people.ttl', subpath: '#a' })
  })

  it('lists Pod files in the library files tab', () => {
    render(<LinxWhiteboardCanvas documentUri={DOC} model={model} cards={cards} canvasState={makeState({ nodes: [], edges: [] })} />)
    fireEvent.click(screen.getByRole('button', { name: '文件' }))
    expect(screen.getByText('plan.md')).toBeTruthy()
  })

  it('explains the offline and conflict states', () => {
    const { rerender } = render(<LinxWhiteboardCanvas documentUri={DOC} model={model} cards={cards} canvasState={makeState(board, { status: 'offline' })} />)
    expect(screen.getByText('没有网络，白板的改动会在恢复后保存')).toBeTruthy()
    const takeLatest = vi.fn()
    rerender(<LinxWhiteboardCanvas documentUri={DOC} model={model} cards={cards} canvasState={makeState(board, {
      status: 'conflict', takeLatest, conflict: { remote: board, etag: null, moved: 2, otherChanges: false },
    })} />)
    expect(screen.getByText('另一台设备刚移动了 2 张卡片')).toBeTruthy()
    act(() => { fireEvent.click(screen.getByText('用最新的')) })
    expect(takeLatest).toHaveBeenCalled()
  })

  it('renders a minimap with zoom controls', () => {
    const state = makeState(board)
    const { container } = render(<LinxWhiteboardCanvas documentUri={DOC} model={model} cards={cards} canvasState={state} />)
    expect(container.querySelector('.react-flow__minimap')).toBeTruthy()
    expect(container.querySelector('.react-flow__controls')).toBeTruthy()
  })
})
