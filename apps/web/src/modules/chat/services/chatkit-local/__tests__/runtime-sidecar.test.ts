import { beforeEach, describe, expect, it, vi } from 'vitest'
import { approvalResource, auditResource, inboxNotificationTable, sessionTable } from '@undefineds.co/models'

const mocked = vi.hoisted(() => ({
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/providers/query-provider', () => ({
  queryClient: {
    invalidateQueries: mocked.invalidateQueries,
  },
}))

import { queryClient } from '@/providers/query-provider'
import { RuntimeSidecarSink } from '../runtime-sidecar'

type InsertRecord = {
  table: unknown
  values: Record<string, unknown>
}

function createMockDb(
  existingApprovals: Array<Record<string, unknown>> = [],
  existingSessions: Array<Record<string, unknown>> = [],
) {
  const inserts: InsertRecord[] = []
  const updates: InsertRecord[] = []

  return {
    db: {
      insert(table: unknown) {
        return {
          values(values: Record<string, unknown>) {
            inserts.push({ table, values })
            return {
              execute: vi.fn().mockResolvedValue(undefined),
            }
          },
        }
      },
      findById(table: unknown, id: string) {
        const rows = table === sessionTable ? existingSessions : existingApprovals
        return Promise.resolve(rows.find((row) => row.id === id) ?? null)
      },
      updateById(table: unknown, id: string, values: Record<string, unknown>) {
        updates.push({ table, values: { id, ...values } })
        return Promise.resolve({ id, ...values })
      },
      update(table: unknown) {
        return {
          set(values: Record<string, unknown>) {
            updates.push({ table, values })
            return {
              where() {
                return {
                  execute: vi.fn().mockResolvedValue(undefined),
                }
              },
            }
          },
        }
      },
      select() {
        return {
          from(table: unknown) {
            return {
              where() {
                return {
                  execute: vi.fn().mockResolvedValue(table === sessionTable ? existingSessions : existingApprovals),
                }
              },
              execute: vi.fn().mockResolvedValue(table === sessionTable ? existingSessions : existingApprovals),
            }
          },
        }
      },
    },
    inserts,
    updates,
  }
}

const runtimeSession = {
  id: 'runtime-1',
  threadId: 'thread-1',
  title: 'Demo Runtime',
  tool: 'codex',
  status: 'active' as const,
  tokenUsage: 12,
}

const context = {
  chatId: 'chat-1',
  threadId: 'thread-1',
}

