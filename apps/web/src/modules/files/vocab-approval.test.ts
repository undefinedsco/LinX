import { beforeEach, describe, expect, it, vi } from 'vitest'
import { approvalResource, auditResource, inboxNotificationResource } from '@undefineds.co/models'
import {
  createVocabTermProposal,
  parseVocabTermProposalTurtle,
  renderVocabTermProposalTurtle,
} from './domain/structured/structured-table'
import {
  approveVocabTermProposalFromInbox,
  createVocabTermProposalInboxApproval,
} from './data/proposal/vocab-approval-commands'
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

describe('vocab proposal inbox approvals', () => {
  it('creates an inbox approval and notification for a vocab term proposal', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('approval-1')
      .mockReturnValueOnce('audit-1')
      .mockReturnValueOnce('notification-1')
    const { db, inserts } = createMockDb()
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: 'minCount 0 · maxCount 1',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    const approvalUri = await createVocabTermProposalInboxApproval(db as any, {
      actorWebId: 'https://id.example/alice#me',
      proposal,
      createdAt: new Date('2026-06-17T00:00:00.000Z'),
    })

    expect(approvalUri).toBe('https://pod.example/.data/approvals/2026/06/17.ttl#approval-1')
    const approval = inserts.find((item) => item.table === approvalResource)?.values
    const audit = inserts.find((item) => item.table === auditResource)?.values
    const notification = inserts.find((item) => item.table === inboxNotificationResource)?.values

    expect(approval).toMatchObject({
      id: 'approval-1',
      session: proposal.id,
      toolCallId: 'files.vocab.proposal:approval-1',
      toolName: 'files.vocab.proposal',
      target: proposal.id,
      action: 'https://undefineds.co/vocab/approveVocabTermProposal',
      risk: 'medium',
      status: 'pending',
      assignedTo: 'https://id.example/alice#me',
      policyVersion: 'files-vocab-proposal-v1',
    })
    expect(audit).toMatchObject({
      id: 'audit-1',
      action: 'files.vocab.proposal.requested',
      actor: 'https://id.example/alice#me',
      actorRole: 'human',
      approval: approvalUri,
      entry: proposal.proposalResourceUri,
      toolName: 'files.vocab.proposal',
      policyVersion: 'files-vocab-proposal-v1',
    })
    expect(notification).toMatchObject({
      id: 'notification-1',
      actor: 'https://id.example/alice#me',
      object: approvalUri,
    })
  })

  it('parses a proposal resource and applies it to canonical vocab terms', async () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: 'minCount 0 · maxCount 1',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const proposalSource = renderVocabTermProposalTurtle(proposal)
    const parsed = parseVocabTermProposalTurtle(proposalSource, proposal.proposalResourceUri)
    expect(parsed).toMatchObject({
      id: proposal.id,
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
      termKind: 'predicate',
      label: 'summary',
      classScope: 'udfs:Workspace',
    })

    let savedVocabSource = ''
    let savedShapesSource = ''
    let savedNamespacesSource = ''
    let patchedVocabSource = ''
    let patchedShapesSource = ''
    const namespacesUri = 'https://pod.example/.vocab/namespaces.ttl'
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (init?.method === 'PATCH') {
        if (url === proposal.targetVocabUri) patchedVocabSource = String(init.body)
        if (url === proposal.targetShapesUri) patchedShapesSource = String(init.body)
        return new Response('', { status: 200 })
      }
      if (init?.method === 'PUT') {
        if (url === proposal.targetVocabUri) savedVocabSource = String(init.body)
        if (url === proposal.targetShapesUri) savedShapesSource = String(init.body)
        if (url === namespacesUri) savedNamespacesSource = String(init.body)
        return new Response('', { status: 200 })
      }
      if (url === proposal.proposalResourceUri) {
        return new Response(proposalSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (url === proposal.targetVocabUri) {
        return new Response(savedVocabSource || '@prefix udfs: <https://undefineds.co/vocab/> .\n', {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"terms-1"' },
        })
      }
      if (url === proposal.targetShapesUri) {
        return new Response(savedShapesSource || '@prefix udfs: <https://undefineds.co/vocab/> .\n', {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"shapes-1"' },
        })
      }
      if (url === namespacesUri) {
        if (!savedNamespacesSource) return new Response('missing', { status: 404 })
        return new Response(savedNamespacesSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"namespaces-1"' },
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

    await approveVocabTermProposalFromInbox(db as any, proposal.id)

    expect(authFetch).toHaveBeenCalledWith(proposal.targetVocabUri, expect.objectContaining({
      method: 'PATCH',
      headers: expect.objectContaining({ 'Content-Type': 'application/sparql-update' }),
    }))
    expect(authFetch).toHaveBeenCalledWith(proposal.targetShapesUri, expect.objectContaining({
      method: 'PATCH',
      headers: expect.objectContaining({ 'Content-Type': 'application/sparql-update' }),
    }))
    expect(savedNamespacesSource).toContain('<#registry> a udfs:VocabNamespaceRegistry')
    expect(patchedVocabSource).toContain('<https://pod.example/.vocab/terms.ttl#summary> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/PredicateTerm> .')
    expect(patchedVocabSource).toContain(`<https://pod.example/.vocab/terms.ttl#summary> <https://undefineds.co/vocab/sourceProposal> <${proposal.id}> .`)
    expect(patchedShapesSource).toContain('<https://pod.example/.vocab/shapes.ttl#summary-shape> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/ShapeRule> .')
    expect(patchedShapesSource).toContain('<https://pod.example/.vocab/shapes.ttl#summary-shape> <https://undefineds.co/vocab/constraint> "minCount 0 · maxCount 1" .')
    expect(savedNamespacesSource).toContain('udfs:prefix "udfs"')
    expect(savedNamespacesSource).toContain('udfs:prefix "rdf"')
    expect(savedNamespacesSource).toContain('udfs:prefix "rdfs"')
  })

  it('preserves explicit enum option predicate relations through parse and canonical patching', async () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#core',
      termKind: 'enum-option',
      predicate: '#tags',
      label: 'core',
      valueType: 'enum-option',
      description: 'Core topic.',
      shape: 'predicate #tags',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const proposalSource = renderVocabTermProposalTurtle(proposal)

    expect(parseVocabTermProposalTurtle(proposalSource, proposal.proposalResourceUri)).toMatchObject({
      termKind: 'enum-option',
      predicate: 'https://pod.example/.vocab/terms.ttl#tags',
      label: 'core',
    })

    let patchedVocabSource = ''
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (init?.method === 'PATCH' && url === proposal.targetVocabUri) {
        patchedVocabSource = String(init.body)
        return new Response(null, { status: 204 })
      }
      if (init?.method === 'PATCH') return new Response(null, { status: 204 })
      if (init?.method === 'PUT') return new Response(null, { status: 204 })
      if (url === proposal.proposalResourceUri) {
        return new Response(proposalSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-vocab-1"' },
        })
      }
      if (url === proposal.targetVocabUri) {
        return new Response('@prefix udfs: <https://undefineds.co/vocab/> .\n', {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"vocab-1"' },
        })
      }
      if (url === proposal.targetShapesUri) {
        return new Response('@prefix udfs: <https://undefineds.co/vocab/> .\n', {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"shapes-1"' },
        })
      }
      if (url.endsWith('/.vocab/namespaces.ttl')) {
        return new Response('@prefix udfs: <https://undefineds.co/vocab/> .\n', {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"namespaces-1"' },
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

    await approveVocabTermProposalFromInbox(db as any, proposal.id)

    expect(patchedVocabSource).toContain('<https://pod.example/.vocab/terms.ttl#core> <https://undefineds.co/vocab/predicate> <https://pod.example/.vocab/terms.ttl#tags> .')
  })

  it('parses a normalized N-Triples proposal returned by a real Pod', () => {
    const proposalUri = 'https://pod.example/.data/proposals/vocab/summary.ttl'
    const source = [
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/term> <https://pod.example/.vocab/terms.ttl#summary> .`,
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/termKind> "predicate" .`,
      `<${proposalUri}#proposal> <http://www.w3.org/2000/01/rdf-schema#label> "summary" .`,
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/valueType> "text" .`,
      `<${proposalUri}#proposal> <http://www.w3.org/2000/01/rdf-schema#comment> "Short note summary shown on cards." .`,
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/shape> "minCount 0 · maxCount 1" .`,
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/sourceDocument> <https://pod.example/.data/workspaces/ws-1/state.ttl> .`,
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/targetVocab> <https://pod.example/.vocab/terms.ttl> .`,
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/targetShapes> <https://pod.example/.vocab/shapes.ttl> .`,
      `<${proposalUri}#proposal> <http://purl.org/dc/terms/created> "2026-06-17T00:00:00.000Z" .`,
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/classScope> "udfs:Workspace" .`,
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/status> "approved" .`,
    ].join('\n')

    expect(parseVocabTermProposalTurtle(source, proposalUri)).toMatchObject({
      id: `${proposalUri}#proposal`,
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
      targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: 'minCount 0 · maxCount 1',
      classScope: 'udfs:Workspace',
      status: 'approved',
    })
  })

  it('parses rejected proposal status after Pod expansion to absolute predicate IRIs', () => {
    const proposalUri = 'https://pod.example/.data/proposals/vocab/rejected.ttl'
    const source = [
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/term> <https://pod.example/.vocab/terms.ttl#summary> .`,
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/termKind> "predicate" .`,
      `<${proposalUri}#proposal> <http://www.w3.org/2000/01/rdf-schema#label> "summary" .`,
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/valueType> "text" .`,
      `<${proposalUri}#proposal> <http://www.w3.org/2000/01/rdf-schema#comment> "Short note summary shown on cards." .`,
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/shape> "minCount 0 · maxCount 1" .`,
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/sourceDocument> <https://pod.example/.data/workspaces/ws-1/state.ttl> .`,
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/targetVocab> <https://pod.example/.vocab/terms.ttl> .`,
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/targetShapes> <https://pod.example/.vocab/shapes.ttl> .`,
      `<${proposalUri}#proposal> <https://undefineds.co/vocab/status> "rejected" .`,
    ].join('\n')

    expect(parseVocabTermProposalTurtle(source, proposalUri)).toMatchObject({
      id: `${proposalUri}#proposal`,
      status: 'rejected',
    })
  })

  it.each(['approved', 'rejected'] as const)(
    'rejects a resolved %s vocab proposal before reading or writing canonical vocab resources',
    async (status) => {
      const proposal = createVocabTermProposal({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        classScope: 'udfs:Workspace',
        termUri: 'https://pod.example/.vocab/terms.ttl#summary',
        termKind: 'predicate',
        label: 'summary',
        valueType: 'text',
        description: 'Short note summary shown on cards.',
        shape: 'minCount 0 · maxCount 1',
        createdAt: '2026-06-17T00:00:00.000Z',
      })
      const proposalSource = updateProposalStatusInTurtle(renderVocabTermProposalTurtle(proposal), status)
      const authFetch = vi.fn(async (uri: RequestInfo | URL) => {
        const url = String(uri)
        if (url === proposal.proposalResourceUri) {
          return new Response(proposalSource, {
            status: 200,
            headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
          })
        }
        throw new Error('resolved vocab proposal must not read or write canonical vocab resources')
      })
      const db = {
        getDialect: () => ({
          getPodUrl: () => 'https://pod.example/',
          getAuthenticatedFetch: () => authFetch,
        }),
      }

      await expect(approveVocabTermProposalFromInbox(db as any, proposal.id)).rejects.toThrow(
        `Cannot approve vocab proposal because it is already ${status}.`,
      )
      expect(authFetch).toHaveBeenCalledTimes(1)
      expect(authFetch.mock.calls[0]?.[0]).toBe(proposal.proposalResourceUri)
    },
  )

  it('patches canonical vocab registries even when the Pod returns N-Triples', async () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: 'minCount 0 · maxCount 1',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const proposalSource = renderVocabTermProposalTurtle(proposal)
    const patchContentTypes: string[] = []
    const patchBodies: string[] = []
    const savedByUrl = new Map<string, string>()
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (init?.method === 'PATCH') {
        patchContentTypes.push(String((init.headers as Record<string, string>)['Content-Type']))
        patchBodies.push(String(init.body))
        return new Response('', { status: 200 })
      }
      if (init?.method === 'PUT') {
        savedByUrl.set(url, String(init.body))
        return new Response('', { status: 200 })
      }
      if (url === proposal.proposalResourceUri) {
        return new Response(proposalSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (url === proposal.targetVocabUri) {
        return new Response([
          '<https://pod.example/.vocab/terms.ttl#registry> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/VocabTermRegistry> .',
          '<https://pod.example/.vocab/terms.ttl#registry> <http://www.w3.org/2000/01/rdf-schema#label> "Personal vocab terms" .',
        ].join('\n'), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"terms-1"' },
        })
      }
      if (url === proposal.targetShapesUri) {
        return new Response([
          '<https://pod.example/.vocab/shapes.ttl#registry> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/VocabShapeRegistry> .',
        ].join('\n'), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"shapes-1"' },
        })
      }
      if (url === 'https://pod.example/.vocab/namespaces.ttl') {
        const saved = savedByUrl.get(url)
        if (saved) {
          return new Response(saved, {
            status: 200,
            headers: { 'Content-Type': 'text/turtle', ETag: '"namespaces-1"' },
          })
        }
        return new Response('missing', { status: 404 })
      }
      return new Response('missing', { status: 404 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await approveVocabTermProposalFromInbox(db as any, proposal.id)

    expect(patchContentTypes).toEqual(['application/sparql-update', 'application/sparql-update'])
    expect(patchBodies.join('\n')).toContain('<https://pod.example/.vocab/terms.ttl#summary> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/PredicateTerm> .')
    expect(patchBodies.join('\n')).toContain('<https://pod.example/.vocab/shapes.ttl#summary-shape> <https://undefineds.co/vocab/constraint> "minCount 0 · maxCount 1" .')
  })

  it('patches approved terms and shapes into existing RDF vocab registries', async () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: 'minCount 0 · maxCount 1',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const proposalSource = renderVocabTermProposalTurtle(proposal)
    const patchCalls: Array<{ url: string; body: string; contentType: string | undefined }> = []
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (init?.method === 'PATCH') {
        patchCalls.push({
          url,
          body: String(init.body),
          contentType: (init.headers as Record<string, string> | undefined)?.['Content-Type'],
        })
        return new Response(null, { status: 204 })
      }
      if (init?.method === 'PUT') {
        return new Response('', { status: 201 })
      }
      if (url === proposal.proposalResourceUri) {
        return new Response(proposalSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (url === proposal.targetVocabUri) {
        return new Response([
          '<https://pod.example/.vocab/terms.ttl#registry> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/VocabTermRegistry> .',
          '<https://pod.example/.vocab/terms.ttl#registry> <http://www.w3.org/2000/01/rdf-schema#label> "Personal vocab terms" .',
        ].join('\n'), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"terms-1"' },
        })
      }
      if (url === proposal.targetShapesUri) {
        return new Response([
          '<https://pod.example/.vocab/shapes.ttl#registry> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/VocabShapeRegistry> .',
        ].join('\n'), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"shapes-1"' },
        })
      }
      if (url === 'https://pod.example/.vocab/namespaces.ttl') {
        return new Response('@prefix udfs: <https://undefineds.co/vocab/> .\n', {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"namespaces-1"' },
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

    await approveVocabTermProposalFromInbox(db as any, proposal.id)

    expect(patchCalls).toEqual([
      expect.objectContaining({
        url: proposal.targetVocabUri,
        contentType: 'application/sparql-update',
        body: expect.stringContaining('INSERT DATA'),
      }),
      expect.objectContaining({
        url: proposal.targetShapesUri,
        contentType: 'application/sparql-update',
        body: expect.stringContaining('INSERT DATA'),
      }),
    ])
    expect(patchCalls[0]?.body).toContain('<https://pod.example/.vocab/terms.ttl#summary> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/PredicateTerm> .')
    expect(patchCalls[1]?.body).toContain('<https://pod.example/.vocab/shapes.ttl#summary-shape> <https://undefineds.co/vocab/constraint> "minCount 0 · maxCount 1" .')
  })

  it('creates shapes.ttl when approving a shaped proposal and the shape registry is missing', async () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: 'minCount 0 · maxCount 1',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const proposalSource = renderVocabTermProposalTurtle(proposal)
    let createdShapesSource = ''
    let createdNamespacesSource = ''
    let patchedShapesSource = ''
    const namespacesUri = 'https://pod.example/.vocab/namespaces.ttl'
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (init?.method === 'PATCH' && url === proposal.targetShapesUri) {
        patchedShapesSource = String(init.body)
        return new Response('', { status: 200 })
      }
      if (init?.method === 'PATCH') {
        return new Response('', { status: 200 })
      }
      if (init?.method === 'PUT' && url === proposal.targetShapesUri) {
        createdShapesSource = String(init.body)
        return new Response('', { status: 201 })
      }
      if (init?.method === 'PUT' && url === namespacesUri) {
        createdNamespacesSource = String(init.body)
        return new Response('', { status: 201 })
      }
      if (init?.method === 'PUT') {
        return new Response('', { status: 200 })
      }
      if (url === proposal.proposalResourceUri) {
        return new Response(proposalSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (url === proposal.targetVocabUri) {
        return new Response('@prefix udfs: <https://undefineds.co/vocab/> .\n', {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"terms-1"' },
        })
      }
      if (url === proposal.targetShapesUri) {
        if (!createdShapesSource) {
          return new Response('missing', { status: 404 })
        }
        return new Response(createdShapesSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"shapes-1"' },
        })
      }
      if (url === namespacesUri) {
        if (!createdNamespacesSource) {
          return new Response('missing', { status: 404 })
        }
        return new Response(createdNamespacesSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"namespaces-1"' },
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

    await approveVocabTermProposalFromInbox(db as any, proposal.id)

    expect(authFetch).toHaveBeenCalledWith(proposal.targetShapesUri, expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'If-None-Match': '*' }),
    }))
    expect(createdShapesSource).toContain('<#registry> a udfs:VocabShapeRegistry')
    expect(patchedShapesSource).toContain('<https://pod.example/.vocab/shapes.ttl#summary-shape> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/ShapeRule> .')
  })

  it('bootstraps missing vocab registry resources before applying a proposal', async () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: '',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const proposalSource = renderVocabTermProposalTurtle(proposal)
    let termsSource = ''
    let shapesSource = ''
    let namespacesSource = ''
    let termsPatch = ''
    const namespacesUri = 'https://pod.example/.vocab/namespaces.ttl'
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (init?.method === 'PATCH') {
        if (url === proposal.targetVocabUri) termsPatch = String(init.body)
        return new Response('', { status: 200 })
      }
      if (init?.method === 'PUT') {
        if (url === proposal.targetVocabUri) termsSource = String(init.body)
        if (url === proposal.targetShapesUri) shapesSource = String(init.body)
        if (url === namespacesUri) namespacesSource = String(init.body)
        return new Response('', { status: termsSource.includes('PredicateTerm') ? 200 : 201 })
      }
      if (url === proposal.proposalResourceUri) {
        return new Response(proposalSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (url === proposal.targetVocabUri) {
        if (!termsSource) return new Response('missing', { status: 404 })
        return new Response(termsSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"terms-1"' },
        })
      }
      if (url === proposal.targetShapesUri) {
        if (!shapesSource) return new Response('missing', { status: 404 })
        return new Response(shapesSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"shapes-1"' },
        })
      }
      if (url === namespacesUri) {
        if (!namespacesSource) return new Response('missing', { status: 404 })
        return new Response(namespacesSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"namespaces-1"' },
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

    await approveVocabTermProposalFromInbox(db as any, proposal.id)

    expect(authFetch).toHaveBeenCalledWith(proposal.targetVocabUri, expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'If-None-Match': '*' }),
    }))
    expect(authFetch).toHaveBeenCalledWith(proposal.targetShapesUri, expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'If-None-Match': '*' }),
    }))
    expect(authFetch).toHaveBeenCalledWith(namespacesUri, expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'If-None-Match': '*' }),
    }))
    expect(termsSource).toContain('@prefix udfs: <https://undefineds.co/vocab/> .')
    expect(termsSource).toContain('<#registry> a udfs:VocabTermRegistry')
    expect(termsPatch).toContain('<https://pod.example/.vocab/terms.ttl#summary> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/PredicateTerm> .')
    expect(shapesSource).toContain('<#registry> a udfs:VocabShapeRegistry')
    expect(namespacesSource).toContain('<#registry> a udfs:VocabNamespaceRegistry')
  })

  it('creates the .vocab container before bootstrapping first registry resources', async () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: '',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const proposalSource = renderVocabTermProposalTurtle(proposal)
    const events: string[] = []
    let vocabContainerExists = false
    let termsSource = ''
    let shapesSource = ''
    let namespacesSource = ''
    const namespacesUri = 'https://pod.example/.vocab/namespaces.ttl'
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (init?.method === 'POST' && url === 'https://pod.example/') {
        events.push('create-vocab-container')
        expect(init.headers).toEqual(expect.objectContaining({
          Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
          Slug: '.vocab',
        }))
        vocabContainerExists = true
        return new Response('', { status: 201 })
      }
      if (init?.method === 'PATCH') {
        if (url === proposal.targetVocabUri) events.push('patch-terms')
        return new Response('', { status: 200 })
      }
      if (init?.method === 'PUT') {
        if (!vocabContainerExists) return new Response('container missing', { status: 404 })
        if (url === proposal.targetVocabUri) {
          events.push('create-terms')
          termsSource = String(init.body)
        }
        if (url === proposal.targetShapesUri) {
          events.push('create-shapes')
          shapesSource = String(init.body)
        }
        if (url === namespacesUri) {
          events.push('create-namespaces')
          namespacesSource = String(init.body)
        }
        return new Response('', { status: termsSource.includes('PredicateTerm') ? 200 : 201 })
      }
      if (url === 'https://pod.example/.vocab/') {
        return vocabContainerExists
          ? new Response('', { status: 200, headers: { 'Content-Type': 'text/turtle' } })
          : new Response('missing', { status: 404 })
      }
      if (url === proposal.proposalResourceUri) {
        return new Response(proposalSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (url === proposal.targetVocabUri) {
        if (!termsSource) return new Response('missing', { status: 404 })
        return new Response(termsSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"terms-1"' },
        })
      }
      if (url === proposal.targetShapesUri) {
        if (!shapesSource) return new Response('missing', { status: 404 })
        return new Response(shapesSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"shapes-1"' },
        })
      }
      if (url === namespacesUri) {
        if (!namespacesSource) return new Response('missing', { status: 404 })
        return new Response(namespacesSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"namespaces-1"' },
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

    await approveVocabTermProposalFromInbox(db as any, proposal.id)

    expect(events).toEqual([
      'create-vocab-container',
      'create-terms',
      'create-shapes',
      'create-namespaces',
      'patch-terms',
    ])
    expect(termsSource).toContain('<#registry> a udfs:VocabTermRegistry')
    expect(shapesSource).toContain('<#registry> a udfs:VocabShapeRegistry')
    expect(namespacesSource).toContain('<#registry> a udfs:VocabNamespaceRegistry')
  })

  it('rejects proposal targets outside the current pod vocab registry before writing', async () => {
    const proposal = {
      ...createVocabTermProposal({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        classScope: 'udfs:Workspace',
        termUri: 'https://pod.example/.vocab/terms.ttl#summary',
        termKind: 'predicate' as const,
        label: 'summary',
        valueType: 'text',
        description: 'Short note summary shown on cards.',
        shape: 'minCount 0 · maxCount 1',
        createdAt: '2026-06-17T00:00:00.000Z',
      }),
      targetVocabUri: 'https://evil.example/.vocab/terms.ttl',
      targetShapesUri: 'https://evil.example/.vocab/shapes.ttl',
    }
    const proposalSource = renderVocabTermProposalTurtle(proposal)
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(proposalSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (init?.method === 'PUT') {
        return new Response('', { status: 200 })
      }
      return new Response('@prefix udfs: <https://undefineds.co/vocab/> .\n', {
        status: 200,
        headers: { 'Content-Type': 'text/turtle', ETag: '"target-1"' },
      })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveVocabTermProposalFromInbox(db as any, proposal.id)).rejects.toThrow(
      'Refusing to approve vocab proposal outside the current Pod vocab registry',
    )
    expect(authFetch).not.toHaveBeenCalledWith('https://evil.example/.vocab/terms.ttl', expect.anything())
    expect(authFetch).not.toHaveBeenCalledWith('https://evil.example/.vocab/shapes.ttl', expect.anything())
  })

  it('approves a vocab proposal targeting a discovered private registry in the current pod', async () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/private/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Private discovered summary predicate.',
      shape: 'minCount 0 · maxCount 1',
      targetVocabUri: 'https://pod.example/private/.vocab/terms.ttl',
      targetShapesUri: 'https://pod.example/private/.vocab/shapes.ttl',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const proposalSource = renderVocabTermProposalTurtle(proposal)
    let patchedVocabSource = ''
    let patchedShapesSource = ''
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(proposalSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-private-1"' },
        })
      }
      if (init?.method === 'HEAD') {
        return new Response('', {
          status: 200,
          headers: { 'WAC-Allow': 'user="read append write",public="read"' },
        })
      }
      if (init?.method === 'PATCH') {
        if (url === proposal.targetVocabUri) patchedVocabSource = String(init.body)
        if (url === proposal.targetShapesUri) patchedShapesSource = String(init.body)
        return new Response('', { status: 200 })
      }
      return new Response('@prefix udfs: <https://undefineds.co/vocab/> .\n', {
        status: 200,
        headers: { 'Content-Type': 'text/turtle', ETag: '"target-private-1"' },
      })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveVocabTermProposalFromInbox(db as any, proposal.id)).resolves.toMatchObject({
      id: proposal.id,
      targetVocabUri: 'https://pod.example/private/.vocab/terms.ttl',
      targetShapesUri: 'https://pod.example/private/.vocab/shapes.ttl',
    })
    expect(authFetch).toHaveBeenCalledWith(proposal.targetVocabUri, { method: 'HEAD' })
    expect(authFetch).toHaveBeenCalledWith(proposal.targetShapesUri, { method: 'HEAD' })
    expect(authFetch).toHaveBeenCalledWith('https://pod.example/private/.vocab/namespaces.ttl', { method: 'HEAD' })
    expect(authFetch).not.toHaveBeenCalledWith('https://pod.example/.vocab/namespaces.ttl', expect.anything())
    expect(patchedVocabSource).toContain('<https://pod.example/private/.vocab/terms.ttl#summary>')
    expect(patchedVocabSource).not.toContain('<https://pod.example/.vocab/terms.ttl#summary>')
    expect(patchedShapesSource).toContain('<https://undefineds.co/vocab/term> <https://pod.example/private/.vocab/terms.ttl#summary>')
  })

  it('preflights vocab registry write access before mutating canonical resources', async () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: 'minCount 0 · maxCount 1',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const proposalSource = renderVocabTermProposalTurtle(proposal)
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(proposalSource, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (init?.method === 'HEAD' && url === proposal.targetVocabUri) {
        return new Response('', {
          status: 200,
          headers: { 'WAC-Allow': 'user="read append",public="read"' },
        })
      }
      if (init?.method === 'HEAD') {
        return new Response('', {
          status: 200,
          headers: { 'WAC-Allow': 'user="read append write",public="read"' },
        })
      }
      if (init?.method === 'PUT') {
        return new Response('', { status: 200 })
      }
      return new Response('@prefix udfs: <https://undefineds.co/vocab/> .\n', {
        status: 200,
        headers: { 'Content-Type': 'text/turtle', ETag: '"target-1"' },
      })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveVocabTermProposalFromInbox(db as any, proposal.id)).rejects.toThrow(
      `Cannot publish vocab proposal: no write access to ${proposal.targetVocabUri}.`,
    )
    expect(authFetch).toHaveBeenCalledWith(proposal.targetVocabUri, { method: 'HEAD' })
    expect(authFetch).not.toHaveBeenCalledWith(proposal.targetVocabUri, expect.objectContaining({ method: 'PUT' }))
    expect(authFetch).not.toHaveBeenCalledWith(proposal.targetShapesUri, expect.objectContaining({ method: 'PUT' }))
  })
})
