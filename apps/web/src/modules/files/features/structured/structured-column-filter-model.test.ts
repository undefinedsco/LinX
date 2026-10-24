import { describe, expect, it } from 'vitest'

import type { StructuredColumnFilter } from '../../domain/structured/structured-column-filter'
import type { StructuredVocabDefinitionIndex, StructuredVocabPredicateDefinition } from '../../domain/structured/structured-table'
import {
  projectStructuredColumnFilterChips,
  projectStructuredColumnFilterColumns,
} from './structured-column-filter-model'

const STATUS = 'https://undefineds.co/vocab/status'
const AMOUNT = 'https://undefineds.co/vocab/amount'
const NOTE = 'https://undefineds.co/vocab/note'

function definition(valueType: string, label: string): StructuredVocabPredicateDefinition {
  return { uri: `https://pod.example/.vocab/terms.ttl#${label}`, label, description: '', status: 'active', valueType, shape: '', shapeRules: [] }
}

const index = {
  classes: new Map(),
  predicates: new Map([[STATUS, definition('enum', '状态')], [AMOUNT, definition('number', '金额')]]),
  enumOptionsByPredicate: new Map(),
  shapesByTerm: new Map(),
  namespaces: new Map(),
} as StructuredVocabDefinitionIndex

const rows = [
  { subject: '#a', cells: [{ predicate: STATUS, values: ['"进行中"'] }, { predicate: AMOUNT, values: ['3'] }, { predicate: NOTE, values: ['"x"'] }] },
  { subject: '#b', cells: [{ predicate: STATUS, values: ['"已完成"'] }] },
]
const labels: Record<string, string> = { subject: '名称', [STATUS]: '状态', [AMOUNT]: '金额', [NOTE]: '备注' }
const labelOf = (predicate: string) => labels[predicate] ?? predicate

describe('column filter chips', () => {
  it('turns each filter into a removable chip with a sentence and a remove label', () => {
    const filters: StructuredColumnFilter[] = [
      { predicate: STATUS, kind: 'values', values: ['进行中'] },
      { predicate: AMOUNT, kind: 'range', min: '2', max: null },
    ]
    expect(projectStructuredColumnFilterChips(filters, labelOf)).toEqual([
      { predicate: STATUS, text: '状态：进行中', removeLabel: '去掉筛选：状态：进行中' },
      { predicate: AMOUNT, text: '金额 ≥ 2', removeLabel: '去掉筛选：金额 ≥ 2' },
    ])
  })

  it('reads yes/no filters as 是 / 否', () => {
    expect(projectStructuredColumnFilterChips(
      [{ predicate: 'done', kind: 'values', values: ['true'] }],
      () => '完成了吗',
      () => 'boolean',
    )[0]?.text).toBe('完成了吗：是')
  })

  it('has no chips when nothing is filtered', () => {
    expect(projectStructuredColumnFilterChips([], labelOf)).toEqual([])
  })
})

describe('toolbar filter columns', () => {
  it('offers 名称 first, then every shown column with the kind of value it holds', () => {
    const columns = projectStructuredColumnFilterColumns({
      filters: [{ predicate: STATUS, kind: 'values', values: ['进行中'] }],
      hiddenPredicates: new Set(),
      labelOf,
      predicates: [STATUS, AMOUNT, NOTE],
      rows,
      vocabDefinitionIndex: index,
      enumOptionsOf: (predicate) => (predicate === STATUS ? ['待开始'] : []),
    })
    expect(columns.map((column) => [column.label, column.valueKind])).toEqual([
      ['名称', 'text'],
      ['状态', 'choice'],
      ['金额', 'number'],
      ['备注', 'text'],
    ])
    expect(columns[1]).toMatchObject({ filter: { kind: 'values' }, values: ['进行中', '已完成', '待开始'] })
    // Only option columns carry a list of values to tick.
    expect(columns[2]?.values).toEqual([])
  })

  it('leaves out hidden and removed columns', () => {
    const columns = projectStructuredColumnFilterColumns({
      filters: [],
      hiddenPredicates: new Set([AMOUNT, NOTE]),
      labelOf,
      predicates: [STATUS, AMOUNT, NOTE],
      rows,
      vocabDefinitionIndex: index,
    })
    expect(columns.map((column) => column.label)).toEqual(['名称', '状态'])
  })
})
