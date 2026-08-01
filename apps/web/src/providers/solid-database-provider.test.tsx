import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLoginStore } from '@linx/stores/login'
import { clearLocalAccessRoutesForTests } from '@/lib/local-access-route'
import { SolidDatabaseProvider, useSolidDatabase } from './solid-database-provider'

const onMock = vi.fn()
const offMock = vi.fn()
const createLinxSolidDatabaseMock = vi.fn()
let loginListener: (() => void) | undefined

const sessionState = {
  session: {
    info: {
      isLoggedIn: true,
      sessionId: 'session-1',
      webId: 'https://id.example.com/alice/profile/card#me',
    },
    fetch: vi.fn(),
    events: {
      on: onMock,
      off: offMock,
    },
  },
  sessionRequestInProgress: false,
}

vi.mock('./solid-session-context', () => ({
  useSession: () => sessionState,
}))

vi.mock('@inrupt/solid-client-authn-browser', () => ({
  EVENTS: {
    LOGIN: 'login',
    SESSION_RESTORED: 'sessionRestored',
    LOGOUT: 'logout',
    ERROR: 'error',
  },
}))

vi.mock('@/lib/data/linx-solid-database', () => ({
  createLinxSolidDatabase: (...args: unknown[]) => createLinxSolidDatabaseMock(...args),
}))

vi.mock('@undefineds.co/models', () => ({
  chatResource: {},
  threadResource: {},
  workspaceResource: {},
  messageResource: {},
  contactResource: {},
  agentResource: {},
  credentialResource: {},
  aiProviderResource: {},
  aiModelResource: {},
  settingsResource: {},
  approvalResource: {},
  auditResource: {},
  inboxNotificationResource: {},
  inputRequestResource: {},
  solidSchema: {},
}))

function Probe() {
  const database = useSolidDatabase() as ReturnType<typeof useSolidDatabase> & {
    retry?: () => void
    scopeKey?: string
  }
  const { status, db } = database
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="has-db">{String(Boolean(db))}</div>
      <div data-testid="scope-key">{database.scopeKey ?? ''}</div>
      <button type="button" onClick={database.retry}>Retry database</button>
    </div>
  )
}

function mockSessionProfileStorage(storageUrl: string, webId = sessionState.session.info.webId) {
  sessionState.session.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === webId) {
      return new Response(`
        @prefix solid: <http://www.w3.org/ns/solid/terms#>.
        <${webId}>
          solid:storage <${storageUrl}> .
      `, {
        status: 200,
        headers: { 'Content-Type': 'text/turtle' },
      })
    }

    return fetch(input, init)
  })
}

function mockDefaultSessionProfileStorage() {
  sessionState.session.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const webId = String(input)
    if (webId === sessionState.session.info.webId) {
      const storageUrl = deriveDefaultStorageUrl(webId)
      return new Response(`
        @prefix solid: <http://www.w3.org/ns/solid/terms#>.
        <${webId}>
          solid:storage <${storageUrl}> .
      `, {
        status: 200,
        headers: { 'Content-Type': 'text/turtle' },
      })
    }

    return fetch(input, init)
  })
}

