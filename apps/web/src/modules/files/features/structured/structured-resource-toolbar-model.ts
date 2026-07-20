import type { StructuredVocabTermDefinition, VocabTermProposal } from '../../domain/structured/structured-table'
import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'
import type { StructuredResourceViewMode } from '../../domain/structured/structured-view-metadata'
import type {
  StructuredPredicateTypeFilter,
  StructuredVocabTermFilter,
} from '../../domain/structured/structured-view-projection'

export type StructuredToolbarClassProposal = {
  id: string
  label: string
  uri: string
  status: 'pending' | 'approval-staged'
  vocabProposal?: VocabTermProposal
}

export type StructuredToolbarSubjectFilterId = 'warningRowsOnly' | 'pendingWritesOnly' | 'sourceUpdatesOnly'
export type StructuredViewMetadataSaveStatus = 'synced' | 'dirty' | 'saving' | 'error'

export function projectStructuredViewSaveIndicator(
  status: StructuredViewMetadataSaveStatus,
  error: string | null,
) {
  if (status === 'synced') return null
  if (status === 'saving') {
    return {
      ariaLabel: '正在同步视图配置',
      kind: 'saving' as const,
      retryable: false,
      title: '正在同步 .meta',
    }
  }
  if (status === 'error') {
    return {
      ariaLabel: '视图配置未同步，点击重试',
      kind: 'error' as const,
      retryable: true,
      title: error || '视图配置未同步',
    }
  }
  return {
    ariaLabel: '视图配置尚未同步',
    kind: 'dirty' as const,
    retryable: false,
    title: '等待同步 .meta',
  }
}

const EXTRA_VIEW_OPTIONS: Exclude<StructuredResourceViewMode, 'table'>[] = ['kanban', 'whiteboard', 'raw']
const PREDICATE_TYPE_FILTER_OPTIONS: StructuredPredicateTypeFilter[] = ['all', 'enum', 'boolean', 'number', 'date', 'relation', 'text']
const VOCAB_TERM_FILTER_OPTIONS: StructuredVocabTermFilter[] = ['all', 'defined', 'observed']
const VIEW_LABELS: Record<StructuredResourceViewMode, string> = {
  table: 'Table',
  kanban: 'Kanban',
  whiteboard: 'Whiteboard',
  raw: 'Raw',
}

function projectStructuredViewModeRow(value: StructuredResourceViewMode) {
  return {
    label: VIEW_LABELS[value],
    value,
  }
}

function projectStructuredActiveViewModeRow(value: StructuredResourceViewMode, activeViewMode: StructuredResourceViewMode) {
  return {
    ...projectStructuredViewModeRow(value),
    active: value === activeViewMode,
  }
}

function projectStructuredExtraViewTrigger() {
  return {
    ariaLabel: '+ 视图',
    label: '视图',
  }
}

function projectStructuredTools() {
  return {
    ariaLabel: '结构化表工具',
  }
}

function projectStructuredByline() {
  return {
    ariaLabel: '结构化资源信息',
  }
}

function projectStructuredClassScopeMenu() {
  return {
    headingLabel: '当前 class',
  }
}

function projectStructuredSearchField() {
  return {
    placeholder: '搜索 subject',
  }
}

function projectStructuredFilterTool() {
  return {
    ariaLabel: '筛选',
  }
}

function projectStructuredFilterSectionLabels() {
  return {
    namespace: '命名空间',
    predicateType: 'predicate 类型',
    vocabTerm: '词表定义',
  }
}

function projectStructuredClassCreateControl(classCreateOpen: boolean) {
  return {
    ariaLabel: '创建 class',
    expanded: classCreateOpen,
    inputAriaLabel: '新 class URI',
    placeholder: 'udfs:Note',
    stateLabel: classCreateOpen ? '收起' : '展开',
    submitLabel: '创建',
    toggleLabel: '创建 class',
    uriLabel: 'class URI',
  }
}

function projectStructuredClassDefinitionControl(classDefinitionOpen: boolean) {
  return {
    ariaLabel: '定义',
    expanded: classDefinitionOpen,
    stateLabel: classDefinitionOpen ? '收起' : '查看',
    toggleLabel: '定义',
  }
}

function structuredPredicateTypeFilterLabel(filter: StructuredPredicateTypeFilter) {
  if (filter === 'all') return '全部类型'
  return filter
}

function structuredVocabTermFilterLabel(filter: StructuredVocabTermFilter) {
  if (filter === 'all') return '全部词表定义'
  if (filter === 'defined') return '已定义 predicate'
  return '仅观察到 predicate'
}

