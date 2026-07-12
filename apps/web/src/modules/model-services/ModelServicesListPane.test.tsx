import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const mockSetSelectedProviderId = vi.fn()
let mockQueryError: string | null = null

vi.mock('./app/store', () => ({
  useModelServicesStore: (selector: (state: { selectedProviderId: string, setSelectedProviderId: typeof mockSetSelectedProviderId }) => unknown) =>
    selector({
      selectedProviderId: 'openai',
      setSelectedProviderId: mockSetSelectedProviderId,
    }),
}))

vi.mock('./data/use-model-services', () => ({
  useModelServices: () => ({
    providers: {
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
    error: mockQueryError,
  }),
}))

import { ModelServicesListPane } from './ModelServicesListPane'

describe('ModelServicesListPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryError = null
  })

  it('renders provider list without exposing the unfinished custom-provider button', () => {
    render(<ModelServicesListPane theme="dark" />)

    expect(screen.getByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByText('Anthropic')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument()
  })

  it('selects a provider when clicked', () => {
    render(<ModelServicesListPane theme="dark" />)

    fireEvent.click(screen.getByText('Anthropic'))

    expect(mockSetSelectedProviderId).toHaveBeenCalledWith('anthropic')
  })

  it('surfaces query failures instead of showing an empty provider projection', () => {
    mockQueryError = '模型服务配置读取失败，请重试。'

    render(<ModelServicesListPane theme="dark" />)

    expect(screen.getByRole('alert')).toHaveTextContent('模型服务配置读取失败，请重试。')
    expect(screen.queryByText('无结果')).not.toBeInTheDocument()
  })
})
