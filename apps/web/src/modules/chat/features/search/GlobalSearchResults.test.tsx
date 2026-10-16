import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  chats: [] as unknown[],
  threads: [] as unknown[],
  contacts: [] as unknown[],
  files: [] as unknown[],
  fileError: false,
  selectChat: vi.fn(),
  selectThread: vi.fn(),
  findOrCreateChat: vi.fn(),
  openFile: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: () => ({ data: mocks.contacts }),
}))
vi.mock('@/modules/contacts', () => ({
  contactCollection: {},
  contactOps: { findOrCreateChat: (...args: unknown[]) => mocks.findOrCreateChat(...args) },
}))
vi.mock('@/modules/files/features/search/file-name-search', () => ({
  useFileNameSearch: (query: string) => ({
    results: query ? mocks.files : [],
    isLoading: false,
    isError: mocks.fileError,
    retry: vi.fn(),
  }),
  useOpenFileEntry: () => mocks.openFile,
}))
vi.mock('../../store', () => ({
  useChatStore: (selector: (state: unknown) => unknown) => selector({
    selectChat: mocks.selectChat,
    selectThread: mocks.selectThread,
  }),
}))
vi.mock('../../collections', () => ({
  useChatList: (filters?: { search?: string }) => ({
    data: filters?.search
      ? (mocks.chats as Array<{ title?: string }>).filter((chat) => chat.title?.includes(filters.search ?? ''))
      : mocks.chats,
  }),
  useThreadIndex: () => ({ data: mocks.threads }),
}))
vi.mock('@/lib/data/resource-identity', () => ({
  resolveThreadChatId: (thread: { chat?: string }) => thread.chat ?? null,
}))

import { GlobalSearchResults } from './GlobalSearchResults'

describe('GlobalSearchResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.chats = [{ id: 'chat-team', title: '排班小组', lastMessagePreview: '周六见' }]
    mocks.threads = [{ id: 'thread-rules', title: '排班规则草稿', chat: 'chat-team' }]
    mocks.contacts = [
      { id: 'contact-zhou', name: '周禾排班', contactType: 'solid' },
      { id: 'contact-group', name: '排班群', contactType: 'group' },
    ]
    mocks.files = [{ id: 'file-1', uri: 'https://pod.example/排班表.xlsx', name: '排班表.xlsx', kind: 'file', parentUri: 'https://pod.example/' }]
    mocks.fileError = false
  })

  it('groups conversations, contacts and file names', () => {
    render(<GlobalSearchResults query="排班" />)

    expect(screen.getByRole('region', { name: '会话' })).toHaveTextContent('排班小组')
    // Internal topics are never search results.
    expect(screen.queryByText(/排班规则草稿/)).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '联系人与群' })).toHaveTextContent('周禾排班')
    expect(screen.getByRole('region', { name: '联系人与群' })).toHaveTextContent('群聊')
    expect(screen.getByRole('region', { name: '文件' })).toHaveTextContent('排班表.xlsx')
    // File search is honest about its coverage.
    expect(screen.getByText(/文件只按名称搜索，不搜正文/)).toBeInTheDocument()
  })

  it('opens each kind of result in the right place', async () => {
    mocks.findOrCreateChat.mockResolvedValue('chat-zhou')
    render(<GlobalSearchResults query="排班" />)

    fireEvent.click(screen.getByText('排班小组'))
    expect(mocks.selectChat).toHaveBeenCalledWith('chat-team')
    expect(mocks.selectThread).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('周禾排班'))
    await waitFor(() => expect(mocks.selectChat).toHaveBeenCalledWith('chat-zhou'))

    fireEvent.click(screen.getByText('排班表.xlsx'))
    expect(mocks.openFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'file-1' }))
  })

  it('says what was searched when nothing matches', () => {
    mocks.chats = []
    mocks.threads = []
    mocks.contacts = []
    mocks.files = []

    render(<GlobalSearchResults query="轮岗" />)

    expect(screen.getByText('没有找到“轮岗”')).toBeInTheDocument()
    expect(screen.getByText(/文件正文不在搜索范围里/)).toBeInTheDocument()
  })

  it('keeps other results and offers a retry when file search fails', () => {
    mocks.files = []
    mocks.fileError = true

    render(<GlobalSearchResults query="排班" />)

    expect(screen.getByText('排班小组')).toBeInTheDocument()
    expect(screen.getByText('文件这次没搜成功')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
  })
})
