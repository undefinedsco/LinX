import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  provider: {
    id: 'openai',
    name: 'OpenAI',
    enabled: true,
    apiKey: 'saved-key',
    baseUrl: 'https://saved.example/v1',
    defaultBaseUrl: 'https://api.openai.com/v1',
    capabilities: ['chat_completions'],
    models: [],
  },
  toast: vi.fn(),
  sessionFetch: vi.fn(),
  saveProviderApiKeyThroughGateway: vi.fn(),
  searchProviderModels: vi.fn(),
  updateProvider: vi.fn(),
  updateProviderCapability: vi.fn(),
}))

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}))

vi.mock('../../app/store', () => ({
  useModelServicesStore: (selector: (state: { selectedProviderId: string }) => unknown) =>
    selector({ selectedProviderId: 'openai' }),
}))

vi.mock('../../data/model-fetcher', () => ({
  saveProviderApiKeyThroughGateway: mocks.saveProviderApiKeyThroughGateway,
  searchProviderModels: mocks.searchProviderModels,
}))

vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({
    session: {
      fetch: mocks.sessionFetch,
      info: {
        isLoggedIn: true,
        webId: 'https://pod.example/alice/profile/card#me',
      },
    },
  }),
}))

vi.mock('../../data/use-model-services', () => ({
  useModelServices: () => ({
    providers: { openai: mocks.provider },
    updateProvider: mocks.updateProvider,
    updateProviderCapability: mocks.updateProviderCapability,
    error: null,
  }),
}))

import { useModelServicesContentPaneController } from './useModelServicesContentPaneController'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function setLiveConnection(apiKey: string, baseUrl: string) {
  mocks.provider = { ...mocks.provider, apiKey, baseUrl }
}

describe('useModelServicesContentPaneController connection drafts', () => {
  beforeEach(() => {
    mocks.provider = {
      ...mocks.provider,
      apiKey: 'saved-key',
      baseUrl: 'https://saved.example/v1',
    }
    mocks.toast.mockReset()
    mocks.sessionFetch.mockReset()
    mocks.saveProviderApiKeyThroughGateway.mockReset()
    mocks.searchProviderModels.mockReset()
    mocks.updateProvider.mockReset()
    mocks.updateProviderCapability.mockReset()
  })

  it('retains API key and base URL drafts when optimistic persistence rolls back', async () => {
    const persistence = createDeferred<void>()
    mocks.updateProvider.mockReturnValueOnce(persistence.promise)
    const { result, rerender } = renderHook(() => useModelServicesContentPaneController())

    act(() => {
      result.current.detailViewProps.onApiKeyChange('draft-key')
      result.current.detailViewProps.onBaseUrlChange('https://draft.example/v1')
    })

    let savePromise!: Promise<void>
    act(() => {
      savePromise = result.current.detailViewProps.onSaveConnection()
    })

    act(() => {
      setLiveConnection('draft-key', 'https://draft.example/v1')
      rerender()
    })
    act(() => {
      setLiveConnection('saved-key', 'https://saved.example/v1')
      rerender()
    })

    await act(async () => {
      persistence.reject(new Error('Pod write failed'))
      await savePromise
    })

    expect(result.current.detailViewProps.localApiKey).toBe('draft-key')
    expect(result.current.detailViewProps.localBaseUrl).toBe('https://draft.example/v1')
  })

  it('does not clear newer edits when an earlier save completes', async () => {
    const persistence = createDeferred<void>()
    mocks.updateProvider.mockReturnValueOnce(persistence.promise)
    const { result, rerender } = renderHook(() => useModelServicesContentPaneController())

    act(() => {
      result.current.detailViewProps.onApiKeyChange('submitted-key')
      result.current.detailViewProps.onBaseUrlChange('https://submitted.example/v1')
    })

    let savePromise!: Promise<void>
    act(() => {
      savePromise = result.current.detailViewProps.onSaveConnection()
    })
    act(() => {
      result.current.detailViewProps.onApiKeyChange('newer-key')
      result.current.detailViewProps.onBaseUrlChange('https://newer.example/v1')
      setLiveConnection('submitted-key', 'https://submitted.example/v1')
      rerender()
    })

    await act(async () => {
      persistence.resolve()
      await savePromise
    })

    expect(result.current.detailViewProps.localApiKey).toBe('newer-key')
    expect(result.current.detailViewProps.localBaseUrl).toBe('https://newer.example/v1')
  })
})

