import type { StructuredVocabTermDefinition, VocabTermProposal } from '../../domain/structured/structured-table'
import { localPredicateLabel, readablePredicateLabel } from '../../domain/structured/structured-table-vocab'
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
      title: '保存中…',
    }
  }
  if (status === 'error') {
    return {
      ariaLabel: '视图配置未同步，点击重试',
      kind: 'error' as const,
      retryable: true,
      title: error || '没保存成功，点一下重试',
    }
  }
  return {
    ariaLabel: '视图配置尚未同步',
    kind: 'dirty' as const,
    retryable: false,
    title: '等着保存',
  }
}

const EXTRA_VIEW_OPTIONS: Exclude<StructuredResourceViewMode, 'table'>[] = ['kanban', 'whiteboard', 'raw']
const PREDICATE_TYPE_FILTER_OPTIONS: StructuredPredicateTypeFilter[] = ['all', 'enum', 'boolean', 'number', 'date', 'relation', 'text']
const VOCAB_TERM_FILTER_OPTIONS: StructuredVocabTermFilter[] = ['all', 'defined', 'observed']
const VIEW_LABELS: Record<StructuredResourceViewMode, string> = {
  table: '表格',
  kanban: '看板',
  whiteboard: '白板',
  raw: '原文',
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
    closable: value !== 'table',
    closeLabel: `关闭 ${VIEW_LABELS[value]} 视图`,
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
    headingLabel: '当前类型',
  }
}

function projectStructuredSearchField() {
  return {
    placeholder: '搜索卡片',
  }
}

function projectStructuredFilterTool() {
  return {
    ariaLabel: '筛选',
  }
}

function projectStructuredFilterSectionLabels() {
  return {
    subject: '行',
    namespace: '列 · 命名空间',
    predicateType: '列 · 值的类型',
    vocabTerm: '列 · 词表定义',
  }
}

