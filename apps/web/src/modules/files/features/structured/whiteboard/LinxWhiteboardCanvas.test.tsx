import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StructuredWhiteboardViewModel } from '../structured-whiteboard-view-model'
import { createLinxSubjectShapeId } from './linx-whiteboard-adapter'
import { LinxWhiteboardCanvas } from './LinxWhiteboardCanvas'

const createShapes = vi.fn()
const updateShapes = vi.fn()
const deleteShapes = vi.fn()
const select = vi.fn()
const zoomToSelection = vi.fn()
const duplicateShapes = vi.fn()
const undo = vi.fn()
const screenToPage = vi.fn(({ x, y }) => ({ x: x - 10, y: y - 20 }))

vi.mock('tldraw', () => ({
  Tldraw: ({ children, components, shapeUtils, onMount }: any) => {
    onMount?.({
      getCurrentPageShapes: () => [],
      updateShapes,
      createShapes,
      deleteShapes,
      duplicateShapes,
      getSelectedShapeIds: () => ['shape:a'],
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      resetZoom: vi.fn(),
      select,
      zoomToSelection,
      undo,
      screenToPage,
      store: { listen: vi.fn(() => vi.fn()) },
    })
    return (
      <div
        data-testid="mock-tldraw"
        data-shape-utils={shapeUtils?.map((shapeUtil: any) => shapeUtil.type).join(',')}
      >
        {components?.InFrontOfTheCanvas?.()}
        {children}
      </div>
    )
  },
  HTMLContainer: ({ children }: any) => <div data-testid="html-container">{children}</div>,
  Rectangle2d: class {
    constructor(public props: any) {}
  },
  resizeBox: vi.fn(),
  ShapeUtil: class {},
  T: {
    string: { optional: () => ({}) },
    literalEnum: (...values: string[]) => ({ values }),
    number: {},
    boolean: {},
    optional: (validator: any) => validator,
    object: (shape: any) => shape,
    arrayOf: (validator: any) => validator,
  },
}))

const model: StructuredWhiteboardViewModel = {
  availableRows: [{ subject: '#b', cells: [] }],
  canClearSubjects: true,
  canCreateVisualRelation: false,
  cardCountLabel: '白板中 1 张卡片',
  chrome: {
    toolsButtonAriaLabel: '白板工具',
    toolsButtonLabel: '白板工具',
    addSubjectButtonAriaLabel: '添加 subject 到白板',
    addSubjectButtonLabel: 'Subject',
    noAvailableSubjectOptionsLabel: '可见 subject 已全部加入白板',
    addRelationButtonAriaLabel: '添加视觉关系',
    addRelationButtonLabel: '关系',
    clearSubjectsButtonAriaLabel: '清空白板 subject',
    clearSubjectsButtonLabel: '清空',
    emptyCanvasMessage: '添加 subject 后会在白板中显示卡片。',
  },
  hasAvailableSubjectOptions: true,
  isCanvasEmpty: false,
  nodes: [{
    subject: '#a',
    title: 'Alpha',
    className: 'Card',
    summary: 'First card',
    tags: [],
    x: 120,
    y: 88,
    openAriaLabel: '打开 subject #a',
    removeAriaLabel: '从白板移除 #a',
  }],
  relationCountLabel: '0 条关系线',
  relations: [],
  relationSegments: [],
  relationSubjectOptions: ['#a'],
  showRelationCount: false,
}

