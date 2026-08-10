import { describe, expect, it, vi } from 'vitest'
import { LocalChatKitStore } from '../store'

// Regression: ISSUE-CHAT-P0 — ChatKit attachment APIs returned success without storing bytes.
// Found by /qa on 2026-08-02.
// Report: .gstack/qa-reports/qa-report-linx-local-2026-08-02.md
describe('ChatKit P0 attachment storage', () => {
  function createStore(authFetch = vi.fn()) {
    return new LocalChatKitStore({
      getDialect: () => ({ getPodUrl: () => 'https://pod.example/alice/' }),
    } as any, 'https://id.example/alice#me', authFetch as any)
  }

  it('creates a two-phase image descriptor backed by the current Pod', () => {
    const store = createStore()
    const attachment = store.createAttachment({ name: 'photo.png', mime_type: 'image/png' })

    expect(attachment).toMatchObject({
      type: 'image',
      name: 'photo.png',
      mime_type: 'image/png',
      preview_url: expect.stringMatching(/^https:\/\/pod\.example\/alice\/\.data\/chat-attachments\/attach-/),
      upload_descriptor: {
        method: 'PUT',
        url: expect.stringMatching(/^local:\/\/chatkit\/attachments\/attach-/),
        headers: { 'Content-Type': 'image/png' },
      },
    })
  })

  it('creates the Pod container, uploads bytes, and returns completed metadata', async () => {
    const authFetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
    const store = createStore(authFetch)
    const attachment = store.createAttachment({ name: 'notes.txt', mime_type: 'text/plain' })

    const uploaded = await store.uploadAttachment(attachment.id, new Blob(['hello']), 'text/plain')

    expect(authFetch).toHaveBeenNthCalledWith(1, 'https://pod.example/alice/.data/chat-attachments/', { method: 'HEAD' })
    expect(authFetch).toHaveBeenNthCalledWith(2, 'https://pod.example/alice/.data/chat-attachments/', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"' }),
    }))
    expect(authFetch).toHaveBeenNthCalledWith(3, expect.stringContaining(attachment.id), expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
    }))
    expect(uploaded.upload_descriptor).toBeNull()
    await expect(store.loadAttachment(attachment.id, {})).resolves.toEqual(uploaded)
  })

  it('rehydrates a historical image from authenticated Pod bytes', async () => {
    const authFetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    }))
    const store = createStore(authFetch)
    const item = await (store as any).hydrateItemAttachments({
      id: 'user-1',
      thread_id: 'thread-1',
      type: 'user_message',
      content: [{ type: 'input_text', text: 'look' }],
      attachments: [{
        id: 'attach-history',
        type: 'image',
        name: 'history.png',
        mime_type: 'image/png',
        preview_url: 'https://pod.example/alice/.data/chat-attachments/attach-history',
      }],
      created_at: 1,
    })

    expect(authFetch).toHaveBeenCalledWith('https://pod.example/alice/.data/chat-attachments/attach-history')
    expect(item.attachments[0]).toMatchObject({
      preview_url: expect.stringMatching(/^blob:/),
      download_url: expect.stringMatching(/^blob:/),
    })
    await expect(store.loadAttachment('attach-history', {})).resolves.toMatchObject({ pod_url: expect.stringContaining('attach-history') })
  })

  it('restores persisted message attachments and gives files a download URL', async () => {
    const authFetch = vi.fn(async () => new Response(new TextEncoder().encode('hello'), {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    }))
    const store = createStore(authFetch)
    const storedItem = {
      id: 'user-history',
      thread_id: 'thread-1',
      type: 'user_message',
      content: [{ type: 'input_text', text: 'read this' }],
      attachments: [{
        id: 'attach-file-history',
        type: 'file',
        name: 'notes.txt',
        mime_type: 'text/plain',
        pod_url: 'https://pod.example/alice/.data/chat-attachments/attach-file-history',
      }],
      created_at: 1,
    }

    const item = await (store as any).hydrateItemAttachments(storedItem)

    expect(item?.attachments[0]).toMatchObject({
      name: 'notes.txt',
      download_url: expect.stringMatching(/^blob:/),
    })
  })

  it('replaces active branch and thread singleton values in one Pod patch', async () => {
    const authFetch = vi.fn(async () => new Response(null, { status: 205 }))
    const store = createStore(authFetch)

    await (store as any).normalizeThreadSingletons(
      'https://pod.example/alice/.data/chat/default/index.ttl#thread-1',
      'Thread title',
      'active',
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-10T00:00:00.000Z'),
      { 'user-1': 'assistant-2' },
    )

    expect(authFetch).toHaveBeenCalledWith(
      'https://pod.example/alice/.data/chat/default/index.ttl',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"{\\"user-1\\":\\"assistant-2\\"}"^^<http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON>'),
      }),
    )
    const body = authFetch.mock.calls[0]?.[1]?.body as string
    expect(body).toContain('https://undefineds.co/ns#active_branch_by_parent')
    expect(body).toContain('http://purl.org/dc/terms/created')
    expect(body).toContain('http://purl.org/dc/terms/modified')
  })
})
