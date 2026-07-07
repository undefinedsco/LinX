import { useEffect, useMemo, useState } from 'react'

import {
  createStructuredPredicateValueEditorState,
  planStructuredPredicateBooleanToggle,
  planStructuredPredicateEnumCommit,
  planStructuredPredicateMultiValueAdd,
  planStructuredPredicateMultiValueRemove,
  planStructuredPredicateScalarCommit,
  projectStructuredPredicateValueEditorCommitState,
  projectStructuredPredicateValueEditorDraftPatch,
  projectStructuredPredicateValueEditorModel,
  projectStructuredPredicateValueEditorResetState,
  type StructuredPredicateValueEditorKind,
} from './structured-predicate-value-editor-model'

export type { StructuredPredicateValueEditorKind } from './structured-predicate-value-editor-model'

export function useStructuredPredicateValueEditorController({
  kind,
  values,
  options = [],
  onCommit,
}: {
  kind: StructuredPredicateValueEditorKind
  values: string[]
  options?: string[]
  onCommit: (nextValues: string[]) => void
}) {
  const resetState = useMemo(() => projectStructuredPredicateValueEditorResetState({
    kind,
    values,
  }), [kind, values])
  const [editorState, setEditorState] = useState(() => createStructuredPredicateValueEditorState({
    kind,
    values,
  }))
  const { draft, selectedValues } = editorState

  useEffect(() => {
    setEditorState({
      draft: resetState.draft,
      selectedValues: resetState.selectedValues,
    })
  }, [resetState.incomingValuesKey, kind])

  const {
    booleanValue,
    enumState,
    multiSelectState,
    normalizedOptions,
    scalarInputType,
  } = useMemo(() => projectStructuredPredicateValueEditorModel({
    draft,
    kind,
    options,
    selectedValues,
  }), [draft, kind, options, selectedValues])
  function toggleBooleanValue() {
    const plan = planStructuredPredicateBooleanToggle(booleanValue)
    setEditorState((current) => projectStructuredPredicateValueEditorCommitState({
      current,
      plan,
    }))
    onCommit(plan.serializedValues)
  }

  function commitEnumValue(nextValue = draft) {
    const plan = planStructuredPredicateEnumCommit({ kind, nextValue })
    setEditorState((current) => projectStructuredPredicateValueEditorCommitState({
      current,
      plan,
    }))
    onCommit(plan.serializedValues)
  }

  function commitMultiValue(nextValue = multiSelectState.normalizedDraft) {
    const plan = planStructuredPredicateMultiValueAdd({ kind, nextValue, selectedValues })
    setEditorState((current) => projectStructuredPredicateValueEditorCommitState({
      current,
      plan,
    }))
    if ('noop' in plan) {
      return
    }
    onCommit(plan.serializedValues)
  }
  function removeMultiValue(value: string) {
    const plan = planStructuredPredicateMultiValueRemove({ kind, selectedValues, value })
    setEditorState((current) => projectStructuredPredicateValueEditorCommitState({
      current,
      plan,
    }))
    onCommit(plan.serializedValues)
  }

  function commitScalarValue(nextValue = draft) {
    const plan = planStructuredPredicateScalarCommit({ kind, nextValue })
    setEditorState((current) => projectStructuredPredicateValueEditorCommitState({
      current,
      plan,
    }))
    onCommit(plan.serializedValues)
  }

  function setDraft(nextDraft: string) {
    setEditorState((current) => projectStructuredPredicateValueEditorDraftPatch({
      current,
      draft: nextDraft,
    }))
  }

  return {
    booleanValue,
    commitEnumValue,
    commitMultiValue,
    commitScalarValue,
    draft,
    enumState,
    multiSelectState,
    normalizedOptions,
    removeMultiValue,
    scalarInputType,
    selectedValues,
    setDraft,
    toggleBooleanValue,
  }
}
