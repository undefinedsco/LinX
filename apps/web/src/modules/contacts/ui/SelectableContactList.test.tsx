import { fireEvent, render, screen } from '@testing-library/react'
import { User } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import type { ContactRow } from '@undefineds.co/models'
import { SelectableContactList } from './SelectableContactList'

describe('SelectableContactList', () => {
  it('uses keyboard-reachable checkbox semantics and reports selection', () => {
    const onToggle = vi.fn()
    const alice = { id: 'alice', name: 'Alice', contactType: 'solid' } as ContactRow

    render(
      <SelectableContactList
        title="联系人"
        icon={<User />}
        contacts={[alice]}
        selected={new Set(['alice'])}
        onToggle={onToggle}
      />,
    )

    const checkbox = screen.getByRole('checkbox', { name: /Alice/ })
    expect(checkbox.tagName).toBe('BUTTON')
    expect(checkbox).toHaveAttribute('aria-checked', 'true')
    checkbox.focus()
    expect(checkbox).toHaveFocus()
    fireEvent.click(checkbox)
    expect(onToggle).toHaveBeenCalledWith('alice')
  })
})
