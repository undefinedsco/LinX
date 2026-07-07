import { describe, expect, it } from 'vitest'

import type { StructuredTableProjection, VocabTermProposal } from '../../domain/structured/structured-table'
import {
  projectStructuredDefinedPredicateHeaderChrome,
  projectStructuredPredicateColumnHeader,
  projectStructuredPredicateHeaderColumnModel,
  projectStructuredPendingPredicateHeaderChrome,
} from './structured-predicate-column-header-model'

const predicate = 'https://pod.example/.vocab/terms.ttl#reviewStatus'

function vocabTermProposal(overrides: Partial<VocabTermProposal> = {}): VocabTermProposal {
  return {
    id: 'proposal-status',
    kind: 'vocab-term-proposal',
    status: 'pending',
    operation: 'create',
    documentUri: 'https://pod.example/.data/tasks.ttl',
    proposalResourceUri: 'https://pod.example/.data/proposals/status.ttl#proposal',
    targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
    targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
    classScope: 'https://schema.example/Task',
    termUri: predicate,
    termKind: 'predicate',
    label: 'reviewStatus',
    valueType: 'enum',
    description: 'Review status.',
    shape: 'status shape',
    createdAt: '2026-06-30T00:00:00.000Z',
    writesCanonicalVocab: false,
    ...overrides,
  }
}

