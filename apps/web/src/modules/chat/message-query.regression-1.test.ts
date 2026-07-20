import { describe, expect, it, vi } from 'vitest'
import { messageResource } from '@undefineds.co/models'
import { queryMessageRowsForChat } from './message-query'

// Regression: ISSUE-001 — populated Pod message SELECT stalled xpod through OPTIONAL joins
// Found by /qa on 2026-07-21
// Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-07-21.md
describe('queryMessageRowsForChat regression', () => {
  it('selects only render and routing predicates without a full-row hydration query', async () => {
    const chatIri = 'http://localhost:5737/alice/.data/chat/default/index.ttl#this'
    const fullRow = {
      id: 'chat/default/2026/07/21/messages.ttl#message-1',
      parent: chatIri,
      chat: chatIri,
      thread: 'http://localhost:5737/alice/.data/chat/default/index.ttl#__default__',
      role: 'user',
      content: 'hello',
      status: 'completed',
      createdAt: new Date('2026-07-21T00:00:00.000Z'),
      metadata: {
        reconciler: {
          latest: { thread: 'http://localhost:5737/alice/.data/chat/default/index.ttl#__default__' },
        },
      },
    }
    const execute = vi.fn(async () => [{
      id: fullRow.id,
      parent: fullRow.parent,
      thread: undefined,
      role: fullRow.role,
      content: fullRow.content,
      richContent: null,
      status: fullRow.status,
      metadata: fullRow.metadata,
      createdAt: fullRow.createdAt,
    }])
    const where = vi.fn(() => ({ execute }))
    const from = vi.fn(() => ({ where }))
    const select = vi.fn(() => ({ from }))
    const findById = vi.fn(async () => fullRow)

    await expect(queryMessageRowsForChat({ select, findById } as any, chatIri))
      .resolves.toEqual([expect.objectContaining({
        id: fullRow.id,
        chat: chatIri,
        thread: fullRow.thread,
        content: fullRow.content,
      })])

    const projection = select.mock.calls[0]?.[0] as Record<string, unknown>
    expect(Object.keys(projection)).toEqual([
      'id', 'parent', 'role', 'content', 'richContent', 'status', 'metadata', 'createdAt',
    ])
    expect(projection).not.toHaveProperty('maker')
    expect(projection).not.toHaveProperty('thread')
    expect(projection).not.toHaveProperty('mentions')
    expect(where).toHaveBeenCalledWith(expect.objectContaining({
      operator: '=',
      left: expect.objectContaining({ name: 'parent' }),
      right: chatIri,
    }))
    expect(findById).not.toHaveBeenCalled()
  })

  it('uses the requested thread as a fallback and collapses metadata join duplicates', async () => {
    const chatIri = 'http://localhost:5737/alice/.data/chat/default/index.ttl#this'
    const threadIri = 'http://localhost:5737/alice/.data/chat/default/index.ttl#__default__'
    const candidate = {
      id: 'chat/default/messages.ttl#message-1',
      parent: chatIri,
      role: 'user',
      content: 'hello',
      metadata: undefined,
    }
    const execute = vi.fn(async () => [candidate, { ...candidate }])
    const where = vi.fn(() => ({ execute }))
    const from = vi.fn(() => ({ where }))
    const select = vi.fn(() => ({ from }))

    const rows = await queryMessageRowsForChat({ select } as any, chatIri, threadIri)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.thread).toBe(threadIri)
    expect(where).toHaveBeenCalledWith(expect.objectContaining({ operator: '=' }))
  })

})
