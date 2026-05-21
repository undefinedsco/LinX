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
          mode: 'remote-ready',
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
  })

  it('projects Local onboarding state into the Local provider subtitle', async () => {
    render(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByText('这台设备上的本地空间')).toBeTruthy()
    })

    expect(detectMock).not.toHaveBeenCalled()
    expect(statusMock).not.toHaveBeenCalled()
    expect(getAllMock).not.toHaveBeenCalled()
  })

  it('creates a Local provider in LinX Service mode without desktop bridge', async () => {
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
          json: async () => ({ port: 5737 }),
        } as Response
      }

      throw new Error(`Unexpected fetch: ${String(input)}`)
    }))

    render(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByText('本地空间')).toBeTruthy()
      expect(screen.getByText('这台设备上的本地空间')).toBeTruthy()
    })
  })

  it('projects Service mode provisioning into a remote-ready Local snapshot', async () => {
    delete window.xpodDesktop
    ;(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__ = true

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/service/status') {
        return {
          ok: true,
          json: async () => ({
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
        mode: 'remote-ready',
        publicUrl: 'https://pod.example.com/',
        cloudIdentityUrl: 'https://id.undefineds.co',
        provisionCode: 'pc-123',
        nodeId: 'node-1',
      })
    })
  })

  it('preserves a configured remote-ready desktop Local mode', async () => {
    const remoteReadySnapshot = {
      state: 'ready',
      mode: 'remote-ready',
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
    const chooseModeMock = vi.fn()
    const continueMock = vi.fn().mockResolvedValue(remoteReadySnapshot)
    ;(window.xpodDesktop as any).localOnboarding = {
      getSnapshot: vi.fn().mockResolvedValue(remoteReadySnapshot),
      chooseMode: chooseModeMock,
      continue: continueMock,
      onStateChange: vi.fn(() => () => {}),
    }

    const { result } = renderHook(() => useProviders())

    let snapshot: unknown
    await act(async () => {
      snapshot = await result.current.startLocal()
    })

    expect(chooseModeMock).not.toHaveBeenCalled()
    expect(continueMock).toHaveBeenCalledTimes(1)
    expect(snapshot).toMatchObject({
      state: 'ready',
      mode: 'remote-ready',
      baseUrl: 'https://pod.example.com/',
      cloudIdentityUrl: 'https://id.undefineds.co',
    })
  })

  it('chooses device-only mode for first-run desktop Local', async () => {
    const initialSnapshot = {
      state: 'mode_required',
      mode: null,
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
      mode: 'device-only',
      message: 'Local 已准备好。',
      canRetry: true,
    }
    const chooseModeMock = vi.fn().mockResolvedValue(readySnapshot)
    const continueMock = vi.fn().mockResolvedValue(readySnapshot)
    ;(window.xpodDesktop as any).localOnboarding = {
      getSnapshot: vi.fn().mockResolvedValue(initialSnapshot),
      chooseMode: chooseModeMock,
      continue: continueMock,
      onStateChange: vi.fn(() => () => {}),
    }

    const { result } = renderHook(() => useProviders())

    let snapshot: unknown
    await act(async () => {
      snapshot = await result.current.startLocal()
    })

    expect(chooseModeMock).toHaveBeenCalledWith('device-only')
    expect(continueMock).toHaveBeenCalledTimes(1)
    expect(snapshot).toMatchObject({
      state: 'ready',
      mode: 'device-only',
    })
  })
})
