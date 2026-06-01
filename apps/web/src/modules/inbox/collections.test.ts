import { beforeEach, describe, expect, it, vi } from 'vitest'
import { approvalResource, auditResource, inboxNotificationResource } from '@undefineds.co/models'

const mocked = vi.hoisted(() => ({
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/providers/query-provider', () => ({
  queryClient: {
    invalidateQueries: mocked.invalidateQueries,
  },
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ db: null }),
}))

vi.mock('@inrupt/solid-ui-react', () => ({
  useSession: () => ({ session: { info: {} } }),
}))

vi.mock('@/modules/chat/services/chatkit-local/runtime-tool-response', () => ({
  continueRuntimeToolCallFromInbox: vi.fn(),
}))

import {
  approvalDecisionForOption,
  buildApprovalOptionReason,
  buildRuntimeToolResponse,
  clearInboxOpsSyncResults,
  getInboxOpsSyncResults,
  inboxOps,
  setInboxDatabaseGetter,
  parseApprovalOptions,
} from './collections'

type InsertRecord = {
  table: unknown
  values: Record<string, unknown>
}

function createMockDb() {
  const inserts: InsertRecord[] = []
  const updates: InsertRecord[] = []
  const subscriptions: Array<{
    table: unknown
    handlers: Record<string, (activity: unknown) => Promise<void>>
    unsubscribe: ReturnType<typeof vi.fn>
  }> = []

  return {
    db: {
      subscribe(table: unknown, handlers: Record<string, (activity: unknown) => Promise<void>>) {
        const unsubscribe = vi.fn()
        subscriptions.push({ table, handlers, unsubscribe })
        return Promise.resolve({ unsubscribe })
      },
      updateByIri(table: unknown, iri: string, values: Record<string, unknown>) {
        updates.push({ table, values: { iri, ...values } })
        return Promise.resolve({ iri, ...values })
      },
      insert(table: unknown) {
        return {
          values(values: Record<string, unknown>) {
            inserts.push({ table, values })
            return {
              execute: vi.fn().mockResolvedValue([values]),
            }
          },
        }
      },
    },
    inserts,
    subscriptions,
    updates,
  }
}

describe('buildRuntimeToolResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearInboxOpsSyncResults()
    setInboxDatabaseGetter(() => null)
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

  it('parses stored approval options and maps reject choices', () => {
    const options = parseApprovalOptions(JSON.stringify([
      { optionId: '0', label: 'Allow', kind: 'allow_once' },
      { optionId: '1', label: 'Block', kind: 'reject_once' },
    ]))

    expect(options).toEqual([
      { optionId: '0', label: 'Allow', kind: 'allow_once' },
      { optionId: '1', label: 'Block', kind: 'reject_once' },
    ])
    expect(approvalDecisionForOption(options[0])).toBe('approved')
    expect(approvalDecisionForOption(options[1])).toBe('rejected')
  })

  it('builds a structured selected-option reason for extension UI approvals', () => {
    expect(JSON.parse(buildApprovalOptionReason({ optionId: '1', label: 'Block', kind: 'reject_once' }, ' too risky '))).toEqual({
      source: 'linx-inbox',
      selectedOptionId: '1',
      selectedLabel: 'Block',
      note: 'too risky',
    })
  })

  it('subscribes approval, audit and notification collections to Pod changes', async () => {
    const { db, subscriptions } = createMockDb()
    setInboxDatabaseGetter(() => db as any)

    const unsubscribe = await inboxOps.subscribeToPod()

    expect(subscriptions.map((item) => item.table)).toEqual([
      approvalResource,
      auditResource,
      inboxNotificationResource,
    ])
    expect(mocked.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inbox', 'items'] })

    mocked.invalidateQueries.mockClear()
    await subscriptions[0].handlers.onUpdate({ object: 'approval-1' })

    expect(mocked.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inbox', 'approvals'] })
    expect(mocked.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inbox', 'items'] })

    unsubscribe()
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1)
    expect(subscriptions[1].unsubscribe).toHaveBeenCalledTimes(1)
    expect(subscriptions[2].unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('models inbox approval resolution as local-to-core control-plane sync', async () => {
    const { db, inserts, updates } = createMockDb()
    setInboxDatabaseGetter(() => db as any)

    await inboxOps.resolveApproval({
      approval: {
        id: 'approval-1',
        status: 'pending',
        risk: 'medium',
        toolName: 'shell',
        target: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
        session: 'urn:linx:runtime-session:session-1',
        toolCallId: 'tool-call-1',
        createdAt: new Date('2026-05-21T00:00:00.000Z'),
      } as any,
      decision: 'approved',
      actorWebId: 'https://alice.example/profile/card#me',
      reason: ' ok ',
    })

    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      table: approvalResource,
      values: {
        status: 'approved',
        decisionBy: 'https://alice.example/profile/card#me',
        decisionRole: 'human',
        reason: 'ok',
        policyVersion: 'phase4-inbox-v1',
      },
    })
    expect(inserts.find((item) => item.table === auditResource)?.values).toMatchObject({
      action: 'inbox.approval.approved',
      actor: 'https://alice.example/profile/card#me',
      actorRole: 'human',
      session: 'urn:linx:runtime-session:session-1',
      toolCallId: 'tool-call-1',
      toolName: 'shell',
      entry: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
      policyVersion: 'phase4-inbox-v1',
    })
    expect(inserts.find((item) => item.table === inboxNotificationResource)?.values).toMatchObject({
      actor: 'https://alice.example/profile/card#me',
    })

    expect(getInboxOpsSyncResults()).toHaveLength(1)
    expect(getInboxOpsSyncResults()[0]).toMatchObject({
      source: 'app-inbox',
      target: 'pod',
      direction: 'local-to-core',
      plane: 'control-plane',
      authority: 'core',
      status: 'completed',
      metadata: {
        action: 'approval.resolve',
        resourceBindings: {
          approval: {
            uri: 'https://alice.example/profile/.data/approvals/2026/05/21.ttl#approval-1',
            local: 'approval-1',
          },
          audit: {
            uri: expect.stringMatching(/^https:\/\/alice\.example\/profile\/\.data\/audits\/\d{4}\/\d{2}\/\d{2}\.ttl#[0-9a-f-]+$/),
            local: expect.stringMatching(/^[0-9a-f-]+$/),
          },
        },
        decision: 'approved',
      },
    })
    expect(mocked.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inbox', 'approvals'] })
    expect(mocked.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inbox', 'audit'] })
    expect(mocked.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inbox', 'notifications'] })
    expect(mocked.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['inbox', 'items'] })
  })
})
