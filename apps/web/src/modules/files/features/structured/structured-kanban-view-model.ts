import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import {
  projectStructuredKanban,
  type StructuredCardProjection,
  type StructuredKanbanColumn,
  type StructuredKanbanProjection,
} from '../../domain/structured/structured-projections'
import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'

export type { StructuredCardProjection, StructuredKanbanColumn }

export type StructuredKanbanPredicateOption = {
  predicate: string
  label: string
}

export type StructuredKanbanChrome = {
  emptyStateMessage: string
  groupPredicateButtonAriaLabel: string
}

export type StructuredKanbanColumnChrome = {
  ariaLabel: string
}

export type StructuredKanbanCardChrome = {
  openAriaLabel: string
  moveButtonAriaLabel: string
}

export type StructuredKanbanMoveTargetChrome = {
  moveMenuItemLabel: string
}

export type StructuredKanbanMoveTargetColumn = Pick<StructuredKanbanColumn, 'id' | 'label' | 'value'> & StructuredKanbanMoveTargetChrome

export type StructuredKanbanCardView = StructuredCardProjection & StructuredKanbanCardChrome & {
  visibleTags: string[]
}

export type StructuredKanbanDisplayColumn = Omit<StructuredKanbanColumn, 'cards'> & StructuredKanbanColumnChrome & {
  cardCountLabel: string
  cardSubjects: string[]
  cards: StructuredKanbanCardView[]
}

export type StructuredKanbanNativeDragState = {
  draggingSubject: string | null
  dragOverColumnId: string | null
}

export type StructuredKanbanDndDragEndPlan =
  | { kind: 'none' }
  | { kind: 'reorder'; columnId: string; subject: string; overSubject: string }
  | { kind: 'cross-column'; subject: string; targetColumn: StructuredKanbanDisplayColumn; overSubject?: string }

const STRUCTURED_KANBAN_VISIBLE_TAG_LIMIT = 3

export function createStructuredKanbanNativeDragState(): StructuredKanbanNativeDragState {
  return {
    draggingSubject: null,
    dragOverColumnId: null,
  }
}

export function projectStructuredKanbanNativeDragStarted({
  subject,
}: {
  subject: string
}): StructuredKanbanNativeDragState {
  return {
    draggingSubject: subject,
    dragOverColumnId: null,
  }
}

export function projectStructuredKanbanNativeDragOverColumn({
  current,
  columnId,
}: {
  current: StructuredKanbanNativeDragState
  columnId: string
}): StructuredKanbanNativeDragState {
  if (!current.draggingSubject) return createStructuredKanbanNativeDragState()

  return {
    ...current,
    dragOverColumnId: columnId,
  }
}

export function projectStructuredKanbanNativeDragLeftColumn({
  current,
  columnId,
}: {
  current: StructuredKanbanNativeDragState
  columnId: string
}): StructuredKanbanNativeDragState {
  if (current.dragOverColumnId !== columnId) return current

  return {
    ...current,
    dragOverColumnId: null,
  }
}

export function projectStructuredKanbanNativeDragCleared(): StructuredKanbanNativeDragState {
  return createStructuredKanbanNativeDragState()
}

/**
 * K6d: lanes added by hand are empty lanes whose id is their name and whose value
 * is that name as a text value, so dragging a card there writes the name into the
 * grouping property. Renamed lanes only change the label.
 */
/**
 * K6d: grouping by a 选项 property shows one lane per option, empty ones included. Enum cells
 * store the option label, so option lanes behave like lanes added by hand (`extraLanes`).
 */
/** Option labels of the grouping property, in the order the options were defined. */
export function kanbanOptionLabels(
  groupPredicate: string | null | undefined,
  enumOptionsByPredicate: ReadonlyMap<string, ReadonlyArray<{ label: string }>> | undefined,
): string[] {
  if (!groupPredicate || !enumOptionsByPredicate) return []
  let options = enumOptionsByPredicate.get(groupPredicate)
  if (!options) {
    const local = localPredicateLabel(groupPredicate)
    for (const [key, value] of enumOptionsByPredicate) {
      if (localPredicateLabel(key) === local) { options = value; break }
    }
  }
  const labels: string[] = []
  for (const option of options ?? []) {
    const label = option.label.trim()
    if (label && !labels.includes(label)) labels.push(label)
  }
  return labels
}

