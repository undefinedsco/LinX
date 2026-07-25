import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { auditResource, inboxNotificationResource } from '@undefineds.co/models'
import {
  FILES_VOCAB_APPROVAL_ACTION,
  FILES_VOCAB_APPROVAL_TOOL_NAME,
} from '@/modules/files/vocab-approval'
import {
  createSourceUpdateProposal,
  FILES_SOURCE_APPROVAL_ACTION,
  FILES_SOURCE_APPROVAL_TOOL_NAME,
  renderSourceUpdateProposalTurtle,
} from '@/modules/files/source-approval'
import {
  createAccessPolicyProposal,
  FILES_ACCESS_APPROVAL_ACTION,
  FILES_ACCESS_APPROVAL_POLICY_VERSION,
  FILES_ACCESS_APPROVAL_TOOL_NAME,
  renderAccessPolicyProposalTurtle,
} from '@/modules/files/access-approval'
import {
  createAiChangeProposal,
  FILES_AI_CHANGE_APPROVAL_ACTION,
  FILES_AI_CHANGE_APPROVAL_POLICY_VERSION,
  FILES_AI_CHANGE_APPROVAL_TOOL_NAME,
  renderAiChangeProposalTurtle,
} from '@/modules/files/ai-change-approval'
import {
  createStructuredCellChangeProposal,
  FILES_STRUCTURED_CELL_APPROVAL_ACTION,
  FILES_STRUCTURED_CELL_APPROVAL_POLICY_VERSION,
  FILES_STRUCTURED_CELL_APPROVAL_TOOL_NAME,
  renderStructuredCellChangeProposalTurtle,
} from '@/modules/files/structured-cell-approval'
import { createVocabTermProposal, renderVocabTermProposalTurtle } from '@/modules/files/structured-table'
import { approvalCollection, buildRuntimeToolResponse, findLatestApprovalByTarget, inboxOps, initializeInboxCollections } from './collections'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('findLatestApprovalByTarget', () => {
  it('returns the newest approval for a proposal target', () => {
    const target = 'https://pod.example/.data/proposals/source/report.ttl#proposal'
    const approvals = [
      {
        id: 'approval-old',
        target,
        status: 'pending',
        createdAt: new Date('2026-06-16T00:00:00.000Z'),
      },
      {
        id: 'approval-other',
        target: 'https://pod.example/.data/proposals/source/other.ttl#proposal',
        status: 'pending',
        createdAt: new Date('2026-06-18T00:00:00.000Z'),
      },
      {
        id: 'approval-new',
        target,
        status: 'approved',
        resolvedAt: new Date('2026-06-17T00:00:00.000Z'),
        createdAt: new Date('2026-06-15T00:00:00.000Z'),
      },
    ] as any[]

    expect(findLatestApprovalByTarget(approvals, target)?.id).toBe('approval-new')
  })

  it('returns null for empty or unmatched targets', () => {
    expect(findLatestApprovalByTarget([], null)).toBeNull()
    expect(findLatestApprovalByTarget([{ id: 'approval-1', target: 'x' }] as any[], 'y')).toBeNull()
  })
})

