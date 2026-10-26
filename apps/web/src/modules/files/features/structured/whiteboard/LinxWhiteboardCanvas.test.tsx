import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCardDialog } from '@/lib/card-dialog'
import type { WhiteboardCanvas } from '../../../domain/structured/structured-whiteboard-canvas'
import type { StructuredWhiteboardViewModel } from '../structured-whiteboard-view-model'
import { LinxWhiteboardCanvas, type WhiteboardCanvasState } from './LinxWhiteboardCanvas'

const mocks = vi.hoisted(() => ({
  space: { rows: [] as Array<Record<string, unknown>>, boardsByCard: new Map<string, string[]>(), rowByUri: new Map<string, Record<string, unknown>>(), loading: false },
}))

vi.mock('./WhiteboardBodyEditor', () => ({
  default: ({ markdown, title, onCommit }: { markdown: string; title?: string; onCommit: (markdown: string, title?: string) => void }) => (
    <div data-testid="body-editor" data-title={title ?? ''}>
      {markdown}
      <button type="button" onClick={() => onCommit('新正文', title === undefined ? undefined : '新标题')}>保存</button>
    </div>
  ),
}))

vi.mock('../../../data/queries', () => ({
  useWhiteboardSpace: () => mocks.space,
  useFilesPodSearchEntries: () => ({ data: [{ uri: 'https://pod.example/docs/plan.md', name: 'plan.md', kind: 'resource', semanticKind: 'file', mimeType: 'text/markdown' }] }),
  useFilesCurrentPodRootUri: () => 'https://pod.example/',
  useWhiteboardFilePreviews: () => new Map<string, string>(),
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

  it('renders card bodies as formatted markdown, not raw syntax', () => {
    const md = [{ subject: '#a', title: '维护成本', className: null, summary: '**加粗内容** 与 - 列表', tags: [] }]
    const { container } = render(<LinxWhiteboardCanvas documentUri={DOC} model={model} cards={md} canvasState={makeState(board)} />)
    const strong = container.querySelector('[data-whiteboard-card="c1"] strong')
    expect(strong?.textContent).toBe('加粗内容')
    expect(container.textContent).not.toContain('**')
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
    expect(screen.getByText('plan')).toBeTruthy()
  })

  it('lists rows of other tables and says which cards are already on another board', () => {
    mocks.space = {
      rows: [{ uri: `${POD}data/suppliers.ttl#x`, title: '花店', subtitle: 'suppliers', summary: '', className: null }],
      boardsByCard: new Map([[`${DOC}#a`, ['秋季读书会']], [`${POD}data/suppliers.ttl#x`, ['活动采购']]]),
      rowByUri: new Map(),
      loading: false,
    }
    try {
      render(<LinxWhiteboardCanvas documentUri={DOC} model={model} cards={cards} canvasState={makeState({ nodes: [], edges: [] })} />)
      expect(screen.getByText('已在“秋季读书会”白板上')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: '别的表' }))
      expect(screen.getByText('花店')).toBeTruthy()
      expect(screen.getByText('已在“活动采购”白板上')).toBeTruthy()
    } finally {
      mocks.space = { rows: [], boardsByCard: new Map(), rowByUri: new Map(), loading: false }
    }
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

  it('shows a row\'s main properties when it has no body, and the body when it has one', () => {
    const rowFacts = (subject: string) => (subject === '#b' ? [{ label: '状态', value: '进行中' }] : [{ label: '状态', value: '搁置' }])
    const withB: WhiteboardCanvas = {
      nodes: [
        { id: 'c1', type: 'file', file: 'data/people.ttl', subpath: '#a', x: 20, y: 40, width: 240, height: 140 },
        { id: 'c3', type: 'file', file: 'data/people.ttl', subpath: '#b', x: 300, y: 40, width: 240, height: 140 },
      ],
      edges: [],
    }
    render(<LinxWhiteboardCanvas documentUri={DOC} model={model} cards={cards} canvasState={makeState(withB)} rowFacts={rowFacts} />)
    expect(screen.getByText('进行中')).toBeTruthy()
    expect(screen.getByText('状态')).toBeTruthy()
    expect(screen.queryByText('搁置')).toBeNull()
    expect(screen.getByText('小团队不为一次活动承担长期维护负担。')).toBeTruthy()
  })

  it('edits a row card in place on double click: title and body go through the row writers', async () => {
    const onCommitCardBody = vi.fn()
    const onCommitCardTitle = vi.fn()
    const { container } = render(
      <LinxWhiteboardCanvas
        documentUri={DOC}
        model={model}
        cards={cards}
        canvasState={makeState(board)}
        onCommitCardBody={onCommitCardBody}
        onCommitCardTitle={onCommitCardTitle}
      />,
    )
    fireEvent.doubleClick(container.querySelector('[data-whiteboard-card="c1"]') as HTMLElement)
    const editor = await screen.findByTestId('body-editor')
    expect(editor.getAttribute('data-title')).toBe('维护成本')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onCommitCardTitle).toHaveBeenCalledWith('#a', '新标题')
    expect(onCommitCardBody).toHaveBeenCalledWith('#a', '新正文')
    await waitFor(() => expect(screen.queryByTestId('body-editor')).toBeNull())
  })

  it('edits a note card in place and keeps the text in the board', async () => {
    const note: WhiteboardCanvas = { nodes: [{ id: 't1', type: 'text', text: '旧内容', x: 10, y: 10, width: 220, height: 100 }], edges: [] }
    const state = makeState(note)
    const { container } = render(<LinxWhiteboardCanvas documentUri={DOC} model={model} cards={cards} canvasState={state} />)
    fireEvent.doubleClick(container.querySelector('[data-whiteboard-card="t1"]') as HTMLElement)
    expect((await screen.findByTestId('body-editor')).getAttribute('data-title')).toBe('')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    const next = (state.updateCanvas as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0](note) as WhiteboardCanvas
    expect(next.nodes[0]).toMatchObject({ id: 't1', text: '新正文' })
  })

  it('does not edit a row in place when the table cannot be written', () => {
    const { container } = render(<LinxWhiteboardCanvas documentUri={DOC} model={model} cards={cards} canvasState={makeState(board)} />)
    fireEvent.doubleClick(container.querySelector('[data-whiteboard-card="c1"]') as HTMLElement)
    expect(screen.queryByTestId('body-editor')).toBeNull()
  })

  it('shows resize handles on the selected card only', () => {
    const { container } = render(<LinxWhiteboardCanvas documentUri={DOC} model={model} cards={cards} canvasState={makeState(board)} />)
    expect(container.querySelector('[data-id="c1"] .react-flow__resize-control')).toBeNull()
    fireEvent.click(container.querySelector('[data-id="c1"]') as HTMLElement)
    expect(container.querySelectorAll('[data-id="c1"] .react-flow__resize-control.handle').length).toBe(4)
  })
})
