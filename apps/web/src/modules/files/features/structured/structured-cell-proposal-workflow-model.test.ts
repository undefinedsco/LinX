import { describe, expect, it } from 'vitest'

import type { StructuredCellChangeProposal } from '../../domain/proposal/structured-cell-approval-model'
import type { StructuredCellWriteProposal } from '../../domain/structured/structured-table'
import {
  createStructuredCellProposalWorkflowState,
  projectAllStructuredPendingWriteSubjects,
  projectEffectiveStructuredCellWriteProposals,
  projectPersistedStructuredCellWriteProposals,
  projectPersistedStructuredPendingWriteSubjects,
  projectStructuredCellProposalWorkflowStateReset,
  projectStructuredCellProposalWorkflowStateTableProposals,
  projectStructuredCellProposalWorkflowStateTableSubjects,
  projectStructuredCellProposalWorkflowStateViewProposal,
  projectStructuredLocalCellWriteProposalsFromTable,
  projectStructuredLocalPendingWriteSubjectsFromTable,
  upsertStructuredLocalViewCellWriteProposal,
} from './structured-cell-proposal-workflow-model'

const documentUri = 'https://pod.example/.data/tasks.ttl'

function changeProposal(overrides: Partial<StructuredCellChangeProposal> = {}): StructuredCellChangeProposal {
  return {
    id: `${documentUri}/proposals/cell/status#proposal`,
    kind: 'structured-cell-change-proposal',
    status: 'pending',
    operation: 'replace-values',
    proposalResourceUri: `${documentUri}/proposals/cell/status.ttl`,
    documentUri,
    subject: '#Task',
    predicate: 'status',
    previousValues: ['"Todo"'],
    nextValues: ['"Done"'],
    reason: 'Review status',
    createdAt: '2026-06-30T00:00:00.000Z',
    writesCanonicalResource: false,
    ...overrides,
  }
}

function writeProposal(overrides: Partial<StructuredCellWriteProposal> = {}): StructuredCellWriteProposal {
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

describe('structured-cell-proposal-workflow-model', () => {
  it('projects local pending subjects, table proposals, and view proposals as one workflow state', () => {
    const initial = createStructuredCellProposalWorkflowState()
    const tableProposal = writeProposal({ subject: '#Table', predicate: 'status' })
    const viewProposal = writeProposal({ subject: '#View', predicate: 'status' })

    expect(initial).toEqual({
      localCellWriteProposals: [],
      localPendingWriteSubjects: new Set(),
      localViewCellWriteProposals: [],
    })

    const withSubjects = projectStructuredCellProposalWorkflowStateTableSubjects({
      current: initial,
      subjects: ['#Table'],
    })
    expect(withSubjects).toEqual({
      localCellWriteProposals: [],
      localPendingWriteSubjects: new Set(['#Table']),
      localViewCellWriteProposals: [],
    })

    const withTableProposals = projectStructuredCellProposalWorkflowStateTableProposals({
      current: withSubjects,
      proposals: [tableProposal],
    })
    expect(withTableProposals.localCellWriteProposals).toEqual([tableProposal])

    const withViewProposal = projectStructuredCellProposalWorkflowStateViewProposal({
      current: withTableProposals,
      proposal: viewProposal,
    })
    expect(withViewProposal).toEqual({
      localCellWriteProposals: [tableProposal],
      localPendingWriteSubjects: new Set(['#Table']),
      localViewCellWriteProposals: [viewProposal],
    })

    expect(projectStructuredCellProposalWorkflowStateReset(withViewProposal)).toEqual(initial)
  })

  it('projects persisted change proposals into write proposals and effective proposal order', () => {
    const persisted = projectPersistedStructuredCellWriteProposals([
      changeProposal(),
    ])
    const local = writeProposal({ id: `${documentUri}|#Local|title`, subject: '#Local', predicate: 'title' })
    const localView = writeProposal({ id: `${documentUri}|#View|status`, subject: '#View' })

    expect(persisted).toEqual([
      {
        id: `${documentUri}/proposals/cell/status#proposal`,
        kind: 'cell-write',
        status: 'pending-write',
        documentUri,
        subject: '#Task',
        predicate: 'status',
        previousValues: ['"Todo"'],
        nextValues: ['"Done"'],
        writesCanonicalResource: true,
      },
    ])
    expect(projectEffectiveStructuredCellWriteProposals({
      localCellWriteProposals: [local],
      localViewCellWriteProposals: [localView],
      persistedCellWriteProposals: persisted,
    })).toEqual([...persisted, local, localView])
  })

  it('projects persisted and local pending subjects without mutating inputs', () => {
    const persistedSubjects = projectPersistedStructuredPendingWriteSubjects([
      writeProposal({ subject: '#TaskA' }),
      writeProposal({ subject: '#TaskB' }),
    ])
    const localSubjects = new Set(['#TaskB', '#TaskC'])

    expect(Array.from(persistedSubjects)).toEqual(['#TaskA', '#TaskB'])
    expect(Array.from(projectAllStructuredPendingWriteSubjects({
      localPendingWriteSubjects: localSubjects,
      persistedPendingWriteSubjects: persistedSubjects,
    }))).toEqual(['#TaskA', '#TaskB', '#TaskC'])
    expect(Array.from(localSubjects)).toEqual(['#TaskB', '#TaskC'])
  })

  it('reuses local pending subject set when table subjects are unchanged', () => {
    const current = new Set(['#TaskA', '#TaskB'])

    expect(projectStructuredLocalPendingWriteSubjectsFromTable({
      current,
      subjects: ['#TaskB', '#TaskA'],
    })).toBe(current)
    expect(Array.from(projectStructuredLocalPendingWriteSubjectsFromTable({
      current,
      subjects: ['#TaskB', '#TaskC'],
    }))).toEqual(['#TaskB', '#TaskC'])
  })

  it('projects table-local cell write proposals through the workflow model', () => {
    const current = [
      writeProposal({ id: `${documentUri}|#Task|status`, subject: '#Task' }),
      writeProposal({ id: `${documentUri}|#Other|status`, subject: '#Other' }),
    ]

    expect(projectStructuredLocalCellWriteProposalsFromTable({
      current,
      proposals: current,
    })).toBe(current)

    const next = [
      writeProposal({ id: `${documentUri}|#Next|status`, subject: '#Next' }),
    ]
    expect(projectStructuredLocalCellWriteProposalsFromTable({
      current,
      proposals: next,
    })).toEqual(next)
  })

  it('upserts view-local write proposals by document, subject, and predicate', () => {
    const current = [
      writeProposal({ nextValues: ['"Old"'] }),
      writeProposal({ id: `${documentUri}|#Other|status`, subject: '#Other' }),
    ]
    const replacement = writeProposal({ nextValues: ['"Replacement"'] })

    expect(upsertStructuredLocalViewCellWriteProposal({
      current,
      proposal: replacement,
    })).toEqual([
      writeProposal({ id: `${documentUri}|#Other|status`, subject: '#Other' }),
      replacement,
    ])
  })
})