describe('buildRuntimeToolResponse', () => {
  it('keeps Files proposal application behind the Files collection boundary', () => {
    const source = readFileSync('src/modules/inbox/data/collections.ts', 'utf8')

    expect(source).toContain('filesProposalApplicationCollection.applyApprovalDecision')
    expect(source).not.toMatch(/\bapprove(?:VocabTerm|SourceUpdate|AccessPolicy|AiChange|StructuredCellChange)ProposalFromInbox\b/)
    expect(source).not.toMatch(/\bmarkFilesProposalResourceResolved\b/)
  })

  it('emits an approval decision payload', () => {
    expect(buildRuntimeToolResponse('approved', '  ok  ')).toBe(JSON.stringify({
      decision: 'approved',
      reason: 'ok',
      source: 'linx-inbox',
    }))
  })

  it('emits a rejection decision payload', () => {
    expect(buildRuntimeToolResponse('rejected', '  no  ')).toBe(JSON.stringify({
      decision: 'rejected',
      reason: 'no',
      source: 'linx-inbox',
    }))
  })

  it('normalizes empty reasons to null', () => {
    expect(buildRuntimeToolResponse('approved', undefined)).toBe(JSON.stringify({
      decision: 'approved',
      reason: null,
      source: 'linx-inbox',
    }))
  })

  it('writes resolution audit and notification object under the selected SP Pod', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('audit-1')
      .mockReturnValueOnce('notification-1')

    const inserts: Array<{ resource: unknown; values: Record<string, unknown> }> = []
    const updates: Array<{ resource: unknown; iri: string; values: Record<string, unknown> }> = []
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
      }),
      resolveRowIri: vi.fn((_resource: unknown, row: Record<string, unknown>) => {
        const createdAt = new Date(String(row.createdAt ?? '2026-05-26T00:00:00.000Z'))
        const yyyy = String(createdAt.getUTCFullYear())
        const mm = String(createdAt.getUTCMonth() + 1).padStart(2, '0')
        const dd = String(createdAt.getUTCDate()).padStart(2, '0')
        return `https://node-0000.undefineds.co/alice/.data/approvals/${yyyy}/${mm}/${dd}.ttl#${row.id}`
      }),
      updateByIri: vi.fn(async (resource: unknown, iri: string, values: Record<string, unknown>) => {
        updates.push({ resource, iri, values })
      }),
      insert: vi.fn((resource: unknown) => ({
        values(values: Record<string, unknown>) {
          inserts.push({ resource, values })
          return { execute: vi.fn(async () => undefined) }
        },
      })),
    }
    initializeInboxCollections(db as any)

    await inboxOps.resolveApproval({
      approval: {
        id: 'approval-1',
        status: 'pending',
        risk: 'high',
        toolName: 'write_file',
        session: 'https://node-0000.undefineds.co/alice/.data/sessions/2026/05/26/runtime-1.ttl',
        chat: 'https://node-0000.undefineds.co/alice/.data/chat/chat-1/index.ttl#this',
        thread: 'https://node-0000.undefineds.co/alice/.data/chat/chat-1/index.ttl#thread-1',
        toolCallId: 'call-1',
        createdAt: new Date('2026-05-26T00:00:00.000Z'),
      } as any,
      decision: 'approved',
      actorWebId: 'https://id.undefineds.co/alice/profile/card#me',
    })

    expect(updates[0]?.iri).toBe('https://node-0000.undefineds.co/alice/.data/approvals/2026/05/26.ttl#approval-1')
    const audit = inserts.find((item) => item.resource === auditResource)?.values
    const notification = inserts.find((item) => item.resource === inboxNotificationResource)?.values
    expect(audit?.actor).toBe('https://id.undefineds.co/alice/profile/card#me')
    expect(audit?.approval).toBe('https://node-0000.undefineds.co/alice/.data/approvals/2026/05/26.ttl#approval-1')
    expect(notification?.object).toMatch(/^https:\/\/node-0000\.undefineds\.co\/alice\/\.data\/audits\//)
  })

  it('resolves a loaded approval through the approval collection for optimistic local reads', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('audit-loaded-1')
      .mockReturnValueOnce('notification-loaded-1')

    let patchedApproval: Record<string, unknown> | null = null
    const loadedApprovals = new Map([['approval-loaded', { id: 'approval-loaded' }]])
    const collectionStateSpy = vi.spyOn(approvalCollection, 'state', 'get').mockReturnValue(loadedApprovals as any)
    const collectionUpdateSpy = vi.spyOn(approvalCollection, 'update').mockImplementation(((_id: unknown, callback: unknown) => {
      const draft: Record<string, unknown> = {}
      ;(callback as (draft: Record<string, unknown>) => void)(draft)
      patchedApproval = draft
      return {
        isPersisted: {
          promise: Promise.resolve(),
        },
      }
    }) as typeof approvalCollection.update)
    const updateByIri = vi.fn(async () => undefined)
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
      }),
      resolveRowIri: vi.fn((_resource: unknown, row: Record<string, unknown>) => (
        `https://node-0000.undefineds.co/alice/.data/approvals/2026/05/26.ttl#${row.id}`
      )),
      updateByIri,
      insert: vi.fn((resource: unknown) => ({
        values(values: Record<string, unknown>) {
          return { execute: vi.fn(async () => ({ resource, values })) }
        },
      })),
    }
    initializeInboxCollections(db as any)

    await inboxOps.resolveApproval({
      approval: {
        id: 'approval-loaded',
        status: 'pending',
        risk: 'low',
        toolName: 'write_file',
        target: 'https://node-0000.undefineds.co/alice/.data/runtime/tool-calls/call-1.ttl#approval',
        createdAt: new Date('2026-05-26T00:00:00.000Z'),
      } as any,
      decision: 'rejected',
      actorWebId: 'https://id.undefineds.co/alice/profile/card#me',
      reason: 'keep local',
    })

    expect(collectionStateSpy).toHaveBeenCalled()
    expect(collectionUpdateSpy).toHaveBeenCalledWith('approval-loaded', expect.any(Function))
    expect(patchedApproval).toMatchObject({
      status: 'rejected',
      decisionBy: 'https://id.undefineds.co/alice/profile/card#me',
      decisionRole: 'human',
      reason: 'keep local',
    })
    expect(updateByIri).not.toHaveBeenCalled()
  })

  it('refuses to resolve a stale Cloud approval while the current session is rooted in Local SP', async () => {
    const updateByIri = vi.fn(async () => undefined)
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
      }),
      resolveRowIri: vi.fn((_resource: unknown, row: Record<string, unknown>) => (
        `https://node-0000.undefineds.co/alice/.data/approvals/2026/05/26.ttl#${row.id}`
      )),
      updateByIri,
      insert: vi.fn((resource: unknown) => ({
        values(values: Record<string, unknown>) {
          return { execute: vi.fn(async () => ({ resource, values })) }
        },
      })),
    }
    initializeInboxCollections(db as any)

    await expect(inboxOps.resolveApproval({
      approval: {
        id: 'approval-cloud',
        status: 'pending',
        risk: 'high',
        toolName: 'write_file',
        session: 'https://id.undefineds.co/alice/.data/sessions/2026/05/26/runtime-1.ttl',
        chat: 'https://id.undefineds.co/alice/.data/chat/chat-1/index.ttl#this',
        thread: 'https://id.undefineds.co/alice/.data/chat/chat-1/index.ttl#thread-1',
        toolCallId: 'call-1',
        createdAt: new Date('2026-05-26T00:00:00.000Z'),
      } as any,
      decision: 'approved',
      actorWebId: 'https://id.undefineds.co/alice/profile/card#me',
    })).rejects.toThrow('outside the current SP')

    expect(updateByIri).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('applies a files vocab proposal before marking the inbox approval approved', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('audit-vocab-1')
      .mockReturnValueOnce('notification-vocab-1')

    const events: string[] = []
    const proposal = createVocabTermProposal({
      documentUri: 'https://node-0000.undefineds.co/alice/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://node-0000.undefineds.co/alice/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: 'minCount 0 · maxCount 1',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    let vocabPatchSource = ''
    let shapesPatchSource = ''
    let savedNamespacesSource = ''
    const namespacesUri = 'https://node-0000.undefineds.co/alice/.vocab/namespaces.ttl'
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (init?.method === 'PUT') {
        if (url === namespacesUri) {
          events.push('save-namespaces')
          savedNamespacesSource = String(init.body)
        }
        return new Response('', { status: 200 })
      }
      if (init?.method === 'PATCH') {
        if (url === proposal.targetVocabUri) {
          events.push('patch-vocab')
          vocabPatchSource = String(init.body)
        }
        if (url === proposal.targetShapesUri) {
          events.push('patch-shapes')
          shapesPatchSource = String(init.body)
        }
        return new Response('', { status: 200 })
      }
      if (url === proposal.proposalResourceUri) {
        return new Response(renderVocabTermProposalTurtle(proposal), {
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
        return new Response('@prefix udfs: <https://undefineds.co/vocab/> .\n', {
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
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
        getAuthenticatedFetch: () => authFetch,
      }),
      resolveRowIri: vi.fn((_table: unknown, row: Record<string, unknown>) => (
        `https://node-0000.undefineds.co/alice/.data/approvals/2026/06/17.ttl#${row.id}`
      )),
      updateByIri: vi.fn(async () => {
        events.push('update-approval')
      }),
      insert: vi.fn((table: unknown) => ({
        values(values: Record<string, unknown>) {
          return { execute: vi.fn(async () => ({ table, values })) }
        },
      })),
    }
    initializeInboxCollections(db as any)

    await inboxOps.resolveApproval({
      approval: {
        id: 'approval-vocab-1',
        status: 'pending',
        risk: 'medium',
        toolName: FILES_VOCAB_APPROVAL_TOOL_NAME,
        action: FILES_VOCAB_APPROVAL_ACTION,
        target: proposal.id,
        createdAt: new Date('2026-06-17T00:00:00.000Z'),
      } as any,
      decision: 'approved',
      actorWebId: 'https://id.undefineds.co/alice/profile/card#me',
    })

    expect(events).toEqual(['save-namespaces', 'patch-vocab', 'patch-shapes', 'update-approval'])
    expect(vocabPatchSource).toContain('<https://node-0000.undefineds.co/alice/.vocab/terms.ttl#summary> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/PredicateTerm> .')
    expect(shapesPatchSource).toContain('<https://node-0000.undefineds.co/alice/.vocab/shapes.ttl#summary-shape> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/ShapeRule> .')
    expect(savedNamespacesSource).toContain('<#registry> a udfs:VocabNamespaceRegistry')
    expect(db.updateByIri).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.objectContaining({
      status: 'approved',
    }))
  })

  it('does not mark a files vocab approval approved when publish preflight fails', async () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://node-0000.undefineds.co/alice/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://node-0000.undefineds.co/alice/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: 'minCount 0 · maxCount 1',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderVocabTermProposalTurtle(proposal), {
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
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
        getAuthenticatedFetch: () => authFetch,
      }),
      resolveRowIri: vi.fn((_table: unknown, row: Record<string, unknown>) => (
        `https://node-0000.undefineds.co/alice/.data/approvals/2026/06/17.ttl#${row.id}`
      )),
      updateByIri: vi.fn(async () => undefined),
      insert: vi.fn((table: unknown) => ({
        values(values: Record<string, unknown>) {
          return { execute: vi.fn(async () => ({ table, values })) }
        },
      })),
    }
    initializeInboxCollections(db as any)

    await expect(inboxOps.resolveApproval({
      approval: {
        id: 'approval-vocab-1',
        status: 'pending',
        risk: 'medium',
        toolName: FILES_VOCAB_APPROVAL_TOOL_NAME,
        action: FILES_VOCAB_APPROVAL_ACTION,
        target: proposal.id,
        createdAt: new Date('2026-06-17T00:00:00.000Z'),
      } as any,
      decision: 'approved',
      actorWebId: 'https://id.undefineds.co/alice/profile/card#me',
    })).rejects.toThrow(`Cannot publish vocab proposal: no write access to ${proposal.targetVocabUri}.`)

    expect(db.updateByIri).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
    expect(authFetch).not.toHaveBeenCalledWith(proposal.targetVocabUri, expect.objectContaining({ method: 'PUT' }))
  })

  it('applies a files source proposal before marking the inbox approval approved', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('audit-source-1')
      .mockReturnValueOnce('notification-source-1')

    const events: string[] = []
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://node-0000.undefineds.co/alice/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://node-0000.undefineds.co/alice/.data/workspaces/docs/report.md',
      sourceUri: 'https://node-0000.undefineds.co/alice/public/source.pdf',
      proposedContent: '# Updated report\n\nIngest-approved blocks.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    let savedTargetSource = ''
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderSourceUpdateProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-source-1"' },
        })
      }
      if (init?.method === 'PUT' && url === proposal.targetResourceUri) {
        events.push('save-target')
        expect(init.headers).toEqual({
          'Content-Type': 'text/markdown',
          'If-Match': '"target-source-1"',
        })
        savedTargetSource = String(init.body)
        return new Response(null, { status: 204 })
      }
      if (url === proposal.targetResourceUri) {
        return new Response('# Updated report\n\nIngest-approved blocks.', {
          status: 200,
          headers: { 'Content-Type': 'text/markdown', ETag: '"target-source-1"' },
        })
      }
      return new Response('missing', { status: 404 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
        getAuthenticatedFetch: () => authFetch,
      }),
      resolveRowIri: vi.fn((_table: unknown, row: Record<string, unknown>) => (
        `https://node-0000.undefineds.co/alice/.data/approvals/2026/06/17.ttl#${row.id}`
      )),
      updateByIri: vi.fn(async () => {
        events.push('update-approval')
      }),
      insert: vi.fn((table: unknown) => ({
        values(values: Record<string, unknown>) {
          return { execute: vi.fn(async () => ({ table, values })) }
        },
      })),
    }
    initializeInboxCollections(db as any)

    await inboxOps.resolveApproval({
      approval: {
        id: 'approval-source-1',
        status: 'pending',
        risk: 'medium',
        toolName: FILES_SOURCE_APPROVAL_TOOL_NAME,
        action: FILES_SOURCE_APPROVAL_ACTION,
        target: proposal.id,
        createdAt: new Date('2026-06-17T00:00:00.000Z'),
      } as any,
      decision: 'approved',
      actorWebId: 'https://id.undefineds.co/alice/profile/card#me',
    })

    expect(events).toEqual(['save-target', 'update-approval'])
    expect(savedTargetSource).toBe('# Updated report\n\nIngest-approved blocks.')
    expect(db.updateByIri).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.objectContaining({
      status: 'approved',
    }))
  })

  it('applies a files access proposal before marking the inbox approval approved', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('audit-access-1')
      .mockReturnValueOnce('notification-access-1')

    const events: string[] = []
    const proposal = createAccessPolicyProposal({
      ownerUri: 'https://node-0000.undefineds.co/alice/public/README.md',
      activePolicyUri: 'https://node-0000.undefineds.co/alice/public/README.md.acl',
      targetPolicyUri: 'https://node-0000.undefineds.co/alice/public/README.md.acl',
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Let Ingest refresh linked cards.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    let savedAcl = ''
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderAccessPolicyProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-access-1"' },
        })
      }
      if (init?.method === 'PUT' && url === proposal.targetPolicyUri) {
        events.push('save-acl')
        expect(init.headers).toEqual({
          'Content-Type': 'text/turtle',
          'If-Match': '"acl-1"',
        })
        savedAcl = String(init.body)
        return new Response(null, { status: 204 })
      }
      if (url === proposal.targetPolicyUri) {
        return new Response('@prefix acl: <http://www.w3.org/ns/auth/acl#> .\n', {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"acl-1"' },
        })
      }
      return new Response('missing', { status: 404 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
        getAuthenticatedFetch: () => authFetch,
      }),
      resolveRowIri: vi.fn((_table: unknown, row: Record<string, unknown>) => (
        `https://node-0000.undefineds.co/alice/.data/approvals/2026/06/17.ttl#${row.id}`
      )),
      updateByIri: vi.fn(async () => {
        events.push('update-approval')
      }),
      insert: vi.fn((table: unknown) => ({
        values(values: Record<string, unknown>) {
          return { execute: vi.fn(async () => ({ table, values })) }
        },
      })),
    }
    initializeInboxCollections(db as any)

    await inboxOps.resolveApproval({
      approval: {
        id: 'approval-access-1',
        status: 'pending',
        risk: 'medium',
        toolName: FILES_ACCESS_APPROVAL_TOOL_NAME,
        action: FILES_ACCESS_APPROVAL_ACTION,
        target: proposal.id,
        policyVersion: FILES_ACCESS_APPROVAL_POLICY_VERSION,
        createdAt: new Date('2026-06-17T00:00:00.000Z'),
      } as any,
      decision: 'approved',
      actorWebId: 'https://id.undefineds.co/alice/profile/card#me',
      reason: ' ok ',
    })

    expect(events).toEqual(['save-acl', 'update-approval'])
    expect(savedAcl).toContain('<#agent-editor-https-agent-example-profile-me> a acl:Authorization')
    expect(savedAcl).toContain('acl:agent <https://agent.example/profile#me>')
    expect(savedAcl).toContain('acl:mode acl:Read, acl:Append, acl:Write')
    expect(db.updateByIri).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.objectContaining({
      status: 'approved',
      decisionBy: 'https://id.undefineds.co/alice/profile/card#me',
      reason: 'ok',
      policyVersion: FILES_ACCESS_APPROVAL_POLICY_VERSION,
    }))
  })

  it('does not mark an ACR access proposal approved because ACP application is unsupported', async () => {
    const proposal = createAccessPolicyProposal({
      ownerUri: 'https://node-0000.undefineds.co/alice/public/README.md',
      activePolicyUri: 'https://node-0000.undefineds.co/alice/public/README.md.acr',
      targetPolicyUri: 'https://node-0000.undefineds.co/alice/public/README.md.acr',
      provider: 'acr',
      audience: 'authenticated',
      audienceRef: 'authenticated',
      role: 'contributor',
      modes: ['read', 'append'],
      reason: 'Signed-in collaborators may append through ACR review.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderAccessPolicyProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-access-acr-1"' },
        })
      }
      if (init?.method === 'PUT' && url === proposal.targetPolicyUri) {
        throw new Error('ACR policy must not be written by Files approval.')
      }
      return new Response('missing', { status: 404 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
        getAuthenticatedFetch: () => authFetch,
      }),
      resolveRowIri: vi.fn((_table: unknown, row: Record<string, unknown>) => (
        `https://node-0000.undefineds.co/alice/.data/approvals/2026/06/17.ttl#${row.id}`
      )),
      updateByIri: vi.fn(async () => undefined),
      insert: vi.fn((table: unknown) => ({
        values(values: Record<string, unknown>) {
          return { execute: vi.fn(async () => ({ table, values })) }
        },
      })),
    }
    initializeInboxCollections(db as any)

    await expect(inboxOps.resolveApproval({
      approval: {
        id: 'approval-access-acr-1',
        status: 'pending',
        risk: 'medium',
        toolName: FILES_ACCESS_APPROVAL_TOOL_NAME,
        action: FILES_ACCESS_APPROVAL_ACTION,
        target: proposal.id,
        policyVersion: FILES_ACCESS_APPROVAL_POLICY_VERSION,
        createdAt: new Date('2026-06-17T00:00:00.000Z'),
      } as any,
      decision: 'approved',
      actorWebId: 'https://id.undefineds.co/alice/profile/card#me',
      reason: ' ok ',
    })).rejects.toThrow(
      'ACR access proposal cannot be approved automatically because ACP policy application is not supported yet.',
    )

    expect(authFetch).not.toHaveBeenCalledWith(proposal.targetPolicyUri, expect.objectContaining({
      method: 'PUT',
    }))
    expect(db.updateByIri).not.toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('applies a files AI change proposal before marking the inbox approval approved', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('audit-ai-1')
      .mockReturnValueOnce('notification-ai-1')

    const events: string[] = []
    const proposal = createAiChangeProposal({
      targetResourceUri: 'https://node-0000.undefineds.co/alice/public/report.md',
      documentUri: 'https://node-0000.undefineds.co/alice/.data/workspaces/ws-1/state.ttl',
      subject: 'https://node-0000.undefineds.co/alice/public/report.md',
      operation: 'replace-content',
      proposedContent: '# AI approved\n\nHuman reviewed this draft.',
      summary: 'AI drafted a replacement report.',
      diff: '- old\n+ AI approved',
      reason: 'Secretary rewrote the report after user request.',
      agentWebId: 'https://agent.example/profile#me',
      podRootUri: 'https://node-0000.undefineds.co/alice/',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    let savedTargetSource = ''
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderAiChangeProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-ai-1"' },
        })
      }
      if (init?.method === 'PUT' && url === proposal.targetResourceUri) {
        events.push('save-ai-target')
        expect(init.headers).toEqual({
          'Content-Type': 'text/markdown',
          'If-Match': '"target-ai-1"',
        })
        savedTargetSource = String(init.body)
        return new Response(null, { status: 204 })
      }
      if (url === proposal.targetResourceUri) {
        return new Response('# Existing report', {
          status: 200,
          headers: { 'Content-Type': 'text/markdown', ETag: '"target-ai-1"' },
        })
      }
      return new Response('missing', { status: 404 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
        getAuthenticatedFetch: () => authFetch,
      }),
      resolveRowIri: vi.fn((_table: unknown, row: Record<string, unknown>) => (
        `https://node-0000.undefineds.co/alice/.data/approvals/2026/06/17.ttl#${row.id}`
      )),
      updateByIri: vi.fn(async () => {
        events.push('update-approval')
      }),
      insert: vi.fn((table: unknown) => ({
        values(values: Record<string, unknown>) {
          return { execute: vi.fn(async () => ({ table, values })) }
        },
      })),
    }
    initializeInboxCollections(db as any)

    await inboxOps.resolveApproval({
      approval: {
        id: 'approval-ai-1',
        status: 'pending',
        risk: 'medium',
        toolName: FILES_AI_CHANGE_APPROVAL_TOOL_NAME,
        action: FILES_AI_CHANGE_APPROVAL_ACTION,
        target: proposal.id,
        policyVersion: FILES_AI_CHANGE_APPROVAL_POLICY_VERSION,
        createdAt: new Date('2026-06-17T00:00:00.000Z'),
      } as any,
      decision: 'approved',
      actorWebId: 'https://id.undefineds.co/alice/profile/card#me',
      reason: ' reviewed ',
    })

    expect(events).toEqual(['save-ai-target', 'update-approval'])
    expect(savedTargetSource).toBe('# AI approved\n\nHuman reviewed this draft.')
    expect(db.updateByIri).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.objectContaining({
      status: 'approved',
      reason: 'reviewed',
      policyVersion: FILES_AI_CHANGE_APPROVAL_POLICY_VERSION,
    }))
  })

  it('applies a files structured cell proposal before marking the inbox approval approved', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('audit-cell-1')
      .mockReturnValueOnce('notification-cell-1')

    const events: string[] = []
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://node-0000.undefineds.co/alice/.data/workspaces/ws-1/state.ttl',
      subject: '#Other',
      predicate: 'mode',
      previousValues: ['"read"'],
      nextValues: ['"read/write"'],
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    let patchedTargetSource = ''
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderStructuredCellChangeProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-cell-1"' },
        })
      }
      if (init?.method === 'PATCH' && url === proposal.documentUri) {
        events.push('patch-cell-target')
        expect(init.headers).toEqual({
          'Content-Type': 'application/sparql-update',
        })
        patchedTargetSource = String(init.body)
        return new Response(null, { status: 204 })
      }
      if (init?.method === 'PUT' && url === proposal.documentUri) {
        throw new Error('structured cell approval must patch RDF instead of rewriting the target document')
      }
      if (url === proposal.documentUri) {
        return new Response('@prefix udfs: <https://undefineds.co/vocab/> .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .', {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"target-cell-1"' },
        })
      }
      return new Response('missing', { status: 404 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
        getAuthenticatedFetch: () => authFetch,
      }),
      resolveRowIri: vi.fn((_table: unknown, row: Record<string, unknown>) => (
        `https://node-0000.undefineds.co/alice/.data/approvals/2026/06/17.ttl#${row.id}`
      )),
      updateByIri: vi.fn(async () => {
        events.push('update-approval')
      }),
      insert: vi.fn((table: unknown) => ({
        values(values: Record<string, unknown>) {
          return { execute: vi.fn(async () => ({ table, values })) }
        },
      })),
    }
    initializeInboxCollections(db as any)

    await inboxOps.resolveApproval({
      approval: {
        id: 'approval-cell-1',
        status: 'pending',
        risk: 'medium',
        toolName: FILES_STRUCTURED_CELL_APPROVAL_TOOL_NAME,
        action: FILES_STRUCTURED_CELL_APPROVAL_ACTION,
        target: proposal.id,
        policyVersion: FILES_STRUCTURED_CELL_APPROVAL_POLICY_VERSION,
        createdAt: new Date('2026-06-17T00:00:00.000Z'),
      } as any,
      decision: 'approved',
      actorWebId: 'https://id.undefineds.co/alice/profile/card#me',
      reason: ' reviewed ',
    })

    expect(events).toEqual(['patch-cell-target', 'update-approval'])
    expect(patchedTargetSource).toContain('DELETE DATA')
    expect(patchedTargetSource).toContain('<#Other> mode "read" .')
    expect(patchedTargetSource).toContain('INSERT DATA')
    expect(patchedTargetSource).toContain('<#Other> mode "read/write" .')
    expect(db.updateByIri).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.objectContaining({
      status: 'approved',
      reason: 'reviewed',
      policyVersion: FILES_STRUCTURED_CELL_APPROVAL_POLICY_VERSION,
    }))
  })
})
