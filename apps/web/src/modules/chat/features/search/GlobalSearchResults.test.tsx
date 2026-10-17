import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  chats: [] as unknown[],
  threads: [] as unknown[],
  contacts: [] as unknown[],
  files: [] as unknown[],
  fileError: false,
  bodyHits: [] as unknown[],
  coverageNote: null as string | null,
  openBodyHit: vi.fn(),
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
vi.mock('@/modules/files/features/search/useFilesBodySearch', () => ({
  useFilesBodySearch: (query: string) => ({
    active: !!query,
    hits: query ? mocks.bodyHits : [],
    note: mocks.coverageNote,
    isIndexing: false,
    coverage: { totalFiles: 0, indexedFiles: 0, indexing: false },
  }),
  useOpenBodyHit: () => mocks.openBodyHit,
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
    mocks.bodyHits = []
    mocks.coverageNote = null
  })

  it('groups conversations, contacts and file names', () => {
    render(<GlobalSearchResults query="排班" />)

    expect(screen.getByRole('region', { name: '会话' })).toHaveTextContent('排班小组')
    // Internal topics are never search results.
    expect(screen.queryByText(/排班规则草稿/)).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '联系人与群' })).toHaveTextContent('周禾排班')
    expect(screen.getByRole('region', { name: '联系人与群' })).toHaveTextContent('群聊')
    expect(screen.getByRole('region', { name: '文件与卡片' })).toHaveTextContent('排班表.xlsx')
  })

  it('adds body hits with a snippet and reason, says coverage is partial, and opens at the line', () => {
    mocks.files = []
    mocks.bodyHits = [{
      uri: 'https://pod.example/纪要.md', title: '纪要.md', snippet: '…给志愿者排班时只设每月上限…',
      matched: '排班', reason: '正文里有 “排班”', line: 3, quote: '给志愿者排班时只设每月上限',
    }]
    mocks.coverageNote = '还有 2 个文件的正文没建索引，只按名字找'
    render(<GlobalSearchResults query="排班" />)

    const section = screen.getByRole('region', { name: '文件与卡片' })
    expect(section).toHaveTextContent('纪要.md')
    expect(section).toHaveTextContent('正文里有 “排班”')
    expect(section).toHaveTextContent('还有 2 个文件的正文没建索引，只按名字找')
    fireEvent.click(screen.getByText('纪要.md'))
    expect(mocks.openBodyHit).toHaveBeenCalledWith(expect.objectContaining({ line: 3 }))
  })

  it('shows a file once when it matches by name and by text, and offers 查看全部', () => {
    mocks.bodyHits = [
      { uri: 'https://pod.example/排班表.xlsx', title: '排班表.xlsx', snippet: 's', matched: '排班', reason: 'r', line: 1, quote: 'q' },
      { uri: 'https://pod.example/a.md', title: 'a.md', snippet: 's', matched: '排班', reason: 'r', line: 1, quote: 'q' },
      { uri: 'https://pod.example/b.md', title: 'b.md', snippet: 's', matched: '排班', reason: 'r', line: 1, quote: 'q' },
      { uri: 'https://pod.example/c.md', title: 'c.md', snippet: 's', matched: '排班', reason: 'r', line: 1, quote: 'q' },
      { uri: 'https://pod.example/d.md', title: 'd.md', snippet: 's', matched: '排班', reason: 'r', line: 1, quote: 'q' },
    ]
    render(<GlobalSearchResults query="排班" />)

    expect(screen.getAllByText('排班表.xlsx')).toHaveLength(1)
    expect(screen.queryByText('d.md')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /查看全部 5 个/ })).toBeInTheDocument()
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
    expect(screen.getByText(/已建索引的文件正文/)).toBeInTheDocument()
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
