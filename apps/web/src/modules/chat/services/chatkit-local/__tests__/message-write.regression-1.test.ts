import { describe, expect, it, vi } from 'vitest'
import { LocalChatKitStore } from '../store'

// Regression: ISSUE-CHAT-P0-WRITE — a successful Pod insert was followed by a hanging exact read.
// Found by /qa on 2026-08-04.
// Report: .gstack/qa-reports/qa-report-linx-local-2026-08-04.md
describe('ChatKit message write path', () => {
  it('does not re-read a message after its deterministic resource id was inserted', async () => {
    const findById = vi.fn(() => new Promise(() => {}))
    const execute = vi.fn().mockResolvedValue(undefined)
    const values = vi.fn(() => ({ execute }))
    const authFetch = vi.fn().mockResolvedValue(new Response(null, { status: 205 }))
    const store = new LocalChatKitStore(
      {
        findById,
        insert: () => ({ values }),
        getDialect: () => ({ getPodUrl: () => 'https://pod.example/alice/' }),
        resolveRowIri: (_resource: unknown, row: { id: string }) => new URL(`.data/${row.id}`, 'https://pod.example/alice/').toString(),
      } as any,
      'https://id.example/alice#me',
      authFetch as any,
      {
        id: 'chat/test/index.ttl#thread-1',
        status: { type: 'active' },
        created_at: 1,
        updated_at: 1,
        metadata: { chat_id: 'test' },
      },
    )

    await expect(store.addThreadItem('chat/test/index.ttl#thread-1', {
      id: 'user-1',
      thread_id: 'chat/test/index.ttl#thread-1',
      type: 'user_message',
      content: [{ type: 'input_text', text: 'hello' }],
      attachments: [],
      parent_item_id: 'branch-root:user-0',
      branch_id: 'branch-1',
      supersedes: 'user-0',
      created_at: 1,
    }, {})).resolves.toBeUndefined()

    expect(execute).toHaveBeenCalledOnce()
    expect(JSON.parse(values.mock.calls[0]?.[0]?.richContent)).toMatchObject({
      parent_item_id: 'branch-root:user-0',
      branch_id: 'branch-1',
      supersedes: 'user-0',
    })
    expect(findById).not.toHaveBeenCalled()
    expect(authFetch).toHaveBeenCalledOnce()
    expect(authFetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/sparql-update' },
    })
    expect(String(authFetch.mock.calls[0]?.[1]?.body)).toContain('hello')
  })
})
