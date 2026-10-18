import type { StructuredVocabDefinitionIndex } from '../../domain/structured/structured-table'
import {
  DEFAULT_PREDICATE_NAMESPACE,
  autoPredicateLocalName,
  PREDICATE_VALUE_TYPE_OPTIONS,
  createPredicateDefinitionDraft,
  predicateUriFromDraft,
  stripPredicateIriDelimiters,
  type PredicateDefinitionDraft,
} from '../../domain/structured/structured-predicate-draft'
import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'

export type AddPredicateMenuExistingPredicateRow = {
  predicate: string
  label: string
  displayLabel: string
  typeLabel: string
  description: string
  selectAriaLabel: string
}

export type AddPredicateMenuValueTypeRow = {
  value: (typeof PREDICATE_VALUE_TYPE_OPTIONS)[number]['value']
  label: string
  icon: string
  description: string
  selected: boolean
}

export type AddPredicateMenuState = {
  createOpen: boolean
  definitionDetailsOpen: boolean
  draft: PredicateDefinitionDraft
  predicateSearch: string
}

export function createAddPredicateMenuState(classScope?: string | null): AddPredicateMenuState {
  return {
    createOpen: false,
    definitionDetailsOpen: false,
    draft: createAddPredicateMenuDraft(classScope),
    predicateSearch: '',
  }
}

export function projectAddPredicateMenuStateReset({
  classScope,
  current: _current,
}: {
  classScope?: string | null
  current: AddPredicateMenuState
}): AddPredicateMenuState {
  return createAddPredicateMenuState(classScope)
}

export function projectAddPredicateMenuPredicateSearchPatch({
  current,
  predicateSearch,
}: {
  current: AddPredicateMenuState
  predicateSearch: string
}): AddPredicateMenuState {
  return {
    ...current,
    predicateSearch,
  }
}

export function projectAddPredicateMenuCreateOpened(current: AddPredicateMenuState): AddPredicateMenuState {
  return {
    ...current,
    createOpen: true,
    draft: projectAddPredicateMenuDraftSeed({
      currentDraft: current.draft,
      predicateSearch: current.predicateSearch,
    }),
  }
}

export function projectAddPredicateMenuStateDraftPatch({
  current,
  patch,
}: {
  current: AddPredicateMenuState
  patch: Partial<PredicateDefinitionDraft>
}): AddPredicateMenuState {
  return {
    ...current,
    draft: projectAddPredicateMenuDraftPatch({
      currentDraft: current.draft,
      patch,
    }),
  }
}

export function projectAddPredicateMenuDefinitionDetailsToggled(
  current: AddPredicateMenuState,
): AddPredicateMenuState {
  return {
    ...current,
    definitionDetailsOpen: projectAddPredicateMenuDefinitionDetailsOpenToggle(current.definitionDetailsOpen),
  }
}

export function projectAddPredicateMenuClassScopeHydrated({
  classScope,
  current,
}: {
  classScope?: string | null
  current: AddPredicateMenuState
}): AddPredicateMenuState {
  return {
    ...current,
    draft: projectAddPredicateMenuDraftClassScope({
      classScope,
      currentDraft: current.draft,
    }),
  }
}

export function planAddPredicateMenuSubmitted({
  classScope,
  current,
}: {
  classScope?: string | null
  current: AddPredicateMenuState
}): AddPredicateMenuState {
  return {
    ...current,
    createOpen: false,
    definitionDetailsOpen: false,
    draft: createAddPredicateMenuDraft(classScope),
  }
}

