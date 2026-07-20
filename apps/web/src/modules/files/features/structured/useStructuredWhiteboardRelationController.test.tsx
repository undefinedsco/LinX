import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { StructuredWhiteboardVisualRelation } from '../../domain/structured/structured-projections'
import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import { useStructuredWhiteboardRelationController } from './useStructuredWhiteboardRelationController'

const existingRelations: StructuredWhiteboardVisualRelation[] = [
  { id: 'visual-a-b', from: '#a', to: '#b', label: 'relates' },
]

describe('useStructuredWhiteboardRelationController', () => {
  const projection: StructuredTableProjection = {
    prefixes: {},
    predicates: ['related'],
    rows: [
      { subject: '#a', cells: [{ predicate: 'related', values: [] }] },
      { subject: '#b', cells: [] },
    ],
    warnings: [],
  }

  it('owns relation editor draft, create, update, remove, and cancel workflow outside the whiteboard renderer', () => {
    const onVisualRelationsChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ relations }) => useStructuredWhiteboardRelationController({
        relationSubjectOptions: ['#a', '#b', '#c'],
        visualRelations: relations,
        onVisualRelationsChange,
      }),
      { initialProps: { relations: existingRelations } },
    )

    act(() => result.current.openRelationEditor())

    expect(result.current.relationEditorOpen).toBe(true)
    expect(result.current.editingRelationId).toBeNull()
    expect(result.current.relationFrom).toBe('#a')
    expect(result.current.relationTo).toBe('#b')
    expect(result.current.relationToOptions).toEqual(['#b', '#c'])
    expect(result.current.canSaveVisualRelation).toBe(true)
    expect(result.current.hasVisualRelationChips).toBe(true)
    expect(result.current.relationEditorChrome).toMatchObject({
      fromFieldLabel: '起点',
      fromFieldAriaLabel: 'Relation from',
      saveButtonLabel: '创建视觉关系',
      cancelButtonAriaLabel: '取消视觉关系',
    })
    expect(result.current.visualRelationChips).toEqual([{
      id: 'visual-a-b',
      label: 'relates',
      editAriaLabel: '编辑视觉关系 relates',
      deleteAriaLabel: '删除视觉关系 relates',
      relation: existingRelations[0],
    }])
    expect(result.current.relationLabel).toBe('')

    act(() => result.current.updateRelationFrom('#b'))
    expect(result.current.relationToOptions).toEqual(['#a', '#c'])
    act(() => result.current.updateRelationLabel('Blocks'))
    act(() => result.current.saveVisualRelation())

    expect(onVisualRelationsChange).toHaveBeenLastCalledWith([
      existingRelations[0],
      { id: 'visual-b-a', from: '#b', to: '#a', label: 'Blocks' },
    ])
    expect(result.current.relationEditorOpen).toBe(false)
    expect(result.current.editingRelationId).toBeNull()
    expect(result.current.relationLabel).toBe('')

    const updatedRelations: StructuredWhiteboardVisualRelation[] = [
      existingRelations[0],
      { id: 'visual-b-a', from: '#b', to: '#a', label: 'Blocks' },
    ]
    rerender({ relations: updatedRelations })

    act(() => result.current.openRelationEditorFor(updatedRelations[1]))
    expect(result.current.relationEditorChrome.saveButtonLabel).toBe('保存视觉关系')
    expect(result.current.relationToOptions).toEqual(['#a', '#c'])
    act(() => result.current.updateRelationTo('#c'))
    act(() => result.current.saveVisualRelation())

    expect(onVisualRelationsChange).toHaveBeenLastCalledWith([
      existingRelations[0],
      { id: 'visual-b-a', from: '#b', to: '#c', label: 'Blocks' },
    ])

    act(() => result.current.openRelationEditorFor(existingRelations[0]))
    act(() => result.current.removeVisualRelation(existingRelations[0].id))

    expect(onVisualRelationsChange).toHaveBeenLastCalledWith([
      updatedRelations[1],
    ])
    expect(result.current.relationEditorOpen).toBe(false)
    expect(result.current.editingRelationId).toBeNull()

    act(() => {
      result.current.openRelationEditor()
      result.current.cancelRelationEditor()
    })

    expect(result.current.relationEditorOpen).toBe(false)
    expect(result.current.editingRelationId).toBeNull()
  })

  it('projects save eligibility instead of leaving from/to validity in the renderer', () => {
    const { result } = renderHook(() => useStructuredWhiteboardRelationController({
      relationSubjectOptions: ['#a', '#b'],
      visualRelations: [],
    }))

    act(() => result.current.openRelationEditor())

    expect(result.current.canSaveVisualRelation).toBe(true)
    expect(result.current.hasVisualRelationChips).toBe(false)

    act(() => result.current.updateRelationTo('#a'))

    expect(result.current.relationToOptions).toEqual(['#b'])
    expect(result.current.canSaveVisualRelation).toBe(false)
  })

  it('preserves the edited relation identity when edit and save happen before React rerenders', () => {
    const onVisualRelationsChange = vi.fn()
    const { result } = renderHook(() => useStructuredWhiteboardRelationController({
      relationSubjectOptions: ['#a', '#b', '#c'],
      visualRelations: existingRelations,
      onVisualRelationsChange,
    }))

    act(() => {
      result.current.openRelationEditorFor(existingRelations[0])
      result.current.saveVisualRelation()
    })

    expect(onVisualRelationsChange).toHaveBeenCalledWith(existingRelations)
  })

  it('projects visual relation chip fallback labels for the renderer', () => {
    const relationWithoutLabel: StructuredWhiteboardVisualRelation = {
      id: 'visual-without-label',
      from: '#a',
      to: '#b',
      label: '',
    }
    const { result } = renderHook(() => useStructuredWhiteboardRelationController({
      relationSubjectOptions: ['#a', '#b'],
      visualRelations: [relationWithoutLabel],
    }))

    expect(result.current.visualRelationChips).toEqual([{
      id: 'visual-without-label',
      label: 'visual-without-label',
      editAriaLabel: '编辑视觉关系 visual-without-label',
      deleteAriaLabel: '删除视觉关系 visual-without-label',
      relation: relationWithoutLabel,
    }])
    expect(result.current.hasVisualRelationChips).toBe(true)
  })

  it('rolls back an optimistic visual arrow when an RDF-bound relation proposal is rejected', async () => {
    const onVisualRelationsChange = vi.fn()
    const onCommitCellWriteProposal = vi.fn().mockResolvedValue(false)
    const { result } = renderHook(() => useStructuredWhiteboardRelationController({
      documentUri: 'https://pod.example/data.ttl',
      projection,
      relationPredicateOptions: ['related'],
      relationSubjectOptions: ['#a', '#b'],
      visualRelations: [],
      onCommitCellWriteProposal,
      onVisualRelationsChange,
    }))

    act(() => {
      result.current.openRelationEditorBetween('#a', '#b')
      result.current.updateRelationPredicate('related')
    })
    await act(async () => {
      expect(await result.current.saveRelation()).toBe(false)
    })

    expect(onVisualRelationsChange).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({ from: '#a', to: '#b', label: 'related' }),
    ])
    expect(onVisualRelationsChange).toHaveBeenLastCalledWith([])
    expect(result.current.relationEditorOpen).toBe(true)
    expect(result.current.relationSaveError).toBe('关系写入失败，请重试')
  })

  it('rolls back an optimistic visual arrow when an RDF-bound relation proposal throws', async () => {
    const onVisualRelationsChange = vi.fn()
    const onCommitCellWriteProposal = vi.fn().mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useStructuredWhiteboardRelationController({
      documentUri: 'https://pod.example/data.ttl',
      projection,
      relationPredicateOptions: ['related'],
      relationSubjectOptions: ['#a', '#b'],
      visualRelations: existingRelations,
      onCommitCellWriteProposal,
      onVisualRelationsChange,
    }))

    act(() => {
      result.current.openRelationEditorBetween('#a', '#b')
      result.current.updateRelationPredicate('related')
    })
    await act(async () => {
      expect(await result.current.saveRelation()).toBe(false)
    })

    expect(onVisualRelationsChange).toHaveBeenLastCalledWith(existingRelations)
    expect(result.current.relationEditorOpen).toBe(true)
    expect(result.current.relationSaveError).toBe('关系写入失败，请重试')
  })

  it('removes the optimistic visual arrow after an RDF-bound relation proposal succeeds', async () => {
    const onVisualRelationsChange = vi.fn()
    const onCommitCellWriteProposal = vi.fn().mockResolvedValue(true)
    const { result } = renderHook(() => useStructuredWhiteboardRelationController({
      documentUri: 'https://pod.example/data.ttl',
      projection,
      relationPredicateOptions: ['related'],
      relationSubjectOptions: ['#a', '#b'],
      visualRelations: [],
      onCommitCellWriteProposal,
      onVisualRelationsChange,
    }))

    act(() => {
      result.current.openRelationEditorBetween('#a', '#b')
      result.current.updateRelationPredicate('related')
    })
    await act(async () => {
      expect(await result.current.saveRelation()).toBe(true)
    })

    expect(onVisualRelationsChange).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({ from: '#a', to: '#b', label: 'related' }),
    ])
    expect(onVisualRelationsChange).toHaveBeenLastCalledWith([])
    expect(result.current.relationEditorOpen).toBe(false)
  })
})
