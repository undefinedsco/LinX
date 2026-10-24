import { describe, expect, it } from 'vitest'

import {
  applyStructuredColumnFilters,
  classifyStructuredColumnValueKind,
  collectStructuredColumnFilterValues,
  defaultStructuredColumnFilterKind,
  describeStructuredColumnFilter,
  isStructuredColumnFilterActive,
  normalizeStructuredColumnFilters,
  normalizeStructuredFilterValue,
  removeStructuredColumnFilter,
  setStructuredColumnFilter,
  structuredRowMatchesColumnFilter,
  type StructuredColumnFilter,
} from './structured-column-filter'

const STATUS = 'https://undefineds.co/vocab/status'
const AMOUNT = 'https://undefineds.co/vocab/amount'
const DUE = 'https://undefineds.co/vocab/due'
const NOTE = 'https://undefineds.co/vocab/note'

const rows = [
  { subject: '#买菜', cells: [{ predicate: STATUS, values: ['"进行中"'] }, { predicate: AMOUNT, values: ['"30"^^xsd:integer'] }, { predicate: DUE, values: ['"2026-10-01"^^xsd:date'] }, { predicate: NOTE, values: ['"周末去"'] }] },
  { subject: '#写周报', cells: [{ predicate: STATUS, values: ['"已完成"'] }, { predicate: AMOUNT, values: ['5'] }, { predicate: DUE, values: ['"2026-11-15"^^xsd:date'] }] },
  { subject: '#订机票', cells: [{ predicate: STATUS, values: ['"进行中"', '"已完成"'] }, { predicate: AMOUNT, values: ['120'] }] },
  { subject: '#整理房间', cells: [] },
]

const subjects = (filters: StructuredColumnFilter[]) => applyStructuredColumnFilters(rows, filters).map((row) => row.subject)

