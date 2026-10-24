import { useCallback, useMemo } from 'react'
import type { FilesDetail } from '../../domain/resource/resource-model'
import {
  useFilesStore,
  type StructuredColumnSizingUpdater,
} from '../../app/store'
import {
  removeStructuredColumnFilter,
  setStructuredColumnFilter,
  type StructuredColumnFilter,
} from '../../domain/structured/structured-column-filter'
import type { StructuredWhiteboardVisualRelation } from '../../domain/structured/structured-projections'
import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import type { StructuredViewMetadata } from '../../domain/structured/structured-view-metadata'
import {
  EMPTY_STRUCTURED_COLUMN_VIEW,
  normalizeStructuredKanbanBoardMetadata,
  normalizeStructuredWhiteboardSnapshotMetadata,
  type StructuredKanbanBoardMetadataV1,
  type StructuredWhiteboardSnapshotV1,
} from '../../domain/structured/structured-view-metadata'
import type {
  StructuredResourceViewMode,
  StructuredSortDirection,
  StructuredWhiteboardPosition,
} from '../../domain/structured/structured-view-metadata'
import {
  findRemovedStructuredColumnKey,
  projectStructuredWhiteboardVisualRelations,
  projectStructuredReconciledKanbanBoard,
  resolveStructuredEffectiveClassScope,
} from './structured-view-state-model'
import { useStructuredViewMetadataController } from './useStructuredViewMetadataController'

const EMPTY_COLUMN_SIZING: Record<string, number> = {}
const EMPTY_KANBAN_ORDER: Record<string, string[]> = {}
const EMPTY_WHITEBOARD_LAYOUT: Record<string, StructuredWhiteboardPosition> = {}
const EMPTY_WHITEBOARD_SUBJECTS: string[] = []
const EMPTY_WHITEBOARD_VISUAL_RELATIONS: StructuredWhiteboardVisualRelation[] = []

