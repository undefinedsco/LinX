import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { StructuredWhiteboardViewModel } from '../structured-whiteboard-view-model'
import { syncLinxWhiteboardSnapshot, useLinxWhiteboardController } from './useLinxWhiteboardController'

const emptyModel: StructuredWhiteboardViewModel = {
  availableRows: [],
  canClearSubjects: false,
  canCreateVisualRelation: false,
  cardCountLabel: '白板中 0 张卡片',
  chrome: {
    toolsButtonAriaLabel: '白板工具',
    toolsButtonLabel: '白板工具',
    addSubjectButtonAriaLabel: '添加 subject 到白板',
    addSubjectButtonLabel: 'Subject',
    noAvailableSubjectOptionsLabel: '无',
    addRelationButtonAriaLabel: '添加视觉关系',
    addRelationButtonLabel: '关系',
    clearSubjectsButtonAriaLabel: '清空',
    clearSubjectsButtonLabel: '清空',
    emptyCanvasMessage: '空',
  },
  hasAvailableSubjectOptions: false,
  isCanvasEmpty: true,
  nodes: [],
  relationCountLabel: '0 条关系线',
  relations: [],
  relationSegments: [],
  relationSubjectOptions: [],
  showRelationCount: false,
}

describe('syncLinxWhiteboardSnapshot', () => {
  it('creates and removes relation arrows together with subject shapes', () => {
    const createShapes = vi.fn()
    const updateShapes = vi.fn()
    const deleteShapes = vi.fn()
    const editor = {
      createShapes,
      updateShapes,
      deleteShapes,
      getCurrentPageShapes: () => [
        { id: 'shape:stale-arrow', type: 'arrow', meta: { linxRelationId: 'stale' } },
      ],
    }

    syncLinxWhiteboardSnapshot(editor, {
      groupRecords: [],
      subjectShapes: [{
        id: 'shape:subject-a',
        type: 'linx-subject',
        x: 10,
        y: 20,
        props: {
          resourceUri: '#a',
          title: 'A',
          summary: '',
          pending: false,
          facts: [],
          w: 288,
          h: 160,
        },
      }],
      arrowRecords: [{
        id: 'shape:relation-a-b',
        type: 'arrow',
        x: 154,
        y: 100,
        props: { start: { x: 0, y: 0 }, end: { x: 120, y: 0 } },
        meta: {
          linxRelationId: 'a-b',
          linxRelationSource: 'visual',
          fromResourceUri: '#a',
          toResourceUri: '#b',
          predicate: 'related',
        },
      }],
    })

    expect(createShapes).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'shape:subject-a', type: 'linx-subject' }),
      expect.objectContaining({ id: 'shape:relation-a-b', type: 'arrow' }),
    ]))
    expect(deleteShapes).toHaveBeenCalledWith(['shape:stale-arrow'])
  })

  it('restores the camera and persists camera plus subject geometry', () => {
    let listener: (() => void) | undefined
    const onSnapshotChange = vi.fn()
    const onNodePositionChange = vi.fn()
    const setCamera = vi.fn()
    const setCurrentTool = vi.fn()
    const createShapes = vi.fn()
    const updateShapes = vi.fn()
    const reparentShapes = vi.fn()
    const getCurrentPageShapes = vi.fn(() => [{
      id: 'shape:a',
      type: 'linx-subject',
      x: 42.4,
      y: 88.7,
      parentId: 'shape:group-a',
      props: { resourceUri: '#a', resourceKind: 'file', w: 300, h: 180 },
    }, {
      id: 'shape:group-a',
      type: 'linx-group',
      x: 0,
      y: 0,
      props: { title: 'Sprint', color: 'purple', w: 640, h: 420 },
    }])
    const { result, unmount } = renderHook(() => useLinxWhiteboardController({
      model: emptyModel,
      snapshot: {
        version: 1,
        camera: { x: 12, y: 24, z: 1.5 },
        nodes: [],
        groups: [],
        visualRelations: [],
      },
      onNodePositionChange,
      onSnapshotChange,
    }))

    act(() => {
      result.current.handleMount({
        createShapes,
        updateShapes,
        deleteShapes: vi.fn(),
        getCurrentPageShapes,
        getCamera: () => ({ x: 30.2, y: 50.8, z: 2 }),
        getSelectedShapeIds: () => ['shape:a', 'shape:b'],
        getShapePageBounds: (id: string) => id === 'shape:a'
          ? { x: 342, y: 289, w: 300, h: 180 }
          : { x: 390, y: 89, w: 300, h: 180 },
        reparentShapes,
        setCamera,
        setCurrentTool,
        store: { listen: (next: () => void) => { listener = next; return vi.fn() } },
      })
    })
    act(() => listener?.())

    expect(setCamera).toHaveBeenCalledWith({ x: 12, y: 24, z: 1.5 })
    act(() => {
      result.current.selectTool()
      result.current.handTool()
      result.current.groupSelection()
    })
    expect(setCurrentTool).toHaveBeenNthCalledWith(1, 'select')
    expect(setCurrentTool).toHaveBeenNthCalledWith(2, 'hand')
    expect(createShapes).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'linx-group',
        props: expect.objectContaining({ title: 'Section', color: 'blue' }),
      }),
    ])
    expect(reparentShapes).toHaveBeenCalledWith(
      ['shape:a', 'shape:b'],
      expect.stringMatching(/^shape:linx-group-/),
    )
    expect(onSnapshotChange).toHaveBeenCalledWith(expect.objectContaining({
      camera: { x: 30, y: 51, z: 2 },
      nodes: expect.arrayContaining([
        expect.objectContaining({ resourceUri: '#a', x: 42, y: 89, w: 300, h: 180, groupId: 'shape:group-a', kind: 'file' }),
        expect.objectContaining({ resourceUri: 'shape:group-a', x: 0, y: 0, w: 640, h: 420, kind: 'group' }),
      ]),
      groups: [expect.objectContaining({ id: 'shape:group-a' })],
    }))
    expect(onNodePositionChange).not.toHaveBeenCalled()
    unmount()
  })

  it('routes low-chrome selection commands through the tldraw editor', () => {
    const selectedIds = ['shape:a', 'shape:b', 'shape:c']
    const duplicateShapes = vi.fn()
    const deleteShapes = vi.fn()
    const bringToFront = vi.fn()
    const sendToBack = vi.fn()
    const alignShapes = vi.fn()
    const distributeShapes = vi.fn()
    const undo = vi.fn()
    const redo = vi.fn()
    const { result } = renderHook(() => useLinxWhiteboardController({ model: emptyModel }))

    act(() => result.current.handleMount({
      createShapes: vi.fn(),
      updateShapes: vi.fn(),
      deleteShapes,
      getCurrentPageShapes: () => [],
      getSelectedShapeIds: () => selectedIds,
      duplicateShapes,
      bringToFront,
      sendToBack,
      alignShapes,
      distributeShapes,
      undo,
      redo,
    }))

    act(() => {
      result.current.copySelection()
      result.current.pasteSelection()
      result.current.duplicateSelection()
      result.current.bringSelectionToFront()
      result.current.sendSelectionToBack()
      result.current.alignSelection('left')
      result.current.distributeSelection('horizontal')
      result.current.undo()
      result.current.redo()
      result.current.deleteSelection()
    })

    expect(result.current.selectedShapeCount()).toBe(3)
    expect(duplicateShapes).toHaveBeenNthCalledWith(1, selectedIds, { x: 24, y: 24 })
    expect(duplicateShapes).toHaveBeenNthCalledWith(2, selectedIds, { x: 24, y: 24 })
    expect(bringToFront).toHaveBeenCalledWith(selectedIds)
    expect(sendToBack).toHaveBeenCalledWith(selectedIds)
    expect(alignShapes).toHaveBeenCalledWith(selectedIds, 'left')
    expect(distributeShapes).toHaveBeenCalledWith(selectedIds, 'horizontal')
    expect(undo).toHaveBeenCalledTimes(1)
    expect(redo).toHaveBeenCalledTimes(1)
    expect(deleteShapes).toHaveBeenCalledWith(selectedIds)
  })

  it('reports unchanged subject geometry only once across repeated store notifications', () => {
    let listener: (() => void) | undefined
    const onNodePositionChange = vi.fn()
    const { result } = renderHook(() => useLinxWhiteboardController({
      model: emptyModel,
      onNodePositionChange,
    }))

    act(() => result.current.handleMount({
      createShapes: vi.fn(),
      updateShapes: vi.fn(),
      deleteShapes: vi.fn(),
      getCurrentPageShapes: () => [{
        id: 'shape:a',
        type: 'linx-subject',
        x: 42,
        y: 89,
        props: { resourceUri: '#a', w: 300, h: 180 },
      }],
      getShapePageBounds: () => ({ x: 42, y: 89, w: 300, h: 180 }),
      store: { listen: (next: () => void) => { listener = next; return vi.fn() } },
    }))

    act(() => {
      listener?.()
      listener?.()
    })

    expect(onNodePositionChange).toHaveBeenCalledTimes(1)
    expect(onNodePositionChange).toHaveBeenCalledWith('#a', { x: 42, y: 89 })
  })

  it('focuses a copied visual instance when the original deterministic shape is absent', () => {
    const select = vi.fn()
    const zoomToSelection = vi.fn()
    const { result } = renderHook(() => useLinxWhiteboardController({ model: emptyModel }))

    act(() => result.current.handleMount({
      createShapes: vi.fn(),
      updateShapes: vi.fn(),
      deleteShapes: vi.fn(),
      getCurrentPageShapes: () => [{
        id: 'shape:copied-a',
        type: 'linx-subject',
        props: { resourceUri: '#a' },
      }],
      select,
      zoomToSelection,
    }))
    act(() => result.current.focusSubject('#a'))

    expect(select).toHaveBeenCalledWith('shape:copied-a')
    expect(zoomToSelection).toHaveBeenCalledTimes(1)
  })

  it('routes editor deletion to removing a subject from the whiteboard projection', () => {
    let listener: (() => void) | undefined
    let shapes: unknown[] = [{
      id: 'shape:a',
      type: 'linx-subject',
      x: 10,
      y: 20,
      props: { resourceUri: '#a', w: 288, h: 160 },
    }]
    const onRemoveSubject = vi.fn()
    const model: StructuredWhiteboardViewModel = {
      ...emptyModel,
      isCanvasEmpty: false,
      nodes: [{
        subject: '#a',
        title: 'A',
        className: 'Card',
        summary: '',
        tags: [],
        x: 10,
        y: 20,
        openAriaLabel: '打开 #a',
        removeAriaLabel: '移除 #a',
      }],
    }
    const { result } = renderHook(() => useLinxWhiteboardController({
      model,
      onRemoveSubject,
    }))

    act(() => result.current.handleMount({
      createShapes: vi.fn(),
      updateShapes: vi.fn(),
      deleteShapes: vi.fn(),
      getCurrentPageShapes: () => shapes,
      store: { listen: (next: () => void) => { listener = next; return vi.fn() } },
    }))
    shapes = []
    act(() => listener?.())

    expect(onRemoveSubject).toHaveBeenCalledWith('#a')
  })

  it('restores a deleted subject to the Files projection when tldraw undo recreates its shape', () => {
    let listener: (() => void) | undefined
    let shapes: unknown[] = [{
      id: 'shape:a',
      type: 'linx-subject',
      x: 10,
      y: 20,
      props: { resourceUri: '#a', w: 288, h: 160 },
    }]
    const onRemoveSubject = vi.fn()
    const onRestoreSubject = vi.fn()
    const populatedModel: StructuredWhiteboardViewModel = {
      ...emptyModel,
      isCanvasEmpty: false,
      nodes: [{
        subject: '#a',
        title: 'A',
        className: 'Card',
        summary: '',
        tags: [],
        x: 10,
        y: 20,
        openAriaLabel: '打开 #a',
        removeAriaLabel: '移除 #a',
      }],
    }
    const { result, rerender } = renderHook(
      ({ model }) => useLinxWhiteboardController({
        model,
        onRemoveSubject,
        onRestoreSubject,
      }),
      { initialProps: { model: populatedModel } },
    )

    act(() => result.current.handleMount({
      createShapes: vi.fn(),
      updateShapes: vi.fn(),
      deleteShapes: vi.fn(),
      getCurrentPageShapes: () => shapes,
      store: { listen: (next: () => void) => { listener = next; return vi.fn() } },
    }))
    shapes = []
    act(() => listener?.())
    expect(onRemoveSubject).toHaveBeenCalledWith('#a')

    rerender({ model: emptyModel })
    shapes = [{
      id: 'shape:a',
      type: 'linx-subject',
      x: 10,
      y: 20,
      props: { resourceUri: '#a', w: 288, h: 160 },
    }]
    act(() => listener?.())

    expect(onRestoreSubject).toHaveBeenCalledWith('#a')
  })

  it('keeps a resource in the projection until its final visual instance is deleted', () => {
    let listener: (() => void) | undefined
    let shapes: unknown[] = [{
      id: 'shape:a-1',
      type: 'linx-subject',
      x: 10,
      y: 20,
      props: { resourceUri: '#a', w: 288, h: 160 },
    }, {
      id: 'shape:a-2',
      type: 'linx-subject',
      x: 340,
      y: 20,
      props: { resourceUri: '#a', w: 288, h: 160 },
    }]
    const onRemoveSubject = vi.fn()
    const model: StructuredWhiteboardViewModel = {
      ...emptyModel,
      isCanvasEmpty: false,
      nodes: [{
        subject: '#a',
        title: 'A',
        className: 'Card',
        summary: '',
        tags: [],
        x: 10,
        y: 20,
        openAriaLabel: '打开 #a',
        removeAriaLabel: '移除 #a',
      }],
    }
    const { result } = renderHook(() => useLinxWhiteboardController({
      model,
      onRemoveSubject,
    }))

    act(() => result.current.handleMount({
      createShapes: vi.fn(),
      updateShapes: vi.fn(),
      deleteShapes: vi.fn(),
      getCurrentPageShapes: () => shapes,
      store: { listen: (next: () => void) => { listener = next; return vi.fn() } },
    }))
    shapes = shapes.slice(0, 1)
    act(() => listener?.())
    expect(onRemoveSubject).not.toHaveBeenCalled()

    shapes = []
    act(() => listener?.())
    expect(onRemoveSubject).toHaveBeenCalledTimes(1)
    expect(onRemoveSubject).toHaveBeenCalledWith('#a')
  })
})
