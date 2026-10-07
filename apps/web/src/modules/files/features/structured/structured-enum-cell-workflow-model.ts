import {
  quoteStructuredCellLiteral,
  unquoteStructuredCellLiteral,
} from '../../domain/structured/structured-cell-editor-plan'
import { displayStructuredCellValue } from '../../domain/structured/structured-table-cell-model'

type StructuredEnumPredicateDefinitionInput = {
  valueType?: string | null
}

export type StructuredEnumOptionAddPlan =
  | { kind: 'noop'; reason: 'empty' | 'duplicate' }
  | { kind: 'known-option'; label: string; nextValues: string[] }
  | { kind: 'new-option'; label: string; nextValues: string[] }

export type StructuredEnumOptionRemovePlan =
  | { kind: 'noop'; reason: 'empty' | 'missing' }
  | { kind: 'cell-write'; nextValues: string[] }

export type StructuredEnumSelectorInputKeyAction =
  | { kind: 'add-option'; value: string }
  | { kind: 'cancel' }
  | { kind: 'noop' }

export type StructuredEnumSelectorOptionKeyAction =
  | { kind: 'add-option'; value: string }
  | { kind: 'noop' }

type StructuredEnumCellSelectorOptionInput = {
  label: string
}

type StructuredEnumCellSelectorChromeInput = {
  ariaLabel: string
  canCreate: boolean
  normalizedSearch: string
  optionsLabel?: string
  selectedValues: readonly string[]
  valueLabel?: string
}

type StructuredEnumCellOptionMenuInput = {
  option: {
    label: string
    pending?: boolean
    proposalResourceUri?: string
    status: string
  }
  predicateLabel?: string
}

function isStructuredMultiEnumPredicateDefinition(definition?: StructuredEnumPredicateDefinitionInput | null) {
  const valueType = definition?.valueType?.trim().toLowerCase()
  return Boolean(valueType && (valueType.includes('multi') || valueType.includes('set') || valueType.includes('list')))
}

export function projectStructuredEnumCellSelectorModel<Option extends StructuredEnumCellSelectorOptionInput>({
  options,
  search,
  selectedValues,
}: {
  options: readonly Option[]
  search: string
  selectedValues: readonly string[]
}) {
  const normalizedSearch = search.trim()
  const normalizedSearchLower = normalizedSearch.toLowerCase()
  const exactSearchOption = normalizedSearch
    ? options.find((option) => option.label.toLowerCase() === normalizedSearchLower)
    : null
  const filteredOptions = options.filter((option) => (
    !normalizedSearch || option.label.toLowerCase().includes(normalizedSearchLower)
  ))
  const canCreate = !!normalizedSearch
    && !exactSearchOption
    && !selectedValues.some((value) => value.toLowerCase() === normalizedSearchLower)

  return {
    canCreate,
    exactSearchOptionLabel: exactSearchOption?.label ?? null,
    filteredOptions,
    normalizedSearch,
  }
}

export function projectStructuredEnumCellSelectorChrome({
  ariaLabel,
  canCreate,
  normalizedSearch,
  optionsLabel,
  selectedValues,
  valueLabel,
}: StructuredEnumCellSelectorChromeInput) {
  const valueContextLabel = valueLabel ?? ariaLabel

  return {
    createOption: canCreate
      ? {
        addAction: {
          value: normalizedSearch,
        },
        ariaLabel: `新增选项 ${normalizedSearch}`,
        label: `新增 ${normalizedSearch}*`,
      }
    : null,
    input: {
      placeholder: '选择或创建选项',
    },
    listbox: {
      ariaLabel: optionsLabel ?? `${ariaLabel} 的选项`,
    },
    selectedValues: {
      ariaLabel: `${valueContextLabel} 已选择值`,
      chips: selectedValues.map((value) => ({
        value,
        ariaLabel: `${valueContextLabel} 已选择 ${value}`,
        removeAction: {
          ariaLabel: `从 ${valueContextLabel} 移除 ${value}`,
          value,
        },
      })),
    },
  }
}

export function projectStructuredEnumCellOptionMenuModel({
  option,
  predicateLabel,
}: StructuredEnumCellOptionMenuInput) {
  const displayLabel = `${option.label}${option.pending ? '*' : ''}`

  return {
    actions: {
      discardProposal: option.proposalResourceUri ? { label: '忽略词表变更' } : null,
      openDefinition: { label: '打开选项链接' },
      openProposal: option.proposalResourceUri ? { label: '打开审批记录' } : null,
    },
    displayLabel,
    selectAction: {
      value: option.label,
    },
    rows: {
      option: {
        label: '选项',
        value: displayLabel,
      },
      predicate: predicateLabel
        ? {
            label: 'predicate',
            value: predicateLabel,
          }
        : null,
      status: {
        approvalReadyLabel: option.proposalResourceUri ? '审批记录已准备' : null,
        label: '状态',
        value: option.status,
      },
    },
    title: '选项定义',
    trigger: {
      ariaLabel: `选项定义 ${option.label}`,
    },
  }
}

export function planStructuredEnumSelectorInputKeyAction({
  exactSearchOptionLabel,
  key,
  normalizedSearch,
}: {
  exactSearchOptionLabel: string | null
  key: string
  normalizedSearch: string
}): StructuredEnumSelectorInputKeyAction {
  if (key === 'Escape') return { kind: 'cancel' }
  if (key === 'Enter' && normalizedSearch) {
    return {
      kind: 'add-option',
      value: exactSearchOptionLabel ?? normalizedSearch,
    }
  }
  return { kind: 'noop' }
}

export function planStructuredEnumSelectorOptionKeyAction({
  key,
  optionLabel,
}: {
  key: string
  optionLabel: string
}): StructuredEnumSelectorOptionKeyAction {
  if (key === 'Enter' || key === ' ') {
    return {
      kind: 'add-option',
      value: optionLabel,
    }
  }
  return { kind: 'noop' }
}

export function planStructuredEnumOptionAdd(input: {
  definition?: StructuredEnumPredicateDefinitionInput | null
  existingValues: readonly string[]
  knownOptions: readonly string[]
  previousValues: readonly string[]
  value: string
}): StructuredEnumOptionAddPlan {
  const label = input.value.trim()
  if (!label) return { kind: 'noop', reason: 'empty' }

  const nextValue = quoteStructuredCellLiteral(label)
  if (input.existingValues.includes(nextValue)) {
    return { kind: 'noop', reason: 'duplicate' }
  }

  const isMulti = isStructuredMultiEnumPredicateDefinition(input.definition)
    || input.existingValues.length > 1
    || input.previousValues.length > 1
  const nextValues = isMulti ? [...input.existingValues, nextValue] : [nextValue]

  return {
    kind: input.knownOptions.includes(label) ? 'known-option' : 'new-option',
    label,
    nextValues,
  }
}

export function planStructuredEnumOptionRemove(input: {
  existingValues: readonly string[]
  value: string
}): StructuredEnumOptionRemovePlan {
  const label = input.value.trim()
  if (!label) return { kind: 'noop', reason: 'empty' }

  const nextValues = input.existingValues.filter((cellValue) => (
    unquoteStructuredCellLiteral(displayStructuredCellValue(cellValue)) !== label
  ))
  if (nextValues.length === input.existingValues.length) {
    return { kind: 'noop', reason: 'missing' }
  }

  return {
    kind: 'cell-write',
    nextValues,
  }
}
