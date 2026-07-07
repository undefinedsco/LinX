import type { ReactNode } from 'react'

import type { VocabTermProposal } from '../../domain/structured/structured-table'
import {
  StructuredEnumCellSelector,
  StructuredPredicateCellEditor,
  StructuredScalarCellEditor,
} from './StructuredTableCellPrimitives'
import {
  StructuredCellPopoverLayer,
  type StructuredCellPopoverPlacement,
} from './StructuredCellPopoverLayer'
import {
  projectStructuredPredicateActiveCellDisplay,
  type StructuredActiveCell,
  type StructuredActiveRelationCell,
  type StructuredActiveTextCell,
  type StructuredPredicateActiveCellModelInput,
} from './structured-predicate-active-cell-model'

export function StructuredPredicateActiveCell({
  activeEnumCell,
  activeRelationCell,
  activeTextCell,
  cellProposalButton,
  closeActiveCellPopover,
  documentUri,
  enumSearch,
  getEnumOptionsForPredicate,
  hasCellWriteProposal,
  predicate,
  predicateLabel,
  popoverPlacement,
  projection,
  resolveEnumOptionTermUri,
  reviewableVocabProposals,
  rowSubject,
  shapeWarningIndicator,
  tableRows,
  updateActiveRelationCellValue,
  updateActiveTextCellValue,
  updateEnumSearch,
  values,
  onAddEnumOption,
  onCancelCellDraft,
  onCommitRelationCell,
  onCommitTextCell,
  onDiscardVocabTermProposal,
  onOpenEnumOptionDefinition,
  onOpenRelationValue,
  onOpenVocabTermProposal,
  onRemoveEnumOption,
}: {
  activeEnumCell: StructuredActiveCell | null
  activeRelationCell: StructuredActiveRelationCell | null
  activeTextCell: StructuredActiveTextCell | null
  cellProposalButton: (hasPendingProposal?: boolean) => ReactNode
  closeActiveCellPopover: () => void
  documentUri: string
  enumSearch: string
  getEnumOptionsForPredicate: StructuredPredicateActiveCellModelInput['getEnumOptionsForPredicate']
  hasCellWriteProposal: boolean
  predicate: string
  predicateLabel: string
  popoverPlacement: StructuredCellPopoverPlacement | null
  projection: StructuredPredicateActiveCellModelInput['projection']
  resolveEnumOptionTermUri: (label: string) => string
  reviewableVocabProposals: readonly VocabTermProposal[]
  rowSubject: string
  shapeWarningIndicator: ReactNode
  tableRows: StructuredPredicateActiveCellModelInput['tableRows']
  updateActiveRelationCellValue: (value: string) => void
  updateActiveTextCellValue: (value: string) => void
  updateEnumSearch: (value: string) => void
  values: readonly string[]
  onAddEnumOption: (subject: string, predicate: string, value: string) => void
  onCancelCellDraft: (subject: string, predicate: string) => void
  onCommitRelationCell: (value?: string) => void
  onCommitTextCell: (value?: string) => void
  onDiscardVocabTermProposal?: (proposal: VocabTermProposal) => void
  onOpenEnumOptionDefinition?: (termUri: string) => void
  onOpenRelationValue: (normalizedValue: string, external: boolean) => void
  onOpenVocabTermProposal?: (proposal: VocabTermProposal) => void
  onRemoveEnumOption: (subject: string, predicate: string, value: string) => void
}) {
  const display = projectStructuredPredicateActiveCellDisplay({
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
  })

  if (display.kind === 'text') {
    return (
      <StructuredScalarCellEditor
        kind={display.editorKind}
        ariaLabel={display.ariaLabel}
        value={display.value}
        commitOnChange={display.commitOnChange}
        onValueChange={(value) => {
          if (!display.commitOnChange) {
            updateActiveTextCellValue(value)
          }
        }}
        onCommit={(value) => onCommitTextCell(value)}
        onCancel={() => onCancelCellDraft(rowSubject, predicate)}
        trailing={cellProposalButton(display.hasPendingProposal)}
      />
    )
  }

  if (display.kind === 'relation') {
    return (
      <StructuredCellPopoverLayer placement={popoverPlacement}>
      <StructuredPredicateCellEditor
        ariaLabel={display.ariaLabel}
        clearAction={display.clearAction}
        value={display.value}
        values={display.values}
        className="w-full rounded-md border border-border/50 bg-background p-2 shadow-lg"
        onValueChange={updateActiveRelationCellValue}
        onOpenValue={onOpenRelationValue}
        onCommit={(value) => onCommitRelationCell(value)}
        onCancel={() => {
          onCancelCellDraft(rowSubject, predicate)
        }}
        trailing={(
          <>
            {shapeWarningIndicator}
            {cellProposalButton(display.hasPendingProposal)}
          </>
        )}
      />
      </StructuredCellPopoverLayer>
    )
  }

  if (display.kind === 'enum') {
    return (
      <StructuredCellPopoverLayer placement={popoverPlacement}>
      <StructuredEnumCellSelector
        ariaLabel={display.ariaLabel}
        valueLabel={display.valueLabel}
        optionsLabel={display.optionsLabel}
        listboxId={display.listboxId}
        predicateLabel={display.predicateLabel}
        selectedValues={display.selectedValues}
        options={display.options}
        search={enumSearch}
        onSearchChange={updateEnumSearch}
        onAddOption={(value) => onAddEnumOption(rowSubject, predicate, value)}
        onRemoveOption={(value) => onRemoveEnumOption(rowSubject, predicate, value)}
        onOpenDefinition={(option) => onOpenEnumOptionDefinition?.(option.termUri)}
        onOpenProposal={(option) => {
          if (option.proposal) onOpenVocabTermProposal?.(option.proposal as VocabTermProposal)
        }}
        onDiscardProposal={(option) => {
          if (option.proposal) onDiscardVocabTermProposal?.(option.proposal as VocabTermProposal)
        }}
        onCancel={() => {
          closeActiveCellPopover()
        }}
        className="w-full shadow-lg"
      />
      </StructuredCellPopoverLayer>
    )
  }

  return null
}
