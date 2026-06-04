import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
}))

vi.mock('../store', () => ({
  LocalChatKitStore: class LocalChatKitStore {},
}))

vi.mock('../service', () => ({
  LocalChatKitService: class LocalChatKitService {
    process = mocks.process
  },
}))

import { createLocalChatKitFetch } from '../fetch-handler'

describe('createLocalChatKitFetch', () => {
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
})
