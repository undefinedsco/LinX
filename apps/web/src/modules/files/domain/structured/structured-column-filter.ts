/**
 * Filtering a table's rows by one column's value (R6 K6 / K6d "按它筛选").
 *
 * A filter belongs to the view, not to the data: it hides rows, it never changes them. There is
 * at most one filter per column, so the chips under the toolbar read like a sentence.
 */
import { parseStructuredTypedLiteral } from './structured-table-cell-model'

export const STRUCTURED_SUBJECT_FILTER_KEY = 'subject'

export type StructuredColumnFilter =
  | { predicate: string; kind: 'values'; values: string[] }
  | { predicate: string; kind: 'contains'; text: string }
  | { predicate: string; kind: 'range'; min: string | null; max: string | null }
  | { predicate: string; kind: 'empty'; empty: boolean }

export type StructuredColumnFilterKind = StructuredColumnFilter['kind']
export type StructuredColumnValueKind = 'text' | 'number' | 'date' | 'boolean' | 'relation' | 'choice'

type FilterableRow = {
  subject: string
  cells: ReadonlyArray<{ predicate: string; values: readonly string[] }> | Readonly<Record<string, readonly string[]>>
}

/** What kind of value a column holds, from its value type text (`enum`, `xsd:integer`, ...). */
export function classifyStructuredColumnValueKind(valueType: string | null | undefined): StructuredColumnValueKind {
  const normalized = (valueType ?? '').toLowerCase()
  if (/bool/.test(normalized)) return 'boolean'
  if (/int|decimal|double|float|number|numeric/.test(normalized)) return 'number'
  if (/date|time/.test(normalized)) return 'date'
  if (/enum|choice|select|option/.test(normalized)) return 'choice'
  if (/relation|link|iri|uri|resource|reference|object|contact|url/.test(normalized)) return 'relation'
  return 'text'
}

/** The filter a column offers by default, from the kind of value it holds. */
export function defaultStructuredColumnFilterKind(kind: StructuredColumnValueKind): StructuredColumnFilterKind {
  if (kind === 'choice' || kind === 'boolean') return 'values'
  if (kind === 'number' || kind === 'date') return 'range'
  return 'contains'
}

/** A stored cell value as a person reads it: no quotes, no datatype, no angle brackets. */
export function normalizeStructuredFilterValue(raw: string): string {
  const typed = parseStructuredTypedLiteral(raw)
  if (typed) return typed.lexical.trim()
  const value = raw.trim()
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').trim()
  }
  if (value.length >= 2 && value.startsWith('<') && value.endsWith('>')) return value.slice(1, -1)
  return value
}

