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

  it('forwards upload cancellation and allows retrying the same attachment', async () => {
    const controller = new AbortController()
    mocks.uploadAttachment
      .mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
      .mockResolvedValueOnce({
        id: 'attach-retry',
        type: 'file',
        name: 'retry.pdf',
        mime_type: 'application/pdf',
        upload_descriptor: null,
      })
    const localFetch = createLocalChatKitFetch({
      db: {} as any,
      webId: 'https://id.example/alice#me',
      authFetch: vi.fn() as any,
    })
    const body = new Blob(['pdf'])

    controller.abort()
    const cancelled = await localFetch('local://chatkit/attachments/attach-retry', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body,
      signal: controller.signal,
    })
    const retried = await localFetch('local://chatkit/attachments/attach-retry', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body,
    })

    expect(cancelled.status).toBe(500)
    expect(retried.status).toBe(200)
    expect(mocks.uploadAttachment).toHaveBeenNthCalledWith(1, 'attach-retry', body, 'application/pdf', controller.signal)
    expect(mocks.uploadAttachment).toHaveBeenNthCalledWith(2, 'attach-retry', body, 'application/pdf', undefined)
  })

  it('exposes a cancel handle while a streaming response is active', async () => {
    let releaseStream!: () => void
    const streamReleased = new Promise<void>((resolve) => { releaseStream = resolve })
    const states: Array<{ active: boolean; abort?: () => void }> = []
    let serviceSignal: AbortSignal | undefined
    mocks.process.mockImplementation(async (_body, context) => {
      serviceSignal = context.signal
      return {
        type: 'streaming',
        stream: async function* () {
          await streamReleased
          yield new TextEncoder().encode('data: {}\n\n')
        },
      }
    })
    const localFetch = createLocalChatKitFetch({
      db: {} as any,
      webId: 'https://id.example/alice#me',
      authFetch: vi.fn() as any,
      onStreamingChange: (state) => states.push(state),
    })

    const response = await localFetch('local://chatkit', { method: 'POST', body: '{}' })
    expect(states[0]?.active).toBe(true)
    states[0]?.abort?.()
    expect(serviceSignal?.aborted).toBe(true)
    expect(serviceSignal?.reason).toMatchObject({ name: 'AbortError' })

    releaseStream()
    await response.text()
    expect(states.at(-1)).toEqual({ active: false })
  })
})