export function useStructuredViewStateController({
  file,
  projection,
}: {
  file: Pick<FilesDetail, 'uri' | 'kind'>
  projection: StructuredTableProjection
}) {
  const viewMode = useFilesStore((state) => state.structuredViewMode)
  const setStructuredViewMode = useFilesStore((state) => state.setStructuredViewMode)
  const openViews = useFilesStore((state) => state.structuredOpenViews)
  const closeStructuredView = useFilesStore((state) => state.closeStructuredView)
  const classScope = useFilesStore((state) => state.structuredClassScope)
  const setStructuredClassScope = useFilesStore((state) => state.setStructuredClassScope)
  const structuredSearchText = useFilesStore((state) => state.structuredSearchText)
  const setStructuredSearchText = useFilesStore((state) => state.setStructuredSearchText)
  const structuredSortKey = useFilesStore((state) => state.structuredSortKey)
  const structuredSortDirection = useFilesStore((state) => state.structuredSortDirection)
  const setStructuredSortKey = useFilesStore((state) => state.setStructuredSortKey)
  const setStructuredSort = useFilesStore((state) => state.setStructuredSort)
  const hiddenPredicates = useFilesStore((state) => state.structuredHiddenPredicates)
  const togglePredicateVisibility = useFilesStore((state) => state.toggleStructuredPredicateVisibility)
  const columnSizingByDocument = useFilesStore((state) => state.structuredColumnSizingByDocument)
  const setStructuredColumnSizing = useFilesStore((state) => state.setStructuredColumnSizing)
  const columnView = useFilesStore((state) => state.structuredColumnViewByDocument[file.uri] ?? EMPTY_STRUCTURED_COLUMN_VIEW)
  const setStructuredColumnView = useFilesStore((state) => state.setStructuredColumnView)
  const kanbanGroupPredicate = useFilesStore((state) => state.structuredKanbanGroupPredicate)
  const setKanbanGroupPredicate = useFilesStore((state) => state.setStructuredKanbanGroupPredicate)
  const kanbanOrder = useFilesStore((state) => state.structuredKanbanOrderByDocument[file.uri] ?? EMPTY_KANBAN_ORDER)
  const setKanbanColumnOrder = useFilesStore((state) => state.setStructuredKanbanColumnOrder)
  const storedKanbanBoard = useFilesStore((state) => state.structuredKanbanBoardByDocument[file.uri])
  const setKanbanBoard = useFilesStore((state) => state.setStructuredKanbanBoard)
  const whiteboardSubjects = useFilesStore((state) => state.structuredWhiteboardSubjectsByDocument[file.uri] ?? EMPTY_WHITEBOARD_SUBJECTS)
  const whiteboardLayoutKey = file.uri
  const whiteboardPositions = useFilesStore((state) => state.structuredWhiteboardLayoutsByDocument[whiteboardLayoutKey] ?? EMPTY_WHITEBOARD_LAYOUT)
  const legacyWhiteboardVisualRelations = useFilesStore((state) => state.structuredWhiteboardRelationsByDocument[file.uri] ?? EMPTY_WHITEBOARD_VISUAL_RELATIONS)
  const storedWhiteboardSnapshot = useFilesStore((state) => state.structuredWhiteboardSnapshotByDocument[file.uri])
  const addWhiteboardSubject = useFilesStore((state) => state.addStructuredWhiteboardSubject)
  const removeWhiteboardSubject = useFilesStore((state) => state.removeStructuredWhiteboardSubject)
  const clearWhiteboardSubjects = useFilesStore((state) => state.clearStructuredWhiteboardSubjects)
  const setWhiteboardNodePosition = useFilesStore((state) => state.setStructuredWhiteboardNodePosition)
  const setWhiteboardVisualRelations = useFilesStore((state) => state.setStructuredWhiteboardVisualRelations)
  const setWhiteboardSnapshot = useFilesStore((state) => state.setStructuredWhiteboardSnapshot)
  const hydrateStructuredViewMetadata = useFilesStore((state) => state.hydrateStructuredViewMetadata)
  const localViewMetadataDirty = useFilesStore((state) => state.structuredViewDirtyDocuments.has(file.uri))
  const markStructuredViewMetadataDirty = useFilesStore((state) => state.markStructuredViewMetadataDirty)
  const clearStructuredViewMetadataDirty = useFilesStore((state) => state.clearStructuredViewMetadataDirty)

  const columnSizing = columnSizingByDocument[file.uri] ?? EMPTY_COLUMN_SIZING
  const effectiveClassScope = useMemo(
    () => resolveStructuredEffectiveClassScope(projection, classScope),
    [classScope, projection],
  )
  const persistedKanbanBoard = useMemo(
    () => normalizeStructuredKanbanBoardMetadata(storedKanbanBoard, kanbanOrder),
    [kanbanOrder, storedKanbanBoard],
  )
  const kanbanBoard = useMemo(
    () => ({
      ...projectStructuredReconciledKanbanBoard({
        groupPredicate: kanbanGroupPredicate,
        kanbanOrder,
        projection,
        saved: persistedKanbanBoard,
        extraLanes: persistedKanbanBoard.extraLanes,
      }),
      laneLabels: persistedKanbanBoard.laneLabels,
      extraLanes: persistedKanbanBoard.extraLanes,
      cardFields: persistedKanbanBoard.cardFields,
    }),
    [kanbanGroupPredicate, kanbanOrder, persistedKanbanBoard, projection],
  )
  const whiteboardSnapshot = useMemo(
    () => normalizeStructuredWhiteboardSnapshotMetadata(storedWhiteboardSnapshot, {
      positions: whiteboardPositions,
      visualRelations: legacyWhiteboardVisualRelations,
    }),
    [legacyWhiteboardVisualRelations, storedWhiteboardSnapshot, whiteboardPositions],
  )
  const whiteboardVisualRelations = useMemo(
    () => projectStructuredWhiteboardVisualRelations(whiteboardSnapshot, legacyWhiteboardVisualRelations),
    [legacyWhiteboardVisualRelations, whiteboardSnapshot],
  )
  const currentViewMetadata = useMemo<StructuredViewMetadata>(() => ({
    documentUri: file.uri,
    viewMode,
    openViews,
    classScope: effectiveClassScope,
    searchText: structuredSearchText,
    sortKey: structuredSortKey,
    sortDirection: structuredSortDirection,
    hiddenPredicates: Array.from(hiddenPredicates),
    kanbanGroupPredicate,
    kanbanOrder,
    kanbanBoard: persistedKanbanBoard,
    columnSizing,
    columnView,
    whiteboard: {
      selectedSubjects: whiteboardSubjects,
      positions: whiteboardPositions,
      visualRelations: whiteboardVisualRelations,
      snapshot: whiteboardSnapshot,
    },
    writesCanonicalData: false,
  }), [
    columnSizing,
    columnView,
    effectiveClassScope,
    file.uri,
    hiddenPredicates,
    kanbanGroupPredicate,
    kanbanOrder,
    openViews,
    persistedKanbanBoard,
    structuredSearchText,
    structuredSortDirection,
    structuredSortKey,
    viewMode,
    whiteboardPositions,
    whiteboardSubjects,
    whiteboardVisualRelations,
    whiteboardSnapshot,
  ])
  const {
    markLocalViewMetadataChange,
    retryViewMetadataSave,
    viewMetadataSaveError,
    viewMetadataSaveStatus,
  } = useStructuredViewMetadataController({
    currentViewMetadata,
    file,
    hydrateStructuredViewMetadata,
    localViewMetadataDirty,
    markStructuredViewMetadataDirty,
    clearStructuredViewMetadataDirty,
    whiteboardLayoutKey,
  })

  const setStructuredViewModeFromUi = useCallback((mode: StructuredResourceViewMode) => {
    markLocalViewMetadataChange()
    setStructuredViewMode(mode)
  }, [markLocalViewMetadataChange, setStructuredViewMode])
  const closeStructuredViewFromUi = useCallback((mode: StructuredResourceViewMode) => {
    markLocalViewMetadataChange()
    closeStructuredView(mode)
  }, [closeStructuredView, markLocalViewMetadataChange])
  const setStructuredClassScopeFromUi = useCallback((className: string | null) => {
    markLocalViewMetadataChange()
    setStructuredClassScope(className)
  }, [markLocalViewMetadataChange, setStructuredClassScope])
  const setStructuredSearchTextFromUi = useCallback((searchText: string) => {
    markLocalViewMetadataChange()
    setStructuredSearchText(searchText)
  }, [markLocalViewMetadataChange, setStructuredSearchText])
  const setStructuredSortFromUi = useCallback((sortKey: string | null, sortDirection: StructuredSortDirection) => {
    markLocalViewMetadataChange()
    setStructuredSort(sortKey, sortDirection)
  }, [markLocalViewMetadataChange, setStructuredSort])
  const setStructuredSortKeyFromUi = useCallback((sortKey: string) => {
    markLocalViewMetadataChange()
    setStructuredSortKey(sortKey)
  }, [markLocalViewMetadataChange, setStructuredSortKey])
  const togglePredicateVisibilityFromUi = useCallback((predicate: string) => {
    markLocalViewMetadataChange()
    togglePredicateVisibility(predicate)
  }, [markLocalViewMetadataChange, togglePredicateVisibility])
  const setStructuredColumnSizingFromUi = useCallback((updater: StructuredColumnSizingUpdater) => {
    markLocalViewMetadataChange()
    setStructuredColumnSizing(file.uri, updater)
  }, [file.uri, markLocalViewMetadataChange, setStructuredColumnSizing])
  const setColumnFilterFromUi = useCallback((filter: StructuredColumnFilter) => {
    markLocalViewMetadataChange()
    setStructuredColumnView(file.uri, (current) => ({ ...current, filters: setStructuredColumnFilter(current.filters, filter) }))
  }, [file.uri, markLocalViewMetadataChange, setStructuredColumnView])
  const removeColumnFilterFromUi = useCallback((predicate: string) => {
    markLocalViewMetadataChange()
    setStructuredColumnView(file.uri, (current) => ({ ...current, filters: removeStructuredColumnFilter(current.filters, predicate) }))
  }, [file.uri, markLocalViewMetadataChange, setStructuredColumnView])
  const clearColumnFiltersFromUi = useCallback(() => {
    markLocalViewMetadataChange()
    setStructuredColumnView(file.uri, (current) => ({ ...current, filters: [] }))
  }, [file.uri, markLocalViewMetadataChange, setStructuredColumnView])
  /** An empty name puts the column's own name back. */
  const setColumnLabelFromUi = useCallback((predicate: string, label: string) => {
    markLocalViewMetadataChange()
    setStructuredColumnView(file.uri, (current) => {
      const labels = { ...current.labels }
      const trimmed = label.trim()
      if (trimmed) labels[predicate] = trimmed
      else delete labels[predicate]
      return { ...current, labels }
    })
  }, [file.uri, markLocalViewMetadataChange, setStructuredColumnView])
  const setColumnRemovedFromUi = useCallback((predicate: string, removed: boolean) => {
    markLocalViewMetadataChange()
    setStructuredColumnView(file.uri, (current) => {
      const others = current.removed.filter((entry) => entry !== predicate)
      return {
        ...current,
        removed: removed ? [...others, predicate] : others,
        // A column that left the table takes its filter with it: a chip for a column nobody sees would be a trap.
        filters: removed ? removeStructuredColumnFilter(current.filters, predicate) : current.filters,
      }
    })
  }, [file.uri, markLocalViewMetadataChange, setStructuredColumnView])
  /**
   * 加属性 brings back a column that was taken off this table. The menu may name it by its full IRI
   * while the view stored the column's key (or the other way round), so match on the local name too.
   * Returns whether a removed column was brought back.
   */
  const restoreRemovedColumnFromUi = useCallback((predicate: string): boolean => {
    const removed = findRemovedStructuredColumnKey(columnView.removed, predicate)
    if (!removed) return false
    setColumnRemovedFromUi(removed, false)
    return true
  }, [columnView.removed, setColumnRemovedFromUi])
  const setKanbanGroupPredicateFromUi = useCallback((predicate: string | null) => {
    markLocalViewMetadataChange()
    setKanbanGroupPredicate(predicate)
  }, [markLocalViewMetadataChange, setKanbanGroupPredicate])
  const setKanbanColumnOrderFromUi = useCallback((columnId: string, subjects: string[]) => {
    markLocalViewMetadataChange()
    setKanbanColumnOrder(file.uri, columnId, subjects)
    setKanbanBoard(file.uri, {
      ...kanbanBoard,
      cardOrder: {
        ...kanbanBoard.cardOrder,
        [columnId]: subjects,
      },
    })
  }, [file.uri, kanbanBoard, markLocalViewMetadataChange, setKanbanBoard, setKanbanColumnOrder])
  const setKanbanBoardFromUi = useCallback((board: StructuredKanbanBoardMetadataV1) => {
    markLocalViewMetadataChange()
    setKanbanBoard(file.uri, board)
  }, [file.uri, markLocalViewMetadataChange, setKanbanBoard])
  const addWhiteboardSubjectFromUi = useCallback((subject: string) => {
    markLocalViewMetadataChange()
    addWhiteboardSubject(file.uri, subject)
  }, [addWhiteboardSubject, file.uri, markLocalViewMetadataChange])
  const removeWhiteboardSubjectFromUi = useCallback((subject: string) => {
    markLocalViewMetadataChange()
    removeWhiteboardSubject(file.uri, subject)
  }, [file.uri, markLocalViewMetadataChange, removeWhiteboardSubject])
  const clearWhiteboardSubjectsFromUi = useCallback(() => {
    markLocalViewMetadataChange()
    clearWhiteboardSubjects(file.uri)
  }, [clearWhiteboardSubjects, file.uri, markLocalViewMetadataChange])
  const setWhiteboardNodePositionFromUi = useCallback((subject: string, position: StructuredWhiteboardPosition) => {
    markLocalViewMetadataChange()
    setWhiteboardNodePosition(whiteboardLayoutKey, subject, position)
  }, [markLocalViewMetadataChange, setWhiteboardNodePosition, whiteboardLayoutKey])
  const setWhiteboardVisualRelationsFromUi = useCallback((relations: StructuredWhiteboardVisualRelation[]) => {
    markLocalViewMetadataChange()
    setWhiteboardVisualRelations(file.uri, relations)
    setWhiteboardSnapshot(file.uri, {
      ...whiteboardSnapshot,
      visualRelations: relations.map((relation) => ({ ...relation })),
    })
  }, [file.uri, markLocalViewMetadataChange, setWhiteboardSnapshot, setWhiteboardVisualRelations, whiteboardSnapshot])
  const setWhiteboardSnapshotFromUi = useCallback((snapshot: StructuredWhiteboardSnapshotV1) => {
    markLocalViewMetadataChange()
    setWhiteboardSnapshot(file.uri, snapshot)
  }, [file.uri, markLocalViewMetadataChange, setWhiteboardSnapshot])

  return {
    addWhiteboardSubjectFromUi,
    classScope,
    clearColumnFiltersFromUi,
    clearWhiteboardSubjectsFromUi,
    closeStructuredViewFromUi,
    columnSizing,
    columnView,
    effectiveClassScope,
    hiddenPredicates,
    kanbanGroupPredicate,
    kanbanOrder,
    kanbanBoard,
    openViews,
    removeColumnFilterFromUi,
    removeWhiteboardSubjectFromUi,
    setColumnFilterFromUi,
    setColumnLabelFromUi,
    setColumnRemovedFromUi,
    restoreRemovedColumnFromUi,
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
    retryViewMetadataSave,
    viewMode,
    viewMetadataSaveError,
    viewMetadataSaveStatus,
    whiteboardPositions,
    whiteboardSubjects,
    whiteboardVisualRelations,
    whiteboardSnapshot,
  }
}
