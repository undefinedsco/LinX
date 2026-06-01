import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PodCollectionsBootstrap } from './pod-collections-bootstrap'

const useSolidDatabaseMock = vi.fn()
const initializeChatCollectionsMock = vi.fn()
const initializeContactCollectionsMock = vi.fn()
const initializeFavoriteCollectionsMock = vi.fn()
const initializeInboxCollectionsMock = vi.fn()
const subscribeInboxToPodMock = vi.fn()
const initializeModelCollectionsMock = vi.fn()
const ensureLinxWelcomeMock = vi.fn()

vi.mock('./solid-database-provider', () => ({
  useSolidDatabase: () => useSolidDatabaseMock(),
}))

vi.mock('@/modules/chat/collections', () => ({
  initializeChatCollections: (...args: unknown[]) => initializeChatCollectionsMock(...args),
  chatOps: {
    ensureLinxWelcome: (...args: unknown[]) => ensureLinxWelcomeMock(...args),
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
  inboxOps: {
    subscribeToPod: (...args: unknown[]) => subscribeInboxToPodMock(...args),
  },
}))

vi.mock('@/modules/model-services/collections', () => ({
  initializeModelCollections: (...args: unknown[]) => initializeModelCollectionsMock(...args),
}))

describe('PodCollectionsBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSolidDatabaseMock.mockReturnValue({ db: null })
    ensureLinxWelcomeMock.mockResolvedValue(null)
    subscribeInboxToPodMock.mockResolvedValue(() => undefined)
  })

  it('initializes collection database getters without preparing welcome when db is absent', async () => {
    render(<PodCollectionsBootstrap />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(initializeChatCollectionsMock).toHaveBeenCalledWith(null)
    expect(initializeContactCollectionsMock).toHaveBeenCalledWith(null)
    expect(initializeFavoriteCollectionsMock).toHaveBeenCalledWith(null)
    expect(initializeInboxCollectionsMock).toHaveBeenCalledWith(null)
    expect(initializeModelCollectionsMock).toHaveBeenCalledWith(null)
    expect(ensureLinxWelcomeMock).not.toHaveBeenCalled()
    expect(subscribeInboxToPodMock).not.toHaveBeenCalled()
  })

  it('prepares welcome and subscribes inbox collections after collections receive a ready database', async () => {
    const db = { id: 'db' }
    useSolidDatabaseMock.mockReturnValue({ db })

    render(<PodCollectionsBootstrap />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(initializeChatCollectionsMock).toHaveBeenCalledWith(db)
    expect(initializeContactCollectionsMock).toHaveBeenCalledWith(db)
    expect(initializeFavoriteCollectionsMock).toHaveBeenCalledWith(db)
    expect(initializeInboxCollectionsMock).toHaveBeenCalledWith(db)
    expect(initializeModelCollectionsMock).toHaveBeenCalledWith(db)
    expect(ensureLinxWelcomeMock).toHaveBeenCalledTimes(1)
    expect(subscribeInboxToPodMock).toHaveBeenCalledTimes(1)
  })

  it('cleans up inbox subscription when the database changes', async () => {
    const cleanup = vi.fn()
    const db = { id: 'db' }
    subscribeInboxToPodMock.mockResolvedValue(cleanup)
    useSolidDatabaseMock.mockReturnValue({ db })

    const rendered = render(<PodCollectionsBootstrap />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    rendered.unmount()

    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
