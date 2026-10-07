import { describe, expect, it } from 'vitest'

import type { StructuredWhiteboardVisualRelation } from '../../domain/structured/structured-projections'
import {
  createStructuredWhiteboardRelationEditorState,
  projectStructuredWhiteboardInitialRelationDraft,
  projectStructuredWhiteboardRelationEditorChrome,
  projectStructuredWhiteboardRelationDraftAfterFromChange,
  projectStructuredWhiteboardRelationEditorCancel,
  projectStructuredWhiteboardRelationEditorForRelation,
  projectStructuredWhiteboardRelationEditorFromPatch,
  projectStructuredWhiteboardRelationEditorLabelPatch,
  projectStructuredWhiteboardRelationEditorNew,
  projectStructuredWhiteboardRelationEditorRemoved,
  projectStructuredWhiteboardRelationEditorSaved,
  projectStructuredWhiteboardRelationEditorToPatch,
  projectStructuredWhiteboardRelationDraft,
  projectStructuredWhiteboardRelationModel,
  projectStructuredWhiteboardVisualRelationsAfterRemove,
  projectStructuredWhiteboardVisualRelationsAfterSave,
  projectStructuredWhiteboardVisualRelationChips,
} from './structured-whiteboard-relation-model'

const relation: StructuredWhiteboardVisualRelation = {
  id: 'visual-a-b',
  from: '#a',
  to: '#b',
  label: 'relates',
}

