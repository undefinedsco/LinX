import { useCallback, useMemo, useRef, useState } from 'react'

import type { StructuredWhiteboardVisualRelation } from '../../domain/structured/structured-projections'
import {
  createStructuredCellWriteProposal,
  type StructuredCellWriteProposal,
  type StructuredTableProjection,
} from '../../domain/structured/structured-table'
import {
  createStructuredWhiteboardRelationEditorState,
  projectStructuredWhiteboardRelationDraft,
  projectStructuredWhiteboardRelationEditorCancel,
  projectStructuredWhiteboardRelationEditorForRelation,
  projectStructuredWhiteboardRelationEditorFromPatch,
  projectStructuredWhiteboardRelationEditorLabelPatch,
  projectStructuredWhiteboardRelationEditorNew,
  projectStructuredWhiteboardRelationEditorRemoved,
  projectStructuredWhiteboardRelationEditorSaved,
  projectStructuredWhiteboardRelationEditorToPatch,
  projectStructuredWhiteboardRelationModel,
  projectStructuredWhiteboardVisualRelationsAfterRemove,
  projectStructuredWhiteboardVisualRelationsAfterSave,
} from './structured-whiteboard-relation-model'

export function useStructuredWhiteboardRelationController({
  documentUri,
  projection,
  relationPredicateOptions = [],
  relationSubjectOptions,
  visualRelations,
  onCommitCellWriteProposal,
  onVisualRelationsChange,
}: {
  documentUri?: string
  projection?: StructuredTableProjection
  relationPredicateOptions?: readonly string[]
  relationSubjectOptions: readonly string[]
  visualRelations: readonly StructuredWhiteboardVisualRelation[]
  onCommitCellWriteProposal?: (proposal: StructuredCellWriteProposal) => boolean | Promise<boolean>
  onVisualRelationsChange?: (relations: StructuredWhiteboardVisualRelation[]) => void
}) {
  const [relationEditorState, setRelationEditorState] = useState(createStructuredWhiteboardRelationEditorState)
  const relationEditorStateRef = useRef(relationEditorState)
  const visualRelationsRef = useRef<readonly StructuredWhiteboardVisualRelation[]>(visualRelations)
  visualRelationsRef.current = visualRelations
  const updateRelationEditorState = useCallback((project: (current: typeof relationEditorState) => typeof relationEditorState) => {
    setRelationEditorState((current) => {
      const next = project(current)
      relationEditorStateRef.current = next
      return next
    })
  }, [])
  const [relationPredicate, setRelationPredicate] = useState('')
  const [relationSaving, setRelationSaving] = useState(false)
  const [relationSaveError, setRelationSaveError] = useState<string | null>(null)
  const publishVisualRelations = useCallback((relations: StructuredWhiteboardVisualRelation[]) => {
    visualRelationsRef.current = relations
    onVisualRelationsChange?.(relations)
  }, [onVisualRelationsChange])
  const {
    editingRelationId,
    relationEditorOpen,
    relationFrom,
    relationLabel,
    relationTo,
  } = relationEditorState
  const {
    canSaveVisualRelation,
    hasVisualRelationChips,
    relationEditorChrome,
    relationToOptions,
    visualRelationChips,
  } = useMemo(() => projectStructuredWhiteboardRelationModel({
    editingRelationId,
    relationFrom,
    relationSubjectOptions,
    relationTo,
    visualRelations,
  }), [editingRelationId, relationFrom, relationSubjectOptions, relationTo, visualRelations])
  const canSaveRelation = canSaveVisualRelation
    && !relationSaving
    && (!relationPredicate || Boolean(documentUri && projection && onCommitCellWriteProposal))

  const openRelationEditor = useCallback(() => {
    setRelationSaveError(null)
    setRelationPredicate('')
    updateRelationEditorState((current) => projectStructuredWhiteboardRelationEditorNew({
      current,
      relationSubjectOptions,
    }))
  }, [relationSubjectOptions, updateRelationEditorState])

  const openRelationEditorBetween = useCallback((relationFrom: string, relationTo: string) => {
    setRelationSaveError(null)
    setRelationPredicate('')
    updateRelationEditorState((current) => {
      const opened = projectStructuredWhiteboardRelationEditorNew({
        current,
        relationSubjectOptions,
      })
      const withSource = projectStructuredWhiteboardRelationEditorFromPatch({
        current: opened,
        relationFrom,
        relationSubjectOptions,
      })
      return projectStructuredWhiteboardRelationEditorToPatch({
        current: withSource,
        relationTo,
      })
    })
  }, [relationSubjectOptions, updateRelationEditorState])

  const openRelationEditorFor = useCallback((relation: StructuredWhiteboardVisualRelation) => {
    updateRelationEditorState((current) => projectStructuredWhiteboardRelationEditorForRelation({
      current,
      relation,
    }))
  }, [updateRelationEditorState])

  const updateRelationFrom = useCallback((nextFrom: string) => {
    updateRelationEditorState((current) => projectStructuredWhiteboardRelationEditorFromPatch({
      current,
      relationFrom: nextFrom,
      relationSubjectOptions,
    }))
  }, [relationSubjectOptions, updateRelationEditorState])

  const updateRelationTo = useCallback((nextTo: string) => {
    updateRelationEditorState((current) => projectStructuredWhiteboardRelationEditorToPatch({
      current,
      relationTo: nextTo,
    }))
  }, [updateRelationEditorState])

  const updateRelationLabel = useCallback((nextLabel: string) => {
    updateRelationEditorState((current) => projectStructuredWhiteboardRelationEditorLabelPatch({
      current,
      relationLabel: nextLabel,
    }))
  }, [updateRelationEditorState])

  const cancelRelationEditor = useCallback(() => {
    setRelationSaveError(null)
    setRelationPredicate('')
    updateRelationEditorState((current) => projectStructuredWhiteboardRelationEditorCancel(current))
  }, [updateRelationEditorState])

  const saveVisualRelation = useCallback(() => {
    const editor = relationEditorStateRef.current
    const stableEditingRelationId = editor.editingRelationId
      ?? visualRelationsRef.current.find((relation) => relation.from === editor.relationFrom && relation.to === editor.relationTo)?.id
      ?? null
    const nextRelation = projectStructuredWhiteboardRelationDraft({
      editingRelationId: stableEditingRelationId,
      relationFrom: editor.relationFrom,
      relationLabel: editor.relationLabel,
      relationTo: editor.relationTo,
      visualRelations: visualRelationsRef.current,
    })
    if (!nextRelation) return
    publishVisualRelations(projectStructuredWhiteboardVisualRelationsAfterSave({
      editingRelationId: stableEditingRelationId,
      nextRelation,
      visualRelations: visualRelationsRef.current,
    }))
    updateRelationEditorState((current) => projectStructuredWhiteboardRelationEditorSaved(current))
  }, [publishVisualRelations, updateRelationEditorState])

  const saveRelation = useCallback(async () => {
    if (!relationPredicate) {
      saveVisualRelation()
      return true
    }
    if (!documentUri || !projection || !onCommitCellWriteProposal || !relationFrom || !relationTo) return false
    const previousValues = projection.rows
      .find((row) => row.subject === relationFrom)
      ?.cells.find((cell) => cell.predicate === relationPredicate)
      ?.values ?? []
    const targetValue = relationTo.startsWith('<') || relationTo.startsWith('_:')
      ? relationTo
      : relationTo.startsWith('#') || /^https?:\/\//.test(relationTo)
        ? `<${relationTo}>`
        : relationTo
    const nextValues = previousValues.includes(targetValue)
      ? [...previousValues]
      : [...previousValues, targetValue]
    const editor = relationEditorStateRef.current
    const previousVisualRelations = [...visualRelationsRef.current]
    const optimisticRelation = projectStructuredWhiteboardRelationDraft({
      editingRelationId: editor.editingRelationId,
      relationFrom,
      relationLabel: editor.relationLabel.trim() || relationPredicate,
      relationTo,
      visualRelations: visualRelationsRef.current,
    })
    if (!optimisticRelation) return false
    publishVisualRelations(projectStructuredWhiteboardVisualRelationsAfterSave({
      editingRelationId: editor.editingRelationId,
      nextRelation: optimisticRelation,
      visualRelations: visualRelationsRef.current,
    }))
    setRelationSaving(true)
    setRelationSaveError(null)
    try {
      const saved = await onCommitCellWriteProposal(createStructuredCellWriteProposal({
        documentUri,
        subject: relationFrom,
        predicate: relationPredicate,
        previousValues: [...previousValues],
        nextValues,
      }))
      if (saved === false) {
        publishVisualRelations(previousVisualRelations)
        setRelationSaveError('关系写入失败，请重试')
        return false
      }
      publishVisualRelations(projectStructuredWhiteboardVisualRelationsAfterRemove({
        relationId: optimisticRelation.id,
        visualRelations: visualRelationsRef.current,
      }))
      updateRelationEditorState((current) => projectStructuredWhiteboardRelationEditorSaved(current))
      setRelationPredicate('')
      return true
    } catch {
      publishVisualRelations(previousVisualRelations)
      setRelationSaveError('关系写入失败，请重试')
      return false
    } finally {
      setRelationSaving(false)
    }
  }, [documentUri, onCommitCellWriteProposal, projection, publishVisualRelations, relationFrom, relationPredicate, relationTo, saveVisualRelation, updateRelationEditorState])

  const removeVisualRelation = useCallback((relationId: string) => {
    publishVisualRelations(projectStructuredWhiteboardVisualRelationsAfterRemove({
      relationId,
      visualRelations: visualRelationsRef.current,
    }))
    updateRelationEditorState((current) => projectStructuredWhiteboardRelationEditorRemoved({
      current,
      relationId,
    }))
  }, [publishVisualRelations, updateRelationEditorState])

  return {
    cancelRelationEditor,
    canSaveRelation,
    canSaveVisualRelation,
    editingRelationId,
    openRelationEditor,
    openRelationEditorBetween,
    openRelationEditorFor,
    relationEditorOpen,
    relationEditorChrome,
    relationFrom,
    relationLabel,
    relationPredicate,
    relationPredicateOptions,
    relationSaving,
    relationSaveError,
    relationTo,
    relationToOptions,
    removeVisualRelation,
    saveVisualRelation,
    saveRelation,
    updateRelationFrom,
    updateRelationLabel,
    updateRelationPredicate: setRelationPredicate,
    updateRelationTo,
    visualRelationChips,
    hasVisualRelationChips,
  }
}
