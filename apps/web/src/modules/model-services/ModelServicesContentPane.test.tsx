import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockToast = vi.fn()
const mockUpdateProvider = vi.fn().mockResolvedValue(undefined)
const mockSearchProviderModels = vi.fn()
let mockQueryError: string | null = null

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('./app/store', () => ({
  useModelServicesStore: (selector: (state: { selectedProviderId: string }) => unknown) =>
    selector({ selectedProviderId: 'openai' }),
}))

vi.mock('./data/use-model-services', () => ({
  useModelServices: () => ({
    providers: {
      openai: {
        id: 'openai',
        name: 'OpenAI',
        enabled: true,
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        defaultBaseUrl: 'https://api.openai.com/v1',
        defaultApiKeyPlaceholder: 'sk-...',
        capabilities: ['chat_completions'],
        models: [],
      },
    },
    updateProvider: mockUpdateProvider,
    error: mockQueryError,
  }),
}))

vi.mock('./data/model-fetcher', () => ({
  searchProviderModels: (...args: unknown[]) => mockSearchProviderModels(...args),
}))

import { ModelServicesContentPane } from './ModelServicesContentPane'

describe('ModelServicesContentPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateProvider.mockResolvedValue(undefined)
    mockQueryError = null
  })

  it('verifies provider connectivity with a real probe and persists returned models', async () => {
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
      models: expect.arrayContaining([
        expect.objectContaining({ id: 'gpt-4o' }),
        expect.objectContaining({ id: 'gpt-4o-mini' }),
      ]),
    }))
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      description: '连接成功，已同步 2 个模型',
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

  it('keeps a persistence failure visible instead of reporting success', async () => {
    mockUpdateProvider.mockRejectedValueOnce(new Error('Pod write failed'))

    render(<ModelServicesContentPane />)

    const apiKey = screen.getByPlaceholderText('sk-...')
    fireEvent.change(apiKey, { target: { value: 'sk-test' } })
    fireEvent.blur(apiKey)

    expect(await screen.findByRole('alert')).toHaveTextContent('LinX 还不能在当前空间保存数据')
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'destructive',
      description: expect.stringContaining('LinX 还不能在当前空间保存数据'),
    }))
  })

  it('does not report verification success when persisting fetched models fails', async () => {
    mockSearchProviderModels.mockResolvedValue({
      '在线获取': [{ id: 'gpt-4o', name: 'GPT-4o', capabilities: ['vision'] }],
    })
    mockUpdateProvider.mockRejectedValueOnce(new Error('Pod write failed'))

    render(<ModelServicesContentPane />)

    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-test' },
    })
    fireEvent.click(screen.getByText('验证'))

    expect(await screen.findByRole('alert')).toHaveTextContent('LinX 还不能在当前空间保存数据')
    expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({
      description: '连接成功，已同步 1 个模型',
    }))
  })

  it('surfaces model-service query errors instead of rendering catalog defaults', () => {
    mockQueryError = '模型服务配置读取失败，请重试。'

    render(<ModelServicesContentPane />)

    expect(screen.getByRole('alert')).toHaveTextContent('模型服务配置读取失败，请重试。')
  })

  it('persists explicit Responses dependencies when web search is enabled', async () => {
    render(<ModelServicesContentPane />)

    fireEvent.click(screen.getByRole('switch', { name: '开启 Responses Web Search' }))

    await waitFor(() => {
      expect(mockUpdateProvider).toHaveBeenCalledWith('openai', {
        capabilities: ['chat_completions', 'responses_web_search', 'responses'],
      })
    })
  })
})
