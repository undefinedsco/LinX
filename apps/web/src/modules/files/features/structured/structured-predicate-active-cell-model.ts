import type { StructuredCellScalarEditorKind } from '../../domain/structured/structured-cell-editor-plan'
import type {
  StructuredTableProjection,
  VocabTermProposal,
} from '../../domain/structured/structured-table'
import {
  hasStructuredCellEditPendingProposal,
  planStructuredRelationCellCommit,
  planStructuredTextCellCommit,
} from './structured-cell-edit-workflow-model'
import {
  getStructuredProjectionCellOriginalValues,
  getStructuredProjectionTablePredicateValues,
  type StructuredProjectionTableRow,
} from './structured-projection-table-model'
import {
  projectStructuredEnumOptions,
  projectStructuredEnumSelectedValues,
  projectStructuredRelationValues,
  type StructuredEnumOptionViewModel,
  type StructuredRelationValueViewModel,
} from './structured-predicate-cell-display-model'

export type StructuredActiveCell = {
  subject: string
  predicate: string
}

export type StructuredActiveTextCell = StructuredActiveCell & {
  value: string
  kind: StructuredCellScalarEditorKind
  commit: (next: string) => string
}

export type StructuredActiveRelationCell = StructuredActiveCell & {
  value: string
}

type StructuredActiveTextDisplay = {
  kind: 'text'
  ariaLabel: string
  commitOnChange: boolean
  editorKind: StructuredCellScalarEditorKind
  hasPendingProposal: boolean
  value: string
}

type StructuredActiveRelationDisplay = {
  kind: 'relation'
  ariaLabel: string
  clearAction: {
    ariaLabel: string
  }
  hasPendingProposal: boolean
  value: string
  values: StructuredRelationValueViewModel[]
}

type StructuredActiveEnumDisplay = {
  kind: 'enum'
  ariaLabel: string
  listboxId: string
  options: StructuredEnumOptionViewModel[]
  optionsLabel: string
  predicateLabel: string
  selectedValues: string[]
  valueLabel: string
}

export type StructuredPredicateActiveCellDisplay =
  | { kind: 'none' }
  | StructuredActiveTextDisplay
  | StructuredActiveRelationDisplay
  | StructuredActiveEnumDisplay

export type StructuredPredicateActiveCellModelInput = {
  activeEnumCell: StructuredActiveCell | null
  activeRelationCell: StructuredActiveRelationCell | null
  activeTextCell: StructuredActiveTextCell | null
  documentUri: string
  getEnumOptionsForPredicate: (predicate: string, values: string[]) => string[]
  hasCellWriteProposal: boolean
  predicate: string
  predicateLabel: string
  projection: Pick<StructuredTableProjection, 'rows'>
  resolveEnumOptionTermUri: (label: string) => string
  reviewableVocabProposals: readonly VocabTermProposal[]
  rowSubject: string
  tableRows: readonly StructuredProjectionTableRow[]
  values: readonly string[]
}

export function projectStructuredPredicateActiveCellDisplay(
  input: StructuredPredicateActiveCellModelInput,
): StructuredPredicateActiveCellDisplay {
  const {
    activeEnumCell,
    activeRelationCell,
    activeTextCell,
    documentUri,
    getEnumOptionsForPredicate,
    hasCellWriteProposal,
    predicate,
    predicateLabel,
    projection,
    resolveEnumOptionTermUri,
    reviewableVocabProposals,
    rowSubject,
    tableRows,
    values,
  } = input

  if (activeTextCell) {
    return {
      kind: 'text',
      ariaLabel: `编辑 ${rowSubject} 的 ${predicateLabel}`,
      commitOnChange: activeTextCell.kind === 'date',
      editorKind: activeTextCell.kind,
      hasPendingProposal: hasPendingTextCellProposal({
        activeTextCell,
        hasCellWriteProposal,
        predicate,
        projection,
        rowSubject,
      }),
      value: activeTextCell.value,
    }
  }

  if (activeRelationCell) {
    return {
      kind: 'relation',
      ariaLabel: `编辑 ${rowSubject} 的 ${predicateLabel}`,
      clearAction: {
        ariaLabel: `清空 ${rowSubject} 的 ${predicateLabel}`,
      },
      hasPendingProposal: hasPendingRelationCellProposal({
        activeRelationCell,
        hasCellWriteProposal,
        predicate,
        projection,
        rowSubject,
      }),
      value: activeRelationCell.value,
      values: projectStructuredRelationValues({
        documentUri,
        values,
      }),
    }
  }

  if (activeEnumCell) {
    const observedOptions = getStructuredProjectionTablePredicateValues({
      predicate,
      tableRows,
    })
    const options = getEnumOptionsForPredicate(predicate, observedOptions)
    return {
      kind: 'enum',
      ariaLabel: `编辑 ${rowSubject} 的 ${predicateLabel}`,
      listboxId: `options-${domSafeId(documentUri)}-${domSafeId(rowSubject)}-${domSafeId(predicate)}`,
      options: projectStructuredEnumOptions({
        options,
        predicate,
        proposals: reviewableVocabProposals,
        resolveTermUri: resolveEnumOptionTermUri,
      }),
      optionsLabel: `${rowSubject} 的 ${predicateLabel} 选项`,
      predicateLabel,
      selectedValues: projectStructuredEnumSelectedValues(values),
      valueLabel: `${rowSubject} 的 ${predicateLabel}`,
    }
  }

  return { kind: 'none' }
}

function domSafeId(value: string) {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-')
}

function hasPendingTextCellProposal(input: {
  activeTextCell: StructuredActiveTextCell
  hasCellWriteProposal: boolean
  predicate: string
  projection: Pick<StructuredTableProjection, 'rows'>
  rowSubject: string
}) {
  const editedPlan = planStructuredTextCellCommit({
    activeCell: input.activeTextCell,
  })
  return hasStructuredCellEditPendingProposal({
    hasCellWriteProposal: input.hasCellWriteProposal,
    nextValues: editedPlan.kind === 'cell-write' ? editedPlan.nextValues : [],
    originalValues: getStructuredProjectionCellOriginalValues({
      predicate: input.predicate,
      projection: input.projection,
      subject: input.rowSubject,
    }),
  })
}

function hasPendingRelationCellProposal(input: {
  activeRelationCell: StructuredActiveRelationCell
  hasCellWriteProposal: boolean
  predicate: string
  projection: Pick<StructuredTableProjection, 'rows'>
  rowSubject: string
}) {
  const editedPlan = planStructuredRelationCellCommit({
    activeCell: input.activeRelationCell,
  })
  return hasStructuredCellEditPendingProposal({
    hasCellWriteProposal: input.hasCellWriteProposal,
    nextValues: editedPlan.kind === 'cell-write' ? editedPlan.nextValues : [],
    originalValues: getStructuredProjectionCellOriginalValues({
      predicate: input.predicate,
      projection: input.projection,
      subject: input.rowSubject,
    }),
  })
}
