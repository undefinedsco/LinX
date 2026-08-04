import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  normalizeLinxGroupShapeSize,
  TldrawLinxGroupShape,
} from './linx-group-shape'

describe('linx-group-shape', () => {
  it('renders a named and colored visual section', () => {
    render(<TldrawLinxGroupShape shape={{
      id: 'shape:section-1',
      type: 'linx-group',
      x: 20,
      y: 30,
      props: { title: 'Research', color: 'blue', w: 640, h: 420 },
    }} />)

    expect(screen.getByRole('textbox', { name: 'Section title' })).toHaveValue('Research')
    expect(screen.getByTestId('linx-whiteboard-section')).toHaveAttribute('data-section-color', 'blue')
  })

  it('keeps sections large enough to contain cards', () => {
    expect(normalizeLinxGroupShapeSize({ w: 120, h: 80 })).toEqual({ w: 320, h: 220 })
  })

  it('edits the section title and color in place', () => {
    const onUpdate = vi.fn()
    render(<TldrawLinxGroupShape shape={{
      id: 'shape:section-1',
      type: 'linx-group',
      x: 20,
      y: 30,
      props: { title: 'Research', color: 'blue', w: 640, h: 420 },
    }} onUpdate={onUpdate} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Section title' }), { target: { value: 'Planning' } })
    fireEvent.blur(screen.getByRole('textbox', { name: 'Section title' }))
    fireEvent.click(screen.getByRole('button', { name: 'Section color green' }))

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Planning' }))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ color: 'green' }))
  })
})
