import { beforeEach, describe, expect, it, vi } from 'vitest'
import { approvalResource, auditResource, inboxNotificationResource } from '@undefineds.co/models'
import {
  applySourceUpdateProposalToContent,
  createSourceUpdateProposal,
  parseSourceUpdateProposalTurtle,
  renderSourceUpdateProposalTurtle,
} from './domain/source/source-approval-model'
import {
  approveSourceUpdateProposalFromInbox,
  createSourceUpdateProposalInboxApproval,
} from './data/proposal/source-approval-commands'

beforeEach(() => {
  vi.restoreAllMocks()
})

type LegacyManifestUriAlias = {
  sourceIndexManifestUri: string
}

function legacyManifestUriAlias<T extends object | null>(value: T): T & LegacyManifestUriAlias {
  return value as T & LegacyManifestUriAlias
}

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

describe('source update proposals', () => {
  it('creates a source update proposal without changing canonical card content', () => {
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      ingestVersion: 'pdf-ingest-v2',
      sourceHash: 'sha256-source-1',
      sourceIndexManifestUri: 'https://pod.example/.data/index/sources/source-pdf/manifest.ttl',
      snapshotAt: '2026-06-17T00:00:00.000Z',
      summary: 'Ingest found updated title and two blocks.',
      diff: '- old title\n+ new title',
      proposedContent: '# New title\n\nUpdated ingest blocks.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal.proposalResourceUri).toMatch(
      /^https:\/\/pod\.example\/\.data\/proposals\/source\/docs-report-md-https-pod-example-public-source-pdf-[a-z0-9]{7}\.ttl$/,
    )
    expect(proposal).toMatchObject({
      id: `${proposal.proposalResourceUri}#proposal`,
      kind: 'source-update-proposal',
      operation: 'refresh-card',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/source-pdf/manifest.ttl',
      ingestVersion: 'pdf-ingest-v2',
      writesCanonicalContent: false,
    })
    expect(proposal).not.toHaveProperty('parserManifestUri')
    expect(proposal).not.toHaveProperty('parserVersion')
    const turtle = renderSourceUpdateProposalTurtle(proposal)
    expect(turtle).toContain('<#proposal> a udfs:SourceUpdateProposal')
    expect(turtle).toContain('udfs:sourceDocument <https://pod.example/.data/workspaces/ws-1/state.ttl>')
    expect(turtle).toContain('dcterms:source <https://pod.example/public/source.pdf>')
    expect(turtle).toContain('udfs:ingestManifest <https://pod.example/.data/index/sources/source-pdf/manifest.ttl>')
    expect(turtle).toContain('udfs:ingestVersion "pdf-ingest-v2"')
    expect(turtle).not.toContain('udfs:parserManifest')
    expect(turtle).not.toContain('udfs:parserVersion')
    expect(turtle).toContain('udfs:sourceHash "sha256-source-1"')
    expect(turtle).toContain('udfs:diff "- old title\\n+ new title"')
    expect(turtle).toContain('udfs:proposedContent "# New title\\n\\nUpdated ingest blocks."')
    expect(turtle).toContain('udfs:writesCanonicalContent false')
  })

  it('keeps repeated source update proposals for the same source in distinct resources', () => {
    const base = {
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl',
      subject: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md',
      sourceUri: 'https://example.com/report.pdf',
      operation: 'replace-blocks' as const,
      createdAt: '2026-06-17T00:00:00.000Z',
    }
    const first = createSourceUpdateProposal({
      ...base,
      sourceHash: 'sha256-first',
      proposedContent: '# First',
      summary: 'First refresh.',
      diff: '+ first',
    })
    const second = createSourceUpdateProposal({
      ...base,
      sourceHash: 'sha256-second',
      proposedContent: '# Second',
      summary: 'Second refresh.',
      diff: '+ second',
    })

    const proposalPathPattern =
      /^https:\/\/pod\.example\/\.data\/proposals\/source\/https-pod-example-data-workspaces-ws-1-cards-report-card-ttl-card-https-example-com-report-pdf-[a-z0-9]{7}\.ttl$/
    expect(first.proposalResourceUri).toMatch(proposalPathPattern)
    expect(second.proposalResourceUri).toMatch(proposalPathPattern)
    expect(first.proposalResourceUri).not.toBe(second.proposalResourceUri)
    expect(first.id).toBe(`${first.proposalResourceUri}#proposal`)
    expect(second.id).toBe(`${second.proposalResourceUri}#proposal`)
  })

  it('exposes Ingest manifest URI as the proposal domain field while keeping legacy aliases compatible', () => {
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      ingestVersion: 'pdf-ingest-v2',
      sourceHash: 'sha256-source-1',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/source-pdf/manifest.ttl',
      snapshotAt: '2026-06-17T00:00:00.000Z',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal.sourceIngestManifestUri).toBe('https://pod.example/.data/index/sources/source-pdf/manifest.ttl')
    expect(legacyManifestUriAlias(proposal).sourceIndexManifestUri).toBe(proposal.sourceIngestManifestUri)
    expect(Object.keys(proposal)).toContain('sourceIngestManifestUri')
    expect(Object.keys(proposal)).not.toContain('sourceIndexManifestUri')
    expect({ ...proposal }).not.toHaveProperty('sourceIndexManifestUri')
    expect(proposal.summary).toBe('审阅 Ingest 输出后再更新 source-linked card。')
    expect(proposal.diff).toBe('Ingest 输出已进入审批；canonical card 内容保持不变。')

    const parsed = parseSourceUpdateProposalTurtle(
      renderSourceUpdateProposalTurtle(proposal),
      proposal.proposalResourceUri,
    )
    expect(parsed.sourceIngestManifestUri).toBe(proposal.sourceIngestManifestUri)
    expect(legacyManifestUriAlias(parsed).sourceIndexManifestUri).toBe(proposal.sourceIngestManifestUri)
    expect(Object.keys(parsed)).toContain('sourceIngestManifestUri')
    expect(Object.keys(parsed)).not.toContain('sourceIndexManifestUri')
    expect({ ...parsed }).not.toHaveProperty('sourceIndexManifestUri')
  })

  it('creates source update proposal instances under the current path-based Pod root', () => {
    const proposal = createSourceUpdateProposal({
      documentUri: 'http://localhost:44470/test/public/cards/report.card.ttl',
      subject: 'http://localhost:44470/test/public/cards/report.card.ttl#card',
      targetResourceUri: 'http://localhost:44470/test/public/cards/report.md',
      sourceUri: 'https://example.com/report.pdf',
      sourceHash: 'sha256-source',
      podRootUri: 'http://localhost:44470/test/',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal.proposalResourceUri).toMatch(
      /^http:\/\/localhost:44470\/test\/\.data\/proposals\/source\/http-localhost-44470-test-public-cards-report-card-ttl-card-https-example-com-report-pdf-[a-z0-9]{7}\.ttl$/,
    )
    expect(proposal.sourceIngestManifestUri).toMatch(
      /^http:\/\/localhost:44470\/test\/\.data\/ingest\/sources\/example-com-report-[a-z0-9]{7}\/manifest\.ttl$/,
    )
  })

  it('accepts legacy parser aliases while exposing Ingest manifest fields', () => {
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      parserVersion: 'pdf-ingest-v2',
      sourceHash: 'sha256-source-1',
      parserManifestUri: 'https://pod.example/.data/index/sources/source-pdf/manifest.ttl',
      snapshotAt: '2026-06-17T00:00:00.000Z',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal).toMatchObject({
      ingestVersion: 'pdf-ingest-v2',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/source-pdf/manifest.ttl',
    })
    expect(proposal).not.toHaveProperty('parserVersion')
    expect(proposal).not.toHaveProperty('parserManifestUri')

    const turtle = renderSourceUpdateProposalTurtle(proposal)
    expect(turtle).toContain('udfs:ingestManifest <https://pod.example/.data/index/sources/source-pdf/manifest.ttl>')
    expect(turtle).toContain('udfs:ingestVersion "pdf-ingest-v2"')
    expect(turtle).not.toContain('udfs:parserManifest')
    expect(turtle).not.toContain('udfs:parserVersion')
    expect(turtle).not.toContain('sourceIndexManifest')

    expect(parseSourceUpdateProposalTurtle(turtle, proposal.proposalResourceUri)).toMatchObject({
      ingestVersion: 'pdf-ingest-v2',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/source-pdf/manifest.ttl',
    })
  })

  it('parses source proposal turtle with multiline staged content', () => {
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      operation: 'replace-blocks',
      summary: 'Ingest found updated title and two blocks.',
      diff: '- old title\n+ new title',
      proposedContent: '# New title\n\nUpdated ingest blocks.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(parseSourceUpdateProposalTurtle(
      renderSourceUpdateProposalTurtle(proposal),
      proposal.proposalResourceUri,
    )).toMatchObject({
      id: proposal.id,
      operation: 'replace-blocks',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      diff: '- old title\n+ new title',
      proposedContent: '# New title\n\nUpdated ingest blocks.',
    })
  })

  it('round-trips proposed card metadata without applying canonical card RDF', () => {
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl',
      subject: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md',
      sourceUri: 'https://source.example/report.pdf',
      operation: 'replace-blocks',
      proposedContent: '# Quarterly report\n\nRead [source](https://source.example/report.pdf).',
      cardMetadata: {
        title: 'Quarterly report',
        links: ['https://source.example/report.pdf', 'https://source.example/report.pdf'],
      },
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    const turtle = renderSourceUpdateProposalTurtle(proposal)

    expect(turtle).toContain('udfs:proposedCardTitle "Quarterly report"')
    expect(turtle.match(/udfs:proposedCardLink/g)).toHaveLength(1)
    expect(turtle).toContain('udfs:proposedCardLink <https://source.example/report.pdf>')
    expect(parseSourceUpdateProposalTurtle(turtle, proposal.proposalResourceUri)).toMatchObject({
      cardMetadata: {
        title: 'Quarterly report',
        links: ['https://source.example/report.pdf'],
      },
      writesCanonicalContent: false,
    })
  })

  it('parses resolved source proposal status from turtle', () => {
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
    })
    const source = renderSourceUpdateProposalTurtle(proposal).replace('udfs:status "pending"', 'udfs:status "rejected"')

    expect(parseSourceUpdateProposalTurtle(source, proposal.proposalResourceUri)).toMatchObject({
      status: 'rejected',
    })
  })

  it('parses source proposal fields after Pod expansion to absolute predicate IRIs', () => {
    const proposalResourceUri = 'https://pod.example/.data/proposals/source/report.ttl'
    const source = [
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/operation> "refresh-card" .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/sourceDocument> <https://pod.example/.data/workspaces/ws-1/state.ttl> .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/subject> "../docs/report.md" .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/targetResource> <https://pod.example/.data/workspaces/docs/report.md> .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <http://purl.org/dc/terms/source> <https://pod.example/public/source.pdf> .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/parserManifest> <https://pod.example/.data/index/sources/source-pdf/manifest.ttl> .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/parserVersion> "pdf-parser-v2" .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/sourceHash> "sha256-source-1" .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/snapshotAt> "2026-06-17T00:00:00.000Z" .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <http://purl.org/dc/terms/description> "Ingest found updated title." .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/diff> "- old\\n+ new" .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/proposedContent> "# New title\\n\\nUpdated ingest blocks." .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <http://purl.org/dc/terms/created> "2026-06-17T00:00:00.000Z" .',
    ].join('\n')

    expect(parseSourceUpdateProposalTurtle(source, proposalResourceUri)).toMatchObject({
      id: `${proposalResourceUri}#proposal`,
      operation: 'refresh-card',
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/source-pdf/manifest.ttl',
      ingestVersion: 'pdf-parser-v2',
      sourceHash: 'sha256-source-1',
      diff: '- old\n+ new',
      proposedContent: '# New title\n\nUpdated ingest blocks.',
    })
  })

  it('parses Ingest-named source proposal fields without legacy parser predicates', () => {
    const proposalResourceUri = 'https://pod.example/.data/proposals/source/report.ttl'
    const source = [
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/operation> "refresh-card" .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/sourceDocument> <https://pod.example/.data/workspaces/ws-1/state.ttl> .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/targetResource> <https://pod.example/.data/workspaces/docs/report.md> .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <http://purl.org/dc/terms/source> <https://pod.example/public/source.pdf> .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/ingestManifest> <https://pod.example/.data/ingest/sources/source-pdf/manifest.ttl> .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/ingestVersion> "pdf-ingest-v2" .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <https://undefineds.co/vocab/sourceHash> "sha256-source-1" .',
      '<https://pod.example/.data/proposals/source/report.ttl#proposal> <http://purl.org/dc/terms/created> "2026-06-17T00:00:00.000Z" .',
    ].join('\n')

    expect(parseSourceUpdateProposalTurtle(source, proposalResourceUri)).toMatchObject({
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/sources/source-pdf/manifest.ttl',
      ingestVersion: 'pdf-ingest-v2',
    })
  })

  it('applies staged content by operation without guessing from diff', () => {
    const base = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      diff: '- old\n+ new',
      proposedContent: 'New block',
    })

    expect(applySourceUpdateProposalToContent('Old block', base)).toBe('New block')
    expect(applySourceUpdateProposalToContent('Old block\n', {
      ...base,
      operation: 'append-blocks',
    })).toBe('Old block\n\nNew block')
    expect(applySourceUpdateProposalToContent('Old block', {
      ...base,
      proposedContent: null,
    })).toBe('Old block')
  })

  it('keeps local content unchanged for keep-local proposals', () => {
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      operation: 'keep-local',
      summary: 'Keep local edits and do not apply Ingest output.',
      diff: 'Local edits are protected from this source refresh.',
      proposedContent: '# Ingest refreshed body',
    })

    const turtle = renderSourceUpdateProposalTurtle(proposal)
    expect(turtle).toContain('udfs:operation "keep-local"')
    expect(parseSourceUpdateProposalTurtle(turtle, proposal.proposalResourceUri)).toMatchObject({
      operation: 'keep-local',
      proposedContent: '# Ingest refreshed body',
    })
    expect(applySourceUpdateProposalToContent('# Local edited body', proposal)).toBe('# Local edited body')
  })

  it('preserves user-edited source blocks instead of overwriting them during source refresh', () => {
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      operation: 'replace-blocks',
      proposedContent: [
        '<!-- linx-source-block id="intro" hash="source-v2" origin="source" -->',
        'Ingest refreshed introduction.',
      ].join('\n'),
    })
    const existing = [
      '<!-- linx-source-block id="intro" hash="source-v1" origin="user" previous-hash="source-v1" -->',
      'My edited introduction.',
    ].join('\n')

    expect(applySourceUpdateProposalToContent(existing, proposal)).toBe([
      '<!-- linx-source-block id="intro" hash="source-v1" origin="user" previous-hash="source-v1" -->',
      'My edited introduction.',
      '',
      '<!-- linx-source-conflict id="intro" source-hash="source-v2" -->',
      '<!-- linx-source-block id="intro" hash="source-v2" origin="source" -->',
      'Ingest refreshed introduction.',
      '<!-- /linx-source-conflict -->',
    ].join('\n'))
  })

  it('keeps unmarked user content and stages Ingest output as a conflict', () => {
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      operation: 'replace-blocks',
      proposedContent: [
        '<!-- linx-source-block id="chunk:1" hash="source-v2" origin="source" -->',
        'Ingest refreshed content.',
      ].join('\n'),
    })

    expect(applySourceUpdateProposalToContent('User-owned draft without markers.', proposal)).toBe([
      'User-owned draft without markers.',
      '',
      '<!-- linx-source-conflict id="unmarked" source-hash="source-v2" -->',
      '<!-- linx-source-block id="chunk:1" hash="source-v2" origin="source" -->',
      'Ingest refreshed content.',
      '<!-- /linx-source-conflict -->',
    ].join('\n'))
  })

  it('approves a source proposal with staged content through ETag-protected target save', async () => {
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      proposedContent: '# New title\n\nUpdated ingest blocks.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderSourceUpdateProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (init?.method === 'PUT') {
        expect(url).toBe(proposal.targetResourceUri)
        expect(init.headers).toEqual({
          'Content-Type': 'text/markdown',
          'If-Match': '"target-1"',
        })
        expect(init.body).toBe('# New title\n\nUpdated ingest blocks.')
        return new Response(null, { status: 204 })
      }
      if (url === proposal.targetResourceUri) {
        return new Response('# New title\n\nUpdated ingest blocks.', {
          status: 200,
          headers: { 'Content-Type': 'text/markdown', ETag: '"target-1"' },
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

    await expect(approveSourceUpdateProposalFromInbox(db as any, proposal.id)).resolves.toMatchObject({
      id: proposal.id,
      proposedContent: '# New title\n\nUpdated ingest blocks.',
    })
    expect(authFetch).toHaveBeenCalledWith(proposal.targetResourceUri, expect.objectContaining({ method: 'PUT' }))
  })

  it('creates the missing target body when approving an initial source proposal', async () => {
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      proposedContent: '# New title\n\nInitial staged Ingest body.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    let createdBody: string | null = null
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderSourceUpdateProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (url === proposal.targetResourceUri && init?.method === 'PUT') {
        expect(init.headers).toEqual({
          'Content-Type': 'text/markdown',
          'If-None-Match': '*',
        })
        createdBody = String(init.body)
        return new Response(null, { status: 204 })
      }
      if (url === proposal.targetResourceUri && createdBody) {
        return new Response(createdBody, {
          status: 200,
          headers: { 'Content-Type': 'text/markdown', ETag: '"target-created"' },
        })
      }
      if (url === proposal.targetResourceUri) {
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

    await expect(approveSourceUpdateProposalFromInbox(db as any, proposal.id)).resolves.toMatchObject({
      id: proposal.id,
      proposedContent: '# New title\n\nInitial staged Ingest body.',
    })
    expect(createdBody).toBe('# New title\n\nInitial staged Ingest body.')
    expect(authFetch).toHaveBeenCalledWith(proposal.targetResourceUri, expect.objectContaining({ method: 'PUT' }))
  })

  it('does not reapply an already approved source proposal', async () => {
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      proposedContent: '# Already applied',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(
          renderSourceUpdateProposalTurtle({
            ...proposal,
            status: 'approved',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-approved"' },
          },
        )
      }
      throw new Error('approved source proposal must not read or write its target again')
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveSourceUpdateProposalFromInbox(db as any, proposal.id)).rejects.toThrow(
      'Cannot approve Ingest proposal because it is already approved.',
    )
    expect(authFetch).not.toHaveBeenCalledWith(proposal.targetResourceUri, expect.anything())
  })

  it.each([
    ['vocab registry', 'https://pod.example/.vocab/terms.ttl'],
    ['access policy', 'https://pod.example/public/report.md.acl'],
    ['access control policy', 'https://pod.example/public/report.md.acr'],
    ['metadata sidecar', 'https://pod.example/public/report.md.meta'],
  ])('refuses to approve a source proposal targeting a reserved %s resource', async (_label, targetResourceUri) => {
    const proposalResourceUri = 'https://pod.example/.data/proposals/source/report.ttl'
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: targetResourceUri,
      targetResourceUri,
      sourceUri: 'https://pod.example/public/source.pdf',
      proposedContent: '# Reserved target',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL) => {
      const url = String(uri)
      if (url === proposalResourceUri) {
        return new Response(renderSourceUpdateProposalTurtle({
          ...proposal,
          proposalResourceUri,
          id: `${proposalResourceUri}#proposal`,
        }), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      throw new Error('reserved source proposal target must not be fetched')
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveSourceUpdateProposalFromInbox(db as any, `${proposalResourceUri}#proposal`)).rejects.toThrow(
      'Refusing to approve Ingest proposal targeting a reserved Files resource.',
    )
    expect(authFetch).not.toHaveBeenCalledWith(targetResourceUri, expect.anything())
  })

  it('syncs the source-linked card descriptor after approving refreshed Ingest content', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl'
    const targetResourceUri = 'https://pod.example/.data/workspaces/ws-1/cards/report.md'
    const oldManifestUri = 'https://pod.example/.data/index/sources/report-old/manifest.ttl'
    const nextManifestUri = 'https://pod.example/.data/index/sources/report-new/manifest.ttl'
    const proposal = createSourceUpdateProposal({
      documentUri,
      subject: `${documentUri}#card`,
      targetResourceUri,
      sourceUri: 'https://source.example/report.html',
      sourceIngestManifestUri: nextManifestUri,
      ingestVersion: 'url-ingest-v2',
      sourceHash: 'fnv1a-new-source',
      operation: 'replace-blocks',
      proposedContent: '# Refreshed report\n\nUpdated Ingest body.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const cardTurtle = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix dcterms: <http://purl.org/dc/terms/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '',
      '<#card> a udfs:SourceLinkedCard ;',
      '  rdfs:label "Quarterly report" ;',
      '  dcterms:source <https://source.example/report.html> ;',
      '  udfs:sourceHash "fnv1a-old-source" ;',
      '  udfs:parserVersion "url-ingest-v1" ;',
      `  udfs:parserManifest <${oldManifestUri}> ;`,
      `  udfs:bodyResource <${targetResourceUri}> ;`,
      '  udfs:reviewStatus "reviewing" ;',
      '  udfs:writesCanonicalContent false .',
    ].join('\n')
    const savedBodies = new Map<string, string>()
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderSourceUpdateProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (url === targetResourceUri && init?.method === 'PUT') {
        expect(init.headers).toEqual({
          'Content-Type': 'text/markdown',
          'If-Match': '"body-1"',
        })
        savedBodies.set(url, String(init.body))
        return new Response(null, { status: 204 })
      }
      if (url === documentUri && init?.method === 'PUT') {
        expect(init.headers).toEqual({
          'Content-Type': 'text/turtle',
          'If-Match': '"card-1"',
        })
        savedBodies.set(url, String(init.body))
        return new Response(null, { status: 204 })
      }
      if (url === targetResourceUri) {
        return new Response('# Existing report', {
          status: 200,
          headers: { 'Content-Type': 'text/markdown', ETag: '"body-1"' },
        })
      }
      if (url === documentUri) {
        return new Response(savedBodies.get(documentUri) ?? cardTurtle, {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"card-1"' },
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

    await approveSourceUpdateProposalFromInbox(db as any, proposal.id)

    expect(savedBodies.get(targetResourceUri)).toBe('# Refreshed report\n\nUpdated Ingest body.')
    const savedCard = savedBodies.get(documentUri)
    expect(savedCard).toContain('udfs:sourceHash "fnv1a-new-source"')
    expect(savedCard).toContain('udfs:ingestVersion "url-ingest-v2"')
    expect(savedCard).toContain(`udfs:ingestManifest <${nextManifestUri}>`)
    expect(savedCard).not.toContain('udfs:parserVersion')
    expect(savedCard).not.toContain('udfs:parserManifest')
    expect(savedCard).not.toContain('fnv1a-old-source')
    expect(savedCard).not.toContain(oldManifestUri)
    expect(savedCard).toContain('udfs:reviewStatus "reviewing"')
  })

  it('does not sync the source-linked card descriptor for keep-local approvals', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl'
    const targetResourceUri = 'https://pod.example/.data/workspaces/ws-1/cards/report.md'
    const proposal = createSourceUpdateProposal({
      documentUri,
      subject: `${documentUri}#card`,
      targetResourceUri,
      sourceUri: 'https://source.example/report.html',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/report-new/manifest.ttl',
      ingestVersion: 'url-ingest-v2',
      sourceHash: 'fnv1a-new-source',
      operation: 'keep-local',
      proposedContent: null,
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderSourceUpdateProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (url === documentUri && init?.method === 'PUT') {
        throw new Error('keep-local approval must not rewrite the card descriptor')
      }
      return new Response('missing', { status: 404 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await approveSourceUpdateProposalFromInbox(db as any, proposal.id)

    expect(authFetch).not.toHaveBeenCalledWith(documentUri, expect.objectContaining({ method: 'PUT' }))
    expect(authFetch).not.toHaveBeenCalledWith(targetResourceUri, expect.anything())
  })

  it('treats keep-local approvals as audit-only even if proposed content is present', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl'
    const targetResourceUri = 'https://pod.example/.data/workspaces/ws-1/cards/report.md'
    const proposal = createSourceUpdateProposal({
      documentUri,
      subject: `${documentUri}#card`,
      targetResourceUri,
      sourceUri: 'https://source.example/report.html',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/report-new/manifest.ttl',
      ingestVersion: 'url-ingest-v2',
      sourceHash: 'fnv1a-new-source',
      operation: 'keep-local',
      proposedContent: '# Ingest refreshed body that must not be written',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const authFetch = vi.fn(async (uri: RequestInfo | URL) => {
      const url = String(uri)
      if (url === proposal.proposalResourceUri) {
        return new Response(renderSourceUpdateProposalTurtle(proposal), {
          status: 200,
          headers: { 'Content-Type': 'text/turtle', ETag: '"proposal-1"' },
        })
      }
      if (url === targetResourceUri) {
        throw new Error('keep-local approval must not read, update, or create the target body')
      }
      if (url === documentUri) {
        throw new Error('keep-local approval must not read or rewrite the card descriptor')
      }
      return new Response('missing', { status: 404 })
    })
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveSourceUpdateProposalFromInbox(db as any, proposal.id)).resolves.toMatchObject({
      operation: 'keep-local',
      proposedContent: '# Ingest refreshed body that must not be written',
    })

    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(authFetch).toHaveBeenCalledWith(proposal.proposalResourceUri, expect.anything())
  })

  it('refuses to approve a source proposal outside the current Pod', async () => {
    const authFetch = vi.fn()
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
        getAuthenticatedFetch: () => authFetch,
      }),
    }

    await expect(approveSourceUpdateProposalFromInbox(
      db as any,
      'https://evil.example/.data/proposals/source/report.ttl#proposal',
    )).rejects.toThrow('Refusing to approve Ingest proposal outside the current Pod.')
    expect(authFetch).not.toHaveBeenCalled()
  })

  it('refuses to approve a source proposal that targets another Pod', async () => {
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://evil.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://evil.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      proposedContent: '# Other Pod',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const proposalResourceUri = 'https://pod.example/.data/proposals/source/report.ttl'
    const authFetch = vi.fn(async (uri: RequestInfo | URL) => {
      if (String(uri) === proposalResourceUri) {
        return new Response(renderSourceUpdateProposalTurtle({
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

    await expect(approveSourceUpdateProposalFromInbox(db as any, `${proposalResourceUri}#proposal`)).rejects.toThrow(
      'Refusing to approve Ingest proposal outside the current Pod.',
    )
    expect(authFetch).not.toHaveBeenCalledWith('https://evil.example/.data/workspaces/docs/report.md', expect.anything())
  })

  it('creates an inbox approval for a source update proposal', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('approval-1')
      .mockReturnValueOnce('audit-1')
      .mockReturnValueOnce('notification-1')
    const { db, inserts } = createMockDb()
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    const approvalUri = await createSourceUpdateProposalInboxApproval(db as any, {
      actorWebId: 'https://id.example/alice#me',
      proposal,
      createdAt: new Date('2026-06-17T00:00:00.000Z'),
    })

    expect(approvalUri).toBe('https://pod.example/.data/approvals/2026/06/17.ttl#approval-1')
    expect(inserts.find((item) => item.table === approvalResource)?.values).toMatchObject({
      id: approvalResource.buildId({ id: 'approval-1', createdAt: new Date('2026-06-17T00:00:00.000Z') }),
      session: proposal.id,
      toolCallId: 'files.source.proposal:approval-1',
      toolName: 'files.source.proposal',
      target: proposal.id,
      action: 'https://undefineds.co/vocab/reviewSourceUpdateProposal',
      risk: 'medium',
      status: 'pending',
      assignedTo: 'https://id.example/alice#me',
      policyVersion: 'files-source-proposal-v1',
    })
    expect(inserts.find((item) => item.table === auditResource)?.values).toMatchObject({
      id: 'audit-1',
      action: 'files.source.proposal.requested',
      approval: approvalUri,
      entry: proposal.proposalResourceUri,
      toolName: 'files.source.proposal',
    })
    expect(inserts.find((item) => item.table === inboxNotificationResource)?.values).toMatchObject({
      id: 'notification-1',
      object: approvalUri,
    })
  })
})
