import { describe, expect, it } from 'vitest'

import {
  planStructuredColumnFilterDialogSubmit,
  projectStructuredColumnFilterDialogDraft,
  projectStructuredColumnTypeDialogCurrent,
} from './structured-column-dialog-model'

describe('column filter dialog', () => {
  it('starts from the filter the column has, or from the condition that suits its kind', () => {
    expect(projectStructuredColumnFilterDialogDraft(undefined, 'text')).toEqual({ mode: 'contains', text: '', min: '', max: '' })
    expect(projectStructuredColumnFilterDialogDraft(undefined, 'number').mode).toBe('range')
    expect(projectStructuredColumnFilterDialogDraft(undefined, 'date').mode).toBe('range')
    expect(projectStructuredColumnFilterDialogDraft({ predicate: 'a', kind: 'contains', text: '周末' }, 'text')).toMatchObject({ mode: 'contains', text: '周末' })
    expect(projectStructuredColumnFilterDialogDraft({ predicate: 'a', kind: 'range', min: '1', max: null }, 'number')).toMatchObject({ mode: 'range', min: '1', max: '' })
    expect(projectStructuredColumnFilterDialogDraft({ predicate: 'a', kind: 'empty', empty: true }, 'text').mode).toBe('empty')
    expect(projectStructuredColumnFilterDialogDraft({ predicate: 'a', kind: 'empty', empty: false }, 'text').mode).toBe('filled')
  })

  it('hands back the filter the person described, trimmed', () => {
    expect(planStructuredColumnFilterDialogSubmit({ mode: 'contains', text: ' 周末 ', min: '', max: '' }, 'a')).toEqual({ predicate: 'a', kind: 'contains', text: '周末' })
    expect(planStructuredColumnFilterDialogSubmit({ mode: 'range', text: '', min: ' 10', max: '' }, 'a')).toEqual({ predicate: 'a', kind: 'range', min: '10', max: null })
    expect(planStructuredColumnFilterDialogSubmit({ mode: 'empty', text: 'ignored', min: '', max: '' }, 'a')).toEqual({ predicate: 'a', kind: 'empty', empty: true })
    expect(planStructuredColumnFilterDialogSubmit({ mode: 'filled', text: '', min: '', max: '' }, 'a')).toEqual({ predicate: 'a', kind: 'empty', empty: false })
  })

  it('hands back nothing, which clears the filter, when the condition is blank', () => {
    expect(planStructuredColumnFilterDialogSubmit({ mode: 'contains', text: '   ', min: '', max: '' }, 'a')).toBeNull()
    expect(planStructuredColumnFilterDialogSubmit({ mode: 'range', text: '', min: '', max: ' ' }, 'a')).toBeNull()
  })
})

describe('column type dialog', () => {
  it('marks the type option a stored value type stands for', () => {
    expect(projectStructuredColumnTypeDialogCurrent('enum')).toBe('enum')
    expect(projectStructuredColumnTypeDialogCurrent('URL')).toBe('url')
    expect(projectStructuredColumnTypeDialogCurrent('xsd:integer')).toBe('number')
    expect(projectStructuredColumnTypeDialogCurrent('xsd:date')).toBe('date')
    expect(projectStructuredColumnTypeDialogCurrent('select')).toBe('enum')
    expect(projectStructuredColumnTypeDialogCurrent('observed')).toBe('text')
  })
})
