import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  modelServices: {
    providers: {} as Record<string, unknown>,
    error: null as string | null,
    builtinDirectory: { status: 'ready', providers: [] } as unknown,
    isLoading: false,
    refresh: vi.fn(),
  },
}))

vi.mock('@/modules/model-services/data/use-model-services', () => ({
  useModelServices: () => mocks.modelServices,
}))

vi.mock('@linx/stores/login', () => ({
  useLoginStore: (selector: (state: { storedAccount: null }) => unknown) => selector({ storedAccount: null }),
}))

vi.mock('@/lib/use-browser-online', () => ({ useBrowserOnline: () => true }))
vi.mock('@/lib/runtime-shell', () => ({ getRuntimeShellInfo: () => ({ id: 'web' }) }))
vi.mock('@/modules/login/hooks/use-local-onboarding', () => ({
  useLocalOnboarding: () => ({ snapshot: null, loading: false }),
}))
vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ status: 'ready' }),
}))

import { useSpaceStatus } from './useSpaceStatus'

describe('useSpaceStatus AI connection truth', () => {
  beforeEach(() => {
    mocks.modelServices.providers = {}
    mocks.modelServices.error = null
    mocks.modelServices.isLoading = false
    mocks.modelServices.builtinDirectory = { status: 'ready', providers: [] }
  })

  it('says not-connected only when every read succeeded and nothing is available', () => {
    const { result } = renderHook(() => useSpaceStatus())
    expect(result.current.aiStatus).toBe('not-connected')
    expect(result.current.aiConnected).toBe(false)
  })

  it('does NOT claim not-connected when the deployment directory read failed', () => {
    mocks.modelServices.builtinDirectory = { status: 'failed', message: 'AI Connection request failed (HTTP 503)' }
    const { result } = renderHook(() => useSpaceStatus())
    // Zero providers + a failed directory is "unknown", never "no AI".
    expect(result.current.aiStatus).toBe('unknown')
    expect(result.current.aiConnected).toBeNull()
  })

  it('does NOT claim not-connected when the client declares the directory unsupported', () => {
    mocks.modelServices.builtinDirectory = { status: 'unsupported' }
    const { result } = renderHook(() => useSpaceStatus())
    expect(result.current.aiStatus).toBe('unknown')
    expect(result.current.aiConnected).toBeNull()
  })

  it('stays checking while the directory is still loading', () => {
    mocks.modelServices.builtinDirectory = { status: 'loading' }
    const { result } = renderHook(() => useSpaceStatus())
    expect(result.current.aiStatus).toBe('checking')
    expect(result.current.aiConnected).toBeNull()
  })

  it('stays connected on a positive personal connection even if the directory failed', () => {
    mocks.modelServices.builtinDirectory = { status: 'failed', message: 'boom' }
    mocks.modelServices.providers = {
      custom: { id: 'custom', name: 'Custom', enabled: true, models: [{ id: 'gpt-test' }] },
    }
    const { result } = renderHook(() => useSpaceStatus())
    expect(result.current.aiStatus).toBe('connected')
    expect(result.current.aiConnected).toBe(true)
  })

  it('reports unknown on a personal catalog error, as before', () => {
    mocks.modelServices.error = 'AI Connection request failed (HTTP 404)'
    const { result } = renderHook(() => useSpaceStatus())
    expect(result.current.aiStatus).toBe('unknown')
    expect(result.current.aiConnected).toBeNull()
  })

  it('reports connected when the deployment directory supplies the platform provider', () => {
    mocks.modelServices.providers = {
      undefineds: { id: 'undefineds', name: 'LinX', enabled: true, models: [{ id: 'linx' }] },
    }
    const { result } = renderHook(() => useSpaceStatus())
    expect(result.current.aiStatus).toBe('connected')
  })
})