describe('RuntimeSidecarSink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invalidates inbox queries after a new tool approval event', async () => {
    const { db, inserts } = createMockDb()
    const onSyncResult = vi.fn()
    const sink = new RuntimeSidecarSink(db as any, 'https://alice.example/profile/card#me', {
      now: () => new Date('2026-05-21T00:00:00.000Z'),
      onSyncResult,
    })

    await sink.persistRuntimeEvent(runtimeSession, {
      type: 'tool_call',
      ts: 1,
      threadId: 'runtime-1',
      requestId: 'call-1',
      name: 'write_file',
      arguments: '{"path":"/tmp/demo.txt"}',
    }, context)

    expect(inserts.filter((item) => item.table === approvalResource)).toHaveLength(1)
    expect(inserts.filter((item) => item.table === auditResource)).toHaveLength(1)
    expect(inserts.filter((item) => item.table === inboxNotificationTable)).toHaveLength(2)
    expect(inserts.find((item) => item.table === approvalResource)?.values.session).toBe(
      'https://alice.example/.data/sessions/1970/01/01/runtime-1.ttl',
    )
    const audit = inserts.find((item) => item.table === auditResource)?.values
    expect(audit?.toolName).toBe('write_file')
    expect(audit?.entry).toBe('https://alice.example/.data/chat/chat-1/index.ttl#thread-1')
    expect(audit).not.toHaveProperty('context')
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inbox', 'approvals'] })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inbox', 'audit'] })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inbox', 'notifications'] })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inbox', 'items'] })

    expect(sink.getSyncResults()).toHaveLength(1)
    expect(onSyncResult).toHaveBeenCalledTimes(1)
    expect(sink.getSyncResults()[0]).toMatchObject({
      source: 'chatkit-local-runtime',
      target: 'pod',
      direction: 'local-to-core',
      plane: 'projection',
      authority: 'core',
      attempted: 1,
      applied: 1,
      failed: 0,
      status: 'completed',
    })
  })

  it('dedupes repeated status events and avoids redundant invalidation', async () => {
    const { db, inserts } = createMockDb()
    const sink = new RuntimeSidecarSink(db as any, 'https://alice.example/profile/card#me')

    await sink.persistRuntimeEvent(runtimeSession, {
      type: 'status',
      ts: 1,
      threadId: 'runtime-1',
      status: 'active',
    }, context)

    await sink.persistRuntimeEvent(runtimeSession, {
      type: 'status',
      ts: 2,
      threadId: 'runtime-1',
      status: 'active',
    }, context)

    expect(inserts.filter((item) => item.table === auditResource)).toHaveLength(1)
    expect(inserts.filter((item) => item.table === sessionTable)).toHaveLength(1)
    expect(inserts.find((item) => item.table === sessionTable)?.values.chat).toBe(
      'https://alice.example/.data/chat/chat-1/index.ttl#this',
    )
    expect(inserts.find((item) => item.table === sessionTable)?.values.thread).toBe(
      'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
    )
    expect(inserts.find((item) => item.table === sessionTable)?.values).not.toHaveProperty('chatId')
    expect(inserts.find((item) => item.table === sessionTable)?.values).not.toHaveProperty('threadId')
    expect(inserts.find((item) => item.table === auditResource)?.values).not.toHaveProperty('context')
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(4)
    expect(sink.getSyncResults()).toHaveLength(1)
    expect(sink.getSyncResults()[0]).toMatchObject({
      source: 'chatkit-local-runtime',
      target: 'pod',
      direction: 'local-to-core',
      plane: 'projection',
      authority: 'core',
    })
  })

  it('ignores runtime events without core projection state', async () => {
    const { db, inserts } = createMockDb()
    const onSyncResult = vi.fn()
    const sink = new RuntimeSidecarSink(db as any, 'https://alice.example/profile/card#me', { onSyncResult })

    await sink.persistRuntimeEvent(runtimeSession, {
      type: 'stdout',
      ts: 1,
      threadId: 'runtime-1',
    }, context)

    expect(inserts).toHaveLength(0)
    expect(sink.getSyncResults()).toHaveLength(0)
    expect(onSyncResult).not.toHaveBeenCalled()
  })

  it('updates an existing session row when runtime status changes', async () => {
    const { db, updates } = createMockDb([], [{
      id: runtimeSession.id,
      status: 'active',
    }])
    const sink = new RuntimeSidecarSink(db as any, 'https://alice.example/profile/card#me')

    await sink.persistRuntimeEvent(runtimeSession, {
      type: 'status',
      ts: 2,
      threadId: 'runtime-1',
      status: 'paused',
    }, context)

    expect(updates.filter((item) => item.table === sessionTable)).toHaveLength(1)
    expect(updates.find((item) => item.table === sessionTable)?.values.status).toBe('paused')
  })

  it('records auth resolution once runtime output resumes after auth_required', async () => {
    const { db, inserts } = createMockDb()
    const sink = new RuntimeSidecarSink(db as any, 'https://alice.example/profile/card#me')

    await sink.persistRuntimeEvent(runtimeSession, {
      type: 'auth_required',
      ts: 10,
      threadId: 'runtime-1',
      method: 'oauth2',
      url: 'https://example.com/auth',
      message: 'Please sign in',
    }, context)

    await sink.persistRuntimeEvent(runtimeSession, {
      type: 'assistant_delta',
      ts: 11,
      threadId: 'runtime-1',
    }, context)

    const auditActions = inserts
      .filter((item) => item.table === auditResource)
      .map((item) => item.values.action)

    expect(auditActions).toContain('runtime.auth_required')
    expect(auditActions).toContain('runtime.auth_resolved')
    expect(inserts.filter((item) => item.table === auditResource).every((item) => !('context' in item.values))).toBe(true)
    expect(inserts.filter((item) => item.table === inboxNotificationTable)).toHaveLength(2)
  })
})
