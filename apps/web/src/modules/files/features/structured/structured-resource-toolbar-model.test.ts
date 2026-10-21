import { describe, expect, it } from 'vitest'

import type { VocabTermProposal } from '../../domain/structured/structured-table'
import {
  projectStructuredResourceToolbarModel,
  projectStructuredViewSaveIndicator,
} from './structured-resource-toolbar-model'

function vocabTermProposal(overrides: Partial<VocabTermProposal> = {}): VocabTermProposal {
  return {
    id: 'proposal-class',
    kind: 'vocab-term-proposal',
    status: 'pending',
    operation: 'create',
    documentUri: 'https://pod.example/.data/tasks.ttl',
    proposalResourceUri: 'https://pod.example/.data/proposals/class.ttl#proposal',
    targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
    targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
    classScope: null,
    termUri: 'https://pod.example/.vocab/terms.ttl#Task',
    termKind: 'class',
    label: 'Task',
    valueType: 'class',
    description: '',
    shape: '',
    createdAt: '2026-06-30T00:00:00.000Z',
    writesCanonicalVocab: false,
    ...overrides,
  }
}

describe('projectStructuredResourceToolbarModel', () => {
  it('projects compact durable view metadata save states', () => {
    expect(projectStructuredViewSaveIndicator('synced', null)).toBeNull()
    expect(projectStructuredViewSaveIndicator('saving', null)).toEqual({
      ariaLabel: '正在同步视图配置',
      kind: 'saving',
      retryable: false,
      title: '保存中…',
    })
    expect(projectStructuredViewSaveIndicator('error', 'network unavailable')).toEqual({
      ariaLabel: '视图配置未同步，点击重试',
      kind: 'error',
      retryable: true,
      title: 'network unavailable',
    })
  })
  it('projects toolbar filters, views, sort rows, class options, and pending class proposals outside the renderer', () => {
    const approvalProposal = vocabTermProposal({
      proposalResourceUri: 'https://pod.example/.data/proposals/accepted.ttl#proposal',
      targetVocabUri: 'https://pod.example/.vocab/classes.ttl',
    })

    expect(projectStructuredResourceToolbarModel({
      availablePredicateNamespaces: ['https://schema.org/', 'https://undefineds.co/vocab/'],
      classDefinition: {
        uri: 'https://schema.org/Task',
        label: 'Task',
        description: 'Cards grouped as tasks',
        status: 'defined',
      },
      classCreateOpen: true,
      classDefinitionOpen: true,
      classOptions: ['rdf:type', 'https://schema.org/Task'],
      hiddenPredicates: new Set(['https://schema.org/dateCreated']),
      openViews: ['kanban'],
      pendingWritesOnly: false,
      predicateNamespaceFilter: 'https://schema.org/',
      predicateTypeFilter: 'relation',
      schemaPredicateControls: ['https://schema.org/dateCreated', 'https://schema.org/name'],
      selectedClassName: 'https://schema.org/Task',
      showNamespaces: false,
      sourceUpdatesOnly: false,
      structuredSortDirection: 'desc',
      structuredSortKey: 'https://schema.org/dateCreated',
      structuredWritesSupported: true,
      viewMode: 'kanban',
      visiblePendingClassProposals: [
        {
          id: 'draft-class',
          label: '',
          uri: 'https://schema.org/DraftTask',
          status: 'pending',
        },
        {
          id: 'accepted-class',
          label: 'Accepted',
          uri: 'https://schema.org/AcceptedTask',
          status: 'approval-staged',
          vocabProposal: approvalProposal,
        },
      ],
      vocabTermFilter: 'defined',
      warningRowsOnly: true,
    })).toEqual({
      activeViewTabRows: [
        { value: 'table', label: '表格', active: false, closable: false, closeLabel: '关闭 表格 视图' },
        { value: 'kanban', label: '看板', active: true, closable: true, closeLabel: '关闭 看板 视图' },
      ],
      availablePredicateNamespaces: ['https://schema.org/', 'https://undefineds.co/vocab/'],
      byline: {
        ariaLabel: '结构化资源信息',
      },
      classOptions: [
        { label: 'type', uri: 'rdf:type' },
        { label: 'Task', uri: 'https://schema.org/Task' },
      ],
      classScopeMenu: {
        headingLabel: '当前类型',
      },
      classCreateControl: {
        ariaLabel: '创建类型',
        expanded: true,
        inputAriaLabel: '新类型的地址',
        placeholder: 'udfs:Note',
        stateLabel: '收起',
        submitLabel: '创建',
        toggleLabel: '创建类型',
        uriLabel: '类型的地址',
      },
      classDefinitionPanel: {
        headingLabel: 'Task',
        rows: [
          { key: 'scope', text: '此视图只展示该类型的属性。' },
          { key: 'description', text: '描述：Cards grouped as tasks' },
          { key: 'status', text: '状态：defined' },
        ],
        uri: 'https://schema.org/Task',
      },
      classDefinitionControl: {
        ariaLabel: '定义',
        expanded: true,
        stateLabel: '收起',
        toggleLabel: '定义',
      },
      extraViewOptionRows: [
        { value: 'whiteboard', label: '白板' },
        { value: 'raw', label: '原文' },
      ],
      extraViewTrigger: {
        ariaLabel: '+ 视图',
        label: '视图',
      },
      filterSectionLabels: {
        subject: '行',
        namespace: '列 · 命名空间',
        predicateType: '列 · 值的类型',
        vocabTerm: '列 · 词表定义',
      },
      hasActiveFilters: true,
      filterTool: {
        ariaLabel: '筛选',
      },
      searchField: {
        placeholder: '搜索卡片',
      },
      structuredTools: {
        ariaLabel: '结构化表工具',
      },
      subjectFilterRows: [
        { id: 'warningRowsOnly', checked: true, label: '有校验提醒的行' },
        { id: 'pendingWritesOnly', checked: false, label: '有待确认更改的行' },
        { id: 'sourceUpdatesOnly', checked: false, label: '有导入更新的行' },
      ],
      namespaceSwitchChecked: false,
      namespaceSwitch: {
        ariaLabel: '显示命名空间',
        checked: false,
        nextValue: true,
        title: '命名空间',
      },
      namespaceFilterRows: [
        { value: null, label: '全部命名空间', checked: false },
        { value: 'https://schema.org/', label: 'https://schema.org/', checked: true },
        { value: 'https://undefineds.co/vocab/', label: 'https://undefineds.co/vocab/', checked: false },
      ],
      pendingClassProposals: [
        {
          approvalResourceUri: undefined,
          approvalStatusLabel: null,
          canOpenApproval: false,
          canSubmit: true,
          discardButtonLabel: '放弃',
          displayLabel: 'DraftTask*',
          discardLabel: '放弃类型 DraftTask',
          id: 'draft-class',
          label: 'DraftTask',
          openApprovalLabel: null,
          status: 'pending',
          submitLabel: '提交待确认类型 *',
          uri: 'https://schema.org/DraftTask',
        },
        {
          approvalResourceUri: 'https://pod.example/.data/proposals/accepted.ttl#proposal',
          approvalStatusLabel: '审批记录已准备',
          canOpenApproval: true,
          canSubmit: false,
          discardButtonLabel: '放弃',
          displayLabel: 'Accepted*',
          discardLabel: '放弃类型 Accepted',
          id: 'accepted-class',
          label: 'Accepted',
          openApprovalLabel: '打开类型审批记录 Accepted',
          status: 'approval-staged',
          submitLabel: null,
          uri: 'https://schema.org/AcceptedTask',
        },
      ],
      predicateTypeFilterRows: [
        { value: 'all', label: '全部类型', checked: false },
        { value: 'enum', label: '选项', checked: false },
        { value: 'boolean', label: '是 / 否', checked: false },
        { value: 'number', label: '数字', checked: false },
        { value: 'date', label: '日期', checked: false },
        { value: 'relation', label: '联系人或卡片', checked: true },
        { value: 'text', label: '文字', checked: false },
      ],
      predicateVisibilityRows: [
        { label: 'Date created', predicate: 'https://schema.org/dateCreated', visible: false },
        { label: 'Name', predicate: 'https://schema.org/name', visible: true },
      ],
      sortRows: [
        { label: '名称', sortKey: 'subject' },
        { label: 'Date created', sortKey: 'https://schema.org/dateCreated' },
        { label: 'Name', sortKey: 'https://schema.org/name' },
      ],
      sortOptionRows: [
        {
          label: '名称',
          sortKey: 'subject',
          choices: [
            { key: 'subject:asc', label: '名称 升序', sortDirection: 'asc', sortKey: 'subject' },
            { key: 'subject:desc', label: '名称 降序', sortDirection: 'desc', sortKey: 'subject' },
          ],
        },
        {
          label: 'Date created',
          sortKey: 'https://schema.org/dateCreated',
          choices: [
            {
              key: 'https://schema.org/dateCreated:asc',
              label: 'Date created 升序',
              sortDirection: 'asc',
              sortKey: 'https://schema.org/dateCreated',
            },
            {
              key: 'https://schema.org/dateCreated:desc',
              label: 'Date created 降序',
              sortDirection: 'desc',
              sortKey: 'https://schema.org/dateCreated',
            },
          ],
        },
        {
          label: 'Name',
          sortKey: 'https://schema.org/name',
          choices: [
            { key: 'https://schema.org/name:asc', label: 'Name 升序', sortDirection: 'asc', sortKey: 'https://schema.org/name' },
            { key: 'https://schema.org/name:desc', label: 'Name 降序', sortDirection: 'desc', sortKey: 'https://schema.org/name' },
          ],
        },
      ],
      showNamespaceSwitch: true,
      showPredicateVisibilityTool: true,
      predicateVisibilityTool: {
        ariaLabel: '列显示',
      },
      showSortTool: true,
      sortTool: {
        active: true,
        ariaLabel: '排序',
        iconKind: 'desc',
        label: 'Date created 降序',
      },
      sortToolLabel: 'Date created 降序',
      vocabTermFilterRows: [
        { value: 'all', label: '全部词表定义', checked: false },
        { value: 'defined', label: '已定义的属性', checked: true },
        { value: 'observed', label: '仅数据里出现的属性', checked: false },
      ],
    })
  })

  it('hides pending class proposal rows when structured writes are disabled', () => {
    const model = projectStructuredResourceToolbarModel({
      availablePredicateNamespaces: [],
      classCreateOpen: false,
      classDefinitionOpen: false,
      classOptions: [],
      hiddenPredicates: new Set(),
      openViews: [],
      pendingWritesOnly: false,
      predicateNamespaceFilter: null,
      predicateTypeFilter: 'all',
      schemaPredicateControls: [],
      selectedClassName: null,
      showNamespaces: true,
      sourceUpdatesOnly: false,
      structuredSortDirection: 'asc',
      structuredSortKey: null,
      structuredWritesSupported: false,
      viewMode: 'table',
      visiblePendingClassProposals: [
        {
          id: 'draft-class',
          label: 'Draft',
          uri: 'https://schema.org/Draft',
          status: 'pending',
        },
      ],
      vocabTermFilter: 'all',
      warningRowsOnly: false,
    })

    expect(model.hasActiveFilters).toBe(false)
    expect(model.byline).toEqual({
      ariaLabel: '结构化资源信息',
    })
    expect(model.subjectFilterRows).toEqual([
      { id: 'warningRowsOnly', checked: false, label: '有校验提醒的行' },
      { id: 'pendingWritesOnly', checked: false, label: '有待确认更改的行' },
      { id: 'sourceUpdatesOnly', checked: false, label: '有导入更新的行' },
    ])
    expect(model.classCreateControl).toEqual({
      ariaLabel: '创建类型',
      expanded: false,
      inputAriaLabel: '新类型的地址',
      placeholder: 'udfs:Note',
      stateLabel: '展开',
      submitLabel: '创建',
      toggleLabel: '创建类型',
      uriLabel: '类型的地址',
    })
    expect(model.classScopeMenu).toEqual({
      headingLabel: '当前类型',
    })
    expect(model.classDefinitionPanel).toEqual({
      headingLabel: null,
      rows: [
        { key: 'scope', text: '此视图只展示该类型的属性。' },
        { key: 'description', text: '描述：先选择或创建类型，再添加行。' },
      ],
      uri: '未选择类型',
    })
    expect(model.classDefinitionControl).toEqual({
      ariaLabel: '定义',
      expanded: false,
      stateLabel: '查看',
      toggleLabel: '定义',
    })
    expect(model.pendingClassProposals).toEqual([])
    expect(model.activeViewTabRows).toEqual([{ value: 'table', label: '表格', active: true, closable: false, closeLabel: '关闭 表格 视图' }])
    expect(model.extraViewOptionRows).toEqual([
      { value: 'kanban', label: '看板' },
      { value: 'whiteboard', label: '白板' },
      { value: 'raw', label: '原文' },
    ])
    expect(model.extraViewTrigger).toEqual({
      ariaLabel: '+ 视图',
      label: '视图',
    })
    expect(model.filterSectionLabels).toEqual({
      subject: '行',
      namespace: '列 · 命名空间',
      predicateType: '列 · 值的类型',
      vocabTerm: '列 · 词表定义',
    })
    expect(model.filterTool).toEqual({
      ariaLabel: '筛选',
    })
    expect(model.searchField).toEqual({
      placeholder: '搜索卡片',
    })
    expect(model.structuredTools).toEqual({
      ariaLabel: '结构化表工具',
    })
    expect(model.showNamespaceSwitch).toBe(false)
    expect(model.namespaceSwitch).toEqual({
      ariaLabel: '隐藏命名空间',
      checked: true,
      nextValue: false,
      title: '命名空间',
    })
    expect(model.showPredicateVisibilityTool).toBe(false)
    expect(model.predicateVisibilityTool).toEqual({
      ariaLabel: '列显示',
    })
    expect(model.showSortTool).toBe(false)
    expect(model.sortTool).toEqual({
      active: false,
      ariaLabel: '排序',
      iconKind: 'none',
      label: '排序',
    })
    expect(model.sortToolLabel).toBe('排序')
    expect(model.namespaceFilterRows).toEqual([
      { value: null, label: '全部命名空间', checked: true },
    ])
  })
})