export function projectAddPredicateMenuChrome() {
  return {
    createPanel: {
      description: '会放进“词表 › 属性”，别的表格也能用。',
      heading: '新建一个属性',
    },
    definitionByline: {
      ariaLabel: '属性定义',
    },
    descriptionField: {
      ariaLabel: '属性说明',
      label: '说明',
      placeholder: '这一列用来记什么',
    },
    emptyState: {
      label: '词表里没有匹配的属性',
    },
    enumOptionsField: {
      ariaLabel: '属性选项',
      label: '选项（用逗号隔开）',
      placeholder: '摄影，布置，签到',
    },
    labelField: {
      ariaLabel: '属性名字',
      label: '名字',
      placeholder: '比如：擅长',
    },
    localNameField: {
      ariaLabel: '属性代号',
      label: '代号',
      placeholder: 'skill',
    },
    searchField: {
      ariaLabel: '从词表挑一个属性，或新建',
      placeholder: '从词表里找，或直接输入新名字',
    },
    shapeFields: {
      classScope: {
        ariaLabel: '适用的类型',
        label: '适用的类型',
        placeholder: 'udfs:Workspace',
      },
      editor: {
        ariaLabel: '填写方式',
        label: '填写方式',
        options: ['input', 'textarea', 'select', 'multi-select', 'date', 'checkbox', 'relation'],
      },
      maxCount: {
        ariaLabel: '最多几个值',
        placeholder: '最多',
        srLabel: '最多',
      },
      minCount: {
        ariaLabel: '最少几个值',
        placeholder: '最少',
        srLabel: '最少',
      },
      namespace: {
        ariaLabel: '命名空间',
        label: '命名空间',
        placeholder: 'udfs',
      },
      required: {
        ariaLabel: '必填',
        label: '必填',
      },
      uri: {
        ariaLabel: '指定地址',
        label: '指定地址',
        placeholder: 'https://example.com/vocab/skill',
      },
    },
    shapeSection: {
      label: '更多设置',
    },
    submitButton: {
      label: '添加',
    },
    termSection: {
      label: '名字',
    },
    trigger: {
      ariaLabel: '+ 属性',
      label: '属性',
    },
    valueSection: {
      label: '值是什么',
    },
    valueTypes: {
      ariaLabel: '值的类型',
      optionAriaLabelPrefix: '类型',
    },
  }
}

export function projectAddPredicateMenuDefinitionDetailsToggle(definitionDetailsOpen: boolean) {
  return {
    ariaLabel: definitionDetailsOpen ? '收起更多设置' : '展开更多设置',
    expanded: definitionDetailsOpen,
    indicator: definitionDetailsOpen ? '-' : '+',
    label: '更多设置',
  }
}

export function projectAddPredicateMenuDefinitionDetailsOpenToggle(current: boolean) {
  return !current
}

export function createAddPredicateMenuDraft(classScope?: string | null): PredicateDefinitionDraft {
  return createPredicateDefinitionDraft(classScope)
}

export function projectAddPredicateMenuDraftPatch({
  currentDraft,
  patch,
}: {
  currentDraft: PredicateDefinitionDraft
  patch: Partial<PredicateDefinitionDraft>
}): PredicateDefinitionDraft {
  const next = { ...currentDraft, ...patch }
  // The person only names the column; its machine name follows until they set one themselves.
  if (patch.label !== undefined && patch.localName === undefined
    && (currentDraft.localName === '' || currentDraft.localName === autoPredicateLocalName(currentDraft.label))) {
    next.localName = autoPredicateLocalName(patch.label)
  }
  return next
}

export function projectAddPredicateMenuDraftClassScope({
  classScope,
  currentDraft,
}: {
  classScope?: string | null
  currentDraft: PredicateDefinitionDraft
}): PredicateDefinitionDraft {
  if (currentDraft.classScope || !classScope) return currentDraft
  return { ...currentDraft, classScope }
}

export function projectAddPredicateMenuResolvedUri({
  currentPodRootUri,
  documentUri,
  draft,
  namespaceRegistry,
  targetVocabUri,
}: {
  currentPodRootUri?: string | null
  documentUri: string
  draft: PredicateDefinitionDraft
  namespaceRegistry?: ReadonlyMap<string, string>
  targetVocabUri?: string | null
}) {
  return predicateUriFromDraft(draft, documentUri, namespaceRegistry, currentPodRootUri, targetVocabUri)
}

