import type { StructuredKanbanColumn } from '../../domain/structured/structured-projections'
import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'

export type StructuredKanbanMove = {
  columnId: string
  columnLabel: string
  overSubject?: string
  predicate: string
  status: 'pending' | 'approval-staged' | 'error'
}

export type StructuredKanbanMoveTarget = Pick<StructuredKanbanColumn, 'id' | 'label' | 'value'> & {
  overSubject?: string
}

export type StructuredKanbanPendingMoveView = {
  predicate: string
  value: string
  statusLabel: string
  label: string
  retryable?: boolean
}

export function projectStructuredKanbanPendingMoveView(
  pendingMove: StructuredKanbanMove | undefined,
): StructuredKanbanPendingMoveView | undefined {
  if (!pendingMove) return undefined

  const predicate = localPredicateLabel(pendingMove.predicate)
  const statusLabel = pendingMove.status === 'approval-staged'
    ? '待审批'
    : pendingMove.status === 'error'
      ? '移动失败'
      : '提交中'
  return {
    predicate,
    value: pendingMove.columnLabel,
    statusLabel,
    label: `${statusLabel}：${predicate} -> ${pendingMove.columnLabel}`,
    ...(pendingMove.status === 'error' ? { retryable: true } : {}),
  }
}

export function projectStructuredStagedKanbanPendingMoves({
  current,
  predicate,
  subject,
  targetColumn,
}: {
  current: Record<string, StructuredKanbanMove>
  subject: string
  predicate: string
  targetColumn: StructuredKanbanMoveTarget
}) {
  return {
    ...current,
    [subject]: {
      columnId: targetColumn.id,
      columnLabel: targetColumn.label,
      ...(targetColumn.overSubject ? { overSubject: targetColumn.overSubject } : {}),
      predicate,
      status: 'pending' as const,
    },
  }
}

export function projectStructuredDiscardedKanbanPendingMoves({
  current,
  subject,
}: {
  current: Record<string, StructuredKanbanMove>
  subject: string
}) {
  if (!(subject in current)) return current
  const next = { ...current }
  delete next[subject]
  return next
}

export function projectStructuredFailedKanbanPendingMoves({
  current,
  subject,
}: {
  current: Record<string, StructuredKanbanMove>
  subject: string
}) {
  const pendingMove = current[subject]
  if (!pendingMove) return current
  return {
    ...current,
    [subject]: {
      ...pendingMove,
      status: 'error' as const,
    },
  }
}

export function projectStructuredApprovalStagedKanbanPendingMoves({
  current,
  subject,
}: {
  current: Record<string, StructuredKanbanMove>
  subject: string
}) {
  const pendingMove = current[subject]
  if (!pendingMove) return current
  return {
    ...current,
    [subject]: {
      ...pendingMove,
      status: 'approval-staged' as const,
    },
  }
}

function applyPendingMoves(
  columns: readonly StructuredKanbanColumn[],
  pendingMoves: Record<string, StructuredKanbanMove>,
) {
  const displayColumns = columns.map((column) => ({ ...column, cards: [...column.cards] }))
  for (const [subject, move] of Object.entries(pendingMoves)) {
    if (move.status === 'error') continue
    const fromColumn = displayColumns.find((column) => column.cards.some((card) => card.subject === subject))
    const card = fromColumn?.cards.find((candidate) => candidate.subject === subject)
    const targetColumn = displayColumns.find((column) => column.id === move.columnId)
    if (!fromColumn || !card || !targetColumn || fromColumn.id === targetColumn.id) continue
    fromColumn.cards = fromColumn.cards.filter((candidate) => candidate.subject !== subject)
    const targetIndex = move.overSubject
      ? targetColumn.cards.findIndex((candidate) => candidate.subject === move.overSubject)
      : -1
    targetColumn.cards = targetIndex < 0
      ? [...targetColumn.cards, card]
      : [
        ...targetColumn.cards.slice(0, targetIndex),
        card,
        ...targetColumn.cards.slice(targetIndex),
      ]
  }
  return displayColumns
}

export function projectStructuredKanbanMoveModel({
  pendingMoves,
  sourceColumns,
}: {
  sourceColumns: readonly StructuredKanbanColumn[]
  pendingMoves: Record<string, StructuredKanbanMove>
}) {
  return {
    columns: sourceColumns.map((column) => ({ id: column.id, label: column.label, value: column.value })),
    displayColumns: applyPendingMoves(sourceColumns, pendingMoves),
  }
}

export function projectStructuredKanbanColumnSubjectReorder({
  columnId,
  displayColumns,
  overSubject,
  subject,
}: {
  displayColumns: readonly StructuredKanbanColumn[]
  columnId: string
  subject: string
  overSubject: string
}): string[] | null {
  if (subject === overSubject) return null
  const column = displayColumns.find((candidate) => candidate.id === columnId)
  if (!column) return null
  const currentSubjects = column.cards.map((card) => card.subject)
  const fromIndex = currentSubjects.indexOf(subject)
  const toIndex = currentSubjects.indexOf(overSubject)
  if (fromIndex < 0 || toIndex < 0) return null
  const nextSubjects = [...currentSubjects]
  nextSubjects.splice(fromIndex, 1)
  nextSubjects.splice(toIndex, 0, subject)
  return nextSubjects
}
