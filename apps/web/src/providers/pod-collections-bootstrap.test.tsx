import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PodCollectionsBootstrap } from './pod-collections-bootstrap'

const useSolidDatabaseMock = vi.fn()
const initializeChatCollectionsMock = vi.fn()
const initializeContactCollectionsMock = vi.fn()
const initializeFavoriteCollectionsMock = vi.fn()
const initializeInboxCollectionsMock = vi.fn()
const initializeModelCollectionsMock = vi.fn()
const ensureLinxWelcomeMock = vi.fn()
const invalidateQueriesMock = vi.fn()
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
  initializeChatCollections: (...args: unknown[]) => initializeChatCollectionsMock(...args),
  LINX_DEFAULT_SECRETARY: {
    chatId: '__secretary__/index.ttl#this',
    threadId: 'chat/__secretary__/index.ttl#default',
  },
  chatOps: {
    ensureLinxWelcome: (...args: unknown[]) => ensureLinxWelcomeMock(...args),
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

vi.mock('@/modules/contacts/collections', () => ({
  initializeContactCollections: (...args: unknown[]) => initializeContactCollectionsMock(...args),
}))

vi.mock('@/modules/favorites/collections', () => ({
  initializeFavoriteCollections: (...args: unknown[]) => initializeFavoriteCollectionsMock(...args),
}))

vi.mock('@/modules/inbox/collections', () => ({
  initializeInboxCollections: (...args: unknown[]) => initializeInboxCollectionsMock(...args),
}))

vi.mock('@/modules/model-services/collections', () => ({
  initializeModelCollections: (...args: unknown[]) => initializeModelCollectionsMock(...args),
}))

describe('PodCollectionsBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSolidDatabaseMock.mockReturnValue({ db: null })
    ensureLinxWelcomeMock.mockResolvedValue(null)
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
    expect(initializeContactCollectionsMock).toHaveBeenCalledWith(null)
    expect(initializeFavoriteCollectionsMock).toHaveBeenCalledWith(null)
    expect(initializeInboxCollectionsMock).toHaveBeenCalledWith(null)
    expect(initializeModelCollectionsMock).toHaveBeenCalledWith(null)
    expect(ensureLinxWelcomeMock).not.toHaveBeenCalled()
  })

  it('prepares the LinX welcome chat before rendering children after collections receive a ready database', async () => {
    const db = { id: 'db' }
    let resolveWelcome: ((value: { chatId: string; threadId: string; created: boolean }) => void) | undefined
    const welcomePromise = new Promise<{ chatId: string; threadId: string; created: boolean }>((resolve) => {
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
    expect(initializeInboxCollectionsMock).toHaveBeenCalledWith(db)
    expect(initializeModelCollectionsMock).toHaveBeenCalledWith(db)
    expect(ensureLinxWelcomeMock).toHaveBeenCalledTimes(1)
    expect(ensureLinxWelcomeMock).toHaveBeenCalledWith({ force: false })
    expect(screen.getByText('正在准备默认助手')).toBeTruthy()
    expect(screen.queryByText('ready app')).toBeNull()

    await act(async () => {
      resolveWelcome?.({ chatId: 'secretary-chat', threadId: 'secretary-thread', created: true })
      await welcomePromise
    })

    expect(selectChatMock).toHaveBeenCalledWith('secretary-chat')
    expect(selectThreadMock).toHaveBeenCalledWith('secretary-thread')
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
    ensureLinxWelcomeMock.mockResolvedValue({ chatId: 'secretary-chat', threadId: 'secretary-thread', created: false })

    render(<PodCollectionsBootstrap><div>ready app</div></PodCollectionsBootstrap>)

    await waitFor(() => {
      expect(screen.getByText('ready app')).toBeTruthy()
    })

    expect(selectChatMock).not.toHaveBeenCalled()
    expect(selectThreadMock).not.toHaveBeenCalled()
  })

  it('shows a retryable error instead of spinning forever when LinX welcome preparation fails', async () => {
    const db = { id: 'db' }
    useSolidDatabaseMock.mockReturnValue({ db })
    ensureLinxWelcomeMock
      .mockRejectedValueOnce(new Error('Pod write failed'))
      .mockResolvedValueOnce({ chatId: 'secretary-chat', threadId: 'secretary-thread', created: true })

    render(<PodCollectionsBootstrap><div>ready app</div></PodCollectionsBootstrap>)

    expect(await screen.findByText('默认助手准备失败')).toBeTruthy()
    expect(screen.getByText('LinX 还不能在当前空间保存数据。请返回空间选择页，换一个空间后重试。')).toBeTruthy()
    expect(screen.queryByText('Pod write failed')).toBeNull()
    expect(screen.queryByText('ready app')).toBeNull()

    fireEvent.click(screen.getByText('重试'))

    await waitFor(() => {
      expect(screen.getByText('ready app')).toBeTruthy()
    })

    expect(ensureLinxWelcomeMock).toHaveBeenCalledTimes(2)
    expect(ensureLinxWelcomeMock).toHaveBeenLastCalledWith({ force: true })
  })

  it('does not render children when default Secretary persistence times out', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const db = { id: 'db' }
    useSolidDatabaseMock.mockReturnValue({ db })
    ensureLinxWelcomeMock.mockReturnValue(new Promise(() => {}))

    render(<PodCollectionsBootstrap><div>ready app</div></PodCollectionsBootstrap>)

    await act(async () => {
      vi.advanceTimersByTime(45_000)
      await Promise.resolve()
    })

    expect(screen.getByText('默认助手准备失败')).toBeTruthy()
    expect(screen.queryByText('ready app')).toBeNull()
    expect(screen.queryByText('正在准备默认助手')).toBeNull()
    expect(selectChatMock).not.toHaveBeenCalled()
    expect(selectThreadMock).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