describe('useModelServicesContentPaneController provider verification', () => {
  beforeEach(() => {
    mocks.provider = {
      ...mocks.provider,
      apiKey: 'saved-key',
      baseUrl: 'https://saved.example/v1',
      models: [],
    }
    mocks.toast.mockReset()
    mocks.sessionFetch.mockReset()
    mocks.saveProviderApiKeyThroughGateway.mockReset()
    mocks.searchProviderModels.mockReset()
    mocks.updateProvider.mockReset()
    mocks.updateProviderCapability.mockReset()
  })

  it('seals the current credential in Xpod before discovering models', async () => {
    mocks.saveProviderApiKeyThroughGateway.mockResolvedValue('credentials.ttl#cloud-openai-test')
    mocks.updateProvider.mockResolvedValue(undefined)
    mocks.searchProviderModels.mockResolvedValue({
      '在线获取': [{ id: 'gpt-5.6', name: 'GPT-5.6', capabilities: ['responses'] }],
    })
    const { result } = renderHook(() => useModelServicesContentPaneController())

    act(() => {
      result.current.detailViewProps.onApiKeyChange('draft-key')
      result.current.detailViewProps.onBaseUrlChange('https://timicc.example/v1')
    })

    await act(async () => {
      await result.current.detailViewProps.onVerify()
    })

    expect(mocks.saveProviderApiKeyThroughGateway).toHaveBeenCalledWith(
      'openai',
      'draft-key',
      'https://timicc.example/v1',
      {
        apiBaseUrl: 'https://pod.example',
        authenticatedFetch: mocks.sessionFetch,
      },
    )
    expect(mocks.searchProviderModels).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'openai' }),
      undefined,
      'https://timicc.example/v1',
      undefined,
      {
        apiBaseUrl: 'https://pod.example',
        authenticatedFetch: mocks.sessionFetch,
      },
    )
    expect(mocks.updateProvider).toHaveBeenCalledWith('openai', {
      apiKey: '',
      baseUrl: 'https://timicc.example/v1',
      models: [{ id: 'gpt-5.6', name: 'GPT-5.6', capabilities: ['responses'], enabled: true }],
    })
    expect(mocks.saveProviderApiKeyThroughGateway.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.searchProviderModels.mock.invocationCallOrder[0])
  })
})

describe('useModelServicesContentPaneController capability drafts', () => {
  beforeEach(() => {
    mocks.provider = {
      ...mocks.provider,
      capabilities: ['chat_completions', 'image_input'],
    }
    mocks.toast.mockReset()
    mocks.updateProvider.mockReset()
    mocks.updateProviderCapability.mockReset()
  })

  it('delegates capability changes as semantic mutations', async () => {
    mocks.updateProviderCapability.mockResolvedValue(undefined)
    const { result } = renderHook(() => useModelServicesContentPaneController())

    await act(async () => {
      await Promise.all([
        result.current.detailViewProps.onCapabilityChange('responses', true),
        result.current.detailViewProps.onCapabilityChange('chat_completions', false),
      ])
    })

    expect(mocks.updateProviderCapability).toHaveBeenNthCalledWith(
      1,
      'openai',
      'responses',
      true,
      ['chat_completions', 'image_input'],
    )
    expect(mocks.updateProviderCapability).toHaveBeenNthCalledWith(
      2,
      'openai',
      'chat_completions',
      false,
      ['chat_completions', 'image_input'],
    )
  })
})
