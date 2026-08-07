import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  uploadAttachment: vi.fn(),
}))

vi.mock('../store', () => ({
  LocalChatKitStore: class LocalChatKitStore {},
}))

vi.mock('../service', () => ({
  LocalChatKitService: class LocalChatKitService {
    process = mocks.process
    uploadAttachment = mocks.uploadAttachment
  },
}))

import { createLocalChatKitFetch } from '../fetch-handler'

// Regression: ISSUE-CHAT-P0 — ChatKit cancellation and binary uploads stopped at the local adapter.
// Found by /qa on 2026-08-02.
// Report: .gstack/qa-reports/qa-report-linx-local-2026-08-02.md
describe('ChatKit local fetch P0 transport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes the ChatKit AbortSignal into the service context', async () => {
    mocks.process.mockResolvedValue({ type: 'non_streaming', json: '{}' })
    const controller = new AbortController()
    const localFetch = createLocalChatKitFetch({
      db: {} as any,
      webId: 'https://id.example/alice#me',
      authFetch: vi.fn() as any,
    })

    await localFetch('local://chatkit', {
      method: 'POST',
      body: '{}',
      signal: controller.signal,
    })

    expect(mocks.process).toHaveBeenCalledWith('{}', { signal: controller.signal })
  })

  it('routes a two-phase binary upload without parsing it as ChatKit JSON', async () => {
    mocks.uploadAttachment.mockResolvedValue({
      id: 'attach-1',
      type: 'file',
      name: 'notes.txt',
      mime_type: 'text/plain',
      upload_descriptor: null,
    })
    const localFetch = createLocalChatKitFetch({
      db: {} as any,
      webId: 'https://id.example/alice#me',
      authFetch: vi.fn() as any,
    })
    const body = new Blob(['hello'])

    const response = await localFetch('local://chatkit/attachments/attach-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body,
    })

    expect(response.status).toBe(200)
    expect(mocks.uploadAttachment).toHaveBeenCalledWith('attach-1', body, 'text/plain', undefined)
    expect(mocks.process).not.toHaveBeenCalled()
  })
})
