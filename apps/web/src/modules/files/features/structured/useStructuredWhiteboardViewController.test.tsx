import { act, renderHook } from '@testing-library/react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import { useStructuredWhiteboardViewController } from './useStructuredWhiteboardViewController'

const documentUri = 'https://pod.example/.data/workspaces/state.ttl'
const projection: StructuredTableProjection = {
  predicates: ['schema:name', 'rdf:type', 'summary'],
  rows: [
    {
      subject: '#a',
      cells: [
        { predicate: 'schema:name', values: ['"Alpha"'] },
        { predicate: 'rdf:type', values: ['udfs:Card'] },
        { predicate: 'summary', values: ['"First card"'] },
      ],
    },
    {
      subject: '#b',
      cells: [
        { predicate: 'schema:name', values: ['"Beta"'] },
        { predicate: 'rdf:type', values: ['udfs:Card'] },
      ],
    },
    {
      subject: '#c',
      cells: [
        { predicate: 'schema:name', values: ['"Gamma"'] },
      ],
    },
  ],
}

function pointerEvent(init: Partial<PointerEvent> & { currentTarget?: { setPointerCapture?: (pointerId: number) => void } }) {
  return {
    pointerId: init.pointerId ?? 1,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    currentTarget: init.currentTarget ?? { setPointerCapture: vi.fn() },
  } as unknown as ReactPointerEvent<HTMLDivElement>
}

function dispatchPointer(type: string, clientX: number, clientY: number) {
  const event = new Event(type) as Event & { clientX: number; clientY: number }
  event.clientX = clientX
  event.clientY = clientY
  window.dispatchEvent(event)
}

describe('useStructuredWhiteboardViewController', () => {
  it('owns whiteboard projection, layout merge, available subjects, relation options, and node open state', () => {
    const onOpenSubject = vi.fn()
    const { result } = renderHook(() => useStructuredWhiteboardViewController({
      documentUri,
      projection,
      selectedSubjects: ['#a', '#b'],
      layout: { '#a': { x: 120, y: 88 } },
      visualRelations: [{ id: 'visual-a-b', from: '#a', to: '#b', label: 'supports' }],
      onOpenSubject,
    }))

    expect(result.current.layoutKey).toBe(documentUri)
    expect(result.current.cardCountLabel).toBe('白板中 2 张卡片')
    expect(result.current.nodes.map((node) => [node.subject, node.x, node.y])).toEqual([
      ['#a', 120, 88],
      ['#b', 260, 40],
    ])
    expect(result.current.availableRows.map((row) => row.subject)).toEqual(['#c'])
    expect(result.current.hasAvailableSubjectOptions).toBe(true)
    expect(result.current.relationSubjectOptions).toEqual(['#a', '#b'])
    expect(result.current.canCreateVisualRelation).toBe(true)
    expect(result.current.canClearSubjects).toBe(true)
    expect(result.current.isCanvasEmpty).toBe(false)
    expect(result.current.relations.map((relation) => relation.id)).toEqual(['visual-a-b'])
    expect(result.current.relationSegments).toEqual([{
      id: 'visual-a-b',
      source: 'visual',
      strokeDasharray: '2 6',
      x1: 210,
      x2: 350,
      y1: 130,
      y2: 82,
    }])
    expect(result.current.showRelationCount).toBe(true)
    expect(result.current.relationCountLabel).toBe('1 条关系线')
    expect(result.current.hasVisualRelationChips).toBe(true)

    act(() => result.current.handleNodeKeyDown({
      key: 'Enter',
      preventDefault: vi.fn(),
    } as never, '#a'))

    expect(onOpenSubject).toHaveBeenCalledWith('#a', { navigate: true })

    act(() => result.current.handleNodeClick('#b'))
    expect(onOpenSubject).toHaveBeenCalledWith('#b', undefined)
  })

  it('owns pointer drag state, clamped position updates, and click suppression after a drag', () => {
    const onNodePositionChange = vi.fn()
    const onOpenSubject = vi.fn()
    const { result } = renderHook(() => useStructuredWhiteboardViewController({
      documentUri,
      projection,
      selectedSubjects: ['#a'],
      layout: { '#a': { x: 32, y: 32 } },
      onNodePositionChange,
      onOpenSubject,
    }))
    const frame = document.createElement('div')
    Object.defineProperty(frame, 'clientWidth', { configurable: true, value: 260 })
    Object.defineProperty(frame, 'clientHeight', { configurable: true, value: 180 })
    result.current.frameRef.current = frame

    act(() => result.current.startNodeDrag(pointerEvent({
      pointerId: 7,
      clientX: 10,
      clientY: 20,
    }), '#a'))

    expect(result.current.isNodeDragging('#a')).toBe(true)

    act(() => dispatchPointer('pointermove', 500, 500))

    expect(onNodePositionChange).toHaveBeenCalledWith('#a', {
      x: 68,
      y: 96,
    })

    act(() => dispatchPointer('pointerup', 500, 500))

    expect(result.current.isNodeDragging('#a')).toBe(false)

    act(() => result.current.handleNodeClick('#a'))
    expect(onOpenSubject).not.toHaveBeenCalled()

    act(() => result.current.handleNodeClick('#a'))
    expect(onOpenSubject).toHaveBeenCalledWith('#a', undefined)
  })

  it('projects whiteboard toolbar and content availability instead of leaving raw length checks in the renderer', () => {
    const empty = renderHook(() => useStructuredWhiteboardViewController({
      documentUri,
      projection,
      selectedSubjects: [],
    }))

    expect(empty.result.current.hasAvailableSubjectOptions).toBe(true)
    expect(empty.result.current.canCreateVisualRelation).toBe(false)
    expect(empty.result.current.canClearSubjects).toBe(false)
    expect(empty.result.current.isCanvasEmpty).toBe(true)
    expect(empty.result.current.showRelationCount).toBe(false)
    expect(empty.result.current.hasVisualRelationChips).toBe(false)

    const single = renderHook(() => useStructuredWhiteboardViewController({
      documentUri,
      projection,
      selectedSubjects: ['#a'],
    }))

    expect(single.result.current.canCreateVisualRelation).toBe(false)
    expect(single.result.current.canClearSubjects).toBe(true)

    const allSelected = renderHook(() => useStructuredWhiteboardViewController({
      documentUri,
      projection,
      selectedSubjects: ['#a', '#b', '#c'],
    }))

    expect(allSelected.result.current.hasAvailableSubjectOptions).toBe(false)
  })
})
