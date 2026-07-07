import { useMemo } from 'react'
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnSizingState,
  type SortingState,
} from '@tanstack/react-table'

import {
  type StructuredCellWriteProposal,
  type StructuredShapeValidationWarning,
  type StructuredTableProjection,
  type StructuredVocabDefinitionIndex,
  type VocabTermProposal,
} from '../../domain/structured/structured-table'
import { CompactTableShell } from '../../ui/CompactTableShell'
import {
  buildStructuredProjectionTableColumns,
  type StructuredSubjectOpenOptions,
} from './StructuredProjectionTableColumns'
import { useStructuredCellWriteProposalController } from './useStructuredCellWriteProposalController'
import { useStructuredCellEditWorkflowController } from './useStructuredCellEditWorkflowController'
import { useStructuredEnumCellWorkflowController } from './useStructuredEnumCellWorkflowController'
import {
  useStructuredProjectionActionController,
  type StructuredProjectionSubjectOpenKind,
} from './useStructuredProjectionActionController'
import {
  useStructuredColumnSizingController,
  type StructuredColumnSizingUpdater,
} from './useStructuredColumnSizingController'
import { useStructuredCellCommitController } from './useStructuredCellCommitController'
import { useStructuredPendingPredicateColumns } from './useStructuredPendingPredicateColumns'
import { useStructuredProjectionTableModelController } from './useStructuredProjectionTableModelController'
import { useStructuredSubjectCreationController } from './useStructuredSubjectCreationController'
import {
  StructuredSubjectCreationDialog,
  StructuredSubjectCreationFooterRow,
} from './StructuredSubjectCreationControls'
import {
  isStructuredProjectionTableCellInteractive,
  projectStructuredProjectionTableCellClassName,
  projectStructuredProjectionTableRowClassName,
} from './structured-projection-table-chrome'

const EMPTY_HIDDEN_PREDICATES = new Set<string>()

