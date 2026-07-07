import { describe, expect, it } from 'vitest'
import * as structuredCellEditorPlan from './domain/structured/structured-cell-editor-plan'
import {
  resolveStructuredCellEditorPlan,
  type StructuredCellEditorPredicateDefinition,
} from './domain/structured/structured-cell-editor-plan'

function definition(valueType: string): StructuredCellEditorPredicateDefinition {
  return {
    uri: `https://pod.example/.vocab/terms.ttl#${valueType}`,
    label: valueType,
    description: '',
    status: 'active',
    valueType,
    shape: '',
    shapeRules: [],
  }
}

describe('structured cell editor plan', () => {
  it('serializes inline editor display values into RDF cell values in the domain layer', () => {
    const serialize = (
      structuredCellEditorPlan as {
        serializeStructuredCellEditorValues?: (
          kind: 'text' | 'number' | 'date' | 'enum' | 'multi-select' | 'boolean' | 'relation',
          values: readonly string[],
        ) => string[]
      }
    ).serializeStructuredCellEditorValues

    expect(serialize).toBeTypeOf('function')
    if (!serialize) return

    expect(serialize('multi-select', ['source-linked', 'finance'])).toEqual([
      '"source-linked"',
      '"finance"',
    ])
    expect(serialize('enum', ['Needs review'])).toEqual(['"Needs review"'])
    expect(serialize('text', ['TASK "42"'])).toEqual(['"TASK \\"42\\""'])
    expect(serialize('number', ['57', '58'])).toEqual(['57'])
    expect(serialize('date', ['2026-07-01'])).toEqual(['"2026-07-01"^^xsd:date'])
    expect(serialize('boolean', ['false'])).toEqual(['false'])
    expect(serialize('relation', ['https://pod.example/cards/revised.md'])).toEqual([
      '<https://pod.example/cards/revised.md>',
    ])
  })

  it('treats code definitions as definition-driven inline text editors', () => {
    const plan = resolveStructuredCellEditorPlan(definition('code'), ['"TASK-42"'])

    expect(plan).toMatchObject({
      kind: 'scalar',
      scalarKind: 'text',
      value: 'TASK-42',
      definitionDriven: true,
    })
    expect(plan.kind === 'scalar' ? plan.commit('TASK-43') : null).toBe('"TASK-43"')
  })

  it('opens enum selectors for empty enum cells', () => {
    expect(resolveStructuredCellEditorPlan(definition('multi-select'), [])).toMatchObject({
      kind: 'enum',
      multi: true,
      definitionDriven: true,
    })
  })

  it('preserves full date datatype IRIs when committing typed date literals', () => {
    const plan = resolveStructuredCellEditorPlan(undefined, ['"2026-06-21"^^<http://www.w3.org/2001/XMLSchema#date>'])

    expect(plan).toMatchObject({
      kind: 'scalar',
      scalarKind: 'date',
      value: '2026-06-21',
      definitionDriven: false,
    })
    expect(plan.kind === 'scalar' ? plan.commit('2026-06-22') : null)
      .toBe('"2026-06-22"^^<http://www.w3.org/2001/XMLSchema#date>')
  })

  it('keeps undefined single literal predicates as scalar text instead of enum selectors', () => {
    const plan = resolveStructuredCellEditorPlan(undefined, ['"Needs review"'])

    expect(plan).toMatchObject({
      kind: 'scalar',
      scalarKind: 'text',
      value: 'Needs review',
      definitionDriven: false,
    })
  })

  it('uses relation editors for relation definitions before lexical fallback', () => {
    expect(resolveStructuredCellEditorPlan(definition('xsd:anyURI'), [])).toMatchObject({
      kind: 'relation',
      value: '',
      definitionDriven: true,
    })
  })
})
