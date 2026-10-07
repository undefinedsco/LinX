import type {
  StructuredShapeValidationWarning,
  StructuredTableProjection,
} from '../../domain/structured/structured-table'
import { documentCellKey } from '../../domain/structured/structured-table-cell-model'

export type StructuredProjectionTableRow = {
  subject: string
  pending?: boolean
  cells: Record<string, string[]>
}

export type StructuredProjectionCellValueResolver = (input: {
  subject: string
  predicate: string
  originalValues: string[]
}) => string[]

export type StructuredColumnVisibilityState = Record<string, boolean>

export function buildStructuredProjectionTableRows(input: {
  projection: Pick<StructuredTableProjection, 'predicates' | 'rows'>
  pendingPredicateIds: readonly string[]
  pendingSubjects: readonly string[]
  classScope?: string | null
  resolveCellValues: StructuredProjectionCellValueResolver
}): StructuredProjectionTableRow[] {
  return [
    ...input.projection.rows.map((row) => ({
      subject: row.subject,
      cells: {
        ...Object.fromEntries(input.projection.predicates.map((predicate) => {
          const originalValues = row.cells.find((cell) => cell.predicate === predicate)?.values ?? []
          return [
            predicate,
            input.resolveCellValues({
              originalValues,
              predicate,
              subject: row.subject,
            }),
          ]
        })),
        ...Object.fromEntries(input.pendingPredicateIds
          .filter((predicate) => !input.projection.predicates.includes(predicate))
          .map((predicate) => [predicate, []])),
      },
    })),
    ...input.pendingSubjects.map((subject) => {
      const pendingCells: Record<string, string[]> = input.classScope ? { 'rdf:type': [input.classScope] } : {}
      return {
        subject,
        pending: true,
        cells: pendingCells,
      }
    }),
  ]
}

export function getStructuredProjectionCellOriginalValues(input: {
  projection: Pick<StructuredTableProjection, 'rows'>
  subject: string
  predicate: string
}): string[] {
  return input.projection.rows
    .find((row) => row.subject === input.subject)
    ?.cells.find((cell) => cell.predicate === input.predicate)
    ?.values ?? []
}

export function getStructuredProjectionTablePredicateValues(input: {
  tableRows: readonly StructuredProjectionTableRow[]
  predicate: string
}): string[] {
  return input.tableRows.flatMap((tableRow) => tableRow.cells[input.predicate] ?? [])
}

export function getStructuredProjectionTableCellValues(input: {
  tableRows: readonly StructuredProjectionTableRow[]
  subject: string
  predicate: string
}): string[] {
  return input.tableRows.find((tableRow) => tableRow.subject === input.subject)?.cells[input.predicate] ?? []
}

export function compareStructuredProjectionTableRows(
  left: StructuredProjectionTableRow,
  right: StructuredProjectionTableRow,
  columnId: string,
): number {
  const leftValue = columnId === 'subject'
    ? left.subject
    : (left.cells[columnId] ?? []).join(' ')
  const rightValue = columnId === 'subject'
    ? right.subject
    : (right.cells[columnId] ?? []).join(' ')
  return leftValue.localeCompare(rightValue, 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  })
}

export function projectStructuredDisplayTableRows(input: {
  tableRows: readonly StructuredProjectionTableRow[]
  pendingWritesOnly: boolean
  pendingWriteSubjects: ReadonlySet<string>
}): StructuredProjectionTableRow[] {
  return input.pendingWritesOnly
    ? input.tableRows.filter((row) => input.pendingWriteSubjects.has(row.subject))
    : [...input.tableRows]
}

export function resolveStructuredVisiblePredicates(input: {
  projectionPredicates: readonly string[]
  pendingPredicateIds: readonly string[]
}): string[] {
  return Array.from(new Set([
    ...input.projectionPredicates,
    ...input.pendingPredicateIds,
  ]))
}

export function projectStructuredColumnVisibilityState(input: {
  visiblePredicates: readonly string[]
  hiddenPredicates: ReadonlySet<string>
}): StructuredColumnVisibilityState {
  return Object.fromEntries(
    input.visiblePredicates
      .filter((predicate) => input.hiddenPredicates.has(predicate))
      .map((predicate) => [predicate, false]),
  )
}

export function projectStructuredFooterPredicates(input: {
  visiblePredicates: readonly string[]
  hiddenPredicates: ReadonlySet<string>
}): string[] {
  return input.visiblePredicates.filter((predicate) => !input.hiddenPredicates.has(predicate))
}

export function buildStructuredShapeWarningMap(input: {
  documentUri: string
  shapeWarnings: readonly StructuredShapeValidationWarning[]
}): Map<string, StructuredShapeValidationWarning[]> {
  const warningMap = new Map<string, StructuredShapeValidationWarning[]>()
  for (const warning of input.shapeWarnings) {
    const key = documentCellKey(input.documentUri, warning.subject, warning.predicate)
    warningMap.set(key, [...(warningMap.get(key) ?? []), warning])
  }
  return warningMap
}
