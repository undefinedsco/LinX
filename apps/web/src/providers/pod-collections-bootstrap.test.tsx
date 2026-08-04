import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PodCollectionsBootstrap } from './pod-collections-bootstrap'

const useSolidDatabaseMock = vi.fn()
const initializeChatCollectionsMock = vi.fn()
const configureChatContactsPortMock = vi.fn()
const configureContactsChatPortMock = vi.fn()
const initializeContactCollectionsMock = vi.fn()
const initializeFavoriteCollectionsMock = vi.fn()
const subscribeFavoritesToPodMock = vi.fn()
const initializeFilesCollectionsMock = vi.fn()
const subscribeFilesToPodMock = vi.fn()
const initializeInboxCollectionsMock = vi.fn()
const subscribeInboxToPodMock = vi.fn()
const initializeModelCollectionsMock = vi.fn()
const initializeSymphonyControlCollectionsMock = vi.fn()
const subscribeSymphonyControlToPodMock = vi.fn()
const ensureLinxWelcomeMock = vi.fn()
const stageLinxDefaultSecretaryMock = vi.fn()
const subscribeToPodMock = vi.fn()
const invalidateQueriesMock = vi.fn()
const toastMock = vi.fn()
const selectChatMock = vi.fn()
const selectThreadMock = vi.fn()
let chatStoreState = {
  selectedChatId: null as string | null,
  selectedThreadId: null as string | null,
}

vi.mock('./solid-database-provider', () => ({
  useSolidDatabase: () => useSolidDatabaseMock(),
}))

vi.mock('@/modules/chat/collections', () => ({
  chatCollection: { id: 'chats' },
  threadCollection: { id: 'threads' },
  configureChatContactsPort: (...args: unknown[]) => configureChatContactsPortMock(...args),
  initializeChatCollections: (...args: unknown[]) => initializeChatCollectionsMock(...args),
  LINX_DEFAULT_SECRETARY: {
    chatId: '__secretary__/index.ttl#this',
  },
  chatOps: {
    ensureLinxWelcome: (...args: unknown[]) => ensureLinxWelcomeMock(...args),
    stageLinxDefaultSecretary: (...args: unknown[]) => stageLinxDefaultSecretaryMock(...args),
    subscribeToPod: (...args: unknown[]) => subscribeToPodMock(...args),
  },
}))

vi.mock('./query-provider', () => ({
  queryClient: {
    invalidateQueries: (...args: unknown[]) => invalidateQueriesMock(...args),
  },
}))

vi.mock('@/modules/chat/store', () => ({
  useChatStore: {
    getState: () => ({
      ...chatStoreState,
      selectChat: selectChatMock,
      selectThread: selectThreadMock,
    }),
  },
}))

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

vi.mock('@/modules/contacts/data/collections', () => ({
  agentCollection: { id: 'agents' },
  contactCollection: { id: 'contacts' },
  configureContactsChatPort: (...args: unknown[]) => configureContactsChatPortMock(...args),
  initializeContactCollections: (...args: unknown[]) => initializeContactCollectionsMock(...args),
}))

vi.mock('@/modules/chat/matrix-service', () => ({
  createMatrixGroupRoom: vi.fn(),
  loadMatrixChatRow: vi.fn(),
  loadMatrixThreadRow: vi.fn(),
}))

vi.mock('@/modules/favorites/collections', () => ({
  initializeFavoriteCollections: (...args: unknown[]) => initializeFavoriteCollectionsMock(...args),
  favoriteOps: {
    subscribeToPod: (...args: unknown[]) => subscribeFavoritesToPodMock(...args),
  },
}))

vi.mock('@/modules/files/collections', () => ({
  initializeFilesCollections: (...args: unknown[]) => initializeFilesCollectionsMock(...args),
  filesOps: {
    subscribeToPod: (...args: unknown[]) => subscribeFilesToPodMock(...args),
  },
}))

vi.mock('@/modules/inbox/collections', () => ({
  initializeInboxCollections: (...args: unknown[]) => initializeInboxCollectionsMock(...args),
  inboxOps: {
    subscribeToPod: (...args: unknown[]) => subscribeInboxToPodMock(...args),
  },
}))

vi.mock('@/modules/model-services/data/collections', () => ({
  initializeModelCollections: (...args: unknown[]) => initializeModelCollectionsMock(...args),
}))

vi.mock('@/modules/symphony/collections', () => ({
  initializeSymphonyControlCollections: (...args: unknown[]) => initializeSymphonyControlCollectionsMock(...args),
  symphonyControlOps: {
    subscribeToPod: (...args: unknown[]) => subscribeSymphonyControlToPodMock(...args),
  },
}))

