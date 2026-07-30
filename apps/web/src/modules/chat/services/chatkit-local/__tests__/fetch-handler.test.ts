import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
  attachments: new Map<string, Record<string, unknown>>(),
}))

vi.mock('../store', () => ({
  LocalChatKitStore: class LocalChatKitStore {
    async saveAttachment(attachment: Record<string, unknown>) {
      mocks.attachments.set(String(attachment.id), attachment)
    }
    async loadAttachment(id: string) {
      const attachment = mocks.attachments.get(id)
      if (!attachment) throw new Error(`Attachment not found: ${id}`)
      return attachment
    }
    async deleteAttachment(id: string) {
      mocks.attachments.delete(id)
    }
  },
}))

vi.mock('../service', () => ({
  LocalChatKitService: class LocalChatKitService {
    process = mocks.process
  },
}))

import { createLocalChatKitFetch } from '../fetch-handler'

describe('createLocalChatKitFetch', () => {
  beforeEach(() => {
    mocks.process.mockReset()
    mocks.attachments.clear()
  })

  it('stores a two-phase attachment upload as a data URL', async () => {
    mocks.attachments.set('attach-1', {
      id: 'attach-1',
      attachment_id: 'attach-1',
      type: 'image',
      name: 'sample.png',
      mime_type: 'image/png',
    })
    const localFetch = createLocalChatKitFetch({
      db: {} as any,
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      authFetch: vi.fn() as any,
    })

    const response = await localFetch(
      'http://localhost/__linx_chatkit_attachment__/attach-1',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: new Uint8Array([137, 80, 78, 71]),
      },
    )
    const attachment = await response.json()

    expect(response.status).toBe(200)
    expect(attachment.preview_url).toBe('data:image/png;base64,iVBORw==')
    expect(attachment.upload_descriptor).toBeNull()
    expect(mocks.process).not.toHaveBeenCalled()
  })

  it('returns a user-facing error payload without local runtime internals', async () => {
    mocks.process.mockRejectedValueOnce(
      new Error("Cannot find module 'jsonld'\nRequire stack:\n- /Users/ganlu/Library/Application Support/@linx/xpod.js"),
    )

    const localFetch = createLocalChatKitFetch({
      db: {} as any,
      webId: 'https://id.undefineds.co/alice/profile/card#me',
      authFetch: vi.fn() as any,
    })

    const response = await localFetch('/v1/threads', { method: 'POST', body: '{}' })
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error.message).toBe('本地空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本地空间设置修复。')
    expect(body.error.message).not.toMatch(/jsonld|Require stack|Application Support|\/Users|xpod/i)
  })

  it('notifies the host when a Solid write fails because the access token expired', async () => {
    const onAuthorizationExpired = vi.fn()
    mocks.process.mockRejectedValueOnce(
      new Error('Write failed to http://localhost:5737/alice/messages.ttl: 401 Unauthorized'),
    )

    const localFetch = createLocalChatKitFetch({
      db: {} as any,
      webId: 'http://localhost:5737/alice/profile/card#me',
      authFetch: vi.fn() as any,
      onAuthorizationExpired,
    })

    const response = await localFetch('/v1/threads', { method: 'POST', body: '{}' })
    const body = await response.json()

    expect(onAuthorizationExpired).toHaveBeenCalledTimes(1)
    expect(body.error.message).toBe('登录状态已失效。请重新登录。')
  })

  it('does not invalidate the Solid login for a model API key 401', async () => {
    const onAuthorizationExpired = vi.fn()
    mocks.process.mockRejectedValueOnce(
      new Error('API Error 401: Incorrect API key provided'),
    )

    const localFetch = createLocalChatKitFetch({
      db: {} as any,
      webId: 'http://localhost:5737/alice/profile/card#me',
      authFetch: vi.fn() as any,
      onAuthorizationExpired,
    })

    const response = await localFetch('/v1/threads', { method: 'POST', body: '{}' })
    const body = await response.json()

    expect(onAuthorizationExpired).not.toHaveBeenCalled()
    expect(body.error.message).toBe('密钥不可用。请检查密钥是否填写正确，或换一个密钥后重试。')
  })
})
