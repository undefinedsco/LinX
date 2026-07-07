import type { FilesDetail } from '../../domain/resource/resource-model'
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

export function StructuredResourcePreview({ file }: { file: FilesDetail }) {
  const {
    currentPodRootUri,
    projection,
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
    columnSizing,
    effectiveClassScope,
    hiddenPredicates,
    kanbanGroupPredicate,
    kanbanOrder,
    removeWhiteboardSubjectFromUi,
    setKanbanColumnOrderFromUi,
    setKanbanGroupPredicateFromUi,
    setStructuredClassScopeFromUi,
    setStructuredColumnSizingFromUi,
    setStructuredSearchTextFromUi,
    setStructuredSortFromUi,
    setStructuredSortKeyFromUi,
    setStructuredViewModeFromUi,
    setWhiteboardNodePositionFromUi,
    setWhiteboardVisualRelationsFromUi,
    structuredSearchText,
    structuredSortDirection,
    structuredSortKey,
    togglePredicateVisibilityFromUi,
    viewMode,
    whiteboardPositions,
    whiteboardSubjects,
    whiteboardVisualRelations,
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

  return (
    <div className="relative min-h-full p-2 space-y-2">
      <div
        ref={structuredViewport.viewportRef}
        data-structured-resource-viewport="true"
        aria-label={structuredViewport.chrome.viewport.ariaLabel}
        className="max-h-full overflow-y-auto overflow-x-hidden bg-background px-2 py-2"
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
          viewMode={viewMode}
          onViewModeChange={setStructuredViewModeFromUi}
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
        />
        {structuredSourceUnavailable ? <StructuredSourceUnavailableAlert /> : null}
        <StructuredShapeWarningsAlert warnings={shapeWarnings} />
        <div className="mt-2">
          {viewMode === 'table' && (
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
          )}
          {viewMode === 'kanban' && (
            <StructuredKanbanView
              documentUri={file.uri}
              projection={effectiveViewProjection}
              groupPredicate={kanbanGroupPredicate}
              kanbanOrder={kanbanOrder}
              onGroupPredicateChange={setKanbanGroupPredicateFromUi}
              onColumnOrderChange={setKanbanColumnOrderFromUi}
              onCommitCellWriteProposal={structuredWritesSupported ? commitViewCellWriteProposal : undefined}
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
              onAddSubject={addWhiteboardSubjectFromUi}
              onRemoveSubject={removeWhiteboardSubjectFromUi}
              onClearSubjects={clearWhiteboardSubjectsFromUi}
              onNodePositionChange={setWhiteboardNodePositionFromUi}
              onVisualRelationsChange={setWhiteboardVisualRelationsFromUi}
              onOpenSubject={subjectNavigation.openAlternativeViewSubject}
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
