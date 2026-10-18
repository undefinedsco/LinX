import { useCallback, useMemo } from 'react'

import {
  projectStructuredCards,
  type StructuredWhiteboardVisualRelation,
} from '../../../domain/structured/structured-projections'
import { quoteStructuredCellLiteral } from '../../../domain/structured/structured-cell-editor-plan'
import {
  createStructuredCellWriteProposal,
  type StructuredCellCommitResult,
  type StructuredCellWriteProposal,
  type StructuredTableProjection,
} from '../../../domain/structured/structured-table'
import type {
  StructuredWhiteboardPosition,
  StructuredWhiteboardSnapshotV1,
} from '../../../domain/structured/structured-view-metadata'
import {
  resolveWhiteboardCardNodeUri,
  resolveWhiteboardSubjectUri,
} from '../../../domain/structured/structured-whiteboard-canvas'
import { useStructuredWhiteboardViewController } from '../useStructuredWhiteboardViewController'
import { useWhiteboardCanvasState } from './useWhiteboardCanvasState'

const BODY_PREDICATES = [
  'schema:description',
  'https://schema.org/description',
  'dcterms:description',
  'http://purl.org/dc/terms/description',
]
const DEFAULT_BODY_PREDICATE = 'http://purl.org/dc/terms/description'

/**
 * Ties the board together: layout saved in the Pod as JSON Canvas (with the
 * earlier browser-only layout migrated once), the cards that are on it, and the
 * relation controller used when a line is turned into a property.
 */
export function useWhiteboardBoardController({
  documentUri,
  layout,
  projection,
  selectedSubjects,
  visualRelations,
  snapshot,
  relationPredicateOptions,
  onCommitCellWriteProposal,
  onVisualRelationsChange,
  onOpenSubject,
}: {
  documentUri: string
  layout?: Record<string, StructuredWhiteboardPosition>
  projection: StructuredTableProjection
  selectedSubjects?: string[]
  visualRelations?: StructuredWhiteboardVisualRelation[]
  snapshot?: StructuredWhiteboardSnapshotV1
  relationPredicateOptions?: readonly string[]
  onCommitCellWriteProposal?: (proposal: StructuredCellWriteProposal) => StructuredCellCommitResult | Promise<StructuredCellCommitResult>
  onVisualRelationsChange?: (relations: StructuredWhiteboardVisualRelation[]) => void
  onOpenSubject?: Parameters<typeof useStructuredWhiteboardViewController>[0]['onOpenSubject']
}) {
  const legacy = useMemo(() => ({
    selectedSubjects: selectedSubjects ?? [],
    positions: layout,
    snapshot,
    visualRelations,
  }), [layout, selectedSubjects, snapshot, visualRelations])
  const canvasState = useWhiteboardCanvasState({ documentUri, legacy })
  const { canvas, podRootUri } = canvasState

  const cards = useMemo(() => projectStructuredCards(projection), [projection])
  const subjectsOnBoard = useMemo(() => {
    const subjectByUri = new Map(cards.map((card) => [resolveWhiteboardSubjectUri(card.subject, documentUri), card.subject]))
    const subjects: string[] = []
    for (const node of canvas.nodes) {
      const uri = resolveWhiteboardCardNodeUri(node, podRootUri)
      const subject = uri ? subjectByUri.get(uri) : undefined
      if (subject && !subjects.includes(subject)) subjects.push(subject)
    }
    return subjects
  }, [canvas.nodes, cards, documentUri, podRootUri])

  const whiteboard = useStructuredWhiteboardViewController({
    documentUri,
    layout,
    projection,
    selectedSubjects: subjectsOnBoard,
    visualRelations,
    relationPredicateOptions,
    onCommitCellWriteProposal,
    onVisualRelationsChange,
    onOpenSubject,
  })

  const commitCardBody = useCallback(async (subject: string, markdown: string) => {
    if (!onCommitCellWriteProposal) return
    const row = projection.rows.find((candidate) => candidate.subject === subject)
    const existing = row?.cells.find((cell) => BODY_PREDICATES.includes(cell.predicate))
    await onCommitCellWriteProposal(createStructuredCellWriteProposal({
      documentUri,
      subject,
      predicate: existing?.predicate ?? DEFAULT_BODY_PREDICATE,
      previousValues: existing ? [...existing.values] : [],
      nextValues: markdown.trim() ? [quoteStructuredCellLiteral(markdown)] : [],
    }))
  }, [documentUri, onCommitCellWriteProposal, projection.rows])

  return {
    canvasState,
    cards,
    model: whiteboard,
    relation: whiteboard,
    commitCardBody: onCommitCellWriteProposal ? commitCardBody : undefined,
  }
}