function deriveDefaultStorageUrl(webId: string): string {
  const parsed = new URL(webId)
  const [podSlug] = parsed.pathname.split('/').filter(Boolean)
  parsed.pathname = podSlug ? `/${podSlug}/` : '/'
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

describe('SolidDatabaseProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createLinxSolidDatabaseMock.mockReset()
    loginListener = undefined
    onMock.mockImplementation((event: string, listener: () => void) => {
      if (event === 'login') {
        loginListener = listener
      }
    })
    vi.useFakeTimers()
    sessionState.session.info.isLoggedIn = true
    sessionState.session.info.sessionId = 'session-1'
    sessionState.session.info.webId = 'https://id.example.com/alice/profile/card#me'
    sessionState.session.fetch.mockReset()
    mockDefaultSessionProfileStorage()
    sessionState.sessionRequestInProgress = false
    window.sessionStorage.clear()
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: null,
      customProviders: [],
    })
  })

  afterEach(() => {
    clearLocalAccessRoutesForTests()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    delete (window as any).__SOLID_DB__
    delete (window as any).__LINX_ACCESS_ROUTE__
    delete window.xpodDesktop
    window.sessionStorage.clear()
  })

  it('waits for Pod storage initialization before exposing the database', async () => {
    const db = {}
    let resolveInit: (() => void) | undefined
    const initPromise = new Promise<void>((resolve) => {
      resolveInit = resolve
    }).then(() => db)
    createLinxSolidDatabaseMock.mockReturnValue(initPromise)

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('status').textContent).toBe('initializing')
    expect(screen.getByTestId('has-db').textContent).toBe('false')
    expect((window as any).__SOLID_DB__).toBeUndefined()

    await act(async () => {
      resolveInit?.()
      await initPromise
    })

    expect(screen.getByTestId('status').textContent).toBe('ready')
    expect(screen.getByTestId('has-db').textContent).toBe('true')
    expect((window as any).__SOLID_DB__).toBe(db)
  })

  it('initializes when a restored session already has a WebID even if redirect progress is stale', async () => {
    const db = {}
    sessionState.sessionRequestInProgress = true
    createLinxSolidDatabaseMock.mockResolvedValue(db)

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(createLinxSolidDatabaseMock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status').textContent).toBe('ready')
    expect(screen.getByTestId('has-db').textContent).toBe('true')
  })

  it('uses WebID profile storage when there is no pending login transaction', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(sessionState.session.fetch).toHaveBeenCalledWith(
      'https://id.example.com/alice/profile/card#me',
      expect.anything(),
    )
    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      initTimeoutMs: 90_000,
      podUrl: 'https://id.example.com/alice/',
    })
  })

  it('restores the remembered Local storage provider after a desktop restart', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    sessionState.session.info.webId = 'https://id.undefineds.co/alice/profile/card#me'
    mockSessionProfileStorage('https://node-0000.undefineds.co/alice/')
    useLoginStore.setState({
      state: 'authenticated',
      error: null,
      storedAccount: {
        displayName: 'Alice',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://node-0000.undefineds.co/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/alice/profile/card#me',
      },
      customProviders: [],
    })

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await flushAsyncWork()

    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      initTimeoutMs: 90_000,
      podUrl: 'https://node-0000.undefineds.co/alice/',
    })
  })

  it('fails closed when restored Local storage does not match the authenticated profile', async () => {
    createLinxSolidDatabaseMock.mockResolvedValue({})
    sessionState.session.info.webId = 'https://id.undefineds.co/alice/profile/card#me'
    mockSessionProfileStorage('https://id.undefineds.co/alice/')
    useLoginStore.setState({
      state: 'authenticated',
      error: null,
      storedAccount: {
        displayName: 'Alice',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://node-0000.undefineds.co/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/alice/profile/card#me',
      },
      customProviders: [],
    })

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await flushAsyncWork()

    expect(createLinxSolidDatabaseMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('status').textContent).toBe('error')
    expect(screen.getByTestId('has-db').textContent).toBe('false')
    expect((window as any).__SOLID_DB_ERROR__).toContain('账号和当前空间不匹配')
  })

  it('does not reuse a remembered Local SP while a Cloud login attempt is pending', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      storageProviderUrl: 'https://id.undefineds.co',
      authorizationSurface: 'window',
      returnToMicroAppId: 'chat',
    }))
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu05',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://node-0000.undefineds.co/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/ganlu05/profile/card#me',
      },
      customProviders: [],
    })

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      podUrl: null,
    })
  })

  it('passes the pending canonical Local provider URL for Cloud IDP + Local SP login', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    mockSessionProfileStorage('https://node-0000.undefineds.co/alice/')
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      initTimeoutMs: 90_000,
      podUrl: 'https://node-0000.undefineds.co/alice/',
    })
  })

  it('uses Local profile solid:storage instead of deriving the Pod URL from WebID', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    mockSessionProfileStorage('https://node-0000.undefineds.co/custom-alice/')
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await flushAsyncWork()

    expect(sessionState.session.fetch).toHaveBeenCalledWith(
      'https://id.example.com/alice/profile/card#me',
      expect.anything(),
    )
    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      initTimeoutMs: 90_000,
      podUrl: 'https://node-0000.undefineds.co/custom-alice/',
    })
  })

  it('uses the Cloud WebID profile as storage authority when authenticated profile fetch fails', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    sessionState.session.info.webId = 'https://id.undefineds.co/alice/profile/card#me'
    sessionState.session.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const publicFetchMock = vi.fn().mockResolvedValue(new Response(`
        @prefix solid: <http://www.w3.org/ns/solid/terms#>.
        <https://id.undefineds.co/alice/profile/card#me>
          solid:storage <https://node-0000.undefineds.co/alice/> .
      `, {
        status: 200,
        headers: { 'Content-Type': 'text/turtle' },
      }))
    vi.stubGlobal('fetch', publicFetchMock)
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await flushAsyncWork()

    expect(sessionState.session.fetch).toHaveBeenCalledWith(
      'https://id.undefineds.co/alice/profile/card#me',
      expect.anything(),
    )
    expect(publicFetchMock).toHaveBeenCalledWith(
      'https://id.undefineds.co/alice/profile/card#me',
      expect.anything(),
    )
    expect(sessionState.session.fetch).not.toHaveBeenCalledWith(
      'https://node-0000.undefineds.co/alice/profile/card#me',
      expect.anything(),
    )
    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      initTimeoutMs: 90_000,
      podUrl: 'https://node-0000.undefineds.co/alice/',
    })
  })

  it('fails closed when Local profile solid:storage points back to Cloud', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    mockSessionProfileStorage('https://id.undefineds.co/alice/')
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await flushAsyncWork()

    expect(createLinxSolidDatabaseMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('status').textContent).toBe('error')
    expect(screen.getByTestId('has-db').textContent).toBe('false')
    expect((window as any).__SOLID_DB_ERROR__).toContain('账号和当前空间不匹配')
  })

  it('fails closed when Cloud IDP + Local SP only has a localhost storage URL', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      storageProviderUrl: 'http://127.0.0.1:5737',
      storageProviderLabel: 'Local',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(createLinxSolidDatabaseMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('status').textContent).toBe('error')
    expect(screen.getByTestId('has-db').textContent).toBe('false')
    expect((window as any).__SOLID_DB_ERROR__).toContain('本机空间还没有完成准备')
  })

  it('fails closed when a Local login points storage back at the Cloud issuer', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      storageProviderUrl: 'https://id.undefineds.co',
      storageProviderLabel: 'Local',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(createLinxSolidDatabaseMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('status').textContent).toBe('error')
    expect(screen.getByTestId('has-db').textContent).toBe('false')
    expect((window as any).__SOLID_DB_ERROR__).toContain('本机空间还没有完成准备')
  })

  it('uses a split SP provider URL even when the provider label is missing', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    mockSessionProfileStorage('https://node-0000.undefineds.co/alice/')
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      initTimeoutMs: 90_000,
      podUrl: 'https://node-0000.undefineds.co/alice/',
    })
  })

  it('passes the remembered canonical Local provider URL after pending login state is consumed', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    mockSessionProfileStorage('https://node-0000.undefineds.co/alice/')
    useLoginStore.setState({
      state: 'authenticated',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://node-0000.undefineds.co/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/ganlu/profile/card#me',
      },
      customProviders: [],
    })

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      initTimeoutMs: 90_000,
      podUrl: 'https://node-0000.undefineds.co/alice/',
    })
  })

  it('keeps remembered Cloud IDP + Local SP sessions rooted in the selected SP', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    sessionState.session.info.webId = 'https://id.undefineds.co/ganlu05/profile/card#me'
    mockSessionProfileStorage('https://node-0000.undefineds.co/ganlu05/')
    useLoginStore.setState({
      state: 'authenticated',
      error: null,
      storedAccount: {
        displayName: 'Ganlu05',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://node-0000.undefineds.co/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/ganlu05/profile/card#me',
      },
      customProviders: [],
    })

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      initTimeoutMs: 90_000,
      podUrl: 'https://node-0000.undefineds.co/ganlu05/',
    })
  })

  it('allows a longer Pod bootstrap window for remote Local spaces', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    mockSessionProfileStorage('https://node-0000.undefineds.co/alice/')
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      initTimeoutMs: 90_000,
      podUrl: 'https://node-0000.undefineds.co/alice/',
    })
  })

  it('keeps Standalone account and DB URLs canonical while silently routing same-node fetches to the best local entry', async () => {
    const nativeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.startsWith('http://localhost:5737/api/linx/capabilities')) {
        return jsonResponse({ contract: 'linx-local-onboarding/v1', baseUrl: 'http://192.168.1.10:5737/' })
      }
      if (url.startsWith('http://192.168.1.10:5737/api/linx/capabilities')) {
        return jsonResponse({ contract: 'linx-local-onboarding/v1', baseUrl: 'http://192.168.1.10:5737/' })
      }
      if (url.startsWith('http://localhost:5737/alice/.data/bootstrap')) {
        return new Response('ok')
      }
      throw new Error(`unexpected fetch: ${url}`)
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', nativeFetch)
    sessionState.session.info.webId = 'http://192.168.1.10:5737/alice/profile/card#me'

    Object.defineProperty(window, 'xpodDesktop', {
      configurable: true,
      value: {
        localOnboarding: {
          getSnapshot: vi.fn(async () => ({
            state: 'ready',
            spaceKind: 'standalone',
            localUrl: 'http://localhost:5737/',
            baseUrl: 'http://192.168.1.10:5737/',
            publicUrl: null,
            capabilities: null,
            cloudIdentityUrl: null,
            provisionCode: null,
            provisionUrl: null,
            nodeId: 'node-1',
            message: null,
            errorCode: null,
            canRetry: true,
            canOpenSettings: true,
          })),
        },
      },
    })
    useLoginStore.setState({
      state: 'authenticated',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'http://192.168.1.10:5737/',
        issuerLabel: 'Standalone',
        storageProviderUrl: 'http://192.168.1.10:5737/',
        storageProviderLabel: 'Standalone',
        webId: 'http://192.168.1.10:5737/alice/profile/card#me',
      },
      customProviders: [],
    })
    createLinxSolidDatabaseMock.mockImplementation(async (_session, options) => {
      await fetch('http://192.168.1.10:5737/alice/.data/bootstrap')
      return {
        getDialect: () => ({
          getPodUrl: () => options.podUrl,
        }),
      }
    })

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await flushAsyncWork()

    expect(screen.getByTestId('status').textContent).toBe('ready')
    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      podUrl: 'http://192.168.1.10:5737/alice/',
      transportUrlRewrite: {
        fromBaseUrl: 'http://192.168.1.10:5737/',
        toBaseUrl: 'http://localhost:5737/',
      },
    })
    expect((window as any).__SOLID_DB_POD_URL__).toBe('http://192.168.1.10:5737/alice/')
    expect((window as any).__LINX_ACCESS_ROUTE__).toMatchObject({
      canonicalBaseUrl: 'http://192.168.1.10:5737/',
      canonicalPodUrl: 'http://192.168.1.10:5737/alice/',
      accessBaseUrl: 'http://localhost:5737/',
      accessPodUrl: 'http://localhost:5737/alice/',
      kind: 'standalone',
      rewriteEnabled: true,
      rewriteDisabledReason: null,
    })
    expect(nativeFetch).toHaveBeenCalledWith('http://localhost:5737/alice/.data/bootstrap', undefined)
  })

  it('keeps https Local spaces on canonical transport for signed fetches', async () => {
    const nativeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.startsWith('http://localhost:5737/api/linx/capabilities')) {
        return jsonResponse({ contract: 'linx-local-onboarding/v1', baseUrl: 'https://node.example/' })
      }
      if (url.startsWith('https://node.example/api/linx/capabilities')) {
        return jsonResponse({ contract: 'linx-local-onboarding/v1', baseUrl: 'https://node.example/' })
      }
      throw new Error(`unexpected fetch: ${url}`)
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', nativeFetch)
    mockSessionProfileStorage('https://node.example/alice/')

    Object.defineProperty(window, 'xpodDesktop', {
      configurable: true,
      value: {
        localOnboarding: {
          getSnapshot: vi.fn(async () => ({
            state: 'ready',
            spaceKind: 'local',
            localUrl: 'http://localhost:5737/',
            baseUrl: 'https://node.example/',
            publicUrl: 'https://node.example/',
            capabilities: null,
            cloudIdentityUrl: 'https://id.undefineds.co',
            provisionCode: 'code',
            provisionUrl: null,
            nodeId: 'node-1',
            message: null,
            errorCode: null,
            canRetry: true,
            canOpenSettings: true,
          })),
        },
      },
    })
    useLoginStore.setState({
      state: 'authenticated',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://node.example/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/alice/profile/card#me',
      },
      customProviders: [],
    })
    createLinxSolidDatabaseMock.mockImplementation(async (_session, options) => {
      return {
        getDialect: () => ({
          getPodUrl: () => options.podUrl,
        }),
      }
    })

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await flushAsyncWork()

    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      initTimeoutMs: 90_000,
      podUrl: 'https://node.example/alice/',
    })
    expect((window as any).__SOLID_DB_POD_URL__).toBe('https://node.example/alice/')
    expect((window as any).__LINX_ACCESS_ROUTE__).toMatchObject({
      canonicalBaseUrl: 'https://node.example/',
      canonicalPodUrl: 'https://node.example/alice/',
      accessBaseUrl: 'http://localhost:5737/',
      accessPodUrl: 'http://localhost:5737/alice/',
      kind: 'local',
      rewriteEnabled: false,
      rewriteDisabledReason: 'https-canonical-to-http-access',
    })
  })

  it('does not override ordinary custom localhost providers without the Local label', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'http://localhost:30250',
      storageProviderUrl: 'http://localhost:30250',
      authorizationSurface: 'window',
      returnToMicroAppId: 'chat',
    }))

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      podUrl: null,
    })
  })

  it('uses profile solid:storage as the Pod URL for a custom provider', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    sessionState.session.info.webId = 'https://solid.example.net/bob/profile/card#me'
    sessionState.session.fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'text/turtle' }),
      text: async () => `
        @prefix solid: <http://www.w3.org/ns/solid/terms#>.
        <https://solid.example.net/bob/profile/card#me>
          solid:storage <https://solid.example.net/users/bob/> .
      `,
    })
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://solid.example.net',
      storageProviderUrl: 'https://solid.example.net',
      storageProviderLabel: 'Example Solid',
      authorizationSurface: 'window',
      returnToMicroAppId: 'chat',
    }))

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await flushAsyncWork()

    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      initTimeoutMs: 90_000,
      podUrl: 'https://solid.example.net/users/bob/',
    })
  })

  it('uses authenticated session fetch when resolving a custom provider profile storage', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    sessionState.session.info.webId = 'https://solid.example.net/bob/profile/card#me'
    const anonymousFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => 'unauthorized',
    })
    vi.stubGlobal('fetch', anonymousFetch)
    sessionState.session.fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'text/turtle' }),
      text: async () => `
        @prefix solid: <http://www.w3.org/ns/solid/terms#>.
        <https://solid.example.net/bob/profile/card#me>
          solid:storage <https://solid.example.net/users/bob/> .
      `,
    })
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://solid.example.net',
      storageProviderUrl: 'https://solid.example.net',
      storageProviderLabel: 'Example Solid',
      authorizationSurface: 'window',
      returnToMicroAppId: 'chat',
    }))

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await flushAsyncWork()

    expect(sessionState.session.fetch).toHaveBeenCalledWith(
      'https://solid.example.net/bob/profile/card#me',
      expect.anything(),
    )
    expect(anonymousFetch).not.toHaveBeenCalled()
    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      initTimeoutMs: 90_000,
      podUrl: 'https://solid.example.net/users/bob/',
    })
  })

  it('uses profile solid:storage for a same-origin custom provider even when the label is missing', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    sessionState.session.info.webId = 'https://solid.example.net/bob/profile/card#me'
    sessionState.session.fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://solid.example.net/bob/profile/card#me',
        'solid:storage': { '@id': 'https://solid.example.net/users/bob/' },
      }),
    })
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://solid.example.net',
      storageProviderUrl: 'https://solid.example.net',
      authorizationSurface: 'window',
      returnToMicroAppId: 'chat',
    }))

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await flushAsyncWork()

    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      initTimeoutMs: 90_000,
      podUrl: 'https://solid.example.net/users/bob/',
    })
  })

  it('fails closed when a custom provider profile storage points outside the selected provider', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    sessionState.session.info.webId = 'https://solid.example.net/bob/profile/card#me'
    sessionState.session.fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'text/turtle' }),
      text: async () => `
        @prefix solid: <http://www.w3.org/ns/solid/terms#>.
        <https://solid.example.net/bob/profile/card#me>
          solid:storage <https://other.example.net/users/bob/> .
      `,
    })
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://solid.example.net',
      storageProviderUrl: 'https://solid.example.net',
      storageProviderLabel: 'Example Solid',
      authorizationSurface: 'window',
      returnToMicroAppId: 'chat',
    }))

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await flushAsyncWork()

    expect(createLinxSolidDatabaseMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('status').textContent).toBe('error')
    expect(screen.getByTestId('has-db').textContent).toBe('false')
    expect((window as any).__SOLID_DB_ERROR__).toContain('账号和当前空间不匹配')
  })

  it('does not reuse a previous Local SP when the current login selects Cloud only', async () => {
    const firstDb = {
      getDialect: () => ({
        getPodUrl: () => 'https://node-0000.undefineds.co/alice/',
      }),
    }
    const cloudDb = {
      getDialect: () => ({
        getPodUrl: () => 'https://id.undefineds.co/alice/',
      }),
    }
    createLinxSolidDatabaseMock
      .mockResolvedValueOnce(firstDb)
      .mockResolvedValueOnce(cloudDb)
    mockSessionProfileStorage('https://node-0000.undefineds.co/alice/')
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await flushAsyncWork()

    expect(createLinxSolidDatabaseMock).toHaveBeenLastCalledWith(sessionState.session, {
      initTimeoutMs: 90_000,
      podUrl: 'https://node-0000.undefineds.co/alice/',
    })

    window.sessionStorage.clear()
    sessionState.session.info.webId = 'https://id.undefineds.co/alice/profile/card#me'
    mockSessionProfileStorage('https://id.undefineds.co/alice/')
    useLoginStore.setState({
      state: 'authenticated',
      error: null,
      storedAccount: {
        displayName: 'Alice',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://id.undefineds.co',
        storageProviderLabel: 'Cloud',
        webId: 'https://id.undefineds.co/alice/profile/card#me',
      },
      customProviders: [],
    })
    sessionState.session.info.sessionId = 'session-cloud'

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })
    await flushAsyncWork()

    expect(createLinxSolidDatabaseMock).toHaveBeenLastCalledWith(sessionState.session, {
      initTimeoutMs: 90_000,
      podUrl: 'https://id.undefineds.co/alice/',
    })
    expect((window as any).__SOLID_DB_POD_URL__).toBe('https://id.undefineds.co/alice/')
  })

  it('does not expose the database when database creation fails', async () => {
    let rejectCreation: ((error: Error) => void) | undefined
    const creationPromise = new Promise((_resolve, reject) => {
      rejectCreation = reject
    })
    createLinxSolidDatabaseMock.mockReturnValue(creationPromise)

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('status').textContent).toBe('initializing')

    await act(async () => {
      rejectCreation?.(new Error('Pod init timed out'))
      await Promise.resolve()
    })

    expect(screen.getByTestId('status').textContent).toBe('error')
    expect(screen.getByTestId('has-db').textContent).toBe('false')
    expect((window as any).__SOLID_DB__).toBeUndefined()
  })

  it('retries database initialization after a recoverable failure', async () => {
    const db = {}
    createLinxSolidDatabaseMock
      .mockRejectedValueOnce(new Error('Pod init timed out'))
      .mockResolvedValueOnce(db)

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await flushAsyncWork()
    expect(screen.getByTestId('status').textContent).toBe('error')

    fireEvent.click(screen.getByRole('button', { name: 'Retry database' }))
    await flushAsyncWork()

    expect(createLinxSolidDatabaseMock).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('status').textContent).toBe('ready')
    expect(screen.getByTestId('has-db').textContent).toBe('true')
  })

  it('changes the exposed database scope when the active account changes', async () => {
    createLinxSolidDatabaseMock.mockResolvedValue({})
    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )
    await flushAsyncWork()
    const aliceScope = screen.getByTestId('scope-key').textContent
    expect(aliceScope).not.toBe('')

    sessionState.session.info.sessionId = 'session-2'
    sessionState.session.info.webId = 'https://id.example.com/bob/profile/card#me'
    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })
    await flushAsyncWork()

    expect(screen.getByTestId('scope-key').textContent).not.toBe(aliceScope)
  })

  it('does not drop an in-flight database initialization when a login event rerenders the same session', async () => {
    const db = {}
    let resolveInit: (() => void) | undefined
    const initPromise = new Promise<void>((resolve) => {
      resolveInit = resolve
    }).then(() => db)
    createLinxSolidDatabaseMock.mockReturnValue(initPromise)

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('status').textContent).toBe('initializing')

    await act(async () => {
      loginListener?.()
      await Promise.resolve()
    })
    expect(createLinxSolidDatabaseMock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status').textContent).toBe('initializing')

    await act(async () => {
      resolveInit?.()
      await initPromise
    })

    expect(screen.getByTestId('status').textContent).toBe('ready')
    expect(screen.getByTestId('has-db').textContent).toBe('true')
    expect((window as any).__SOLID_DB__).toBe(db)
  })

  it('initializes when mutable session info becomes logged in after mount without an auth event', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    sessionState.session.info.isLoggedIn = false
    sessionState.session.info.sessionId = ''
    sessionState.session.info.webId = ''

    render(
      <SolidDatabaseProvider>
        <Probe />
      </SolidDatabaseProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('status').textContent).toBe('idle')
    expect(createLinxSolidDatabaseMock).not.toHaveBeenCalled()

    sessionState.session.info.isLoggedIn = true
    sessionState.session.info.sessionId = 'session-late'
    sessionState.session.info.webId = 'https://id.example.com/late/profile/card#me'

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    expect(createLinxSolidDatabaseMock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status').textContent).toBe('ready')
    expect(screen.getByTestId('has-db').textContent).toBe('true')
    expect((window as any).__SOLID_DB__).toBe(db)
  })
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve()
    }
  })
}
