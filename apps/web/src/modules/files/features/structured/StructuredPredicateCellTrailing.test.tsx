import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  StructuredPredicateCellPendingWriteControl,
  StructuredPredicateCellShapeWarning,
  StructuredPredicateCellTrailing,
} from './StructuredPredicateCellTrailing'

describe('StructuredPredicateCellTrailing', () => {
  const shapeWarning = {
    ariaLabel: 'Shape warning for tags on #Workspace',
    message: '#Workspace tags has 2 values; maxCount is 1.',
    predicateLabel: 'tags',
    subject: '#Workspace',
    title: '#Workspace tags has 2 values; maxCount is 1.',
  }
  const pendingWrite = {
    discardable: true,
    predicateLabel: 'tags',
    subject: '#Workspace',
  }
  const submittingWrite = {
    ...pendingWrite,
    status: 'pending' as const,
  }

  it('renders warning and pending write controls as props-only cell trailing primitives', () => {
    const onDiscard = vi.fn()

    render(
      <StructuredPredicateCellTrailing
        pendingWrite={pendingWrite}
        shapeWarning={shapeWarning}
        onDiscardPendingWrite={onDiscard}
      />,
    )

    expect(screen.getByLabelText('Shape warning for tags on #Workspace')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Discard pending write for tags on #Workspace' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('can render warning and pending controls separately for active editor slots', () => {
    const { rerender } = render(<StructuredPredicateCellShapeWarning warning={shapeWarning} />)
    expect(screen.getByLabelText('Shape warning for tags on #Workspace')).toBeInTheDocument()

    rerender(<StructuredPredicateCellPendingWriteControl pendingWrite={submittingWrite} />)
    expect(screen.getByRole('status', { name: '正在提交 tags on #Workspace 的单元格变更' })).toBeInTheDocument()
  })

  it('preserves active editor pending affordance when only a fallback label is available', () => {
    render(
      <StructuredPredicateCellPendingWriteControl
        enabled
        fallbackPredicateLabel="title"
        fallbackSubject="#Other"
      />,
    )

    expect(screen.getByRole('button', { name: 'Discard pending write for title on #Other' })).toBeInTheDocument()
  })
})
