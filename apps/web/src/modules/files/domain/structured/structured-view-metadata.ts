import type { StructuredWhiteboardVisualRelation } from './structured-projections'

export type StructuredResourceViewMode = 'table' | 'kanban' | 'whiteboard' | 'raw'
export type StructuredSortDirection = 'asc' | 'desc'
export type StructuredColumnSizingState = Record<string, number>
export type StructuredKanbanOrderState = Record<string, string[]>

export interface StructuredWhiteboardPosition {
  x: number
  y: number
}

export interface StructuredViewConfig {
  viewMode: StructuredResourceViewMode
  classScope: string | null
  searchText: string
  sortKey: string | null
  sortDirection: StructuredSortDirection
  hiddenPredicates: string[]
  kanbanGroupPredicate: string | null
  kanbanOrder: StructuredKanbanOrderState
  columnSizing: StructuredColumnSizingState
}

export interface StructuredViewMetadataWhiteboard {
  selectedSubjects: string[]
  positions: Record<string, StructuredWhiteboardPosition>
  visualRelations?: StructuredWhiteboardVisualRelation[]
}

export interface StructuredViewMetadata {
  documentUri: string
  viewMode: StructuredResourceViewMode
  classScope: string | null
  searchText: string
  sortKey: string | null
  sortDirection: StructuredSortDirection
  hiddenPredicates: string[]
  kanbanGroupPredicate: string | null
  kanbanOrder?: StructuredKanbanOrderState
  columnSizing: StructuredColumnSizingState
  whiteboard: StructuredViewMetadataWhiteboard
  writesCanonicalData?: false
}

export const DEFAULT_STRUCTURED_VIEW_CONFIG: StructuredViewConfig = {
  viewMode: 'table',
  classScope: null,
  searchText: '',
  sortKey: null,
  sortDirection: 'asc',
  hiddenPredicates: [],
  kanbanGroupPredicate: null,
  kanbanOrder: {},
  columnSizing: {},
}

const UDFS_NAMESPACE = 'https://undefineds.co/vocab/'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function predicatePattern(predicate: string) {
  if (!predicate.startsWith('udfs:')) return escapeRegExp(predicate)
  const localName = predicate.slice('udfs:'.length)
  return `(?:${escapeRegExp(predicate)}|<${escapeRegExp(`${UDFS_NAMESPACE}${localName}`)}>)`
}

function turtleString(value: string) {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/"/g, '\\"')}"`
}

function unturtleString(value: string) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

function normalizeViewMode(value: string | null): StructuredResourceViewMode {
  return value === 'kanban' || value === 'whiteboard' || value === 'raw' ? value : 'table'
}

function normalizeSortDirection(value: string | null): StructuredSortDirection {
  return value === 'desc' ? 'desc' : 'asc'
}

export function normalizeStructuredSortDirection(value: unknown): StructuredSortDirection {
  return value === 'desc' ? 'desc' : 'asc'
}

export function normalizeStructuredViewMode(value: unknown): StructuredResourceViewMode {
  return value === 'kanban' || value === 'whiteboard' || value === 'raw' ? value : 'table'
}

export function normalizeStructuredColumnSizing(value: unknown): StructuredColumnSizingState {
  if (!value || typeof value !== 'object') return {}
  const sizing: StructuredColumnSizingState = {}
  for (const [key, width] of Object.entries(value as Record<string, unknown>)) {
    if (typeof width !== 'number' || !Number.isFinite(width)) continue
    sizing[key] = Math.round(width)
  }
  return sizing
}

export function normalizeStructuredKanbanOrder(value: unknown): StructuredKanbanOrderState {
  if (!value || typeof value !== 'object') return {}
  const order: StructuredKanbanOrderState = {}
  for (const [columnId, subjects] of Object.entries(value as Record<string, unknown>)) {
    if (!columnId || !Array.isArray(subjects)) continue
    const normalizedSubjects = Array.from(new Set(subjects.filter((subject): subject is string => typeof subject === 'string' && subject.length > 0)))
    if (normalizedSubjects.length > 0) order[columnId] = normalizedSubjects
  }
  return order
}

