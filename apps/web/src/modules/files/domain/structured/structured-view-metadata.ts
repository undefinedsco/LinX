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
  openViews: StructuredResourceViewMode[]
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
  openViews?: StructuredResourceViewMode[]
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
  openViews: [],
  classScope: null,
  searchText: '',
  sortKey: null,
  sortDirection: 'asc',
  hiddenPredicates: [],
  kanbanGroupPredicate: null,
  kanbanOrder: {},
  columnSizing: {},
}


export function normalizeStructuredSortDirection(value: unknown): StructuredSortDirection {
  return value === 'desc' ? 'desc' : 'asc'
}

export function normalizeStructuredViewMode(value: unknown): StructuredResourceViewMode {
  return value === 'kanban' || value === 'whiteboard' || value === 'raw' ? value : 'table'
}

export function normalizeStructuredOpenViews(value: unknown, viewMode: StructuredResourceViewMode = 'table'): StructuredResourceViewMode[] {
  const openViews: StructuredResourceViewMode[] = []
  const push = (mode: StructuredResourceViewMode) => {
    if (mode === 'table' || openViews.includes(mode)) return
    openViews.push(mode)
  }
  if (Array.isArray(value)) {
    for (const item of value) push(normalizeStructuredViewMode(item))
  }
  push(viewMode)
  return openViews
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

  const viewMode = normalizeStructuredViewMode(candidate.viewMode)
  return {
    viewMode,
    openViews: normalizeStructuredOpenViews(candidate.openViews, viewMode),
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

