import { describe, expect, it } from 'vitest'

import {
  createVocabTermProposal,
  type StructuredVocabDefinitionIndex,
  type VocabTermProposal,
} from '../../domain/structured/structured-table'
import {
  createPredicateDefinitionDraft,
  type PredicateDefinitionDraft,
} from '../../domain/structured/structured-predicate-draft'
import type { StructuredPredicateColumnProposal } from './StructuredPredicateColumnHeader'
import {
  createStructuredPendingPredicateColumnsState,
  createStructuredPendingPredicateApprovalProposal,
  createStructuredPendingPredicateColumnProposalFromDraft,
  findStructuredVisiblePendingPredicateProposal,
  projectApprovedStructuredPendingPredicateColumnsState,
  projectDiscardedPendingPredicateProposals,
  projectDiscardedStructuredPendingPredicateColumnsState,
  projectDismissedHydratedPredicateProposalIds,
  projectApprovedStructuredPendingPredicateProposals,
  projectPendingPredicateApprovalProposal,
  projectPendingPredicateDiscardHydratedVocabProposal,
  projectStagedPendingPredicateProposals,
  projectStagedStructuredPendingPredicateColumnsState,
  projectStructuredPendingPredicateColumnsStateReset,
  projectStructuredPendingPredicateDefinition,
  projectStructuredPendingPredicateIds,
  projectStructuredPendingPredicateProposalByPredicate,
  projectStructuredVisiblePendingPredicateProposals,
  resolveVocabTermProposalResourceUriForPredicate,
} from './structured-pending-predicate-columns-model'

const documentUri = 'https://pod.example/.data/tasks.ttl'
const targetVocabUri = 'https://pod.example/.vocab/terms.ttl'
const targetShapesUri = 'https://pod.example/.vocab/shapes.ttl'

function vocabPredicateProposal(overrides: Partial<VocabTermProposal> = {}): VocabTermProposal {
  return {
    ...createVocabTermProposal({
      documentUri,
      classScope: 'udfs:Task',
      termUri: `${targetVocabUri}#ReviewStatus`,
      termKind: 'predicate',
      label: 'Review status',
      valueType: 'enum',
      description: 'Approval state',
      shape: 'option Ready · option Blocked',
      predicate: 'reviewStatus',
      targetVocabUri,
      targetShapesUri,
      createdAt: '2026-06-30T00:00:00.000Z',
    }),
    ...overrides,
  }
}

function pendingPredicateProposal(overrides: Partial<StructuredPredicateColumnProposal> = {}): StructuredPredicateColumnProposal {
  return {
    id: 'reviewStatus',
    label: 'Review status',
    uri: `${targetVocabUri}#ReviewStatus`,
    predicateUri: 'reviewStatus',
    type: 'enum',
    description: 'Approval state',
    shape: 'option Ready · option Blocked',
    enumOptions: ['Ready', 'Blocked'],
    status: 'pending',
    ...overrides,
  }
}

function predicateDraft(overrides: Partial<PredicateDefinitionDraft> = {}): PredicateDefinitionDraft {
  return {
    ...createPredicateDefinitionDraft('udfs:Task'),
    namespace: 'udfs',
    localName: 'reviewStatus',
    type: 'enum',
    enumOptions: 'Ready\nBlocked',
    required: true,
    ...overrides,
  }
}

