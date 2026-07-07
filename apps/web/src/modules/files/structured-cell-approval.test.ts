import { beforeEach, describe, expect, it, vi } from 'vitest'
import { approvalResource, auditResource, inboxNotificationResource } from '@undefineds.co/models'
import {
  applyStructuredCellChangeProposalToTurtle,
  createStructuredCellChangeProposal,
  parseStructuredCellChangeProposalTurtle,
  renderStructuredCellChangeProposalTurtle,
} from './domain/proposal/structured-cell-approval-model'
import {
  approveStructuredCellChangeProposalFromInbox,
  createStructuredCellChangeProposalInboxApproval,
} from './data/proposal/structured-cell-approval-commands'
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

describe('structured cell change approvals', () => {
  it('renders and parses a structured cell proposal without canonical writes', () => {
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'mode',
      previousValues: ['"read"'],
      nextValues: ['"read/write"'],
      reason: 'Kanban move staged for review.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal).toMatchObject({
      kind: 'structured-cell-change-proposal',
      status: 'pending',
      operation: 'replace-values',
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'mode',
      previousValues: ['"read"'],
      nextValues: ['"read/write"'],
      reason: 'Kanban move staged for review.',
      writesCanonicalResource: false,
    })
    expect(proposal.proposalResourceUri).toMatch(
      /^https:\/\/pod\.example\/\.data\/proposals\/cell\/https-pod-example-data-workspaces-ws-1-state-ttl-workspace-mode-[a-z0-9]{7}\.ttl$/,
    )
    expect(proposal.id).toBe(`${proposal.proposalResourceUri}#proposal`)

    const source = renderStructuredCellChangeProposalTurtle(proposal)
    expect(source).toContain('udfs:StructuredCellChangeProposal')
    expect(source).toContain('udfs:sourceDocument <https://pod.example/.data/workspaces/ws-1/state.ttl>')
    expect(source).toContain('udfs:subject "#Workspace"')
    expect(source).toContain('udfs:predicate "mode"')
    expect(source).toContain('udfs:previousValue "\\"read\\""')
    expect(source).toContain('udfs:nextValue "\\"read/write\\""')
    expect(source).toContain('udfs:writesCanonicalResource false')

    expect(parseStructuredCellChangeProposalTurtle(source, proposal.proposalResourceUri)).toEqual(proposal)
  })

  it('records the pending vocab proposal that defines an unconfirmed predicate', () => {
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'https://pod.example/.vocab/terms.ttl#summary',
      previousValues: ['"Existing"'],
      nextValues: ['"Updated"'],
      vocabTermProposalResourceUri: 'https://pod.example/.data/proposals/vocab/summary-abc1234.ttl',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal.vocabTermProposalResourceUri).toBe('https://pod.example/.data/proposals/vocab/summary-abc1234.ttl')

    const source = renderStructuredCellChangeProposalTurtle(proposal)
    expect(source).toContain('udfs:vocabProposal <https://pod.example/.data/proposals/vocab/summary-abc1234.ttl>')
    expect(parseStructuredCellChangeProposalTurtle(source, proposal.proposalResourceUri)).toMatchObject({
      predicate: 'https://pod.example/.vocab/terms.ttl#summary',
      vocabTermProposalResourceUri: 'https://pod.example/.data/proposals/vocab/summary-abc1234.ttl',
    })
  })

  it('parses structured cell proposal fields after Pod expansion to absolute predicate IRIs', () => {
    const proposalResourceUri = 'https://pod.example/.data/proposals/cell/workspace-mode.ttl'
    const source = [
      '<https://pod.example/.data/proposals/cell/workspace-mode.ttl#proposal> <https://undefineds.co/vocab/sourceDocument> <https://pod.example/.data/workspaces/ws-1/state.ttl> .',
      '<https://pod.example/.data/proposals/cell/workspace-mode.ttl#proposal> <https://undefineds.co/vocab/subject> "#Workspace" .',
      '<https://pod.example/.data/proposals/cell/workspace-mode.ttl#proposal> <https://undefineds.co/vocab/predicate> "mode" .',
      '<https://pod.example/.data/proposals/cell/workspace-mode.ttl#proposal> <https://undefineds.co/vocab/previousValue> "\\"read\\"" .',
      '<https://pod.example/.data/proposals/cell/workspace-mode.ttl#proposal> <https://undefineds.co/vocab/nextValue> "\\"read/write\\"" .',
      '<https://pod.example/.data/proposals/cell/workspace-mode.ttl#proposal> <http://purl.org/dc/terms/description> "Kanban move staged for review." .',
      '<https://pod.example/.data/proposals/cell/workspace-mode.ttl#proposal> <http://purl.org/dc/terms/created> "2026-06-17T00:00:00.000Z" .',
    ].join('\n')

    expect(parseStructuredCellChangeProposalTurtle(source, proposalResourceUri)).toMatchObject({
      id: `${proposalResourceUri}#proposal`,
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'mode',
      previousValues: ['"read"'],
      nextValues: ['"read/write"'],
      reason: 'Kanban move staged for review.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
  })

  it('parses resolved structured cell proposal status from turtle', () => {
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'mode',
      previousValues: ['"read"'],
      nextValues: ['"read/write"'],
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    const resolvedSource = updateProposalStatusInTurtle(renderStructuredCellChangeProposalTurtle(proposal), 'approved')

    expect(parseStructuredCellChangeProposalTurtle(resolvedSource, proposal.proposalResourceUri)).toMatchObject({
      id: proposal.id,
      status: 'approved',
    })
  })

  it.each(['approved', 'rejected'] as const)(
    'rejects a resolved %s structured cell proposal before reading or writing the target resource',
    async (status) => {
      const proposal = createStructuredCellChangeProposal({
        documentUri: 'https://pod.example/public/README.md.meta',
        subject: '#meta',
        predicate: 'rdfs:label',
        previousValues: ['"Original meta title"'],
        nextValues: ['"Edited meta title"'],
        createdAt: '2026-06-17T00:00:00.000Z',
      })
      const proposalSource = updateProposalStatusInTurtle(renderStructuredCellChangeProposalTurtle(proposal), status)
      const authFetch = vi.fn(async (uri: RequestInfo | URL) => {
        const url = String(uri)
        if (url === proposal.proposalResourceUri) {
          return new Response(proposalSource, {
            status: 200,
            headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-cell-1"' },
          })
        }
        if (url === proposal.documentUri) {
          throw new Error('resolved structured cell proposal must not read or write canonical resource')
        }
        return new Response('missing', { status: 404 })
      })
      const db = {
        getDialect: () => ({
          getPodUrl: () => 'https://pod.example/',
          getAuthenticatedFetch: () => authFetch,
        }),
      }

      await expect(approveStructuredCellChangeProposalFromInbox(db as any, proposal.id)).rejects.toThrow(
        `Cannot approve structured cell proposal because it is already ${status}.`,
      )
      expect(authFetch).toHaveBeenCalledTimes(1)
      expect(authFetch.mock.calls[0]?.[0]).toBe(proposal.proposalResourceUri)
      expect(authFetch).not.toHaveBeenCalledWith(proposal.documentUri, expect.anything())
    },
  )

  it('places root-level path-based Pod proposals under the containing Pod path', () => {
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/alice/state.ttl',
      podRootUri: 'https://pod.example/alice/',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Draft title"'],
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal.proposalResourceUri).toMatch(
      /^https:\/\/pod\.example\/alice\/\.data\/proposals\/cell\/https-pod-example-alice-state-ttl-workspace-title-[a-z0-9]{7}\.ttl$/,
    )
  })

  it('places nested path-based Pod cell proposals under the selected current Pod root', () => {
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://node-0000.undefineds.co/alice/public/state.ttl',
      podRootUri: 'https://node-0000.undefineds.co/alice/',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Draft title"'],
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal.proposalResourceUri).toMatch(
      /^https:\/\/node-0000\.undefineds\.co\/alice\/\.data\/proposals\/cell\/https-node-0000-undefineds-co-alice-public-state-ttl-workspace-title-[a-z0-9]{7}\.ttl$/,
    )
  })

  it('keeps repeated structured cell proposals for the same cell in distinct proposal resources', () => {
    const first = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Draft title"'],
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const second = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Second title"'],
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(first.proposalResourceUri).not.toBe(second.proposalResourceUri)
    expect(first.proposalResourceUri).toMatch(
      /^https:\/\/pod\.example\/\.data\/proposals\/cell\/https-pod-example-data-workspaces-ws-1-state-ttl-workspace-title-[a-z0-9]{7}\.ttl$/,
    )
    expect(second.proposalResourceUri).toMatch(
      /^https:\/\/pod\.example\/\.data\/proposals\/cell\/https-pod-example-data-workspaces-ws-1-state-ttl-workspace-title-[a-z0-9]{7}\.ttl$/,
    )
  })

  it('creates an inbox approval and notification for a structured cell proposal', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('approval-1')
      .mockReturnValueOnce('audit-1')
      .mockReturnValueOnce('notification-1')
    const { db, inserts } = createMockDb()
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'mode',
      previousValues: ['"read"'],
      nextValues: ['"read/write"'],
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    const approvalUri = await createStructuredCellChangeProposalInboxApproval(db as any, {
      actorWebId: 'https://id.example/alice#me',
      proposal,
      createdAt: new Date('2026-06-17T00:00:00.000Z'),
    })

    expect(approvalUri).toBe('https://pod.example/.data/approvals/2026/06/17.ttl#approval-1')
    expect(inserts.find((item) => item.table === approvalResource)?.values).toMatchObject({
      id: 'approval-1',
      session: proposal.id,
      toolCallId: 'files.structured-cell.proposal:approval-1',
      toolName: 'files.structured-cell.proposal',
      target: proposal.id,
      action: 'https://undefineds.co/vocab/approveStructuredCellChangeProposal',
      risk: 'medium',
      status: 'pending',
      assignedTo: 'https://id.example/alice#me',
      policyVersion: 'files-structured-cell-proposal-v1',
    })
    expect(inserts.find((item) => item.table === auditResource)?.values).toMatchObject({
      id: 'audit-1',
      action: 'files.structured-cell.proposal.requested',
      actor: 'https://id.example/alice#me',
      actorRole: 'human',
      approval: approvalUri,
      entry: proposal.proposalResourceUri,
      toolName: 'files.structured-cell.proposal',
      policyVersion: 'files-structured-cell-proposal-v1',
    })
    expect(inserts.find((item) => item.table === inboxNotificationResource)?.values).toMatchObject({
      id: 'notification-1',
      actor: 'https://id.example/alice#me',
      object: approvalUri,
    })
  })

  it('applies an approved structured cell proposal to the target Turtle resource with SPARQL PATCH', async () => {
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'mode',
      previousValues: ['"read"'],
      nextValues: ['"read/write"'],
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(applyStructuredCellChangeProposalToTurtle(
      '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; mode "read" .',
      proposal,
    )).toContain('mode "read/write"')

    let patchBody = ''
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderStructuredCellChangeProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-cell-1"' },
        })
      }
      if (init?.method === 'PATCH' && url === proposal.documentUri) {
        expect(init.headers).toEqual({
          'Content-Type': 'application/sparql-update',
        })
        patchBody = String(init.body)
        return new Response(null, { status: 204 })
      }
      if (init?.method === 'PUT' && url === proposal.documentUri) {
        throw new Error('structured data proposal approval must not rewrite RDF resources with PUT')
      }
      if (url === proposal.documentUri) {
        return new Response('@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; mode "read" .', {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"target-cell-1"' },
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

    await expect(approveStructuredCellChangeProposalFromInbox(db as any, proposal.id)).resolves.toMatchObject({
      subject: '#Workspace',
      predicate: 'mode',
    })
    expect(patchBody).toContain('BASE <https://pod.example/.data/workspaces/ws-1/state.ttl>')
    expect(patchBody).toContain('DELETE DATA')
    expect(patchBody).toContain('<#Workspace> mode "read" .')
    expect(patchBody).toContain('INSERT DATA')
    expect(patchBody).toContain('<#Workspace> mode "read/write" .')
  })

  it('applies an approved editable file .meta proposal with SPARQL PATCH instead of raw PUT', async () => {
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/public/README.md.meta',
      subject: '#meta',
      predicate: 'rdfs:label',
      previousValues: ['"Original meta title"'],
      nextValues: ['"Edited meta title"'],
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    let patchBody = ''
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderStructuredCellChangeProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-cell-1"' },
        })
      }
      if (init?.method === 'PATCH' && url === proposal.documentUri) {
        expect(init.headers).toEqual({
          'Content-Type': 'application/sparql-update',
        })
        patchBody = String(init.body)
        return new Response(null, { status: 204 })
      }
      if (init?.method === 'PUT' && url === proposal.documentUri) {
        throw new Error('metadata proposal approval must not rewrite .meta with PUT')
      }
      if (url === proposal.documentUri) {
        return new Response([
          '<#meta> <http://www.w3.org/2000/01/rdf-schema#label> "Original meta title";',
          '    <https://undefineds.co/vocab/tags> "docs", "smoke".',
        ].join('\n'), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle' },
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

    await expect(approveStructuredCellChangeProposalFromInbox(db as any, proposal.id)).resolves.toMatchObject({
      documentUri: 'https://pod.example/public/README.md.meta',
      subject: '#meta',
      predicate: 'rdfs:label',
    })
    expect(patchBody).toContain('BASE <https://pod.example/public/README.md.meta>')
    expect(patchBody).toContain('PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>')
    expect(patchBody).toContain('DELETE DATA')
    expect(patchBody).toContain('<#meta> rdfs:label "Original meta title" .')
    expect(patchBody).toContain('INSERT DATA')
    expect(patchBody).toContain('<#meta> rdfs:label "Edited meta title" .')
  })

  it('bootstraps a missing metadata .meta resource before applying its SPARQL PATCH', async () => {
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/public/README.md.meta',
      subject: '#meta',
      predicate: 'rdfs:label',
      previousValues: [],
      nextValues: ['"Bootstrapped title"'],
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    const calls: Array<{ url: string; method: string; headers: HeadersInit | undefined; body: string }> = []
    let metadataExists = false
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      const method = init?.method ?? 'GET'
      calls.push({ url, method, headers: init?.headers, body: String(init?.body ?? '') })

      if (url === proposal.proposalResourceUri) {
        return new Response(renderStructuredCellChangeProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-cell-1"' },
        })
      }
      if (url === proposal.documentUri && method === 'GET') {
        if (!metadataExists) return new Response('missing', { status: 404 })
        return new Response('@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n', {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"meta-bootstrap-1"' },
        })
      }
      if (url === proposal.documentUri && method === 'PUT') {
        expect(init?.headers).toEqual({
          'Content-Type': 'text/turtle',
          'If-None-Match': '*',
        })
        expect(String(init?.body)).toContain('@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .')
        metadataExists = true
        return new Response(null, { status: 201 })
      }
      if (url === proposal.documentUri && method === 'PATCH') {
        expect(metadataExists).toBe(true)
        expect(init?.headers).toEqual({
          'Content-Type': 'application/sparql-update',
        })
        expect(String(init?.body)).toContain('INSERT DATA')
        expect(String(init?.body)).toContain('<#meta> rdfs:label "Bootstrapped title" .')
        return new Response(null, { status: 204 })
      }
      return new Response('missing', { status: 404 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveStructuredCellChangeProposalFromInbox(db as any, proposal.id)).resolves.toMatchObject({
      documentUri: 'https://pod.example/public/README.md.meta',
      predicate: 'rdfs:label',
    })
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET ${proposal.proposalResourceUri}`,
      `GET ${proposal.documentUri}`,
      `PUT ${proposal.documentUri}`,
      `GET ${proposal.documentUri}`,
      `PATCH ${proposal.documentUri}`,
    ])
  })

  it('refuses to apply a structured cell proposal outside the current Pod', async () => {
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://evil.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'mode',
      previousValues: ['"read"'],
      nextValues: ['"read/write"'],
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderStructuredCellChangeProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-cell-1"' },
        })
      }
      if (url === proposal.documentUri) {
        return new Response('@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> mode "read" .', {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"target-cell-1"' },
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

    await expect(approveStructuredCellChangeProposalFromInbox(db as any, proposal.id))
      .rejects.toThrow('Refusing to approve structured cell proposal outside the current Pod.')
    expect(authFetch).not.toHaveBeenCalled()
  })

  it('refuses to apply structured cell proposals to locked vocab registry resources', async () => {
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.vocab/terms.ttl',
      subject: '#title',
      predicate: 'rdfs:label',
      previousValues: ['"title"'],
      nextValues: ['"Title edited from table"'],
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderStructuredCellChangeProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-cell-1"' },
        })
      }
      if (url === proposal.documentUri) {
        return new Response('<#title> <http://www.w3.org/2000/01/rdf-schema#label> "title" .', {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"vocab-1"' },
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

    await expect(approveStructuredCellChangeProposalFromInbox(db as any, proposal.id))
      .rejects.toThrow('Refusing to approve structured cell proposal against locked vocab registry resources.')
    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(authFetch.mock.calls[0]?.[0]).toBe(proposal.proposalResourceUri)
  })

  it('refuses to apply structured cell proposals to public Turtle resources outside .data', async () => {
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/public/state.ttl',
      subject: '#Workspace',
      predicate: 'mode',
      previousValues: ['"read"'],
      nextValues: ['"read/write"'],
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderStructuredCellChangeProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-cell-1"' },
        })
      }
      if (url === proposal.documentUri) {
        throw new Error('approval must not read or write public Turtle targets')
      }
      return new Response('missing', { status: 404 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveStructuredCellChangeProposalFromInbox(db as any, proposal.id))
      .rejects.toThrow('Refusing to approve structured cell proposal outside editable .data resources.')
    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(authFetch.mock.calls[0]?.[0]).toBe(proposal.proposalResourceUri)
  })

  it('refuses to apply structured cell proposals to Files-managed ingest manifests', async () => {
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/ingest/sources/report/manifest.ttl',
      subject: '#manifest',
      predicate: 'udfs:ingestStatus',
      previousValues: ['"partial"'],
      nextValues: ['"complete"'],
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderStructuredCellChangeProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-cell-1"' },
        })
      }
      if (url === proposal.documentUri) {
        throw new Error('approval must not read or write Files-managed Ingest manifests')
      }
      return new Response('missing', { status: 404 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveStructuredCellChangeProposalFromInbox(db as any, proposal.id))
      .rejects.toThrow('Refusing to approve structured cell proposal against Files-managed resources.')
    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(authFetch.mock.calls[0]?.[0]).toBe(proposal.proposalResourceUri)
  })
})
