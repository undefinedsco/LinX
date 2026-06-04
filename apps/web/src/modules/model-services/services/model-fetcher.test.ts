import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchProviderModels } from './model-fetcher'

describe('searchProviderModels', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not expose provider response internals when model list fetch fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '{"error":"upstream stack","trace":"/Users/ganlu/internal.ts:1"}',
      { status: 500 },
    )))

    await expect(searchProviderModels('openai', 'sk-test'))
      .rejects.toThrow('模型服务暂时没有响应。请稍后重试。')
    await expect(searchProviderModels('openai', 'sk-test'))
      .rejects.not.toThrow(/upstream stack|\/Users|500/)

    warn.mockRestore()
  })

  it('turns key failures into direct key guidance', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '{"error":"invalid_api_key"}',
      { status: 401 },
    )))

    await expect(searchProviderModels('openai', 'sk-test'))
      .rejects.toThrow('密钥不可用。请检查密钥是否填写正确，或换一个密钥后重试。')

    warn.mockRestore()
  })
})
