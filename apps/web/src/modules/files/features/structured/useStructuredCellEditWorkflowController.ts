import { useCallback, useEffect, type KeyboardEvent } from 'react'

import type { StructuredVocabPredicateDefinition } from '../../domain/structured/structured-table'
import {
  planStructuredCellActivation,
  planStructuredCellActivationEffect,
  planStructuredCellKeyDownAction,
  planStructuredCellOutsidePointerAction,
  planStructuredRelationCellCommit,
  planStructuredTextCellCommit,
} from './structured-cell-edit-workflow-model'
import {
  type StructuredProjectionTableRow,
} from './structured-projection-table-model'
import { useStructuredCellEditorController } from './useStructuredCellEditorController'
import { useStructuredCellPopoverController } from './useStructuredCellPopoverController'

type StageCellValueChange = (input: {
  subject: string
  predicate: string
  nextValues: string[]
}) => void

type DiscardCellWriteDraft = (subject: string, predicate: string) => void

const noopDiscardCellWriteDraft: DiscardCellWriteDraft = () => {}

export function useStructuredCellEditWorkflowController({
  documentUri,
  discardCellWriteDraft = noopDiscardCellWriteDraft,
  editable,
  getPredicateDefinition,
  stageCellValueChange,
}: {
  documentUri: string
  discardCellWriteDraft?: DiscardCellWriteDraft
  editable: boolean
  getPredicateDefinition: (predicate: string) => StructuredVocabPredicateDefinition | undefined
  stageCellValueChange: StageCellValueChange
}) {
  const {
    activeCellPopoverPlacement,
    clearCellPopoverPlacement,
    placeCellPopover,
  } = useStructuredCellPopoverController()
  const {
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
  } = useStructuredCellEditorController({
    clearCellPopoverPlacement,
    placeCellPopover,
  })

  useEffect(() => {
    resetActiveCellEditor()
  }, [documentUri, resetActiveCellEditor])

  const startCellEdit = useCallback((row: StructuredProjectionTableRow, predicate: string, anchor?: HTMLElement | null) => {
    const plan = planStructuredCellActivation({
      definition: getPredicateDefinition(predicate),
      editable,
      predicate,
      row,
    })
    const effect = planStructuredCellActivationEffect(plan)
    if (effect.kind === 'open-enum') {
      openEnumCell(effect.cell, anchor)
      return
    }
    if (effect.kind === 'stage-cell-write') {
      if (effect.clearPopover) clearCellPopoverPlacement()
      stageCellValueChange({
        subject: effect.subject,
        predicate: effect.predicate,
        nextValues: effect.nextValues,
      })
      return
    }
    if (effect.kind === 'open-relation') {
      openRelationCell(effect.cell, anchor)
      return
    }
    if (effect.kind === 'open-text') {
      openTextCell(effect.cell)
    }
  }, [
    clearCellPopoverPlacement,
    editable,
    getPredicateDefinition,
    openEnumCell,
    openRelationCell,
    openTextCell,
    stageCellValueChange,
  ])

  const commitTextCell = useCallback((nextValue?: string) => {
    const plan = planStructuredTextCellCommit({
      activeCell: activeTextCell,
      nextValue,
    })
    if (plan.kind === 'none') return
    stageCellValueChange({
      subject: plan.subject,
      predicate: plan.predicate,
      nextValues: plan.nextValues,
    })
    clearActiveTextCell()
  }, [activeTextCell, clearActiveTextCell, stageCellValueChange])

  const commitRelationCell = useCallback((nextValue?: string) => {
    const plan = planStructuredRelationCellCommit({
      activeCell: activeRelationCell,
      nextValue,
    })
    if (plan.kind === 'none') return
    stageCellValueChange({
      subject: plan.subject,
      predicate: plan.predicate,
      nextValues: plan.nextValues,
    })
    clearActiveRelationCell()
  }, [activeRelationCell, clearActiveRelationCell, stageCellValueChange])

  const discardCellDraft = useCallback((subject: string, predicate: string) => {
    discardCellWriteDraft(subject, predicate)
    clearActiveEditorForCell(subject, predicate)
  }, [clearActiveEditorForCell, discardCellWriteDraft])

  const handleCellKeyDown = useCallback((
    event: KeyboardEvent<HTMLElement>,
    row: StructuredProjectionTableRow,
    predicate: string,
  ) => {
    const action = planStructuredCellKeyDownAction({
      key: event.key,
      rowSubject: row.subject,
      predicate,
      targetValue: (event.target as HTMLInputElement).value,
      activeTextCell,
    })
    if (action.preventDefault) event.preventDefault()
    if (action.kind === 'commit-text') {
      commitTextCell(action.nextValue)
      return
    }
    if (action.kind === 'discard-draft') {
      discardCellDraft(row.subject, predicate)
      return
    }
    if (action.kind === 'start-edit') {
      startCellEdit(row, predicate, event.currentTarget)
    }
  }, [activeTextCell, commitTextCell, discardCellDraft, startCellEdit])

  useEffect(() => {
    if (!activeEnumCell && !activeRelationCell) return
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const action = planStructuredCellOutsidePointerAction({
        hasActiveEnumCell: !!activeEnumCell,
        activeRelationValue: activeRelationCell?.value ?? null,
        targetInsideInteractiveLayer: !!target.closest('[data-structured-cell-popover="true"], [role="menu"]'),
      })
      if (action.kind === 'commit-relation') {
        commitRelationCell(action.nextValue)
        return
      }
      if (action.kind === 'close-popover') closeActiveCellPopover()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [activeEnumCell, activeRelationCell, closeActiveCellPopover, commitRelationCell])

  return {
    activeCellPopoverPlacement,
    activeEnumCell,
    activeRelationCell,
    activeTextCell,
    clearActiveEditorForCell,
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
  }
}
