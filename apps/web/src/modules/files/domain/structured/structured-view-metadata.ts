import type { StructuredWhiteboardVisualRelation } from './structured-projections'

export type StructuredResourceViewMode = 'table' | 'kanban' | 'whiteboard' | 'raw'
export type StructuredSortDirection = 'asc' | 'desc'
export type StructuredColumnSizingState = Record<string, number>
export type StructuredKanbanOrderState = Record<string, string[]>

export interface StructuredWhiteboardPosition {
  x: number
  y: number
}

export interface StructuredKanbanBoardMetadataV1 {
  version: 1
  laneOrder: string[]
  collapsedLaneIds: string[]
  scrollLeft: number
  cardOrder: StructuredKanbanOrderState
}

export interface StructuredWhiteboardCamera {
  x: number
  y: number
  z: number
}

export type StructuredWhiteboardSnapshotNodeKind = 'subject' | 'file' | 'card' | 'group'

export interface StructuredWhiteboardSnapshotNode {
  resourceUri: string
  x: number
  y: number
  w: number
  h: number
  z: number
  groupId?: string
  shapeId?: string
  kind: StructuredWhiteboardSnapshotNodeKind
}

export interface StructuredWhiteboardSnapshotGroup {
  id: string
  title: string
  color: string
}

export interface StructuredWhiteboardSnapshotVisualRelation {
  id: string
  from: string
  to: string
  label?: string
  predicate?: string
}

export interface StructuredWhiteboardSnapshotV1 {
  version: 1
  camera: StructuredWhiteboardCamera
  nodes: StructuredWhiteboardSnapshotNode[]
  groups: StructuredWhiteboardSnapshotGroup[]
  visualRelations: StructuredWhiteboardSnapshotVisualRelation[]
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
  snapshot?: StructuredWhiteboardSnapshotV1 | null
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
  kanbanBoard?: StructuredKanbanBoardMetadataV1 | null
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

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? unique(value.filter((item): item is string => typeof item === 'string'))
    : []
}

function finiteRoundedNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function normalizeStructuredKanbanBoardMetadata(
  value: unknown,
  legacyCardOrder: StructuredKanbanOrderState = {},
): StructuredKanbanBoardMetadataV1 {
  if (!value || typeof value !== 'object' || (value as Record<string, unknown>).version !== 1) {
    return {
      version: 1,
      laneOrder: [],
      collapsedLaneIds: [],
      scrollLeft: 0,
      cardOrder: normalizeStructuredKanbanOrder(legacyCardOrder),
    }
  }
  const candidate = value as Record<string, unknown>
  return {
    version: 1,
    laneOrder: uniqueStrings(candidate.laneOrder),
    collapsedLaneIds: uniqueStrings(candidate.collapsedLaneIds),
    scrollLeft: Math.max(0, finiteRoundedNumber(candidate.scrollLeft, 0)),
    cardOrder: normalizeStructuredKanbanOrder(candidate.cardOrder),
  }
}

function normalizeWhiteboardCamera(value: unknown): StructuredWhiteboardCamera {
  if (!value || typeof value !== 'object') return { x: 0, y: 0, z: 1 }
  const candidate = value as Record<string, unknown>
  const zoom = finiteNumber(candidate.z, 1)
  return {
    x: finiteRoundedNumber(candidate.x, 0),
    y: finiteRoundedNumber(candidate.y, 0),
    z: zoom > 0 ? Math.max(0.05, zoom) : 1,
  }
}

function normalizeWhiteboardNodeKind(value: unknown): StructuredWhiteboardSnapshotNodeKind {
  return value === 'file' || value === 'card' || value === 'group' ? value : 'subject'
}

