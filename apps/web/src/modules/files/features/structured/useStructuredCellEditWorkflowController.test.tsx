import { act, renderHook } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { StructuredVocabPredicateDefinition } from '../../domain/structured/structured-table'
import type { StructuredProjectionTableRow } from './structured-projection-table-model'
import { useStructuredCellEditWorkflowController } from './useStructuredCellEditWorkflowController'

const documentUri = 'https://pod.example/.data/tasks.ttl'

const row: StructuredProjectionTableRow = {
  subject: '#Task',
  cells: {
    title: ['"Alpha"'],
  },
}

function textDefinition(): StructuredVocabPredicateDefinition {
  return {
    label: 'title',
    valueType: 'text',
  }
}

function tableKeyEvent(key: string, value = '') {
  const preventDefault = vi.fn()
  const currentTarget = document.createElement('td')
  const target = document.createElement('input')
  target.value = value

  return {
    currentTarget,
    event: {
      key,
      preventDefault,
      currentTarget,
      target,
    } as unknown as KeyboardEvent<HTMLElement>,
    preventDefault,
  }
}

describe('useStructuredCellEditWorkflowController', () => {
  it('owns table-cell keyboard activation, text commit, and discard workflow', () => {
    const stageCellValueChange = vi.fn()
    const discardCellWriteDraft = vi.fn()
    const { result } = renderHook(() => useStructuredCellEditWorkflowController({
      documentUri,
      editable: true,
      getPredicateDefinition: () => textDefinition(),
      stageCellValueChange,
      discardCellWriteDraft,
    }))

    const enterToEdit = tableKeyEvent('Enter')
    act(() => result.current.handleCellKeyDown(enterToEdit.event, row, 'title'))

    expect(enterToEdit.preventDefault).toHaveBeenCalledTimes(1)
    expect(result.current.activeTextCell).toMatchObject({
      subject: '#Task',
      predicate: 'title',
      value: 'Alpha',
    })

    const enterToCommit = tableKeyEvent('Enter', 'Beta')
    act(() => result.current.handleCellKeyDown(enterToCommit.event, row, 'title'))

    expect(enterToCommit.preventDefault).toHaveBeenCalledTimes(1)
    expect(stageCellValueChange).toHaveBeenCalledWith({
      subject: '#Task',
      predicate: 'title',
      nextValues: ['"Beta"'],
    })
    expect(result.current.activeTextCell).toBeNull()

    const spaceToEdit = tableKeyEvent(' ')
    act(() => result.current.handleCellKeyDown(spaceToEdit.event, row, 'title'))

    expect(spaceToEdit.preventDefault).toHaveBeenCalledTimes(1)
    expect(result.current.activeTextCell).toMatchObject({
      subject: '#Task',
      predicate: 'title',
    })

    const escapeToDiscard = tableKeyEvent('Escape', 'Draft')
    act(() => result.current.handleCellKeyDown(escapeToDiscard.event, row, 'title'))

    expect(escapeToDiscard.preventDefault).toHaveBeenCalledTimes(1)
    expect(discardCellWriteDraft).toHaveBeenCalledWith('#Task', 'title')
    expect(result.current.activeTextCell).toBeNull()
  })
})
