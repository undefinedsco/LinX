import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FilesEmptyState } from '../../ui/FilesEmptyState'
import type { FilesDetail } from '../../domain/resource/resource-model'
import { createStructuredCellWriteProposal } from '../../domain/structured/structured-table'
import { StructuredColumnDialogHost } from './StructuredColumnDialogHost'
import { StructuredColumnFilterChips } from './StructuredColumnFilterChips'
import { StructuredKanbanView } from './StructuredKanbanView'
import { kanbanOptionLabels, mergeKanbanOptionLanes } from './structured-kanban-view-model'
import {
  StructuredProjectionWarningsAlert,
  StructuredShapeWarningsAlert,
  StructuredSourceUnavailableAlert,
} from './StructuredProjectionAlerts'
import { StructuredProjectionRawView } from './StructuredProjectionRawView'
import { StructuredProjectionTable } from './StructuredProjectionTable'
import { StructuredResourceToolbar } from './StructuredResourceToolbar'
import { StructuredSubjectPeekActions } from './StructuredSubjectPeekActions'
import { StructuredSubjectPeekDrawer } from './StructuredSubjectPeek'
import { StructuredWhiteboardView } from './StructuredWhiteboardView'
import { projectStructuredCardClassLabels, projectStructuredResourcePreviewHeaderModel, projectStructuredTableWithoutNameColumn } from './structured-resource-preview-header-model'
import { STRUCTURED_TABLE_ROW_ORDER_KEY } from './structured-row-selection-model'
import { localRdfName } from '../../domain/card/rdf-term-tokens'
import { useStructuredAiCellDots } from './useStructuredAiCellDots'
import { useStructuredColumnMenuController } from './useStructuredColumnMenuController'
import { useStructuredCellProposalWorkflowController } from './useStructuredCellProposalWorkflowController'
import { useStructuredProjectionFilterController } from './useStructuredProjectionFilterController'
import { useStructuredProjectionReviewController } from './useStructuredProjectionReviewController'
import { useStructuredResourcePreviewController } from './useStructuredResourcePreviewController'
import { useStructuredSourceUpdateWorkflowController } from './useStructuredSourceUpdateWorkflowController'
import { useStructuredSubjectNavigationController } from './useStructuredSubjectNavigationController'
import { useStructuredVocabProposalWorkflowController } from './useStructuredVocabProposalWorkflowController'
import { useStructuredViewportController } from './useStructuredViewportController'
import { useStructuredViewStateController } from './useStructuredViewStateController'
import { planStructuredSubjectCreation, structuredSubjectDraftFromName } from './structured-subject-creation-model'
import { projectStructuredRelationPredicateOptions } from './structured-projection-filter-model'