function normalizeWhiteboardSnapshotNodes(value: unknown): StructuredWhiteboardSnapshotNode[] {
  if (!Array.isArray(value)) return []
  const nodes: StructuredWhiteboardSnapshotNode[] = []
  const seenShapeIds = new Set<string>()
  const seenResourceUris = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    if (typeof candidate.resourceUri !== 'string' || !candidate.resourceUri) continue
    const shapeId = typeof candidate.shapeId === 'string' && candidate.shapeId ? candidate.shapeId : null
    if (shapeId ? seenShapeIds.has(shapeId) : seenResourceUris.has(candidate.resourceUri)) continue
    if (shapeId) seenShapeIds.add(shapeId)
    seenResourceUris.add(candidate.resourceUri)
    const node: StructuredWhiteboardSnapshotNode = {
      resourceUri: candidate.resourceUri,
      x: finiteRoundedNumber(candidate.x, 0),
      y: finiteRoundedNumber(candidate.y, 0),
      w: Math.max(1, finiteRoundedNumber(candidate.w, 288)),
      h: Math.max(1, finiteRoundedNumber(candidate.h, 160)),
      z: finiteRoundedNumber(candidate.z, nodes.length),
      kind: normalizeWhiteboardNodeKind(candidate.kind),
    }
    if (typeof candidate.groupId === 'string' && candidate.groupId) node.groupId = candidate.groupId
    if (shapeId) node.shapeId = shapeId
    nodes.push(node)
  }
  return nodes
}

function normalizeWhiteboardSnapshotGroups(value: unknown): StructuredWhiteboardSnapshotGroup[] {
  if (!Array.isArray(value)) return []
  const groups: StructuredWhiteboardSnapshotGroup[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    if (typeof candidate.id !== 'string' || !candidate.id || seen.has(candidate.id)) continue
    seen.add(candidate.id)
    groups.push({
      id: candidate.id,
      title: typeof candidate.title === 'string' ? candidate.title : '',
      color: typeof candidate.color === 'string' ? candidate.color : '',
    })
  }
  return groups
}

function normalizeWhiteboardSnapshotVisualRelations(value: unknown): StructuredWhiteboardSnapshotVisualRelation[] {
  if (!Array.isArray(value)) return []
  const relations: StructuredWhiteboardSnapshotVisualRelation[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    if (
      typeof candidate.id !== 'string'
      || !candidate.id
      || seen.has(candidate.id)
      || typeof candidate.from !== 'string'
      || !candidate.from
      || typeof candidate.to !== 'string'
      || !candidate.to
    ) continue
    seen.add(candidate.id)
    const relation: StructuredWhiteboardSnapshotVisualRelation = {
      id: candidate.id,
      from: candidate.from,
      to: candidate.to,
    }
    if (typeof candidate.label === 'string') relation.label = candidate.label
    if (typeof candidate.predicate === 'string' && candidate.predicate) relation.predicate = candidate.predicate
    relations.push(relation)
  }
  return relations
}

function legacyWhiteboardSnapshot(
  legacy: {
    positions?: Record<string, StructuredWhiteboardPosition>
    visualRelations?: readonly StructuredWhiteboardVisualRelation[]
  },
): StructuredWhiteboardSnapshotV1 {
  return {
    version: 1,
    camera: { x: 0, y: 0, z: 1 },
    nodes: Object.entries(legacy.positions ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([resourceUri, position], index) => ({
      resourceUri,
      x: Math.round(position.x),
      y: Math.round(position.y),
      w: 288,
      h: 160,
      z: index,
      kind: 'subject' as const,
      })),
    groups: [],
    visualRelations: (legacy.visualRelations ?? []).map((relation) => ({
      id: relation.id,
      from: relation.from,
      to: relation.to,
      label: relation.label,
    })),
  }
}

