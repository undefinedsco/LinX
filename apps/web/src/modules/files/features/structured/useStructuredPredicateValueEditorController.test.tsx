import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useStructuredPredicateValueEditorController } from './useStructuredPredicateValueEditorController'

describe('useStructuredPredicateValueEditorController', () => {
  it('owns enum filtering, create state, and RDF literal commit serialization', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useStructuredPredicateValueEditorController({
      kind: 'enum',
      values: ['Needs review'],
      options: ['Draft', 'Ready', 'Published'],
      onCommit,
    }))

    expect(result.current.draft).toBe('Needs review')

    act(() => result.current.setDraft('rea'))

    expect(result.current.enumState).toMatchObject({
      normalizedDraft: 'rea',
      filteredOptions: ['Ready'],
      canCreate: true,
      expanded: true,
      showListbox: true,
    })

    act(() => result.current.commitEnumValue('Ready'))

    expect(result.current.selectedValues).toEqual(['Ready'])
    expect(onCommit).toHaveBeenCalledWith(['"Ready"'])
  })

  it('owns multi-select option candidates, duplicate noops, add, remove, and RDF literal serialization', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useStructuredPredicateValueEditorController({
      kind: 'multi-select',
      values: ['source-linked', 'finance'],
      options: ['source-linked', 'finance', 'audited'],
      onCommit,
    }))

    act(() => result.current.setDraft('aud'))

    expect(result.current.multiSelectState).toMatchObject({
      normalizedDraft: 'aud',
      optionCandidates: ['audited'],
      canCreate: true,
      expanded: true,
      showListbox: true,
    })

    act(() => result.current.commitMultiValue('audited'))

    expect(result.current.selectedValues).toEqual(['source-linked', 'finance', 'audited'])
    expect(result.current.draft).toBe('')
    expect(onCommit).toHaveBeenLastCalledWith(['"source-linked"', '"finance"', '"audited"'])

    act(() => result.current.commitMultiValue('audited'))

    expect(onCommit).toHaveBeenCalledTimes(1)

    act(() => result.current.removeMultiValue('finance'))

    expect(result.current.selectedValues).toEqual(['source-linked', 'audited'])
    expect(onCommit).toHaveBeenLastCalledWith(['"source-linked"', '"audited"'])
  })

  it('owns boolean and scalar value commits with table-compatible RDF serialization', () => {
    const onBooleanCommit = vi.fn()
    const boolean = renderHook(() => useStructuredPredicateValueEditorController({
      kind: 'boolean',
      values: ['true'],
      onCommit: onBooleanCommit,
    }))

    expect(boolean.result.current.booleanValue).toBe(true)
    act(() => boolean.result.current.toggleBooleanValue())
    expect(boolean.result.current.selectedValues).toEqual(['false'])
    expect(onBooleanCommit).toHaveBeenCalledWith(['false'])

    const onRelationCommit = vi.fn()
    const relation = renderHook(() => useStructuredPredicateValueEditorController({
      kind: 'relation',
      values: ['https://pod.example/cards/report.md'],
      onCommit: onRelationCommit,
    }))

    act(() => relation.result.current.setDraft('https://pod.example/cards/revised.md'))
    act(() => relation.result.current.commitScalarValue())

    expect(relation.result.current.selectedValues).toEqual(['https://pod.example/cards/revised.md'])
    expect(onRelationCommit).toHaveBeenCalledWith(['<https://pod.example/cards/revised.md>'])
  })

  it('resets draft and selected values when incoming values or editor kind change', () => {
    const { result, rerender } = renderHook(
      ({ kind, values }: { kind: 'enum' | 'multi-select'; values: string[] }) => (
        useStructuredPredicateValueEditorController({
          kind,
          values,
          options: ['Draft', 'Ready'],
          onCommit: vi.fn(),
        })
      ),
      { initialProps: { kind: 'enum', values: ['Draft'] } },
    )

    act(() => result.current.setDraft('Ready'))
    expect(result.current.draft).toBe('Ready')

    rerender({ kind: 'multi-select', values: ['Ready'] })

    expect(result.current.selectedValues).toEqual(['Ready'])
    expect(result.current.draft).toBe('')
  })
})
