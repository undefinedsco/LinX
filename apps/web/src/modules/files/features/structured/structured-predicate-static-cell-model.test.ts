import { describe, expect, it } from 'vitest'

import type {
  StructuredVocabPredicateDefinition,
  VocabTermProposal,
} from '../../domain/structured/structured-table'
import { projectStructuredPredicateStaticCellDisplay } from './structured-predicate-static-cell-model'

const documentUri = 'https://pod.example/.data/tasks.ttl'
const predicate = 'https://undefineds.co/vocab/reviewStatus'

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

describe('structured predicate static cell model', () => {
  it('projects editable boolean, enum, relation, and scalar display models outside the renderer', () => {
    expect(projectStructuredPredicateStaticCellDisplay({
      documentUri,
      editable: true,
      predicate,
      proposals: [],
      values: ['true'],
    })).toEqual({
      kind: 'boolean',
      toggle: {
        ariaLabel: '切换布尔值 true',
        pressed: true,
        title: 'true',
      },
      editable: true,
      value: 'true',
    })

    expect(projectStructuredPredicateStaticCellDisplay({
      definition: { valueType: 'enum' } as StructuredVocabPredicateDefinition,
      documentUri,
      editable: true,
      predicate,
      proposals: [vocabTermProposal()],
      values: ['"Review"'],
    })).toEqual({
      kind: 'enum',
      labels: ['Review*'],
    })

    expect(projectStructuredPredicateStaticCellDisplay({
      documentUri,
      editable: true,
      predicate,
      proposals: [],
      values: ['<https://external.example/doc>'],
    })).toEqual({
      kind: 'relation',
      values: [
        {
          value: 'https://external.example/doc',
          displayLabel: 'doc',
          external: true,
          openAction: {
            ariaLabel: 'Open URL https://external.example/doc',
            external: true,
            title: 'https://external.example/doc',
            value: 'https://external.example/doc',
          },
        },
      ],
    })

    expect(projectStructuredPredicateStaticCellDisplay({
      documentUri,
      editable: true,
      predicate,
      proposals: [],
      values: ['linx:Todo'],
    })).toEqual({
      kind: 'relation',
      values: [
        {
          value: 'linx:Todo',
          displayLabel: 'Todo',
          external: false,
          openAction: {
            ariaLabel: 'Open predicate linx:Todo',
            external: false,
            title: 'linx:Todo',
            value: 'linx:Todo',
          },
        },
      ],
    })

    expect(projectStructuredPredicateStaticCellDisplay({
      documentUri,
      editable: false,
      predicate,
      proposals: [],
      values: ['"Done"'],
    })).toEqual({
      kind: 'scalar',
      labels: ['Done'],
    })
  })

  it('projects readonly booleans as disabled toggle displays', () => {
    expect(projectStructuredPredicateStaticCellDisplay({
      documentUri,
      editable: false,
      predicate,
      proposals: [],
      values: ['false'],
    })).toEqual({
      kind: 'boolean',
      toggle: {
        ariaLabel: '切换布尔值 false',
        pressed: false,
        title: 'false',
      },
      editable: false,
      value: 'false',
    })
  })

  it('projects typed boolean literals as toggle displays', () => {
    expect(projectStructuredPredicateStaticCellDisplay({
      documentUri,
      editable: true,
      predicate,
      proposals: [],
      values: ['"false"^^xsd:boolean'],
    })).toEqual({
      kind: 'boolean',
      toggle: {
        ariaLabel: '切换布尔值 false',
        pressed: false,
        title: 'false',
      },
      editable: true,
      value: 'false',
    })
  })
})
