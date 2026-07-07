import { describe, expect, it } from 'vitest'

import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import { resolveStructuredEffectiveClassScope } from './structured-view-state-model'

const projection: StructuredTableProjection = {
  prefixes: {},
  predicates: ['rdf:type', 'schema:name'],
  warnings: [],
  rows: [
    {
      subject: '#task',
      cells: [
        { predicate: 'rdf:type', values: ['schema:Task'] },
        { predicate: 'schema:name', values: ['Task'] },
      ],
    },
    {
      subject: '#note',
      cells: [
        { predicate: 'rdf:type', values: ['schema:Note'] },
        { predicate: 'schema:name', values: ['Note'] },
      ],
    },
  ],
}

describe('resolveStructuredEffectiveClassScope', () => {
  it('resolves requested class scope from the structured projection inside the view-state owner', () => {
    expect(resolveStructuredEffectiveClassScope(projection, 'schema:Note')).toBe('schema:Note')
    expect(resolveStructuredEffectiveClassScope(projection, 'schema:Missing')).toBe('schema:Note')
    expect(resolveStructuredEffectiveClassScope(projection, null)).toBe('schema:Note')
  })

  it('preserves a requested class when the projection has no observed class options', () => {
    expect(resolveStructuredEffectiveClassScope({
      prefixes: {},
      predicates: ['schema:name'],
      rows: [
        { subject: '#draft', cells: [{ predicate: 'schema:name', values: ['Draft'] }] },
      ],
      warnings: [],
    }, 'udfs:Draft')).toBe('udfs:Draft')
  })
})