export function StructuredResourcePreview({ file }: { file: FilesDetail }) {
  const [classScopeMenuOpen, setClassScopeMenuOpen] = useState(false)
  const aiCellDots = useStructuredAiCellDots(file.uri)
  const {
    currentPodRootUri,
    projection,
    structuredSourceLoading,
    structuredSourceUnavailable,
    structuredSourceEtag,
    structuredWritesSupported,
    vocabDefinitionIndex,
    vocabShapesUri,
    vocabTermsUri,
  } = useStructuredResourcePreviewController(file)
  const {
    addWhiteboardSubjectFromUi,
    classScope,
    clearColumnFiltersFromUi,
    clearWhiteboardSubjectsFromUi,
    closeStructuredViewFromUi,
    columnSizing,
    columnView,
    effectiveClassScope,
    hiddenPredicates,
    kanbanBoard,
    kanbanGroupPredicate,
    kanbanOrder,
    openViews,
    removeColumnFilterFromUi,
    removeWhiteboardSubjectFromUi,
    retryViewMetadataSave,
    setColumnFilterFromUi,
    setColumnLabelFromUi,
    setColumnRemovedFromUi,
    setKanbanColumnOrderFromUi,
    setKanbanBoardFromUi,
    setKanbanGroupPredicateFromUi,
    setStructuredClassScopeFromUi,
    setStructuredColumnSizingFromUi,
    setStructuredSearchTextFromUi,
    setStructuredSortFromUi,
    setStructuredSortKeyFromUi,
    setStructuredViewModeFromUi,
    setWhiteboardNodePositionFromUi,
    setWhiteboardVisualRelationsFromUi,
    setWhiteboardSnapshotFromUi,
    structuredSearchText,
    structuredSortDirection,
    structuredSortKey,
    togglePredicateVisibilityFromUi,
    viewMode,
    viewMetadataSaveError,
    viewMetadataSaveStatus,
    whiteboardPositions,
    whiteboardSubjects,
    whiteboardVisualRelations,
    whiteboardSnapshot,
  } = useStructuredViewStateController({
    file,
    projection,
  })
  const structuredViewport = useStructuredViewportController({
    fileUri: file.uri,
    viewMode,
  })
  const {
    availablePredicateNamespaces,
    classDefinition,
    optionPredicates,
    predicateLabel,
    predicateNamespaceFilter,
    predicateTypeFilter,
    schemaPredicateControls,
    schemaProjection,
    scopedProjection,
    selectExistingPredicate,
    setPredicateNamespaceFilter,
    setPredicateTypeFilter,
    setShowNamespaces,
    setVocabTermFilter,
    showNamespaces,
    unfilteredTableProjection,
    viewProjection,
    vocabTermFilter,
  } = useStructuredProjectionFilterController({
    columnFilters: columnView.filters,
    classScope,
    documentUri: file.uri,
    hiddenPredicates,
    projection,
    structuredSearchText,
    structuredSortDirection,
    structuredSortKey,
    togglePredicateVisibilityFromUi,
    vocabDefinitionIndex,
  })
  const {
    approvePendingClassProposal,
    confirmVocabTerm,
    createPendingClassProposal,
    createVocabProposalResource,
    discardPendingClassProposal,
    discardReviewableVocabProposal,
    openClassProposal,
    pendingClassScopeProposal,
    reviewVocabProposal,
    reviewableVocabProposals,
    visiblePendingClassProposals,
  } = useStructuredVocabProposalWorkflowController({
    classOptions: scopedProjection.classOptions,
    currentPodRootUri,
    documentUri: file.uri,
    selectedClassName: scopedProjection.className,
    structuredWritesSupported,
    targetShapesUri: vocabShapesUri,
    targetVocabUri: vocabTermsUri,
  })
  const {
    chips: columnFilterChips,
    columnDialog,
    columnMenu,
    effectiveHiddenPredicates,
    labelOf: columnLabelOf,
    removedPredicates,
    toolbarFilterMenu,
  } = useStructuredColumnMenuController({
    clearColumnFilters: clearColumnFiltersFromUi,
    columnView,
    hiddenPredicates,
    predicateLabel,
    removeColumnFilter: removeColumnFilterFromUi,
    schemaPredicateControls,
    schemaProjection,
    setColumnFilter: setColumnFilterFromUi,
    setColumnLabel: setColumnLabelFromUi,
    setColumnRemoved: setColumnRemovedFromUi,
    setSort: setStructuredSortFromUi,
    structuredWritesSupported,
    togglePredicateVisibility: togglePredicateVisibilityFromUi,
    vocabDefinitionIndex,
    vocabTermsUri,
  })
  const selectExistingPredicateFromMenu = (predicate: string) => {
    // 加属性 brings back a column that was taken off this table.
    if (removedPredicates.has(predicate)) setColumnRemovedFromUi(predicate, false)
    selectExistingPredicate(predicate)
  }
  const toolbarPredicateControls = schemaPredicateControls.filter((predicate) => !removedPredicates.has(predicate))
  const {
    classScopeButtonLabel,
    classScopeDisplayLabel,
    classScopeLabel,
  } = projectStructuredResourcePreviewHeaderModel({
    classDefinition,
    pendingClassScopeProposal,
    selectedClassName: scopedProjection.className,
  })
  const {
    resourceUpdateFilteredProjection,
    setSourceUpdatesOnly,
    sourceUpdatesOnly,
  } = useStructuredSourceUpdateWorkflowController({
    documentUri: file.uri,
    projection: unfilteredTableProjection,
    structuredWritesSupported,
  })
  const {
    allPendingWriteSubjects,
    commitCellWriteProposal,
    commitViewCellWriteProposal,
    effectiveCellWriteProposals,
    persistedCellWriteProposals,
    setLocalPendingWriteSubjectsFromTable,
    syncLocalCellWriteProposalsFromTable,
  } = useStructuredCellProposalWorkflowController({
    currentPodRootUri,
    documentEtag: structuredSourceEtag,
    documentUri: file.uri,
    structuredWritesSupported,
  })
  const {
    effectiveRawText,
    effectiveViewProjection,
    pendingWritesOnly,
    setPendingWritesOnly,
    setWarningRowsOnly,
    shapeWarnings,
    structuredStatus,
    tableProjection,
    warningRowsOnly,
  } = useStructuredProjectionReviewController({
    allPendingWriteSubjects,
    classScope: scopedProjection.className,
    documentUri: file.uri,
    effectiveCellWriteProposals,
    hiddenPredicates: effectiveHiddenPredicates,
    predicateNamespaceFilter,
    predicateTypeFilter,
    resourceUpdateFilteredProjection,
    schemaProjection,
    sourceUpdatesOnly,
    viewProjection,
    vocabDefinitionIndex,
    vocabTermFilter,
  })
  const subjectNavigation = useStructuredSubjectNavigationController({
    file,
    viewportRef: structuredViewport.viewportRef,
    lastScrollTopRef: structuredViewport.lastScrollTopRef,
    projection,
    tableProjection,
    effectiveViewProjection,
    viewMode,
    effectiveClassScope,
    structuredSearchText,
    structuredSortKey,
    structuredSortDirection,
    hiddenPredicates: effectiveHiddenPredicates,
    kanbanGroupPredicate,
  })
  const whiteboardRelationPredicateOptions = projectStructuredRelationPredicateOptions(
    effectiveViewProjection,
    vocabDefinitionIndex,
  )
  const createKanbanSubject = async ({
    columnId,
    columnValue,
    subject,
  }: {
    columnId: string
    columnValue: string | null
    subject: string
  }) => {
    const plan = planStructuredSubjectCreation({
      classScope: scopedProjection.className,
      documentUri: file.uri,
      existingSubjects: effectiveViewProjection.rows.map((row) => row.subject),
      pendingSubjects: [...allPendingWriteSubjects],
      // A card is typed by its name; its address is made from it (same as 新的一行).
      subjectDraft: structuredSubjectDraftFromName(subject),
    })
    if (plan.kind !== 'create') return false

    const created = await commitViewCellWriteProposal(createStructuredCellWriteProposal({
      documentUri: file.uri,
      subject: plan.subject,
      predicate: plan.typePredicate,
      previousValues: [],
      nextValues: plan.typeValues,
    }))
    if (created === false) return false

    if (kanbanGroupPredicate && columnId !== 'ungrouped' && columnValue) {
      return (await commitViewCellWriteProposal(createStructuredCellWriteProposal({
        documentUri: file.uri,
        subject: plan.subject,
        predicate: kanbanGroupPredicate,
        previousValues: [],
        nextValues: [columnValue],
      }))) !== false
    }
    return true
  }
  // R6 K6 bulk bar: a card is the subject, so deleting clears everything written about it, and
  // moving to another table changes the class it belongs to.
  const bulkMoveTargets = scopedProjection.classOptions
    .filter((className) => className !== scopedProjection.className)
    .map((className) => ({ id: className, label: localRdfName(className) }))
  const rowsBySubject = new Map(projection.rows.map((row) => [row.subject, row]))
  const deleteSubjects = async (subjects: string[]) => {
    for (const subject of subjects) {
      for (const cell of rowsBySubject.get(subject)?.cells ?? []) {
        if (cell.values.length === 0) continue
        await commitViewCellWriteProposal(createStructuredCellWriteProposal({
          documentUri: file.uri,
          subject,
          predicate: cell.predicate,
          previousValues: cell.values,
          nextValues: [],
        }))
      }
    }
  }
  const moveSubjects = async (subjects: string[], className: string) => {
    for (const subject of subjects) {
      const previous = rowsBySubject.get(subject)?.cells.find((cell) => cell.predicate === 'rdf:type')?.values ?? []
      await commitViewCellWriteProposal(createStructuredCellWriteProposal({
        documentUri: file.uri,
        subject,
        predicate: 'rdf:type',
        previousValues: previous,
        nextValues: [className],
      }))
    }
  }
  const createWhiteboardSubject = async (subject: string) => {
    const plan = planStructuredSubjectCreation({
      classScope: scopedProjection.className,
      documentUri: file.uri,
      existingSubjects: effectiveViewProjection.rows.map((row) => row.subject),
      pendingSubjects: [...allPendingWriteSubjects],
      // A card is typed by its name; its address is made from it (same as 新的一行).
      subjectDraft: structuredSubjectDraftFromName(subject),
    })
    if (plan.kind !== 'create') return false

    const created = await commitViewCellWriteProposal(createStructuredCellWriteProposal({
      documentUri: file.uri,
      subject: plan.subject,
      predicate: plan.typePredicate,
      previousValues: [],
      nextValues: plan.typeValues,
    }))
    if (created === false) return false
    addWhiteboardSubjectFromUi(plan.subject)
    return true
  }

  const kanbanLanes = useMemo(
    () => mergeKanbanOptionLanes(kanbanBoard.extraLanes, kanbanGroupPredicate, vocabDefinitionIndex?.enumOptionsByPredicate),
    [kanbanBoard.extraLanes, kanbanGroupPredicate, vocabDefinitionIndex?.enumOptionsByPredicate],
  )

  // Cards name their type by the label people gave it (「任务」), not by the class's local name (Task).
  const cardProjection = useMemo(() => ({
    ...effectiveViewProjection,
    classLabels: projectStructuredCardClassLabels({
      classes: vocabDefinitionIndex?.classes,
      scopeClassName: scopedProjection.className,
      scopeLabel: classScopeDisplayLabel,
    }),
  }), [classScopeDisplayLabel, effectiveViewProjection, scopedProjection.className, vocabDefinitionIndex?.classes])

  const namedTableProjection = useMemo(
    () => projectStructuredTableWithoutNameColumn(tableProjection, file.uri),
    [file.uri, tableProjection],
  )

  const kanbanOptionOrder = useMemo(
    () => kanbanOptionLabels(kanbanGroupPredicate, vocabDefinitionIndex?.enumOptionsByPredicate),
    [kanbanGroupPredicate, vocabDefinitionIndex?.enumOptionsByPredicate],
  )

  return (
    <div className="relative min-h-full w-full min-w-0 max-w-full overflow-hidden p-2 space-y-2">
      <div
        ref={structuredViewport.viewportRef}
        data-structured-resource-viewport="true"
        aria-label={structuredViewport.chrome.viewport.ariaLabel}
        className="max-h-full w-full min-w-0 max-w-full overflow-y-auto overflow-x-hidden bg-background px-2 py-2"
        onScroll={structuredViewport.handleStructuredViewportScroll}
        onClickCapture={structuredViewport.recordStructuredViewportScrollTop}
        onKeyDownCapture={structuredViewport.recordStructuredViewportScrollTop}
      >
        <StructuredResourceToolbar
          columnFilterMenu={viewMode === 'table' ? toolbarFilterMenu : undefined}
          documentUri={file.uri}
          classScopeDisplayLabel={classScopeDisplayLabel}
          structuredStatus={structuredStatus}
          classScopeButtonLabel={classScopeButtonLabel}
          classScopeLabel={classScopeLabel}
          classOptions={scopedProjection.classOptions}
          selectedClassName={scopedProjection.className}
          classDefinition={classDefinition}
          structuredWritesSupported={structuredWritesSupported}
          visiblePendingClassProposals={visiblePendingClassProposals}
          onSelectClassScope={setStructuredClassScopeFromUi}
          onCreatePendingClassProposal={createPendingClassProposal}
          onApprovePendingClassProposal={approvePendingClassProposal}
          onDiscardPendingClassProposal={discardPendingClassProposal}
          onOpenClassProposal={openClassProposal}
          classScopeMenuOpen={classScopeMenuOpen}
          onClassScopeMenuOpenChange={setClassScopeMenuOpen}
          viewMode={viewMode}
          onViewModeChange={setStructuredViewModeFromUi}
          openViews={openViews}
          onCloseView={closeStructuredViewFromUi}
          searchText={structuredSearchText}
          onSearchTextChange={setStructuredSearchTextFromUi}
          warningRowsOnly={warningRowsOnly}
          onWarningRowsOnlyChange={setWarningRowsOnly}
          pendingWritesOnly={pendingWritesOnly}
          onPendingWritesOnlyChange={setPendingWritesOnly}
          sourceUpdatesOnly={sourceUpdatesOnly}
          onSourceUpdatesOnlyChange={setSourceUpdatesOnly}
          predicateTypeFilter={predicateTypeFilter}
          onPredicateTypeFilterChange={setPredicateTypeFilter}
          predicateNamespaceFilter={predicateNamespaceFilter}
          onPredicateNamespaceFilterChange={setPredicateNamespaceFilter}
          availablePredicateNamespaces={availablePredicateNamespaces}
          vocabTermFilter={vocabTermFilter}
          onVocabTermFilterChange={setVocabTermFilter}
          schemaPredicateControls={toolbarPredicateControls}
          predicateLabel={columnLabelOf}
          structuredSortKey={structuredSortKey}
          structuredSortDirection={structuredSortDirection}
          onSort={setStructuredSortFromUi}
          showNamespaces={showNamespaces}
          onShowNamespacesChange={setShowNamespaces}
          hiddenPredicates={hiddenPredicates}
          onTogglePredicateVisibility={togglePredicateVisibilityFromUi}
          viewMetadataSaveStatus={viewMetadataSaveStatus}
          viewMetadataSaveError={viewMetadataSaveError}
          onRetryViewMetadataSave={retryViewMetadataSave}
        />
        {viewMode === 'table' ? (
          <StructuredColumnFilterChips
            chips={columnFilterChips}
            onClear={clearColumnFiltersFromUi}
            onRemove={removeColumnFilterFromUi}
          />
        ) : null}
        {structuredSourceUnavailable ? <StructuredSourceUnavailableAlert /> : null}
        <StructuredShapeWarningsAlert warnings={shapeWarnings} />
        <div className="mt-2">
          {structuredSourceLoading && viewMode === 'table' ? (
            <StructuredTableLoadingSkeleton />
          ) : viewMode === 'table' && projection.rows.length === 0 && !scopedProjection.className ? (
            <FilesEmptyState
              title="这个文档还没有数据"
              description="文档中还没有任何行。先创建一个类型，再往里添加行。"
              action={(
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setClassScopeMenuOpen(true)}
                >
                  创建类型
                </Button>
              )}
            />
          ) : viewMode === 'table' && !scopedProjection.className ? (
            <FilesEmptyState
              title="尚未选择类型"
              description="先选择或创建一个类型，再查看这个类型的行和属性。"
              action={(
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setClassScopeMenuOpen(true)}
                >
                  选择或创建类型
                </Button>
              )}
            />
          ) : viewMode === 'table' ? (
            <StructuredProjectionTable
              columnMenu={columnMenu}
              onConfirmVocabTerm={structuredWritesSupported ? confirmVocabTerm : undefined}
              rowOrder={kanbanOrder[STRUCTURED_TABLE_ROW_ORDER_KEY]}
              onRowOrderChange={(subjects) => setKanbanColumnOrderFromUi(STRUCTURED_TABLE_ROW_ORDER_KEY, subjects)}
              bulkMoveTargets={bulkMoveTargets}
              onDeleteSubjects={structuredWritesSupported ? deleteSubjects : undefined}
              onMoveSubjects={structuredWritesSupported ? moveSubjects : undefined}
              aiCellDots={aiCellDots.aiCellDots}
              aiColumns={aiCellDots.aiColumns}
              onKeepAiColumn={aiCellDots.onKeepAiColumn}
              onRemoveAiColumn={aiCellDots.onRemoveAiColumn}
              onUndoAiCell={aiCellDots.onUndoAiCell}
              onSeenAiCell={aiCellDots.onSeenAiCell}
              documentUri={file.uri}
              projection={namedTableProjection}
              availablePredicates={schemaPredicateControls}
              classScope={scopedProjection.className}
              sortKey={structuredSortKey}
              sortDirection={structuredSortDirection}
              onSort={setStructuredSortKeyFromUi}
              showNamespaces={showNamespaces}
              columnSizing={columnSizing}
              onColumnSizingChange={setStructuredColumnSizingFromUi}
              hiddenPredicates={effectiveHiddenPredicates}
              editable={structuredWritesSupported}
              onOpenSubjectResource={subjectNavigation.openSubjectPeek}
              onCommitCellWriteProposal={structuredWritesSupported ? commitCellWriteProposal : undefined}
              onPendingWriteSubjectsChange={setLocalPendingWriteSubjectsFromTable}
              onLocalCellWriteProposalsChange={syncLocalCellWriteProposalsFromTable}
              onCreateVocabTermProposal={structuredWritesSupported ? createVocabProposalResource : undefined}
              onOpenVocabTermProposal={reviewVocabProposal}
              onDiscardVocabTermProposal={discardReviewableVocabProposal}
              onSelectExistingPredicate={selectExistingPredicateFromMenu}
              reviewableVocabProposals={reviewableVocabProposals}
              vocabDefinitionIndex={vocabDefinitionIndex}
              shapeWarnings={shapeWarnings}
              persistedCellWriteProposals={persistedCellWriteProposals}
              pendingWritesOnly={pendingWritesOnly}
              currentPodRootUri={currentPodRootUri}
              targetVocabUri={vocabTermsUri}
              targetShapesUri={vocabShapesUri}
            />
          ) : null}
          {viewMode === 'kanban' && (
            <StructuredKanbanView
              documentUri={file.uri}
              projection={cardProjection}
              groupPredicate={kanbanGroupPredicate}
              kanbanOrder={kanbanOrder}
              laneOrder={kanbanBoard.laneOrder}
              initialCollapsedLaneIds={kanbanBoard.collapsedLaneIds}
              initialScrollLeft={kanbanBoard.scrollLeft}
              extraLanes={kanbanLanes}
              optionOrder={kanbanOptionOrder}
              laneLabels={kanbanBoard.laneLabels}
              cardFields={kanbanBoard.cardFields}
              predicateLabel={predicateLabel}
              optionPredicates={optionPredicates}
              onBoardChange={structuredWritesSupported ? (patch) => setKanbanBoardFromUi({ ...kanbanBoard, ...patch }) : undefined}
              onGroupPredicateChange={setKanbanGroupPredicateFromUi}
              onColumnOrderChange={setKanbanColumnOrderFromUi}
              onLaneOrderChange={(laneOrder) => setKanbanBoardFromUi({ ...kanbanBoard, laneOrder })}
              onCollapsedLaneIdsChange={(collapsedLaneIds) => setKanbanBoardFromUi({ ...kanbanBoard, collapsedLaneIds })}
              onHorizontalScrollLeftChange={(scrollLeft) => setKanbanBoardFromUi({ ...kanbanBoard, scrollLeft })}
              onCommitCellWriteProposal={structuredWritesSupported ? commitViewCellWriteProposal : undefined}
              onCreateSubject={structuredWritesSupported ? createKanbanSubject : undefined}
              onOpenSubject={subjectNavigation.openAlternativeViewSubject}
            />
          )}
          {viewMode === 'whiteboard' && (
            <StructuredWhiteboardView
              documentUri={file.uri}
              layout={whiteboardPositions}
              projection={cardProjection}
              selectedSubjects={whiteboardSubjects}
              visualRelations={whiteboardVisualRelations}
              snapshot={whiteboardSnapshot}
              relationPredicateOptions={whiteboardRelationPredicateOptions}
              onAddSubject={addWhiteboardSubjectFromUi}
              onCreateSubject={structuredWritesSupported ? createWhiteboardSubject : undefined}
              onRemoveSubject={removeWhiteboardSubjectFromUi}
              onClearSubjects={clearWhiteboardSubjectsFromUi}
              onNodePositionChange={setWhiteboardNodePositionFromUi}
              onVisualRelationsChange={setWhiteboardVisualRelationsFromUi}
              onSnapshotChange={setWhiteboardSnapshotFromUi}
              onOpenSubject={subjectNavigation.openAlternativeViewSubject}
              onCommitCellWriteProposal={structuredWritesSupported ? commitViewCellWriteProposal : undefined}
            />
          )}
          {viewMode === 'raw' && (
            structuredSourceUnavailable
              ? <StructuredSourceUnavailableAlert compact />
              : <StructuredProjectionRawView text={effectiveRawText} />
          )}
        </div>
      </div>
      <StructuredColumnDialogHost
        dialog={columnDialog.model}
        onChangeType={columnDialog.onChangeType}
        onClose={columnDialog.onClose}
        onFilterChange={columnDialog.onFilterChange}
        onRemove={columnDialog.onRemove}
        onRename={columnDialog.onRename}
      />
      <StructuredProjectionWarningsAlert warnings={projection.warnings} />
      <StructuredSubjectPeekDrawer
        peek={subjectNavigation.subjectPeek}
        onClose={subjectNavigation.clearSubjectPeek}
      >
        <StructuredSubjectPeekActions
          peek={subjectNavigation.subjectPeek}
          onClose={subjectNavigation.clearSubjectPeek}
          onCopyExternalIri={subjectNavigation.copyPeekedExternalIri}
          onOpenSource={subjectNavigation.openPeekedSource}
          onOpenSubjectResource={subjectNavigation.openPeekedSubjectResource}
        />
      </StructuredSubjectPeekDrawer>
    </div>
  )
}

function StructuredTableLoadingSkeleton() {
  return (
    <div aria-label="结构化表加载中" className="overflow-hidden rounded-md border border-border/30">
      <div className="grid grid-cols-[minmax(120px,1fr)_repeat(3,minmax(110px,1fr))] border-b border-border/30 bg-muted/20 px-3 py-2">
        {[0, 1, 2, 3].map((cell) => (
          <span key={cell} className="h-3 w-16 animate-pulse rounded bg-muted" />
        ))}
      </div>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="grid grid-cols-[minmax(120px,1fr)_repeat(3,minmax(110px,1fr))] gap-3 border-b border-border/20 px-3 py-3 last:border-0">
          {[0, 1, 2, 3].map((cell) => (
            <span key={cell} className="h-3 animate-pulse rounded bg-muted/70" style={{ width: `${48 + ((row + cell) % 3) * 18}%` }} />
          ))}
        </div>
      ))}
    </div>
  )
}
