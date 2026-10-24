import { describe, expect, it } from 'vitest'

import { cardEditorKindForValueType, planCardNewProperty } from './card-new-property-model'

const base = {
  documentUri: 'https://pod.example/cards/t.ttl',
  classScope: 'schema:Thing',
  existingPredicates: ['http://schema.org/name'],
  currentPodRootUri: 'https://pod.example/',
}

describe('planCardNewProperty', () => {
  it('makes a vocabulary term for the table the card is a row of, usable at once', () => {
    const plan = planCardNewProperty({ ...base, label: '负责人', type: 'text' })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.proposal).toMatchObject({
      kind: 'vocab-term-proposal',
      termKind: 'predicate',
      label: '负责人',
      valueType: 'text',
      classScope: 'schema:Thing',
      documentUri: base.documentUri,
    })
    expect(plan.column).toMatchObject({ label: '负责人', editorKind: 'text', editorValues: [], valueTokens: [] })
    expect(plan.column.predicate).toMatch(/^https:\/\/undefineds\.co\/vocab\/p-/)
  })

  it('uses the editor of the picked type', () => {
    expect(cardEditorKindForValueType('number')).toBe('number')
    expect(cardEditorKindForValueType('enum')).toBe('multi-select')
    expect(cardEditorKindForValueType('url')).toBe('relation')
    expect(cardEditorKindForValueType('text')).toBe('text')
    const plan = planCardNewProperty({ ...base, label: '完成', type: 'boolean' })
    expect(plan.ok && plan.column).toMatchObject({ editorKind: 'boolean', editorValues: ['false'] })
  })

  it('refuses an empty name and a column the table already has', () => {
    expect(planCardNewProperty({ ...base, label: '  ', type: 'text' })).toEqual({ ok: false, reason: 'empty' })
    const first = planCardNewProperty({ ...base, label: '负责人', type: 'text' })
    if (!first.ok) throw new Error('expected a plan')
    expect(planCardNewProperty({ ...base, existingPredicates: [first.column.predicate], label: '负责人', type: 'text' }))
      .toEqual({ ok: false, reason: 'duplicate' })
  })
})
