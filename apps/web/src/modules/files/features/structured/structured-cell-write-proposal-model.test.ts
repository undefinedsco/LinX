import { describe, expect, it } from 'vitest'

import { documentCellKey } from '../../domain/structured/structured-table-cell-model'
import {
  buildStructuredPersistedCellWriteProposalByKey,
  createStructuredCellWriteProposalWorkflowState,
  projectStructuredApprovalStagedCellWriteProposals,
  projectStructuredCellWriteState,
  projectStructuredCellWriteProposalWorkflowApprovalStaged,
  projectStructuredCellWriteProposalWorkflowDiscarded,
  projectStructuredCellWriteProposalWorkflowReset,
  projectStructuredCellWriteProposalWorkflowStaged,
  projectStructuredDiscardedCellValueOverrides,
  projectStructuredDiscardedCellWriteProposals,
  projectStructuredLocalCellWriteProposals,
  projectStructuredPendingWriteSubjectList,
  projectStructuredPendingWriteSubjects,
  projectStructuredStagedCellValueOverrides,
  projectStructuredStagedCellWriteProposals,
  resolveStructuredCellWriteValues,
  type StructuredCellWriteProposalDraft,
} from './structured-cell-write-proposal-model'
import type { StructuredCellWriteProposal } from '../../domain/structured/structured-table'

const documentUri = 'https://pod.example/.data/tasks.ttl'
const otherDocumentUri = 'https://pod.example/.data/other.ttl'

function proposal(overrides: Partial<StructuredCellWriteProposal> = {}): StructuredCellWriteProposal {
  return {
    id: `${documentUri}|#Task|status`,
    kind: 'cell-write',
    status: 'pending-write',
    documentUri,
    subject: '#Task',
    predicate: 'status',
    previousValues: ['"Todo"'],
    nextValues: ['"Done"'],
    writesCanonicalResource: true,
    ...overrides,
  }
}