describe('structured pending predicate columns model', () => {
  it('projects local pending columns and hydrated dismissal as one controller state', () => {
    const initial = createStructuredPendingPredicateColumnsState()
    const localReviewStatus = pendingPredicateProposal()

    expect(initial).toEqual({
      dismissedHydratedPredicateProposalIds: new Set(),
      pendingPredicateProposals: [],
    })

    const staged = projectStagedStructuredPendingPredicateColumnsState({
      current: initial,
      proposal: localReviewStatus,
    })
    expect(staged).toEqual({
      dismissedHydratedPredicateProposalIds: new Set(),
      pendingPredicateProposals: [localReviewStatus],
    })

    const vocabProposal = createStructuredPendingPredicateApprovalProposal({
      classScope: 'udfs:Task',
      documentUri,
      proposal: localReviewStatus,
      targetVocabUri,
    })
    const approved = projectApprovedStructuredPendingPredicateColumnsState({
      current: staged,
      proposalId: localReviewStatus.id,
      vocabProposal,
    })
    expect(approved.pendingPredicateProposals[0]).toMatchObject({
      id: 'reviewStatus',
      status: 'approval-staged',
      vocabProposal,
    })

    const hydratedReviewStatus = {
      ...pendingPredicateProposal({ status: 'approval-staged' }),
      vocabProposal: vocabPredicateProposal(),
    } satisfies StructuredPredicateColumnProposal
    const discarded = projectDiscardedStructuredPendingPredicateColumnsState({
      current: approved,
      predicate: 'reviewStatus',
      visiblePendingPredicateProposals: [hydratedReviewStatus],
    })
    expect(discarded).toEqual({
      dismissedHydratedPredicateProposalIds: new Set([hydratedReviewStatus.vocabProposal.id]),
      pendingPredicateProposals: [],
    })

    expect(projectStructuredPendingPredicateColumnsStateReset(discarded)).toEqual(initial)
  })

  it('projects visible pending predicate proposals from hydrated vocab proposals and local staged proposals', () => {
    const hydratedReviewStatus = vocabPredicateProposal()
    const hydratedPriority = vocabPredicateProposal({
      id: 'proposal-priority',
      termUri: `${targetVocabUri}#Priority`,
      label: 'Priority from vocab',
      predicate: 'priority',
      valueType: 'text',
      shape: '',
    })
    const wrongClass = vocabPredicateProposal({
      id: 'proposal-note-status',
      classScope: 'udfs:Note',
      termUri: `${targetVocabUri}#NoteStatus`,
      label: 'Note status',
      predicate: 'noteStatus',
    })
    const dismissed = vocabPredicateProposal({
      id: 'proposal-dismissed',
      termUri: `${targetVocabUri}#Dismissed`,
      label: 'Dismissed',
      predicate: 'dismissed',
    })
    const localPriority = pendingPredicateProposal({
      id: 'priority',
      label: 'Priority local',
      uri: `${targetVocabUri}#Priority`,
      predicateUri: 'priority',
      type: 'text',
      description: 'Local staged priority',
      shape: '',
      enumOptions: [],
    })

    const visible = projectStructuredVisiblePendingPredicateProposals({
      classScope: 'udfs:Task',
      dismissedHydratedPredicateProposalIds: new Set([dismissed.id]),
      documentUri,
      pendingPredicateProposals: [localPriority],
      projectionPredicates: ['reviewStatus'],
      reviewableVocabProposals: [
        hydratedReviewStatus,
        hydratedPriority,
        wrongClass,
        dismissed,
      ],
    })

    expect(visible.map((proposal) => proposal.id)).toEqual(['reviewStatus', 'priority'])
    expect(visible[0]).toMatchObject({
      id: 'reviewStatus',
      label: 'Review status',
      uri: `${targetVocabUri}#ReviewStatus`,
      predicateUri: 'reviewStatus',
      type: 'enum',
      enumOptions: ['Ready', 'Blocked'],
      status: 'approval-staged',
      vocabProposal: hydratedReviewStatus,
    })
    expect(visible[1]).toMatchObject({
      id: 'priority',
      label: 'Priority local',
      status: 'pending',
    })
    expect(projectStructuredPendingPredicateIds(visible)).toEqual(['reviewStatus', 'priority'])
  })

  it('creates a pending predicate column proposal from a draft and rejects duplicate local identities', () => {
    const proposal = createStructuredPendingPredicateColumnProposalFromDraft({
      currentPodRootUri: 'https://pod.example/',
      documentUri,
      draft: predicateDraft({ description: '' }),
      projectionPredicates: ['title'],
      targetVocabUri,
      visiblePendingPredicateProposals: [],
      vocabNamespaces: new Map([['udfs', 'https://undefineds.co/vocab/']]),
    })

    expect(proposal).toMatchObject({
      id: 'https://undefineds.co/vocab/reviewStatus',
      label: 'reviewStatus',
      uri: `${targetVocabUri}#reviewstatus`,
      predicateUri: 'https://undefineds.co/vocab/reviewStatus',
      type: 'enum',
      description: 'Local field proposal; vocabulary is unchanged until approval.',
      enumOptions: ['Ready', 'Blocked'],
      status: 'pending',
    })
    expect(proposal?.shape).toContain('class udfs:Task')
    expect(proposal?.shape).toContain('required')
    expect(proposal?.shape).toContain('option Ready')

    expect(projectStagedPendingPredicateProposals({
      pendingPredicateProposals: [],
      proposal: proposal!,
    })).toEqual([proposal])

    expect(createStructuredPendingPredicateColumnProposalFromDraft({
      currentPodRootUri: 'https://pod.example/',
      documentUri,
      draft: predicateDraft(),
      projectionPredicates: ['reviewStatus'],
      targetVocabUri,
      visiblePendingPredicateProposals: [],
      vocabNamespaces: new Map([['udfs', 'https://undefineds.co/vocab/']]),
    })).toBeNull()
  })

  it('creates vocab approval proposals and projects saved approval metadata back onto local columns', () => {
    const pending = pendingPredicateProposal()
    const other = pendingPredicateProposal({
      id: 'priority',
      label: 'Priority',
      uri: `${targetVocabUri}#Priority`,
      predicateUri: 'priority',
      type: 'text',
      description: 'Priority level',
      shape: '',
      enumOptions: [],
    })
    const vocabProposal = createStructuredPendingPredicateApprovalProposal({
      classScope: 'udfs:Task',
      currentPodRootUri: 'https://pod.example/',
      documentUri,
      proposal: pending,
      targetShapesUri,
      targetVocabUri,
    })

    expect(vocabProposal).toMatchObject({
      classScope: 'udfs:Task',
      termKind: 'predicate',
      termUri: `${targetVocabUri}#ReviewStatus`,
      predicate: 'reviewStatus',
      label: 'Review status',
      valueType: 'enum',
      writesCanonicalVocab: false,
    })

    expect(projectPendingPredicateApprovalProposal({
      pendingPredicateProposals: [pending, other],
      predicate: 'https://example.test/vocab/reviewStatus',
    })).toEqual(pending)

    expect(projectApprovedStructuredPendingPredicateProposals({
      pendingPredicateProposals: [pending],
      proposalId: pending.id,
      vocabProposal,
    })).toEqual([{
      ...pending,
      id: 'reviewStatus',
      uri: `${targetVocabUri}#ReviewStatus`,
      predicateUri: 'reviewStatus',
      status: 'approval-staged',
      vocabProposal,
    }])
  })

  it('projects local discard plans for pending and hydrated predicate proposals', () => {
    const localReviewStatus = pendingPredicateProposal()
    const localPriority = pendingPredicateProposal({
      id: 'priority',
      label: 'Priority',
      uri: `${targetVocabUri}#Priority`,
      predicateUri: 'priority',
      type: 'text',
      description: 'Priority level',
      shape: '',
      enumOptions: [],
    })
    const hydratedReviewStatus = {
      ...pendingPredicateProposal({ status: 'approval-staged' }),
      vocabProposal: vocabPredicateProposal(),
    } satisfies StructuredPredicateColumnProposal

    expect(projectDiscardedPendingPredicateProposals({
      pendingPredicateProposals: [localReviewStatus, localPriority],
      predicate: 'reviewStatus',
    })).toEqual([localPriority])

    expect(projectPendingPredicateDiscardHydratedVocabProposal({
      predicate: 'reviewStatus',
      visiblePendingPredicateProposals: [hydratedReviewStatus, localPriority],
    })).toEqual(hydratedReviewStatus.vocabProposal)

    expect(projectDismissedHydratedPredicateProposalIds({
      currentIds: new Set(['proposal-existing']),
      proposalId: hydratedReviewStatus.vocabProposal.id,
    })).toEqual(new Set(['proposal-existing', hydratedReviewStatus.vocabProposal.id]))
  })

  it('resolves pending proposals and predicate definitions by exact or local identity', () => {
    const hydrated = vocabPredicateProposal({
      predicate: 'https://undefineds.co/vocab/reviewStatus',
    })
    const visible = projectStructuredVisiblePendingPredicateProposals({
      classScope: 'udfs:Task',
      dismissedHydratedPredicateProposalIds: new Set(),
      documentUri,
      pendingPredicateProposals: [],
      projectionPredicates: ['reviewStatus'],
      reviewableVocabProposals: [hydrated],
    })
    const byPredicate = projectStructuredPendingPredicateProposalByPredicate(visible)
    const index: StructuredVocabDefinitionIndex = {
      classes: new Map(),
      enumOptionsByPredicate: new Map(),
      namespaces: new Map(),
      predicates: new Map(),
      shapesByTerm: new Map(),
    }

    expect(findStructuredVisiblePendingPredicateProposal({
      predicate: 'https://undefineds.co/vocab/reviewStatus',
      visiblePendingPredicateProposals: visible,
    })?.id).toBe('reviewStatus')
    expect(resolveVocabTermProposalResourceUriForPredicate({
      pendingProposalByPredicate: byPredicate,
      predicate: 'https://undefineds.co/vocab/reviewStatus',
      visiblePendingPredicateProposals: visible,
    })).toBe(hydrated.proposalResourceUri)
    expect(projectStructuredPendingPredicateDefinition({
      predicate: 'https://undefineds.co/vocab/reviewStatus',
      visiblePendingPredicateProposals: visible,
      vocabDefinitionIndex: index,
    })).toMatchObject({
      uri: 'https://undefineds.co/vocab/reviewStatus',
      label: 'Review status',
      description: 'Approval state',
      status: 'approval-staged',
      valueType: 'enum',
      shape: 'option Ready · option Blocked',
      predicateUri: 'https://undefineds.co/vocab/reviewStatus',
      shapeRules: [],
    })
  })
})
