import { describe, expect, it } from 'vitest'

import {
  createPredicateDefinitionDraft,
  predicateShapeFromDraft,
  reshapePredicateShapeForValueType,
} from './structured-predicate-draft'

describe('reshapePredicateShapeForValueType (R6 K6d 改值的类型)', () => {
  const draft = {
    ...createPredicateDefinitionDraft('udfs:Task'),
    type: 'enum',
    enumOptions: 'Ready, Blocked',
    required: true,
    minCount: '1',
    maxCount: '2',
    editorType: 'select',
  }

  it('swaps what belongs to the old type and keeps the table scope, required, counts and editor', () => {
    const shape = predicateShapeFromDraft(draft)
    expect(shape).toBe('class udfs:Task · required · option Ready · option Blocked · minCount 1 · maxCount 2 · editor select')

    expect(reshapePredicateShapeForValueType(shape, 'number')).toBe('class udfs:Task · required · datatype xsd:decimal · minCount 1 · maxCount 2 · editor select')
    expect(reshapePredicateShapeForValueType(shape, 'date')).toBe('class udfs:Task · required · datatype xsd:date · minCount 1 · maxCount 2 · editor select')
    expect(reshapePredicateShapeForValueType(shape, 'text')).toBe('class udfs:Task · required · minCount 1 · maxCount 2 · editor select')
  })

  it('writes the rules a new column of that type would get', () => {
    for (const type of ['text', 'number', 'date', 'boolean', 'enum', 'contact', 'relation', 'url']) {
      const fresh = { ...createPredicateDefinitionDraft('udfs:Task'), type }
      const old = { ...createPredicateDefinitionDraft('udfs:Task'), type: type === 'text' ? 'date' : 'text' }
      expect(reshapePredicateShapeForValueType(predicateShapeFromDraft(old), type)).toBe(predicateShapeFromDraft({ ...fresh, editorType: old.editorType }))
    }
  })

  it('keeps the options it is told to when the column becomes an option column', () => {
    expect(reshapePredicateShapeForValueType('class udfs:Task · datatype xsd:date', 'enum', ['A', 'B']))
      .toBe('class udfs:Task · option A · option B')
  })

  it('handles a column with no rule text yet', () => {
    expect(reshapePredicateShapeForValueType('', 'boolean')).toBe('datatype xsd:boolean')
    expect(reshapePredicateShapeForValueType('', 'text')).toBe('')
  })
})