describe('structured-whiteboard-relation-model', () => {
  it('projects relation editor state transitions as a single draft state', () => {
    const initial = createStructuredWhiteboardRelationEditorState()
    expect(initial).toEqual({
      editingRelationId: null,
      relationEditorOpen: false,
      relationFrom: '',
      relationLabel: '',
      relationTo: '',
    })

    const openedNew = projectStructuredWhiteboardRelationEditorNew({
      current: initial,
      relationSubjectOptions: ['#a', '#b', '#c'],
    })
    expect(openedNew).toEqual({
      editingRelationId: null,
      relationEditorOpen: true,
      relationFrom: '#a',
      relationLabel: '',
      relationTo: '#b',
    })

    expect(projectStructuredWhiteboardRelationEditorFromPatch({
      current: openedNew,
      relationSubjectOptions: ['#a', '#b', '#c'],
      relationFrom: '#b',
    })).toMatchObject({
      relationFrom: '#b',
      relationTo: '#a',
    })
    expect(projectStructuredWhiteboardRelationEditorToPatch({
      current: openedNew,
      relationTo: '#c',
    })).toMatchObject({ relationTo: '#c' })
    expect(projectStructuredWhiteboardRelationEditorLabelPatch({
      current: openedNew,
      relationLabel: 'Blocks',
    })).toMatchObject({ relationLabel: 'Blocks' })

    expect(projectStructuredWhiteboardRelationEditorForRelation({
      current: openedNew,
      relation,
    })).toEqual({
      editingRelationId: 'visual-a-b',
      relationEditorOpen: true,
      relationFrom: '#a',
      relationLabel: 'relates',
      relationTo: '#b',
    })

    expect(projectStructuredWhiteboardRelationEditorSaved(openedNew)).toMatchObject({
      editingRelationId: null,
      relationEditorOpen: false,
      relationLabel: '',
      relationFrom: '#a',
      relationTo: '#b',
    })
    expect(projectStructuredWhiteboardRelationEditorCancel(openedNew)).toMatchObject({
      editingRelationId: null,
      relationEditorOpen: false,
    })
    expect(projectStructuredWhiteboardRelationEditorRemoved({
      current: projectStructuredWhiteboardRelationEditorForRelation({ current: openedNew, relation }),
      relationId: relation.id,
    })).toMatchObject({
      editingRelationId: null,
      relationEditorOpen: false,
    })
    expect(projectStructuredWhiteboardRelationEditorRemoved({
      current: projectStructuredWhiteboardRelationEditorForRelation({ current: openedNew, relation }),
      relationId: 'other-relation',
    })).toMatchObject({
      editingRelationId: relation.id,
      relationEditorOpen: true,
    })
  })

  it('projects relation target options and save eligibility from editor draft state', () => {
    expect(projectStructuredWhiteboardRelationModel({
      editingRelationId: null,
      relationSubjectOptions: ['#a', '#b', '#c'],
      relationFrom: '#a',
      relationTo: '#b',
      visualRelations: [],
    })).toMatchObject({
      relationToOptions: ['#b', '#c'],
      canSaveVisualRelation: true,
      hasVisualRelationChips: false,
    })

    expect(projectStructuredWhiteboardRelationModel({
      editingRelationId: null,
      relationSubjectOptions: ['#a', '#b'],
      relationFrom: ' #a ',
      relationTo: '#a',
      visualRelations: [],
    }).canSaveVisualRelation).toBe(false)
  })

  it('projects relation editor chrome outside the renderer', () => {
    expect(projectStructuredWhiteboardRelationEditorChrome({ editingRelationId: null })).toEqual({
      fromFieldLabel: '起点',
      fromFieldAriaLabel: 'Relation from',
      toFieldLabel: '终点',
      toFieldAriaLabel: 'Relation to',
      labelFieldLabel: '标签',
      labelFieldAriaLabel: 'Relation label',
      labelFieldPlaceholder: '视觉关系',
      saveButtonLabel: '创建视觉关系',
      cancelButtonLabel: '取消',
      cancelButtonAriaLabel: '取消视觉关系',
    })

    expect(projectStructuredWhiteboardRelationEditorChrome({ editingRelationId: 'visual-a-b' }).saveButtonLabel)
      .toBe('保存视觉关系')

    expect(projectStructuredWhiteboardRelationModel({
      editingRelationId: 'visual-a-b',
      relationSubjectOptions: ['#a', '#b'],
      relationFrom: '#a',
      relationTo: '#b',
      visualRelations: [relation],
    }).relationEditorChrome.saveButtonLabel).toBe('保存视觉关系')
  })

  it('projects visual relation chips with fallback labels and aria text', () => {
    const relationWithoutLabel: StructuredWhiteboardVisualRelation = {
      id: 'visual-without-label',
      from: '#a',
      to: '#b',
      label: '',
    }

    expect(projectStructuredWhiteboardVisualRelationChips([relation, relationWithoutLabel])).toEqual([
      {
        id: 'visual-a-b',
        label: 'relates',
        editAriaLabel: '编辑视觉关系 relates',
        deleteAriaLabel: '删除视觉关系 relates',
        relation,
      },
      {
        id: 'visual-without-label',
        label: 'visual-without-label',
        editAriaLabel: '编辑视觉关系 visual-without-label',
        deleteAriaLabel: '删除视觉关系 visual-without-label',
        relation: relationWithoutLabel,
      },
    ])
  })

  it('projects normalized relation drafts with generated ids and fallback labels', () => {
    expect(projectStructuredWhiteboardRelationDraft({
      editingRelationId: null,
      relationFrom: ' #a ',
      relationTo: ' #b ',
      relationLabel: ' ',
      visualRelations: [relation],
    })).toEqual({
      id: 'visual-a-b-2',
      from: '#a',
      to: '#b',
      label: '视觉关系',
    })

    expect(projectStructuredWhiteboardRelationDraft({
      editingRelationId: 'visual-a-b',
      relationFrom: '#a',
      relationTo: '#c',
      relationLabel: 'updates',
      visualRelations: [relation],
    })).toEqual({
      id: 'visual-a-b',
      from: '#a',
      to: '#c',
      label: 'updates',
    })

    expect(projectStructuredWhiteboardRelationDraft({
      editingRelationId: null,
      relationFrom: '#a',
      relationTo: '#a',
      relationLabel: 'same',
      visualRelations: [],
    })).toBeNull()
  })

  it('projects relation editor draft defaults and from-change target correction', () => {
    expect(projectStructuredWhiteboardInitialRelationDraft({
      relationSubjectOptions: ['#a', '#b', '#c'],
    })).toEqual({
      from: '#a',
      to: '#b',
      label: '',
    })
    expect(projectStructuredWhiteboardInitialRelationDraft({
      relationSubjectOptions: ['#solo'],
    })).toEqual({
      from: '#solo',
      to: '',
      label: '',
    })
    expect(projectStructuredWhiteboardRelationDraftAfterFromChange({
      currentTo: '#b',
      nextFrom: '#a',
      relationSubjectOptions: ['#a', '#b'],
    })).toEqual({
      from: '#a',
      to: '#b',
    })
    expect(projectStructuredWhiteboardRelationDraftAfterFromChange({
      currentTo: '#b',
      nextFrom: '#b',
      relationSubjectOptions: ['#a', '#b', '#c'],
    })).toEqual({
      from: '#b',
      to: '#a',
    })
  })

  it('projects visual relation lists after create or update saves', () => {
    const created: StructuredWhiteboardVisualRelation = {
      id: 'visual-b-c',
      from: '#b',
      to: '#c',
      label: 'blocks',
    }
    const updated: StructuredWhiteboardVisualRelation = {
      id: 'visual-a-b',
      from: '#a',
      to: '#c',
      label: 'updates',
    }

    expect(projectStructuredWhiteboardVisualRelationsAfterSave({
      editingRelationId: null,
      nextRelation: created,
      visualRelations: [relation],
    })).toEqual([relation, created])
    expect(projectStructuredWhiteboardVisualRelationsAfterSave({
      editingRelationId: 'visual-a-b',
      nextRelation: updated,
      visualRelations: [relation, created],
    })).toEqual([updated, created])
  })

  it('projects visual relation lists after remove', () => {
    const other: StructuredWhiteboardVisualRelation = {
      id: 'visual-b-c',
      from: '#b',
      to: '#c',
      label: 'blocks',
    }

    expect(projectStructuredWhiteboardVisualRelationsAfterRemove({
      relationId: relation.id,
      visualRelations: [relation, other],
    })).toEqual([other])
  })
})