export function normalizeStructuredWhiteboardSnapshotMetadata(
  value: unknown,
  legacy: {
    positions?: Record<string, StructuredWhiteboardPosition>
    visualRelations?: readonly StructuredWhiteboardVisualRelation[]
  } = {},
): StructuredWhiteboardSnapshotV1 {
  if (!value || typeof value !== 'object' || (value as Record<string, unknown>).version !== 1) {
    return legacyWhiteboardSnapshot(legacy)
  }
  const candidate = value as Record<string, unknown>
  return {
    version: 1,
    camera: normalizeWhiteboardCamera(candidate.camera),
    nodes: normalizeWhiteboardSnapshotNodes(candidate.nodes),
    groups: normalizeWhiteboardSnapshotGroups(candidate.groups),
    visualRelations: normalizeWhiteboardSnapshotVisualRelations(candidate.visualRelations),
  }
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

function renderStructuredKanbanBoardLines(board: StructuredKanbanBoardMetadataV1 | null | undefined) {
  if (!board) return []
  const normalized = normalizeStructuredKanbanBoardMetadata(board)
  return [
    `  udfs:kanbanBoardVersion ${normalized.version} ;`,
    ...normalized.laneOrder.map((laneId, index) => (
      `  udfs:kanbanLaneOrder [ udfs:lane ${turtleString(laneId)} ; udfs:index ${index} ] ;`
    )),
    ...normalized.collapsedLaneIds.map((laneId) => (
      `  udfs:kanbanCollapsedLane ${turtleString(laneId)} ;`
    )),
    `  udfs:kanbanScrollLeft ${normalized.scrollLeft} ;`,
    ...Object.entries(normalized.cardOrder).flatMap(([laneId, subjects]) => (
      unique(subjects).map((subject, index) => (
        `  udfs:kanbanBoardCardOrder [ udfs:lane ${turtleString(laneId)} ; udfs:subject ${turtleString(subject)} ; udfs:index ${index} ] ;`
      ))
    )),
  ]
}

function renderStructuredWhiteboardSnapshotLines(snapshot: StructuredWhiteboardSnapshotV1 | null | undefined) {
  if (!snapshot) return []
  const normalized = normalizeStructuredWhiteboardSnapshotMetadata(snapshot)
  return [
    `  udfs:whiteboardSnapshotVersion ${normalized.version} ;`,
    `  udfs:whiteboardCamera [ udfs:x ${normalized.camera.x} ; udfs:y ${normalized.camera.y} ; udfs:z ${normalized.camera.z} ] ;`,
    ...normalized.nodes.map((node) => [
      `  udfs:whiteboardNode [ udfs:resource ${turtleString(node.resourceUri)} ;`,
      node.shapeId ? ` udfs:shapeId ${turtleString(node.shapeId)} ;` : '',
      ` udfs:kind ${turtleString(node.kind)} ; udfs:x ${node.x} ; udfs:y ${node.y} ; udfs:width ${node.w} ; udfs:height ${node.h} ; udfs:z ${node.z}`,
      node.groupId ? ` ; udfs:group ${turtleString(node.groupId)}` : '',
      ' ] ;',
    ].join('')),
    ...normalized.groups.map((group) => (
      `  udfs:whiteboardGroup [ udfs:id ${turtleString(group.id)} ; udfs:title ${turtleString(group.title)} ; udfs:color ${turtleString(group.color)} ] ;`
    )),
    ...normalized.visualRelations.map((relation) => [
      `  udfs:whiteboardSnapshotRelation [ udfs:id ${turtleString(relation.id)} ; udfs:fromSubject ${turtleString(relation.from)} ; udfs:toSubject ${turtleString(relation.to)}`,
      relation.label !== undefined ? ` ; udfs:label ${turtleString(relation.label)}` : '',
      relation.predicate ? ` ; udfs:predicate ${iriOrStringObject(relation.predicate)}` : '',
      ' ] ;',
    ].join('')),
  ]
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
    ...renderStructuredKanbanBoardLines(metadata.kanbanBoard),
    ...columnLines,
    ...selectedSubjectLines,
    ...positionLines,
    ...visualRelationLines,
    ...renderStructuredWhiteboardSnapshotLines(metadata.whiteboard.snapshot),
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

function parseKanbanBoardLaneOrder(source: string): string[] {
  const lanes: Array<{ laneId: string; index: number }> = []
  for (const block of readBlankNodeObjects(source, 'udfs:kanbanLaneOrder')) {
    const laneId = readFirstLiteral(block, 'udfs:lane')
    const index = readFirstNumber(block, 'udfs:index')
    if (!laneId || index === null || !Number.isInteger(index) || index < 0) continue
    lanes.push({ laneId, index })
  }
  const seen = new Set<string>()
  return lanes
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.laneId)
    .filter((laneId) => {
      if (seen.has(laneId)) return false
      seen.add(laneId)
      return true
    })
}

function parseKanbanBoardCardOrder(source: string): StructuredKanbanOrderState {
  const indexedByLane = new Map<string, Array<{ subject: string; index: number }>>()
  for (const block of readBlankNodeObjects(source, 'udfs:kanbanBoardCardOrder')) {
    const laneId = readFirstLiteral(block, 'udfs:lane')
    const subject = readFirstLiteral(block, 'udfs:subject')
    const index = readFirstNumber(block, 'udfs:index')
    if (!laneId || !subject || index === null || !Number.isInteger(index) || index < 0) continue
    const entries = indexedByLane.get(laneId) ?? []
    entries.push({ subject, index })
    indexedByLane.set(laneId, entries)
  }

  const order: StructuredKanbanOrderState = {}
  for (const [laneId, entries] of indexedByLane.entries()) {
    const seenSubjects = new Set<string>()
    const subjects = entries
      .sort((left, right) => left.index - right.index)
      .map((entry) => entry.subject)
      .filter((subject) => {
        if (seenSubjects.has(subject)) return false
        seenSubjects.add(subject)
        return true
      })
    if (subjects.length > 0) order[laneId] = subjects
  }
  return order
}

function parseKanbanBoardMetadata(source: string, legacyCardOrder: StructuredKanbanOrderState): StructuredKanbanBoardMetadataV1 {
  const version = readFirstNumber(source, 'udfs:kanbanBoardVersion')
  if (version !== 1) return normalizeStructuredKanbanBoardMetadata(null, legacyCardOrder)
  return normalizeStructuredKanbanBoardMetadata({
    version: 1,
    laneOrder: parseKanbanBoardLaneOrder(source),
    collapsedLaneIds: readRepeatedLiterals(source, 'udfs:kanbanCollapsedLane'),
    scrollLeft: readFirstNumber(source, 'udfs:kanbanScrollLeft') ?? 0,
    cardOrder: parseKanbanBoardCardOrder(source),
  }, legacyCardOrder)
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

function parseWhiteboardCamera(source: string): StructuredWhiteboardCamera {
  const block = readBlankNodeObjects(source, 'udfs:whiteboardCamera')[0]
  if (!block) return { x: 0, y: 0, z: 1 }
  return normalizeStructuredWhiteboardSnapshotMetadata({
    version: 1,
    camera: {
      x: readFirstNumber(block, 'udfs:x') ?? 0,
      y: readFirstNumber(block, 'udfs:y') ?? 0,
      z: readFirstNumber(block, 'udfs:z') ?? 1,
    },
    nodes: [],
    groups: [],
    visualRelations: [],
  }).camera
}

function parseWhiteboardSnapshotNodes(source: string): StructuredWhiteboardSnapshotNode[] {
  return normalizeStructuredWhiteboardSnapshotMetadata({
    version: 1,
    camera: { x: 0, y: 0, z: 1 },
    nodes: readBlankNodeObjects(source, 'udfs:whiteboardNode').map((block) => ({
      resourceUri: readFirstLiteral(block, 'udfs:resource') ?? '',
      shapeId: readFirstLiteral(block, 'udfs:shapeId') ?? undefined,
      kind: readFirstLiteral(block, 'udfs:kind') ?? undefined,
      x: readFirstNumber(block, 'udfs:x') ?? 0,
      y: readFirstNumber(block, 'udfs:y') ?? 0,
      w: readFirstNumber(block, 'udfs:width') ?? 288,
      h: readFirstNumber(block, 'udfs:height') ?? 160,
      z: readFirstNumber(block, 'udfs:z') ?? 0,
      groupId: readFirstLiteral(block, 'udfs:group') ?? undefined,
    })),
    groups: [],
    visualRelations: [],
  }).nodes
}

function parseWhiteboardSnapshotGroups(source: string): StructuredWhiteboardSnapshotGroup[] {
  return normalizeStructuredWhiteboardSnapshotMetadata({
    version: 1,
    camera: { x: 0, y: 0, z: 1 },
    nodes: [],
    groups: readBlankNodeObjects(source, 'udfs:whiteboardGroup').map((block) => ({
      id: readFirstLiteral(block, 'udfs:id') ?? '',
      title: readFirstLiteral(block, 'udfs:title') ?? '',
      color: readFirstLiteral(block, 'udfs:color') ?? '',
    })),
    visualRelations: [],
  }).groups
}

function parseWhiteboardSnapshotVisualRelations(source: string): StructuredWhiteboardSnapshotVisualRelation[] {
  return normalizeStructuredWhiteboardSnapshotMetadata({
    version: 1,
    camera: { x: 0, y: 0, z: 1 },
    nodes: [],
    groups: [],
    visualRelations: readBlankNodeObjects(source, 'udfs:whiteboardSnapshotRelation').map((block) => ({
      id: readFirstLiteral(block, 'udfs:id') ?? '',
      from: readFirstLiteral(block, 'udfs:fromSubject') ?? '',
      to: readFirstLiteral(block, 'udfs:toSubject') ?? '',
      label: readFirstLiteral(block, 'udfs:label') ?? undefined,
      predicate: readFirstIri(block, 'udfs:predicate') ?? readFirstLiteral(block, 'udfs:predicate') ?? undefined,
    })),
  }).visualRelations
}

function parseWhiteboardSnapshot(
  source: string,
  legacy: {
    positions: Record<string, StructuredWhiteboardPosition>
    visualRelations: StructuredWhiteboardVisualRelation[]
  },
): StructuredWhiteboardSnapshotV1 {
  const version = readFirstNumber(source, 'udfs:whiteboardSnapshotVersion')
  if (version !== 1) return normalizeStructuredWhiteboardSnapshotMetadata(null, legacy)
  return normalizeStructuredWhiteboardSnapshotMetadata({
    version: 1,
    camera: parseWhiteboardCamera(source),
    nodes: parseWhiteboardSnapshotNodes(source),
    groups: parseWhiteboardSnapshotGroups(source),
    visualRelations: parseWhiteboardSnapshotVisualRelations(source),
  }, legacy)
}

export function parseStructuredViewMetadataTurtle(source: string, fallbackDocumentUri: string): Required<StructuredViewMetadata> {
  const documentUri = readFirstIri(source, 'udfs:document') ?? fallbackDocumentUri
  const kanbanOrder = parseKanbanOrder(source)
  const whiteboardPositions = parseWhiteboardPositions(source)
  const whiteboardVisualRelations = parseWhiteboardVisualRelations(source)
  return {
    documentUri,
    viewMode: normalizeViewMode(readFirstLiteral(source, 'udfs:viewMode')),
    classScope: readFirstIri(source, 'udfs:classScope') ?? readFirstLiteral(source, 'udfs:classScope'),
    searchText: readFirstLiteral(source, 'udfs:searchText') ?? '',
    sortKey: readFirstIri(source, 'udfs:sortKey') ?? readFirstLiteral(source, 'udfs:sortKey'),
    sortDirection: normalizeSortDirection(readFirstLiteral(source, 'udfs:sortDirection')),
    hiddenPredicates: unique(readRepeatedLiteralOrIri(source, 'udfs:hiddenPredicate')),
    kanbanGroupPredicate: readFirstIri(source, 'udfs:kanbanGroupPredicate') ?? readFirstLiteral(source, 'udfs:kanbanGroupPredicate'),
    kanbanOrder,
    kanbanBoard: parseKanbanBoardMetadata(source, kanbanOrder),
    columnSizing: parseColumnSizing(source),
    whiteboard: {
      selectedSubjects: unique(readRepeatedLiterals(source, 'udfs:selectedSubject')),
      positions: whiteboardPositions,
      visualRelations: whiteboardVisualRelations,
      snapshot: parseWhiteboardSnapshot(source, {
        positions: whiteboardPositions,
        visualRelations: whiteboardVisualRelations,
      }),
    },
    writesCanonicalData: false,
  }
}