export function mergeKanbanOptionLanes(
  extraLanes: readonly string[] | undefined,
  groupPredicate: string | null | undefined,
  enumOptionsByPredicate: ReadonlyMap<string, ReadonlyArray<{ label: string }>> | undefined,
): string[] {
  const lanes = [...(extraLanes ?? [])]
  for (const label of kanbanOptionLabels(groupPredicate, enumOptionsByPredicate)) {
    if (!lanes.includes(label)) lanes.push(label)
  }
  return lanes
}

export function applyStructuredKanbanLaneCustomization(
  kanban: StructuredKanbanProjection,
  { extraLanes = [], laneLabels = {}, optionOrder = [] }: {
    extraLanes?: readonly string[]
    laneLabels?: Record<string, string>
    /** Option labels in definition order: the default lane order when no lane order was saved. */
    optionOrder?: readonly string[]
  },
): StructuredKanbanProjection {
  const columns = kanban.columns.map((column) => ({ ...column }))
  if (kanban.groupPredicate) {
    const existing = new Set(columns.map((column) => column.id))
    for (const name of extraLanes) {
      if (existing.has(name)) continue
      existing.add(name)
      const unassignedIndex = columns.findIndex((column) => column.id === 'unassigned')
      const lane = { id: name, label: name, value: JSON.stringify(name), cards: [] }
      if (unassignedIndex >= 0) columns.splice(unassignedIndex, 0, lane)
      else columns.push(lane)
    }
  }
  if (optionOrder.length > 0) {
    const rank = (column: { id: string }) => {
      if (column.id === 'unassigned') return optionOrder.length + 1
      const index = optionOrder.indexOf(column.id)
      return index >= 0 ? index : optionOrder.length
    }
    columns.sort((left, right) => rank(left) - rank(right))
  }
  return {
    ...kanban,
    columns: columns.map((column) => ({
      ...column,
      label: laneLabels[column.id] ?? (column.id === 'unassigned' ? '未分组' : column.label),
    })),
  }
}

export function projectStructuredKanbanSourceModel({
  groupPredicate,
  kanbanOrder,
  projection,
  extraLanes,
  laneLabels,
  optionOrder,
}: {
  projection: StructuredTableProjection
  groupPredicate: string | null
  kanbanOrder: Record<string, string[]>
  extraLanes?: readonly string[]
  laneLabels?: Record<string, string>
  optionOrder?: readonly string[]
}): {
  kanban: StructuredKanbanProjection
  chrome: StructuredKanbanChrome
  hasColumns: boolean
  hasPredicateOptions: boolean
  groupLabel: string
  groupTriggerLabel: string
  predicateOptions: StructuredKanbanPredicateOption[]
} {
  const kanban = applyStructuredKanbanLaneCustomization(
    projectStructuredKanban(projection, groupPredicate ?? undefined, kanbanOrder),
    { extraLanes, laneLabels, optionOrder },
  )
  const predicateOptions = projection.predicates.map((predicate) => ({ predicate, label: localPredicateLabel(predicate) }))

  return {
    kanban,
    chrome: projectStructuredKanbanChrome(),
    hasColumns: kanban.columns.length > 0,
    hasPredicateOptions: predicateOptions.length > 0,
    groupLabel: kanban.groupPredicate ? `按“${localPredicateLabel(kanban.groupPredicate)}”分组` : '还没有分组，选一个属性来分列',
    groupTriggerLabel: kanban.groupPredicate ? localPredicateLabel(kanban.groupPredicate) : '分组',
    predicateOptions,
  }
}

export function projectStructuredKanbanChrome(): StructuredKanbanChrome {
  return {
    emptyStateMessage: '这张表里还没有卡片。',
    groupPredicateButtonAriaLabel: '看板分组',
  }
}

export function projectStructuredKanbanDisplayColumns(
  columns: readonly StructuredKanbanColumn[],
): StructuredKanbanDisplayColumn[] {
  return columns.map((column) => ({
    ...column,
    ...projectStructuredKanbanColumnChrome(column.label),
    cardCountLabel: String(column.cards.length),
    cardSubjects: column.cards.map((card) => card.subject),
    cards: column.cards.map((card) => ({
      ...card,
      ...projectStructuredKanbanCardChrome(card.title),
      visibleTags: projectStructuredKanbanCardVisibleTags(card),
    })),
  }))
}