describe('structured-cell-write-proposal-model', () => {
  it('projects optimistic overrides and local proposals as one workflow state', () => {
    const key = documentCellKey(documentUri, '#Task', 'status')
    const localProposal = proposal()
    const initial = createStructuredCellWriteProposalWorkflowState()

    expect(initial).toEqual({
      cellValueOverrides: {},
      cellWriteProposals: {},
    })

    const staged = projectStructuredCellWriteProposalWorkflowStaged({
      current: initial,
      key,
      proposal: localProposal,
    })
    expect(staged).toEqual({
      cellValueOverrides: { [key]: ['"Done"'] },
      cellWriteProposals: {
        [key]: { proposal: localProposal, status: 'pending' },
      },
    })

    expect(projectStructuredCellWriteProposalWorkflowApprovalStaged({
      current: staged,
      key,
    })).toEqual({
      cellValueOverrides: { [key]: ['"Done"'] },
      cellWriteProposals: {
        [key]: { proposal: localProposal, status: 'approval-staged' },
      },
    })

    expect(projectStructuredCellWriteProposalWorkflowDiscarded({
      current: staged,
      key,
    })).toEqual(initial)
    expect(projectStructuredCellWriteProposalWorkflowReset(staged)).toEqual(initial)
  })

  it('indexes persisted proposals for the active document only', () => {
    const activeProposal = proposal()
    const otherDocumentProposal = proposal({
      id: `${otherDocumentUri}|#Other|status`,
      documentUri: otherDocumentUri,
      subject: '#Other',
    })

    const indexed = buildStructuredPersistedCellWriteProposalByKey({
      documentUri,
      persistedCellWriteProposals: [activeProposal, otherDocumentProposal],
    })

    expect(Array.from(indexed.keys())).toEqual([
      documentCellKey(documentUri, '#Task', 'status'),
    ])
    expect(indexed.get(documentCellKey(documentUri, '#Task', 'status'))).toBe(activeProposal)
  })

  it('resolves cell values from override, pending draft, persisted proposal, then original values', () => {
    const key = documentCellKey(documentUri, '#Task', 'status')
    const persistedCellWriteProposalByKey = new Map([[key, proposal({ nextValues: ['"Persisted"'] })]])
    const cellWriteProposals: Record<string, StructuredCellWriteProposalDraft> = {
      [key]: {
        proposal: proposal({ nextValues: ['"Pending"'] }),
        status: 'pending',
      },
    }

    expect(resolveStructuredCellWriteValues({
      documentUri,
      subject: '#Task',
      predicate: 'status',
      originalValues: ['"Todo"'],
      cellValueOverrides: { [key]: ['"Override"'] },
      cellWriteProposals,
      persistedCellWriteProposalByKey,
    })).toEqual(['"Override"'])

    expect(resolveStructuredCellWriteValues({
      documentUri,
      subject: '#Task',
      predicate: 'status',
      originalValues: ['"Todo"'],
      cellValueOverrides: {},
      cellWriteProposals,
      persistedCellWriteProposalByKey,
    })).toEqual(['"Pending"'])

    expect(resolveStructuredCellWriteValues({
      documentUri,
      subject: '#Task',
      predicate: 'status',
      originalValues: ['"Todo"'],
      cellValueOverrides: {},
      cellWriteProposals: {},
      persistedCellWriteProposalByKey,
    })).toEqual(['"Persisted"'])

    expect(resolveStructuredCellWriteValues({
      documentUri,
      subject: '#Other',
      predicate: 'status',
      originalValues: ['"Original"'],
      cellValueOverrides: {},
      cellWriteProposals: {},
      persistedCellWriteProposalByKey,
    })).toEqual(['"Original"'])
  })

  it('projects proposal state and pending subjects from local drafts and persisted approvals', () => {
    const localKey = documentCellKey(documentUri, '#Task', 'status')
    const persistedKey = documentCellKey(documentUri, '#Note', 'title')
    const localProposal = proposal({ subject: '#Task', predicate: 'status' })
    const persistedProposal = proposal({
      id: `${documentUri}|#Note|title`,
      subject: '#Note',
      predicate: 'title',
      nextValues: ['"Draft"'],
    })
    const cellWriteProposals: Record<string, StructuredCellWriteProposalDraft> = {
      [localKey]: { proposal: localProposal, status: 'pending' },
    }
    const persistedCellWriteProposalByKey = new Map([[persistedKey, persistedProposal]])

    expect(projectStructuredCellWriteState({
      documentUri,
      subject: '#Task',
      predicate: 'status',
      cellWriteProposals,
      persistedCellWriteProposalByKey,
    })).toEqual({
      proposal: localProposal,
      persistedProposal: undefined,
      status: 'pending',
      hasProposal: true,
    })

    expect(projectStructuredCellWriteState({
      documentUri,
      subject: '#Note',
      predicate: 'title',
      cellWriteProposals,
      persistedCellWriteProposalByKey,
    })).toEqual({
      proposal: undefined,
      persistedProposal,
      status: 'approval-staged',
      hasProposal: true,
    })

    expect(Array.from(projectStructuredPendingWriteSubjects({
      cellWriteProposals,
      persistedCellWriteProposalByKey,
    }))).toEqual(['#Task', '#Note'])
    expect(projectStructuredPendingWriteSubjectList(projectStructuredPendingWriteSubjects({
      cellWriteProposals,
      persistedCellWriteProposalByKey,
    }))).toEqual(['#Note', '#Task'])
    expect(projectStructuredLocalCellWriteProposals(cellWriteProposals)).toEqual([localProposal])
  })

  it('projects local optimistic proposal staging, approval staging, and discard transitions', () => {
    const key = documentCellKey(documentUri, '#Task', 'status')
    const localProposal = proposal()

    const stagedOverrides = projectStructuredStagedCellValueOverrides({
      current: {},
      key,
      nextValues: localProposal.nextValues,
    })
    const stagedProposals = projectStructuredStagedCellWriteProposals({
      current: {},
      key,
      proposal: localProposal,
    })

    expect(stagedOverrides).toEqual({ [key]: ['"Done"'] })
    expect(stagedProposals).toEqual({
      [key]: { proposal: localProposal, status: 'pending' },
    })
    expect(projectStructuredApprovalStagedCellWriteProposals({
      current: stagedProposals,
      key,
    })).toEqual({
      [key]: { proposal: localProposal, status: 'approval-staged' },
    })
    expect(projectStructuredDiscardedCellValueOverrides({
      current: stagedOverrides,
      key,
    })).toEqual({})
    expect(projectStructuredDiscardedCellWriteProposals({
      current: stagedProposals,
      key,
    })).toEqual({})
  })
})
