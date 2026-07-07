import type {
  StructuredShapeValidationWarning,
  StructuredTableProjection,
} from '../../domain/structured/structured-table'
import { documentCellKey } from '../../domain/structured/structured-table-cell-model'
import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'
import {
  resolveStructuredSubjectOpenTarget,
  type StructuredSubjectOpenTarget,
} from '../../domain/structured/structured-subject-peek'
import type {
  StructuredActiveCell,
  StructuredActiveRelationCell,
  StructuredActiveTextCell,
} from './structured-predicate-active-cell-model'
import type { StructuredCellWriteState } from './useStructuredCellWriteProposalController'
import type { StructuredProjectionTableRow } from './structured-projection-table-model'

type StructuredPredicateColumnProposalLabel = {
  label: string
}

export type StructuredPredicateCellChrome = {
  activeEnumCell: StructuredActiveCell | null
  activeRelationCell: StructuredActiveRelationCell | null
  activeTextCell: StructuredActiveTextCell | null
  hasActiveEditor: boolean
  hasCellWriteProposal: boolean
  pendingWrite: {
    discardable: boolean
    predicateLabel: string
    status?: 'pending' | 'approval-staged'
    subject: string
  } | null
  predicateLabel: string
  shapeWarning: {
    ariaLabel: string
    message: string | null | undefined
    predicateLabel: string
    subject: string
    title: string
  } | null
  values: readonly string[]
}

export type StructuredSubjectCellChrome = {
  displayLabel: string
  documentUri: string
  openAffordance: StructuredSubjectCellOpenAffordance | null
  openTarget: StructuredSubjectOpenTarget | null
  pending: boolean
  pendingMarker: StructuredSubjectCellPendingMarker | null
  rowIndex: number
  subject: string
}

export type StructuredSubjectCellOpenAffordance = {
  ariaDescription: string
  title: string
}

export type StructuredSubjectCellPendingMarker = {
  displayLabel: string
  label: string
}

function structuredSubjectDisplayLabel(subject: string, documentUri: string) {
  if (!subject) return documentUri
  try {
    const documentUrl = new URL(documentUri)
    documentUrl.hash = ''
    const subjectUrl = new URL(subject)
    const hash = subjectUrl.hash
    subjectUrl.hash = ''
    if (hash && subjectUrl.href === documentUrl.href) return hash
  } catch {
    // Non-URL and relative subjects are already display-ready.
  }
  return subject
}

function activeCellMatches(
  cell: StructuredActiveCell | null,
  subject: string,
  predicate: string,
) {
  return cell?.subject === subject && cell.predicate === predicate
}

export function projectStructuredSubjectCellOpenAffordance(
  openTarget: StructuredSubjectOpenTarget | null,
): StructuredSubjectCellOpenAffordance | null {
  if (!openTarget) return null

  const ariaDescription = openTarget.canNavigateDirectly
    ? '单击打开预览；Enter 或双击打开资源。'
    : '单击打开预览；在预览中选择打开动作。'

  return {
    ariaDescription,
    title: `${openTarget.targetUri}\n${ariaDescription.replace(/。$/, '')}`,
  }
}

export function projectStructuredSubjectCellPendingMarker({
  displayLabel,
  pending,
}: {
  displayLabel: string
  pending: boolean
}): StructuredSubjectCellPendingMarker | null {
  return pending
    ? {
        displayLabel: `${displayLabel}*`,
        label: '待确认 subject',
      }
    : null
}

export function projectStructuredPredicateCellChrome({
  activeEnumCell,
  activeRelationCell,
  activeTextCell,
  cellWriteState,
  documentUri,
  predicate,
  proposal,
  row,
  shapeWarningByCell,
}: {
  activeEnumCell: StructuredActiveCell | null
  activeRelationCell: StructuredActiveRelationCell | null
  activeTextCell: StructuredActiveTextCell | null
  cellWriteState: StructuredCellWriteState
  documentUri: string
  predicate: string
  proposal?: StructuredPredicateColumnProposalLabel | null
  row: StructuredProjectionTableRow
  shapeWarningByCell: ReadonlyMap<string, readonly StructuredShapeValidationWarning[]>
}): StructuredPredicateCellChrome {
  const values = row.cells[predicate] ?? []
  const predicateLabel = proposal?.label ?? localPredicateLabel(predicate)
  const activeText = activeCellMatches(activeTextCell, row.subject, predicate)
  const activeEnum = activeCellMatches(activeEnumCell, row.subject, predicate)
  const activeRelation = activeCellMatches(activeRelationCell, row.subject, predicate)
  const cellShapeWarnings = shapeWarningByCell.get(documentCellKey(documentUri, row.subject, predicate)) ?? []
  const shapeWarningMessage = cellShapeWarnings[0]?.message
  const shapeWarning = shapeWarningMessage
    ? {
        ariaLabel: `Shape warning for ${predicateLabel} on ${row.subject}`,
        message: shapeWarningMessage,
        predicateLabel,
        subject: row.subject,
        title: shapeWarningMessage,
      }
    : null
  const pendingWrite = cellWriteState.hasProposal
    ? {
        discardable: !!cellWriteState.proposal,
        predicateLabel,
        status: cellWriteState.status,
        subject: row.subject,
      }
    : null

  return {
    activeEnumCell: activeEnum ? activeEnumCell : null,
    activeRelationCell: activeRelation ? activeRelationCell : null,
    activeTextCell: activeText ? activeTextCell : null,
    hasActiveEditor: !!(activeText || activeEnum || activeRelation),
    hasCellWriteProposal: cellWriteState.hasProposal,
    pendingWrite,
    predicateLabel,
    shapeWarning,
    values,
  }
}

export function projectStructuredSubjectCellChrome({
  documentUri,
  projection,
  row,
  rowIndex,
}: {
  documentUri: string
  projection: StructuredTableProjection
  row: StructuredProjectionTableRow
  rowIndex: number
}): StructuredSubjectCellChrome {
  const openTarget = resolveStructuredSubjectOpenTarget(documentUri, row.subject, { projection })
  const displayLabel = structuredSubjectDisplayLabel(row.subject, documentUri)

  return {
    displayLabel,
    documentUri,
    openAffordance: projectStructuredSubjectCellOpenAffordance(openTarget),
    openTarget,
    pending: !!row.pending,
    pendingMarker: projectStructuredSubjectCellPendingMarker({
      displayLabel,
      pending: !!row.pending,
    }),
    rowIndex,
    subject: row.subject,
  }
}
