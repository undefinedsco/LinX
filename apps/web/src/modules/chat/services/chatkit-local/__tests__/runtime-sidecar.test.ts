import { beforeEach, describe, expect, it, vi } from 'vitest'
import { approvalTable, auditTable, inboxNotificationTable } from '@linx/models'

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

function createMockDb(existingApprovals: Array<Record<string, unknown>> = []) {
  const inserts: InsertRecord[] = []

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
      select() {
        return {
          from() {
            return {
              where() {
                return {
                  execute: vi.fn().mockResolvedValue(existingApprovals),
                }
              },
              execute: vi.fn().mockResolvedValue(existingApprovals),
            }
          },
        }
      },
    },
    inserts,
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
    const sink = new RuntimeSidecarSink(db as any, 'https://alice.example/profile/card#me')

    await sink.persistRuntimeEvent(runtimeSession, {
      type: 'tool_call',
      ts: 1,
      threadId: 'runtime-1',
      requestId: 'call-1',
      name: 'write_file',
      arguments: '{"path":"/tmp/demo.txt"}',
    }, context)

    expect(inserts.filter((item) => item.table === approvalTable)).toHaveLength(1)
    expect(inserts.filter((item) => item.table === auditTable)).toHaveLength(1)
    expect(inserts.filter((item) => item.table === inboxNotificationTable)).toHaveLength(2)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inbox', 'approvals'] })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inbox', 'audit'] })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inbox', 'notifications'] })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inbox', 'items'] })
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

    expect(inserts.filter((item) => item.table === auditTable)).toHaveLength(1)
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(4)
  })
})
