import { useCallback, useMemo, useState } from 'react'

import type { StructuredWhiteboardVisualRelation } from '../../domain/structured/structured-projections'
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
  relationSubjectOptions,
  visualRelations,
  onVisualRelationsChange,
}: {
  relationSubjectOptions: readonly string[]
  visualRelations: readonly StructuredWhiteboardVisualRelation[]
  onVisualRelationsChange?: (relations: StructuredWhiteboardVisualRelation[]) => void
}) {
  const [relationEditorState, setRelationEditorState] = useState(createStructuredWhiteboardRelationEditorState)
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

  const openRelationEditor = useCallback(() => {
    setRelationEditorState((current) => projectStructuredWhiteboardRelationEditorNew({
      current,
      relationSubjectOptions,
    }))
  }, [relationSubjectOptions])

  const openRelationEditorFor = useCallback((relation: StructuredWhiteboardVisualRelation) => {
    setRelationEditorState((current) => projectStructuredWhiteboardRelationEditorForRelation({
      current,
      relation,
    }))
  }, [])

  const updateRelationFrom = useCallback((nextFrom: string) => {
    setRelationEditorState((current) => projectStructuredWhiteboardRelationEditorFromPatch({
      current,
      relationFrom: nextFrom,
      relationSubjectOptions,
    }))
  }, [relationSubjectOptions])

  const updateRelationTo = useCallback((nextTo: string) => {
    setRelationEditorState((current) => projectStructuredWhiteboardRelationEditorToPatch({
      current,
      relationTo: nextTo,
    }))
  }, [])

  const updateRelationLabel = useCallback((nextLabel: string) => {
    setRelationEditorState((current) => projectStructuredWhiteboardRelationEditorLabelPatch({
      current,
      relationLabel: nextLabel,
    }))
  }, [])

  const cancelRelationEditor = useCallback(() => {
    setRelationEditorState((current) => projectStructuredWhiteboardRelationEditorCancel(current))
  }, [])

  const saveVisualRelation = useCallback(() => {
    const nextRelation = projectStructuredWhiteboardRelationDraft({
      editingRelationId,
      relationFrom,
      relationLabel,
      relationTo,
      visualRelations,
    })
    if (!nextRelation) return
    onVisualRelationsChange?.(projectStructuredWhiteboardVisualRelationsAfterSave({
      editingRelationId,
      nextRelation,
      visualRelations,
    }))
    setRelationEditorState((current) => projectStructuredWhiteboardRelationEditorSaved(current))
  }, [editingRelationId, onVisualRelationsChange, relationFrom, relationLabel, relationTo, visualRelations])

  const removeVisualRelation = useCallback((relationId: string) => {
    onVisualRelationsChange?.(projectStructuredWhiteboardVisualRelationsAfterRemove({
      relationId,
      visualRelations,
    }))
    setRelationEditorState((current) => projectStructuredWhiteboardRelationEditorRemoved({
      current,
      relationId,
    }))
  }, [onVisualRelationsChange, visualRelations])

  return {
    cancelRelationEditor,
    canSaveVisualRelation,
    editingRelationId,
    openRelationEditor,
    openRelationEditorFor,
    relationEditorOpen,
    relationEditorChrome,
    relationFrom,
    relationLabel,
    relationTo,
    relationToOptions,
    removeVisualRelation,
    saveVisualRelation,
    updateRelationFrom,
    updateRelationLabel,
    updateRelationTo,
    visualRelationChips,
    hasVisualRelationChips,
  }
}
