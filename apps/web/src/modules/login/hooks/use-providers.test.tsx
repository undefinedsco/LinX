import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLoginStore } from '@linx/stores/login'
import { getProviderSubtitle } from '../presentation'
import { useProviders } from './use-providers'

function TestComponent() {
  const { providers } = useProviders()

  return (
    <div>
      {providers.map((provider) => (
        <div key={provider.id}>
          <span>{provider.label}</span>
          <span>{getProviderSubtitle(provider, false)}</span>
        </div>
      ))}
    </div>
  )
}

describe('useProviders', () => {
  let detectMock: ReturnType<typeof vi.fn>
  let statusMock: ReturnType<typeof vi.fn>
  let getAllMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: null,
      customProviders: [],
    })

    detectMock = vi.fn().mockResolvedValue({ success: false })
    statusMock = vi.fn().mockResolvedValue({
      running: false,
      status: 'stopped',
    })
    getAllMock = vi.fn().mockResolvedValue({ CSS_PORT: '5737' })

    window.xpodDesktop = {
      provider: {
        list: vi.fn().mockResolvedValue([]),
        detect: detectMock,
      },
      xpod: {
        status: statusMock,
      },
      config: {
        getAll: getAllMock,
      },
      localOnboarding: {
        getSnapshot: vi.fn().mockResolvedValue({
          state: 'repair_required',
          spaceKind: 'local',
          localUrl: 'http://localhost:5737/',
          baseUrl: 'http://localhost:5737/',
          capabilities: null,
          message: '要让其他设备接入 Local，首次启动前需要先准备固定公网地址。',
          errorCode: 'LOCAL_REMOTE_READY_REQUIRES_SETUP',
          canRetry: true,
          canOpenSettings: true,
        }),
        onStateChange: vi.fn(() => () => {}),
      },
    } as any
  })

  afterEach(() => {
    delete window.xpodDesktop
    delete (window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__
    vi.unstubAllGlobals()
  })

  it('projects Local onboarding state into the Local provider subtitle', async () => {
    render(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByText('本机空间')).toBeTruthy()
      expect(screen.getByText('本机空间')).toBeTruthy()
    })

    expect(detectMock).not.toHaveBeenCalled()
    expect(statusMock).not.toHaveBeenCalled()
    expect(getAllMock).not.toHaveBeenCalled()
  })

  it('treats a custom Solid provider as one combined issuer and storage URL', async () => {
    useLoginStore.setState({
      customProviders: [{
        id: 'custom-solid',
        url: 'https://solid.example.net',
        label: 'Example Solid',
      }],
    })

    const { result } = renderHook(() => useProviders())

    await waitFor(() => {
      const provider = result.current.providers.find((item) => item.id === 'custom-solid')
      expect(provider).toBeTruthy()
      expect(provider?.source).toBe('custom')
      expect(provider?.oidcProvider).toEqual({
        kind: 'custom',
        url: 'https://solid.example.net',
        label: 'Example Solid',
      })
      expect(provider?.storageProvider).toEqual(provider?.oidcProvider)
    })
  })

  it('connects pure Web to an already-running Standalone xpod without starting a process', async () => {
    delete window.xpodDesktop
    delete (window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        contract: 'linx-local-onboarding/v1',
        baseUrl: 'http://localhost:5737/',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useProviders())

    let snapshot: unknown
    await act(async () => {
      snapshot = await result.current.startLocal('standalone')
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5737/api/linx/capabilities',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      }),
    )
    expect(snapshot).toMatchObject({
      state: 'ready',
      spaceKind: 'standalone',
      localUrl: 'http://localhost:5737/',
      baseUrl: 'http://localhost:5737/',
    })
    expect(result.current.localOnboarding).toMatchObject({
      state: 'ready',
      spaceKind: 'standalone',
    })
  })

  it('creates explicit Local and Standalone providers in LinX Service space without Cloud provisioning', async () => {
    delete window.xpodDesktop
    ;(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__ = true

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/service/status') {
        return {
          ok: true,
          json: async () => ({
            pod: {
              running: false,
              port: 5737,
              baseUrl: 'http://localhost:5737',
            },
          }),
        } as Response
      }

      if (String(input) === '/api/setup/config') {
        return {
          ok: true,
          json: async () => ({ port: 5737, spaceKind: 'local' }),
        } as Response
      }

      throw new Error(`Unexpected fetch: ${String(input)}`)
    }))

    render(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByText('Local')).toBeTruthy()
      expect(screen.getByText('Standalone')).toBeTruthy()
      expect(screen.getByText('本机空间')).toBeTruthy()
      expect(screen.getByText('本机空间')).toBeTruthy()
    })
  })

  it('projects Service space provisioning into a Local snapshot', async () => {
    delete window.xpodDesktop
    ;(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__ = true

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/service/status') {
        return {
          ok: true,
          json: async () => ({
            spaceKind: 'local',
            pod: {
              running: true,
              port: 5737,
              baseUrl: 'https://pod.example.com/',
              publicUrl: 'https://pod.example.com/',
            },
            provisioning: {
              nodeId: 'node-1',
              publicUrl: 'https://pod.example.com/',
              provisionCode: 'pc-123',
              provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
              cloudIdentityUrl: 'https://id.undefineds.co',
            },
          }),
        } as Response
      }

      if (String(input) === '/api/setup/config') {
        return {
          ok: true,
          json: async () => ({ port: 5737 }),
        } as Response
      }

      throw new Error(`Unexpected fetch: ${String(input)}`)
    }))

    const { result } = renderHook(() => useProviders())

    await waitFor(() => {
      expect(result.current.localOnboarding).toMatchObject({
        state: 'ready',
        spaceKind: 'local',
        publicUrl: 'https://pod.example.com/',
        cloudIdentityUrl: 'https://id.undefineds.co',
        provisionCode: 'pc-123',
        nodeId: 'node-1',
      })
    })

    const localProvider = result.current.providers.find((item) => item.id === 'local')
    const standaloneProvider = result.current.providers.find((item) => item.id === 'standalone')
    expect(localProvider?.storageProvider.url).toBe('https://pod.example.com')
    expect(localProvider?.oidcProvider.url).toBe('https://id.undefineds.co')
    expect(standaloneProvider?.runtime?.onboarding?.state).toBe('repair_required')
  })

  it('does not project localhost as the Local storage provider before a login storage address exists', async () => {
    delete window.xpodDesktop
    ;(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__ = true

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/service/status') {
        return {
          ok: true,
          json: async () => ({
            spaceKind: 'local',
            pod: {
              running: true,
              port: 5737,
              baseUrl: 'http://localhost:5737',
              publicUrl: null,
            },
          }),
        } as Response
      }

      if (String(input) === '/api/setup/config') {
        return {
          ok: true,
          json: async () => ({ port: 5737, spaceKind: 'local' }),
        } as Response
      }

      throw new Error(`Unexpected fetch: ${String(input)}`)
    }))

    const { result } = renderHook(() => useProviders())

    await waitFor(() => {
      const localProvider = result.current.providers.find((item) => item.id === 'local')
      const standaloneProvider = result.current.providers.find((item) => item.id === 'standalone')
      expect(localProvider?.storageProvider.url).toBe('')
      expect(localProvider?.url).toBe('')
      expect(localProvider?.runtime?.onboarding?.state).toBe('repair_required')
      expect(standaloneProvider?.storageProvider.url).toBe('http://localhost:5737')
    })
  })

  it('does not project LAN addresses as the Local storage provider before a login storage address exists', async () => {
    delete window.xpodDesktop
    ;(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__ = true

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/service/status') {
        return {
          ok: true,
          json: async () => ({
            spaceKind: 'local',
            pod: {
              running: true,
              port: 5737,
              baseUrl: 'http://192.168.1.23:5737',
              publicUrl: null,
            },
          }),
        } as Response
      }

      if (String(input) === '/api/setup/config') {
        return {
          ok: true,
          json: async () => ({ port: 5737, spaceKind: 'local' }),
        } as Response
      }

      throw new Error(`Unexpected fetch: ${String(input)}`)
    }))

    const { result } = renderHook(() => useProviders())

    await waitFor(() => {
      const localProvider = result.current.providers.find((item) => item.id === 'local')
      const standaloneProvider = result.current.providers.find((item) => item.id === 'standalone')
      expect(localProvider?.storageProvider.url).toBe('')
      expect(localProvider?.url).toBe('')
      expect(localProvider?.runtime?.onboarding?.state).toBe('repair_required')
      expect(standaloneProvider?.storageProvider.url).toBe('http://localhost:5737')
    })
  })

  it('passes the selected Service space when starting Local', async () => {
    delete window.xpodDesktop
    ;(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__ = true

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/service/status') {
        return {
          ok: true,
          json: async () => ({
            spaceKind: 'local',
            pod: {
              running: true,
              port: 5737,
              baseUrl: 'https://pod.example.com/',
              publicUrl: 'https://pod.example.com/',
            },
            provisioning: {
              nodeId: 'node-1',
              publicUrl: 'https://pod.example.com/',
              provisionCode: 'pc-123',
              provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
              cloudIdentityUrl: 'https://id.undefineds.co',
            },
          }),
        } as Response
      }

      if (String(input) === '/api/setup/config') {
        return {
          ok: true,
          json: async () => ({ port: 5737, spaceKind: 'local' }),
        } as Response
      }

      if (String(input) === '/api/service/start') {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({ spaceKind: 'local' })
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response
      }

      throw new Error(`Unexpected fetch: ${String(input)}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useProviders())

    let snapshot: unknown
    await act(async () => {
      snapshot = await result.current.startLocal('local')
    })

    expect(snapshot).toMatchObject({
      state: 'ready',
      spaceKind: 'local',
      publicUrl: 'https://pod.example.com/',
      provisionCode: 'pc-123',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/service/start', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ spaceKind: 'local' }),
    }))
  })

  it('preserves a configured desktop Local source', async () => {
    const localSnapshot = {
      state: 'ready',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737/',
      baseUrl: 'https://pod.example.com/',
      publicUrl: 'https://pod.example.com/',
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'abc',
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    }
    const chooseSpaceMock = vi.fn()
    const continueMock = vi.fn().mockResolvedValue(localSnapshot)
    ;(window.xpodDesktop as any).localOnboarding = {
      getSnapshot: vi.fn().mockResolvedValue(localSnapshot),
      chooseSpace: chooseSpaceMock,
      continue: continueMock,
      onStateChange: vi.fn(() => () => {}),
    }

    const { result } = renderHook(() => useProviders())

    let snapshot: unknown
    await act(async () => {
      snapshot = await result.current.startLocal('local')
    })

    expect(chooseSpaceMock).not.toHaveBeenCalled()
    expect(continueMock).not.toHaveBeenCalled()
    expect(snapshot).toMatchObject({
      state: 'ready',
      spaceKind: 'local',
      baseUrl: 'https://pod.example.com/',
      cloudIdentityUrl: 'https://id.undefineds.co',
    })
  })

  it('chooses Local for first-run desktop Local', async () => {
    const initialSnapshot = {
      state: 'space_required',
      spaceKind: null,
      localUrl: 'http://localhost:5737/',
      baseUrl: 'http://localhost:5737/',
      publicUrl: null,
      capabilities: null,
      cloudIdentityUrl: null,
      provisionCode: null,
      provisionUrl: null,
      nodeId: null,
      message: '首次使用时先确认 Local 的启动方式。',
      errorCode: null,
      canRetry: false,
      canOpenSettings: true,
    }
    const readySnapshot = {
      ...initialSnapshot,
      state: 'ready',
      spaceKind: 'local',
      message: 'Local 已准备好。',
      canRetry: true,
    }
    const chooseSpaceMock = vi.fn().mockResolvedValue(readySnapshot)
    const continueMock = vi.fn().mockResolvedValue(readySnapshot)
    ;(window.xpodDesktop as any).localOnboarding = {
      getSnapshot: vi.fn().mockResolvedValue(initialSnapshot),
      chooseSpace: chooseSpaceMock,
      continue: continueMock,
      onStateChange: vi.fn(() => () => {}),
    }

    const { result } = renderHook(() => useProviders())

    let snapshot: unknown
    await act(async () => {
      snapshot = await result.current.startLocal('local')
    })

    expect(chooseSpaceMock).toHaveBeenCalledWith('local')
    expect(continueMock).toHaveBeenCalledTimes(1)
    expect(snapshot).toMatchObject({
      state: 'ready',
      spaceKind: 'local',
    })
  })
})
