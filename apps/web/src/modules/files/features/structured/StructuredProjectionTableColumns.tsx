import type { ColumnDef, SortingFn } from '@tanstack/react-table'

import type {
  StructuredShapeValidationWarning,
  StructuredTableProjection,
  StructuredVocabDefinitionIndex,
  StructuredVocabPredicateDefinition,
  VocabTermProposal,
} from '../../domain/structured/structured-table'
import {
  compareStructuredProjectionTableRows,
  type StructuredProjectionTableRow,
} from './structured-projection-table-model'
import { projectStructuredPredicateHeaderColumnModel } from './structured-predicate-column-header-model'
import {
  projectStructuredPredicateCellChrome,
  projectStructuredSubjectCellChrome,
} from './structured-projection-cell-chrome'
import {
  StructuredAddPredicateColumnHeader,
  StructuredPredicateColumnHeader,
  type StructuredPredicateColumnProposal,
} from './StructuredPredicateColumnHeader'
import { StructuredPredicateActiveCell } from './StructuredPredicateActiveCell'
import { StructuredPredicateStaticCell } from './StructuredPredicateStaticCell'
import {
  StructuredSubjectCell,
  type StructuredSubjectCellOpenKind,
} from './StructuredTableCellPrimitives'
import { StructuredProjectionSortIcon } from './StructuredProjectionSortIcon'
import {
  StructuredPredicateCellPendingWriteControl,
  StructuredPredicateCellShapeWarning,
  StructuredPredicateCellTrailing,
} from './StructuredPredicateCellTrailing'
import type { StructuredCellWriteState } from './useStructuredCellWriteProposalController'

export type StructuredSubjectOpenOptions = {
  navigate?: boolean
  rowIndex?: number | null
  scrollTop?: number
}

type StructuredPredicateActiveCellProps = Parameters<typeof StructuredPredicateActiveCell>[0]
type StructuredAddPredicateColumnHeaderProps = Parameters<typeof StructuredAddPredicateColumnHeader>[0]

export interface StructuredProjectionTableColumnsInput {
  activeEnumCell: StructuredPredicateActiveCellProps['activeEnumCell']
  activeRelationCell: StructuredPredicateActiveCellProps['activeRelationCell']
  activeTextCell: StructuredPredicateActiveCellProps['activeTextCell']
  addEnumOption: StructuredPredicateActiveCellProps['onAddEnumOption']
  approvePendingPredicateProposal: (predicate: string) => void
  availablePredicates: readonly string[]
  classScope?: string | null
  closeActiveCellPopover: StructuredPredicateActiveCellProps['closeActiveCellPopover']
  commitRelationCell: StructuredPredicateActiveCellProps['onCommitRelationCell']
  commitTextCell: StructuredPredicateActiveCellProps['onCommitTextCell']
  createPendingPredicateProposal: StructuredAddPredicateColumnHeaderProps['onCreate']
  currentPodRootUri?: string | null
  discardCellDraft: StructuredPredicateActiveCellProps['onCancelCellDraft']
  discardPendingPredicateProposal: (predicate: string) => void
  documentUri: string
  editable: boolean
  enumSearch: string
  getCellWriteState: (subject: string, predicate: string) => StructuredCellWriteState
  getEnumOptionsForPredicate: StructuredPredicateActiveCellProps['getEnumOptionsForPredicate']
  getPredicateDefinition: (predicate: string) => StructuredVocabPredicateDefinition | undefined
  onCreateVocabTermProposal?: (proposal: VocabTermProposal) => boolean | Promise<boolean>
  onCopyPredicate?: (predicateUri: string) => void
  onDiscardVocabTermProposal?: StructuredPredicateActiveCellProps['onDiscardVocabTermProposal']
  onOpenEnumOptionDefinition?: StructuredPredicateActiveCellProps['onOpenEnumOptionDefinition']
  onOpenPredicateDefinition?: (predicateUri: string) => void
  onOpenPredicateShapeRule?: (shapeRuleUri: string) => void
  onOpenSubjectResource?: (
    subject: string,
    targetUri: string,
    kind: StructuredSubjectCellOpenKind,
    options?: StructuredSubjectOpenOptions,
  ) => void
  onOpenVocabTermProposal?: StructuredPredicateActiveCellProps['onOpenVocabTermProposal']
  onSelectExistingPredicate?: StructuredAddPredicateColumnHeaderProps['onSelectExisting']
  onSort?: (sortKey: string) => void
  openRelationValue: StructuredPredicateActiveCellProps['onOpenRelationValue']
  pendingProposalByPredicate: ReadonlyMap<string, StructuredPredicateColumnProposal>
  popoverPlacement: StructuredPredicateActiveCellProps['popoverPlacement']
  projection: StructuredTableProjection
  resolveEnumOptionTermUri: StructuredPredicateActiveCellProps['resolveEnumOptionTermUri']
  reviewableVocabProposals: readonly VocabTermProposal[]
  shapeWarningByCell: ReadonlyMap<string, readonly StructuredShapeValidationWarning[]>
  showNamespaces: boolean
  sortDirection?: 'asc' | 'desc'
  sortKey?: string | null
  startCellEdit: (row: StructuredProjectionTableRow, predicate: string, anchor?: HTMLElement | null) => void
  tableRows: readonly StructuredProjectionTableRow[]
  targetVocabUri?: string | null
  updateActiveRelationCellValue: StructuredPredicateActiveCellProps['updateActiveRelationCellValue']
  updateActiveTextCellValue: StructuredPredicateActiveCellProps['updateActiveTextCellValue']
  updateEnumSearch: StructuredPredicateActiveCellProps['updateEnumSearch']
  visiblePredicates: readonly string[]
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex
  removeEnumOption: StructuredPredicateActiveCellProps['onRemoveEnumOption']
}

