import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockUpdateProvider = vi.fn().mockResolvedValue(undefined)

vi.mock('./store', () => ({
  useModelServicesStore: (selector: (state: { selectedProviderId: string }) => unknown) =>
    selector({ selectedProviderId: 'openai22' }),
}))

vi.mock('./hooks/useModelServices', () => ({
  useModelServices: () => ({
    providers: {
      openai22: {
        id: 'openai22',
        name: 'OpenAI22',
        enabled: true,
        models: [],
      },
    },
    updateProvider: mockUpdateProvider,
  }),
}))

import { useModelServicesLayoutConfig } from './useLayoutConfig'

function LayoutTitleProbe() {
  const config = useModelServicesLayoutConfig()
  return <div>{config.mainTitle}</div>
}

describe('useModelServicesLayoutConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('binds the header title and switch to the selected model service', async () => {
    render(<LayoutTitleProbe />)

    expect(screen.getByText('OpenAI22')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() => {
      expect(mockUpdateProvider).toHaveBeenCalledWith('openai22', { enabled: false })
    })
  })
})
