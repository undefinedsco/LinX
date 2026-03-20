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
const mockFetchSolidProfile = vi.fn()
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
      <option value="gpt-4o-mini">gpt-4o-mini</option>
      <option value="claude-3-5-sonnet-latest">claude-3-5-sonnet-latest</option>
    </select>
  ),
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
  resolveLocalWorkspaceUri: vi.fn(async () => 'linx://node-123/repo/linx'),
}))

vi.mock('@/modules/contacts/collections', () => ({
  contactOps: {
    fetchSolidProfile: (webId: string) => mockFetchSolidProfile(webId),
    addFriend: (input: unknown) => mockAddFriend(input),
  },
}))

vi.mock('@/modules/contacts/components/CreateGroupDialog', () => ({
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
    mockEnsureThreadWorkspace.mockResolvedValue('linx://node-123/repo/linx')
    mockIsRuntimeSessionMode.mockReturnValue(true)
    mockFetchSolidProfile.mockResolvedValue({
      name: 'Alice',
      webId: 'https://alice.example/profile/card#me',
      avatarUrl: 'alice.png',
    })
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
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: undefined,
      })
    })

    expect(mockCreateThread).toHaveBeenCalledWith({
      chatId: 'chat-1',
      title: '默认话题',
    })

    expect(mockEnsureThreadWorkspace).toHaveBeenCalledWith({
      threadId: 'thread-1',
      workspaceUri: 'linx://node-123/repo/linx',
      title: '默认话题',
      repoPath: '/repo/linx',
      folderPath: '/repo/linx',
      baseRef: 'HEAD',
      branch: 'feature/runtime',
    })

    expect(mockCreateAndStartRuntimeSession).toHaveBeenCalledWith({
      threadId: 'thread-1',
      workspaceUri: 'linx://node-123/repo/linx',
      title: '默认话题',
      repoPath: '/repo/linx',
      folderPath: '/repo/linx',
      tool: 'codex',
      baseRef: 'HEAD',
      branch: 'feature/runtime',
    })

    expect(mockSelectChat).toHaveBeenCalledWith('chat-1')
    expect(mockSelectThread).toHaveBeenCalledWith('thread-1')
    expect(mockCloseAddDialog).toHaveBeenCalled()
    expect(onCreated).toHaveBeenCalledWith('chat-1')
    expect(mockToast).not.toHaveBeenCalled()
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

    fireEvent.change(screen.getByLabelText('WebID'), {
      target: { value: 'https://alice.example/profile/card#me' },
    })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))

    await waitFor(() => {
      expect(mockFetchSolidProfile).toHaveBeenCalledWith('https://alice.example/profile/card#me')
    })

    expect(await screen.findByText('Alice')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '添加为好友' }))

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
