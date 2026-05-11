import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const mockSetSelectedProviderId = vi.fn()

vi.mock('./store', () => ({
  useModelServicesStore: (selector: (state: { selectedProviderId: string, setSelectedProviderId: typeof mockSetSelectedProviderId }) => unknown) =>
    selector({
      selectedProviderId: 'openai',
      setSelectedProviderId: mockSetSelectedProviderId,
    }),
}))

vi.mock('./hooks/useModelServices', () => ({
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
  }),
}))

import { ModelServicesListPane } from './ModelServicesListPane'

describe('ModelServicesListPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