function projectStructuredSubjectFilterRows({
  pendingWritesOnly,
  sourceUpdatesOnly,
  warningRowsOnly,
}: {
  pendingWritesOnly: boolean
  sourceUpdatesOnly: boolean
  warningRowsOnly: boolean
}) {
  return [
    { id: 'warningRowsOnly' as const, checked: warningRowsOnly, label: '有校验提醒的 subject' },
    { id: 'pendingWritesOnly' as const, checked: pendingWritesOnly, label: '有待确认更改的 subject' },
    { id: 'sourceUpdatesOnly' as const, checked: sourceUpdatesOnly, label: '有 Ingest 更新的 subject' },
  ]
}

function structuredSortToolLabel(sortKey: string | null | undefined, sortDirection: 'asc' | 'desc') {
  if (!sortKey) return '排序'
  if (sortKey === 'subject') return `subject ${sortDirection === 'desc' ? '降序' : '升序'}`
  return `${localPredicateLabel(sortKey)} ${sortDirection === 'desc' ? '降序' : '升序'}`
}

function projectStructuredSortTool({
  sortDirection,
  sortKey,
}: {
  sortDirection: 'asc' | 'desc'
  sortKey: string | null
}) {
  const label = structuredSortToolLabel(sortKey, sortDirection)
  return {
    active: Boolean(sortKey),
    ariaLabel: '排序',
    iconKind: sortKey ? sortDirection : 'none',
    label,
  }
}

function projectStructuredSortRows(schemaPredicateControls: readonly string[]) {
  return [
    { label: 'subject', sortKey: 'subject' },
    ...schemaPredicateControls.map((sortKey) => ({
      label: localPredicateLabel(sortKey),
      sortKey,
    })),
  ]
}

function projectStructuredSortOptionRows(sortRows: ReadonlyArray<{ label: string; sortKey: string }>) {
  return sortRows.map((row) => ({
    ...row,
    choices: (['asc', 'desc'] as const).map((sortDirection) => ({
      key: `${row.sortKey}:${sortDirection}`,
      label: `${row.label} ${sortDirection === 'asc' ? '升序' : '降序'}`,
      sortDirection,
      sortKey: row.sortKey,
    })),
  }))
}

function projectStructuredNamespaceSwitch(showNamespaces: boolean) {
  return {
    ariaLabel: showNamespaces ? '隐藏命名空间' : '显示命名空间',
    checked: showNamespaces,
    nextValue: !showNamespaces,
    title: '命名空间',
  }
}

function projectStructuredPredicateVisibilityTool() {
  return {
    ariaLabel: '隐藏 predicate',
  }
}

function projectStructuredNamespaceFilterRows(availablePredicateNamespaces: readonly string[]) {
  return [
    { label: '全部命名空间', value: null },
    ...availablePredicateNamespaces.map((namespace) => ({
      label: namespace,
      value: namespace,
    })),
  ]
}

function projectStructuredClassDefinitionPanel({
  classDefinition,
  selectedClassName,
}: {
  classDefinition?: StructuredVocabTermDefinition
  selectedClassName?: string | null
}) {
  const description = classDefinition?.description || (selectedClassName
    ? '不同 class 不混排。'
    : '先选择或创建 class，再添加 scoped subject。')
  return {
    headingLabel: classDefinition?.label || null,
    rows: [
      { key: 'scope', text: '此视图只展示该 class 的 predicate。' },
      { key: 'description', text: `描述：${description}` },
      ...(classDefinition?.status ? [{ key: 'status', text: `状态：${classDefinition.status}` }] : []),
    ],
    uri: classDefinition?.uri ?? selectedClassName ?? '未选择 class',
  }
}

