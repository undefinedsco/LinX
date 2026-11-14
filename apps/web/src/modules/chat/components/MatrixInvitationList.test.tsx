import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  usePodInterfaceAccess: vi.fn(),
  useSolidDatabase: vi.fn(),
  loadMatrixInvitations: vi.fn(),
  acceptMatrixInvitation: vi.fn(),
  isInvitationBindingUsable: vi.fn(),
  rememberSharedRoom: vi.fn(async () => ({ id: 'shared-room:x' })),
  sharedRoomReferenceFromInvitation: vi.fn(),
  selectChat: vi.fn(),
}))

vi.mock('@/lib/matrix/usePodInterfaceAccess', () => ({
  usePodInterfaceAccess: mocks.usePodInterfaceAccess,
}))
vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: mocks.useSolidDatabase,
}))
vi.mock('../data/matrix-invitations', () => ({
  loadMatrixInvitations: mocks.loadMatrixInvitations,
  acceptMatrixInvitation: mocks.acceptMatrixInvitation,
  isInvitationBindingUsable: mocks.isInvitationBindingUsable,
}))
vi.mock('../data/shared-room-index', () => ({
  rememberSharedRoom: mocks.rememberSharedRoom,
}))
vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: () => ({ data: [] }),
}))
vi.mock('../collections', () => ({ chatCollection: {} }))
vi.mock('../data/shared-room-reference', () => ({
  sharedRoomReferenceFromInvitation: mocks.sharedRoomReferenceFromInvitation,
}))
vi.mock('../store', () => ({
  useChatStore: (selector: (state: { selectChat: typeof mocks.selectChat }) => unknown) => (
    selector({ selectChat: mocks.selectChat })
  ),
}))

import { MatrixInterfaceAuthorizeUnavailableError } from '@/lib/matrix/pod-interface-access'
import { MatrixInvitationList } from './MatrixInvitationList'

const INVITE = {
  roomId: '!room:api.cloud.example',
  name: 'Alice Room',
  inviterWebId: 'https://alice.example/#me',
  storageBinding: 'https://pods.example/alice/',
  roomContainer: 'https://pods.example/alice/.data/chat/r/',
  chatIri: 'https://pods.example/alice/.data/chat/r/index.ttl#this',
  threadIri: 'https://pods.example/alice/.data/chat/r/index.ttl#thread',
  bindingSource: 'backend_event' as const,
  backendVerified: true,
}

const ACCESS = {
  get: () => ({ apiKey: 'sk-bob', webId: 'https://bob.example/#id', accountOrigin: 'https://id.cloud.example', origin: 'https://api.cloud.example', podUrl: 'https://pods.cloud.example/bob/' }),
  authorize: vi.fn(),
  importAuthorization: vi.fn(),
  accountOrigin: () => 'https://id.cloud.example',
  release: vi.fn(),
}

const COLD_ACCESS = {
  ...ACCESS,
  get: () => null,
  authorize: vi.fn(),
  importAuthorization: vi.fn(),
}

describe('MatrixInvitationList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.usePodInterfaceAccess.mockReturnValue(ACCESS)
    mocks.useSolidDatabase.mockReturnValue({ db: {} })
    mocks.isInvitationBindingUsable.mockReturnValue(true)
    mocks.loadMatrixInvitations.mockResolvedValue([])
    mocks.acceptMatrixInvitation.mockResolvedValue({ roomId: INVITE.roomId, storageBinding: INVITE.storageBinding })
    mocks.sharedRoomReferenceFromInvitation.mockReturnValue({
      roomId: INVITE.roomId,
      roomContainer: INVITE.roomContainer,
      chatIri: INVITE.chatIri,
      threadIri: INVITE.threadIri,
      storageBinding: INVITE.storageBinding,
      name: INVITE.name,
    })
    mocks.rememberSharedRoom.mockResolvedValue({ id: 'shared-room:x' })
  })

  it('discovers invitations without joining', async () => {
    mocks.loadMatrixInvitations.mockResolvedValue([INVITE])
    render(<MatrixInvitationList />)

    expect(await screen.findByText('Alice Room')).toBeInTheDocument()
    expect(screen.getByText('群主邀请你加入这个群聊')).toBeInTheDocument()
    expect(mocks.acceptMatrixInvitation).not.toHaveBeenCalled()
  })

  it('joins only on explicit accept and shows a plain joined state', async () => {
    mocks.loadMatrixInvitations.mockResolvedValue([INVITE])
    render(<MatrixInvitationList />)

    fireEvent.click(await screen.findByRole('button', { name: '接受' }))

    await waitFor(() => expect(mocks.acceptMatrixInvitation).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mocks.rememberSharedRoom).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('已加入群聊')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    expect(mocks.selectChat).toHaveBeenCalledWith('shared-room:x')
    expect(screen.queryByText('Alice Room')).not.toBeInTheDocument()
    // No implementation details in the product flow.
    expect(screen.queryByText(/pods\.cloud\.example|不会复制/)).not.toBeInTheDocument()
  })

  it('offers explicit authorization on cold start without auto-granting', async () => {
    mocks.usePodInterfaceAccess.mockReturnValue(COLD_ACCESS)
    render(<MatrixInvitationList />)

    const button = await screen.findByRole('button', { name: '授权群聊' })
    expect(COLD_ACCESS.authorize).not.toHaveBeenCalled()
    expect(mocks.loadMatrixInvitations).not.toHaveBeenCalled()
    expect(mocks.acceptMatrixInvitation).not.toHaveBeenCalled()

    COLD_ACCESS.authorize.mockResolvedValue(undefined)
    fireEvent.click(button)
    await waitFor(() => expect(COLD_ACCESS.authorize).toHaveBeenCalledTimes(1))
  })

  it('falls back to the native grant panel when programmatic authorization is unavailable', async () => {
    mocks.usePodInterfaceAccess.mockReturnValue(COLD_ACCESS)
    COLD_ACCESS.authorize.mockRejectedValue(new MatrixInterfaceAuthorizeUnavailableError('https://id.cloud.example'))
    render(<MatrixInvitationList />)

    fireEvent.click(await screen.findByRole('button', { name: '授权群聊' }))
    expect(await screen.findByText('群聊需要一次空间授权')).toBeInTheDocument()
  })

  it('disables accept and explains an unverified binding', async () => {
    mocks.isInvitationBindingUsable.mockReturnValue(false)
    mocks.loadMatrixInvitations.mockResolvedValue([{ ...INVITE, backendVerified: false }])
    render(<MatrixInvitationList />)

    expect(await screen.findByText('这个邀请暂时不能加入')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '接受' })).toBeDisabled()
    expect(mocks.acceptMatrixInvitation).not.toHaveBeenCalled()
  })

  it('shows accept errors and retries discovery', async () => {
    mocks.loadMatrixInvitations
      .mockResolvedValueOnce([INVITE])
      .mockRejectedValueOnce(new Error('群聊服务拒绝了这次邀请'))
    mocks.acceptMatrixInvitation.mockRejectedValueOnce(new Error('邀请已失效'))
    render(<MatrixInvitationList />)

    fireEvent.click(await screen.findByRole('button', { name: '接受' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('邀请已失效')

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(mocks.loadMatrixInvitations).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('alert')).toHaveTextContent('群聊服务拒绝了这次邀请')
  })

  it('renders nothing without an authorized access or database', () => {
    mocks.usePodInterfaceAccess.mockReturnValue(null)
    const { container } = render(<MatrixInvitationList />)
    expect(container).toBeEmptyDOMElement()
  })
})
