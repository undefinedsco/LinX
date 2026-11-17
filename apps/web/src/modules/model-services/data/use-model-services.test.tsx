import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiBuiltinProviderSummary } from '@undefineds.co/ai-connections/client'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  fetch: vi.fn(),
  session: {
    info: { webId: 'https://pod.example/profile/card#me' as string | undefined, sessionId: 's-alice' },
    fetch: null as unknown,
  },
}))

vi.mock('@undefineds.co/ai-connections/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@undefineds.co/ai-connections/client')>(),
  createAiConnectionsClient: mocks.createClient,
}))

vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({ session: mocks.session }),
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({
    db: { getDialect: () => ({ getPodUrl: () => 'https://pod.example/' }) },
    status: 'ready',
  }),
}))

import { projectBuiltinDirectory, useModelServices } from './use-model-services'

/**
 * The directory exactly as the published client parses it.
 *
 * Note what is absent: no advertisement header, no raw provider rows, no
 * `builtin`/`readOnly` flags for LinX to re-inspect, and no deployment provider
 * id for LinX to branch on. The client is the only authority that can produce
 * this shape, so these tests describe the 0.1.7 contract rather than a payload.
 */
const BUILTIN_DIRECTORY: AiBuiltinProviderSummary[] = [{
  id: 'xpod-builtin',
  name: 'Xpod',
  status: 'available',
  models: [
    { id: 'linx', displayName: 'linx' },
    { id: 'linx-lite', displayName: 'linx-lite' },
  ],
}]

function personalProvider(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  }
}

function stubClient(overrides: {
  listProviders?: () => Promise<unknown>
  listModels?: () => Promise<unknown>
  listBuiltinProviders?: (() => Promise<AiBuiltinProviderSummary[]>) | undefined
} = {}) {
  const client: Record<string, unknown> = {
    webId: 'https://pod.example/profile/card#me',
    apiBase: 'https://pod.example/api/ai',
    listProviders: vi.fn(overrides.listProviders ?? (async () => [personalProvider()])),
    listModels: vi.fn(overrides.listModels ?? (async () => [])),
  }
  // `undefined` models a client built without the optional capability at all.
  if (overrides.listBuiltinProviders !== undefined) {
    client.listBuiltinProviders = vi.fn(overrides.listBuiltinProviders)
  }
  mocks.createClient.mockReturnValue(client)
  return client
}

function renderServices() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useModelServices(), { wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session.info = { webId: 'https://pod.example/profile/card#me', sessionId: 's-alice' }
  mocks.session.fetch = mocks.fetch
})

describe('deployment builtin directory projection', () => {
  it('offers the declared models under the platform identity, read-only and credential-free', () => {
    const provider = projectBuiltinDirectory(BUILTIN_DIRECTORY, {})
    expect(provider).toMatchObject({
      id: 'undefineds',
      builtin: true,
      readOnly: true,
      enabled: true,
      models: [
        { id: 'linx', name: 'linx', enabled: true },
        { id: 'linx-lite', name: 'linx-lite', enabled: true },
      ],
    })
    // The deployment's own id never leaks into the picker identity.
    expect(provider?.id).not.toBe('xpod-builtin')
    // Read-only: nothing credential-shaped is projected.
    expect(provider?.credentialId).toBeUndefined()
    expect(provider?.apiKey).toBeUndefined()
    expect(provider?.baseUrl).toBeUndefined()
  })

  it('keeps every currently-available deployment and de-duplicates shared model ids', () => {
    const directory: AiBuiltinProviderSummary[] = [
      ...BUILTIN_DIRECTORY,
      {
        id: 'second-deployment',
        name: 'Second',
        status: 'available',
        models: [{ id: 'linx' }, { id: 'other-model' }],
      },
    ]
    const provider = projectBuiltinDirectory(directory, {})
    expect(provider?.models.map((model) => model.id)).toEqual(['linx', 'linx-lite', 'other-model'])
  })

  it('does not offer a directory the server no longer declares as available', () => {
    for (const status of ['unconfigured', 'unavailable', 'attention'] as const) {
      const provider = projectBuiltinDirectory([{ ...BUILTIN_DIRECTORY[0], status }], {})
      expect(provider).toBeNull()
    }
  })

  it('does not invent a builtin when the directory is empty', () => {
    expect(projectBuiltinDirectory([], {})).toBeNull()
    expect(projectBuiltinDirectory([{ ...BUILTIN_DIRECTORY[0], models: [] }], {})).toBeNull()
  })

  it('never overrides a personal provider that already owns the platform identity', () => {
    const existing = { undefineds: { id: 'undefineds' } } as any
    expect(projectBuiltinDirectory(BUILTIN_DIRECTORY, existing)).toBeNull()
  })
})

