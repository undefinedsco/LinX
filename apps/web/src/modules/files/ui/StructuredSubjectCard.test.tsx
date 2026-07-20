import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StructuredSubjectCard } from './StructuredSubjectCard'

const model = {
  subject: 'urn:task:1',
  title: 'Prepare launch',
  summary: 'Coordinate the release checklist.',
  classLabel: 'Task',
  facts: [
    { id: 'owner', label: 'Ganlu' },
    { id: 'priority', label: 'High' },
    { id: 'ignored', label: 'Later' },
  ],
  pending: false,
}

describe('StructuredSubjectCard', () => {
  it('renders compact resource geometry with low-chrome actions', () => {
    render(<StructuredSubjectCard model={model} selected={false} onSelect={vi.fn()} onOpen={vi.fn()} />)

    expect(screen.getByText('Prepare launch')).toBeVisible()
    expect(screen.getByText('Coordinate the release checklist.')).toBeVisible()
    expect(screen.getByText('Task')).toBeVisible()
    expect(screen.getByText('Ganlu')).toBeVisible()
    expect(screen.getByText('High')).toBeVisible()
    expect(screen.queryByText('Later')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开 Prepare launch' })).toBeVisible()
    expect(screen.getByTestId('structured-subject-card')).toHaveAttribute('data-card-density', 'compact')
  })

  it('selects on click or Space, previews on Enter, and navigates only on double click', () => {
    const onSelect = vi.fn()
    const onOpen = vi.fn()

    render(<StructuredSubjectCard model={model} selected={false} onSelect={onSelect} onOpen={onOpen} />)

    const card = screen.getByTestId('structured-subject-card')
    fireEvent.click(card)
    fireEvent.keyDown(card, { key: ' ' })
    fireEvent.doubleClick(card)
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: '打开 Prepare launch' }))

    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onSelect).toHaveBeenCalledWith('urn:task:1', { extend: false })
    expect(onOpen).toHaveBeenCalledTimes(3)
    expect(onOpen).toHaveBeenNthCalledWith(1, 'urn:task:1', { navigate: true })
    expect(onOpen).toHaveBeenNthCalledWith(2, 'urn:task:1', { navigate: false })
    expect(onOpen).toHaveBeenNthCalledWith(3, 'urn:task:1', { navigate: false })
  })
})
