import { describe, expect, it, vi } from 'vitest'

import type {
  StructuredTableProjection,
  VocabTermProposal,
} from '../../domain/structured/structured-table'
import type { StructuredProjectionTableRow } from './structured-projection-table-model'
import { projectStructuredPredicateActiveCellDisplay } from './structured-predicate-active-cell-model'

const documentUri = 'https://pod.example/.data/tasks.ttl'
const predicate = 'https://undefineds.co/vocab/reviewStatus'
const rowSubject = '#Task'

const projection: Pick<StructuredTableProjection, 'rows'> = {
  rows: [
    {
      subject: rowSubject,
      cells: [
        {
          predicate,
          values: ['"Todo"'],
        },
      ],
    },
  ],
}

function vocabTermProposal(overrides: Partial<VocabTermProposal> = {}): VocabTermProposal {
  return {
    id: 'proposal-review',
    kind: 'vocab-term-proposal',
    status: 'pending',
    operation: 'create',
    documentUri,
    proposalResourceUri: 'https://pod.example/.data/proposals/review.ttl#proposal',
    targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
    targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
    classScope: null,
    termUri: 'https://pod.example/.vocab/terms.ttl#Review',
    termKind: 'enum-option',
    label: 'Review',
    valueType: 'enum',
    description: '',
    shape: '',
    predicate,
    createdAt: '2026-06-30T00:00:00.000Z',
    writesCanonicalVocab: false,
    ...overrides,
  }
}

describe('structured predicate active cell model', () => {
  it('projects active text and relation editor display models outside the renderer', () => {
    expect(projectStructuredPredicateActiveCellDisplay({
      activeEnumCell: null,
      activeRelationCell: null,
      activeTextCell: {
        subject: rowSubject,
        predicate,
        kind: 'text',
        value: 'Review',
        commit: (next) => `"${next}"`,
      },
      documentUri,
      getEnumOptionsForPredicate: vi.fn(),
      hasCellWriteProposal: false,
      predicate,
      predicateLabel: 'Review status',
      projection,
      resolveEnumOptionTermUri: (label) => `https://pod.example/.vocab/terms.ttl#${label}`,
      reviewableVocabProposals: [],
      rowSubject,
      tableRows: [],
      values: ['"Todo"'],
    })).toEqual({
      kind: 'text',
      ariaLabel: '编辑 #Task 的 Review status',
      commitOnChange: false,
      editorKind: 'text',
      hasPendingProposal: true,
      value: 'Review',
    })

    expect(projectStructuredPredicateActiveCellDisplay({
      activeEnumCell: null,
      activeRelationCell: {
        subject: rowSubject,
        predicate,
        value: 'https://external.example/doc',
      },
      activeTextCell: null,
      documentUri,
      getEnumOptionsForPredicate: vi.fn(),
      hasCellWriteProposal: false,
      predicate,
      predicateLabel: 'Review status',
      projection,
      resolveEnumOptionTermUri: (label) => `https://pod.example/.vocab/terms.ttl#${label}`,
      reviewableVocabProposals: [],
      rowSubject,
      tableRows: [],
      values: ['<https://external.example/old>'],
    })).toEqual({
      kind: 'relation',
      ariaLabel: '编辑 #Task 的 Review status',
      clearAction: {
        ariaLabel: '清空 #Task 的 Review status',
      },
      hasPendingProposal: true,
      value: 'https://external.example/doc',
      values: [
        {
          value: 'https://external.example/old',
          displayLabel: 'old',
          external: true,
          openAction: {
            ariaLabel: 'Open URL https://external.example/old',
            external: true,
            title: 'https://external.example/old',
            value: 'https://external.example/old',
          },
        },
      ],
    })
  })

  it('projects active enum options, selected values, and listbox id outside the renderer', () => {
    const tableRows: StructuredProjectionTableRow[] = [
      {
        subject: rowSubject,
        cells: {
          [predicate]: ['"Todo"', '"Review"'],
        },
      },
    ]
    const pendingReview = vocabTermProposal()

    expect(projectStructuredPredicateActiveCellDisplay({
      activeEnumCell: {
        subject: rowSubject,
        predicate,
      },
      activeRelationCell: null,
      activeTextCell: null,
      documentUri,
      getEnumOptionsForPredicate: (_predicate, observedValues) => [
        ...observedValues.map((value) => value.replace(/^"|"$/g, '')),
        'Blocked',
      ],
      hasCellWriteProposal: false,
      predicate,
      predicateLabel: 'reviewStatus',
      projection,
      resolveEnumOptionTermUri: (label) => `https://pod.example/.vocab/terms.ttl#${label}`,
      reviewableVocabProposals: [pendingReview],
      rowSubject,
      tableRows,
      values: ['"Review"'],
    })).toEqual({
      kind: 'enum',
      ariaLabel: '编辑 #Task 的 reviewStatus',
      listboxId: 'options-https-pod-example-data-tasks-ttl--Task-https-undefineds-co-vocab-reviewStatus',
      options: [
        {
          label: 'Todo',
          pending: false,
          proposal: undefined,
          proposalResourceUri: undefined,
          targetVocabUri: undefined,
          termUri: 'https://pod.example/.vocab/terms.ttl#Todo',
          status: '已定义或已观察',
        },
        {
          label: 'Review',
          pending: true,
          termUri: 'https://pod.example/.vocab/terms.ttl#Review',
          status: '词表变更待确认',
          proposalResourceUri: 'https://pod.example/.data/proposals/review.ttl#proposal',
          targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
          proposal: pendingReview,
        },
        {
          label: 'Blocked',
          pending: false,
          proposal: undefined,
          proposalResourceUri: undefined,
          targetVocabUri: undefined,
          termUri: 'https://pod.example/.vocab/terms.ttl#Blocked',
          status: '已定义或已观察',
        },
      ],
      optionsLabel: '#Task 的 reviewStatus 选项',
      predicateLabel: 'reviewStatus',
      selectedValues: ['Review'],
      valueLabel: '#Task 的 reviewStatus',
    })
  })

  it('returns none when no active editor is available', () => {
    expect(projectStructuredPredicateActiveCellDisplay({
      activeEnumCell: null,
      activeRelationCell: null,
      activeTextCell: null,
      documentUri,
      getEnumOptionsForPredicate: vi.fn(),
      hasCellWriteProposal: false,
      predicate,
      predicateLabel: 'reviewStatus',
      projection,
      resolveEnumOptionTermUri: (label) => `https://pod.example/.vocab/terms.ttl#${label}`,
      reviewableVocabProposals: [],
      rowSubject,
      tableRows: [],
      values: [],
    })).toEqual({ kind: 'none' })
  })
})
