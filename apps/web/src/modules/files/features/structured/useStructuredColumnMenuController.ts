import { useCallback, useMemo, useRef, useState } from 'react'

import { useToast } from '@/components/ui/use-toast'
import { formatFilesErrorForUser } from '@/lib/user-facing-errors'

import { useChangeVocabTermValueType } from '../../data/queries'
import {
  STRUCTURED_SUBJECT_FILTER_KEY,
  classifyStructuredColumnValueKind,
  type StructuredColumnFilter,
} from '../../domain/structured/structured-column-filter'
import { reshapePredicateShapeForValueType } from '../../domain/structured/structured-predicate-draft'
import type {
  StructuredTableProjection,
  StructuredVocabDefinitionIndex,
} from '../../domain/structured/structured-table'
import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'
import type { StructuredColumnViewState } from '../../domain/structured/structured-view-metadata'
import type { StructuredColumnMenuInput } from './StructuredProjectionTableColumns'
import type { StructuredColumnDialogKind, StructuredColumnDialogModel } from './StructuredColumnDialogHost'
import {
  projectStructuredColumnFilterChips,
  projectStructuredColumnFilterColumns,
} from './structured-column-filter-model'
import { projectStructuredPredicateTypeLabel } from './structured-predicate-column-header-model'

/**
 * A callback that keeps its identity while always running the latest closure. Column headers are
 * rebuilt whenever the column definitions change, which would close an open menu, so what the menu
 * calls must not change on every render.
 */
function useStableCallback<TArgs extends unknown[], TResult>(callback: (...args: TArgs) => TResult) {
  const latest = useRef(callback)
  latest.current = callback
  return useCallback((...args: TArgs) => latest.current(...args), [])
}

/**
 * Everything the column header menu and the filter chips need (R6 K6d), gathered from the view
 * state so the table preview only passes it along.
 */
