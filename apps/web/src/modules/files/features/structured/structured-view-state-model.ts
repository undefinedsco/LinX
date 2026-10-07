import {
  projectStructuredClassScope,
  type StructuredTableProjection,
} from '../../domain/structured/structured-table'
import type { StructuredWhiteboardVisualRelation } from '../../domain/structured/structured-projections'
import type { StructuredWhiteboardSnapshotV1 } from '../../domain/structured/structured-view-metadata'
import { reconcileStructuredKanbanBoardState } from '../../domain/structured/structured-kanban-board-state'
import { projectStructuredKanbanSourceModel } from './structured-kanban-view-model'

export function resolveStructuredEffectiveClassScope(
  projection: StructuredTableProjection,
  classScope: string | null,
) {
  return projectStructuredClassScope(projection, classScope).className ?? classScope
}

export function projectStructuredWhiteboardVisualRelations(
  snapshot: StructuredWhiteboardSnapshotV1 | undefined,
  legacyRelations: readonly StructuredWhiteboardVisualRelation[],
): StructuredWhiteboardVisualRelation[] {
  if (!snapshot) return [...legacyRelations]
  return snapshot.visualRelations.map((relation) => ({
    id: relation.id,
    from: relation.from,
    to: relation.to,
    label: relation.label ?? relation.predicate ?? '',
  }))
}

export function projectStructuredReconciledKanbanBoard({
  groupPredicate,
  kanbanOrder,
  projection,
  saved,
}: {
  groupPredicate: string | null
  kanbanOrder: Record<string, string[]>
  projection: StructuredTableProjection
  saved: unknown
}) {
  const { kanban } = projectStructuredKanbanSourceModel({
    groupPredicate,
    kanbanOrder,
    projection,
  })
  return reconcileStructuredKanbanBoardState({
    saved,
    lanes: kanban.columns.map((column) => ({
      id: column.id,
      subjects: column.cards.map((card) => card.subject),
    })),
  })
}
