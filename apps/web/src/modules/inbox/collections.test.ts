import { beforeEach, describe, expect, it, vi } from 'vitest'
import { auditResource, inboxNotificationResource } from '@undefineds.co/models'
import { buildRuntimeToolResponse, inboxOps, initializeInboxCollections } from './collections'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('buildRuntimeToolResponse', () => {
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

    const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = []
    const updates: Array<{ table: unknown; iri: string; values: Record<string, unknown> }> = []
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
      }),
      updateByIri: vi.fn(async (table: unknown, iri: string, values: Record<string, unknown>) => {
        updates.push({ table, iri, values })
      }),
      insert: vi.fn((table: unknown) => ({
        values(values: Record<string, unknown>) {
          inserts.push({ table, values })
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
    const audit = inserts.find((item) => item.table === auditResource)?.values
    const notification = inserts.find((item) => item.table === inboxNotificationResource)?.values
    expect(audit?.actor).toBe('https://id.undefineds.co/alice/profile/card#me')
    expect(audit?.approval).toBe('https://node-0000.undefineds.co/alice/.data/approvals/2026/05/26.ttl#approval-1')
    expect(notification?.object).toMatch(/^https:\/\/node-0000\.undefineds\.co\/alice\/\.data\/audits\//)
  })

  it('refuses to resolve a stale Cloud approval while the current session is rooted in Local SP', async () => {
    const updateByIri = vi.fn(async () => undefined)
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
      }),
      updateByIri,
      insert: vi.fn((table: unknown) => ({
        values(values: Record<string, unknown>) {
          return { execute: vi.fn(async () => ({ table, values })) }
        },
      })),
    }
    initializeInboxCollections(db as any)

    await expect(inboxOps.resolveApproval({
      approval: {
        id: 'approval-cloud',
        '@id': 'https://id.undefineds.co/alice/.data/approvals/2026/05/26.ttl#approval-cloud',
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
})
