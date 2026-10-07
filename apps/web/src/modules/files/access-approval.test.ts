import { beforeEach, describe, expect, it, vi } from 'vitest'
import { approvalResource, auditResource, inboxNotificationResource } from '@undefineds.co/models'
import {
  applyAccessPolicyProposalToAclTurtle,
  createAccessPolicyProposal,
  parseAccessPolicyProposalTurtle,
  renderAccessPolicyProposalTurtle,
} from './domain/proposal/access-approval-model'
import {
  approveAccessPolicyProposalFromInbox,
  createAccessPolicyProposalInboxApproval,
} from './data/proposal/access-approval-commands'
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

describe('access policy proposals', () => {
  it('creates a sidecar access proposal without writing ACL or ACR directly', () => {
    const proposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/README.md',
      activePolicyUri: 'https://pod.example/public/README.md.acl',
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Let Ingest refresh linked cards.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal).toMatchObject({
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      role: 'editor',
      writesCanonicalPolicy: false,
    })
    expect(proposal.proposalResourceUri).toMatch(
      /^https:\/\/pod\.example\/\.data\/proposals\/access\/agent-editor-https-agent-example-profile-me-[a-z0-9]{7}\.ttl$/,
    )
    expect(proposal.id).toBe(`${proposal.proposalResourceUri}#proposal`)
    const turtle = renderAccessPolicyProposalTurtle(proposal)
    expect(turtle).toContain('<#proposal> a udfs:AccessPolicyProposal')
    expect(turtle).toContain('udfs:ownerResource <https://pod.example/public/README.md>')
    expect(turtle).toContain('udfs:targetPolicy <https://pod.example/public/README.md.acl>')
    expect(turtle).toContain('udfs:writesCanonicalPolicy false')
  })

  it('supports authenticated users as a first-class access audience', () => {
    const proposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/README.md',
      activePolicyUri: 'https://pod.example/public/README.md.acl',
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      audience: 'authenticated',
      audienceRef: 'authenticated',
      role: 'contributor',
      modes: ['read', 'append'],
      reason: 'Signed-in collaborators may add notes.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal.proposalResourceUri).toMatch(
      /^https:\/\/pod\.example\/\.data\/proposals\/access\/authenticated-contributor-authenticated-[a-z0-9]{7}\.ttl$/,
    )
    const turtle = renderAccessPolicyProposalTurtle(proposal)
    expect(turtle).toContain('udfs:audience "authenticated"')
    expect(turtle).toContain('udfs:audienceRef "authenticated"')
    expect(turtle).toContain('udfs:mode "read"')
    expect(turtle).toContain('udfs:mode "append"')
  })

  it('parses resolved access proposal status from turtle', () => {
    const proposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/README.md',
      activePolicyUri: 'https://pod.example/public/README.md.acl',
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      audience: 'authenticated',
      audienceRef: 'authenticated',
      role: 'contributor',
      modes: ['read', 'append'],
      reason: 'Access request was reviewed.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    const resolvedSource = updateProposalStatusInTurtle(renderAccessPolicyProposalTurtle(proposal), 'rejected')

    expect(parseAccessPolicyProposalTurtle(resolvedSource, proposal.proposalResourceUri)).toMatchObject({
      id: proposal.id,
      status: 'rejected',
    })
  })

  it.each(['approved', 'rejected'] as const)(
    'rejects a resolved %s access proposal before reading or writing the target policy',
    async (status) => {
      const proposal = createAccessPolicyProposal({
        ownerUri: 'https://pod.example/public/README.md',
        activePolicyUri: 'https://pod.example/public/README.md.acl',
        targetPolicyUri: 'https://pod.example/public/README.md.acl',
        provider: 'acl',
        audience: 'public',
        audienceRef: 'public',
        role: 'viewer',
        modes: ['read'],
        reason: 'Public may read.',
        createdAt: '2026-06-17T00:00:00.000Z',
      })
      const proposalSource = updateProposalStatusInTurtle(renderAccessPolicyProposalTurtle(proposal), status)
      const authFetch = vi.fn(async (uri: RequestInfo | URL) => {
        const url = String(uri)
        if (url === proposal.proposalResourceUri) {
          return new Response(proposalSource, {
            status: 200,
            headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
          })
        }
        if (url === proposal.targetPolicyUri) {
          throw new Error('resolved access proposal must not read or write canonical policy')
        }
        return new Response('missing', { status: 404 })
      })
      const db = {
        getDialect: () => ({
          getPodUrl: () => 'https://pod.example/',
          getAuthenticatedFetch: () => authFetch,
        }),
      }

      await expect(approveAccessPolicyProposalFromInbox(db as any, proposal.id)).rejects.toThrow(
        `Cannot approve access policy proposal because it is already ${status}.`,
      )
      expect(authFetch).toHaveBeenCalledTimes(1)
      expect(authFetch.mock.calls[0]?.[0]).toBe(proposal.proposalResourceUri)
      expect(authFetch).not.toHaveBeenCalledWith(proposal.targetPolicyUri, expect.anything())
    },
  )

  it('creates immutable access proposal resources for repeated requests', () => {
    const first = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/README.md',
      activePolicyUri: 'https://pod.example/public/README.md.acl',
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      audience: 'authenticated',
      audienceRef: 'authenticated',
      role: 'contributor',
      modes: ['read', 'append'],
      reason: 'First access request.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const second = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/README.md',
      activePolicyUri: 'https://pod.example/public/README.md.acl',
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      audience: 'authenticated',
      audienceRef: 'authenticated',
      role: 'contributor',
      modes: ['read', 'append'],
      reason: 'Second access request.',
      createdAt: '2026-06-17T00:00:01.000Z',
    })

    const proposalPathPattern = /^https:\/\/pod\.example\/\.data\/proposals\/access\/authenticated-contributor-authenticated-[a-z0-9]{7}\.ttl$/
    expect(first.proposalResourceUri).toMatch(proposalPathPattern)
    expect(second.proposalResourceUri).toMatch(proposalPathPattern)
    expect(first.proposalResourceUri).not.toBe(second.proposalResourceUri)
    expect(first.id).toBe(`${first.proposalResourceUri}#proposal`)
    expect(second.id).toBe(`${second.proposalResourceUri}#proposal`)
  })

  it('keeps access proposals inside a path-based local Pod', () => {
    const proposal = createAccessPolicyProposal({
      ownerUri: 'http://localhost:31770/test/public/README.md',
      activePolicyUri: 'http://localhost:31770/test/public/README.md.acr',
      targetPolicyUri: 'http://localhost:31770/test/public/README.md.acr',
      provider: 'acr',
      audience: 'authenticated',
      audienceRef: 'authenticated',
      role: 'contributor',
      modes: ['read', 'append'],
      reason: 'Signed-in collaborators may add notes.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal.proposalResourceUri).toMatch(
      /^http:\/\/localhost:31770\/test\/\.data\/proposals\/access\/authenticated-contributor-authenticated-[a-z0-9]{7}\.ttl$/,
    )
  })

  it('parses and applies an approved proposal to WAC ACL Turtle', () => {
    const proposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/README.md',
      activePolicyUri: 'https://pod.example/public/README.md.acl',
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Let Ingest refresh linked cards.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    const parsed = parseAccessPolicyProposalTurtle(
      renderAccessPolicyProposalTurtle(proposal),
      proposal.proposalResourceUri,
    )
    const acl = applyAccessPolicyProposalToAclTurtle('@prefix acl: <http://www.w3.org/ns/auth/acl#> .\n', parsed)

    expect(parsed).toMatchObject({
      id: proposal.id,
      ownerUri: 'https://pod.example/public/README.md',
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      modes: ['read', 'append', 'write'],
      writesCanonicalPolicy: false,
    })
    expect(acl).toContain('<#agent-editor-https-agent-example-profile-me> a acl:Authorization')
    expect(acl).toContain('acl:accessTo <https://pod.example/public/README.md>')
    expect(acl).toContain('acl:agent <https://agent.example/profile#me>')
    expect(acl).toContain('acl:mode acl:Read, acl:Append, acl:Write')
    expect(acl).toContain('dcterms:description "Let Ingest refresh linked cards."')
  })

  it('parses access proposal fields after Pod expansion to absolute predicate IRIs', () => {
    const proposalResourceUri = 'https://pod.example/.data/proposals/access/agent-editor.ttl'
    const source = [
      '<https://pod.example/.data/proposals/access/agent-editor.ttl#proposal> <https://undefineds.co/vocab/ownerResource> <https://pod.example/public/README.md> .',
      '<https://pod.example/.data/proposals/access/agent-editor.ttl#proposal> <https://undefineds.co/vocab/activePolicy> <https://pod.example/public/README.md.acl> .',
      '<https://pod.example/.data/proposals/access/agent-editor.ttl#proposal> <https://undefineds.co/vocab/targetPolicy> <https://pod.example/public/README.md.acl> .',
      '<https://pod.example/.data/proposals/access/agent-editor.ttl#proposal> <https://undefineds.co/vocab/provider> "acl" .',
      '<https://pod.example/.data/proposals/access/agent-editor.ttl#proposal> <https://undefineds.co/vocab/audience> "agent" .',
      '<https://pod.example/.data/proposals/access/agent-editor.ttl#proposal> <https://undefineds.co/vocab/audienceRef> "https://agent.example/profile#me" .',
      '<https://pod.example/.data/proposals/access/agent-editor.ttl#proposal> <https://undefineds.co/vocab/role> "editor" .',
      '<https://pod.example/.data/proposals/access/agent-editor.ttl#proposal> <https://undefineds.co/vocab/mode> "read" .',
      '<https://pod.example/.data/proposals/access/agent-editor.ttl#proposal> <https://undefineds.co/vocab/mode> "append" .',
      '<https://pod.example/.data/proposals/access/agent-editor.ttl#proposal> <https://undefineds.co/vocab/mode> "write" .',
      '<https://pod.example/.data/proposals/access/agent-editor.ttl#proposal> <http://purl.org/dc/terms/description> "Let Ingest refresh linked cards." .',
      '<https://pod.example/.data/proposals/access/agent-editor.ttl#proposal> <http://purl.org/dc/terms/created> "2026-06-17T00:00:00.000Z" .',
    ].join('\n')

    expect(parseAccessPolicyProposalTurtle(source, proposalResourceUri)).toMatchObject({
      id: `${proposalResourceUri}#proposal`,
      ownerUri: 'https://pod.example/public/README.md',
      activePolicyUri: 'https://pod.example/public/README.md.acl',
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Let Ingest refresh linked cards.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
  })

  it('applies public and authenticated audiences with ACL agent classes', () => {
    const publicProposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/',
      activePolicyUri: null,
      targetPolicyUri: 'https://pod.example/public/.acl',
      provider: 'acl',
      audience: 'public',
      audienceRef: 'public',
      role: 'viewer',
      modes: ['read'],
      reason: 'Public may read this folder.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authenticatedProposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/',
      activePolicyUri: null,
      targetPolicyUri: 'https://pod.example/public/.acl',
      provider: 'acl',
      audience: 'authenticated',
      audienceRef: 'authenticated',
      role: 'contributor',
      modes: ['read', 'append'],
      reason: 'Signed-in collaborators may append.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    const publicAcl = applyAccessPolicyProposalToAclTurtle('', publicProposal)
    const authenticatedAcl = applyAccessPolicyProposalToAclTurtle('', authenticatedProposal)

    expect(publicAcl).toContain('acl:agentClass foaf:Agent')
    expect(publicAcl).toContain('acl:mode acl:Read')
    expect(authenticatedAcl).toContain('acl:agentClass acl:AuthenticatedAgent')
    expect(authenticatedAcl).toContain('acl:mode acl:Read, acl:Append')
  })

  it('does not apply ACR proposals through the WAC ACL writer', () => {
    const proposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/README.md',
      activePolicyUri: 'https://pod.example/public/README.md.acr',
      targetPolicyUri: 'https://pod.example/public/README.md.acr',
      provider: 'acr',
      audience: 'public',
      audienceRef: 'public',
      role: 'viewer',
      modes: ['read'],
      reason: 'Public may read.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(() => applyAccessPolicyProposalToAclTurtle('', proposal)).toThrow('ACR access proposal apply is not supported yet')
  })

  it('creates an inbox approval for an access proposal', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('approval-1')
      .mockReturnValueOnce('audit-1')
      .mockReturnValueOnce('notification-1')
    const { db, inserts } = createMockDb()
    const proposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/README.md',
      activePolicyUri: null,
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      audience: 'public',
      audienceRef: 'public',
      role: 'viewer',
      modes: ['read'],
      reason: '',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    const approvalUri = await createAccessPolicyProposalInboxApproval(db as any, {
      actorWebId: 'https://id.example/alice#me',
      proposal,
      createdAt: new Date('2026-06-17T00:00:00.000Z'),
    })

    expect(approvalUri).toBe('https://pod.example/.data/approvals/2026/06/17.ttl#approval-1')
    expect(inserts.find((item) => item.table === approvalResource)?.values).toMatchObject({
      id: approvalResource.buildId({ id: 'approval-1', createdAt: new Date('2026-06-17T00:00:00.000Z') }),
      session: proposal.id,
      toolCallId: 'files.access.proposal:approval-1',
      toolName: 'files.access.proposal',
      target: proposal.id,
      action: 'https://undefineds.co/vocab/reviewAccessPolicyProposal',
      risk: 'medium',
      status: 'pending',
      assignedTo: 'https://id.example/alice#me',
      policyVersion: 'files-access-proposal-v1',
    })
    expect(inserts.find((item) => item.table === auditResource)?.values).toMatchObject({
      id: 'audit-1',
      action: 'files.access.proposal.requested',
      actor: 'https://id.example/alice#me',
      approval: approvalUri,
      entry: proposal.proposalResourceUri,
    })
    expect(inserts.find((item) => item.table === inboxNotificationResource)?.values).toMatchObject({
      id: 'notification-1',
      object: approvalUri,
    })
  })

  it('rejects approval when no linked WAC ACL policy was confirmed', async () => {
    const proposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/README.md',
      activePolicyUri: null,
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      provider: 'unknown',
      audience: 'public',
      audienceRef: 'public',
      role: 'viewer',
      modes: ['read'],
      reason: 'Public may read.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const proposalSource = renderAccessPolicyProposalTurtle(proposal)
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      if (String(uri) === proposal.proposalResourceUri) {
        return new Response(proposalSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (init?.method === 'PUT') {
        return new Response('', { status: 201 })
      }
      return new Response('missing', { status: 404 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveAccessPolicyProposalFromInbox(db as any, proposal.id)).rejects.toThrow(
      'Refusing to apply access proposal without a confirmed linked WAC ACL policy',
    )
    expect(authFetch).not.toHaveBeenCalledWith('https://pod.example/public/README.md.acl', expect.objectContaining({
      method: 'PUT',
    }))
  })

  it('approves a confirmed WAC ACL proposal by saving the linked ACL with its ETag', async () => {
    const proposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/README.md',
      activePolicyUri: 'https://pod.example/public/README.md.acl',
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Let Ingest refresh linked cards.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const proposalSource = renderAccessPolicyProposalTurtle(proposal)
    let aclContent = '@prefix acl: <http://www.w3.org/ns/auth/acl#> .\n<#owner> a acl:Authorization ; acl:accessTo <https://pod.example/public/README.md> ; acl:mode acl:Read, acl:Write, acl:Control .\n'
    let savedAcl = ''
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(proposalSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (url === proposal.targetPolicyUri && init?.method === 'PUT') {
        expect(init.headers).toEqual({
          'Content-Type': 'text/turtle',
          'If-Match': '"acl-1"',
        })
        savedAcl = String(init.body)
        aclContent = savedAcl
        return new Response(null, { status: 204 })
      }
      if (url === proposal.targetPolicyUri) {
        return new Response(aclContent, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"acl-1"' },
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

    await expect(approveAccessPolicyProposalFromInbox(db as any, proposal.id)).resolves.toMatchObject({
      id: proposal.id,
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      activePolicyUri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
    })

    expect(savedAcl).toContain('<#owner> a acl:Authorization')
    expect(savedAcl).toContain('<#agent-editor-https-agent-example-profile-me> a acl:Authorization')
    expect(savedAcl).toContain('acl:agent <https://agent.example/profile#me>')
    expect(savedAcl).toContain('acl:mode acl:Read, acl:Append, acl:Write')
    expect(authFetch).toHaveBeenCalledWith(proposal.targetPolicyUri, expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining('Let Ingest refresh linked cards.'),
    }))
  })

  it('creates a missing confirmed WAC ACL sidecar without overwriting an existing policy', async () => {
    const proposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/README.md',
      activePolicyUri: 'https://pod.example/public/README.md.acl',
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      audience: 'public',
      audienceRef: 'public',
      role: 'viewer',
      modes: ['read'],
      reason: 'Public may read published notes.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const proposalSource = renderAccessPolicyProposalTurtle(proposal)
    let createdAcl = ''
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(proposalSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (url === proposal.targetPolicyUri && init?.method === 'PUT') {
        expect(init.headers).toEqual({
          'Content-Type': 'text/turtle',
          'If-None-Match': '*',
        })
        createdAcl = String(init.body)
        return new Response(null, { status: 201 })
      }
      if (url === proposal.targetPolicyUri) {
        if (!createdAcl) return new Response('missing', { status: 404 })
        return new Response(createdAcl, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"acl-created"' },
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

    await expect(approveAccessPolicyProposalFromInbox(db as any, proposal.id)).resolves.toMatchObject({
      id: proposal.id,
      targetPolicyUri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
    })

    expect(createdAcl).toContain('<#public-viewer-public> a acl:Authorization')
    expect(createdAcl).toContain('acl:accessTo <https://pod.example/public/README.md>')
    expect(createdAcl).toContain('acl:agentClass foaf:Agent')
    expect(createdAcl).toContain('acl:mode acl:Read')
    expect(authFetch).toHaveBeenCalledWith(proposal.targetPolicyUri, expect.objectContaining({
      method: 'PUT',
      headers: {
        'Content-Type': 'text/turtle',
        'If-None-Match': '*',
      },
      body: expect.stringContaining('Public may read published notes.'),
    }))
  })

  it('blocks ACR access proposal approval because Files cannot apply ACP policies yet', async () => {
    const proposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/README.md',
      activePolicyUri: 'https://pod.example/public/README.md.acr',
      targetPolicyUri: 'https://pod.example/public/README.md.acr',
      provider: 'acr',
      audience: 'authenticated',
      audienceRef: 'authenticated',
      role: 'contributor',
      modes: ['read', 'append'],
      reason: 'Signed-in collaborators may append through ACR review.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const proposalSource = renderAccessPolicyProposalTurtle(proposal)
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      if (String(uri) === proposal.proposalResourceUri) {
        return new Response(proposalSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (String(uri) === proposal.targetPolicyUri && init?.method === 'PUT') {
        throw new Error('ACR policy must not be written by Files approval.')
      }
      return new Response('missing', { status: 404 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveAccessPolicyProposalFromInbox(db as any, proposal.id)).rejects.toThrow(
      'ACR access proposal cannot be approved automatically because ACP policy application is not supported yet.',
    )
    expect(authFetch).not.toHaveBeenCalledWith(proposal.targetPolicyUri, expect.objectContaining({
      method: 'PUT',
    }))
  })

  it('refuses to approve an access proposal outside the current Pod', async () => {
    const authFetch = vi.fn()
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveAccessPolicyProposalFromInbox(
      db as any,
      'https://evil.example/.data/proposals/access/public-viewer.ttl#proposal',
    )).rejects.toThrow('Refusing to approve access policy proposal outside the current Pod.')
    expect(authFetch).not.toHaveBeenCalled()
  })

  it('refuses to approve an access proposal that targets another Pod policy', async () => {
    const proposalResourceUri = 'https://pod.example/.data/proposals/access/public-viewer.ttl'
    const proposal = createAccessPolicyProposal({
      ownerUri: 'https://evil.example/public/README.md',
      activePolicyUri: 'https://evil.example/public/README.md.acl',
      targetPolicyUri: 'https://evil.example/public/README.md.acl',
      provider: 'acl',
      audience: 'public',
      audienceRef: 'public',
      role: 'viewer',
      modes: ['read'],
      reason: 'Public may read.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL) => {
      if (String(uri) === proposalResourceUri) {
        return new Response(renderAccessPolicyProposalTurtle({
          ...proposal,
          proposalResourceUri,
          id: `${proposalResourceUri}#proposal`,
        }), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
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

    await expect(approveAccessPolicyProposalFromInbox(db as any, `${proposalResourceUri}#proposal`)).rejects.toThrow(
      'Refusing to approve access policy proposal outside the current Pod.',
    )
    expect(authFetch).not.toHaveBeenCalledWith('https://evil.example/public/README.md.acl', expect.anything())
  })
})
