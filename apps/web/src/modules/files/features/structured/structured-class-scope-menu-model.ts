export type StructuredClassScopeMenuState = {
  classCreateOpen: boolean
  classDefinitionOpen: boolean
  classDraftUri: string
}

export function createStructuredClassScopeMenuState(): StructuredClassScopeMenuState {
  return {
    classCreateOpen: false,
    classDefinitionOpen: false,
    classDraftUri: '',
  }
}

export function projectStructuredClassScopeMenuDraftUri({
  current,
  value,
}: {
  current: StructuredClassScopeMenuState
  value: string
}): StructuredClassScopeMenuState {
  return {
    ...current,
    classDraftUri: value,
  }
}

export function projectStructuredClassScopeMenuCreateOpenToggle(
  current: StructuredClassScopeMenuState,
): StructuredClassScopeMenuState {
  return {
    ...current,
    classCreateOpen: !current.classCreateOpen,
  }
}

export function projectStructuredClassScopeMenuDefinitionOpenToggle(
  current: StructuredClassScopeMenuState,
): StructuredClassScopeMenuState {
  return {
    ...current,
    classDefinitionOpen: !current.classDefinitionOpen,
  }
}

export function projectStructuredClassScopeMenuSubmittedDraft({
  current,
  saved,
}: {
  current: StructuredClassScopeMenuState
  saved: boolean
}): StructuredClassScopeMenuState {
  if (!saved) return current
  return {
    ...current,
    classDraftUri: '',
  }
}