export function projectStructuredKanbanCardVisibleTags(
  card: Pick<StructuredCardProjection, 'tags'>,
): string[] {
  return card.tags.slice(0, STRUCTURED_KANBAN_VISIBLE_TAG_LIMIT)
}

export function projectStructuredKanbanColumnChrome(label: string): StructuredKanbanColumnChrome {
  return {
    ariaLabel: `看板列 ${label}`,
  }
}

export function projectStructuredKanbanCardChrome(title: string): StructuredKanbanCardChrome {
  return {
    openAriaLabel: `打开 ${title}`,
    moveButtonAriaLabel: `移动 ${title}`,
  }
}

export function projectStructuredKanbanMoveTargetChrome(label: string): StructuredKanbanMoveTargetChrome {
  return {
    moveMenuItemLabel: `移动到 ${label}`,
  }
}

export function projectStructuredKanbanCardBySubject(
  displayColumns: readonly StructuredKanbanDisplayColumn[],
) {
  return new Map(displayColumns.flatMap((column) => column.cards.map((card) => [card.subject, card] as const)))
}

export function findStructuredKanbanColumnForSubject(
  displayColumns: readonly StructuredKanbanDisplayColumn[],
  subject: string,
) {
  return displayColumns.find((column) => column.cards.some((candidate) => candidate.subject === subject))
}

export function findStructuredKanbanTargetColumnForDndOverId(
  displayColumns: readonly StructuredKanbanDisplayColumn[],
  overId: string,
) {
  return displayColumns.find((column) => (
    column.id === overId
    || column.cards.some((candidate) => candidate.subject === overId)
  ))
}

export function projectStructuredKanbanDndDragEndPlan({
  displayColumns,
  overId,
  subject,
}: {
  displayColumns: readonly StructuredKanbanDisplayColumn[]
  subject: string
  overId: string | null
}): StructuredKanbanDndDragEndPlan {
  if (!overId) return { kind: 'none' }
  const sourceColumn = findStructuredKanbanColumnForSubject(displayColumns, subject)
  const targetColumn = findStructuredKanbanTargetColumnForDndOverId(displayColumns, overId)
  if (!targetColumn) return { kind: 'none' }
  if (sourceColumn?.id === targetColumn.id) {
    return overId === targetColumn.id
      ? { kind: 'none' }
      : {
        kind: 'reorder',
        columnId: targetColumn.id,
        subject,
        overSubject: overId,
      }
  }

  return {
    kind: 'cross-column',
    subject,
    targetColumn,
    ...(overId === targetColumn.id ? {} : { overSubject: overId }),
  }
}

export function projectStructuredKanbanMoveTargets({
  canCommitCrossColumnMoves,
  columnId,
  columns,
}: {
  canCommitCrossColumnMoves: boolean
  columns: readonly Pick<StructuredKanbanColumn, 'id' | 'label' | 'value'>[]
  columnId: string
}): StructuredKanbanMoveTargetColumn[] {
  return canCommitCrossColumnMoves
    ? columns
      .filter((candidate) => candidate.id !== columnId)
      .map((candidate) => ({
        ...candidate,
        ...projectStructuredKanbanMoveTargetChrome(candidate.label),
      }))
    : []
}

export function hasStructuredKanbanMoveTargets(
  columns: readonly StructuredKanbanMoveTargetColumn[],
) {
  return columns.length > 0
}

function displayKanbanFieldValue(value: string) {
  if (value.trim().startsWith('"')) return value.replace(/^"/, '').replace(/"(?:@[A-Za-z-]+|\^\^.+)?$/, '')
  return localPredicateLabel(value.replace(/^<|>$/g, ''))
}

/** K6d: 「属性：值」 lines shown on each card for the properties the board displays. */
export function buildKanbanCardFactLines(
  rows: StructuredTableProjection['rows'],
  fields: readonly string[],
  predicateLabel: (predicate: string) => string = localPredicateLabel,
): Map<string, string[]> {
  if (fields.length === 0) return new Map()
  return new Map(rows.map((row) => [row.subject, fields.flatMap((predicate) => {
    const values = row.cells.find((cell) => cell.predicate === predicate)?.values ?? []
    const text = values.map(displayKanbanFieldValue).filter(Boolean).join('、')
    return text ? [`${predicateLabel(predicate)}：${text}`] : []
  })]))
}