export function normalizeStructuredViewConfig(value: unknown): StructuredViewConfig | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const hiddenPredicates = Array.isArray(candidate.hiddenPredicates)
    ? candidate.hiddenPredicates.filter((predicate): predicate is string => typeof predicate === 'string')
    : []

  return {
    viewMode: normalizeStructuredViewMode(candidate.viewMode),
    classScope: typeof candidate.classScope === 'string' ? candidate.classScope : null,
    searchText: typeof candidate.searchText === 'string' ? candidate.searchText : '',
    sortKey: typeof candidate.sortKey === 'string' ? candidate.sortKey : null,
    sortDirection: normalizeStructuredSortDirection(candidate.sortDirection),
    hiddenPredicates,
    kanbanGroupPredicate: typeof candidate.kanbanGroupPredicate === 'string' ? candidate.kanbanGroupPredicate : null,
    kanbanOrder: normalizeStructuredKanbanOrder(candidate.kanbanOrder),
    columnSizing: normalizeStructuredColumnSizing(candidate.columnSizing),
  }
}

function isStructuredWhiteboardPosition(value: unknown): value is StructuredWhiteboardPosition {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.x === 'number'
    && typeof candidate.y === 'number'
    && Number.isFinite(candidate.x)
    && Number.isFinite(candidate.y)
}