export function projectStructuredResourceToolbarModel({
  availablePredicateNamespaces,
  classCreateOpen,
  classDefinition,
  classDefinitionOpen,
  classOptions,
  hiddenPredicates,
  pendingWritesOnly,
  predicateNamespaceFilter,
  predicateTypeFilter,
  schemaPredicateControls,
  selectedClassName,
  showNamespaces,
  sourceUpdatesOnly,
  structuredSortDirection,
  structuredSortKey,
  structuredWritesSupported,
  viewMode,
  visiblePendingClassProposals,
  vocabTermFilter,
  warningRowsOnly,
}: {
  availablePredicateNamespaces: readonly string[]
  classCreateOpen: boolean
  classDefinition?: StructuredVocabTermDefinition
  classDefinitionOpen: boolean
  classOptions: readonly string[]
  hiddenPredicates: ReadonlySet<string>
  pendingWritesOnly: boolean
  predicateNamespaceFilter: string | null
  predicateTypeFilter: StructuredPredicateTypeFilter
  schemaPredicateControls: readonly string[]
  selectedClassName?: string | null
  showNamespaces: boolean
  sourceUpdatesOnly: boolean
  structuredSortDirection: 'asc' | 'desc'
  structuredSortKey: string | null
  structuredWritesSupported: boolean
  viewMode: StructuredResourceViewMode
  visiblePendingClassProposals: readonly StructuredToolbarClassProposal[]
  vocabTermFilter: StructuredVocabTermFilter
  warningRowsOnly: boolean
}) {
  const hasSchemaPredicateControls = schemaPredicateControls.length > 0
  const sortTool = projectStructuredSortTool({
    sortDirection: structuredSortDirection,
    sortKey: structuredSortKey,
  })
  const sortRows = projectStructuredSortRows(schemaPredicateControls)
  const namespaceSwitch = projectStructuredNamespaceSwitch(showNamespaces)
  return {
    activeViewTabRows: (['table', ...(viewMode === 'table' ? [] : [viewMode])] as StructuredResourceViewMode[])
      .map((mode) => projectStructuredActiveViewModeRow(mode, viewMode)),
    availablePredicateNamespaces: [...availablePredicateNamespaces],
    byline: projectStructuredByline(),
    classOptions: classOptions.map((className) => ({
      label: localPredicateLabel(className),
      uri: className,
    })),
    classScopeMenu: projectStructuredClassScopeMenu(),
    classCreateControl: projectStructuredClassCreateControl(classCreateOpen),
    classDefinitionControl: projectStructuredClassDefinitionControl(classDefinitionOpen),
    classDefinitionPanel: projectStructuredClassDefinitionPanel({
      classDefinition,
      selectedClassName,
    }),
    extraViewOptionRows: EXTRA_VIEW_OPTIONS
      .filter((mode) => mode !== viewMode)
      .map(projectStructuredViewModeRow),
    extraViewTrigger: projectStructuredExtraViewTrigger(),
    filterSectionLabels: projectStructuredFilterSectionLabels(),
    filterTool: projectStructuredFilterTool(),
    hasActiveFilters: warningRowsOnly
      || pendingWritesOnly
      || sourceUpdatesOnly
      || predicateTypeFilter !== 'all'
      || !!predicateNamespaceFilter
      || vocabTermFilter !== 'all',
    subjectFilterRows: projectStructuredSubjectFilterRows({
      pendingWritesOnly,
      sourceUpdatesOnly,
      warningRowsOnly,
    }),
    namespaceSwitch,
    namespaceSwitchChecked: namespaceSwitch.checked,
    namespaceFilterRows: projectStructuredNamespaceFilterRows(availablePredicateNamespaces),
    pendingClassProposals: structuredWritesSupported
      ? visiblePendingClassProposals.map((proposal) => {
          const label = proposal.label || localPredicateLabel(proposal.uri)
          const approvalResourceUri = proposal.status === 'approval-staged'
            ? proposal.vocabProposal?.proposalResourceUri
            : undefined
          return {
            approvalResourceUri,
            approvalStatusLabel: approvalResourceUri ? '审批记录已准备' : null,
            canOpenApproval: !!approvalResourceUri,
            canSubmit: proposal.status === 'pending',
            discardButtonLabel: '放弃',
            discardLabel: `放弃 class ${label}`,
            displayLabel: `${label}*`,
            id: proposal.id,
            label,
            openApprovalLabel: approvalResourceUri ? `打开 class 审批记录 ${label}` : null,
            status: proposal.status,
            submitLabel: proposal.status === 'pending' ? '提交待确认 class *' : null,
            uri: proposal.uri,
          }
        })
      : [],
    predicateTypeFilterRows: PREDICATE_TYPE_FILTER_OPTIONS.map((filter) => ({
      label: structuredPredicateTypeFilterLabel(filter),
      value: filter,
    })),
    predicateVisibilityRows: schemaPredicateControls.map((predicate) => ({
      label: localPredicateLabel(predicate),
      predicate,
      visible: !hiddenPredicates.has(predicate),
    })),
    predicateVisibilityTool: projectStructuredPredicateVisibilityTool(),
    searchField: projectStructuredSearchField(),
    showNamespaceSwitch: hasSchemaPredicateControls,
    showPredicateVisibilityTool: hasSchemaPredicateControls,
    showSortTool: hasSchemaPredicateControls,
    sortRows,
    sortOptionRows: projectStructuredSortOptionRows(sortRows),
    sortTool,
    sortToolLabel: sortTool.label,
    structuredTools: projectStructuredTools(),
    vocabTermFilterRows: VOCAB_TERM_FILTER_OPTIONS.map((filter) => ({
      label: structuredVocabTermFilterLabel(filter),
      value: filter,
    })),
  }
}
