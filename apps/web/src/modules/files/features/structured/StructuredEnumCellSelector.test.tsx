import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { StructuredEnumCellSelector } from './StructuredTableCellPrimitives'
import {
  moveStructuredEnumHighlight,
  planStructuredEnumSelectorInputKeyAction,
} from './structured-enum-cell-workflow-model'

const OPTIONS = [
  { label: '进行中', termUri: 'urn:t:1', status: 'confirmed' },
  { label: '进度慢', termUri: 'urn:t:2', status: 'confirmed' },
]

function Harness({ onAdd, onCancel }: { onAdd: (value: string) => void; onCancel: () => void }) {
  const [search, setSearch] = useState('')
  return (
    <StructuredEnumCellSelector
      ariaLabel="状态"
      listboxId="status-options"
      selectedValues={[]}
      options={OPTIONS}
      search={search}
      onSearchChange={setSearch}
      onAddOption={onAdd}
      onRemoveOption={vi.fn()}
      onOpenDefinition={vi.fn()}
      onCancel={onCancel}
    />
  )
}

describe('option cell editor', () => {
  it('focuses the input as soon as it opens', () => {
    render(<Harness onAdd={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: '状态' })).toHaveFocus()
  })

  it('creates the typed option on Enter', () => {
    const onAdd = vi.fn()
    render(<Harness onAdd={onAdd} onCancel={vi.fn()} />)
    const input = screen.getByRole('combobox', { name: '状态' })
    fireEvent.change(input, { target: { value: '待定' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledWith('待定')
  })

  it('picks the highlighted existing option on Enter, and the typed one when none is highlighted', () => {
    const onAdd = vi.fn()
    render(<Harness onAdd={onAdd} onCancel={vi.fn()} />)
    const input = screen.getByRole('combobox', { name: '状态' })
    fireEvent.change(input, { target: { value: '进' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenLastCalledWith('进')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenLastCalledWith('进度慢')
  })

  it('does not choose while Chinese input is being confirmed', () => {
    const onAdd = vi.fn()
    render(<Harness onAdd={onAdd} onCancel={vi.fn()} />)
    const input = screen.getByRole('combobox', { name: '状态' })
    fireEvent.change(input, { target: { value: 'dai' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onCancel = vi.fn()
    render(<Harness onAdd={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByRole('combobox', { name: '状态' }), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })
})

describe('option cell key plans', () => {
  it('prefers the highlighted option, then the exact match, then the typed text', () => {
    expect(planStructuredEnumSelectorInputKeyAction({ exactSearchOptionLabel: '进行中', highlightedOptionLabel: '进度慢', key: 'Enter', normalizedSearch: '进行中' }))
      .toEqual({ kind: 'add-option', value: '进度慢' })
    expect(planStructuredEnumSelectorInputKeyAction({ exactSearchOptionLabel: '进行中', key: 'Enter', normalizedSearch: '进行中' }))
      .toEqual({ kind: 'add-option', value: '进行中' })
    expect(planStructuredEnumSelectorInputKeyAction({ exactSearchOptionLabel: null, key: 'Enter', normalizedSearch: '' }))
      .toEqual({ kind: 'noop' })
  })

  it('moves the highlight within the list', () => {
    expect(moveStructuredEnumHighlight({ current: -1, key: 'ArrowDown', optionCount: 2 })).toBe(0)
    expect(moveStructuredEnumHighlight({ current: 1, key: 'ArrowDown', optionCount: 2 })).toBe(1)
    expect(moveStructuredEnumHighlight({ current: 0, key: 'ArrowUp', optionCount: 2 })).toBe(-1)
    expect(moveStructuredEnumHighlight({ current: 0, key: 'ArrowDown', optionCount: 0 })).toBe(-1)
  })
})
