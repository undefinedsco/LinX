import { describe, expect, it } from 'vitest'

import {
  createSourceUpdateProposal,
  type SourceUpdateProposal,
} from '../../domain/source/source-approval-model'
import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import {
  createStructuredSourceUpdateWorkflowState,
  mergeStructuredSourceUpdateProposalsBySubject,
  projectStructuredSourceUpdateWorkflowProposals,
  projectStructuredSourceUpdateWorkflowReset,
  projectStructuredSourceUpdateWorkflowSourceUpdatesOnly,
  projectStructuredSourceUpdateWorkflowModel,
} from './structured-source-update-workflow-model'

const documentUri = 'https://pod.example/.data/workspaces/state.ttl'

const projection: StructuredTableProjection = {
  prefixes: {},
  predicates: ['schema:name', 'source'],
  rows: [
    {
      subject: '#TaskA',
      cells: [
        { predicate: 'schema:name', values: ['"Task A"'] },
      ],
    },
    {
      subject: '#TaskB',
      cells: [
        { predicate: 'schema:name', values: ['"Task B"'] },
      ],
    },
    {
      subject: '#TaskC',
      cells: [
        { predicate: 'schema:name', values: ['"Task C"'] },
      ],
    },
  ],
  warnings: ['parser warning'],
}

function sourceUpdateProposal(overrides: Partial<SourceUpdateProposal> = {}): SourceUpdateProposal {
  return {
    ...createSourceUpdateProposal({
      documentUri,
      subject: '#TaskA',
      targetResourceUri: 'https://pod.example/.data/workspaces/cards/task-a.md',
      sourceUri: 'https://example.com/task-a',
      sourceHash: 'sha256-task-a',
      createdAt: '2026-06-30T00:00:00.000Z',
    }),
    ...overrides,
  }
}

describe('structured source update workflow model', () => {
  it('projects controller state transitions as one source update workflow state', () => {
    const taskA = sourceUpdateProposal({
      id: 'task-a',
      subject: '#TaskA',
    })
    const initial = createStructuredSourceUpdateWorkflowState()

    expect(initial).toEqual({
      sourceUpdateProposalsBySubject: {},
      sourceUpdatesOnly: false,
    })
    expect(projectStructuredSourceUpdateWorkflowSourceUpdatesOnly({
      current: initial,
      sourceUpdatesOnly: true,
    })).toEqual({
      sourceUpdateProposalsBySubject: {},
      sourceUpdatesOnly: true,
    })
    expect(projectStructuredSourceUpdateWorkflowProposals({
      current: initial,
      proposalsBySubject: {
        [taskA.subject]: taskA,
      },
    })).toEqual({
      sourceUpdateProposalsBySubject: {
        '#TaskA': taskA,
      },
      sourceUpdatesOnly: false,
    })
    expect(projectStructuredSourceUpdateWorkflowReset({
      sourceUpdateProposalsBySubject: {
        [taskA.subject]: taskA,
      },
      sourceUpdatesOnly: true,
    })).toEqual(initial)
  })

  it('merges local staged and pending source update proposals by latest subject update', () => {
    const localTaskA = sourceUpdateProposal({
      id: 'local-task-a',
      subject: '#TaskA',
      createdAt: '2026-06-30T10:00:00.000Z',
      summary: 'Local staged update wins over older pending query data.',
    })
    const olderPendingTaskA = sourceUpdateProposal({
      id: 'pending-task-a-old',
      subject: '#TaskA',
      createdAt: '2026-06-30T09:00:00.000Z',
      summary: 'Older query update should be ignored.',
    })
    const newerPendingTaskB = sourceUpdateProposal({
      id: 'pending-task-b-new',
      subject: '#TaskB',
      createdAt: '2026-06-30T11:00:00.000Z',
      summary: 'New pending query update for task B.',
    })
    const subjectlessPending = sourceUpdateProposal({
      id: 'pending-subjectless',
      subject: '',
      createdAt: '2026-06-30T12:00:00.000Z',
    })

    expect(mergeStructuredSourceUpdateProposalsBySubject({
      localProposalsBySubject: {
        [localTaskA.subject]: localTaskA,
      },
      pendingProposals: [olderPendingTaskA, newerPendingTaskB, subjectlessPending],
    })).toEqual({
      '#TaskA': localTaskA,
      '#TaskB': newerPendingTaskB,
    })
  })

  it('projects affected subjects and filtered table rows without keeping projection rules in the controller', () => {
    const taskA = sourceUpdateProposal({
      id: 'task-a',
      subject: '#TaskA',
      createdAt: '2026-06-30T10:00:00.000Z',
    })
    const taskB = sourceUpdateProposal({
      id: 'task-b',
      subject: '#TaskB',
      createdAt: '2026-06-30T11:00:00.000Z',
    })

    const model = projectStructuredSourceUpdateWorkflowModel({
      localProposalsBySubject: {
        [taskA.subject]: taskA,
      },
      pendingProposals: [taskB],
      projection,
      sourceUpdatesOnly: true,
    })

    expect(model.sourceUpdateProposalsForTableBySubject).toEqual({
      '#TaskA': taskA,
      '#TaskB': taskB,
    })
    expect([...model.resourceUpdateSubjects]).toEqual(['#TaskA', '#TaskB'])
    expect(model.resourceUpdateFilteredProjection).toEqual({
      ...projection,
      rows: projection.rows.slice(0, 2),
    })
  })

  it('returns the original projection when source update filtering is off', () => {
    const taskA = sourceUpdateProposal({
      id: 'task-a',
      subject: '#TaskA',
    })

    const model = projectStructuredSourceUpdateWorkflowModel({
      localProposalsBySubject: {},
      pendingProposals: [taskA],
      projection,
      sourceUpdatesOnly: false,
    })

    expect(model.resourceUpdateFilteredProjection).toBe(projection)
    expect([...model.resourceUpdateSubjects]).toEqual(['#TaskA'])
  })
})