describe('PodCollectionsBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSolidDatabaseMock.mockReturnValue({ db: null })
    ensureLinxWelcomeMock.mockResolvedValue(null)
    subscribeToPodMock.mockResolvedValue(() => undefined)
    subscribeFavoritesToPodMock.mockResolvedValue(() => undefined)
    subscribeFilesToPodMock.mockResolvedValue(() => undefined)
    subscribeInboxToPodMock.mockResolvedValue(() => undefined)
    subscribeSymphonyControlToPodMock.mockResolvedValue(() => undefined)
    invalidateQueriesMock.mockResolvedValue(undefined)
    chatStoreState = {
      selectedChatId: null,
      selectedThreadId: null,
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes collection database getters without preparing welcome when db is absent', async () => {
    render(<PodCollectionsBootstrap />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(initializeChatCollectionsMock).toHaveBeenCalledWith(null)
    expect(configureChatContactsPortMock).toHaveBeenCalledWith(expect.objectContaining({
      agentCollection: { id: 'agents' },
      contactCollection: { id: 'contacts' },
    }))
    expect(configureContactsChatPortMock).toHaveBeenCalledWith(expect.objectContaining({
      chatCollection: { id: 'chats' },
      threadCollection: { id: 'threads' },
    }))
    expect(initializeContactCollectionsMock).toHaveBeenCalledWith(null)
    expect(initializeFavoriteCollectionsMock).toHaveBeenCalledWith(null)
    expect(initializeFilesCollectionsMock).toHaveBeenCalledWith(null)
    expect(initializeInboxCollectionsMock).toHaveBeenCalledWith(null)
    expect(initializeModelCollectionsMock).toHaveBeenCalledWith(null)
    expect(initializeSymphonyControlCollectionsMock).toHaveBeenCalledWith(null)
    expect(ensureLinxWelcomeMock).not.toHaveBeenCalled()
    expect(subscribeToPodMock).not.toHaveBeenCalled()
    expect(subscribeFavoritesToPodMock).not.toHaveBeenCalled()
    expect(subscribeFilesToPodMock).not.toHaveBeenCalled()
    expect(subscribeInboxToPodMock).not.toHaveBeenCalled()
    expect(subscribeSymphonyControlToPodMock).not.toHaveBeenCalled()
  })

  it('binds contact and model collections before rendering consumers', () => {
    const db = { id: 'db' }
    const observeBindings = vi.fn()
    useSolidDatabaseMock.mockReturnValue({ db })

    function CollectionConsumer() {
      observeBindings({
        contactsBound: initializeContactCollectionsMock.mock.calls.some(([value]) => value === db),
        modelsBound: initializeModelCollectionsMock.mock.calls.some(([value]) => value === db),
      })
      return <div>collection consumer</div>
    }

    render(
      <PodCollectionsBootstrap>
        <CollectionConsumer />
      </PodCollectionsBootstrap>,
    )

    expect(observeBindings).toHaveBeenCalledWith({
      contactsBound: true,
      modelsBound: true,
    })
  })

  it('stages the LinX welcome chat and renders children while Pod persistence continues in the background', async () => {
    const db = { id: 'db' }
    let resolveWelcome: ((value: { chatId: string; created: boolean }) => void) | undefined
    const welcomePromise = new Promise<{ chatId: string; created: boolean }>((resolve) => {
      resolveWelcome = resolve
    })
    useSolidDatabaseMock.mockReturnValue({ db })
    ensureLinxWelcomeMock.mockReturnValue(welcomePromise)

    render(<PodCollectionsBootstrap><div>ready app</div></PodCollectionsBootstrap>)

    await act(async () => {
      await Promise.resolve()
    })

    expect(initializeChatCollectionsMock).toHaveBeenCalledWith(db)
    expect(initializeContactCollectionsMock).toHaveBeenCalledWith(db)
    expect(initializeFavoriteCollectionsMock).toHaveBeenCalledWith(db)
    expect(initializeFilesCollectionsMock).toHaveBeenCalledWith(db)
    expect(initializeInboxCollectionsMock).toHaveBeenCalledWith(db)
    expect(initializeModelCollectionsMock).toHaveBeenCalledWith(db)
    expect(initializeSymphonyControlCollectionsMock).toHaveBeenCalledWith(db)
    expect(subscribeToPodMock).not.toHaveBeenCalled()
    expect(subscribeFavoritesToPodMock).not.toHaveBeenCalled()
    expect(subscribeFilesToPodMock).not.toHaveBeenCalled()
    expect(subscribeInboxToPodMock).not.toHaveBeenCalled()
    expect(subscribeSymphonyControlToPodMock).not.toHaveBeenCalled()
    expect(ensureLinxWelcomeMock).toHaveBeenCalledTimes(1)
    expect(ensureLinxWelcomeMock).toHaveBeenCalledWith({ force: false })
    expect(stageLinxDefaultSecretaryMock).toHaveBeenCalledTimes(1)
    expect(stageLinxDefaultSecretaryMock).toHaveBeenCalledWith(db)
    expect(selectChatMock).toHaveBeenCalledWith('__secretary__/index.ttl#this')
    expect(selectThreadMock).not.toHaveBeenCalled()
    expect(screen.queryByText('正在准备默认助手')).toBeNull()
    expect(screen.getByText('ready app')).toBeTruthy()
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['chats'] })

    await act(async () => {
      resolveWelcome?.({ chatId: 'secretary-chat', created: true })
      await welcomePromise
    })

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['chats'] })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['chats', 'secretary-chat', 'threads'] })
    expect(screen.getByText('ready app')).toBeTruthy()
  })

  it('does not steal selection when another chat is already selected', async () => {
    const db = { id: 'db' }
    chatStoreState = {
      selectedChatId: 'user-chat',
      selectedThreadId: 'user-thread',
    }
    useSolidDatabaseMock.mockReturnValue({ db })
    ensureLinxWelcomeMock.mockResolvedValue({ chatId: 'secretary-chat', created: false })

    render(<PodCollectionsBootstrap><div>ready app</div></PodCollectionsBootstrap>)

    await waitFor(() => {
      expect(screen.getByText('ready app')).toBeTruthy()
    })

    expect(selectChatMock).not.toHaveBeenCalled()
    expect(selectThreadMock).not.toHaveBeenCalled()
  })

  it('keeps the app visible when background LinX welcome persistence fails', async () => {
    const db = { id: 'db' }
    useSolidDatabaseMock.mockReturnValue({ db })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    ensureLinxWelcomeMock.mockRejectedValueOnce(new Error('Pod write failed'))

    render(<PodCollectionsBootstrap><div>ready app</div></PodCollectionsBootstrap>)

    await waitFor(() => {
      expect(screen.getByText('ready app')).toBeTruthy()
    })
    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalled()
    })
    expect(screen.queryByText('默认助手准备失败')).toBeNull()
    expect(screen.queryByText('Pod write failed')).toBeNull()
    expect(ensureLinxWelcomeMock).toHaveBeenCalledTimes(1)
    expect(toastMock).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('does not block children while default Secretary persistence is still pending', async () => {
    const db = { id: 'db' }
    useSolidDatabaseMock.mockReturnValue({ db })
    ensureLinxWelcomeMock.mockReturnValue(new Promise(() => {}))

    render(<PodCollectionsBootstrap><div>ready app</div></PodCollectionsBootstrap>)

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText('ready app')).toBeTruthy()
    expect(screen.queryByText('默认助手准备失败')).toBeNull()
    expect(screen.queryByText('正在准备默认助手')).toBeNull()
    expect(selectChatMock).toHaveBeenCalledWith('__secretary__/index.ttl#this')
    expect(selectThreadMock).not.toHaveBeenCalled()
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('ignores a previous account bootstrap result after the database changes', async () => {
    const firstDb = { id: 'first-db' }
    const secondDb = { id: 'second-db' }
    let currentDb = firstDb
    let resolveFirst: ((value: { chatId: string; created: boolean }) => void) | undefined
    let resolveSecond: ((value: { chatId: string; created: boolean }) => void) | undefined
    const firstWelcome = new Promise<{ chatId: string; created: boolean }>((resolve) => {
      resolveFirst = resolve
    })
    const secondWelcome = new Promise<{ chatId: string; created: boolean }>((resolve) => {
      resolveSecond = resolve
    })
    useSolidDatabaseMock.mockImplementation(() => ({ db: currentDb }))
    ensureLinxWelcomeMock
      .mockReturnValueOnce(firstWelcome)
      .mockReturnValueOnce(secondWelcome)

    const { rerender } = render(<PodCollectionsBootstrap><div>ready app</div></PodCollectionsBootstrap>)
    await act(async () => {
      await Promise.resolve()
    })

    currentDb = secondDb
    rerender(<PodCollectionsBootstrap><div>ready app</div></PodCollectionsBootstrap>)
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      resolveFirst?.({ chatId: 'first-account-chat', created: true })
      await firstWelcome
    })

    expect(invalidateQueriesMock).not.toHaveBeenCalledWith({
      queryKey: ['chats', 'first-account-chat', 'threads'],
    })

    await act(async () => {
      resolveSecond?.({ chatId: 'second-account-chat', created: true })
      await secondWelcome
    })

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['chats', 'second-account-chat', 'threads'],
    })
  })

  it('preserves auth and token storage when Secretary bootstrap times out', async () => {
    const db = { id: 'db' }
    const localAuthKey = 'linx-test-auth-token'
    const sessionAuthKey = 'linx-test-session-token'
    window.localStorage.setItem(localAuthKey, 'local-token')
    window.sessionStorage.setItem(sessionAuthKey, 'session-token')
    const timeoutError = Object.assign(new Error('AI Secretary bootstrap timed out.'), {
      kind: 'timeout',
      name: 'SecretaryBootstrapTimeoutError',
      recoverable: true,
    })
    useSolidDatabaseMock.mockReturnValue({ db })
    ensureLinxWelcomeMock.mockRejectedValueOnce(timeoutError)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    render(<PodCollectionsBootstrap><div>ready app</div></PodCollectionsBootstrap>)

    await waitFor(() => expect(warnSpy).toHaveBeenCalled())
    expect(toastMock).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(localAuthKey)).toBe('local-token')
    expect(window.sessionStorage.getItem(sessionAuthKey)).toBe('session-token')

    window.localStorage.removeItem(localAuthKey)
    window.sessionStorage.removeItem(sessionAuthKey)
    warnSpy.mockRestore()
  })
})
