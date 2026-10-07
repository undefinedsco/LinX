import { describe, expect, it } from 'vitest'

import {
  MIN_STRUCTURED_COLUMN_WIDTH,
  projectStructuredColumnResizeSize,
  projectStructuredColumnSizingColumnSize,
  projectStructuredColumnSizingFromInput,
  projectStructuredColumnSizingUpdate,
} from './structured-column-sizing-model'

describe('structured-column-sizing-model', () => {
  it('projects controlled column sizing input and updater results', () => {
    expect(projectStructuredColumnSizingFromInput(undefined)).toEqual({})
    expect(projectStructuredColumnSizingFromInput({ title: 180 })).toEqual({ title: 180 })

    expect(projectStructuredColumnSizingUpdate({
      current: { title: 180 },
      updater: { status: 96 },
    })).toEqual({ status: 96 })
    expect(projectStructuredColumnSizingUpdate({
      current: { title: 180 },
      updater: (current) => ({ ...current, status: 96 }),
    })).toEqual({ title: 180, status: 96 })
  })

  it('projects pointer resize deltas and minimum column width', () => {
    expect(MIN_STRUCTURED_COLUMN_WIDTH).toBe(48)
    expect(projectStructuredColumnResizeSize({
      currentClientX: 141,
      startClientX: 100,
      startSize: 120,
    })).toBe(161)
    expect(projectStructuredColumnResizeSize({
      currentClientX: 20,
      startClientX: 100,
      startSize: 80,
    })).toBe(MIN_STRUCTURED_COLUMN_WIDTH)
    expect(projectStructuredColumnSizingColumnSize({
      columnId: 'title',
      current: { status: 120 },
      nextSize: 180,
    })).toEqual({ status: 120, title: 180 })
  })
})
