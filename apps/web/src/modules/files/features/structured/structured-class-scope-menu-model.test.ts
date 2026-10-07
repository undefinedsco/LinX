import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type StructuredClassScopeMenuState = {
  classCreateOpen: boolean
  classDefinitionOpen: boolean
  classDraftUri: string
}

type StateProjector = (state: StructuredClassScopeMenuState) => StructuredClassScopeMenuState
const modelPath = 'src/modules/files/features/structured/structured-class-scope-menu-model.ts'

describe('structured class scope menu model', () => {
  it('projects class scope menu reset, draft, toggle, and submit state transitions', async () => {
    expect(existsSync(modelPath)).toBe(true)
    if (!existsSync(modelPath)) return

    const classScopeMenuModel = await import('./structured-class-scope-menu-model')
    const createStructuredClassScopeMenuState = (
      classScopeMenuModel as typeof classScopeMenuModel & {
        createStructuredClassScopeMenuState?: () => StructuredClassScopeMenuState
      }
    ).createStructuredClassScopeMenuState
    const projectStructuredClassScopeMenuDraftUri = (
      classScopeMenuModel as typeof classScopeMenuModel & {
        projectStructuredClassScopeMenuDraftUri?: (input: {
          current: StructuredClassScopeMenuState
          value: string
        }) => StructuredClassScopeMenuState
      }
    ).projectStructuredClassScopeMenuDraftUri
    const projectStructuredClassScopeMenuCreateOpenToggle = (
      classScopeMenuModel as typeof classScopeMenuModel & {
        projectStructuredClassScopeMenuCreateOpenToggle?: StateProjector
      }
    ).projectStructuredClassScopeMenuCreateOpenToggle
    const projectStructuredClassScopeMenuDefinitionOpenToggle = (
      classScopeMenuModel as typeof classScopeMenuModel & {
        projectStructuredClassScopeMenuDefinitionOpenToggle?: StateProjector
      }
    ).projectStructuredClassScopeMenuDefinitionOpenToggle
    const projectStructuredClassScopeMenuSubmittedDraft = (
      classScopeMenuModel as typeof classScopeMenuModel & {
        projectStructuredClassScopeMenuSubmittedDraft?: (input: {
          current: StructuredClassScopeMenuState
          saved: boolean
        }) => StructuredClassScopeMenuState
      }
    ).projectStructuredClassScopeMenuSubmittedDraft

    expect(createStructuredClassScopeMenuState).toBeTypeOf('function')
    expect(projectStructuredClassScopeMenuDraftUri).toBeTypeOf('function')
    expect(projectStructuredClassScopeMenuCreateOpenToggle).toBeTypeOf('function')
    expect(projectStructuredClassScopeMenuDefinitionOpenToggle).toBeTypeOf('function')
    expect(projectStructuredClassScopeMenuSubmittedDraft).toBeTypeOf('function')
    if (
      !createStructuredClassScopeMenuState
      || !projectStructuredClassScopeMenuDraftUri
      || !projectStructuredClassScopeMenuCreateOpenToggle
      || !projectStructuredClassScopeMenuDefinitionOpenToggle
      || !projectStructuredClassScopeMenuSubmittedDraft
    ) return

    const initial = createStructuredClassScopeMenuState()
    expect(initial).toEqual({
      classCreateOpen: false,
      classDefinitionOpen: false,
      classDraftUri: '',
    })

    const withDraft = projectStructuredClassScopeMenuDraftUri({
      current: initial,
      value: 'udfs:Note',
    })
    expect(withDraft).toEqual({
      classCreateOpen: false,
      classDefinitionOpen: false,
      classDraftUri: 'udfs:Note',
    })

    const createOpen = projectStructuredClassScopeMenuCreateOpenToggle(withDraft)
    expect(createOpen).toEqual({
      classCreateOpen: true,
      classDefinitionOpen: false,
      classDraftUri: 'udfs:Note',
    })

    const definitionOpen = projectStructuredClassScopeMenuDefinitionOpenToggle(createOpen)
    expect(definitionOpen).toEqual({
      classCreateOpen: true,
      classDefinitionOpen: true,
      classDraftUri: 'udfs:Note',
    })

    expect(projectStructuredClassScopeMenuSubmittedDraft({
      current: definitionOpen,
      saved: true,
    })).toEqual({
      classCreateOpen: true,
      classDefinitionOpen: true,
      classDraftUri: '',
    })
    expect(projectStructuredClassScopeMenuSubmittedDraft({
      current: definitionOpen,
      saved: false,
    })).toBe(definitionOpen)
  })
})
