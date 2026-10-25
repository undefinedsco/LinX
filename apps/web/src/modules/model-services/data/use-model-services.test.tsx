import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { projectDeploymentBuiltin, useModelServices } from './use-model-services'

const BUILTIN_ROWS = {
  providers: [{
    id: 'xpod-builtin',
    name: 'Xpod',
    status: 'available',
    builtin: true,
    readOnly: true,
    offerings: [],
    credentials: [],
    selectedModels: [{ id: 'linx', provider: 'xpod-builtin', displayName: 'linx', protocols: ['chatCompletions', 'responses'] }],
  }],
  models: [
    { id: 'linx', object: 'model', owned_by: 'xpod-builtin', display_name: 'linx', protocols: ['chatCompletions', 'responses'] },
    { id: 'linx-lite', object: 'model', owned_by: 'xpod-builtin', display_name: 'linx-lite', protocols: ['chatCompletions'] },
  ],
  builtinHeader: 'xpod-builtin',
}

describe('useModelServices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.info = { webId: 'https://pod.example/profile/card#me', sessionId: 's-alice' }
    mocks.session.fetch = mocks.fetch
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
      // The catalog load observes the same fetch; it is wrapped, not replaced.
      authenticatedFetch: expect.any(Function),
    })
    expect(result.current.providers.custom).toMatchObject({
      enabled: true,
      baseUrl: 'https://gateway.example',
      models: [{ id: 'gpt-test', name: 'GPT Test', capabilities: ['chat'] }],
    })
  })
})


describe('deployment built-in projection', () => {
  it('projects the advertised read-only builtin only through the platform identity', () => {
    const provider = projectDeploymentBuiltin(BUILTIN_ROWS, {})
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
    // Never normalized into the personal provider vocabulary.
    expect(provider?.id).not.toBe('xpod-builtin')
    expect(provider?.credentialId).toBeUndefined()
  })

  it('does not show the builtin when the server omits it', () => {
    expect(projectDeploymentBuiltin({ ...BUILTIN_ROWS, builtinHeader: null }, {})).toBeNull()
    expect(projectDeploymentBuiltin({
      ...BUILTIN_ROWS,
      providers: [{ ...BUILTIN_ROWS.providers[0], readOnly: false }],
    }, {})).toBeNull()
    expect(projectDeploymentBuiltin({
      ...BUILTIN_ROWS,
      providers: [{ ...BUILTIN_ROWS.providers[0], builtin: false }],
    }, {})).toBeNull()
    expect(projectDeploymentBuiltin({ ...BUILTIN_ROWS, models: [] }, {})).toBeNull()
  })

  it('does not override existing personal providers', () => {
    const existing = { undefineds: { id: 'undefineds' } } as any
    expect(projectDeploymentBuiltin(BUILTIN_ROWS, existing)).toBeNull()
  })
})

describe('useModelServices with an advertised deployment built-in', () => {
  it('enables a fresh empty account from the raw server payloads without a second client', async () => {
    const rawRequests: string[] = []
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      rawRequests.push(new URL(url).pathname)
      if (new URL(url).pathname.endsWith('/api/ai/providers')) {
        return new Response(JSON.stringify({ data: BUILTIN_ROWS.providers }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'X-Xpod-Builtin-Providers': 'xpod-builtin' },
        })
      }
      if (new URL(url).pathname.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ object: 'list', data: BUILTIN_ROWS.models }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 })
    })
    const realClient = await vi.importActual<typeof import('@undefineds.co/ai-connections/client')>(
      '@undefineds.co/ai-connections/client',
    )
    // Real published client: it performs both GETs through the wrapped fetch
    // and drops the builtin rows with its own strict parsers.
    mocks.createClient.mockImplementation((options: { authenticatedFetch: typeof fetch }) => (
      realClient.createAiConnectionsClient(options as any)
    ))

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useModelServices(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(rawRequests.filter((path) => path.endsWith('/api/ai/providers'))).toHaveLength(1)
    expect(rawRequests.filter((path) => path.endsWith('/v1/models'))).toHaveLength(1)
    // Published parser dropped the rows, but the read-only projection restores
    // them under the platform identity so a fresh account is connected.
    expect(result.current.providers.undefineds).toMatchObject({
      id: 'undefineds',
      builtin: true,
      readOnly: true,
      enabled: true,
      models: [{ id: 'linx' }, { id: 'linx-lite' }],
    })
    expect(result.current.providers.undefineds?.credentialId).toBeUndefined()
    expect(result.current.providers['xpod-builtin']).toBeUndefined()
  })
})

