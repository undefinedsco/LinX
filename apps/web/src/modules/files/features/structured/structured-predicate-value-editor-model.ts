import {
  serializeStructuredCellEditorValues,
  type StructuredCellEditorValueKind,
} from '../../domain/structured/structured-cell-editor-plan'

export type StructuredPredicateValueEditorKind = StructuredCellEditorValueKind

export type StructuredPredicateValueEditorState = {
  draft: string
  selectedValues: string[]
}

type StructuredPredicateValueEditorCommitPlan = {
  draft?: string
  noop?: true
  selectedValues?: string[]
}

type StructuredPredicateValueEditorCreateStateInput = {
  canCreate: boolean
  normalizedDraft: string
}

type StructuredPredicateValueEditorChromeInput = {
  ariaLabel: string
  enumState: StructuredPredicateValueEditorCreateStateInput
  multiSelectState: StructuredPredicateValueEditorCreateStateInput
  placeholder?: string
  selectedValues: readonly string[]
}

const DEFAULT_STRUCTURED_PREDICATE_VALUE_EDITOR_PLACEHOLDER = '选择或创建选项'

export function valuesKey(values: readonly string[]) {
  return values.join('\u0000')
}

export function normalizeDisplayValues(values: readonly string[]) {
  return values.map((value) => value.trim()).filter(Boolean)
}

export function normalizeOptions(options: readonly string[]) {
  return Array.from(new Set(options.map((option) => option.trim()).filter(Boolean)))
}

export function projectStructuredPredicateValueEditorResetState({
  kind,
  values,
}: {
  kind: StructuredPredicateValueEditorKind
  values: readonly string[]
}) {
  const normalizedValues = normalizeDisplayValues(values)
  return {
    normalizedValues,
    draft: kind === 'multi-select' ? '' : (normalizedValues[0] ?? ''),
    selectedValues: normalizedValues,
    incomingValuesKey: valuesKey(normalizedValues),
  }
}

export function createStructuredPredicateValueEditorState({
  kind,
  values,
}: {
  kind: StructuredPredicateValueEditorKind
  values: readonly string[]
}): StructuredPredicateValueEditorState {
  const resetState = projectStructuredPredicateValueEditorResetState({ kind, values })
  return {
    draft: resetState.draft,
    selectedValues: resetState.selectedValues,
  }
}

export function projectStructuredPredicateValueEditorDraftPatch({
  current,
  draft,
}: {
  current: StructuredPredicateValueEditorState
  draft: string
}): StructuredPredicateValueEditorState {
  return {
    ...current,
    draft,
  }
}

export function projectStructuredPredicateValueEditorCommitState({
  current,
  plan,
}: {
  current: StructuredPredicateValueEditorState
  plan: StructuredPredicateValueEditorCommitPlan
}): StructuredPredicateValueEditorState {
  return {
    draft: plan.draft ?? current.draft,
    selectedValues: plan.selectedValues ?? current.selectedValues,
  }
}

function serializeStructuredPredicateEditorValues(
  kind: StructuredPredicateValueEditorKind,
  values: readonly string[],
) {
  return serializeStructuredCellEditorValues(kind, values)
}

export function projectStructuredPredicateValueEditorModel({
  draft,
  kind,
  options,
  selectedValues,
}: {
  kind: StructuredPredicateValueEditorKind
  draft: string
  selectedValues: readonly string[]
  options: readonly string[]
}) {
  const normalizedOptions = normalizeOptions(options)
  const enumNormalizedDraft = draft.trim()
  const enumFilteredOptions = normalizedOptions.filter((option) => (
    option.toLowerCase().includes(enumNormalizedDraft.toLowerCase())
  ))
  const enumCanCreate = !!enumNormalizedDraft
    && !normalizedOptions.some((option) => option.toLowerCase() === enumNormalizedDraft.toLowerCase())
  const enumExpanded = enumFilteredOptions.length > 0 || enumCanCreate

  const multiSelectNormalizedDraft = draft.trim()
  const multiSelectOptionCandidates = normalizedOptions.filter((option) => (
    !selectedValues.includes(option)
    && (!multiSelectNormalizedDraft || option.toLowerCase().includes(multiSelectNormalizedDraft.toLowerCase()))
  ))
  const multiSelectCanCreate = !!multiSelectNormalizedDraft
    && !selectedValues.includes(multiSelectNormalizedDraft)
    && !normalizedOptions.some((option) => option.toLowerCase() === multiSelectNormalizedDraft.toLowerCase())
  const multiSelectExpanded = multiSelectOptionCandidates.length > 0 || multiSelectCanCreate

  return {
    booleanValue: selectedValues[0] === 'true',
    enumState: {
      canCreate: enumCanCreate,
      expanded: enumExpanded,
      filteredOptions: enumFilteredOptions,
      normalizedDraft: enumNormalizedDraft,
      showListbox: Boolean(enumNormalizedDraft && enumExpanded),
    },
    multiSelectState: {
      canCreate: multiSelectCanCreate,
      expanded: multiSelectExpanded,
      normalizedDraft: multiSelectNormalizedDraft,
      optionCandidates: multiSelectOptionCandidates,
      showListbox: Boolean(multiSelectNormalizedDraft),
    },
    normalizedOptions,
    scalarInputType: kind === 'number' || kind === 'date' ? kind : 'text',
  }
}

