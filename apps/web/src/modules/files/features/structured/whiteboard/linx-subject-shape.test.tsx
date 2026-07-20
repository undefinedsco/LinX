import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('tldraw', () => ({
  HTMLContainer: ({ children, ...props }: { children: unknown; [key: string]: unknown }) => <div {...props}>{children as never}</div>,
  Rectangle2d: class {
    constructor(public props: unknown) {}
  },
  resizeBox: vi.fn((shape) => shape),
  ShapeUtil: class {},
  T: {
    string: { optional: () => ({}) },
    literalEnum: (...values: string[]) => ({ values }),
    number: {},
    boolean: {},
    optional: (validator: unknown) => validator,
    object: (shape: unknown) => shape,
    arrayOf: (validator: unknown) => validator,
  },
}))

import {
  LINX_SUBJECT_SHAPE_MAX_HEIGHT,
  LINX_SUBJECT_SHAPE_MAX_WIDTH,
  LINX_SUBJECT_SHAPE_MIN_HEIGHT,
  LINX_SUBJECT_SHAPE_MIN_WIDTH,
  LinxSubjectShapeUtil,
  TldrawLinxSubjectShape,
  normalizeLinxSubjectShapeSize,
} from './linx-subject-shape'

describe('TldrawLinxSubjectShape', () => {
  it('renders resource content, pending state, selected state, and double-click open callback', () => {
    const onOpen = vi.fn()

    render(
      <TldrawLinxSubjectShape
        selected
        shape={{
          id: 'shape:linx-subject-a',
          type: 'linx-subject',
          x: 10,
          y: 20,
          props: {
            resourceUri: '#a',
            resourceKind: 'card',
            title: 'Alpha',
            summary: 'A two line summary that should stay inside the card',
            classLabel: 'Card',
            pending: true,
            facts: [{ id: 'tag-0', label: 'One' }],
            w: 288,
            h: 160,
          },
        }}
        onOpenSubject={onOpen}
      />,
    )

    const card = screen.getByRole('button', { name: '打开 subject Alpha' })
    expect(card).toHaveAttribute('data-whiteboard-subject-shape', '#a')
    expect(card).toHaveAttribute('data-selected', 'true')
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('A two line summary that should stay inside the card')).toBeInTheDocument()
    expect(screen.getByText('Card')).toBeInTheDocument()
    expect(screen.getByText('待确认')).toBeInTheDocument()
    expect(screen.queryByLabelText(/remove|delete|删除/i)).not.toBeInTheDocument()

    fireEvent.doubleClick(card)
    expect(onOpen).toHaveBeenCalledWith('#a', { navigate: true })
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(onOpen).toHaveBeenLastCalledWith('#a', { navigate: false })
  })

  it('enables pointer events on the tldraw HTML container for dragging', () => {
    const shape = {
      id: 'shape:linx-subject-a',
      type: 'linx-subject' as const,
      x: 10,
      y: 20,
      props: {
        resourceUri: '#a',
        resourceKind: 'subject' as const,
        title: 'Alpha',
        summary: '',
        pending: false,
        facts: [],
        w: 288,
        h: 160,
      },
    }

    const { container } = render(new LinxSubjectShapeUtil().component(shape))

    expect(container.firstElementChild).toHaveStyle('pointer-events: all')
  })

  it('normalizes resize bounds for subject cards', () => {
    expect(normalizeLinxSubjectShapeSize({ w: 10, h: 20 })).toEqual({
      w: LINX_SUBJECT_SHAPE_MIN_WIDTH,
      h: LINX_SUBJECT_SHAPE_MIN_HEIGHT,
    })
    expect(normalizeLinxSubjectShapeSize({ w: 999, h: 999 })).toEqual({
      w: LINX_SUBJECT_SHAPE_MAX_WIDTH,
      h: LINX_SUBJECT_SHAPE_MAX_HEIGHT,
    })
  })

  it('creates a relation by dragging the connection handle onto another subject card', () => {
    const onConnect = vi.fn()
    const baseProps = {
      resourceKind: 'subject' as const,
      summary: '',
      pending: false,
      facts: [],
      w: 288,
      h: 160,
    }

    render(
      <>
        <TldrawLinxSubjectShape
          shape={{
            id: 'shape:linx-subject-a',
            type: 'linx-subject',
            x: 0,
            y: 0,
            props: { ...baseProps, resourceUri: '#a', title: 'Alpha' },
          }}
          onConnectSubject={onConnect}
        />
        <TldrawLinxSubjectShape
          shape={{
            id: 'shape:linx-subject-b',
            type: 'linx-subject',
            x: 320,
            y: 0,
            props: { ...baseProps, resourceUri: '#b', title: 'Beta' },
          }}
        />
      </>,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: '从 Alpha 创建关系' }))
    fireEvent.pointerUp(screen.getByRole('button', { name: '打开 subject Beta' }))

    expect(onConnect).toHaveBeenCalledWith('#a', '#b')
  })
})
