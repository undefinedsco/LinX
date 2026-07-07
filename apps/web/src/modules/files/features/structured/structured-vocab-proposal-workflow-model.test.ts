import { describe, expect, it } from 'vitest'

import {
  createVocabTermProposal,
  type VocabTermProposal,
} from '../../domain/structured/structured-table'
import {
  canStagePendingClassProposal,
  createStructuredVocabProposalWorkflowState,
  createPendingClassApprovalVocabProposal,
  createPendingClassProposal,
  createPendingClassProposalFromDraft,
  projectApprovedPendingClassProposalWorkflowState,
  projectDismissedReviewableVocabProposalIds,
  projectApprovedPendingClassProposal,
  projectDiscardedPendingClassProposalWorkflowState,
  projectDiscardedPendingClassProposals,
  projectDiscardedReviewableVocabProposalWorkflowState,
  projectDiscardedReviewableVocabProposals,
  projectPendingClassApprovalProposal,
  projectPendingClassDiscardHydratedVocabProposal,
  projectStagedPendingClassProposalWorkflowState,
  projectStagedPendingClassProposals,
  projectStoredLocalReviewableVocabProposalWorkflowState,
  projectStoredLocalReviewableVocabProposals,
  projectStructuredPendingClassScopeProposal,
  projectStructuredReviewableVocabProposals,
  projectStructuredVocabProposalWorkflowStateReset,
  projectStructuredVisiblePendingClassProposals,
  type PendingClassProposal,
} from './structured-vocab-proposal-workflow-model'

const documentUri = 'https://pod.example/.data/tasks.ttl'
const targetVocabUri = 'https://pod.example/.vocab/terms.ttl'
const targetShapesUri = 'https://pod.example/.vocab/shapes.ttl'

function vocabProposal(overrides: Partial<VocabTermProposal> = {}): VocabTermProposal {
  return {
    ...createVocabTermProposal({
      documentUri,
      termUri: 'https://pod.example/.vocab/terms.ttl#Task',
      termKind: 'class',
      label: 'Task',
      valueType: 'class',
      description: 'Task class.',
      shape: 'rdf:type scope',
      targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
      targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
      createdAt: '2026-06-30T00:00:00.000Z',
    }),
    ...overrides,
  }
}

