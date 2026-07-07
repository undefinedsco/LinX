import { describe, expect, it, vi } from 'vitest'
import { filesProposalApplicationCollection } from './data/proposal/proposal-application-collection'
import {
  FILES_ACCESS_APPROVAL_ACTION,
  FILES_ACCESS_APPROVAL_TOOL_NAME,
} from './domain/proposal/access-approval-model'
import {
  FILES_VOCAB_APPROVAL_ACTION,
  FILES_VOCAB_APPROVAL_TOOL_NAME,
} from './domain/structured/structured-table'

const mocks = vi.hoisted(() => ({
  approveAccessPolicyProposalFromInbox: vi.fn(),
  approveAiChangeProposalFromInbox: vi.fn(),
  approveSourceUpdateProposalFromInbox: vi.fn(),
  approveStructuredCellChangeProposalFromInbox: vi.fn(),
  approveVocabTermProposalFromInbox: vi.fn(),
  markFilesProposalResourceResolved: vi.fn(),
}))

vi.mock('./data/proposal/access-approval-commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/proposal/access-approval-commands')>()
  return {
    ...actual,
    approveAccessPolicyProposalFromInbox: mocks.approveAccessPolicyProposalFromInbox,
  }
})

vi.mock('./data/proposal/ai-change-approval-commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/proposal/ai-change-approval-commands')>()
  return {
    ...actual,
    approveAiChangeProposalFromInbox: mocks.approveAiChangeProposalFromInbox,
  }
})

vi.mock('./data/proposal/proposal-status-resource', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/proposal/proposal-status-resource')>()
  return {
    ...actual,
    markFilesProposalResourceResolved: mocks.markFilesProposalResourceResolved,
  }
})

vi.mock('./data/proposal/source-approval-commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/proposal/source-approval-commands')>()
  return {
    ...actual,
    approveSourceUpdateProposalFromInbox: mocks.approveSourceUpdateProposalFromInbox,
  }
})

vi.mock('./data/proposal/structured-cell-approval-commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/proposal/structured-cell-approval-commands')>()
  return {
    ...actual,
    approveStructuredCellChangeProposalFromInbox: mocks.approveStructuredCellChangeProposalFromInbox,
  }
})

vi.mock('./data/proposal/vocab-approval-commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/proposal/vocab-approval-commands')>()
  return {
    ...actual,
    approveVocabTermProposalFromInbox: mocks.approveVocabTermProposalFromInbox,
  }
})

describe('files proposal application collection', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('does not apply canonical vocab writes when a vocab tool approval has a different action', async () => {
    const db = { id: 'db' } as never
    const proposalTarget = 'https://pod.example/.data/proposals/vocab/summary-1234567.ttl#proposal'

    await filesProposalApplicationCollection.applyApprovalDecision({
      db,
      approval: {
        id: 'approval-vocab-wrong-action',
        toolName: FILES_VOCAB_APPROVAL_TOOL_NAME,
        action: 'https://undefineds.co/vocab/previewVocabTermProposal',
        target: proposalTarget,
      } as never,
      decision: 'approved',
    })

    expect(mocks.approveVocabTermProposalFromInbox).not.toHaveBeenCalled()
    expect(mocks.markFilesProposalResourceResolved).not.toHaveBeenCalled()
  })

  it('applies canonical vocab writes for the vocab approval action', async () => {
    const db = { id: 'db' } as never
    const proposalTarget = 'https://pod.example/.data/proposals/vocab/summary-1234567.ttl#proposal'

    await filesProposalApplicationCollection.applyApprovalDecision({
      db,
      approval: {
        id: 'approval-vocab',
        toolName: FILES_VOCAB_APPROVAL_TOOL_NAME,
        action: FILES_VOCAB_APPROVAL_ACTION,
        target: proposalTarget,
      } as never,
      decision: 'approved',
    })

    expect(mocks.approveVocabTermProposalFromInbox).toHaveBeenCalledWith(db, proposalTarget)
  })

  it('marks rejected Files proposal resources without applying canonical writes', async () => {
    const db = { id: 'db' } as never
    const proposalTarget = 'https://pod.example/.data/proposals/access/public-viewer-1234567.ttl#proposal'

    await filesProposalApplicationCollection.applyApprovalDecision({
      db,
      approval: {
        id: 'approval-access-rejected',
        toolName: FILES_ACCESS_APPROVAL_TOOL_NAME,
        action: FILES_ACCESS_APPROVAL_ACTION,
        target: proposalTarget,
      } as never,
      decision: 'rejected',
    })

    expect(mocks.approveAccessPolicyProposalFromInbox).not.toHaveBeenCalled()
    expect(mocks.markFilesProposalResourceResolved).toHaveBeenCalledWith(db, proposalTarget, 'rejected')
  })

  it('marks approved Files proposal resources after applying canonical writes', async () => {
    const db = { id: 'db' } as never
    const proposalTarget = 'https://pod.example/.data/proposals/access/public-viewer-1234567.ttl#proposal'

    await filesProposalApplicationCollection.applyApprovalDecision({
      db,
      approval: {
        id: 'approval-access-approved',
        toolName: FILES_ACCESS_APPROVAL_TOOL_NAME,
        action: FILES_ACCESS_APPROVAL_ACTION,
        target: proposalTarget,
      } as never,
      decision: 'approved',
    })

    expect(mocks.approveAccessPolicyProposalFromInbox).toHaveBeenCalledWith(db, proposalTarget)
    expect(mocks.markFilesProposalResourceResolved).toHaveBeenCalledWith(db, proposalTarget, 'approved')
  })
})
