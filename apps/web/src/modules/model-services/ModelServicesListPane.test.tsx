import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockSetSelectedProviderId = vi.fn()
const mockToast = vi.fn()
const mockUpdateProvider = vi.fn().mockResolvedValue(undefined)
const mockSearchProviderModels = vi.fn()
let mockSelectedProviderId = 'openai'
let mockProviders: Record<string, any> = {}

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('./services/model-fetcher', () => ({
  searchProviderModels: (...args: unknown[]) => mockSearchProviderModels(...args),
}))

vi.mock('./store', () => ({
  useModelServicesStore: (selector: (state: { selectedProviderId: string, setSelectedProviderId: typeof mockSetSelectedProviderId }) => unknown) =>
    selector({
      selectedProviderId: mockSelectedProviderId,
      setSelectedProviderId: mockSetSelectedProviderId,
    }),
}))

vi.mock('./hooks/useModelServices', () => ({
  useModelServices: () => ({
    providers: Object.keys(mockProviders).length > 0 ? mockProviders : {
      openai: {
        id: 'openai',
        name: 'OpenAI',
        enabled: true,
        models: [],
      },
      anthropic: {
        id: 'anthropic',
        name: 'Anthropic',
        enabled: false,
        models: [],
      },
    },
    updateProvider: mockUpdateProvider,
  }),
}))

import { ModelServicesListPane } from './ModelServicesListPane'

describe('ModelServicesListPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectedProviderId = 'openai'
    mockProviders = {}
  })

  it('renders provider list and exposes the add-service action', () => {
    render(<ModelServicesListPane theme="dark" />)

    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('Anthropic')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加模型服务' })).toBeInTheDocument()
  })

  it('selects a provider when clicked', () => {
    render(<ModelServicesListPane theme="dark" />)

    fireEvent.click(screen.getByText('Anthropic'))

    expect(mockSetSelectedProviderId).toHaveBeenCalledWith('anthropic')
  })

  it('highlights the first provider when the selected provider id is stale', () => {
    mockSelectedProviderId = 'openai'
    mockProviders = {
      timecc: {
        id: 'timecc',
        name: 'Timecc',
        enabled: true,
        baseUrl: 'https://timicc.com/v1',
        models: [],
      },
    }

    render(<ModelServicesListPane theme="dark" />)

    expect(screen.getByRole('button', { name: /Timecc/ })).toHaveAttribute('aria-current', 'page')
  })

  it('creates a model service from the simplified dialog', async () => {
    render(<ModelServicesListPane theme="dark" />)

    fireEvent.click(screen.getByRole('button', { name: '添加模型服务' }))
    fireEvent.change(screen.getByLabelText('供应商名称'), {
      target: { value: 'Timecc' },
    })
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'sk-timecc' },
    })
    fireEvent.change(screen.getByLabelText('API 请求地址'), {
      target: { value: 'https://timicc.com' },
    })
    fireEvent.click(screen.getByText('创建服务'))

    await waitFor(() => {
      expect(mockUpdateProvider).toHaveBeenCalledWith('timecc', expect.objectContaining({
        name: 'Timecc',
        apiKey: 'sk-timecc',
        baseUrl: 'https://timicc.com/v1',
      }))
    })
    expect(mockSetSelectedProviderId).toHaveBeenCalledWith('timecc')
  })

  it('syncs models before creating the service', async () => {
    mockSearchProviderModels.mockResolvedValue({
      '在线获取': [
        { id: 'gpt-4o-mini', name: 'GPT-4o mini', capabilities: [] },
        { id: 'gpt-4o', name: 'GPT-4o', capabilities: ['vision'] },
      ],
    })

    render(<ModelServicesListPane theme="dark" />)

    fireEvent.click(screen.getByRole('button', { name: '添加模型服务' }))
    fireEvent.change(screen.getByLabelText('供应商名称'), {
      target: { value: 'Timecc' },
    })
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'sk-timecc' },
    })
    fireEvent.change(screen.getByLabelText('API 请求地址'), {
      target: { value: 'https://timicc.com' },
    })
    fireEvent.click(screen.getByText('同步模型'))

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        description: '已同步 2 个模型',
      }))
    })

    fireEvent.click(screen.getByText('创建服务'))

    await waitFor(() => {
      expect(mockUpdateProvider).toHaveBeenCalledWith('timecc', expect.objectContaining({
        models: [
          expect.objectContaining({ id: 'gpt-4o' }),
          expect.objectContaining({ id: 'gpt-4o-mini' }),
        ],
      }))
    })
  })
})
