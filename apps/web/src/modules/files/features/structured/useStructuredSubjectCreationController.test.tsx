import { act, renderHook } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useStructuredSubjectCreationController } from './useStructuredSubjectCreationController'

function subjectDraftKeyEvent(key: string) {
  const preventDefault = vi.fn()

  return {
    event: {
      key,
      preventDefault,
    } as unknown as KeyboardEvent<HTMLInputElement>,
    preventDefault,
  }
}

describe('useStructuredSubjectCreationController', () => {
  it('owns subject draft Enter submission and pending subject staging', () => {
    const stageCellValueChange = vi.fn()
    const { result } = renderHook(() => useStructuredSubjectCreationController({
      classScope: 'udfs:Task',
      documentUri: 'https://pod.example/.data/tasks.ttl',
      projectionRows: [{ subject: '#Existing', cells: {} }],
      stageCellValueChange,
    }))

    act(() => result.current.openCreateSubjectDialog())
    expect(result.current.createSubjectOpen).toBe(true)
    expect(result.current.submitDisabled).toBe(false)
    expect(result.current.footerModel).toEqual({
      disabled: false,
      title: '在 udfs:Task 中新增 subject',
      buttonAriaLabel: '+ Subject',
      buttonLabel: 'Subject',
    })
    expect(result.current.dialogModel).toEqual({
      title: '新增 subject',
      description: 'udfs:Task',
      subjectInputLabel: 'Subject',
      cancelLabel: '取消',
      submitLabel: '创建条目审批',
    })

    act(() => result.current.setSubjectDraft('#Task'))
    expect(result.current.submitDisabled).toBe(false)
    const nonSubmitKey = subjectDraftKeyEvent('Escape')
    act(() => result.current.handleSubjectDraftKeyDown(nonSubmitKey.event))

    expect(nonSubmitKey.preventDefault).not.toHaveBeenCalled()
    expect(stageCellValueChange).not.toHaveBeenCalled()
    expect(result.current.createSubjectOpen).toBe(true)

    const submitKey = subjectDraftKeyEvent('Enter')
    act(() => result.current.handleSubjectDraftKeyDown(submitKey.event))

    expect(submitKey.preventDefault).toHaveBeenCalledTimes(1)
    expect(stageCellValueChange).toHaveBeenCalledWith({
      subject: '#Task',
      predicate: 'rdf:type',
      nextValues: ['udfs:Task'],
    })
    expect(result.current.pendingSubjects).toEqual(['#Task'])
    expect(result.current.createSubjectOpen).toBe(false)
  })

  it('projects submit disabled state from class scope, duplicate subjects, and empty drafts', () => {
    const { result, rerender } = renderHook(
      ({ classScope }: { classScope?: string | null }) => useStructuredSubjectCreationController({
        classScope,
        documentUri: 'https://pod.example/.data/tasks.ttl',
        projectionRows: [{ subject: '#Existing', cells: {} }],
        stageCellValueChange: vi.fn(),
      }),
      { initialProps: { classScope: 'udfs:Task' } },
    )

    act(() => result.current.setSubjectDraft('   '))
    expect(result.current.submitDisabled).toBe(true)

    act(() => result.current.setSubjectDraft('#Existing'))
    expect(result.current.submitDisabled).toBe(true)

    act(() => result.current.setSubjectDraft('#NewSubject'))
    expect(result.current.submitDisabled).toBe(false)

    rerender({ classScope: null })
    expect(result.current.submitDisabled).toBe(true)
    expect(result.current.footerModel).toEqual({
      disabled: true,
      title: '先选择 class 再新增 subject',
      buttonAriaLabel: '+ Subject',
      buttonLabel: 'Subject',
    })
    expect(result.current.dialogModel).toEqual({
      title: '新增 subject',
      description: '先选择 class 再新增 subject。',
      subjectInputLabel: 'Subject',
      cancelLabel: '取消',
      submitLabel: '创建条目审批',
    })
  })

  it('derives existing subjects from projection rows before seeding a draft', () => {
    const { result } = renderHook(() => useStructuredSubjectCreationController({
      classScope: 'udfs:Task',
      documentUri: 'https://pod.example/.data/tasks.ttl',
      projectionRows: [
        { subject: '#NewSubject', cells: {} },
        { subject: '#NewSubject2', cells: {} },
      ],
      stageCellValueChange: vi.fn(),
    }))

    act(() => result.current.openCreateSubjectDialog())

    expect(result.current.subjectDraft).toBe('#NewSubject3')
  })
})
