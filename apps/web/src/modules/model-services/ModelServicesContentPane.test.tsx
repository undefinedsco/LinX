import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockToast = vi.fn()
const mockUpdateProvider = vi.fn().mockResolvedValue(undefined)
const mockSearchProviderModels = vi.fn()

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('./store', () => ({
  useModelServicesStore: (selector: (state: { selectedProviderId: string }) => unknown) =>
    selector({ selectedProviderId: 'openai' }),
}))

vi.mock('./hooks/useModelServices', () => ({
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
        models: [],
      },
    },
    updateProvider: mockUpdateProvider,
  }),
}))

vi.mock('./services/model-fetcher', () => ({
  searchProviderModels: (...args: unknown[]) => mockSearchProviderModels(...args),
}))

import { ModelServicesContentPane } from './ModelServicesContentPane'

describe('ModelServicesContentPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('shows the real probe error when verification fails', async () => {
    mockSearchProviderModels.mockRejectedValue(new Error('401 Unauthorized'))

    render(<ModelServicesContentPane />)

    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-test' },
    })
    fireEvent.click(screen.getByText('验证'))

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        variant: 'destructive',
        description: '连接失败: 401 Unauthorized',
      }))
    })
  })
})