describe('builtin projection in existing UI consumers', () => {
  it('offers linx/linx-lite in the model picker and reads as a connected provider', async () => {
    const { buildChatModelOptions } = await import('@/modules/chat/components/ChatHeader')
    const provider = projectDeploymentBuiltin(BUILTIN_ROWS, {})!
    const options = buildChatModelOptions(
      { [provider.id]: provider },
      'undefineds',
      'linx-lite',
    )
    expect(options.map((option) => option.id)).toEqual(['undefineds/linx', 'undefineds/linx-lite'])
    // Read-only: no credential/account action data is projected.
    expect(provider.readOnly).toBe(true)
    expect(provider.builtin).toBe(true)
    expect(provider.credentialId).toBeUndefined()
    expect(provider.apiKey).toBeUndefined()
  })
})

describe('catalog isolation across login/service switches', () => {
  function wrapperFor(queryClient: QueryClient) {
    return ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }

  it('a delayed response from the previous Alice client cannot contaminate the current catalog', async () => {
    const realClient = await vi.importActual<typeof import('@undefineds.co/ai-connections/client')>(
      '@undefineds.co/ai-connections/client',
    )
    mocks.createClient.mockImplementation((options: { authenticatedFetch: typeof fetch }) => (
      realClient.createAiConnectionsClient(options as any)
    ))
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    const pathOf = (input: RequestInfo | URL) => new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    ).pathname
    const json = (body: unknown, headers: Record<string, string> = {}) => new Response(
      JSON.stringify(body),
      { status: 200, headers: { 'content-type': 'application/json', ...headers } },
    )

    // Alice's service advertises builtin provider `xpod-builtin`; her response
    // is slow and lands while Bob's catalog is loading.
    const aliceFetch = vi.fn(async (input: RequestInfo | URL) => {
      await sleep(50)
      if (pathOf(input).endsWith('/api/ai/providers')) {
        return json({ data: BUILTIN_ROWS.providers }, { 'X-Xpod-Builtin-Providers': 'xpod-builtin' })
      }
      return json({ object: 'list', data: BUILTIN_ROWS.models })
    })
    // Bob's service is a different deployment: provider `xpod-builtin-b`.
    // His providers answer early, his models late — so Alice's late response
    // sits in the window and a shared mutable store would be contaminated
    // exactly when Bob projects.
    const bobModels = BUILTIN_ROWS.models.map((model) => ({ ...model, owned_by: 'xpod-builtin-b' }))
    const bobFetch = vi.fn(async (input: RequestInfo | URL) => {
      const path = pathOf(input)
      if (path.endsWith('/api/ai/providers')) {
        await sleep(10)
        return json({
          data: [{ ...BUILTIN_ROWS.providers[0], id: 'xpod-builtin-b' }],
        }, { 'X-Xpod-Builtin-Providers': 'xpod-builtin-b' })
      }
      await sleep(120)
      return json({ object: 'list', data: bobModels })
    })

    mocks.session.fetch = aliceFetch
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, rerender } = renderHook(() => useModelServices(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    })
    await sleep(5)

    mocks.session.info = { webId: 'https://ids.example/bob/profile/card#me', sessionId: 's-bob' }
    mocks.session.fetch = bobFetch
    rerender()

    await waitFor(() => expect(result.current.providers.undefineds).toBeDefined(), { timeout: 3_000 })
    // Bob's own deployment models are the ones offered.
    expect(result.current.providers.undefineds?.models.map((model) => model.id))
      .toEqual(['linx', 'linx-lite'])
    expect(result.current.providers.undefineds?.models.length).toBe(2)
    // Let Alice's delayed response arrive too; Bob's catalog must not change.
    await sleep(80)
    expect(aliceFetch).toHaveBeenCalled()
    expect(bobFetch).toHaveBeenCalled()
    expect(result.current.providers.undefineds?.models.map((model) => model.id))
      .toEqual(['linx', 'linx-lite'])
    expect(result.current.providers.undefineds?.models[0]?.name).toBe('linx')
    expect(result.current.providers.undefineds?.models[1]?.name).toBe('linx-lite')
  })

  it('does not offer a builtin whose server row is unavailable, unconfigured, or disabled', () => {
    for (const status of ['unavailable', 'unconfigured', 'attention'] as const) {
      expect(projectDeploymentBuiltin({
        ...BUILTIN_ROWS,
        providers: [{ ...BUILTIN_ROWS.providers[0], status }],
      }, {})).toBeNull()
    }
    expect(projectDeploymentBuiltin({
      ...BUILTIN_ROWS,
      providers: [{ ...BUILTIN_ROWS.providers[0], enabled: false }],
    }, {})).toBeNull()
  })

  it('keeps the builtin when the server advertises it available and read-only', () => {
    expect(projectDeploymentBuiltin(BUILTIN_ROWS, {})?.models.map((model) => model.id))
      .toEqual(['linx', 'linx-lite'])
  })
})