const structuredTableSortingFn: SortingFn<StructuredProjectionTableRow> = (left, right, columnId) => {
  return compareStructuredProjectionTableRows(left.original, right.original, columnId)
}

export function buildStructuredProjectionTableColumns({
  activeEnumCell,
  activeRelationCell,
  activeTextCell,
  addEnumOption,
  approvePendingPredicateProposal,
  availablePredicates,
  classScope,
  closeActiveCellPopover,
  commitRelationCell,
  commitTextCell,
  createPendingPredicateProposal,
  currentPodRootUri,
  discardCellDraft,
  discardPendingPredicateProposal,
  documentUri,
  editable,
  enumSearch,
  getCellWriteState,
  getEnumOptionsForPredicate,
  getPredicateDefinition,
  onCreateVocabTermProposal,
  onCopyPredicate,
  onDiscardVocabTermProposal,
  onOpenEnumOptionDefinition,
  onOpenPredicateDefinition,
  onOpenPredicateShapeRule,
  onOpenSubjectResource,
  onOpenVocabTermProposal,
  onSelectExistingPredicate,
  onSort,
  openRelationValue,
  pendingProposalByPredicate,
  popoverPlacement,
  projection,
  resolveEnumOptionTermUri,
  reviewableVocabProposals,
  shapeWarningByCell,
  showNamespaces,
  sortDirection,
  sortKey,
  startCellEdit,
  tableRows,
  targetVocabUri,
  updateActiveRelationCellValue,
  updateActiveTextCellValue,
  updateEnumSearch,
  visiblePredicates,
  vocabDefinitionIndex,
  removeEnumOption,
}: StructuredProjectionTableColumnsInput): ColumnDef<StructuredProjectionTableRow>[] {
  return [
    {
      id: 'subject',
      accessorFn: (row) => row.subject,
      size: 124,
      sortingFn: structuredTableSortingFn,
      meta: { label: 'subject', resizable: true },
      header: () => (
        <button className="flex items-center gap-1 hover:text-foreground" onClick={() => onSort?.('subject')}>
          subject <StructuredProjectionSortIcon columnKey="subject" sortKey={sortKey} sortDirection={sortDirection} />
        </button>
      ),
      cell: ({ row }) => {
        const subjectChrome = projectStructuredSubjectCellChrome({
          documentUri,
          projection,
          row: row.original,
          rowIndex: row.index,
        })
        return (
          <StructuredSubjectCell
            subject={subjectChrome.subject}
            displayLabel={subjectChrome.displayLabel}
            rowIndex={subjectChrome.rowIndex}
            pending={subjectChrome.pending}
            pendingMarker={subjectChrome.pendingMarker}
            openTarget={subjectChrome.openTarget}
            openAffordance={subjectChrome.openAffordance}
            onOpenSubject={onOpenSubjectResource}
          />
        )
      },
    },
    ...visiblePredicates.map<ColumnDef<StructuredProjectionTableRow>>((predicate) => {
      const proposal = pendingProposalByPredicate.get(predicate)
      const columnModel = projectStructuredPredicateHeaderColumnModel({
        predicate,
        projection,
        proposal,
        showNamespaces,
      })
      const definition = getPredicateDefinition(predicate)
      return {
        id: predicate,
        accessorFn: (row) => (row.cells[predicate] ?? []).join(' '),
        size: 128,
        sortingFn: structuredTableSortingFn,
        header: () => (
          <StructuredPredicateColumnHeader
            predicate={predicate}
            proposal={proposal}
            observedValues={columnModel.observedValues}
            definition={definition}
            sortIcon={(
              <StructuredProjectionSortIcon columnKey={predicate} sortKey={sortKey} sortDirection={sortDirection} />
            )}
            onSort={() => onSort?.(predicate)}
            onCanCreateVocabTermProposal={!!onCreateVocabTermProposal}
            onApprove={() => approvePendingPredicateProposal(predicate)}
            onDiscard={() => discardPendingPredicateProposal(predicate)}
            onCopyPredicate={onCopyPredicate}
            onOpenPredicateDefinition={onOpenPredicateDefinition}
            onOpenPredicateShapeRule={onOpenPredicateShapeRule}
            onOpenVocabTermProposal={onOpenVocabTermProposal}
          />
        ),
        cell: ({ row }) => {
          const cellChrome = projectStructuredPredicateCellChrome({
            activeEnumCell,
            activeRelationCell,
            activeTextCell,
            cellWriteState: getCellWriteState(row.original.subject, predicate),
            documentUri,
            predicate,
            proposal,
            row: row.original,
            shapeWarningByCell,
          })
          const shapeWarningControl = (
            <StructuredPredicateCellShapeWarning warning={cellChrome.shapeWarning} />
          )
          const pendingWriteControl = (hasPendingProposal = cellChrome.hasCellWriteProposal) => (
            <StructuredPredicateCellPendingWriteControl
              enabled={hasPendingProposal}
              fallbackPredicateLabel={cellChrome.predicateLabel}
              fallbackSubject={row.original.subject}
              pendingWrite={cellChrome.pendingWrite}
              onDiscardPendingWrite={() => discardCellDraft(row.original.subject, predicate)}
            />
          )

          if (cellChrome.hasActiveEditor) return (
            <StructuredPredicateActiveCell
              activeEnumCell={cellChrome.activeEnumCell}
              activeRelationCell={cellChrome.activeRelationCell}
              activeTextCell={cellChrome.activeTextCell}
              cellProposalButton={pendingWriteControl}
              closeActiveCellPopover={closeActiveCellPopover}
              documentUri={documentUri}
              enumSearch={enumSearch}
              getEnumOptionsForPredicate={getEnumOptionsForPredicate}
              hasCellWriteProposal={cellChrome.hasCellWriteProposal}
              predicate={predicate}
              predicateLabel={cellChrome.predicateLabel}
              popoverPlacement={popoverPlacement}
              projection={projection}
              resolveEnumOptionTermUri={resolveEnumOptionTermUri}
              reviewableVocabProposals={reviewableVocabProposals}
              rowSubject={row.original.subject}
              shapeWarningIndicator={shapeWarningControl}
              tableRows={tableRows}
              updateActiveRelationCellValue={updateActiveRelationCellValue}
              updateActiveTextCellValue={updateActiveTextCellValue}
              updateEnumSearch={updateEnumSearch}
              values={cellChrome.values}
              onAddEnumOption={addEnumOption}
              onCancelCellDraft={discardCellDraft}
              onCommitRelationCell={commitRelationCell}
              onCommitTextCell={commitTextCell}
              onDiscardVocabTermProposal={onDiscardVocabTermProposal}
              onOpenEnumOptionDefinition={onOpenEnumOptionDefinition}
              onOpenRelationValue={openRelationValue}
              onOpenVocabTermProposal={onOpenVocabTermProposal}
              onRemoveEnumOption={removeEnumOption}
            />
          )

          return (
            <StructuredPredicateStaticCell
              booleanTrailing={shapeWarningControl}
              definition={definition}
              documentUri={documentUri}
              editable={editable}
              predicate={predicate}
              proposals={reviewableVocabProposals}
              values={cellChrome.values}
              trailing={(
                <StructuredPredicateCellTrailing
                  pendingWrite={cellChrome.pendingWrite}
                  shapeWarning={cellChrome.shapeWarning}
                  onDiscardPendingWrite={() => discardCellDraft(row.original.subject, predicate)}
                />
              )}
              onOpenRelationValue={openRelationValue}
              onToggleBoolean={() => startCellEdit(row.original, predicate)}
            />
          )
        },
        meta: {
          label: columnModel.actionLabel,
          resizable: true,
        },
      }
    }),
    ...(editable ? [{
      id: '__addPredicate',
      size: 88,
      header: () => (
        <StructuredAddPredicateColumnHeader
          documentUri={documentUri}
          availablePredicates={availablePredicates}
          vocabDefinitionIndex={vocabDefinitionIndex}
          showNamespaces={showNamespaces}
          classScope={classScope}
          currentPodRootUri={currentPodRootUri}
          targetVocabUri={targetVocabUri}
          onCreate={createPendingPredicateProposal}
          onSelectExisting={onSelectExistingPredicate}
        />
      ),
      cell: () => <span className="text-muted-foreground/50">-</span>,
    } satisfies ColumnDef<StructuredProjectionTableRow>] : []),
  ]
}