describe('useModelServices on the published builtin contract', () => {
  it('reads the directory through listBuiltinProviders, not from the personal provider rows', async () => {
    const client = stubClient({ listBuiltinProviders: async () => BUILTIN_DIRECTORY })

    const { result } = renderServices()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // The hook must not wrap the client's fetch: the capability is the contract.
    expect(mocks.createClient).toHaveBeenCalledWith({
      webId: 'https://pod.example/profile/card#me',
      podBaseUrl: 'https://pod.example',
      authenticatedFetch: mocks.fetch,
    })
    expect(client.listBuiltinProviders).toHaveBeenCalledTimes(1)
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(result.current.providers.undefineds).toMatchObject({
      id: 'undefineds',
      builtin: true,
      readOnly: true,
      enabled: true,
    })
    expect(result.current.providers.undefineds?.models.map((model) => model.id))
      .toEqual(['linx', 'linx-lite'])
    // The deployment id is never a personal provider entry.
    expect(result.current.providers['xpod-builtin']).toBeUndefined()
  })

  it('keeps the directory visible when the personal provider read fails', async () => {
    stubClient({
      listProviders: async () => { throw new Error('AI Connection request failed (HTTP 404)') },
      listBuiltinProviders: async () => BUILTIN_DIRECTORY,
    })

    const { result } = renderServices()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.providers.undefineds?.models.map((model) => model.id))
      .toEqual(['linx', 'linx-lite'])
    // Personal failures stay reported for personal operations.
    expect(result.current.error).toBe('AI Connection request failed (HTTP 404)')
  })

  it('keeps the directory visible when the personal model read fails', async () => {
    stubClient({
      listModels: async () => { throw new Error('AI Connection request failed (HTTP 404)') },
      listBuiltinProviders: async () => BUILTIN_DIRECTORY,
    })

    const { result } = renderServices()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.providers.undefineds).toBeDefined()
    expect(result.current.error).not.toBeNull()
  })

  it('keeps personal providers when only the directory read fails, and reports it as failed', async () => {
    stubClient({
      listBuiltinProviders: async () => { throw new Error('AI Connection request failed (HTTP 503)') },
    })

    const { result } = renderServices()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.providers.custom).toMatchObject({ enabled: true })
    expect(result.current.providers.undefineds).toBeUndefined()
    // A failed read is NOT an empty directory, and is NOT a personal failure.
    expect(result.current.builtinDirectory).toEqual({
      status: 'failed',
      message: 'AI Connection request failed (HTTP 503)',
    })
    // The personal catalog itself succeeded, so it reports no personal error.
    expect(result.current.error).toBeNull()
  })

  it('treats a client without the capability as unsupported, not as an empty directory', async () => {
    stubClient({ listBuiltinProviders: undefined })

    const { result } = renderServices()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.providers.custom).toBeDefined()
    expect(result.current.providers.undefineds).toBeUndefined()
    expect(result.current.builtinDirectory).toEqual({ status: 'unsupported' })
    expect(result.current.error).toBeNull()
  })
})

