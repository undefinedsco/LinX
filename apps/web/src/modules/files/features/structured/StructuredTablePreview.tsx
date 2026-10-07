import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FilesEmptyState } from '../../ui/FilesEmptyState'
import type { FilesDetail } from '../../domain/resource/resource-model'
import { createStructuredCellWriteProposal } from '../../domain/structured/structured-table'
import { StructuredKanbanView } from './StructuredKanbanView'
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
import { projectStructuredResourcePreviewHeaderModel } from './structured-resource-preview-header-model'
import { useStructuredCellProposalWorkflowController } from './useStructuredCellProposalWorkflowController'
import { useStructuredProjectionFilterController } from './useStructuredProjectionFilterController'
import { useStructuredProjectionReviewController } from './useStructuredProjectionReviewController'
import { useStructuredResourcePreviewController } from './useStructuredResourcePreviewController'
import { useStructuredSourceUpdateWorkflowController } from './useStructuredSourceUpdateWorkflowController'
import { useStructuredSubjectNavigationController } from './useStructuredSubjectNavigationController'
import { useStructuredVocabProposalWorkflowController } from './useStructuredVocabProposalWorkflowController'
import { useStructuredViewportController } from './useStructuredViewportController'
import { useStructuredViewStateController } from './useStructuredViewStateController'
import { planStructuredSubjectCreation } from './structured-subject-creation-model'
import { projectStructuredRelationPredicateOptions } from './structured-projection-filter-model'

export function StructuredResourcePreview({ file }: { file: FilesDetail }) {
  const [classScopeMenuOpen, setClassScopeMenuOpen] = useState(false)
  const {
    currentPodRootUri,
    projection,
    structuredSourceLoading,
    structuredSourceUnavailable,
    structuredWritesSupported,
    vocabDefinitionIndex,
    vocabShapesUri,
    vocabTermsUri,
  } = useStructuredResourcePreviewController(file)
  const {
    addWhiteboardSubjectFromUi,
    classScope,
    clearWhiteboardSubjectsFromUi,
    closeStructuredViewFromUi,
    columnSizing,
    effectiveClassScope,
    hiddenPredicates,
    kanbanBoard,
    kanbanGroupPredicate,
    kanbanOrder,
    openViews,
    removeWhiteboardSubjectFromUi,
    retryViewMetadataSave,
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
    hiddenPredicates,
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
    hiddenPredicates,
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
      existingSubjects: effectiveViewProjection.rows.map((row) => row.subject),
      pendingSubjects: [...allPendingWriteSubjects],
      subjectDraft: subject,
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
      return commitViewCellWriteProposal(createStructuredCellWriteProposal({
        documentUri: file.uri,
        subject: plan.subject,
        predicate: kanbanGroupPredicate,
        previousValues: [],
        nextValues: [columnValue],
      }))
    }
    return true
  }
  const createWhiteboardSubject = async (subject: string) => {
    const plan = planStructuredSubjectCreation({
      classScope: scopedProjection.className,
      existingSubjects: effectiveViewProjection.rows.map((row) => row.subject),
      pendingSubjects: [...allPendingWriteSubjects],
      subjectDraft: subject,
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
          schemaPredicateControls={schemaPredicateControls}
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
        {structuredSourceUnavailable ? <StructuredSourceUnavailableAlert /> : null}
        <StructuredShapeWarningsAlert warnings={shapeWarnings} />
        <div className="mt-2">
          {structuredSourceLoading && viewMode === 'table' ? (
            <StructuredTableLoadingSkeleton />
          ) : viewMode === 'table' && projection.rows.length === 0 && !scopedProjection.className ? (
            <FilesEmptyState
              title="这个文档还没有数据"
              description="文档中还没有任何 subject。先创建一个 class，再为该 class 添加 subject。"
              action={(
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setClassScopeMenuOpen(true)}
                >
                  创建 class
                </Button>
              )}
            />
          ) : viewMode === 'table' && !scopedProjection.className ? (
            <FilesEmptyState
              title="尚未选择 class"
              description="先选择或创建一个 class，再查看该 class 的 subject 和 predicate。"
              action={(
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setClassScopeMenuOpen(true)}
                >
                  选择或创建 class
                </Button>
              )}
            />
          ) : viewMode === 'table' ? (
            <StructuredProjectionTable
              documentUri={file.uri}
              projection={tableProjection}
              availablePredicates={schemaPredicateControls}
              classScope={scopedProjection.className}
              sortKey={structuredSortKey}
              sortDirection={structuredSortDirection}
              onSort={setStructuredSortKeyFromUi}
              showNamespaces={showNamespaces}
              columnSizing={columnSizing}
              onColumnSizingChange={setStructuredColumnSizingFromUi}
              hiddenPredicates={hiddenPredicates}
              editable={structuredWritesSupported}
              onOpenSubjectResource={subjectNavigation.openSubjectPeek}
              onCommitCellWriteProposal={structuredWritesSupported ? commitCellWriteProposal : undefined}
              onPendingWriteSubjectsChange={setLocalPendingWriteSubjectsFromTable}
              onLocalCellWriteProposalsChange={syncLocalCellWriteProposalsFromTable}
              onCreateVocabTermProposal={structuredWritesSupported ? createVocabProposalResource : undefined}
              onOpenVocabTermProposal={reviewVocabProposal}
              onDiscardVocabTermProposal={discardReviewableVocabProposal}
              onSelectExistingPredicate={selectExistingPredicate}
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
              projection={effectiveViewProjection}
              groupPredicate={kanbanGroupPredicate}
              kanbanOrder={kanbanOrder}
              laneOrder={kanbanBoard.laneOrder}
              initialCollapsedLaneIds={kanbanBoard.collapsedLaneIds}
              initialScrollLeft={kanbanBoard.scrollLeft}
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
              projection={effectiveViewProjection}
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
