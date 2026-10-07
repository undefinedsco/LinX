import { describe, expect, it, vi } from 'vitest'
import { LocalChatKitStore } from '../store'

// Regression: ISSUE-CHAT-P0-THREAD — ChatKit re-read the selected Pod Thread and timed out before sending.
// Found by /qa on 2026-08-04.
// Report: .gstack/qa-reports/qa-report-linx-local-2026-08-04.md
describe('ChatKit selected thread bootstrap', () => {
  it('hydrates injected selected-thread metadata from the Pod before caching it', async () => {
    const findById = vi.fn().mockResolvedValue({
      id: 'chat/__secretary__/index.ttl#__default__',
      title: 'Pod title',
      status: 'active',
      // A stale/global query may still expose the legacy default parent. The
      // constructor's selected chat is authoritative for this thread.
      parent: 'https://pod.example/alice/.data/chat/default/index.ttl#this',
      createdAt: new Date(1_000),
      updatedAt: new Date(2_000),
      metadata: JSON.stringify({
        active_branch_by_parent: {
          0: JSON.stringify({ 'user-1': 'assistant-1' }),
          1: { 'user-1': 'assistant-2', 'branch-root:user-2': 'user-2-edited' },
        },
      }),
    })
    const store = new LocalChatKitStore(
      {
        findById,
        getDialect: () => ({ getPodUrl: () => 'https://pod.example/alice/' }),
      } as any,
      'https://id.example/alice#me',
      vi.fn() as any,
      {
        id: 'chat/__secretary__/index.ttl#__default__',
        title: '默认话题',
        status: { type: 'active' },
        created_at: 1,
        updated_at: 1,
        metadata: { chat_id: '__secretary__' },
      },
    )

    await expect(store.loadThread('chat/__secretary__/index.ttl#__default__', {}))
      .resolves.toMatchObject({
        id: 'chat/__secretary__/index.ttl#__default__',
        title: 'Pod title',
        metadata: {
          chat_id: '__secretary__',
          active_branch_by_parent: {
            'user-1': 'assistant-2',
            'branch-root:user-2': 'user-2-edited',
          },
        },
      })
    expect(findById).toHaveBeenCalledTimes(1)

    await store.loadThread('chat/__secretary__/index.ttl#__default__', {})
    expect(findById).toHaveBeenCalledTimes(1)
  })

  it('reuses recent in-memory transcript data for the same Pod account', async () => {
    const execute = vi.fn().mockResolvedValue([])
    const query: any = {
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      limit: vi.fn(() => query),
      execute,
    }
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => query) })),
      getDialect: () => ({ getPodUrl: () => 'https://pod.example/alice/' }),
    } as any
    const thread = {
      id: 'thread-shared-cache',
      status: { type: 'active' as const },
      created_at: 1,
      updated_at: 1,
      metadata: { chat_id: 'chat-shared-cache' },
    }

    const firstStore = new LocalChatKitStore(db, 'https://id.example/alice#me', vi.fn() as any, thread)
    await expect(firstStore.loadThreadItems(thread.id, undefined, 100, 'desc', {}))
      .resolves.toMatchObject({ data: [], has_more: false })

    const secondStore = new LocalChatKitStore(db, 'https://id.example/alice#me', vi.fn() as any, thread)
    await expect(secondStore.loadThreadItems(thread.id, undefined, 100, 'desc', {}))
      .resolves.toMatchObject({ data: [], has_more: false })
    await secondStore.refreshThreadItems(thread.id, {})

    expect(execute).toHaveBeenCalledTimes(1)

    const otherAccountStore = new LocalChatKitStore(db, 'https://id.example/bob#me', vi.fn() as any, thread)
    await otherAccountStore.loadThreadItems(thread.id, undefined, 100, 'desc', {})
    expect(execute).toHaveBeenCalledTimes(2)
  })
})
