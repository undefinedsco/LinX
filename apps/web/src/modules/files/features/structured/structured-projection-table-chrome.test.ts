import { describe, expect, it } from 'vitest'

import {
  isStructuredProjectionTableCellInteractive,
  projectStructuredProjectionTableCellClassName,
  projectStructuredProjectionTableRowClassName,
} from './structured-projection-table-chrome'

describe('structured projection table chrome model', () => {
  it('projects pending row and column-kind cell classes outside the table renderer', () => {
    expect(projectStructuredProjectionTableRowClassName({ pending: true })).toBe('bg-warning/5')
    expect(projectStructuredProjectionTableRowClassName({ pending: false })).toBeUndefined()

    expect(projectStructuredProjectionTableCellClassName({ columnId: 'subject', index: 0 })).toContain('font-medium')
    expect(projectStructuredProjectionTableCellClassName({ columnId: 'subject', index: 0 })).toContain('text-foreground/80')
    expect(projectStructuredProjectionTableCellClassName({ columnId: 'https://schema.org/status', index: 1 })).toContain('border-l border-border/5')
    expect(projectStructuredProjectionTableCellClassName({ columnId: 'https://schema.org/status', index: 1 })).toContain('text-foreground/70')
    expect(projectStructuredProjectionTableCellClassName({ columnId: '__addPredicate', index: 2 })).toContain('text-muted-foreground/50')
  })

  it('keeps structured-only activation rules outside the generic table shell', () => {
    expect(isStructuredProjectionTableCellInteractive({ columnId: 'subject' })).toBe(false)
    expect(isStructuredProjectionTableCellInteractive({ columnId: '__addPredicate' })).toBe(false)
    expect(isStructuredProjectionTableCellInteractive({ columnId: 'https://schema.org/status' })).toBe(true)
  })
})
