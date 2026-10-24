import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnSizingState,
  type SortingState,
} from '@tanstack/react-table'

import {
  type StructuredCellCommitResult, type StructuredCellWriteProposal,
  type StructuredShapeValidationWarning,
  type StructuredTableProjection,
  type StructuredVocabDefinitionIndex,
  type VocabTermProposal,
} from '../../domain/structured/structured-table'
import type { AiCellChange } from '../../domain/proposal/ai-cell-change-model'
import type { AiColumnChange } from '../../domain/proposal/ai-column-change-model'
import { CompactTableShell } from '../../ui/CompactTableShell'
import {
  buildStructuredProjectionTableColumns,
  createStructuredHeaderCache,
  openStructuredNewCard,
  openStructuredSubjectCard,
  type StructuredColumnMenuInput,
  type StructuredSubjectOpenOptions,
} from './StructuredProjectionTableColumns'
import { StructuredSaveLine } from './StructuredSaveLine'
import { StructuredRowBulkBar, type StructuredBulkMoveTarget } from './StructuredRowBulkBar'
import {
  applyStructuredRowOrder,
  moveStructuredRow,
  projectStructuredSelectedSubjects,
} from './structured-row-selection-model'
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
import { StructuredSubjectCreationFooterRow } from './StructuredSubjectCreationControls'
import {
  isStructuredProjectionTableCellInteractive,
  projectStructuredProjectionTableCellClassName,
  projectStructuredProjectionTableRowClassName,
} from './structured-projection-table-chrome'

const EMPTY_HIDDEN_PREDICATES = new Set<string>()

