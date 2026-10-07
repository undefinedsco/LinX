import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('@undefineds.co/ai-connections', async (importOriginal) => ({
  ...await importOriginal<typeof import('@undefineds.co/ai-connections')>(),
  createAiConnectionsClient: mocks.createClient,
}))

vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({
    session: {
      info: { webId: 'https://pod.example/profile/card#me' },
      fetch: mocks.fetch,
    },
  }),
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({
    db: { getDialect: () => ({ getPodUrl: () => 'https://pod.example/' }) },
    status: 'ready',
  }),
}))

import { useModelServices } from './use-model-services'

describe('useModelServices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockReturnValue({
      webId: 'https://pod.example/profile/card#me',
      apiBase: 'https://pod.example/api/ai',
      listProviders: vi.fn(async () => [{
        id: 'custom',
        name: 'Custom',
        offerings: [],
        credentials: [{
          id: 'credential-1',
          offeringId: 'custom',
          authMode: 'apiKey',
          enabled: true,
          priority: 0,
          health: 'healthy',
          baseUrl: 'https://gateway.example',
          version: 1,
        }],
        selectedModels: [{
          id: 'gpt-test',
          provider: 'custom',
          displayName: 'GPT Test',
          capabilities: ['chat'],
        }],
        status: 'available',
      }]),
      listModels: vi.fn(async () => []),
    })
  })

  it('reads the Xpod catalog without mounting the management applet', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useModelServices(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mocks.createClient).toHaveBeenCalledWith({
      webId: 'https://pod.example/profile/card#me',
      podBaseUrl: 'https://pod.example',
      authenticatedFetch: mocks.fetch,
    })
    expect(result.current.providers.custom).toMatchObject({
      enabled: true,
      baseUrl: 'https://gateway.example',
      models: [{ id: 'gpt-test', name: 'GPT Test', capabilities: ['chat'] }],
    })
  })
})
