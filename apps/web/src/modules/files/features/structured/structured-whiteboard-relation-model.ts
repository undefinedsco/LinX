import type { StructuredWhiteboardVisualRelation } from '../../domain/structured/structured-projections'

export type StructuredWhiteboardVisualRelationChip = {
  id: string
  label: string
  editAriaLabel: string
  deleteAriaLabel: string
  relation: StructuredWhiteboardVisualRelation
}

export type StructuredWhiteboardRelationEditorState = {
  relationEditorOpen: boolean
  editingRelationId: string | null
  relationFrom: string
  relationTo: string
  relationLabel: string
}

export type StructuredWhiteboardRelationEditorChrome = {
  fromFieldLabel: string
  fromFieldAriaLabel: string
  toFieldLabel: string
  toFieldAriaLabel: string
  labelFieldLabel: string
  labelFieldAriaLabel: string
  labelFieldPlaceholder: string
  saveButtonLabel: string
  cancelButtonLabel: string
  cancelButtonAriaLabel: string
}

export function projectStructuredWhiteboardVisualRelationChips(
  visualRelations: readonly StructuredWhiteboardVisualRelation[],
): StructuredWhiteboardVisualRelationChip[] {
  return visualRelations.map((relation) => {
    const label = relation.label || relation.id
    return {
      id: relation.id,
      label,
      editAriaLabel: `编辑视觉关系 ${label}`,
      deleteAriaLabel: `删除视觉关系 ${label}`,
      relation,
    }
  })
}

export function projectStructuredWhiteboardInitialRelationDraft({
  relationSubjectOptions,
}: {
  relationSubjectOptions: readonly string[]
}) {
  const from = relationSubjectOptions[0] ?? ''
  return {
    from,
    to: relationSubjectOptions.find((subject) => subject !== from) ?? '',
    label: '',
  }
}

export function projectStructuredWhiteboardRelationDraftAfterFromChange({
  currentTo,
  nextFrom,
  relationSubjectOptions,
}: {
  currentTo: string
  nextFrom: string
  relationSubjectOptions: readonly string[]
}) {
  return {
    from: nextFrom,
    to: currentTo === nextFrom
      ? relationSubjectOptions.find((subject) => subject !== nextFrom) ?? ''
      : currentTo,
  }
}

export function createStructuredWhiteboardRelationEditorState(): StructuredWhiteboardRelationEditorState {
  return {
    relationEditorOpen: false,
    editingRelationId: null,
    relationFrom: '',
    relationTo: '',
    relationLabel: '',
  }
}

export function projectStructuredWhiteboardRelationEditorNew({
  current,
  relationSubjectOptions,
}: {
  current: StructuredWhiteboardRelationEditorState
  relationSubjectOptions: readonly string[]
}): StructuredWhiteboardRelationEditorState {
  const draft = projectStructuredWhiteboardInitialRelationDraft({ relationSubjectOptions })
  return {
    ...current,
    relationEditorOpen: true,
    editingRelationId: null,
    relationFrom: draft.from,
    relationTo: draft.to,
    relationLabel: draft.label,
  }
}

export function projectStructuredWhiteboardRelationEditorForRelation({
  current,
  relation,
}: {
  current: StructuredWhiteboardRelationEditorState
  relation: StructuredWhiteboardVisualRelation
}): StructuredWhiteboardRelationEditorState {
  return {
    ...current,
    relationEditorOpen: true,
    editingRelationId: relation.id,
    relationFrom: relation.from,
    relationTo: relation.to,
    relationLabel: relation.label,
  }
}

export function projectStructuredWhiteboardRelationEditorFromPatch({
  current,
  relationFrom,
  relationSubjectOptions,
}: {
  current: StructuredWhiteboardRelationEditorState
  relationFrom: string
  relationSubjectOptions: readonly string[]
}): StructuredWhiteboardRelationEditorState {
  const draft = projectStructuredWhiteboardRelationDraftAfterFromChange({
    currentTo: current.relationTo,
    nextFrom: relationFrom,
    relationSubjectOptions,
  })
  return {
    ...current,
    relationFrom: draft.from,
    relationTo: draft.to,
  }
}

export function projectStructuredWhiteboardRelationEditorToPatch({
  current,
  relationTo,
}: {
  current: StructuredWhiteboardRelationEditorState
  relationTo: string
}): StructuredWhiteboardRelationEditorState {
  return {
    ...current,
    relationTo,
  }
}

export function projectStructuredWhiteboardRelationEditorLabelPatch({
  current,
  relationLabel,
}: {
  current: StructuredWhiteboardRelationEditorState
  relationLabel: string
}): StructuredWhiteboardRelationEditorState {
  return {
    ...current,
    relationLabel,
  }
}

