import { useCallback, useEffect, useMemo, useState } from 'react'

import type { StructuredCellWriteProposal, StructuredTableProjection } from '../../domain/structured/structured-table'
import type { StructuredCardProjection, StructuredKanbanColumn } from '../../domain/structured/structured-projections'
import {
  projectStructuredApprovalStagedKanbanPendingMoves,
  projectStructuredFailedKanbanPendingMoves,
  projectStructuredKanbanColumnSubjectReorder,
  projectStructuredKanbanMoveModel,
  projectStructuredKanbanPendingMoveView,
  projectStructuredStagedKanbanPendingMoves,
  type StructuredKanbanMove,
  type StructuredKanbanMoveTarget,
} from './structured-kanban-move-model'
import { useStructuredCellCommitController } from './useStructuredCellCommitController'

export function useStructuredKanbanMoveController({
  documentUri,
  groupPredicate,
  columns: sourceColumns,
  projectionRows,
  onColumnOrderChange,
  onCommitCellWriteProposal,
}: {
  documentUri: string
  groupPredicate: string | null
  columns: readonly StructuredKanbanColumn[]
  projectionRows: StructuredTableProjection['rows']
  onColumnOrderChange: (columnId: string, subjects: string[]) => void
  onCommitCellWriteProposal?: (proposal: StructuredCellWriteProposal) => boolean | Promise<boolean>
}) {
  const [pendingMoves, setPendingMoves] = useState<Record<string, StructuredKanbanMove>>({})
  const canCommitCrossColumnMoves = typeof onCommitCellWriteProposal === 'function'
  const { createCellWriteProposal } = useStructuredCellCommitController({
    documentUri,
    projectionRows,
  })
  const { columns, displayColumns } = useMemo(() => projectStructuredKanbanMoveModel({
    pendingMoves,
    sourceColumns,
  }), [pendingMoves, sourceColumns])
  const pendingMoveForSubject = useCallback((subject: string) => pendingMoves[subject], [pendingMoves])
  const pendingMoveViewForSubject = useCallback(
    (subject: string) => projectStructuredKanbanPendingMoveView(pendingMoves[subject]),
    [pendingMoves],
  )

  useEffect(() => {
    setPendingMoves((current) => {
      let changed = false
      const next = { ...current }
      for (const [subject, move] of Object.entries(current)) {
        if (move.status !== 'approval-staged') continue
        const targetColumn = sourceColumns.find((column) => column.id === move.columnId)
        if (!targetColumn?.cards.some((card) => card.subject === subject)) continue
        delete next[subject]
        changed = true
      }
      return changed ? next : current
    })
  }, [sourceColumns])

  const commitKanbanMove = useCallback(async (
    card: StructuredCardProjection,
    targetColumn: StructuredKanbanMoveTarget,
  ) => {
    if (!groupPredicate) return
    if (!onCommitCellWriteProposal) return
    const predicate = groupPredicate
    setPendingMoves((current) => projectStructuredStagedKanbanPendingMoves({
      current,
      predicate,
      subject: card.subject,
      targetColumn,
    }))
    try {
      const saved = await onCommitCellWriteProposal(createCellWriteProposal({
        subject: card.subject,
        predicate,
        nextValues: targetColumn.value ? [targetColumn.value] : [],
      }))
      if (saved === false) {
        setPendingMoves((current) => projectStructuredFailedKanbanPendingMoves({
          current,
          subject: card.subject,
        }))
        return false
      }
      setPendingMoves((current) => projectStructuredApprovalStagedKanbanPendingMoves({
        current,
        subject: card.subject,
      }))
      return true
    } catch {
      setPendingMoves((current) => projectStructuredFailedKanbanPendingMoves({
        current,
        subject: card.subject,
      }))
      return false
    }
  }, [createCellWriteProposal, groupPredicate, onCommitCellWriteProposal])

  const retryKanbanMove = useCallback(async (subject: string) => {
    const failedMove = pendingMoves[subject]
    if (failedMove?.status !== 'error') return false
    const card = sourceColumns.flatMap((column) => column.cards).find((candidate) => candidate.subject === subject)
    const targetColumn = sourceColumns.find((column) => column.id === failedMove.columnId)
    if (!card || !targetColumn) return false
    return commitKanbanMove(card, {
      ...targetColumn,
      ...(failedMove.overSubject ? { overSubject: failedMove.overSubject } : {}),
    })
  }, [commitKanbanMove, pendingMoves, sourceColumns])

  const reorderColumnSubjects = useCallback((columnId: string, subject: string, overSubject: string) => {
    const nextSubjects = projectStructuredKanbanColumnSubjectReorder({
      columnId,
      displayColumns,
      overSubject,
      subject,
    })
    if (!nextSubjects) return
    onColumnOrderChange(columnId, nextSubjects)
  }, [displayColumns, onColumnOrderChange])

  return {
    canCommitCrossColumnMoves,
    columns,
    commitKanbanMove,
    displayColumns,
    pendingMoveForSubject,
    pendingMoveViewForSubject,
    retryKanbanMove,
    reorderColumnSubjects,
  }
}
