import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCloseAddDialog = vi.fn()
const mockSelectChat = vi.fn()
const mockSelectThread = vi.fn()
const mockCreateAIChat = vi.fn()
const mockCreateThread = vi.fn()
const mockEnsureThreadWorkspace = vi.fn()
const mockToast = vi.fn()
const mockCreateAndStartRuntimeSession = vi.fn()
const mockUseChatStore = vi.fn()
const mockIsRuntimeSessionMode = vi.fn()
const mockLookupSolidProfile = vi.fn()
const mockFindPersonByAccount = vi.fn()
const mockAddFriend = vi.fn()
const mockCreateGroupDialog = vi.fn()

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/model-selector', () => ({
  ModelSelector: ({
    value,
    onChange,
  }: {
    value?: string
    onChange?: (value: string) => void
  }) => (
    <select
      aria-label="默认模型"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    >
      <option value="linx-lite">linx-lite</option>
      <option value="gpt-4o-mini">gpt-4o-mini</option>
      <option value="claude-3-5-sonnet-latest">claude-3-5-sonnet-latest</option>
    </select>
  ),
}))

vi.mock('@/lib/agent-providers', () => ({
  CHAT_AGENT_PROVIDERS: [
    {
      slug: 'undefineds',
      displayName: 'LinX Platform',
      models: [{ id: 'linx-lite', displayName: 'LinX Lite' }, { id: 'linx', displayName: 'LinX' }],
    },
    {
      slug: 'openai',
      displayName: 'OpenAI',
      models: [{ id: 'gpt-4o-mini', displayName: 'GPT-4o mini' }],
    },
  ],
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
  }) => (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}))

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('../store', () => ({
  useChatStore: (selector: (state: unknown) => unknown) => mockUseChatStore(selector),
}))

vi.mock('../collections', () => ({
  useChatMutations: () => ({
    createAIChat: {
      mutateAsync: mockCreateAIChat,
      isPending: false,
    },
    createThread: {
      mutateAsync: mockCreateThread,
      isPending: false,
    },
    ensureThreadWorkspace: {
      mutateAsync: mockEnsureThreadWorkspace,
      isPending: false,
    },
  }),
}))

vi.mock('../runtime-client', () => ({
  DEFAULT_RUNTIME_BASE_REF: 'HEAD',
  DEFAULT_RUNTIME_TOOL: 'codex',
  createAndStartRuntimeSession: (input: unknown) => mockCreateAndStartRuntimeSession(input),
  isRuntimeSessionMode: () => mockIsRuntimeSessionMode(),
  resolveLocalContainer: vi.fn(async () => 'linx://device-123/repo/linx'),
}))

vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({ session: { info: { webId: 'https://me.example/profile/card#me', isLoggedIn: true } } }),
}))

vi.mock('@/modules/model-services/data/use-model-services', () => ({
  useModelServices: () => ({ providers: {} }),
}))

// The real add-friend form runs; only the Pod-facing operations are replaced.
vi.mock('@/modules/contacts/data/collections', () => ({
  contactOps: {
    lookupSolidProfile: (webId: string) => mockLookupSolidProfile(webId),
    findPersonByAccount: (webId: string) => mockFindPersonByAccount(webId),
    addFriend: (input: unknown) => mockAddFriend(input),
  },
}))

vi.mock('@/modules/contacts', async () => ({
  AddFriendForm: (await vi.importActual<typeof import('@/modules/contacts/features/add-friend/AddFriendForm')>(
    '@/modules/contacts/features/add-friend/AddFriendForm',
  )).AddFriendForm,
  CreateGroupDialog: (props: unknown) => {
    mockCreateGroupDialog(props)
    const { onCreated } = props as { onCreated?: (contactId: string, chatId: string) => void }
    return (
      <div>
        <button type="button" onClick={() => onCreated?.('group-contact-1', 'group-chat-1')}>
          mock-create-group
        </button>
      </div>
    )
  },
}))

import { AddChatDialog } from './AddChatDialog'