describe('structured column filters', () => {
  it('reads cell values the way a person reads them', () => {
    expect(normalizeStructuredFilterValue('"进行中"')).toBe('进行中')
    expect(normalizeStructuredFilterValue('"2026-10-01"^^xsd:date')).toBe('2026-10-01')
    expect(normalizeStructuredFilterValue('"30"^^<http://www.w3.org/2001/XMLSchema#integer>')).toBe('30')
    expect(normalizeStructuredFilterValue('<https://example.org/a>')).toBe('https://example.org/a')
    expect(normalizeStructuredFilterValue('  12 ')).toBe('12')
  })

  it('filters by one or several option values (any of them)', () => {
    expect(subjects([{ predicate: STATUS, kind: 'values', values: ['进行中'] }])).toEqual(['#买菜', '#订机票'])
    expect(subjects([{ predicate: STATUS, kind: 'values', values: ['已完成'] }])).toEqual(['#写周报', '#订机票'])
    expect(subjects([{ predicate: STATUS, kind: 'values', values: ['进行中', '已完成'] }])).toEqual(['#买菜', '#写周报', '#订机票'])
  })

  it('filters text columns by contains, ignoring case, and the name column by the row name', () => {
    expect(subjects([{ predicate: NOTE, kind: 'contains', text: '周末' }])).toEqual(['#买菜'])
    expect(subjects([{ predicate: 'subject', kind: 'contains', text: '周报' }])).toEqual(['#写周报'])
    expect(applyStructuredColumnFilters(
      [{ subject: '#Alpha', cells: [] }, { subject: '#beta', cells: [] }],
      [{ predicate: 'subject', kind: 'contains', text: 'ALPHA' }],
    ).map((row) => row.subject)).toEqual(['#Alpha'])
  })

  it('filters numbers and dates by ranges, open at either end', () => {
    expect(subjects([{ predicate: AMOUNT, kind: 'range', min: '10', max: null }])).toEqual(['#买菜', '#订机票'])
    expect(subjects([{ predicate: AMOUNT, kind: 'range', min: null, max: '30' }])).toEqual(['#买菜', '#写周报'])
    expect(subjects([{ predicate: AMOUNT, kind: 'range', min: '6', max: '100' }])).toEqual(['#买菜'])
    expect(subjects([{ predicate: DUE, kind: 'range', min: '2026-10-15', max: '2026-12-31' }])).toEqual(['#写周报'])
    // 9 < 10 as numbers, even though "9" > "10" as text.
    expect(structuredRowMatchesColumnFilter({ subject: '#x', cells: [{ predicate: AMOUNT, values: ['9'] }] }, { predicate: AMOUNT, kind: 'range', min: '10', max: null })).toBe(false)
  })

  it('filters by empty and not empty', () => {
    expect(subjects([{ predicate: DUE, kind: 'empty', empty: true }])).toEqual(['#订机票', '#整理房间'])
    expect(subjects([{ predicate: DUE, kind: 'empty', empty: false }])).toEqual(['#买菜', '#写周报'])
  })

  it('combines filters on different columns (all of them must match)', () => {
    expect(subjects([
      { predicate: STATUS, kind: 'values', values: ['进行中'] },
      { predicate: AMOUNT, kind: 'range', min: '100', max: null },
    ])).toEqual(['#订机票'])
  })

  it('treats a filter that hides nothing as no filter', () => {
    const noop: StructuredColumnFilter[] = [
      { predicate: STATUS, kind: 'values', values: [] },
      { predicate: NOTE, kind: 'contains', text: '  ' },
      { predicate: AMOUNT, kind: 'range', min: null, max: null },
    ]
    expect(noop.some(isStructuredColumnFilterActive)).toBe(false)
    expect(subjects(noop)).toHaveLength(rows.length)
    expect(isStructuredColumnFilterActive({ predicate: DUE, kind: 'empty', empty: false })).toBe(true)
  })

  it('keeps at most one filter per column and drops it when it would hide nothing', () => {
    const first = setStructuredColumnFilter([], { predicate: STATUS, kind: 'values', values: ['进行中'] })
    const second = setStructuredColumnFilter(first, { predicate: AMOUNT, kind: 'range', min: '1', max: null })
    const replaced = setStructuredColumnFilter(second, { predicate: STATUS, kind: 'values', values: ['已完成'] })
    expect(replaced).toEqual([
      { predicate: AMOUNT, kind: 'range', min: '1', max: null },
      { predicate: STATUS, kind: 'values', values: ['已完成'] },
    ])
    expect(setStructuredColumnFilter(replaced, { predicate: STATUS, kind: 'values', values: [] })).toEqual([
      { predicate: AMOUNT, kind: 'range', min: '1', max: null },
    ])
    expect(removeStructuredColumnFilter(replaced, AMOUNT)).toEqual([{ predicate: STATUS, kind: 'values', values: ['已完成'] }])
  })

  it('lists the values a column holds, most used first, with known options last', () => {
    const withMore = [...rows, { subject: '#又一件', cells: [{ predicate: STATUS, values: ['"已完成"'] }] }]
    expect(collectStructuredColumnFilterValues(withMore, STATUS)).toEqual(['已完成', '进行中'])
    expect(collectStructuredColumnFilterValues(withMore, STATUS, ['待开始', '进行中'])).toEqual(['已完成', '进行中', '待开始'])
  })

  it('describes a filter as a short sentence for its chip', () => {
    expect(describeStructuredColumnFilter({ predicate: STATUS, kind: 'values', values: ['进行中', '已完成'] }, '状态')).toBe('状态：进行中、已完成')
    expect(describeStructuredColumnFilter({ predicate: NOTE, kind: 'contains', text: ' 周末 ' }, '备注')).toBe('备注 包含“周末”')
    expect(describeStructuredColumnFilter({ predicate: AMOUNT, kind: 'range', min: '10', max: '20' }, '金额')).toBe('金额 10 到 20')
    expect(describeStructuredColumnFilter({ predicate: AMOUNT, kind: 'range', min: '10', max: null }, '金额')).toBe('金额 ≥ 10')
    expect(describeStructuredColumnFilter({ predicate: AMOUNT, kind: 'range', min: null, max: '20' }, '金额')).toBe('金额 ≤ 20')
    expect(describeStructuredColumnFilter({ predicate: DUE, kind: 'empty', empty: true }, '截止')).toBe('截止 为空')
    expect(describeStructuredColumnFilter({ predicate: DUE, kind: 'empty', empty: false }, '截止')).toBe('截止 不为空')
  })

  it('reads saved filters and drops what is malformed or repeated', () => {
    expect(normalizeStructuredColumnFilters(undefined)).toEqual([])
    expect(normalizeStructuredColumnFilters([
      { predicate: STATUS, kind: 'values', values: ['进行中', 7, ''] },
      { predicate: STATUS, kind: 'contains', text: 'second filter for the same column' },
      { predicate: NOTE, kind: 'contains', text: '周末' },
      { predicate: AMOUNT, kind: 'range', min: '', max: '' },
      { predicate: DUE, kind: 'empty', empty: true },
      { kind: 'values', values: ['no predicate'] },
      null,
    ])).toEqual([
      { predicate: STATUS, kind: 'values', values: ['进行中'] },
      { predicate: NOTE, kind: 'contains', text: '周末' },
      { predicate: DUE, kind: 'empty', empty: true },
    ])
  })

  it('classifies a column by what it holds and picks the filter that suits it', () => {
    expect(classifyStructuredColumnValueKind('enum')).toBe('choice')
    expect(classifyStructuredColumnValueKind('xsd:integer')).toBe('number')
    expect(classifyStructuredColumnValueKind('date')).toBe('date')
    expect(classifyStructuredColumnValueKind('boolean')).toBe('boolean')
    expect(classifyStructuredColumnValueKind('url')).toBe('relation')
    expect(classifyStructuredColumnValueKind('contact')).toBe('relation')
    expect(classifyStructuredColumnValueKind(undefined)).toBe('text')
    expect(defaultStructuredColumnFilterKind('choice')).toBe('values')
    expect(defaultStructuredColumnFilterKind('boolean')).toBe('values')
    expect(defaultStructuredColumnFilterKind('number')).toBe('range')
    expect(defaultStructuredColumnFilterKind('date')).toBe('range')
    expect(defaultStructuredColumnFilterKind('text')).toBe('contains')
  })
})
