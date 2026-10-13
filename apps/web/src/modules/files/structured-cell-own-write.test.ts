import { describe, expect, it, vi } from 'vitest'
import { auditResource } from '@undefineds.co/models'
import {
  StructuredCellWriteConflictError,
  writeOwnStructuredCellChange,
} from './data/proposal/structured-cell-approval-commands'

const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'

function createDb(patchStatus = 204) {
  const patches: Array<{ url: string; body: string; headers: Record<string, string> }> = []
  const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = []
  const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      patches.push({ url: String(uri), body: String(init.body), headers: init.headers as Record<string, string> })
      return new Response(null, { status: patchStatus })
    }
    return new Response('missing', { status: 404 })
  })
  const db = {
    getDialect: () => ({
      getPodUrl: () => 'https://pod.example/',
      getAuthenticatedFetch: () => authFetch,
    }),
    insert: vi.fn((table: unknown) => ({
      values(values: Record<string, unknown>) {
        inserts.push({ table, values })
        return { execute: vi.fn(async () => undefined) }
      },
    })),
  }
  return { db: db as any, patches, inserts }
}

const change = {
  actorWebId: 'https://pod.example/profile/card#me',
  documentUri,
  subject: '#Workspace',
  predicate: 'mode',
  previousValues: ['"read"'],
  nextValues: ['"read/write"'],
}

describe("writing the person's own structured edits", () => {
  it('patches the document directly and leaves an audit trail, without an approval', async () => {
    const { db, patches, inserts } = createDb()

    await writeOwnStructuredCellChange(db, change)

    expect(patches).toHaveLength(1)
    expect(patches[0].url).toBe(documentUri)
    expect(patches[0].body).toContain('DELETE DATA')
    expect(patches[0].body).toContain('<#Workspace> mode "read" .')
    expect(patches[0].body).toContain('<#Workspace> mode "read/write" .')
    expect(inserts).toHaveLength(1)
    expect(inserts[0].table).toBe(auditResource)
    expect(inserts[0].values).toMatchObject({
      action: 'files.structured-cell.written',
      actor: change.actorWebId,
      actorRole: 'human',
      entry: documentUri,
    })
  })

  it('only writes over the version the person saw', async () => {
    const { db, patches, inserts } = createDb(412)

    await expect(writeOwnStructuredCellChange(db, { ...change, expectedEtag: '"v1"' }))
      .rejects.toBeInstanceOf(StructuredCellWriteConflictError)
    // The Pod's PATCH accepts DELETE DATA of a value that is already gone, so the version check
    // is what stops a stale edit from adding a second value.
    expect(patches[0].headers['If-Match']).toBe('"v1"')
    expect(inserts).toHaveLength(0)
  })

  it('keeps the same guards as approvals: current Pod, editable data, not the vocab registry', async () => {
    const { db, patches } = createDb()

    await expect(writeOwnStructuredCellChange(db, { ...change, documentUri: 'https://other.example/.data/x.ttl' }))
      .rejects.toThrow(/outside the current Pod/)
    await expect(writeOwnStructuredCellChange(db, { ...change, documentUri: 'https://pod.example/.vocab/terms.ttl' }))
      .rejects.toThrow(/vocab registry/)
    await expect(writeOwnStructuredCellChange(db, { ...change, documentUri: 'https://pod.example/public/notes.ttl' }))
      .rejects.toThrow(/outside editable \.data resources/)
    expect(patches).toHaveLength(0)
  })
})
