import type { StructuredVocabDefinitionIndex } from '../../domain/structured/structured-table'
import {
  DEFAULT_PREDICATE_NAMESPACE,
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
      description: '提交后以 * 参与当前表格；审批通过前不改写 vocab。',
      heading: '新建 predicate',
    },
    definitionByline: {
      ariaLabel: 'predicate 定义',
    },
    descriptionField: {
      ariaLabel: 'predicate 描述',
      label: '描述',
      placeholder: '说明这个 predicate 的用途、来源和使用边界',
    },
    emptyState: {
      label: '没有匹配的 predicate',
    },
    enumOptionsField: {
      ariaLabel: 'predicate 枚举选项',
      label: '选项',
      placeholder: 'Ready, Blocked',
    },
    labelField: {
      ariaLabel: 'predicate 标签',
      label: '标签',
      placeholder: 'Summary',
    },
    localNameField: {
      ariaLabel: 'predicate term',
      label: 'term',
      placeholder: 'summary',
    },
    searchField: {
      ariaLabel: '选择或创建 predicate',
      placeholder: '选择已有 predicate 或创建',
    },
    shapeFields: {
      classScope: {
        ariaLabel: 'predicate class scope',
        label: 'class scope',
        placeholder: 'udfs:Workspace',
      },
      editor: {
        ariaLabel: 'predicate editor type',
        label: 'editor',
        options: ['input', 'textarea', 'select', 'multi-select', 'date', 'checkbox', 'relation'],
      },
      maxCount: {
        ariaLabel: 'predicate 最大数量',
        placeholder: '最大',
        srLabel: '最大',
      },
      minCount: {
        ariaLabel: 'predicate 最小数量',
        placeholder: '最小',
        srLabel: '最小',
      },
      namespace: {
        ariaLabel: 'predicate namespace',
        label: 'ns',
        placeholder: 'udfs',
      },
      required: {
        ariaLabel: 'predicate 必填',
        label: '必填',
      },
      uri: {
        ariaLabel: 'predicate URI',
        label: 'URI 覆盖',
        placeholder: 'https://example.com/vocab/summary',
      },
    },
    shapeSection: {
      label: 'shape',
    },
    submitButton: {
      label: '提交待确认 predicate *',
    },
    termSection: {
      label: 'term',
    },
    trigger: {
      ariaLabel: '+ predicate',
      label: 'predicate',
    },
    valueSection: {
      label: 'value',
    },
    valueTypes: {
      ariaLabel: 'predicate value types',
      optionAriaLabelPrefix: '类型',
    },
  }
}

export function projectAddPredicateMenuDefinitionDetailsToggle(definitionDetailsOpen: boolean) {
  return {
    ariaLabel: definitionDetailsOpen ? '收起 shape 和高级信息' : '展开 shape 和高级信息',
    expanded: definitionDetailsOpen,
    indicator: definitionDetailsOpen ? '-' : '+',
    label: 'shape',
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
  return { ...currentDraft, ...patch }
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
        typeLabel: definition?.valueType || 'observed',
        description: definition?.description || definition?.shape || definition?.shapeRules?.[0]?.constraint || '',
        selectAriaLabel: `选择 predicate ${label}`,
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
  if (!localName) return currentDraft

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

export function projectAddPredicateMenuCreateTriggerLabel(predicateSearch: string) {
  const normalizedSearch = predicateSearch.trim()
  return normalizedSearch ? `新建 "${normalizedSearch}"` : '新建 predicate'
}

export function canSubmitAddPredicateMenuDraft(resolvedUri?: string | null) {
  return Boolean(resolvedUri)
}

export function projectAddPredicateMenuUriPreview(resolvedUri?: string | null) {
  return {
    label: resolvedUri ? `URI 预览 · ${resolvedUri}` : 'URI 预览 · 填写 ns 和 term 后生成',
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