export function StructuredProjectionTable({
  columnMenu,
  onConfirmVocabTerm,
  aiCellDots,
  aiColumns,
  onKeepAiColumn,
  onRemoveAiColumn,
  onUndoAiCell,
  onSeenAiCell,
  rowOrder,
  onRowOrderChange,
  bulkMoveTargets = [],
  onDeleteSubjects,
  onMoveSubjects,
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
  /** K6d: the column header menu (names, filters, sort, hide, remove, type). */
  columnMenu?: StructuredColumnMenuInput
  /** The person's own new column or option goes straight into the vocabulary. */
  onConfirmVocabTerm?: (proposal: VocabTermProposal, options?: { resolveRecord?: boolean }) => boolean | Promise<boolean>
  aiCellDots?: ReadonlyMap<string, AiCellChange>
  aiColumns?: ReadonlyMap<string, AiColumnChange>
  onKeepAiColumn?: (change: AiColumnChange) => void
  onRemoveAiColumn?: (change: AiColumnChange) => void
  /** Hand-dragged row order (subjects); saved by the caller. Only used while no sort is on. */
  rowOrder?: readonly string[]
  onRowOrderChange?: (subjects: string[]) => void
  /** Other tables a row can be moved to from the bulk bar. */
  bulkMoveTargets?: readonly StructuredBulkMoveTarget[]
  onDeleteSubjects?: (subjects: string[]) => void | Promise<unknown>
  onMoveSubjects?: (subjects: string[], targetId: string) => void | Promise<unknown>
  onUndoAiCell?: (change: AiCellChange) => void
  onSeenAiCell?: (change: AiCellChange) => void
  documentUri: string
  projection: StructuredTableProjection
  availablePredicates?: readonly string[]
  classScope?: string | null
  sortKey?: string | null
  sortDirection?: 'asc' | 'desc'
  onSort?: (sortKey: string) => void
  onOpenSubjectResource?: (subject: string, targetUri: string, kind: StructuredProjectionSubjectOpenKind, options?: StructuredSubjectOpenOptions) => void
  onCommitCellWriteProposal?: (proposal: StructuredCellWriteProposal) => StructuredCellCommitResult | Promise<StructuredCellCommitResult>
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
    retryFailedWrite,
    saveState,
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
    confirmedLabelByPredicate,
    createPendingPredicateProposal,
    discardPendingPredicateProposal,
    findVisiblePendingPredicateProposal,
    getPredicateDefinition,
    pendingPredicateIds,
    pendingProposalByPredicate,
    vocabTermProposalResourceUriForPredicate,
  } = useStructuredPendingPredicateColumns({
    aiColumns,
    onKeepAiColumn,
    onRemoveAiColumn,
    classScope,
    currentPodRootUri,
    documentUri,
    onConfirmVocabTerm,
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
    addSubjectByName,
    createSubjectByName,
    footerModel,
    pendingSubjects,
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
    onCreateVocabTermProposal: onConfirmVocabTerm ?? onCreateVocabTermProposal,
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
    openEnumOptionDefinition,
    openPredicateDefinition,
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

  const [selectedSubjects, setSelectedSubjects] = useState<ReadonlySet<string>>(() => new Set())
  useEffect(() => { setSelectedSubjects(new Set()) }, [documentUri, classScope])
  const toggleSubject = useCallback((subject: string) => {
    setSelectedSubjects((current) => {
      const next = new Set(current)
      if (next.has(subject)) next.delete(subject)
      else next.add(subject)
      return next
    })
  }, [])
  const orderedRows = useMemo(
    () => (effectiveSortKey ? displayTableRows : applyStructuredRowOrder(displayTableRows, rowOrder)),
    [displayTableRows, effectiveSortKey, rowOrder],
  )
  const selectedList = useMemo(
    () => projectStructuredSelectedSubjects(orderedRows, selectedSubjects),
    [orderedRows, selectedSubjects],
  )
  const canReorderRows = !!onRowOrderChange && !effectiveSortKey
  const reorderRows = useCallback((activeId: string, overId: string) => {
    const next = moveStructuredRow(orderedRows.map((row) => row.subject), activeId, overId)
    if (next) onRowOrderChange?.(next)
  }, [onRowOrderChange, orderedRows])

  const [headerCache] = useState(createStructuredHeaderCache)
  const columns = useMemo(
    () => buildStructuredProjectionTableColumns({
      headerCache,
      columnMenu,
      selectedSubjects,
      onToggleSubject: toggleSubject,
      aiCellDots,
      onUndoAiCell,
      onSeenAiCell,
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
      onDiscardVocabTermProposal,
      onOpenEnumOptionDefinition: openEnumOptionDefinition,
      onOpenPredicateDefinition: openPredicateDefinition,
      onOpenSubjectResource,
      onOpenVocabTermProposal: openVocabTermProposal,
      onSelectExistingPredicate,
      onSort,
      openRelationValue,
      confirmedLabelByPredicate,
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
      columnMenu,
      selectedSubjects,
      toggleSubject,
      aiCellDots,
      onUndoAiCell,
      onSeenAiCell,
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
      onDiscardVocabTermProposal,
      openEnumOptionDefinition,
      openPredicateDefinition,
      openVocabTermProposal,
      onOpenSubjectResource,
      onSelectExistingPredicate,
      onSort,
      openRelationValue,
      confirmedLabelByPredicate,
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
    data: orderedRows,
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

  /** R6 K2: "+ 卡片" opens an empty card; the row is created from the title typed there. */
  const openNewCard = useCallback(() => {
    openStructuredNewCard(projection, documentUri, createSubjectByName)
  }, [createSubjectByName, documentUri, projection])

  const footerRow = editable
    ? (
        <StructuredSubjectCreationFooterRow
          disabled={footerModel.disabled}
          footerModel={footerModel}
          footerPredicates={footerPredicates}
          onOpen={openNewCard}
          onAddByName={addSubjectByName}
          title={footerModel.title}
        />
      )
    : null

  return (
    <>
      <StructuredSaveLine state={saveState} onRetry={retryFailedWrite} />
      {selectedList.length > 0 ? (
        <StructuredRowBulkBar
          count={selectedList.length}
          moveTargets={bulkMoveTargets}
          onOpen={() => openStructuredSubjectCard(projection, documentUri, selectedList[0]!)}
          onDelete={onDeleteSubjects ? async () => {
            await onDeleteSubjects(selectedList)
            setSelectedSubjects(new Set())
          } : undefined}
          onMove={onMoveSubjects ? async (targetId) => {
            await onMoveSubjects(selectedList, targetId)
            setSelectedSubjects(new Set())
          } : undefined}
          onClear={() => setSelectedSubjects(new Set())}
        />
      ) : null}
      <CompactTableShell
        table={table}
        rowDnd={canReorderRows ? {
          getRowId: (row) => row.subject,
          getRowLabel: (row) => `移动 ${row.subject.replace(/^.*[#/]/, '')}`,
          onReorder: reorderRows,
        } : undefined}
        sortKey={effectiveSortKey}
        sortDirection={sortDirection}
        editable={editable}
        pinnedColumnId="subject"
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
    </>
  )
}
