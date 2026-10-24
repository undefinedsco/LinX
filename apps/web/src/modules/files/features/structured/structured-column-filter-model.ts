/**
 * What the toolbar and the chip row show about the person's column filters (R6 K6 / K6d).
 * The rows themselves are filtered in `domain/structured/structured-column-filter`.
 */
import {
  classifyStructuredColumnValueKind,
  collectStructuredColumnFilterValues,
  describeStructuredColumnFilter,
  findStructuredColumnFilter,
  STRUCTURED_SUBJECT_FILTER_KEY,
  type StructuredColumnFilter,
  type StructuredColumnValueKind,
} from '../../domain/structured/structured-column-filter'
import type { StructuredVocabDefinitionIndex } from '../../domain/structured/structured-table'
import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'
import { structuredBooleanFilterLabel } from './structured-column-header-menu-model'
import { projectStructuredPredicateTypeLabel } from './structured-predicate-column-header-model'

export type StructuredColumnFilterChip = {
  predicate: string
  text: string
  removeLabel: string
}

export type StructuredColumnFilterColumn = {
  predicate: string
  label: string
  valueKind: StructuredColumnValueKind
  filter?: StructuredColumnFilter
  /** Values to tick for a 选项 / 是否 column. */
  values: string[]
}

type FilterRow = { subject: string; cells: ReadonlyArray<{ predicate: string; values: readonly string[] }> }

export function projectStructuredColumnFilterChips(
  filters: readonly StructuredColumnFilter[],
  labelOf: (predicate: string) => string,
  valueKindOf: (predicate: string) => StructuredColumnValueKind = () => 'text',
): StructuredColumnFilterChip[] {
  return filters.map((filter) => {
    const label = labelOf(filter.predicate)
    const shown = filter.kind === 'values' && valueKindOf(filter.predicate) === 'boolean'
      ? { ...filter, values: filter.values.map(structuredBooleanFilterLabel) }
      : filter
    const text = describeStructuredColumnFilter(shown, label)
    return { predicate: filter.predicate, text, removeLabel: `去掉筛选：${text}` }
  })
}

/** The columns the 筛选 menu offers, 名称 first, then every column the table shows. */
export function projectStructuredColumnFilterColumns({
  filters,
  hiddenPredicates,
  labelOf,
  predicates,
  rows,
  vocabDefinitionIndex,
  enumOptionsOf,
}: {
  filters: readonly StructuredColumnFilter[]
  hiddenPredicates: ReadonlySet<string>
  labelOf: (predicate: string) => string
  predicates: readonly string[]
  rows: readonly FilterRow[]
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex
  enumOptionsOf?: (predicate: string) => readonly string[]
}): StructuredColumnFilterColumn[] {
  const definitionOf = (predicate: string) => (
    vocabDefinitionIndex?.predicates.get(predicate)
    ?? vocabDefinitionIndex?.predicates.get(localPredicateLabel(predicate))
  )
  const columns: StructuredColumnFilterColumn[] = [{
    predicate: STRUCTURED_SUBJECT_FILTER_KEY,
    label: labelOf(STRUCTURED_SUBJECT_FILTER_KEY),
    valueKind: 'text',
    filter: findStructuredColumnFilter(filters, STRUCTURED_SUBJECT_FILTER_KEY),
    values: [],
  }]
  for (const predicate of predicates) {
    if (hiddenPredicates.has(predicate)) continue
    const observed = rows.flatMap((row) => row.cells.find((cell) => cell.predicate === predicate)?.values ?? [])
    const valueKind = classifyStructuredColumnValueKind(projectStructuredPredicateTypeLabel(definitionOf(predicate), observed))
    columns.push({
      predicate,
      label: labelOf(predicate),
      valueKind,
      filter: findStructuredColumnFilter(filters, predicate),
      values: valueKind === 'choice' ? collectStructuredColumnFilterValues(rows, predicate, enumOptionsOf?.(predicate) ?? []) : [],
    })
  }
  return columns
}
