import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveProviderApiKeyThroughGateway, searchProviderModels } from './model-fetcher'

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

  it('uses a custom Base URL instead of the provider model endpoint', async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await searchProviderModels('openai', 'sk-test', 'https://proxy.example.test/v1/')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://proxy.example.test/v1/models',
      expect.any(Object),
    )
  })

  it('discovers models through the authenticated Xpod gateway when available', async () => {
    const browserFetch = vi.fn()
    vi.stubGlobal('fetch', browserFetch)
    const authenticatedFetch = vi.fn(async () => Response.json({
      provider: 'openai',
      models: [
        { id: 'gpt-5.6', displayName: 'GPT-5.6', capabilities: ['responses'] },
      ],
    }))

    await expect(searchProviderModels(
      'openai',
      undefined,
      'https://timicc.example/v1',
      undefined,
      {
        apiBaseUrl: 'https://pod.example/alice/',
        authenticatedFetch,
      },
    )).resolves.toEqual({
      '在线获取': [{
        id: 'gpt-5.6',
        name: 'GPT-5.6',
        capabilities: ['responses'],
        logo: undefined,
      }],
    })

    expect(authenticatedFetch).toHaveBeenCalledWith(
      'https://pod.example/api/ai/gateway/providers/openai/models/refresh',
      expect.objectContaining({
        method: 'POST',
        mode: 'cors',
      }),
    )
    expect(browserFetch).not.toHaveBeenCalled()
  })

  it('stores provider API keys through the authenticated Xpod credential vault', async () => {
    const authenticatedFetch = vi.fn(async () => Response.json({
      credential: { id: 'credentials.ttl#cloud-openai-test' },
    }, { status: 201 }))

    await expect(saveProviderApiKeyThroughGateway(
      'openai',
      'sk-test',
      'https://timicc.example/v1',
      { apiBaseUrl: 'https://pod.example/alice/', authenticatedFetch },
    )).resolves.toBe('credentials.ttl#cloud-openai-test')

    expect(authenticatedFetch).toHaveBeenCalledWith(
      'https://pod.example/api/ai/providers/openai/credentials/api-key',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          apiKey: 'sk-test',
          baseUrl: 'https://timicc.example/v1',
          priority: 0,
        }),
      }),
    )
  })

  it('maps an upstream key failure returned by Xpod without exposing server details', async () => {
    const authenticatedFetch = vi.fn(async () => Response.json({
      error: 'provider_models_fetch_failed',
      providerStatus: 401,
      detail: 'Authorization: Bearer secret',
    }, { status: 502 }))

    await expect(searchProviderModels(
      'openai',
      undefined,
      undefined,
      undefined,
      { apiBaseUrl: 'https://pod.example/', authenticatedFetch },
    )).rejects.toThrow('密钥不可用。请检查密钥是否填写正确，或换一个密钥后重试。')
  })
})
