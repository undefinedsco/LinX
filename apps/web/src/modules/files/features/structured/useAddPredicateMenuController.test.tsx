import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { StructuredVocabDefinitionIndex } from '../../domain/structured/structured-table'
import type { PredicateDefinitionDraft } from '../../domain/structured/structured-predicate-draft'
import { useAddPredicateMenuController } from './useAddPredicateMenuController'

function vocabDefinitionIndex(): StructuredVocabDefinitionIndex {
  return {
    classes: new Map(),
    predicates: new Map([
      ['https://pod.example/.vocab/terms.ttl#reviewStatus', {
        uri: 'https://pod.example/.vocab/terms.ttl#reviewStatus',
        label: 'Review status',
        description: 'Approval state for a card',
        status: 'defined',
        valueType: 'enum',
        shape: 'option Ready',
        shapeRules: [],
      }],
    ]),
    enumOptionsByPredicate: new Map(),
    shapesByTerm: new Map(),
    namespaces: new Map(),
  }
}

describe('useAddPredicateMenuController', () => {
  it('owns predicate filtering, create draft seeding, and submit reset for the add menu workflow', () => {
    const onCreate = vi.fn<(draft: PredicateDefinitionDraft) => void>()
    const { result } = renderHook(() => useAddPredicateMenuController({
      documentUri: 'https://pod.example/.data/cards.ttl',
      predicates: [
        'https://pod.example/.vocab/terms.ttl#reviewStatus',
        'http://purl.org/dc/terms/title',
      ],
      vocabDefinitionIndex: vocabDefinitionIndex(),
      classScope: 'udfs:Card',
      currentPodRootUri: 'https://pod.example/',
      targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
      onCreate,
    }))

    expect(result.current.createOpen).toBe(false)
    expect(result.current.chrome).toEqual({
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
    })
    expect(result.current.definitionDetailsToggle).toEqual({
      ariaLabel: '展开 shape 和高级信息',
      expanded: false,
      indicator: '+',
      label: 'shape',
    })
    expect(result.current.hasVisibleExistingPredicates).toBe(true)
    expect(result.current.visibleExistingPredicates.map((row) => row.label)).toEqual(['Review status', 'title'])
    expect(result.current.visibleExistingPredicates[0]).toMatchObject({
      predicate: 'https://pod.example/.vocab/terms.ttl#reviewStatus',
      selectAriaLabel: '选择 predicate Review status',
      typeLabel: 'enum',
      description: 'Approval state for a card',
    })
    expect(result.current.draft.classScope).toBe('udfs:Card')
    expect(result.current.submitDisabled).toBe(true)
    expect(result.current.uriPreview).toEqual({
      label: 'URI 预览 · 填写 ns 和 term 后生成',
      title: undefined,
    })
    expect(result.current.valueTypeRows.map((row) => ({ value: row.value, selected: row.selected }))).toEqual([
      { value: 'text', selected: true },
      { value: 'number', selected: false },
      { value: 'date', selected: false },
      { value: 'boolean', selected: false },
      { value: 'enum', selected: false },
      { value: 'relation', selected: false },
      { value: 'url', selected: false },
    ])
    expect(result.current.showEnumOptionsEditor).toBe(false)

    act(() => result.current.setPredicateSearch('review'))
    expect(result.current.hasVisibleExistingPredicates).toBe(true)
    expect(result.current.visibleExistingPredicates.map((row) => row.predicate)).toEqual([
      'https://pod.example/.vocab/terms.ttl#reviewStatus',
    ])

    act(() => result.current.setPredicateSearch('missing'))
    expect(result.current.hasVisibleExistingPredicates).toBe(false)
    expect(result.current.visibleExistingPredicates).toEqual([])
    expect(result.current.createTriggerLabel).toBe('新建 "missing"')

    act(() => result.current.setPredicateSearch('<udfs:auditedBy>'))
    expect(result.current.createTriggerLabel).toBe('新建 "<udfs:auditedBy>"')
    act(() => result.current.openCreateFromSearch())

    expect(result.current.createOpen).toBe(true)
    expect(result.current.draft.localName).toBe('auditedBy')
    expect(result.current.draft.label).toBe('AuditedBy')
    expect(result.current.resolvedUri).toBe('https://pod.example/.vocab/terms.ttl#auditedby')
    expect(result.current.submitDisabled).toBe(false)
    expect(result.current.uriPreview).toEqual({
      label: 'URI 预览 · https://pod.example/.vocab/terms.ttl#auditedby',
      title: 'https://pod.example/.vocab/terms.ttl#auditedby',
    })

    act(() => result.current.updateDraft({ type: 'enum', enumOptions: 'Ready, Blocked' }))
    expect(result.current.valueTypeRows.find((row) => row.value === 'enum')?.selected).toBe(true)
    expect(result.current.showEnumOptionsEditor).toBe(true)
    act(() => result.current.toggleDefinitionDetails())
    expect(result.current.definitionDetailsOpen).toBe(true)
    expect(result.current.definitionDetailsToggle).toEqual({
      ariaLabel: '收起 shape 和高级信息',
      expanded: true,
      indicator: '-',
      label: 'shape',
    })

    act(() => result.current.submitDraft())

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      localName: 'auditedBy',
      type: 'enum',
      enumOptions: 'Ready, Blocked',
    }))
    expect(result.current.createOpen).toBe(false)
    expect(result.current.definitionDetailsOpen).toBe(false)
    expect(result.current.definitionDetailsToggle).toEqual({
      ariaLabel: '展开 shape 和高级信息',
      expanded: false,
      indicator: '+',
      label: 'shape',
    })
    expect(result.current.submitDisabled).toBe(true)
    expect(result.current.draft).toMatchObject({
      localName: '',
      type: 'text',
      classScope: 'udfs:Card',
    })
  })

  it('hydrates class scope only while the draft has not been customized', () => {
    const { result, rerender } = renderHook(
      ({ classScope }) => useAddPredicateMenuController({
        documentUri: 'https://pod.example/.data/cards.ttl',
        predicates: [],
        classScope,
        onCreate: vi.fn(),
      }),
      { initialProps: { classScope: null as string | null } },
    )

    expect(result.current.draft.classScope).toBe('')
    expect(result.current.createTriggerLabel).toBe('新建 predicate')

    rerender({ classScope: 'udfs:Card' })
    expect(result.current.draft.classScope).toBe('udfs:Card')

    act(() => result.current.updateDraft({ classScope: 'udfs:Note' }))
    rerender({ classScope: 'udfs:Task' })

    expect(result.current.draft.classScope).toBe('udfs:Note')
  })
})