function projectStructuredClassCreateControl(classCreateOpen: boolean) {
  return {
    ariaLabel: '创建类型',
    expanded: classCreateOpen,
    inputAriaLabel: '新类型的地址',
    placeholder: 'udfs:Note',
    stateLabel: classCreateOpen ? '收起' : '展开',
    submitLabel: '创建',
    toggleLabel: '创建类型',
    uriLabel: '类型的地址',
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

const PREDICATE_TYPE_LABELS: Record<Exclude<StructuredPredicateTypeFilter, 'all'>, string> = {
  enum: '选项',
  boolean: '是 / 否',
  number: '数字',
  date: '日期',
  relation: '联系人或卡片',
  text: '文字',
}

function structuredPredicateTypeFilterLabel(filter: StructuredPredicateTypeFilter) {
  if (filter === 'all') return '全部类型'
  return PREDICATE_TYPE_LABELS[filter]
}

function structuredVocabTermFilterLabel(filter: StructuredVocabTermFilter) {
  if (filter === 'all') return '全部词表定义'
  if (filter === 'defined') return '已定义的属性'
  return '仅数据里出现的属性'
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
    { id: 'warningRowsOnly' as const, checked: warningRowsOnly, label: '有校验提醒的行' },
    { id: 'pendingWritesOnly' as const, checked: pendingWritesOnly, label: '有待确认更改的行' },
    { id: 'sourceUpdatesOnly' as const, checked: sourceUpdatesOnly, label: '有导入更新的行' },
  ]
}

function structuredSortToolLabel(
  sortKey: string | null | undefined,
  sortDirection: 'asc' | 'desc',
  predicateLabel: PredicateLabeler,
) {
  if (!sortKey) return '排序'
  if (sortKey === 'subject') return `名称 ${sortDirection === 'desc' ? '降序' : '升序'}`
  return `${predicateLabel(sortKey)} ${sortDirection === 'desc' ? '降序' : '升序'}`
}

function projectStructuredSortTool({
  predicateLabel,
  sortDirection,
  sortKey,
}: {
  predicateLabel: PredicateLabeler
  sortDirection: 'asc' | 'desc'
  sortKey: string | null
}) {
  const label = structuredSortToolLabel(sortKey, sortDirection, predicateLabel)
  return {
    active: Boolean(sortKey),
    ariaLabel: '排序',
    iconKind: sortKey ? sortDirection : 'none',
    label,
  }
}

function projectStructuredSortRows(schemaPredicateControls: readonly string[], predicateLabel: PredicateLabeler) {
  return [
    { label: '名称', sortKey: 'subject' },
    ...schemaPredicateControls.map((sortKey) => ({
      label: predicateLabel(sortKey),
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
    ariaLabel: '列显示',
  }
}

function projectStructuredNamespaceFilterRows(
  availablePredicateNamespaces: readonly string[],
  predicateNamespaceFilter: string | null,
) {
  return [
    { label: '全部命名空间', value: null, checked: predicateNamespaceFilter === null },
    ...availablePredicateNamespaces.map((namespace) => ({
      label: namespace,
      value: namespace,
      checked: namespace === predicateNamespaceFilter,
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
    ? '不同类型不混排。'
    : '先选择或创建类型，再添加行。')
  return {
    headingLabel: classDefinition?.label || null,
    rows: [
      { key: 'scope', text: '此视图只展示该类型的属性。' },
      { key: 'description', text: `描述：${description}` },
      ...(classDefinition?.status ? [{ key: 'status', text: `状态：${classDefinition.status}` }] : []),
    ],
    uri: classDefinition?.uri ?? selectedClassName ?? '未选择类型',
  }
}

type PredicateLabeler = (predicate: string) => string

export function projectStructuredResourceToolbarModel({
  predicateLabel = readablePredicateLabel,
  availablePredicateNamespaces,
  classCreateOpen,
  classDefinition,
  classDefinitionOpen,
  classOptions,
  hiddenPredicates,
  openViews,
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
  /** The name shown for a property (its vocab label); defaults to the readable local name. */
  predicateLabel?: PredicateLabeler
  availablePredicateNamespaces: readonly string[]
  classCreateOpen: boolean
  classDefinition?: StructuredVocabTermDefinition
  classDefinitionOpen: boolean
  classOptions: readonly string[]
  hiddenPredicates: ReadonlySet<string>
  openViews: readonly StructuredResourceViewMode[]
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
    predicateLabel,
    sortDirection: structuredSortDirection,
    sortKey: structuredSortKey,
  })
  const sortRows = projectStructuredSortRows(schemaPredicateControls, predicateLabel)
  const namespaceSwitch = projectStructuredNamespaceSwitch(showNamespaces)
  return {
    activeViewTabRows: ([
      'table',
      ...openViews.filter((mode) => mode !== 'table'),
      ...(viewMode !== 'table' && !openViews.includes(viewMode) ? [viewMode] : []),
    ] as StructuredResourceViewMode[])
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
      .filter((mode) => mode !== viewMode && !openViews.includes(mode))
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
    namespaceFilterRows: projectStructuredNamespaceFilterRows(availablePredicateNamespaces, predicateNamespaceFilter),
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
            discardLabel: `放弃类型 ${label}`,
            displayLabel: `${label}*`,
            id: proposal.id,
            label,
            openApprovalLabel: approvalResourceUri ? `打开类型审批记录 ${label}` : null,
            status: proposal.status,
            submitLabel: proposal.status === 'pending' ? '提交待确认类型 *' : null,
            uri: proposal.uri,
          }
        })
      : [],
    predicateTypeFilterRows: PREDICATE_TYPE_FILTER_OPTIONS.map((filter) => ({
      checked: filter === predicateTypeFilter,
      label: structuredPredicateTypeFilterLabel(filter),
      value: filter,
    })),
    predicateVisibilityRows: schemaPredicateControls.map((predicate) => ({
      label: predicateLabel(predicate),
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
      checked: filter === vocabTermFilter,
      label: structuredVocabTermFilterLabel(filter),
      value: filter,
    })),
  }
}