describe('deployment directory states stay distinct', () => {
  it('reports ready with an empty directory when the deployment declares none', async () => {
    stubClient({ listBuiltinProviders: async () => [] })

    const { result } = renderServices()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Distinct from both unsupported and failed: the read succeeded, there
    // simply is no deployment directory.
    expect(result.current.builtinDirectory).toEqual({ status: 'ready', providers: [] })
    expect(result.current.providers.undefineds).toBeUndefined()
    expect(result.current.error).toBeNull()
  })

  it('reports loading before the directory read settles', () => {
    let release: (value: AiBuiltinProviderSummary[]) => void = () => {}
    stubClient({
      listBuiltinProviders: () => new Promise<AiBuiltinProviderSummary[]>((resolve) => { release = resolve }),
    })

    const { result } = renderServices()
    // Nothing has settled yet: not unsupported, not failed, not empty.
    expect(result.current.builtinDirectory).toEqual({ status: 'loading' })
    release([])
  })

  it('gives unsupported, failed, ready-empty and loading four different observables', async () => {
    const observe = async (listBuiltinProviders: (() => Promise<AiBuiltinProviderSummary[]>) | undefined) => {
      stubClient({ listBuiltinProviders })
      const { result, unmount } = renderServices()
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      const state = result.current.builtinDirectory
      unmount()
      return state
    }
    const unsupported = await observe(undefined)
    const failed = await observe(async () => { throw new Error('boom') })
    const readyEmpty = await observe(async () => [])
    const readyPopulated = await observe(async () => BUILTIN_DIRECTORY)

    expect(unsupported).toEqual({ status: 'unsupported' })
    expect(failed).toMatchObject({ status: 'failed' })
    expect(readyEmpty).toEqual({ status: 'ready', providers: [] })
    expect(readyPopulated).toMatchObject({ status: 'ready' })
    // No two states are indistinguishable.
    expect(new Set([
      JSON.stringify(unsupported),
      JSON.stringify(failed),
      JSON.stringify(readyEmpty),
      JSON.stringify(readyPopulated),
    ]).size).toBe(4)
  })
})

describe('catalog isolation across login/service switches', () => {
  it('a delayed directory from the previous client cannot contaminate the current catalog', async () => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    // Alice's deployment declares `linx-alice`; her read is slow.
    const alice = stubClient({
      listBuiltinProviders: async () => {
        await sleep(60)
        return [{
          id: 'deployment-alice',
          name: 'Alice Deployment',
          status: 'available' as const,
          models: [{ id: 'linx-alice' }],
        }]
      },
    })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, rerender } = renderHook(() => useModelServices(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    })
    await sleep(5)

    // Bob is a different account AND a different deployment; his directory is fast.
    mocks.session.info = { webId: 'https://ids.example/bob/profile/card#me', sessionId: 's-bob' }
    const bob = stubClient({
      listBuiltinProviders: async () => [{
        id: 'deployment-bob',
        name: 'Bob Deployment',
        status: 'available' as const,
        models: [{ id: 'linx-bob' }, { id: 'linx-bob-lite' }],
      }],
    })
    rerender()

    await waitFor(() => expect(result.current.providers.undefineds).toBeDefined(), { timeout: 3_000 })
    expect(result.current.providers.undefineds?.models.map((model) => model.id))
      .toEqual(['linx-bob', 'linx-bob-lite'])

    // Let Alice's delayed directory land; Bob's catalog must not change.
    await sleep(90)
    expect(alice.listBuiltinProviders).toHaveBeenCalled()
    expect(bob.listBuiltinProviders).toHaveBeenCalled()
    expect(result.current.providers.undefineds?.models.map((model) => model.id))
      .toEqual(['linx-bob', 'linx-bob-lite'])
    expect(result.current.providers.undefineds?.models.map((model) => model.id))
      .not.toContain('linx-alice')
  })
})

describe('builtin directory in existing UI consumers', () => {
  it('offers the deployment models in the model picker as a connected provider', async () => {
    const { buildChatModelOptions } = await import('@/modules/chat/components/ChatHeader')
    const provider = projectBuiltinDirectory(BUILTIN_DIRECTORY, {})!
    const options = buildChatModelOptions(
      { [provider.id]: provider },
      'undefineds',
      'linx-lite',
    )
    expect(options.map((option) => option.id)).toEqual(['undefineds/linx', 'undefineds/linx-lite'])
    expect(provider.readOnly).toBe(true)
    expect(provider.builtin).toBe(true)
  })
})
