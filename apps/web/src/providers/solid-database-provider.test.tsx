import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLoginStore } from '@linx/stores/login'
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

vi.mock('@inrupt/solid-ui-react', () => ({
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
  chatTable: {},
  threadTable: {},
  workspaceTable: {},
  messageTable: {},
  contactTable: {},
  agentTable: {},
  credentialTable: {},
  aiProviderTable: {},
  aiModelTable: {},
  settingsTable: {},
  approvalTable: {},
  auditTable: {},
  inboxNotificationTable: {},
  solidSchema: {},
}))

function Probe() {
  const { status, db } = useSolidDatabase()
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="has-db">{String(Boolean(db))}</div>
    </div>
  )
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
    vi.useRealTimers()
    delete (window as any).__SOLID_DB__
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

  it('does not pass a Pod URL for Cloud-only login', async () => {
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

    expect(createLinxSolidDatabaseMock).toHaveBeenCalledWith(sessionState.session, {
      podUrl: null,
    })
  })

  it('passes the pending Local provider URL for Cloud IDP + Local SP login', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      providerUrl: 'http://127.0.0.1:5737',
      providerLabel: 'Local',
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
      podUrl: 'http://127.0.0.1:5737/alice/',
    })
  })

  it('passes the remembered Local provider URL after pending login state is consumed', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    useLoginStore.setState({
      state: 'authenticated',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        providerUrl: 'http://localhost:5737',
        providerLabel: 'Local',
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
      podUrl: 'http://localhost:5737/alice/',
    })
  })

  it('allows a longer Pod bootstrap window for remote Local spaces', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      providerUrl: 'https://node-0000.undefineds.co/',
      providerLabel: 'Local',
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

  it('does not override ordinary custom localhost providers without the Local label', async () => {
    const db = {}
    createLinxSolidDatabaseMock.mockResolvedValue(db)
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'http://localhost:30250',
      providerUrl: 'http://localhost:30250',
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
