import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useStructuredClassScopeMenuController } from './useStructuredClassScopeMenuController'

describe('useStructuredClassScopeMenuController', () => {
  it('owns class draft, menu expansion, submit, and document reset state outside the toolbar renderer', () => {
    const onCreatePendingClassProposal = vi.fn((draftUri: string) => draftUri.trim().length > 0)
    const { result, rerender } = renderHook(
      ({ documentUri }) => useStructuredClassScopeMenuController({
        documentUri,
        onCreatePendingClassProposal,
      }),
      { initialProps: { documentUri: 'https://pod.example/.data/state.ttl' } },
    )

    act(() => {
      result.current.updateClassDraftUri('udfs:Note')
      result.current.toggleClassCreateOpen()
      result.current.toggleClassDefinitionOpen()
    })

    expect(result.current.classDraftUri).toBe('udfs:Note')
    expect(result.current.classCreateOpen).toBe(true)
    expect(result.current.classDefinitionOpen).toBe(true)

    act(() => result.current.submitClassDraft())

    expect(onCreatePendingClassProposal).toHaveBeenCalledWith('udfs:Note')
    expect(result.current.classDraftUri).toBe('')
    expect(result.current.classCreateOpen).toBe(true)
    expect(result.current.classDefinitionOpen).toBe(true)

    act(() => result.current.updateClassDraftUri(''))
    act(() => result.current.submitClassDraft())

    expect(onCreatePendingClassProposal).toHaveBeenLastCalledWith('')
    expect(result.current.classDraftUri).toBe('')

    act(() => result.current.updateClassDraftUri('udfs:Task'))
    rerender({ documentUri: 'https://pod.example/.data/other.ttl' })

    expect(result.current.classDraftUri).toBe('')
    expect(result.current.classCreateOpen).toBe(false)
    expect(result.current.classDefinitionOpen).toBe(false)
  })
})
