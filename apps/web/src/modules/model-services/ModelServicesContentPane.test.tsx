import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockToast = vi.fn()
const mockUpdateProvider = vi.fn().mockResolvedValue(undefined)
const mockDeleteProvider = vi.fn().mockResolvedValue(undefined)
const mockRecordVerificationResult = vi.fn().mockResolvedValue(undefined)
const mockSelectProvider = vi.fn()
const mockSearchProviderModels = vi.fn()
let mockProviderModels: any[] = []
let mockSelectedProviderId = 'openai'
let mockProviders: Record<string, any> = {}

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('./store', () => ({
  useModelServicesStore: (selector: (state: { selectedProviderId: string; setSelectedProviderId: typeof mockSelectProvider }) => unknown) =>
    selector({ selectedProviderId: mockSelectedProviderId, setSelectedProviderId: mockSelectProvider }),
}))

vi.mock('./hooks/useModelServices', () => ({
  useModelServices: () => ({
    providers: Object.keys(mockProviders).length > 0 ? mockProviders : {
      openai: {
        id: 'openai',
        name: 'OpenAI',
        enabled: true,
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        defaultBaseUrl: 'https://api.openai.com/v1',
        defaultApiKeyPlaceholder: 'sk-...',
        models: mockProviderModels,
        verificationStatus: 'unverified',
      },
    },
    updateProvider: mockUpdateProvider,
    deleteProvider: mockDeleteProvider,
    recordVerificationResult: mockRecordVerificationResult,
  }),
}))

vi.mock('./services/model-fetcher', () => ({
  searchProviderModels: (...args: unknown[]) => mockSearchProviderModels(...args),
}))

import { ModelServicesContentPane } from './ModelServicesContentPane'

