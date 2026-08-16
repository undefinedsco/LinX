import { beforeEach, describe, expect, it, vi } from 'vitest'
import { approvalResource, auditResource, inboxNotificationResource } from '@undefineds.co/models'
import {
  applyAiChangeProposalToContent,
  createAiChangeProposal,
  parseAiChangeProposalTurtle,
  renderAiChangeProposalTurtle,
} from './domain/proposal/ai-change-approval-model'
import {
  approveAiChangeProposalFromInbox,
  createAiChangeProposalInboxApproval,
} from './data/proposal/ai-change-approval-commands'
import { updateProposalStatusInTurtle } from './proposal-status'

beforeEach(() => {
  vi.restoreAllMocks()
})

function createMockDb() {
  const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = []
  return {
    db: {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
      }),
      insert: vi.fn((table: unknown) => ({
        values(values: Record<string, unknown>) {
          inserts.push({ table, values })
          return { execute: vi.fn(async () => undefined) }
        },
      })),
    },
    inserts,
  }
}

describe('AI change proposals', () => {
  it('creates an AI change proposal without writing canonical content', () => {
    const proposal = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/notes/project.card.md',
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../notes/project.card.md',
      operation: 'replace-content',
      proposedContent: '# Project\n\nAI drafted update.',
      summary: 'AI drafted a clearer project note.',
      diff: '- old\n+ AI drafted update',
      reason: 'User asked AI to rewrite the card.',
      agentWebId: 'https://agent.example/profile#me',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal).toMatchObject({
      kind: 'ai-change-proposal',
      status: 'pending',
      operation: 'replace-content',
      writesCanonicalContent: false,
    })
    expect(proposal.proposalResourceUri).toMatch(
      /^https:\/\/pod\.example\/\.data\/proposals\/ai\/project-card-md-[a-z0-9]{7}\.ttl$/,
    )
    expect(proposal.id).toBe(`${proposal.proposalResourceUri}#proposal`)
    const turtle = renderAiChangeProposalTurtle(proposal)
    expect(turtle).toContain('<#proposal> a udfs:AiChangeProposal')
    expect(turtle).toContain('udfs:targetResource <https://pod.example/.data/workspaces/ws-1/notes/project.card.md>')
    expect(turtle).toContain('udfs:sourceDocument <https://pod.example/.data/workspaces/ws-1/state.ttl>')
    expect(turtle).toContain('udfs:subject "../notes/project.card.md"')
    expect(turtle).toContain('udfs:agent <https://agent.example/profile#me>')
    expect(turtle).toContain('udfs:proposedContent "# Project\\n\\nAI drafted update."')
    expect(turtle).toContain('udfs:writesCanonicalContent false')
  })

  it('parses AI proposal turtle with staged content and reason', () => {
    const proposal = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/public/report.md',
      operation: 'append-content',
      proposedContent: 'AI appended block.',
      summary: 'Append one block.',
      reason: 'Summarize new source facts.',
      diff: '+ AI appended block.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(parseAiChangeProposalTurtle(
      renderAiChangeProposalTurtle(proposal),
      proposal.proposalResourceUri,
    )).toMatchObject({
      id: proposal.id,
      operation: 'append-content',
      targetResourceUri: 'https://pod.example/public/report.md',
      proposedContent: 'AI appended block.',
      reason: 'Summarize new source facts.',
      diff: '+ AI appended block.',
    })
  })

  it('parses resolved AI change proposal status from turtle', () => {
    const proposal = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/public/report.md',
      operation: 'replace-content',
      proposedContent: '# Report\n\nApproved draft.',
      summary: 'Replace report body.',
      reason: 'AI proposal was reviewed.',
      diff: '- old\n+ Approved draft.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    const resolvedSource = updateProposalStatusInTurtle(renderAiChangeProposalTurtle(proposal), 'approved')

    expect(parseAiChangeProposalTurtle(resolvedSource, proposal.proposalResourceUri)).toMatchObject({
      id: proposal.id,
      status: 'approved',
    })
  })

  it('keeps repeated AI proposals for the same target in distinct proposal resources', () => {
    const first = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/public/report.md',
      operation: 'replace-content',
      proposedContent: '# First',
      summary: 'First proposal.',
      diff: '+ first',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const second = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/public/report.md',
      operation: 'replace-content',
      proposedContent: '# Second',
      summary: 'Second proposal.',
      diff: '+ second',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(first.proposalResourceUri).not.toBe(second.proposalResourceUri)
    expect(first.proposalResourceUri).toMatch(
      /^https:\/\/pod\.example\/\.data\/proposals\/ai\/report-md-[a-z0-9]{7}\.ttl$/,
    )
    expect(second.proposalResourceUri).toMatch(
      /^https:\/\/pod\.example\/\.data\/proposals\/ai\/report-md-[a-z0-9]{7}\.ttl$/,
    )
  })

  it('places path-based Pod AI proposals under the selected current Pod root', () => {
    const proposal = createAiChangeProposal({
      targetResourceUri: 'http://localhost:44470/test/public/report.md',
      podRootUri: 'http://localhost:44470/test/',
      operation: 'replace-content',
      proposedContent: '# Path Pod report',
      summary: 'Path Pod edit.',
      diff: '+ path pod',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal.proposalResourceUri).toMatch(
      /^http:\/\/localhost:44470\/test\/\.data\/proposals\/ai\/report-md-[a-z0-9]{7}\.ttl$/,
    )
  })

  it('parses AI proposal fields after Pod expansion to absolute predicate IRIs', () => {
    const proposalResourceUri = 'https://pod.example/.data/proposals/ai/report.ttl'
    const source = [
      '<https://pod.example/.data/proposals/ai/report.ttl#proposal> <https://undefineds.co/vocab/operation> "replace-content" .',
      '<https://pod.example/.data/proposals/ai/report.ttl#proposal> <https://undefineds.co/vocab/targetResource> <https://pod.example/public/report.md> .',
      '<https://pod.example/.data/proposals/ai/report.ttl#proposal> <https://undefineds.co/vocab/sourceDocument> <https://pod.example/.data/workspaces/ws-1/state.ttl> .',
      '<https://pod.example/.data/proposals/ai/report.ttl#proposal> <https://undefineds.co/vocab/subject> "../docs/report.md" .',
      '<https://pod.example/.data/proposals/ai/report.ttl#proposal> <https://undefineds.co/vocab/agent> <https://agent.example/profile#me> .',
      '<https://pod.example/.data/proposals/ai/report.ttl#proposal> <http://purl.org/dc/terms/description> "Replace report." .',
      '<https://pod.example/.data/proposals/ai/report.ttl#proposal> <https://undefineds.co/vocab/diff> "- old\\n+ new" .',
      '<https://pod.example/.data/proposals/ai/report.ttl#proposal> <https://undefineds.co/vocab/reason> "User asked AI." .',
      '<https://pod.example/.data/proposals/ai/report.ttl#proposal> <https://undefineds.co/vocab/proposedContent> "# New report\\n\\nApproved." .',
      '<https://pod.example/.data/proposals/ai/report.ttl#proposal> <http://purl.org/dc/terms/created> "2026-06-17T00:00:00.000Z" .',
    ].join('\n')

    expect(parseAiChangeProposalTurtle(source, proposalResourceUri)).toMatchObject({
      id: `${proposalResourceUri}#proposal`,
      operation: 'replace-content',
      targetResourceUri: 'https://pod.example/public/report.md',
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      agentWebId: 'https://agent.example/profile#me',
      summary: 'Replace report.',
      diff: '- old\n+ new',
      reason: 'User asked AI.',
      proposedContent: '# New report\n\nApproved.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
  })

  it('applies staged AI content by operation without guessing from diff', () => {
    const replace = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/public/report.md',
      operation: 'replace-content',
      proposedContent: 'Replacement',
      summary: 'Replace.',
      diff: '- old\n+ Replacement',
    })

    expect(applyAiChangeProposalToContent('Old', replace)).toBe('Replacement')
    expect(applyAiChangeProposalToContent('Old\n', {
      ...replace,
      operation: 'append-content',
      proposedContent: 'Next',
    })).toBe('Old\n\nNext')
    expect(() => applyAiChangeProposalToContent('Old', {
      ...replace,
      proposedContent: '',
    })).toThrow('AI change proposal has no staged content.')
  })

  it('approves an AI proposal through ETag-protected target save', async () => {
    const proposal = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/public/report.md',
      operation: 'replace-content',
      proposedContent: '# AI replacement\n\nApproved.',
      summary: 'Replace report with approved AI draft.',
      diff: '- old\n+ approved',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderAiChangeProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-ai-1"' },
        })
      }
      if (init?.method === 'PUT' && url === proposal.targetResourceUri) {
        expect(init.headers).toEqual({
          'Content-Type': 'text/markdown',
          'If-Match': '"target-ai-1"',
        })
        expect(init.body).toBe('# AI replacement\n\nApproved.')
        return new Response(null, { status: 204 })
      }
      if (url === proposal.targetResourceUri) {
        return new Response('# AI replacement\n\nApproved.', {
          status: 200,
          headers: { 'Content-Type': 'text/markdown', ETag: '"target-ai-1"' },
        })
      }
      return new Response('missing', { status: 404 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveAiChangeProposalFromInbox(db as any, proposal.id)).resolves.toMatchObject({
      id: proposal.id,
      proposedContent: '# AI replacement\n\nApproved.',
    })
    expect(authFetch).toHaveBeenCalledWith(proposal.targetResourceUri, expect.objectContaining({ method: 'PUT' }))
  })

  it('does not reapply an already approved AI proposal', async () => {
    const proposal = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/public/report.md',
      operation: 'append-content',
      proposedContent: 'Already approved append.',
      summary: 'Append approved content.',
      diff: '+ already approved',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(
          updateProposalStatusInTurtle(renderAiChangeProposalTurtle(proposal), 'approved'),
          {
            status: 200,
            headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-ai-approved"' },
          },
        )
      }
      throw new Error('approved AI proposal must not read or write its target again')
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveAiChangeProposalFromInbox(db as any, proposal.id)).rejects.toThrow(
      'Cannot approve AI change proposal because it is already approved.',
    )
    expect(authFetch).not.toHaveBeenCalledWith(proposal.targetResourceUri, expect.anything())
  })

  it.each([
    ['vocab registry', 'https://pod.example/.vocab/terms.ttl'],
    ['access policy', 'https://pod.example/public/report.md.acl'],
    ['access control policy', 'https://pod.example/public/report.md.acr'],
    ['metadata sidecar', 'https://pod.example/public/report.md.meta'],
  ])('refuses to approve an AI proposal targeting a reserved %s resource', async (_label, targetResourceUri) => {
    const proposalResourceUri = 'https://pod.example/.data/proposals/ai/report.ttl'
    const proposal = createAiChangeProposal({
      targetResourceUri,
      operation: 'replace-content',
      proposedContent: '# Reserved target',
      summary: 'Replace reserved target.',
      diff: '+ reserved',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL) => {
      const url = String(uri)
      if (url === proposalResourceUri) {
        return new Response(renderAiChangeProposalTurtle({
          ...proposal,
          proposalResourceUri,
          id: `${proposalResourceUri}#proposal`,
        }), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-ai-1"' },
        })
      }
      throw new Error('reserved AI proposal target must not be fetched')
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveAiChangeProposalFromInbox(db as any, `${proposalResourceUri}#proposal`)).rejects.toThrow(
      'Refusing to approve AI change proposal targeting a reserved Files resource.',
    )
    expect(authFetch).not.toHaveBeenCalledWith(targetResourceUri, expect.anything())
  })

  it('refuses to approve an AI proposal outside the current Pod', async () => {
    const authFetch = vi.fn()
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveAiChangeProposalFromInbox(
      db as any,
      'https://evil.example/.data/proposals/ai/report.ttl#proposal',
    )).rejects.toThrow('Refusing to approve AI change proposal outside the current Pod.')
    expect(authFetch).not.toHaveBeenCalled()
  })

  it('refuses to approve an AI proposal that targets another Pod', async () => {
    const proposalResourceUri = 'https://pod.example/.data/proposals/ai/report.ttl'
    const proposal = createAiChangeProposal({
      targetResourceUri: 'https://evil.example/public/report.md',
      operation: 'replace-content',
      proposedContent: '# Other Pod',
      summary: 'Replace external report.',
      diff: '+ external',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL) => {
      if (String(uri) === proposalResourceUri) {
        return new Response(renderAiChangeProposalTurtle({
          ...proposal,
          proposalResourceUri,
          id: `${proposalResourceUri}#proposal`,
        }), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-ai-1"' },
        })
      }
      return new Response('missing', { status: 404 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveAiChangeProposalFromInbox(db as any, `${proposalResourceUri}#proposal`)).rejects.toThrow(
      'Refusing to approve AI change proposal outside the current Pod.',
    )
    expect(authFetch).not.toHaveBeenCalledWith('https://evil.example/public/report.md', expect.anything())
  })

  it('creates an inbox approval for an AI change proposal', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('approval-ai-1')
      .mockReturnValueOnce('audit-ai-1')
      .mockReturnValueOnce('notification-ai-1')
    const { db, inserts } = createMockDb()
    const proposal = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/public/report.md',
      proposedContent: '# AI replacement',
      summary: 'AI replacement pending review.',
      diff: '+ AI replacement',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    const approvalUri = await createAiChangeProposalInboxApproval(db as any, {
      actorWebId: 'https://id.example/alice#me',
      proposal,
      createdAt: new Date('2026-06-17T00:00:00.000Z'),
    })

    expect(approvalUri).toBe('https://pod.example/.data/approvals/2026/06/17.ttl#approval-ai-1')
    expect(inserts.find((item) => item.table === approvalResource)?.values).toMatchObject({
      id: approvalResource.buildId({ id: 'approval-ai-1', createdAt: new Date('2026-06-17T00:00:00.000Z') }),
      session: proposal.id,
      toolCallId: 'files.ai.change.proposal:approval-ai-1',
      toolName: 'files.ai.change.proposal',
      target: proposal.id,
      action: 'https://undefineds.co/vocab/reviewAiChangeProposal',
      risk: 'medium',
      status: 'pending',
      assignedTo: 'https://id.example/alice#me',
      policyVersion: 'files-ai-change-proposal-v1',
    })
    expect(inserts.find((item) => item.table === auditResource)?.values).toMatchObject({
      id: 'audit-ai-1',
      action: 'files.ai.change.proposal.requested',
      approval: approvalUri,
      entry: proposal.proposalResourceUri,
      toolName: 'files.ai.change.proposal',
    })
    expect(inserts.find((item) => item.table === inboxNotificationResource)?.values).toMatchObject({
      id: 'notification-ai-1',
      object: approvalUri,
    })
  })
})