function structuredPredicateValueEditorListboxId(ariaLabel: string) {
  return `${ariaLabel.replace(/[^A-Za-z0-9_-]+/g, '-')}-options`
}

function projectStructuredPredicateValueEditorCreateOption({
  canCreate,
  normalizedDraft,
}: StructuredPredicateValueEditorCreateStateInput) {
  return canCreate
    ? {
        ariaLabel: `新增值 ${normalizedDraft}`,
        label: `新增 ${normalizedDraft}*`,
      }
    : null
}

export function projectStructuredPredicateValueEditorChrome({
  ariaLabel,
  enumState,
  multiSelectState,
  placeholder = DEFAULT_STRUCTURED_PREDICATE_VALUE_EDITOR_PLACEHOLDER,
  selectedValues,
}: StructuredPredicateValueEditorChromeInput) {
  return {
    booleanToggle: {
      ariaLabel: `切换 ${ariaLabel}`,
    },
    enumCreateOption: projectStructuredPredicateValueEditorCreateOption(enumState),
    input: {
      placeholder,
    },
    listbox: {
      ariaLabel: `${ariaLabel} 的选项`,
      id: structuredPredicateValueEditorListboxId(ariaLabel),
    },
    multiSelectCreateOption: projectStructuredPredicateValueEditorCreateOption(multiSelectState),
    multiSelectInput: {
      placeholder: selectedValues.length ? '' : placeholder,
    },
    multiSelectSelectedValues: selectedValues.map((value) => ({
      value,
      ariaLabel: `已选择值 ${value}`,
      removeAction: {
        ariaLabel: `移除值 ${value}`,
        value,
      },
    })),
  }
}

export function planStructuredPredicateBooleanToggle(booleanValue: boolean) {
  const nextValue = booleanValue ? 'false' : 'true'
  return {
    selectedValues: [nextValue],
    serializedValues: serializeStructuredPredicateEditorValues('boolean', [nextValue]),
  }
}

export function planStructuredPredicateEnumCommit({
  kind,
  nextValue,
}: {
  kind: StructuredPredicateValueEditorKind
  nextValue: string
}) {
  const normalized = nextValue.trim()
  const selectedValues = normalized ? [normalized] : []
  return {
    draft: normalized,
    selectedValues,
    serializedValues: serializeStructuredPredicateEditorValues(kind, selectedValues),
  }
}

export function planStructuredPredicateMultiValueAdd({
  kind,
  nextValue,
  selectedValues,
}: {
  kind: StructuredPredicateValueEditorKind
  nextValue: string
  selectedValues: readonly string[]
}) {
  const normalized = nextValue.trim()
  if (!normalized || selectedValues.includes(normalized)) {
    return {
      draft: '',
      noop: true as const,
    }
  }
  const nextValues = [...selectedValues, normalized]
  return {
    draft: '',
    selectedValues: nextValues,
    serializedValues: serializeStructuredPredicateEditorValues(kind, nextValues),
  }
}

export function planStructuredPredicateMultiValueRemove({
  kind,
  selectedValues,
  value,
}: {
  kind: StructuredPredicateValueEditorKind
  selectedValues: readonly string[]
  value: string
}) {
  const nextValues = selectedValues.filter((selectedValue) => selectedValue !== value)
  return {
    selectedValues: nextValues,
    serializedValues: serializeStructuredPredicateEditorValues(kind, nextValues),
  }
}

export function planStructuredPredicateScalarCommit({
  kind,
  nextValue,
}: {
  kind: StructuredPredicateValueEditorKind
  nextValue: string
}) {
  const normalized = nextValue.trim()
  const selectedValues = normalized ? [normalized] : []
  return {
    draft: normalized,
    selectedValues,
    serializedValues: serializeStructuredPredicateEditorValues(kind, selectedValues),
  }
}
