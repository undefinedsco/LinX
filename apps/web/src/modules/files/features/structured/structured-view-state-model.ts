import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'
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
  extraLanes,
}: {
  groupPredicate: string | null
  kanbanOrder: Record<string, string[]>
  projection: StructuredTableProjection
  saved: unknown
  extraLanes?: readonly string[]
}) {
  const { kanban } = projectStructuredKanbanSourceModel({
    groupPredicate,
    kanbanOrder,
    projection,
    extraLanes,
  })
  return reconcileStructuredKanbanBoardState({
    saved,
    lanes: kanban.columns.map((column) => ({
      id: column.id,
      subjects: column.cards.map((card) => card.subject),
    })),
  })
}

/**
 * The removed-column key that a column picked in 加属性 refers to. The menu may name the column by its
 * full IRI or prefixed name while the view stored its key (or the other way round), so the local
 * name counts as a match.
 */
export function findRemovedStructuredColumnKey(removed: readonly string[], predicate: string): string | null {
  return removed.find((key) => key === predicate || localPredicateLabel(key) === localPredicateLabel(predicate)) ?? null
}
