import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import { useStructuredWhiteboardViewController } from './useStructuredWhiteboardViewController'

const documentUri = 'https://pod.example/.data/workspaces/state.ttl'
const projection: StructuredTableProjection = {
  predicates: ['schema:name', 'rdf:type', 'summary', 'related'],
  rows: [
    {
      subject: '#a',
      cells: [
        { predicate: 'schema:name', values: ['"Alpha"'] },
        { predicate: 'rdf:type', values: ['udfs:Card'] },
        { predicate: 'summary', values: ['"First card"'] },
        { predicate: 'related', values: ['<#c>'] },
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

describe('useStructuredWhiteboardViewController', () => {
  it('owns whiteboard projection, layout merge, available subjects, relation options, and node open routing', () => {
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

    act(() => result.current.openSubject('#a', { navigate: true }))
    expect(onOpenSubject).toHaveBeenCalledWith('#a', { navigate: true })
  })

  it('keeps visual relation creation in the relation workflow while the canvas owns geometry', () => {
    const onVisualRelationsChange = vi.fn()
    const { result } = renderHook(() => useStructuredWhiteboardViewController({
      documentUri,
      projection,
      selectedSubjects: ['#a', '#b'],
      visualRelations: [],
      onVisualRelationsChange,
    }))

    act(() => result.current.openRelationEditor())
    act(() => result.current.updateRelationLabel('supports'))
    act(() => result.current.saveVisualRelation())

    expect(onVisualRelationsChange).toHaveBeenCalledWith([{
      id: 'visual-a-b',
      from: '#a',
      to: '#b',
      label: 'supports',
    }])
  })

  it('preserves an existing visual relation identity when saving the same endpoints', () => {
    const onVisualRelationsChange = vi.fn()
    const { result } = renderHook(() => useStructuredWhiteboardViewController({
      documentUri,
      projection,
      selectedSubjects: ['#a', '#b'],
      visualRelations: [{ id: 'stable-a-b', from: '#a', to: '#b', label: 'old' }],
      onVisualRelationsChange,
    }))

    act(() => result.current.openRelationEditor())
    act(() => result.current.updateRelationLabel('updated'))
    act(() => result.current.saveVisualRelation())

    expect(onVisualRelationsChange).toHaveBeenCalledWith([
      { id: 'stable-a-b', from: '#a', to: '#b', label: 'updated' },
    ])
  })

  it('opens relation creation with endpoints supplied by a canvas connection gesture', () => {
    const { result } = renderHook(() => useStructuredWhiteboardViewController({
      documentUri,
      projection,
      selectedSubjects: ['#a', '#b', '#c'],
    }))

    act(() => result.current.openRelationEditorBetween('#b', '#c'))

    expect(result.current.relationEditorOpen).toBe(true)
    expect(result.current.relationFrom).toBe('#b')
    expect(result.current.relationTo).toBe('#c')
  })

  it('stages predicate-bound relations through the shared cell write proposal path', async () => {
    const onCommitCellWriteProposal = vi.fn(async () => true)
    const { result } = renderHook(() => useStructuredWhiteboardViewController({
      documentUri,
      projection,
      selectedSubjects: ['#a', '#b'],
      visualRelations: [],
      relationPredicateOptions: ['related'],
      onCommitCellWriteProposal,
    }))

    act(() => result.current.openRelationEditor())
    expect(result.current.relationPredicateOptions).toEqual(['related'])

    act(() => result.current.updateRelationPredicate('related'))
    await act(async () => result.current.saveRelation())

    expect(onCommitCellWriteProposal).toHaveBeenCalledWith({
      id: `${documentUri}|#a|related`,
      kind: 'cell-write',
      status: 'pending-write',
      documentUri,
      subject: '#a',
      predicate: 'related',
      previousValues: ['<#c>'],
      nextValues: ['<#c>', '<#b>'],
      writesCanonicalResource: true,
    })
    expect(result.current.relationEditorOpen).toBe(false)
  })

  it('keeps a failed predicate-bound relation visible and retryable', async () => {
    const onCommitCellWriteProposal = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const { result } = renderHook(() => useStructuredWhiteboardViewController({
      documentUri,
      projection,
      selectedSubjects: ['#a', '#b'],
      relationPredicateOptions: ['related'],
      onCommitCellWriteProposal,
    }))

    act(() => result.current.openRelationEditorBetween('#a', '#b'))
    act(() => result.current.updateRelationPredicate('related'))
    await act(async () => result.current.saveRelation())

    expect(result.current.relationEditorOpen).toBe(true)
    expect(result.current.relationSaveError).toBe('关系写入失败，请重试')

    await act(async () => result.current.saveRelation())
    expect(result.current.relationSaveError).toBeNull()
    expect(result.current.relationEditorOpen).toBe(false)
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