export function projectAddPredicateMenuExistingPredicateRows({
  predicateSearch,
  predicates,
  showNamespaces = false,
  vocabDefinitionIndex,
}: {
  predicateSearch: string
  predicates: readonly string[]
  showNamespaces?: boolean
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex
}): AddPredicateMenuExistingPredicateRow[] {
  const normalizedPredicateSearch = predicateSearch.trim().toLowerCase()
  const definitionForPredicate = (predicate: string) => (
    vocabDefinitionIndex?.predicates.get(predicate)
    ?? vocabDefinitionIndex?.predicates.get(localPredicateLabel(predicate))
  )

  return predicates
    .filter((predicate) => {
      if (!normalizedPredicateSearch) return true
      const definition = definitionForPredicate(predicate)
      return predicate.toLowerCase().includes(normalizedPredicateSearch)
        || localPredicateLabel(predicate).toLowerCase().includes(normalizedPredicateSearch)
        || (definition?.label ?? '').toLowerCase().includes(normalizedPredicateSearch)
    })
    .map((predicate) => {
      const definition = definitionForPredicate(predicate)
      const label = definition?.label || localPredicateLabel(predicate)
      return {
        predicate,
        label,
        displayLabel: showNamespaces ? predicate : label,
        typeLabel: predicateTypeLabel(definition?.valueType),
        description: definition?.description || definition?.shape || definition?.shapeRules?.[0]?.constraint || '',
        selectAriaLabel: `选择属性 ${label}`,
      }
    })
}

export function projectAddPredicateMenuDraftSeed({
  currentDraft,
  predicateSearch,
}: {
  currentDraft: PredicateDefinitionDraft
  predicateSearch: string
}): PredicateDefinitionDraft {
  const search = stripPredicateIriDelimiters(predicateSearch.trim())
  if (!search) return currentDraft

  const localName = localPredicateLabel(search).replace(/[^\w.-]+/g, '')
  if (!localName) {
    return {
      ...currentDraft,
      label: currentDraft.label || search,
      localName: currentDraft.localName || autoPredicateLocalName(search),
    }
  }

  const label = localName.charAt(0).toUpperCase() + localName.slice(1)
  const curieMatch = search.match(/^([A-Za-z][\w.-]*):(.+)$/)
  const explicitUri = /^(?:https?:|urn:|mailto:)/i.test(search) ? search : ''

  return {
    ...currentDraft,
    namespace: curieMatch && currentDraft.namespace === DEFAULT_PREDICATE_NAMESPACE
      ? curieMatch[1]
      : currentDraft.namespace,
    localName: currentDraft.localName || localName,
    label: currentDraft.label || label,
    uri: currentDraft.uri || explicitUri,
  }
}

const PREDICATE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  PREDICATE_VALUE_TYPE_OPTIONS.map((option) => [option.value, option.label]),
)

/** 文字 / 数字 / …; a term that has no declared type is just 已有 in the picker. */
export function predicateTypeLabel(valueType?: string | null) {
  const key = valueType?.trim().toLowerCase()
  return (key && PREDICATE_TYPE_LABELS[key]) || '已有'
}

export function projectAddPredicateMenuCreateTriggerLabel(predicateSearch: string) {
  const normalizedSearch = predicateSearch.trim()
  return normalizedSearch ? `新建“${normalizedSearch}”` : '新建一个属性'
}

export function canSubmitAddPredicateMenuDraft(resolvedUri?: string | null) {
  return Boolean(resolvedUri)
}

export function projectAddPredicateMenuUriPreview(resolvedUri?: string | null) {
  return {
    label: resolvedUri ? `会放进“词表 › 属性” · ${resolvedUri}` : '先写上名字',
    title: resolvedUri || undefined,
  }
}

export function projectAddPredicateMenuValueTypeRows(type: PredicateDefinitionDraft['type']): AddPredicateMenuValueTypeRow[] {
  const normalizedType = type.trim().toLowerCase()
  return PREDICATE_VALUE_TYPE_OPTIONS.map((option) => ({
    ...option,
    selected: option.value === normalizedType,
  }))
}

export function shouldShowAddPredicateMenuEnumOptionsEditor(type: PredicateDefinitionDraft['type']) {
  return type.trim().toLowerCase() === 'enum'
}
