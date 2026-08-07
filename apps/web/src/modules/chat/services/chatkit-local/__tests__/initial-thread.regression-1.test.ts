import { describe, expect, it, vi } from 'vitest'
import { LocalChatKitStore } from '../store'

// Regression: ISSUE-CHAT-P0-THREAD — ChatKit re-read the selected Pod Thread and timed out before sending.
// Found by /qa on 2026-08-04.
// Report: .gstack/qa-reports/qa-report-linx-local-2026-08-04.md
describe('ChatKit selected thread bootstrap', () => {
  it('serves injected selected-thread metadata without another Pod lookup', async () => {
    const findById = vi.fn(() => new Promise(() => {}))
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
        metadata: { chat_id: '__secretary__' },
      })
    expect(findById).not.toHaveBeenCalled()
  })
})