export function projectStructuredWhiteboardRelationEditorCancel(
  current: StructuredWhiteboardRelationEditorState,
): StructuredWhiteboardRelationEditorState {
  return {
    ...current,
    relationEditorOpen: false,
    editingRelationId: null,
  }
}

export function projectStructuredWhiteboardRelationEditorSaved(
  current: StructuredWhiteboardRelationEditorState,
): StructuredWhiteboardRelationEditorState {
  return {
    ...current,
    relationEditorOpen: false,
    editingRelationId: null,
    relationLabel: '',
  }
}

export function projectStructuredWhiteboardRelationEditorRemoved({
  current,
  relationId,
}: {
  current: StructuredWhiteboardRelationEditorState
  relationId: string
}): StructuredWhiteboardRelationEditorState {
  if (current.editingRelationId !== relationId) return current
  return projectStructuredWhiteboardRelationEditorCancel(current)
}

function nextVisualRelationId(from: string, to: string, relations: readonly StructuredWhiteboardVisualRelation[]) {
  const base = `visual-${from.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}-${to.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}` || 'visual-relation'
  if (!relations.some((relation) => relation.id === base)) return base
  let index = 2
  while (relations.some((relation) => relation.id === `${base}-${index}`)) index += 1
  return `${base}-${index}`
}

export function projectStructuredWhiteboardRelationDraft({
  editingRelationId,
  relationFrom,
  relationLabel,
  relationTo,
  visualRelations,
}: {
  editingRelationId: string | null
  relationFrom: string
  relationTo: string
  relationLabel: string
  visualRelations: readonly StructuredWhiteboardVisualRelation[]
}): StructuredWhiteboardVisualRelation | null {
  const from = relationFrom.trim()
  const to = relationTo.trim()
  if (!from || !to || from === to) return null
  return {
    id: editingRelationId ?? nextVisualRelationId(from, to, visualRelations),
    from,
    to,
    label: relationLabel.trim() || '视觉关系',
  }
}

export function projectStructuredWhiteboardVisualRelationsAfterSave({
  editingRelationId,
  nextRelation,
  visualRelations,
}: {
  editingRelationId: string | null
  nextRelation: StructuredWhiteboardVisualRelation
  visualRelations: readonly StructuredWhiteboardVisualRelation[]
}) {
  return editingRelationId
    ? visualRelations.map((relation) => (relation.id === editingRelationId ? nextRelation : relation))
    : [...visualRelations, nextRelation]
}

export function projectStructuredWhiteboardVisualRelationsAfterRemove({
  relationId,
  visualRelations,
}: {
  relationId: string
  visualRelations: readonly StructuredWhiteboardVisualRelation[]
}) {
  return visualRelations.filter((relation) => relation.id !== relationId)
}

export function projectStructuredWhiteboardRelationEditorChrome({
  editingRelationId,
}: {
  editingRelationId: string | null
}): StructuredWhiteboardRelationEditorChrome {
  return {
    fromFieldLabel: '起点',
    fromFieldAriaLabel: 'Relation from',
    toFieldLabel: '终点',
    toFieldAriaLabel: 'Relation to',
    labelFieldLabel: '标签',
    labelFieldAriaLabel: 'Relation label',
    labelFieldPlaceholder: '视觉关系',
    saveButtonLabel: editingRelationId ? '保存视觉关系' : '创建视觉关系',
    cancelButtonLabel: '取消',
    cancelButtonAriaLabel: '取消视觉关系',
  }
}

export function projectStructuredWhiteboardRelationModel({
  editingRelationId,
  relationFrom,
  relationSubjectOptions,
  relationTo,
  visualRelations,
}: {
  editingRelationId: string | null
  relationSubjectOptions: readonly string[]
  relationFrom: string
  relationTo: string
  visualRelations: readonly StructuredWhiteboardVisualRelation[]
}) {
  const visualRelationChips = projectStructuredWhiteboardVisualRelationChips(visualRelations)

  return {
    relationToOptions: relationSubjectOptions.filter((subject) => subject !== relationFrom),
    relationEditorChrome: projectStructuredWhiteboardRelationEditorChrome({ editingRelationId }),
    visualRelationChips,
    hasVisualRelationChips: visualRelationChips.length > 0,
    canSaveVisualRelation: Boolean(projectStructuredWhiteboardRelationDraft({
      editingRelationId: null,
      relationFrom,
      relationLabel: '',
      relationTo,
      visualRelations,
    })),
  }
}