export function StructuredProjectionTable({
  documentUri,
  projection,
  availablePredicates = projection.predicates,
  classScope,
  sortKey,
  sortDirection,
  onSort,
  onOpenSubjectResource,
  onCommitCellWriteProposal,
  onPendingWriteSubjectsChange,
  onLocalCellWriteProposalsChange,
  onCreateVocabTermProposal,
  onCopyPredicate,
  onOpenEnumOptionDefinition,
  onOpenPredicateDefinition,
  onOpenPredicateShapeRule,
  onOpenVocabTermProposal,
  onDiscardVocabTermProposal,
  onSelectExistingPredicate,
  reviewableVocabProposals = [],
  vocabDefinitionIndex,
  showNamespaces = false,
  editable = false,
  columnSizing,
  onColumnSizingChange,
  hiddenPredicates = EMPTY_HIDDEN_PREDICATES,
  shapeWarnings = [],
  persistedCellWriteProposals = [],
  pendingWritesOnly = false,
  currentPodRootUri = null,
  targetVocabUri,
  targetShapesUri,
}: {
  documentUri: string
  projection: StructuredTableProjection
  availablePredicates?: readonly string[]
  classScope?: string | null
  sortKey?: string | null
  sortDirection?: 'asc' | 'desc'
  onSort?: (sortKey: string) => void
  onOpenSubjectResource?: (subject: string, targetUri: string, kind: StructuredProjectionSubjectOpenKind, options?: StructuredSubjectOpenOptions) => void
  onCommitCellWriteProposal?: (proposal: StructuredCellWriteProposal) => boolean | Promise<boolean>
  onPendingWriteSubjectsChange?: (subjects: string[]) => void
  onLocalCellWriteProposalsChange?: (proposals: StructuredCellWriteProposal[]) => void
  onCreateVocabTermProposal?: (proposal: VocabTermProposal) => boolean | Promise<boolean>
  onCopyPredicate?: (predicateUri: string) => void
  onOpenEnumOptionDefinition?: (termUri: string) => void
  onOpenPredicateDefinition?: (predicateUri: string) => void
  onOpenPredicateShapeRule?: (shapeRuleUri: string) => void
  onOpenVocabTermProposal?: (proposal: VocabTermProposal) => void
  onDiscardVocabTermProposal?: (proposal: VocabTermProposal) => void
  onSelectExistingPredicate?: (predicate: string) => void
  reviewableVocabProposals?: readonly VocabTermProposal[]
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex
  showNamespaces?: boolean
  editable?: boolean
  columnSizing?: ColumnSizingState
  onColumnSizingChange?: (updater: StructuredColumnSizingUpdater) => void
  hiddenPredicates?: ReadonlySet<string>
  shapeWarnings?: readonly StructuredShapeValidationWarning[]
  persistedCellWriteProposals?: readonly StructuredCellWriteProposal[]
  pendingWritesOnly?: boolean
  currentPodRootUri?: string | null
  targetVocabUri?: string | null
  targetShapesUri?: string | null
}) {
  const {
    localColumnSizing,
    setLocalColumnSizing,
    startColumnResize,
    startTouchColumnResize,
  } = useStructuredColumnSizingController({
    columnSizing,
    documentUri,
    onColumnSizingChange,
  })

  const {
    discardCellDraft: discardCellWriteDraft,
    getCellWriteState,
    pendingWriteSubjects,
    resolveCellValues,
    stageCellWriteProposal,
  } = useStructuredCellWriteProposalController({
    documentUri,
    onCommitCellWriteProposal,
    onLocalCellWriteProposalsChange,
    onPendingWriteSubjectsChange,
    persistedCellWriteProposals,
  })

  const {
    approvePendingPredicateProposal,
    createPendingPredicateProposal,
    discardPendingPredicateProposal,
    findVisiblePendingPredicateProposal,
    getPredicateDefinition,
    pendingPredicateIds,
    pendingProposalByPredicate,
    vocabTermProposalResourceUriForPredicate,
  } = useStructuredPendingPredicateColumns({
    classScope,
    currentPodRootUri,
    documentUri,
    onCreateVocabTermProposal,
    projectionPredicates: projection.predicates,
    reviewableVocabProposals,
    targetShapesUri,
    targetVocabUri,
    vocabDefinitionIndex,
  })
  const {
    createCellWriteProposal,
    previousValuesForCell,
    stageCellValueChange,
  } = useStructuredCellCommitController({
    documentUri,
    projectionRows: projection.rows,
    stageCellWriteProposal,
    vocabTermProposalResourceUriForPredicate,
  })
  const {
    createSubjectOpen,
    dialogModel,
    footerModel,
    handleSubjectDraftKeyDown,
    openCreateSubjectDialog,
    pendingSubjects,
    setCreateSubjectOpen,
    setSubjectDraft,
    subjectDraft,
    submitDisabled,
    submitCreateSubjectProposal,
  } = useStructuredSubjectCreationController({
    classScope,
    documentUri,
    projectionRows: projection.rows,
    stageCellValueChange,
  })
  const {
    columnVisibility,
    displayTableRows,
    footerPredicates,
    shapeWarningByCell,
    tableRows,
    visiblePredicates,
  } = useStructuredProjectionTableModelController({
    classScope,
    documentUri,
    hiddenPredicates,
    pendingPredicateIds,
    pendingSubjects,
    pendingWritesOnly,
    pendingWriteSubjects,
    projection,
    resolveCellValues,
    shapeWarnings,
  })
  const effectiveSortKey = sortKey && (sortKey === 'subject' || visiblePredicates.includes(sortKey))
    ? sortKey
    : null
  const {
    activeCellPopoverPlacement,
    activeEnumCell,
    activeRelationCell,
    activeTextCell,
    clearActiveEnumCell,
    closeActiveCellPopover,
    commitRelationCell,
    commitTextCell,
    discardCellDraft,
    enumSearch,
    handleCellKeyDown,
    startCellEdit,
    updateActiveRelationCellValue,
    updateActiveTextCellValue,
    updateEnumSearch,
  } = useStructuredCellEditWorkflowController({
    documentUri,
    discardCellWriteDraft,
    editable,
    getPredicateDefinition,
    stageCellValueChange,
  })

  const {
    addEnumOption,
    getEnumOptionsForPredicate,
    removeEnumOption,
    resolveEnumOptionTermUri,
  } = useStructuredEnumCellWorkflowController({
    classScope,
    clearActiveEnumCell,
    createCellWriteProposal,
    currentPodRootUri,
    documentUri,
    findVisiblePendingPredicateProposal,
    getPredicateDefinition,
    onCreateVocabTermProposal,
    previousValuesForCell,
    reviewableVocabProposals,
    stageCellValueChange,
    stageCellWriteProposal,
    tableRows,
    targetShapesUri,
    targetVocabUri,
    vocabDefinitionIndex,
  })

  const {
    copyPredicate,
    openEnumOptionDefinition,
    openPredicateDefinition,
    openPredicateShapeRule,
    openRelationValue,
    openVocabTermProposal,
  } = useStructuredProjectionActionController({
    documentUri,
    onCopyPredicate,
    onOpenEnumOptionDefinition,
    onOpenPredicateDefinition,
    onOpenPredicateShapeRule,
    onOpenSubjectResource,
    onOpenVocabTermProposal,
  })

  const columns = useMemo(
    () => buildStructuredProjectionTableColumns({
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
      onCopyPredicate: copyPredicate,
      onDiscardVocabTermProposal,
      onOpenEnumOptionDefinition: openEnumOptionDefinition,
      onOpenPredicateDefinition: openPredicateDefinition,
      onOpenPredicateShapeRule: openPredicateShapeRule,
      onOpenSubjectResource,
      onOpenVocabTermProposal: openVocabTermProposal,
      onSelectExistingPredicate,
      onSort,
      openRelationValue,
      pendingProposalByPredicate,
      popoverPlacement: activeCellPopoverPlacement,
      projection,
      resolveEnumOptionTermUri,
      reviewableVocabProposals,
      shapeWarningByCell,
      showNamespaces,
      sortDirection,
      sortKey: effectiveSortKey,
      startCellEdit,
      tableRows,
      targetVocabUri,
      updateActiveRelationCellValue,
      updateActiveTextCellValue,
      updateEnumSearch,
      visiblePredicates,
      vocabDefinitionIndex,
      removeEnumOption,
    }),
    [
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
      copyPredicate,
      onDiscardVocabTermProposal,
      openEnumOptionDefinition,
      openPredicateDefinition,
      openPredicateShapeRule,
      openVocabTermProposal,
      onOpenSubjectResource,
      onSelectExistingPredicate,
      onSort,
      openRelationValue,
      pendingProposalByPredicate,
      activeCellPopoverPlacement,
      projection,
      resolveEnumOptionTermUri,
      reviewableVocabProposals,
      shapeWarningByCell,
      showNamespaces,
      sortDirection,
      effectiveSortKey,
      startCellEdit,
      tableRows,
      targetVocabUri,
      updateActiveRelationCellValue,
      updateActiveTextCellValue,
      updateEnumSearch,
      visiblePredicates,
      vocabDefinitionIndex,
      removeEnumOption,
    ],
  )

  const sorting = useMemo<SortingState>(
    () => effectiveSortKey
      ? [{
          id: effectiveSortKey,
          desc: sortDirection === 'desc',
        }]
      : [],
    [effectiveSortKey, sortDirection],
  )

  const table = useReactTable({
    data: displayTableRows,
    columns,
    columnResizeMode: 'onChange',
    state: {
      columnSizing: localColumnSizing,
      columnVisibility,
      sorting,
    },
    onColumnSizingChange: setLocalColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const footerRow = editable
    ? (
        <StructuredSubjectCreationFooterRow
          disabled={footerModel.disabled}
          footerModel={footerModel}
          footerPredicates={footerPredicates}
          onOpen={openCreateSubjectDialog}
          title={footerModel.title}
        />
      )
    : null

  return (
    <>
      <CompactTableShell
        table={table}
        sortKey={effectiveSortKey}
        sortDirection={sortDirection}
        editable={editable}
        footerRow={footerRow}
        getRowClassName={(row) => projectStructuredProjectionTableRowClassName(row.original)}
        getCellClassName={(cell, index) => projectStructuredProjectionTableCellClassName({
          columnId: cell.column.id,
          index,
        })}
        isCellInteractive={(cell) => isStructuredProjectionTableCellInteractive({
          columnId: cell.column.id,
        })}
        onCellActivate={(row, columnId, anchor) => startCellEdit(row, columnId, anchor)}
        onCellKeyDown={handleCellKeyDown}
        onColumnMouseResize={startColumnResize}
        onColumnTouchResize={startTouchColumnResize}
      />
      <StructuredSubjectCreationDialog
        dialogModel={dialogModel}
        onOpenChange={setCreateSubjectOpen}
        onSubjectDraftChange={setSubjectDraft}
        onSubjectDraftKeyDown={handleSubjectDraftKeyDown}
        onSubmit={submitCreateSubjectProposal}
        open={createSubjectOpen}
        subjectDraft={subjectDraft}
        submitDisabled={submitDisabled}
      />
    </>
  )
}