export function useStructuredColumnMenuController({
  clearColumnFilters,
  columnView,
  hiddenPredicates,
  predicateLabel,
  removeColumnFilter,
  schemaPredicateControls,
  schemaProjection,
  setColumnFilter,
  setColumnLabel,
  setColumnRemoved,
  setSort,
  structuredWritesSupported,
  togglePredicateVisibility,
  vocabDefinitionIndex,
  vocabTermsUri,
}: {
  clearColumnFilters: () => void
  columnView: StructuredColumnViewState
  hiddenPredicates: ReadonlySet<string>
  predicateLabel: (predicate: string) => string
  removeColumnFilter: (predicate: string) => void
  schemaPredicateControls: readonly string[]
  schemaProjection: StructuredTableProjection
  setColumnFilter: (filter: StructuredColumnFilter) => void
  setColumnLabel: (predicate: string, label: string) => void
  setColumnRemoved: (predicate: string, removed: boolean) => void
  setSort: (sortKey: string | null, sortDirection: 'asc' | 'desc') => void
  structuredWritesSupported: boolean
  togglePredicateVisibility: (predicate: string) => void
  vocabDefinitionIndex: StructuredVocabDefinitionIndex
  vocabTermsUri: string
}) {
  const { toast } = useToast()
  const changeValueType = useChangeVocabTermValueType()
  // The dialogs live here, not in a column header: headers are rebuilt with the columns, which would
  // throw away a dialog (and its half-typed text) while it is open.
  const [openDialog, setOpenDialog] = useState<{ kind: StructuredColumnDialogKind; predicate: string } | null>(null)

  const removed = useMemo(() => new Set(columnView.removed), [columnView.removed])
  /** Hidden and removed columns are both out of the table; only hidden ones stay in the 列显示 list. */
  const effectiveHiddenPredicates = useMemo(
    () => new Set([...hiddenPredicates, ...columnView.removed]),
    [columnView.removed, hiddenPredicates],
  )
  const labelOf = useCallback((predicate: string) => {
    const named = columnView.labels[predicate]
    if (named) return named
    return predicate === STRUCTURED_SUBJECT_FILTER_KEY ? '名称' : predicateLabel(predicate)
  }, [columnView.labels, predicateLabel])
  const definitionOf = useCallback((predicate: string) => (
    vocabDefinitionIndex.predicates.get(predicate)
    ?? vocabDefinitionIndex.predicates.get(localPredicateLabel(predicate))
  ), [vocabDefinitionIndex])
  const valueKindOf = useCallback((predicate: string) => {
    if (predicate === STRUCTURED_SUBJECT_FILTER_KEY) return 'text' as const
    const observed = schemaProjection.rows.flatMap((row) => row.cells.find((cell) => cell.predicate === predicate)?.values ?? [])
    return classifyStructuredColumnValueKind(projectStructuredPredicateTypeLabel(definitionOf(predicate), observed))
  }, [definitionOf, schemaProjection.rows])

  const applyFilter = useStableCallback((predicate: string, filter: StructuredColumnFilter | null) => {
    if (filter) setColumnFilter(filter)
    else removeColumnFilter(predicate)
  })

  const hideColumn = useStableCallback((predicate: string, label: string) => {
    togglePredicateVisibility(predicate)
    toast({ description: `已隐藏“${label}”，在工具栏的“列显示”里可以找回。` })
  })
  const removeColumn = useStableCallback((predicate: string, label: string) => {
    setColumnRemoved(predicate, true)
    toast({ description: `已从这张表去掉“${label}”，卡片上的值还在。用“加属性”可以加回来。` })
  })

  // Terms read from a registry written by hand may be relative (#slug).
  const absoluteTermUri = (uri: string) => (uri.startsWith('#') ? `${vocabTermsUri}${uri}` : uri)
  const canChangeType = useStableCallback((predicate: string) => {
    const termUri = absoluteTermUri(definitionOf(predicate)?.uri ?? '')
    return structuredWritesSupported && !!vocabTermsUri && termUri.startsWith(`${vocabTermsUri}#`)
  })
  const changeType = async (predicate: string, valueType: string) => {
    const definition = definitionOf(predicate)
    if (!definition || !canChangeType(predicate)) return false
    try {
      await changeValueType.mutateAsync({
        termUri: absoluteTermUri(definition.uri),
        targetVocabUri: vocabTermsUri,
        valueType,
        shape: reshapePredicateShapeForValueType(definition.shape, valueType),
      })
      toast({ description: `已改好“${labelOf(predicate)}”的值的类型。` })
      return true
    } catch (error) {
      toast({ description: formatFilesErrorForUser(error, '没能改成功，请重试。'), variant: 'destructive' })
      return false
    }
  }
  const getValueRows = useStableCallback(() => schemaProjection.rows)
  const setSortDirection = useStableCallback((sortKey: string, direction: 'asc' | 'desc' | null) => {
    if (direction) setSort(sortKey, direction)
    else setSort(null, 'asc')
  })
  const requestDialog = useStableCallback((kind: StructuredColumnDialogKind, predicate: string) => {
    // Let the menu finish closing before the dialog takes focus.
    window.setTimeout(() => setOpenDialog({ kind, predicate }), 0)
  })
  const closeDialog = useCallback(() => setOpenDialog(null), [])

  // Changes only when what the menu shows changes (filters, names); see useStableCallback.
  const columnMenu = useMemo<StructuredColumnMenuInput>(() => ({
    labels: columnView.labels,
    filters: columnView.filters,
    getValueRows,
    onFilterChange: applyFilter,
    onHide: hideColumn,
    onOpenDialog: requestDialog,
    onSortDirection: setSortDirection,
    canChangeType,
  }), [applyFilter, canChangeType, columnView.filters, columnView.labels, getValueRows, hideColumn, requestDialog, setSortDirection])

  const dialog = useMemo<StructuredColumnDialogModel | null>(() => {
    if (!openDialog) return null
    const { kind, predicate } = openDialog
    const observed = schemaProjection.rows.flatMap((row) => row.cells.find((cell) => cell.predicate === predicate)?.values ?? [])
    const typeLabel = predicate === STRUCTURED_SUBJECT_FILTER_KEY
      ? 'text'
      : projectStructuredPredicateTypeLabel(definitionOf(predicate), observed)
    return {
      kind,
      predicate,
      label: labelOf(predicate),
      originalLabel: predicate === STRUCTURED_SUBJECT_FILTER_KEY ? '名称' : predicateLabel(predicate),
      filter: columnView.filters.find((filter) => filter.predicate === predicate),
      typeLabel,
      valueKind: classifyStructuredColumnValueKind(typeLabel),
    }
  }, [columnView.filters, definitionOf, labelOf, openDialog, predicateLabel, schemaProjection.rows])

  const chips = useMemo(
    () => projectStructuredColumnFilterChips(columnView.filters, labelOf, valueKindOf),
    [columnView.filters, labelOf, valueKindOf],
  )
  const toolbarFilterColumns = useMemo(() => projectStructuredColumnFilterColumns({
    filters: columnView.filters,
    hiddenPredicates: effectiveHiddenPredicates,
    labelOf,
    predicates: schemaPredicateControls,
    rows: schemaProjection.rows,
    vocabDefinitionIndex,
    enumOptionsOf: (predicate) => (
      vocabDefinitionIndex.enumOptionsByPredicate.get(predicate)
      ?? vocabDefinitionIndex.enumOptionsByPredicate.get(localPredicateLabel(predicate))
      ?? []
    ).map((option) => option.label ?? '').filter(Boolean),
  }), [columnView.filters, effectiveHiddenPredicates, labelOf, schemaPredicateControls, schemaProjection.rows, vocabDefinitionIndex])

  return {
    chips,
    clearColumnFilters,
    columnDialog: {
      model: dialog,
      onChangeType: changeType,
      onClose: closeDialog,
      onFilterChange: applyFilter,
      onRemove: removeColumn,
      onRename: setColumnLabel,
    },
    columnMenu,
    effectiveHiddenPredicates,
    labelOf,
    removeColumnFilter,
    removedPredicates: removed,
    toolbarFilterMenu: {
      columns: toolbarFilterColumns,
      onChange: applyFilter,
      onOpenDialog: (predicate: string) => requestDialog('filter', predicate),
    },
  }
}