describe('projectStructuredPredicateColumnHeader', () => {
  it('projects defined predicate header labels without leaving vocab formatting in the renderer', () => {
    expect(projectStructuredPredicateColumnHeader({
      definition: {
        uri: predicate,
        label: 'reviewStatus',
        description: 'Review status.',
        status: 'active',
        valueType: 'enum',
        shape: 'status shape',
        shapeRules: [{
          uri: 'https://pod.example/.vocab/shapes.ttl#reviewStatus-required',
          label: 'Required',
          constraint: 'minCount 1',
        }],
      },
      observedValues: ['"Draft"', '"Ready"'],
      predicate,
    })).toEqual({
      kind: 'defined',
      description: 'Review status.',
      displayLabel: 'reviewStatus',
      label: 'reviewStatus',
      normalizedLabel: 'reviewStatus',
      observedValues: ['"Draft"', '"Ready"'],
      predicate,
      ruleText: 'minCount 1',
      shapeRuleActions: [{
        uri: 'https://pod.example/.vocab/shapes.ttl#reviewStatus-required',
        label: 'Required',
      }],
      statusLabel: 'active',
      typeLabel: 'enum',
    })
  })

  it('falls back predicate definition chrome from observed values when vocab definition is absent', () => {
    expect(projectStructuredPredicateColumnHeader({
      observedValues: ['42'],
      predicate,
    })).toMatchObject({
      kind: 'defined',
      description: '用于编辑、校验、选项和链接行为。',
      displayLabel: 'reviewStatus',
      normalizedLabel: 'reviewStatus',
      ruleText: '使用默认 predicate 规则',
      shapeRuleActions: [],
      statusLabel: '已识别',
      typeLabel: 'number',
    })
  })

  it('projects pending predicate proposal header data and workflow affordances', () => {
    const vocabProposal = vocabTermProposal()

    expect(projectStructuredPredicateColumnHeader({
      canCreateVocabTermProposal: false,
      observedValues: [],
      predicate,
      proposal: {
        id: 'pending-status',
        label: 'status*',
        uri: 'https://pod.example/.data/proposals/status.ttl#proposal',
        predicateUri: predicate,
        type: 'enum',
        description: 'Task status.',
        shape: 'status shape',
        enumOptions: ['Draft', 'Ready'],
        status: 'approval-staged',
        vocabProposal,
      },
    })).toEqual({
      kind: 'pending',
      description: 'Task status.',
      displayLabel: 'status*',
      label: 'status*',
      normalizedLabel: 'status',
      openableVocabProposal: vocabProposal,
      predicateUri: predicate,
      proposalUri: 'https://pod.example/.data/proposals/status.ttl#proposal',
      ruleText: 'status shape',
      shape: 'status shape',
      status: 'approval-staged',
      statusLabel: '等待 Inbox 审批',
      submitInline: true,
      type: 'enum',
      vocabProposal: {
        proposalResourceUri: 'https://pod.example/.data/proposals/status.ttl#proposal',
        targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
      },
    })
  })

  it('projects defined predicate header menu chrome outside the cell primitive', () => {
    expect(projectStructuredDefinedPredicateHeaderChrome({
      normalizedLabel: 'reviewStatus',
      shapeRuleActions: [{
        uri: 'https://pod.example/.vocab/shapes.ttl#reviewStatus-required',
        label: 'Required',
      }],
    })).toEqual({
      definitionTrigger: {
        ariaLabel: 'Open definition for reviewStatus',
      },
      menu: {
        actions: {
          copyPredicate: { label: '复制 predicate URI' },
          openPredicate: { label: '打开 predicate URI' },
          shapeRuleActions: [{
            uri: 'https://pod.example/.vocab/shapes.ttl#reviewStatus-required',
            label: '打开规则 Required',
          }],
        },
        actionsHeading: '链接操作',
        rows: {
          description: { label: '说明' },
          predicate: { label: 'predicate' },
          rule: { label: '规则与形状' },
          status: { label: '状态' },
        },
        title: 'Predicate 定义',
      },
      sortButton: {
        ariaLabel: 'Sort reviewStatus',
      },
    })
  })

  it('projects pending predicate header menu chrome outside the cell primitive', () => {
    expect(projectStructuredPendingPredicateHeaderChrome({
      hasVocabProposal: true,
      normalizedLabel: 'summary',
      status: 'pending',
    })).toEqual({
      menu: {
        actions: {
          discard: { label: '放弃 predicate' },
          openProposal: { label: '打开审批记录' },
          submit: { label: '提交审核' },
        },
        approvalNotice: '已提交审批记录；词表未变更。',
        rows: {
          approvalRecord: { label: '审批记录' },
          description: { label: '说明' },
          predicate: { label: 'predicate' },
          rule: { label: '规则与形状' },
          status: { label: '状态' },
          uri: { label: 'URI' },
        },
        title: '待确认 predicate',
      },
      trigger: {
        ariaLabel: '待确认 predicate summary',
      },
    })

    expect(projectStructuredPendingPredicateHeaderChrome({
      hasVocabProposal: false,
      normalizedLabel: 'summary',
      status: 'approval-staged',
    })).toMatchObject({
      menu: {
        actions: {
          openProposal: null,
          submit: null,
        },
        approvalNotice: null,
      },
    })
  })

  it('disables inline submit when vocab proposal creation is available', () => {
    const header = projectStructuredPredicateColumnHeader({
      canCreateVocabTermProposal: true,
      observedValues: [],
      predicate,
      proposal: {
        id: 'pending-status',
        label: 'status*',
        uri: 'https://pod.example/.data/proposals/status.ttl#proposal',
        type: 'enum',
        description: '',
        shape: '',
        enumOptions: [],
        status: 'pending',
      },
    })

    expect(header).toMatchObject({
      kind: 'pending',
      submitInline: false,
      vocabProposal: undefined,
      openableVocabProposal: undefined,
    })
  })

  it('projects predicate column labels and observed values next to the header model owner', () => {
    const projectionWithStatus: StructuredTableProjection = {
      prefixes: {},
      predicates: ['https://schema.org/status'],
      rows: [
        {
          subject: '#TaskA',
          cells: [
            { predicate: 'https://schema.org/status', values: ['"Draft"'] },
          ],
        },
        {
          subject: '#TaskB',
          cells: [
            { predicate: 'https://schema.org/status', values: ['"Review"', '"Blocked"'] },
          ],
        },
      ],
      warnings: [],
    }

    expect(projectStructuredPredicateHeaderColumnModel({
      predicate: 'https://schema.org/status',
      projection: projectionWithStatus,
      proposal: undefined,
      showNamespaces: false,
    })).toEqual({
      label: 'status',
      actionLabel: 'status',
      observedValues: ['"Draft"', '"Review"', '"Blocked"'],
    })
    expect(projectStructuredPredicateHeaderColumnModel({
      predicate: 'https://schema.org/status',
      projection: projectionWithStatus,
      proposal: { label: 'Workflow status' },
      showNamespaces: true,
    })).toEqual({
      label: 'Workflow status',
      actionLabel: 'Workflow status*',
      observedValues: ['"Draft"', '"Review"', '"Blocked"'],
    })
  })
})
