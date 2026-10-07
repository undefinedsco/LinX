import { useCallback, useEffect, useMemo, useState } from 'react'

import type { StructuredVocabDefinitionIndex } from '../../domain/structured/structured-table'
import {
  type PredicateDefinitionDraft,
} from '../../domain/structured/structured-predicate-draft'
import {
  canSubmitAddPredicateMenuDraft,
  createAddPredicateMenuState,
  planAddPredicateMenuSubmitted,
  projectAddPredicateMenuChrome,
  projectAddPredicateMenuClassScopeHydrated,
  projectAddPredicateMenuCreateOpened,
  projectAddPredicateMenuCreateTriggerLabel,
  projectAddPredicateMenuDefinitionDetailsToggle,
  projectAddPredicateMenuDefinitionDetailsToggled,
  projectAddPredicateMenuExistingPredicateRows,
  projectAddPredicateMenuPredicateSearchPatch,
  projectAddPredicateMenuResolvedUri,
  projectAddPredicateMenuStateDraftPatch,
  projectAddPredicateMenuUriPreview,
  projectAddPredicateMenuValueTypeRows,
  shouldShowAddPredicateMenuEnumOptionsEditor,
  type AddPredicateMenuExistingPredicateRow,
} from './structured-add-predicate-menu-model'

export function useAddPredicateMenuController({
  documentUri,
  predicates,
  vocabDefinitionIndex,
  showNamespaces = false,
  classScope,
  namespaceRegistry,
  currentPodRootUri,
  targetVocabUri,
  onCreate,
}: {
  documentUri: string
  predicates: string[]
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex
  showNamespaces?: boolean
  classScope?: string | null
  namespaceRegistry?: ReadonlyMap<string, string>
  currentPodRootUri?: string | null
  targetVocabUri?: string | null
  onCreate: (draft: PredicateDefinitionDraft) => void
}) {
  const [menuState, setMenuState] = useState(() => createAddPredicateMenuState(classScope))
  const {
    createOpen,
    definitionDetailsOpen,
    draft,
    predicateSearch,
  } = menuState
  const chrome = useMemo(() => projectAddPredicateMenuChrome(), [])
  const definitionDetailsToggle = useMemo(
    () => projectAddPredicateMenuDefinitionDetailsToggle(definitionDetailsOpen),
    [definitionDetailsOpen],
  )

  const resolvedUri = useMemo(
    () => projectAddPredicateMenuResolvedUri({
      currentPodRootUri,
      documentUri,
      draft,
      namespaceRegistry,
      targetVocabUri,
    }),
    [currentPodRootUri, documentUri, draft, namespaceRegistry, targetVocabUri],
  )

  const visibleExistingPredicates = useMemo<AddPredicateMenuExistingPredicateRow[]>(() => (
    projectAddPredicateMenuExistingPredicateRows({
      predicateSearch,
      predicates,
      showNamespaces,
      vocabDefinitionIndex,
    })
  ), [predicateSearch, predicates, showNamespaces, vocabDefinitionIndex])
  const hasVisibleExistingPredicates = visibleExistingPredicates.length > 0
  const createTriggerLabel = useMemo(
    () => projectAddPredicateMenuCreateTriggerLabel(predicateSearch),
    [predicateSearch],
  )
  const submitDisabled = !canSubmitAddPredicateMenuDraft(resolvedUri)
  const uriPreview = useMemo(
    () => projectAddPredicateMenuUriPreview(resolvedUri),
    [resolvedUri],
  )
  const valueTypeRows = useMemo(
    () => projectAddPredicateMenuValueTypeRows(draft.type),
    [draft.type],
  )
  const showEnumOptionsEditor = shouldShowAddPredicateMenuEnumOptionsEditor(draft.type)

  const openCreateFromSearch = useCallback(() => {
    setMenuState(projectAddPredicateMenuCreateOpened)
  }, [])

  const updateDraft = useCallback((patch: Partial<PredicateDefinitionDraft>) => {
    setMenuState((current) => projectAddPredicateMenuStateDraftPatch({
      current,
      patch,
    }))
  }, [])

  const toggleDefinitionDetails = useCallback(() => {
    setMenuState(projectAddPredicateMenuDefinitionDetailsToggled)
  }, [])

  const submitDraft = useCallback(() => {
    if (!resolvedUri) return
    onCreate(draft)
    setMenuState((current) => planAddPredicateMenuSubmitted({
      classScope,
      current,
    }))
  }, [classScope, draft, onCreate, resolvedUri])

  const setPredicateSearch = useCallback((nextPredicateSearch: string) => {
    setMenuState((current) => projectAddPredicateMenuPredicateSearchPatch({
      current,
      predicateSearch: nextPredicateSearch,
    }))
  }, [])

  useEffect(() => {
    setMenuState((current) => projectAddPredicateMenuClassScopeHydrated({
      classScope,
      current,
    }))
  }, [classScope])

  return {
    createOpen,
    definitionDetailsOpen,
    definitionDetailsToggle,
    chrome,
    predicateSearch,
    draft,
    resolvedUri,
    visibleExistingPredicates,
    hasVisibleExistingPredicates,
    createTriggerLabel,
    submitDisabled,
    uriPreview,
    valueTypeRows,
    showEnumOptionsEditor,
    setPredicateSearch,
    openCreateFromSearch,
    updateDraft,
    toggleDefinitionDetails,
    submitDraft,
  }
}
