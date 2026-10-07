import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadServiceSetup } from './setup-client'

const fetchMock = vi.fn()

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response
}

describe('loadServiceSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('surfaces a failed service status response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: '读取服务状态失败。' }, 503))
    fetchMock.mockResolvedValueOnce(jsonResponse({ dataDir: '/tmp/linx-pod' }))

    await expect(loadServiceSetup()).rejects.toThrow('读取服务状态失败。')
  })

  it('surfaces a failed setup config response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ pod: { running: false } }))
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: '读取服务配置失败。' }, 400))

    await expect(loadServiceSetup()).rejects.toThrow('读取服务配置失败。')
  })
})
