import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useStructuredSubjectCreationController } from './useStructuredSubjectCreationController'

const DOC = 'https://pod.example/.data/tasks.ttl'

describe('useStructuredSubjectCreationController', () => {
  it('creates a card from its title and resolves once the write has landed', async () => {
    const stageCellValueChange = vi.fn().mockResolvedValue('written')
    const { result } = renderHook(() => useStructuredSubjectCreationController({
      classScope: 'udfs:Task',
      documentUri: DOC,
      projectionRows: [{ subject: '#Existing', cells: {} }],
      stageCellValueChange,
    }))

    let created: unknown
    await act(async () => { created = await result.current.createSubjectByName('写周报') })

    expect(stageCellValueChange).toHaveBeenCalledWith({
      subject: '#写周报',
      predicate: 'rdf:type',
      nextValues: ['udfs:Task'],
    })
    expect(created).toEqual({ kind: 'created', subject: '#写周报' })
    expect(result.current.pendingSubjects).toEqual(['#写周报'])
  })

  it('reports a write that did not land instead of opening a card that is not there', async () => {
    const { result } = renderHook(() => useStructuredSubjectCreationController({
      classScope: 'udfs:Task',
      documentUri: DOC,
      projectionRows: [],
      stageCellValueChange: vi.fn().mockResolvedValue(false),
    }))

    let created: unknown
    await act(async () => { created = await result.current.createSubjectByName('写周报') })
    expect(created).toEqual({ kind: 'not-written' })
  })

  it('rejects empty and duplicate titles without writing', async () => {
    const stageCellValueChange = vi.fn()
    const { result } = renderHook(() => useStructuredSubjectCreationController({
      classScope: 'udfs:Task',
      documentUri: DOC,
      projectionRows: [{ subject: '#Existing', cells: {} }],
      stageCellValueChange,
    }))

    let empty: unknown
    let duplicate: unknown
    await act(async () => {
      empty = await result.current.createSubjectByName('  ')
      duplicate = await result.current.createSubjectByName('Existing')
    })
    expect(empty).toEqual({ kind: 'rejected', reason: 'empty-subject' })
    expect(duplicate).toEqual({ kind: 'rejected', reason: 'duplicate-subject' })
    expect(stageCellValueChange).not.toHaveBeenCalled()
  })

  it('keeps the inline last row adding by name', () => {
    const stageCellValueChange = vi.fn().mockResolvedValue('written')
    const { result } = renderHook(() => useStructuredSubjectCreationController({
      classScope: 'udfs:Task',
      documentUri: DOC,
      projectionRows: [],
      stageCellValueChange,
    }))

    let added = false
    act(() => { added = result.current.addSubjectByName('Task') })
    expect(added).toBe(true)
    expect(stageCellValueChange).toHaveBeenCalledTimes(1)
    expect(result.current.footerModel.buttonAriaLabel).toBe('+ 卡片')
    let again = true
    act(() => { again = result.current.addSubjectByName('   ') })
    expect(again).toBe(false)
  })
})
