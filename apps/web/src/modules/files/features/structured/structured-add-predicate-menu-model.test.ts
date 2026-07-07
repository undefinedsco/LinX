import { describe, expect, it } from 'vitest'

import {
  createAddPredicateMenuState,
  createAddPredicateMenuDraft,
  planAddPredicateMenuSubmitted,
  projectAddPredicateMenuCreateOpened,
  projectAddPredicateMenuDefinitionDetailsToggled,
  projectAddPredicateMenuPredicateSearchPatch,
  projectAddPredicateMenuStateDraftPatch,
  projectAddPredicateMenuStateReset,
} from './structured-add-predicate-menu-model'
import * as addPredicateMenuModel from './structured-add-predicate-menu-model'

type DraftPatchProjector = NonNullable<(
  typeof addPredicateMenuModel & {
    projectAddPredicateMenuDraftPatch?: typeof projectAddPredicateMenuDraftPatchSignature
  }
)['projectAddPredicateMenuDraftPatch']>

type ClassScopeProjector = NonNullable<(
  typeof addPredicateMenuModel & {
    projectAddPredicateMenuDraftClassScope?: typeof projectAddPredicateMenuDraftClassScopeSignature
  }
)['projectAddPredicateMenuDraftClassScope']>

type ToggleProjector = NonNullable<(
  typeof addPredicateMenuModel & {
    projectAddPredicateMenuDefinitionDetailsOpenToggle?: (current: boolean) => boolean
  }
)['projectAddPredicateMenuDefinitionDetailsOpenToggle']>

function projectAddPredicateMenuDraftPatchSignature(
  input: {
    currentDraft: ReturnType<typeof createAddPredicateMenuDraft>
    patch: Partial<ReturnType<typeof createAddPredicateMenuDraft>>
  },
) {
  return input.currentDraft
}

function projectAddPredicateMenuDraftClassScopeSignature(
  input: {
    classScope?: string | null
    currentDraft: ReturnType<typeof createAddPredicateMenuDraft>
  },
) {
  return input.currentDraft
}

describe('structured add predicate menu model', () => {
  it('projects add predicate menu state transitions without split React state', () => {
    const initial = createAddPredicateMenuState('udfs:Card')

    expect(initial).toMatchObject({
      createOpen: false,
      definitionDetailsOpen: false,
      predicateSearch: '',
      draft: {
        classScope: 'udfs:Card',
        localName: '',
        type: 'text',
      },
    })

    const searched = projectAddPredicateMenuPredicateSearchPatch({
      current: initial,
      predicateSearch: '<udfs:reviewStatus>',
    })
    expect(searched.predicateSearch).toBe('<udfs:reviewStatus>')

    const opened = projectAddPredicateMenuCreateOpened(searched)
    expect(opened).toMatchObject({
      createOpen: true,
      predicateSearch: '<udfs:reviewStatus>',
      draft: {
        namespace: 'udfs',
        localName: 'reviewStatus',
        label: 'ReviewStatus',
      },
    })

    const enumDraft = projectAddPredicateMenuStateDraftPatch({
      current: opened,
      patch: {
        enumOptions: 'Ready, Blocked',
        type: 'enum',
      },
    })
    expect(enumDraft.draft).toMatchObject({
      enumOptions: 'Ready, Blocked',
      type: 'enum',
    })

    const detailsOpen = projectAddPredicateMenuDefinitionDetailsToggled(enumDraft)
    expect(detailsOpen.definitionDetailsOpen).toBe(true)

    const submitted = planAddPredicateMenuSubmitted({
      classScope: 'udfs:Card',
      current: detailsOpen,
    })
    expect(submitted).toMatchObject({
      createOpen: false,
      definitionDetailsOpen: false,
      predicateSearch: '<udfs:reviewStatus>',
      draft: {
        classScope: 'udfs:Card',
        localName: '',
        type: 'text',
      },
    })

    expect(projectAddPredicateMenuStateReset({
      classScope: null,
      current: submitted,
    })).toMatchObject({
      createOpen: false,
      definitionDetailsOpen: false,
      predicateSearch: '',
      draft: {
        classScope: '',
      },
    })
  })

  it('projects draft patches without React state access', () => {
    const projectAddPredicateMenuDraftPatch = (
      addPredicateMenuModel as typeof addPredicateMenuModel & {
        projectAddPredicateMenuDraftPatch?: DraftPatchProjector
      }
    ).projectAddPredicateMenuDraftPatch

    expect(projectAddPredicateMenuDraftPatch).toBeTypeOf('function')
    if (!projectAddPredicateMenuDraftPatch) return

    const draft = createAddPredicateMenuDraft('udfs:Card')
    expect(projectAddPredicateMenuDraftPatch({
      currentDraft: draft,
      patch: {
        enumOptions: 'Ready, Blocked',
        type: 'enum',
      },
    })).toEqual({
      ...draft,
      enumOptions: 'Ready, Blocked',
      type: 'enum',
    })
  })

  it('hydrates class scope only before the user customizes the draft', () => {
    const projectAddPredicateMenuDraftClassScope = (
      addPredicateMenuModel as typeof addPredicateMenuModel & {
        projectAddPredicateMenuDraftClassScope?: ClassScopeProjector
      }
    ).projectAddPredicateMenuDraftClassScope

    expect(projectAddPredicateMenuDraftClassScope).toBeTypeOf('function')
    if (!projectAddPredicateMenuDraftClassScope) return

    const emptyDraft = createAddPredicateMenuDraft(null)
    expect(projectAddPredicateMenuDraftClassScope({
      classScope: 'udfs:Card',
      currentDraft: emptyDraft,
    })).toEqual({
      ...emptyDraft,
      classScope: 'udfs:Card',
    })

    const customizedDraft = createAddPredicateMenuDraft('udfs:Note')
    expect(projectAddPredicateMenuDraftClassScope({
      classScope: 'udfs:Task',
      currentDraft: customizedDraft,
    })).toBe(customizedDraft)
    expect(projectAddPredicateMenuDraftClassScope({
      classScope: null,
      currentDraft: emptyDraft,
    })).toBe(emptyDraft)
  })

  it('projects definition detail open-state toggles', () => {
    const projectAddPredicateMenuDefinitionDetailsOpenToggle = (
      addPredicateMenuModel as typeof addPredicateMenuModel & {
        projectAddPredicateMenuDefinitionDetailsOpenToggle?: ToggleProjector
      }
    ).projectAddPredicateMenuDefinitionDetailsOpenToggle

    expect(projectAddPredicateMenuDefinitionDetailsOpenToggle).toBeTypeOf('function')
    if (!projectAddPredicateMenuDefinitionDetailsOpenToggle) return

    expect(projectAddPredicateMenuDefinitionDetailsOpenToggle(false)).toBe(true)
    expect(projectAddPredicateMenuDefinitionDetailsOpenToggle(true)).toBe(false)
  })
})
