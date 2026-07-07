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
  | { kind: 'cross-column'; subject: string; targetColumn: StructuredKanbanDisplayColumn }

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

export function projectStructuredKanbanSourceModel({
  groupPredicate,
  kanbanOrder,
  projection,
}: {
  projection: StructuredTableProjection
  groupPredicate: string | null
  kanbanOrder: Record<string, string[]>
}): {
  kanban: StructuredKanbanProjection
  chrome: StructuredKanbanChrome
  hasColumns: boolean
  hasPredicateOptions: boolean
  groupLabel: string
  groupTriggerLabel: string
  predicateOptions: StructuredKanbanPredicateOption[]
} {
  const kanban = projectStructuredKanban(projection, groupPredicate ?? undefined, kanbanOrder)
  const predicateOptions = projection.predicates.map((predicate) => ({ predicate, label: localPredicateLabel(predicate) }))

  return {
    kanban,
    chrome: projectStructuredKanbanChrome(),
    hasColumns: kanban.columns.length > 0,
    hasPredicateOptions: predicateOptions.length > 0,
    groupLabel: kanban.groupPredicate ? `按 ${localPredicateLabel(kanban.groupPredicate)} 分组` : '按未分组展示',
    groupTriggerLabel: kanban.groupPredicate ? localPredicateLabel(kanban.groupPredicate) : '分组',
    predicateOptions,
  }
}

export function projectStructuredKanbanChrome(): StructuredKanbanChrome {
  return {
    emptyStateMessage: '没有可投影到 Kanban 的 subject。',
    groupPredicateButtonAriaLabel: 'Kanban 分组 predicate',
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
      ...projectStructuredKanbanCardChrome(card.subject),
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
    ariaLabel: `Kanban column ${label}`,
  }
}

export function projectStructuredKanbanCardChrome(subject: string): StructuredKanbanCardChrome {
  return {
    openAriaLabel: `打开 subject ${subject}`,
    moveButtonAriaLabel: `Move ${subject}`,
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