describe('structured vocab proposal workflow model', () => {
  it('projects local class, local reviewable, and dismissal state as one workflow state', () => {
    const initial = createStructuredVocabProposalWorkflowState()
    const stagedClass = createPendingClassProposal(`${targetVocabUri}#Milestone`)

    expect(initial).toEqual({
      dismissedReviewableVocabProposalIds: new Set(),
      localReviewableVocabProposals: [],
      pendingClassProposals: [],
    })

    const staged = projectStagedPendingClassProposalWorkflowState({
      current: initial,
      proposal: stagedClass,
    })
    expect(staged.pendingClassProposals).toEqual([stagedClass])

    const saved = vocabProposal({
      id: 'proposal-milestone',
      termUri: stagedClass.uri,
      label: stagedClass.label,
    })
    const stored = projectStoredLocalReviewableVocabProposalWorkflowState({
      current: staged,
      proposal: saved,
    })
    expect(stored.localReviewableVocabProposals).toEqual([saved])

    const approved = projectApprovedPendingClassProposalWorkflowState({
      classUri: stagedClass.id,
      current: stored,
      vocabProposal: saved,
    })
    expect(approved.pendingClassProposals[0]).toMatchObject({
      id: saved.termUri,
      status: 'approval-staged',
      vocabProposal: saved,
    })

    const discardedClass = projectDiscardedPendingClassProposalWorkflowState({
      classUri: saved.termUri,
      current: approved,
      visiblePendingClassProposals: approved.pendingClassProposals,
    })
    expect(discardedClass).toEqual({
      dismissedReviewableVocabProposalIds: new Set([saved.id]),
      localReviewableVocabProposals: [saved],
      pendingClassProposals: [],
    })

    const discardedReviewable = projectDiscardedReviewableVocabProposalWorkflowState({
      current: discardedClass,
      proposalId: saved.id,
    })
    expect(discardedReviewable).toEqual({
      dismissedReviewableVocabProposalIds: new Set([saved.id]),
      localReviewableVocabProposals: [],
      pendingClassProposals: [],
    })

    expect(projectStructuredVocabProposalWorkflowStateReset(discardedReviewable)).toEqual(initial)
  })

  it('merges pending query and local reviewable vocab proposals while respecting dismissed ids', () => {
    const pendingTask = vocabProposal({
      id: 'proposal-task',
      label: 'Task from query',
    })
    const localTask = vocabProposal({
      id: 'proposal-task',
      label: 'Task from local state',
    })
    const localStatus = vocabProposal({
      id: 'proposal-status',
      termUri: 'https://pod.example/.vocab/terms.ttl#status',
      termKind: 'predicate',
      label: 'status',
      valueType: 'text',
    })

    expect(projectStructuredReviewableVocabProposals({
      dismissedProposalIds: new Set(['proposal-status']),
      localProposals: [localTask, localStatus],
      pendingProposals: [pendingTask],
    })).toEqual([localTask])
  })

  it('projects visible pending class proposals from reviewable vocab and local staged rows', () => {
    const approvedTask = vocabProposal({
      id: 'proposal-approved-task',
      termUri: 'https://pod.example/.vocab/terms.ttl#Task',
      label: 'Task',
    })
    const predicateProposal = vocabProposal({
      id: 'proposal-status',
      termUri: 'https://pod.example/.vocab/terms.ttl#status',
      termKind: 'predicate',
      label: 'status',
      valueType: 'text',
    })
    const stagedClass: PendingClassProposal = {
      id: 'https://pod.example/.vocab/terms.ttl#Draft',
      label: 'Draft',
      uri: 'https://pod.example/.vocab/terms.ttl#Draft',
      status: 'pending',
    }

    const visible = projectStructuredVisiblePendingClassProposals({
      pendingClassProposals: [stagedClass],
      reviewableVocabProposals: [approvedTask, predicateProposal],
    })

    expect(visible).toEqual([
      {
        id: 'https://pod.example/.vocab/terms.ttl#Task',
        label: 'Task',
        uri: 'https://pod.example/.vocab/terms.ttl#Task',
        status: 'approval-staged',
        vocabProposal: approvedTask,
      },
      stagedClass,
    ])
    expect(projectStructuredPendingClassScopeProposal({
      selectedClassName: 'https://pod.example/.vocab/terms.ttl#Task',
      visiblePendingClassProposals: visible,
    })).toEqual(visible[0])
  })

  it('rejects duplicate class proposals by exact URI or local label identity', () => {
    const existing = createPendingClassProposal('https://pod.example/.vocab/terms.ttl#Draft')

    expect(canStagePendingClassProposal({
      classOptions: ['https://schema.org/Task'],
      uri: 'schema:Task',
      visiblePendingClassProposals: [],
    })).toBe(false)
    expect(canStagePendingClassProposal({
      classOptions: [],
      uri: 'https://pod.example/.vocab/terms.ttl#Draft',
      visiblePendingClassProposals: [existing],
    })).toBe(false)
    expect(canStagePendingClassProposal({
      classOptions: ['https://schema.org/Task'],
      uri: 'https://pod.example/.vocab/terms.ttl#Milestone',
      visiblePendingClassProposals: [existing],
    })).toBe(true)
  })

  it('projects pending class draft, staging, local proposal storage, and approval RDF creation', () => {
    const existing = vocabProposal({ id: 'proposal-existing' })
    const staged = createPendingClassProposalFromDraft({
      classOptions: ['https://schema.org/Task'],
      currentPodRootUri: 'https://pod.example/',
      documentUri,
      draftUri: 'Milestone',
      targetVocabUri,
      visiblePendingClassProposals: [],
    })

    expect(staged).toEqual({
      id: `${targetVocabUri}#milestone`,
      label: 'milestone',
      uri: `${targetVocabUri}#milestone`,
      status: 'pending',
    })
    expect(createPendingClassProposalFromDraft({
      classOptions: ['https://schema.org/Task'],
      currentPodRootUri: 'https://pod.example/',
      documentUri,
      draftUri: 'Task',
      targetVocabUri,
      visiblePendingClassProposals: [],
    })).toBeNull()
    expect(projectStagedPendingClassProposals({
      pendingClassProposals: [],
      proposal: staged!,
    })).toEqual([staged])
    expect(projectStoredLocalReviewableVocabProposals({
      localProposals: [existing],
      proposal: existing,
    })).toEqual([existing])

    const saved = vocabProposal({
      id: 'proposal-milestone',
      termUri: staged!.uri,
      label: staged!.label,
    })
    expect(projectStoredLocalReviewableVocabProposals({
      localProposals: [existing],
      proposal: saved,
    })).toEqual([saved, existing])
    expect(projectPendingClassApprovalProposal({
      classUri: staged!.id,
      pendingClassProposals: [staged!],
    })).toEqual(staged)
    expect(createPendingClassApprovalVocabProposal({
      currentPodRootUri: 'https://pod.example/',
      documentUri,
      pendingClass: staged!,
      targetShapesUri,
      targetVocabUri,
    })).toMatchObject({
      documentUri,
      classScope: null,
      termUri: `${targetVocabUri}#milestone`,
      termKind: 'class',
      label: 'milestone',
      valueType: 'class',
      targetVocabUri,
      targetShapesUri,
      writesCanonicalVocab: false,
    })
  })

  it('projects approval-staged class proposal updates after vocab proposal creation', () => {
    const pending = createPendingClassProposal('https://pod.example/.vocab/terms.ttl#Draft')
    const savedProposal = vocabProposal({
      id: 'proposal-draft',
      termUri: 'https://pod.example/.vocab/terms.ttl#Draft',
      label: 'Draft',
    })

    expect(projectApprovedPendingClassProposal({
      classUri: pending.id,
      pendingClassProposals: [pending],
      vocabProposal: savedProposal,
    })).toEqual([{
      ...pending,
      id: savedProposal.termUri,
      uri: savedProposal.termUri,
      status: 'approval-staged',
      vocabProposal: savedProposal,
    }])
  })

  it('projects local discard plans for pending class and reviewable vocab proposals', () => {
    const pending = createPendingClassProposal('https://pod.example/.vocab/terms.ttl#Draft')
    const keep = createPendingClassProposal('https://pod.example/.vocab/terms.ttl#Keep')
    const hydrated = vocabProposal({
      id: 'proposal-draft',
      termUri: pending.id,
      label: 'Draft',
    })
    const other = vocabProposal({
      id: 'proposal-other',
      termUri: keep.id,
      label: 'Keep',
    })

    expect(projectDiscardedPendingClassProposals({
      classUri: pending.id,
      pendingClassProposals: [pending, keep],
    })).toEqual([keep])
    expect(projectPendingClassDiscardHydratedVocabProposal({
      classUri: pending.id,
      visiblePendingClassProposals: [
        {
          ...pending,
          status: 'approval-staged',
          vocabProposal: hydrated,
        },
        keep,
      ],
    })).toEqual(hydrated)
    expect(projectDiscardedReviewableVocabProposals({
      localProposals: [hydrated, other],
      proposalId: hydrated.id,
    })).toEqual([other])
    expect([...projectDismissedReviewableVocabProposalIds({
      currentIds: new Set(['existing']),
      proposalId: hydrated.id,
    })]).toEqual(['existing', hydrated.id])
  })
})