describe('AddChatDialog', () => {
  const setupStore = (mode: 'ai' | 'friend' | 'group' = 'ai') => {
    mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      isAddDialogOpen: true,
      addDialogMode: mode,
      closeAddDialog: mockCloseAddDialog,
      selectChat: mockSelectChat,
      selectThread: mockSelectThread,
    }))
  }

  beforeEach(() => {
    vi.clearAllMocks()

    setupStore()
    mockCreateAIChat.mockResolvedValue({ id: 'chat-1' })
    mockCreateThread.mockResolvedValue({ id: 'thread-1' })
    mockEnsureThreadWorkspace.mockResolvedValue('linx://device-123/repo/linx')
    mockIsRuntimeSessionMode.mockReturnValue(true)
    mockLookupSolidProfile.mockResolvedValue({
      status: 'found',
      profile: {
        name: 'Alice',
        webId: 'https://alice.example/profile/card#me',
        avatarUrl: 'alice.png',
      },
    })
    mockFindPersonByAccount.mockReturnValue(null)
    mockAddFriend.mockResolvedValue({ id: 'contact-1', chatId: 'chat-friend-1' })
  })

  it('creates chat, thread, and runtime session in one flow', async () => {
    const onCreated = vi.fn()
    render(<AddChatDialog onCreated={onCreated} />)

    fireEvent.change(screen.getByLabelText('助手名称'), { target: { value: '代码助手' } })
    fireEvent.click(screen.getByLabelText('同时创建运行时会话'))
    fireEvent.change(screen.getByLabelText('仓库路径'), { target: { value: '/repo/linx' } })
    fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'feature/runtime' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(mockCreateAIChat).toHaveBeenCalledWith({
        title: '代码助手',
        provider: 'undefineds',
        model: 'linx-lite',
        systemPrompt: undefined,
      })
    })

    expect(mockCreateThread).toHaveBeenCalledWith({
      chatId: 'chat-1',
      title: '默认话题',
    })

    expect(mockEnsureThreadWorkspace).toHaveBeenCalledWith({
      threadId: 'thread-1',
      workspaceUri: 'linx://device-123/repo/linx',
      title: '默认话题',
      repoPath: '/repo/linx',
      folderPath: '/repo/linx',
      baseRef: 'HEAD',
      branch: 'feature/runtime',
    })

    expect(mockCreateAndStartRuntimeSession).toHaveBeenCalledWith({
      threadId: 'thread-1',
      container: 'linx://device-123/repo/linx',
      title: '默认话题',
      repoPath: '/repo/linx',
      folderPath: '/repo/linx',
      tool: 'codex',
      baseRef: 'HEAD',
      branch: 'feature/runtime',
    })

    expect(mockSelectChat).toHaveBeenCalledWith('chat-1')
    expect(mockSelectThread).toHaveBeenCalledWith('thread-1')
    expect(mockSelectChat.mock.invocationCallOrder[0]).toBeLessThan(
      mockSelectThread.mock.invocationCallOrder[0],
    )
    expect(mockCloseAddDialog).toHaveBeenCalled()
    expect(onCreated).toHaveBeenCalledWith('chat-1')
    expect(mockToast).not.toHaveBeenCalled()
  })

  it('binds a default Pod workspace when creating an AI chat without a runtime session', async () => {
    mockIsRuntimeSessionMode.mockReturnValue(false)
    const onCreated = vi.fn()
    render(<AddChatDialog onCreated={onCreated} />)

    fireEvent.change(screen.getByLabelText('助手名称'), { target: { value: '普通助手' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(mockCreateAIChat).toHaveBeenCalledWith({
        title: '普通助手',
        provider: 'undefineds',
        model: 'linx-lite',
        systemPrompt: undefined,
      })
    })

    expect(mockCreateThread).toHaveBeenCalledWith({
      chatId: 'chat-1',
      title: '默认话题',
    })
    expect(mockEnsureThreadWorkspace).toHaveBeenCalledWith({
      threadId: 'thread-1',
      title: '默认话题',
    })
    expect(mockCreateAndStartRuntimeSession).not.toHaveBeenCalled()
    expect(mockSelectChat).toHaveBeenCalledWith('chat-1')
    expect(mockSelectThread).toHaveBeenCalledWith('thread-1')
    expect(mockCloseAddDialog).toHaveBeenCalled()
    expect(onCreated).toHaveBeenCalledWith('chat-1')
  })

  it('blocks submit when runtime is enabled without repo path', async () => {
    render(<AddChatDialog />)

    fireEvent.click(screen.getByLabelText('同时创建运行时会话'))
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    expect(await screen.findByText('启用运行时会话时请先填写仓库路径。')).toBeInTheDocument()
    expect(mockCreateAIChat).not.toHaveBeenCalled()
    expect(mockCreateAndStartRuntimeSession).not.toHaveBeenCalled()
  })

  it('searches webid and creates a friend chat', async () => {
    setupStore('friend')
    render(<AddChatDialog />)

    fireEvent.change(screen.getByLabelText('对方的账号'), {
      target: { value: 'https://alice.example/profile/card#me' },
    })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))

    await waitFor(() => {
      expect(mockLookupSolidProfile).toHaveBeenCalledWith('https://alice.example/profile/card#me')
    })

    expect(await screen.findByText('Alice')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '添加' }))

    await waitFor(() => {
      expect(mockAddFriend).toHaveBeenCalledWith({
        name: 'Alice',
        webId: 'https://alice.example/profile/card#me',
        avatarUrl: 'alice.png',
      })
    })

    expect(mockSelectChat).toHaveBeenCalledWith('chat-friend-1')
    expect(mockCloseAddDialog).toHaveBeenCalled()
  })

  it('does not expose storage internals when adding a friend fails', async () => {
    setupStore('friend')
    mockAddFriend.mockRejectedValue(new Error('Failed to create Pod container https://node.example/alice/.data/contacts/: HTTP 403'))

    render(<AddChatDialog />)

    fireEvent.change(screen.getByLabelText('对方的账号'), {
      target: { value: 'https://alice.example/profile/card#me' },
    })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))

    expect(await screen.findByText('Alice')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '添加' }))

    expect(await screen.findByText('这个账号还不能写入当前空间。请换一个空间；如果这是你的本机空间，请先完成空间创建。')).toBeInTheDocument()
    expect(screen.queryByText(/HTTP 403|Pod container|node\.example|\.data/i)).not.toBeInTheDocument()
  })

  it.each([
    ['not-found', '没有找到这个账号'],
    ['unreadable', '找到了这个账号，但对方的资料没有公开，暂时不能添加'],
    ['unreachable', '现在连不上对方所在的服务，请稍后再试'],
    ['offline', '没有网络，连上后再试'],
  ])('says plainly when the lookup ends as %s', async (status, text) => {
    setupStore('friend')
    mockLookupSolidProfile.mockResolvedValue({ status })
    render(<AddChatDialog />)

    fireEvent.change(screen.getByLabelText('对方的账号'), { target: { value: 'alice@example.org' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))

    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '添加' })).not.toBeInTheDocument()
  })

  it('refuses the short forms that are not accounts and your own account', async () => {
    setupStore('friend')
    render(<AddChatDialog />)

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByText('先粘贴对方的账号')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('对方的账号'), { target: { value: 'not an account' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByText('这个账号看起来不对，请检查后再试')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('对方的账号'), { target: { value: 'https://me.example/profile/card#me' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByText('这是你自己的账号')).toBeInTheDocument()
    expect(mockLookupSolidProfile).not.toHaveBeenCalled()
  })

  it('shows someone already in contacts as added instead of adding twice', async () => {
    setupStore('friend')
    mockFindPersonByAccount.mockReturnValue({ id: 'contact-9' })
    render(<AddChatDialog />)

    fireEvent.change(screen.getByLabelText('对方的账号'), { target: { value: 'alice@example.org' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))

    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('已添加')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '添加' })).not.toBeInTheDocument()
  })

  it('delegates group creation to CreateGroupDialog and selects created chat', async () => {
    const onCreated = vi.fn()
    setupStore('group')
    render(<AddChatDialog onCreated={onCreated} />)

    expect(mockCreateGroupDialog).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'mock-create-group' }))

    await waitFor(() => {
      expect(mockSelectChat).toHaveBeenCalledWith('group-chat-1')
    })

    expect(onCreated).toHaveBeenCalledWith('group-chat-1')
    expect(mockCloseAddDialog).toHaveBeenCalled()
  })
})