describe('LinxWhiteboardCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mounts a full-bleed tldraw surface with a LinX subject shape util and toolbar', () => {
    render(
      <LinxWhiteboardCanvas
        model={model}
        onAddSubject={vi.fn()}
        onClearSubjects={vi.fn()}
        onOpenRelationEditor={vi.fn()}
        onOpenSubject={vi.fn()}
        onNodePositionChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('mock-tldraw')).toHaveAttribute('data-shape-utils', 'linx-subject,linx-group')
    expect(screen.queryByText('白板中 1 张卡片')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加 subject 到白板' })).toHaveAttribute(
      'title',
      'Subject · 白板中 1 张卡片',
    )
    expect(screen.queryByRole('searchbox', { name: '搜索白板 subject' })).not.toBeInTheDocument()
    expect(screen.getByTestId('mock-tldraw').closest('[data-whiteboard-canvas-scroll="true"]')).toHaveClass(
      'h-[calc(100vh-12rem)]',
      'min-h-[480px]',
    )
    expect(createShapes).toHaveBeenCalledWith([
      expect.objectContaining({
        id: createLinxSubjectShapeId('#a'),
        type: 'linx-subject',
      }),
    ])
  })

  it('routes search to tldraw selection and quick add to Files callbacks', () => {
    const onAddSubject = vi.fn()

    render(
      <LinxWhiteboardCanvas
        model={model}
        onAddSubject={onAddSubject}
        onClearSubjects={vi.fn()}
        onOpenRelationEditor={vi.fn()}
        onOpenSubject={vi.fn()}
        onNodePositionChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '搜索白板 subject' }))
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索白板 subject' }), {
      target: { value: 'alpha' },
    })
    fireEvent.click(screen.getByRole('button', { name: '定位 Alpha' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: '添加 subject 到白板' }))
    fireEvent.click(screen.getByRole('button', { name: '添加 #b' }))

    expect(onAddSubject).toHaveBeenCalledWith('#b')
    expect(select).toHaveBeenCalledWith(createLinxSubjectShapeId('#a'))
    expect(zoomToSelection).toHaveBeenCalled()
    expect(createLinxSubjectShapeId('#a')).toMatch(/^shape:linx-subject-[a-z0-9]+$/)
  })

  it('dismisses toolbar flyouts when the canvas is clicked', () => {
    render(
      <LinxWhiteboardCanvas
        model={model}
        onAddSubject={vi.fn()}
        onClearSubjects={vi.fn()}
        onOpenRelationEditor={vi.fn()}
        onOpenSubject={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '搜索白板 subject' }))
    expect(screen.getByRole('searchbox', { name: '搜索白板 subject' })).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByTestId('mock-tldraw'))

    expect(screen.queryByRole('searchbox', { name: '搜索白板 subject' })).not.toBeInTheDocument()
  })

  it('opens quick add on empty-canvas double click and places the selected subject at that point', () => {
    const onAddSubject = vi.fn()
    const onNodePositionChange = vi.fn()
    const { container } = render(
      <LinxWhiteboardCanvas
        model={model}
        onAddSubject={onAddSubject}
        onClearSubjects={vi.fn()}
        onOpenRelationEditor={vi.fn()}
        onOpenSubject={vi.fn()}
        onNodePositionChange={onNodePositionChange}
      />,
    )

    fireEvent.doubleClick(container.querySelector('[data-whiteboard-canvas-scroll="true"]')!, {
      clientX: 210,
      clientY: 320,
    })
    expect(screen.getByRole('dialog', { name: '快速添加 Subject' })).toHaveStyle({
      left: '210px',
      top: '320px',
    })
    fireEvent.click(screen.getByRole('button', { name: '添加 #b' }))

    expect(onAddSubject).toHaveBeenCalledWith('#b')
    expect(onNodePositionChange).toHaveBeenCalledWith('#b', { x: 200, y: 300 })
  })

  it('keeps advanced selection actions in a canvas context menu', () => {
    const { container } = render(
      <LinxWhiteboardCanvas
        model={model}
        onAddSubject={vi.fn()}
        onClearSubjects={vi.fn()}
        onOpenRelationEditor={vi.fn()}
        onOpenSubject={vi.fn()}
      />,
    )

    fireEvent.contextMenu(container.querySelector('[data-testid="mock-tldraw"]')!, {
      clientX: 120,
      clientY: 140,
    })

    expect(screen.getByRole('menu', { name: '白板所选内容操作' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '组合' })).toBeDisabled()
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: '复制' }))
    expect(duplicateShapes).toHaveBeenCalledWith(['shape:a'], { x: 24, y: 24 })
    expect(screen.queryByRole('menu', { name: '白板所选内容操作' })).not.toBeInTheDocument()

    fireEvent.contextMenu(container.querySelector('[data-testid="mock-tldraw"]')!, {
      clientX: 120,
      clientY: 140,
    })
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: '撤销' }))
    expect(undo).toHaveBeenCalledTimes(1)
  })
})