function subjectLabel(subject: string): string {
  const tail = subject.replace(/[/]+$/, '').split(/[#/]/).pop() ?? subject
  try {
    return decodeURIComponent(tail)
  } catch {
    return tail
  }
}

function rowCellValues(row: FilterableRow, predicate: string): readonly string[] {
  if (predicate === STRUCTURED_SUBJECT_FILTER_KEY) return [subjectLabel(row.subject)]
  const cells = row.cells
  if (Array.isArray(cells)) {
    return (cells as ReadonlyArray<{ predicate: string; values: readonly string[] }>)
      .find((cell) => cell.predicate === predicate)?.values ?? []
  }
  return (cells as Readonly<Record<string, readonly string[]>>)[predicate] ?? []
}

export function structuredRowFilterValues(row: FilterableRow, predicate: string): string[] {
  return rowCellValues(row, predicate)
    .map(normalizeStructuredFilterValue)
    .filter((value) => value.length > 0)
}

function toNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function compareScalar(value: string, bound: string): number {
  const left = toNumber(value)
  const right = toNumber(bound)
  if (left !== null && right !== null) return left - right
  return value.localeCompare(bound)
}

export function structuredRowMatchesColumnFilter(row: FilterableRow, filter: StructuredColumnFilter): boolean {
  const values = structuredRowFilterValues(row, filter.predicate)
  switch (filter.kind) {
    case 'values':
      return filter.values.length === 0 || values.some((value) => filter.values.includes(value))
    case 'contains': {
      const needle = filter.text.trim().toLowerCase()
      return !needle || values.some((value) => value.toLowerCase().includes(needle))
    }
    case 'range':
      if (filter.min === null && filter.max === null) return true
      return values.some((value) => (
        (filter.min === null || compareScalar(value, filter.min) >= 0)
        && (filter.max === null || compareScalar(value, filter.max) <= 0)
      ))
    case 'empty':
      return filter.empty ? values.length === 0 : values.length > 0
  }
}

/** A filter that would not hide anything is not a filter: it is dropped instead of shown as a chip. */
export function isStructuredColumnFilterActive(filter: StructuredColumnFilter): boolean {
  switch (filter.kind) {
    case 'values': return filter.values.length > 0
    case 'contains': return filter.text.trim().length > 0
    case 'range': return filter.min !== null || filter.max !== null
    case 'empty': return true
  }
}

export function applyStructuredColumnFilters<TRow extends FilterableRow>(
  rows: readonly TRow[],
  filters: readonly StructuredColumnFilter[],
): TRow[] {
  const active = filters.filter(isStructuredColumnFilterActive)
  if (active.length === 0) return [...rows]
  return rows.filter((row) => active.every((filter) => structuredRowMatchesColumnFilter(row, filter)))
}

export function findStructuredColumnFilter(
  filters: readonly StructuredColumnFilter[],
  predicate: string,
): StructuredColumnFilter | undefined {
  return filters.find((filter) => filter.predicate === predicate)
}

/** Sets (or, with an inactive filter, clears) the one filter a column can have. */
export function setStructuredColumnFilter(
  filters: readonly StructuredColumnFilter[],
  next: StructuredColumnFilter,
): StructuredColumnFilter[] {
  const without = filters.filter((filter) => filter.predicate !== next.predicate)
  return isStructuredColumnFilterActive(next) ? [...without, next] : without
}

export function removeStructuredColumnFilter(
  filters: readonly StructuredColumnFilter[],
  predicate: string,
): StructuredColumnFilter[] {
  return filters.filter((filter) => filter.predicate !== predicate)
}

/** The distinct values a column holds now, most used first, for the option list of a filter. */
export function collectStructuredColumnFilterValues(
  rows: readonly FilterableRow[],
  predicate: string,
  knownOptions: readonly string[] = [],
): string[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    for (const value of structuredRowFilterValues(row, predicate)) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  const known = knownOptions.filter((option) => option && !counts.has(option))
  const used = Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
    .map(([value]) => value)
  return [...used, ...known]
}

/** The sentence a chip shows, e.g. `状态：进行中、已完成` or `金额 ≥ 10`. */
export function describeStructuredColumnFilter(filter: StructuredColumnFilter, label: string): string {
  switch (filter.kind) {
    case 'values': return `${label}：${filter.values.join('、')}`
    case 'contains': return `${label} 包含“${filter.text.trim()}”`
    case 'range': {
      if (filter.min !== null && filter.max !== null) return `${label} ${filter.min} 到 ${filter.max}`
      if (filter.min !== null) return `${label} ≥ ${filter.min}`
      return `${label} ≤ ${filter.max}`
    }
    case 'empty': return filter.empty ? `${label} 为空` : `${label} 不为空`
  }
}

/** Reads filters saved with a view; anything malformed is dropped rather than shown as a broken chip. */
export function normalizeStructuredColumnFilters(value: unknown): StructuredColumnFilter[] {
  if (!Array.isArray(value)) return []
  const filters: StructuredColumnFilter[] = []
  const seen = new Set<string>()
  const optionalBound = (bound: unknown): string | null => (
    typeof bound === 'string' && bound.trim() ? bound.trim() : null
  )
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    const predicate = typeof candidate.predicate === 'string' ? candidate.predicate : ''
    if (!predicate || seen.has(predicate)) continue
    let filter: StructuredColumnFilter | null = null
    if (candidate.kind === 'values' && Array.isArray(candidate.values)) {
      filter = {
        predicate,
        kind: 'values',
        values: Array.from(new Set(candidate.values.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))),
      }
    } else if (candidate.kind === 'contains' && typeof candidate.text === 'string') {
      filter = { predicate, kind: 'contains', text: candidate.text }
    } else if (candidate.kind === 'range') {
      filter = { predicate, kind: 'range', min: optionalBound(candidate.min), max: optionalBound(candidate.max) }
    } else if (candidate.kind === 'empty' && typeof candidate.empty === 'boolean') {
      filter = { predicate, kind: 'empty', empty: candidate.empty }
    }
    if (!filter || !isStructuredColumnFilterActive(filter)) continue
    seen.add(predicate)
    filters.push(filter)
  }
  return filters
}