describe('ModelServicesContentPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProviderModels = [
      {
        id: 'gpt-existing',
        name: 'GPT Existing',
        enabled: true,
        capabilities: [],
      },
    ]
    mockSelectedProviderId = 'openai'
    mockProviders = {}
  })

  it('falls back to the first provider when the selected provider id is stale', () => {
    mockSelectedProviderId = 'openai'
    mockProviders = {
      timecc: {
        id: 'timecc',
        name: 'Timecc',
        enabled: true,
        apiKey: 'sk-timecc',
        baseUrl: 'https://timicc.com/v1',
        defaultBaseUrl: 'https://timicc.com/v1',
        defaultApiKeyPlaceholder: 'sk-...',
        models: [],
      },
    }

    render(<ModelServicesContentPane />)

    expect(screen.getByText('Timecc')).toBeInTheDocument()
    expect(screen.queryByText('请从左侧选择一个提供商进行配置')).not.toBeInTheDocument()
  })

  it('deletes a provider only after confirmation and clears the selection', async () => {
    render(<ModelServicesContentPane />)

    const deleteEntry = screen.getByRole('button', { name: '删除服务 OpenAI' })
    expect(deleteEntry).toHaveTextContent('删除服务')
    fireEvent.click(deleteEntry)
    expect(screen.getByText('将删除“OpenAI”及其凭据和模型配置。已经绑定到该服务的聊天需要重新选择模型。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '删除服务' }))

    await waitFor(() => expect(mockDeleteProvider).toHaveBeenCalledWith('openai'))
    expect(mockSelectProvider).toHaveBeenCalledWith(null)
  })

  it('verifies provider connectivity with a real probe and replaces stale online models', async () => {
    mockSearchProviderModels.mockResolvedValue({
      '在线获取': [
        { id: 'gpt-4o', name: 'GPT-4o', capabilities: ['vision'] },
        { id: 'gpt-4o-mini', name: 'GPT-4o mini', capabilities: [] },
      ],
    })

    render(<ModelServicesContentPane />)

    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-test' },
    })
    fireEvent.click(screen.getByText('验证'))

    await waitFor(() => {
      expect(mockSearchProviderModels).toHaveBeenCalled()
    })
    expect(mockUpdateProvider).toHaveBeenCalledWith('openai', expect.objectContaining({
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
    }))
    expect(mockUpdateProvider).toHaveBeenCalledWith('openai', expect.objectContaining({
      models: [
        expect.objectContaining({ id: 'gpt-4o' }),
        expect.objectContaining({ id: 'gpt-4o-mini' }),
      ],
    }))
    expect(mockRecordVerificationResult).toHaveBeenCalledWith(
      'openai',
      undefined,
      { apiKey: 'sk-test' },
    )
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      description: '连接成功，已同步 2 个模型，移除 1 个过期模型',
    }))
  })

  it('preserves custom models when syncing the latest provider model list', async () => {
    mockProviderModels = [
      {
        id: 'gpt-expired',
        name: 'GPT Expired',
        enabled: true,
        capabilities: [],
      },
      {
        id: 'local-special',
        name: 'Local Special',
        enabled: true,
        capabilities: [],
        isCustom: true,
      },
    ]
    mockSearchProviderModels.mockResolvedValue({
      '在线获取': [
        { id: 'gpt-4o', name: 'GPT-4o', capabilities: ['vision'] },
      ],
    })

    render(<ModelServicesContentPane />)

    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-test' },
    })
    fireEvent.click(screen.getByText('验证'))

    await waitFor(() => {
      expect(mockUpdateProvider).toHaveBeenCalledWith('openai', expect.objectContaining({
        models: [
          expect.objectContaining({ id: 'gpt-4o', isCustom: false }),
          expect.objectContaining({ id: 'local-special', isCustom: true }),
        ],
      }))
    })
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      description: '连接成功，已同步 1 个模型，移除 1 个过期模型',
    }))
  })

  it('syncs the latest models from the toolbar and removes stale online models', async () => {
    mockProviderModels = [
      {
        id: 'gpt-expired',
        name: 'GPT Expired',
        enabled: true,
        capabilities: [],
      },
      {
        id: 'local-special',
        name: 'Local Special',
        enabled: true,
        capabilities: [],
        isCustom: true,
      },
    ]
    mockSearchProviderModels.mockResolvedValue({
      '在线获取': [
        { id: 'gpt-5.4-mini', name: 'GPT 5.4 mini', capabilities: [] },
        { id: 'gpt-5.5', name: 'GPT 5.5', capabilities: ['vision'] },
      ],
    })

    render(<ModelServicesContentPane />)

    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-test' },
    })
    fireEvent.click(screen.getByRole('button', { name: '同步模型' }))

    await waitFor(() => {
      expect(mockUpdateProvider).toHaveBeenCalledWith('openai', expect.objectContaining({
        apiKey: 'sk-test',
        models: [
          expect.objectContaining({ id: 'gpt-5.4-mini', isCustom: false }),
          expect.objectContaining({ id: 'gpt-5.5', isCustom: false }),
          expect.objectContaining({ id: 'local-special', isCustom: true }),
        ],
      }))
    })
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      description: '已同步 2 个模型，下线 1 个过期模型',
    }))
  })

  it('shows an actionable probe error without raw provider details when verification fails', async () => {
    mockSearchProviderModels.mockRejectedValue(new Error('401 Unauthorized'))

    render(<ModelServicesContentPane />)

    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-test' },
    })
    fireEvent.click(screen.getByText('验证'))

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        variant: 'destructive',
        description: '连接失败：密钥不可用。请检查密钥是否填写正确，或换一个密钥后重试。',
      }))
    })
    expect(mockRecordVerificationResult).toHaveBeenCalledWith(
      'openai',
      expect.any(Error),
      { apiKey: 'sk-test' },
    )
  })

  it('shows model-list guidance without leaking provider response text', async () => {
    mockSearchProviderModels.mockRejectedValue(new Error('OpenAI 模型列表获取失败: 500 {"error":"upstream stack"}'))

    render(<ModelServicesContentPane />)

    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-test' },
    })
    fireEvent.click(screen.getByText('验证'))

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        variant: 'destructive',
        description: '连接失败：模型列表获取失败。请检查密钥、服务地址或网络后重试。',
      }))
    })
  })

  it('adds a custom model to the selected provider', async () => {
    render(<ModelServicesContentPane />)

    fireEvent.click(screen.getByRole('button', { name: '添加模型' }))
    fireEvent.change(screen.getByLabelText('Model ID'), {
      target: { value: 'gpt-custom' },
    })
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'GPT Custom' },
    })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))

    await waitFor(() => {
      expect(mockUpdateProvider).toHaveBeenCalledWith('openai', {
        models: [
          expect.objectContaining({ id: 'gpt-existing' }),
          expect.objectContaining({
            id: 'gpt-custom',
            name: 'GPT Custom',
            enabled: true,
            isCustom: true,
          }),
        ],
      })
    })
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      description: '模型已添加',
    }))
  })

  it('deletes a model from the selected provider', async () => {
    render(<ModelServicesContentPane />)

    fireEvent.click(screen.getByRole('button', { name: '删除模型 gpt-existing' }))

    await waitFor(() => {
      expect(mockUpdateProvider).toHaveBeenCalledWith('openai', {
        models: [],
      })
    })
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      description: '模型已移除',
    }))
  })
})
