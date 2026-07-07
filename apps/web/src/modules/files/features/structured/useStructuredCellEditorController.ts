import { useCallback, useState } from 'react'
import {
  createStructuredCellEditorState,
  projectStructuredCellEditorState,
  type StructuredCellEditorActiveCell,
  type StructuredCellEditorActiveRelationCell,
  type StructuredCellEditorActiveTextCell,
} from './structured-cell-edit-workflow-model'

export function useStructuredCellEditorController({
  clearCellPopoverPlacement,
  placeCellPopover,
}: {
  clearCellPopoverPlacement: () => void
  placeCellPopover: (anchor?: HTMLElement | null) => void
}) {
  const [editorState, setEditorState] = useState(createStructuredCellEditorState)
  const {
    activeEnumCell,
    activeRelationCell,
    activeTextCell,
    enumSearch,
  } = editorState

  const resetActiveCellEditor = useCallback(() => {
    setEditorState((current) => projectStructuredCellEditorState(current, { type: 'reset' }))
    clearCellPopoverPlacement()
  }, [clearCellPopoverPlacement])

  const closeActiveCellPopover = useCallback(() => {
    setEditorState((current) => projectStructuredCellEditorState(current, { type: 'close-popover' }))
    clearCellPopoverPlacement()
  }, [clearCellPopoverPlacement])

  const clearActiveTextCell = useCallback(() => {
    setEditorState((current) => projectStructuredCellEditorState(current, { type: 'clear-text' }))
  }, [])

  const clearActiveRelationCell = useCallback(() => {
    setEditorState((current) => projectStructuredCellEditorState(current, { type: 'clear-relation' }))
    clearCellPopoverPlacement()
  }, [clearCellPopoverPlacement])

  const openEnumCell = useCallback((cell: StructuredCellEditorActiveCell, anchor?: HTMLElement | null) => {
    setEditorState((current) => projectStructuredCellEditorState(current, {
      type: 'open-enum',
      cell,
    }))
    placeCellPopover(anchor)
  }, [placeCellPopover])

  const openRelationCell = useCallback((cell: StructuredCellEditorActiveRelationCell, anchor?: HTMLElement | null) => {
    setEditorState((current) => projectStructuredCellEditorState(current, {
      type: 'open-relation',
      cell,
    }))
    placeCellPopover(anchor)
  }, [placeCellPopover])

  const openTextCell = useCallback((cell: StructuredCellEditorActiveTextCell) => {
    setEditorState((current) => projectStructuredCellEditorState(current, {
      type: 'open-text',
      cell,
    }))
    clearCellPopoverPlacement()
  }, [clearCellPopoverPlacement])

  const updateActiveTextCellValue = useCallback((value: string) => {
    setEditorState((current) => projectStructuredCellEditorState(current, {
      type: 'update-text-value',
      value,
    }))
  }, [])

  const updateActiveRelationCellValue = useCallback((value: string) => {
    setEditorState((current) => projectStructuredCellEditorState(current, {
      type: 'update-relation-value',
      value,
    }))
  }, [])

  const updateEnumSearch = useCallback((value: string) => {
    setEditorState((current) => projectStructuredCellEditorState(current, {
      type: 'update-enum-search',
      value,
    }))
  }, [])

  const clearActiveEnumCell = useCallback(() => {
    setEditorState((current) => projectStructuredCellEditorState(current, { type: 'clear-enum' }))
    clearCellPopoverPlacement()
  }, [clearCellPopoverPlacement])

  const clearActiveEditorForCell = useCallback((subject: string, predicate: string) => {
    setEditorState((current) => projectStructuredCellEditorState(current, {
      type: 'clear-target',
      target: { subject, predicate },
    }))
    clearCellPopoverPlacement()
  }, [clearCellPopoverPlacement])

  return {
    activeEnumCell,
    activeRelationCell,
    activeTextCell,
    clearActiveEditorForCell,
    clearActiveEnumCell,
    clearActiveRelationCell,
    clearActiveTextCell,
    closeActiveCellPopover,
    enumSearch,
    openEnumCell,
    openRelationCell,
    openTextCell,
    resetActiveCellEditor,
    updateEnumSearch,
    updateActiveRelationCellValue,
    updateActiveTextCellValue,
  }
}