export function normalizeStructuredWhiteboardLayouts(value: unknown): Record<string, Record<string, StructuredWhiteboardPosition>> {
  if (!value || typeof value !== 'object') return {}
  const layouts: Record<string, Record<string, StructuredWhiteboardPosition>> = {}
  for (const [layoutKey, layoutValue] of Object.entries(value as Record<string, unknown>)) {
    if (!layoutValue || typeof layoutValue !== 'object') continue
    const layout: Record<string, StructuredWhiteboardPosition> = {}
    for (const [subject, position] of Object.entries(layoutValue as Record<string, unknown>)) {
      if (!isStructuredWhiteboardPosition(position)) continue
      layout[subject] = {
        x: Math.round(position.x),
        y: Math.round(position.y),
      }
    }
    if (Object.keys(layout).length > 0) layouts[layoutKey] = layout
  }
  return layouts
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function iriOrStringObject(value: string) {
  if (value === 'subject') return turtleString(value)
  if (/^https?:\/\//.test(value)) return `<${value}>`
  return turtleString(value)
}

function readFirstLiteral(source: string, predicate: string): string | null {
  const match = source.match(new RegExp(`${predicatePattern(predicate)}\\s+"((?:\\\\.|[^"\\\\])*)"`))
  return match ? unturtleString(match[1]) : null
}

function readFirstIri(source: string, predicate: string): string | null {
  return source.match(new RegExp(`${predicatePattern(predicate)}\\s+<([^>]+)>`))?.[1] ?? null
}

function readRepeatedLiterals(source: string, predicate: string): string[] {
  return Array.from(source.matchAll(new RegExp(`${predicatePattern(predicate)}\\s+((?:"(?:\\\\.|[^"\\\\])*"\\s*(?:,\\s*)?)+)`, 'g')))
    .flatMap((match) => Array.from(match[1].matchAll(/"((?:\\.|[^"\\])*)"/g)))
    .map((match) => unturtleString(match[1]))
}

function readRepeatedLiteralOrIri(source: string, predicate: string): string[] {
  return Array.from(source.matchAll(new RegExp(`${predicatePattern(predicate)}\\s+((?:(?:<[^>]+>|"(?:\\\\.|[^"\\\\])*")\\s*(?:,\\s*)?)+)`, 'g')))
    .flatMap((match) => Array.from(match[1].matchAll(/<([^>]+)>|"((?:\\.|[^"\\])*)"/g)))
    .map((match) => match[1] ?? unturtleString(match[2]))
}

function readFirstNumber(source: string, predicate: string): number | null {
  const value = source.match(new RegExp(`${predicatePattern(predicate)}\\s+(-?\\d+(?:\\.\\d+)?)`))?.[1]
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readBlankNodeObjects(source: string, predicate: string): string[] {
  const inlineObjects = Array.from(source.matchAll(new RegExp(`${predicatePattern(predicate)}\\s+((?:\\[[\\s\\S]*?\\]\\s*(?:,\\s*)?)+)`, 'g')))
    .flatMap((match) => Array.from(match[1].matchAll(/\[([\s\S]*?)\]/g)))
    .map((match) => match[1])
  const labeledObjects = Array.from(source.matchAll(new RegExp(`${predicatePattern(predicate)}\\s+((?:_:[A-Za-z][A-Za-z0-9_-]*\\s*(?:[,;.]\\s*)?)+)`, 'g')))
    .flatMap((match) => Array.from(match[1].matchAll(/_:[A-Za-z][A-Za-z0-9_-]*/g)).map((labelMatch) => labelMatch[0]))
    .map((label) => {
      const statementPattern = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(label)}\\s+([\\s\\S]*?\\.)(?=\\s*(?:\\n|$))`, 'g')
      const statements = Array.from(source.matchAll(statementPattern)).map((match) => match[1])
      if (statements.length > 0) return statements.join('\n')
      const subjectLinePattern = new RegExp(`^\\s*${escapeRegExp(label)}\\s+`, 'm')
      return source
        .split('\n')
        .filter((line) => subjectLinePattern.test(line))
        .join('\n')
    })
    .filter(Boolean)
  return [...inlineObjects, ...labeledObjects]
}

function renderOptionalIriOrLiteralLine(predicate: string, value: string | null) {
  if (!value) return []
  return [`  ${predicate} ${iriOrStringObject(value)} ;`]
}

export function renderStructuredViewMetadataTurtle(metadata: StructuredViewMetadata) {
  const kanbanOrderLines = Object.entries(metadata.kanbanOrder ?? {})
    .flatMap(([columnId, subjects]) => unique(subjects).map((subject, index) => (
      `  udfs:kanbanCardOrder [ udfs:column ${turtleString(columnId)} ; udfs:subject ${turtleString(subject)} ; udfs:index ${index} ] ;`
    )))
  const columnLines = Object.entries(metadata.columnSizing)
    .filter(([, width]) => Number.isFinite(width) && width > 0)
    .map(([predicate, width]) => (
      `  udfs:columnWidth [ udfs:predicate ${iriOrStringObject(predicate)} ; udfs:width ${Math.round(width)} ] ;`
    ))
  const selectedSubjectLines = metadata.whiteboard.selectedSubjects.map((subject) => (
    `  udfs:selectedSubject ${turtleString(subject)} ;`
  ))
  const positionLines = Object.entries(metadata.whiteboard.positions)
    .filter(([, position]) => Number.isFinite(position.x) && Number.isFinite(position.y))
    .map(([subject, position]) => (
      `  udfs:whiteboardPosition [ udfs:subject ${turtleString(subject)} ; udfs:x ${Math.round(position.x)} ; udfs:y ${Math.round(position.y)} ] ;`
    ))
  const visualRelationLines = (metadata.whiteboard.visualRelations ?? [])
    .filter((relation) => relation.id && relation.from && relation.to)
    .map((relation) => (
      `  udfs:whiteboardVisualRelation [ udfs:id ${turtleString(relation.id)} ; udfs:fromSubject ${turtleString(relation.from)} ; udfs:toSubject ${turtleString(relation.to)} ; udfs:label ${turtleString(relation.label)} ] ;`
    ))

  return [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '',
    '<#view> a udfs:StructuredViewMetadata ;',
    `  udfs:document <${metadata.documentUri}> ;`,
    `  udfs:viewMode ${turtleString(metadata.viewMode)} ;`,
    ...renderOptionalIriOrLiteralLine('udfs:classScope', metadata.classScope),
    `  udfs:searchText ${turtleString(metadata.searchText)} ;`,
    ...renderOptionalIriOrLiteralLine('udfs:sortKey', metadata.sortKey),
    `  udfs:sortDirection ${turtleString(metadata.sortDirection)} ;`,
    ...unique(metadata.hiddenPredicates).map((predicate) => `  udfs:hiddenPredicate ${iriOrStringObject(predicate)} ;`),
    ...renderOptionalIriOrLiteralLine('udfs:kanbanGroupPredicate', metadata.kanbanGroupPredicate),
    ...kanbanOrderLines,
    ...columnLines,
    ...selectedSubjectLines,
    ...positionLines,
    ...visualRelationLines,
    '  udfs:writesCanonicalData false .',
  ].join('\n')
}

function parseColumnSizing(source: string): StructuredColumnSizingState {
  const sizing: StructuredColumnSizingState = {}
  const pattern = new RegExp(`${predicatePattern('udfs:columnWidth')}\\s+\\[\\s+${predicatePattern('udfs:predicate')}\\s+(?:<([^>]+)>|"((?:\\\\.|[^"\\\\])*)")\\s+;\\s+${predicatePattern('udfs:width')}\\s+(-?\\d+(?:\\.\\d+)?)\\s+\\]`, 'g')
  for (const match of source.matchAll(pattern)) {
    const predicate = match[1] ?? unturtleString(match[2])
    const width = Number(match[3])
    if (!predicate || !Number.isFinite(width) || width <= 0) continue
    sizing[predicate] = Math.round(width)
  }
  return sizing
}

function parseKanbanOrder(source: string): StructuredKanbanOrderState {
  const indexedByColumn = new Map<string, Array<{ subject: string; index: number }>>()
  const pattern = new RegExp(`${predicatePattern('udfs:kanbanCardOrder')}\\s+\\[\\s+${predicatePattern('udfs:column')}\\s+"((?:\\\\.|[^"\\\\])*)"\\s*;\\s+${predicatePattern('udfs:subject')}\\s+"((?:\\\\.|[^"\\\\])*)"\\s*;\\s+${predicatePattern('udfs:index')}\\s+(-?\\d+(?:\\.\\d+)?)\\s+\\]`, 'g')
  for (const match of source.matchAll(pattern)) {
    const columnId = unturtleString(match[1])
    const subject = unturtleString(match[2])
    const index = Number(match[3])
    if (!columnId || !subject || !Number.isInteger(index) || index < 0) continue
    const entries = indexedByColumn.get(columnId) ?? []
    entries.push({ subject, index })
    indexedByColumn.set(columnId, entries)
  }

  const order: StructuredKanbanOrderState = {}
  for (const [columnId, entries] of indexedByColumn.entries()) {
    const seenSubjects = new Set<string>()
    const subjects = entries
      .sort((left, right) => left.index - right.index)
      .map((entry) => entry.subject)
      .filter((subject) => {
        if (seenSubjects.has(subject)) return false
        seenSubjects.add(subject)
        return true
      })
    if (subjects.length > 0) order[columnId] = subjects
  }
  return order
}

function parseWhiteboardPositions(source: string): Record<string, StructuredWhiteboardPosition> {
  const positions: Record<string, StructuredWhiteboardPosition> = {}
  for (const block of readBlankNodeObjects(source, 'udfs:whiteboardPosition')) {
    const subject = readFirstLiteral(block, 'udfs:subject')
    const x = readFirstNumber(block, 'udfs:x')
    const y = readFirstNumber(block, 'udfs:y')
    if (!subject || x === null || y === null) continue
    positions[subject] = { x: Math.round(x), y: Math.round(y) }
  }
  return positions
}

function parseWhiteboardVisualRelations(source: string): StructuredWhiteboardVisualRelation[] {
  const relations: StructuredWhiteboardVisualRelation[] = []
  const seen = new Set<string>()
  for (const block of readBlankNodeObjects(source, 'udfs:whiteboardVisualRelation')) {
    const relation = {
      id: readFirstLiteral(block, 'udfs:id') ?? '',
      from: readFirstLiteral(block, 'udfs:fromSubject') ?? '',
      to: readFirstLiteral(block, 'udfs:toSubject') ?? '',
      label: readFirstLiteral(block, 'udfs:label') ?? '',
    }
    if (!relation.id || !relation.from || !relation.to || seen.has(relation.id)) continue
    seen.add(relation.id)
    relations.push(relation)
  }
  return relations
}

export function parseStructuredViewMetadataTurtle(source: string, fallbackDocumentUri: string): Required<StructuredViewMetadata> {
  const documentUri = readFirstIri(source, 'udfs:document') ?? fallbackDocumentUri
  return {
    documentUri,
    viewMode: normalizeViewMode(readFirstLiteral(source, 'udfs:viewMode')),
    classScope: readFirstIri(source, 'udfs:classScope') ?? readFirstLiteral(source, 'udfs:classScope'),
    searchText: readFirstLiteral(source, 'udfs:searchText') ?? '',
    sortKey: readFirstIri(source, 'udfs:sortKey') ?? readFirstLiteral(source, 'udfs:sortKey'),
    sortDirection: normalizeSortDirection(readFirstLiteral(source, 'udfs:sortDirection')),
    hiddenPredicates: unique(readRepeatedLiteralOrIri(source, 'udfs:hiddenPredicate')),
    kanbanGroupPredicate: readFirstIri(source, 'udfs:kanbanGroupPredicate') ?? readFirstLiteral(source, 'udfs:kanbanGroupPredicate'),
    kanbanOrder: parseKanbanOrder(source),
    columnSizing: parseColumnSizing(source),
    whiteboard: {
      selectedSubjects: unique(readRepeatedLiterals(source, 'udfs:selectedSubject')),
      positions: parseWhiteboardPositions(source),
      visualRelations: parseWhiteboardVisualRelations(source),
    },
    writesCanonicalData: false,
  }
}
