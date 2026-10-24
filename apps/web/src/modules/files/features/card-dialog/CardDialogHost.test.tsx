import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCardDialog } from '@/lib/card-dialog'

import { CardDialogHost } from './CardDialogHost'

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  raw: vi.fn(),
  saveRaw: vi.fn(),
  navigate: vi.fn(),
  history: { ready: true, read: vi.fn(), record: vi.fn().mockResolvedValue(undefined) },
  withdrawn: new Set<string>(),
  restore: vi.fn().mockResolvedValue([]),
  texts: [] as Array<{ uri: string; title: string; text: string }>,
  citing: [] as Array<{ chatRef: string; chatId: string; title: string; count: number; quote: string | null; lastAt: string | null }>,
  selectChat: vi.fn(),
}))

vi.mock('@/lib/use-withdrawn-cards', () => ({
  useWithdrawnCards: () => ({
    isWithdrawn: (uri: string) => mocks.withdrawn.has(uri),
    withdraw: vi.fn().mockResolvedValue([]),
    restore: mocks.restore,
    pending: false,
  }),
}))

vi.mock('@/modules/files/ui/BlockNoteFileEditor', async () => import('../../ui/__tests__/fake-block-note-file-editor'))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) => select({ location: { pathname: '/files' } }),
}))
vi.mock('../sidecars/ShareDialog', () => ({ ShareDialog: () => null }))
vi.mock('../../data/queries', () => ({
  useFileDetail: () => mocks.detail(),
  useRawTextResource: () => mocks.raw(),
  useBlobResource: () => ({ data: undefined, isLoading: false }),
  useFilesCurrentPodRootUri: () => 'https://pod.example/',
  useFilesMetaSidecar: () => ({ data: undefined }),
  useSaveRawTextResource: () => ({ mutateAsync: mocks.saveRaw }),
  useWriteOwnStructuredCellChange: () => ({ mutateAsync: vi.fn() }),
  useCardHistoryAccess: () => mocks.history,
  useAiDraft: () => ({ data: null }),
  useCreateRawTextResource: () => ({ mutateAsync: vi.fn() }),
  useActOnAiDraft: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFilesCitingWork: () => mocks.citing,
  useFilesSelectChat: () => mocks.selectChat,
}))
vi.mock('../../data/queries/body-search-queries', () => ({
  useFilesBodyIndex: () => ({
    store: { texts: () => mocks.texts },
    snapshot: { version: 0, indexing: false },
  }),
}))

const DOC = 'https://pod.example/notes/plan.md'

describe('CardDialogHost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCardDialog.setState({ request: null })
    mocks.texts = []
    mocks.citing = []
    mocks.detail.mockReturnValue({
      data: {
        id: DOC, uri: DOC, name: 'plan.md', kind: 'resource', semanticKind: 'file',
        parentUri: 'https://pod.example/notes/', mimeType: 'text/markdown', size: 10, modifiedAt: null,
        headers: {}, previewText: '# Plan',
      },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    })
    mocks.raw.mockReturnValue({
      data: { uri: DOC, content: '# Plan', mimeType: 'text/markdown', etag: 'e1', headers: {} },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    })
  })

  it('renders nothing until a card is requested', () => {
    const { container } = render(<CardDialogHost />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the card with its path and sibling navigation', async () => {
    render(<CardDialogHost />)
    act(() => {
      useCardDialog.getState().open({ uri: DOC, siblings: ['https://pod.example/notes/a.md', DOC, 'https://pod.example/notes/z.md'] })
    })
    expect(await screen.findByText('notes / plan')).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一张' }))
    expect(useCardDialog.getState().request?.uri).toBe('https://pod.example/notes/z.md')
  })

  it('shows the locator and closes', async () => {
    render(<CardDialogHost />)
    act(() => { useCardDialog.getState().open({ uri: DOC, locator: { page: 3 } }) })
    expect(await screen.findByText('第 3 页')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上一张' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '展开' }))
    await waitFor(() => expect(useCardDialog.getState().request).toBeNull())
    expect(mocks.navigate).toHaveBeenCalled()
  })

  it('marks a withdrawn card and puts it back into use', async () => {
    mocks.withdrawn.add(DOC)
    try {
      render(<CardDialogHost />)
      act(() => { useCardDialog.getState().open({ uri: DOC }) })
      expect(await screen.findByText('已撤回：以后的工作不再使用这张卡片。')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '恢复使用' }))
      expect(mocks.restore).toHaveBeenCalledWith(DOC)
    } finally {
      mocks.withdrawn.clear()
    }
  })

  it('explains a deleted file with one action', async () => {
    const { FilesResourceReadError } = await import('../../domain/resource/resource-model')
    mocks.detail.mockReturnValue({
      data: undefined, isLoading: false, isError: true,
      error: new FilesResourceReadError(DOC, { status: 404 }), refetch: vi.fn(),
    })
    render(<CardDialogHost />)
    act(() => { useCardDialog.getState().open({ uri: DOC }) })
    expect(await screen.findByText('这个文件已经删除')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '回到文件夹' })).toBeInTheDocument()
  })

  it('puts the title above the body and the properties and references after it', async () => {
    mocks.texts = [{
      uri: 'https://pod.example/摘录/idea.md',
      title: 'idea.md',
      text: `# idea\n\n来源：[plan](${DOC}#line=3)\n`,
    }]
    render(<CardDialogHost />)
    act(() => { useCardDialog.getState().open({ uri: DOC }) })
    const title = await screen.findByText('plan', { selector: '[data-card-title]' })
    expect(title.tagName).toBe('H2')
    const references = await screen.findByLabelText('被引用')
    expect(title.compareDocumentPosition(references) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('lists the cards that point here under 被引用 and opens one in the same popup', async () => {
    mocks.texts = [{
      uri: 'https://pod.example/摘录/idea.md',
      title: 'idea.md',
      text: `# idea\n\n> 一段\n\n来源：[plan](${DOC}#line=3)\n`,
    }, {
      uri: 'https://pod.example/other.md',
      title: 'other.md',
      text: '没有链接',
    }]
    render(<CardDialogHost />)
    act(() => { useCardDialog.getState().open({ uri: DOC, from: 'folder' }) })
    const section = await screen.findByLabelText('被引用')
    expect(within(section).getByText('被引用 · 1 处')).toBeInTheDocument()
    expect(within(section).getByText('idea')).toBeInTheDocument()
    expect(within(section).getByText('来源')).toBeInTheDocument()
    expect(within(section).queryByText('other')).not.toBeInTheDocument()
    fireEvent.click(within(section).getByText('idea'))
    expect(useCardDialog.getState().request).toMatchObject({
      uri: 'https://pod.example/摘录/idea.md',
      locator: { line: 5 },
      from: 'folder',
    })
  })

  it('shows no reference sections when nothing points here', async () => {
    render(<CardDialogHost />)
    act(() => { useCardDialog.getState().open({ uri: DOC }) })
    await screen.findByText('notes / plan')
    expect(screen.queryByLabelText('被引用')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('用过它的工作')).not.toBeInTheDocument()
  })

  it('lists the chats that cited the card under 用过它的工作 and opens that chat', async () => {
    mocks.citing = [{ chatRef: 'c1', chatId: 'c1', title: '周报讨论', count: 2, quote: '那一段', lastAt: null }]
    render(<CardDialogHost />)
    act(() => { useCardDialog.getState().open({ uri: DOC }) })
    const section = await screen.findByLabelText('用过它的工作')
    expect(within(section).getByText('用过它的工作 · 2 次')).toBeInTheDocument()
    fireEvent.click(within(section).getByText('周报讨论'))
    expect(mocks.selectChat).toHaveBeenCalledWith('c1')
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/$microAppId', params: { microAppId: 'chat' } })
    expect(useCardDialog.getState().request).toBeNull()
  })

  describe('a new card from + 卡片', () => {
    const open = (create: ReturnType<typeof vi.fn>) => {
      act(() => { useCardDialog.getState().open({ uri: `${DOC}#new-card`, from: 'table', draft: { create } }) })
    }

    it('opens empty with the title focused and no engineering fields', async () => {
      render(<CardDialogHost />)
      open(vi.fn())
      const title = await screen.findByLabelText('卡片标题')
      expect(title).toHaveFocus()
      expect(title).toHaveValue('')
      expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument()
    })

    it('creates the row from the title on Enter and carries on as that card', async () => {
      const create = vi.fn().mockResolvedValue({ kind: 'created', uri: `${DOC}#写周报`, siblings: [`${DOC}#a`, `${DOC}#写周报`] })
      render(<CardDialogHost />)
      open(create)
      const title = await screen.findByLabelText('卡片标题')
      fireEvent.change(title, { target: { value: '写周报' } })
      fireEvent.keyDown(title, { key: 'Enter' })
      await waitFor(() => expect(create).toHaveBeenCalledWith('写周报'))
      await waitFor(() => expect(useCardDialog.getState().request).toMatchObject({
        uri: `${DOC}#写周报`,
        siblings: [`${DOC}#a`, `${DOC}#写周报`],
        from: 'table',
      }))
      expect(useCardDialog.getState().request?.draft).toBeUndefined()
    })

    it('says so when the name is taken and stays on the empty card', async () => {
      const create = vi.fn().mockResolvedValue({ kind: 'rejected', reason: 'duplicate' })
      render(<CardDialogHost />)
      open(create)
      const title = await screen.findByLabelText('卡片标题')
      fireEvent.change(title, { target: { value: '写周报' } })
      fireEvent.keyDown(title, { key: 'Enter' })
      expect(await screen.findByRole('alert')).toHaveTextContent('已经有同名的卡片了')
      expect(useCardDialog.getState().request?.draft).toBeDefined()
    })

    it('does not create a row when closed without a title', async () => {
      const create = vi.fn()
      render(<CardDialogHost />)
      open(create)
      await screen.findByLabelText('卡片标题')
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
      await waitFor(() => expect(useCardDialog.getState().request).toBeNull())
      expect(create).not.toHaveBeenCalled()
    })

    it('still makes the card when closed with a title typed', async () => {
      const create = vi.fn().mockResolvedValue({ kind: 'created', uri: `${DOC}#写周报` })
      render(<CardDialogHost />)
      open(create)
      const title = await screen.findByLabelText('卡片标题')
      fireEvent.change(title, { target: { value: '写周报' } })
      fireEvent.keyDown(title, { key: 'Escape' })
      await waitFor(() => expect(create).toHaveBeenCalledWith('写周报'))
    })
  })

  describe('RDF data documents', () => {
    const TTL = 'https://pod.example/profile/card'
    const mockTurtle = (content: string) => {
      mocks.detail.mockReturnValue({
        data: {
          id: TTL, uri: TTL, name: 'card', kind: 'resource', semanticKind: 'structured-data',
          parentUri: 'https://pod.example/profile/', mimeType: 'text/turtle', size: 100, modifiedAt: null, headers: {},
        },
        isLoading: false, isError: false, error: null, refetch: vi.fn(),
      })
      mocks.raw.mockReturnValue({
        data: { uri: TTL, content, mimeType: 'text/turtle', etag: 'e1', headers: {} },
        isLoading: false, isError: false, error: null, refetch: vi.fn(),
      })
    }

    it('shows the main subject (#me) with plain-label properties', async () => {
      mockTurtle(`@prefix foaf: <http://xmlns.com/foaf/0.1/> .
<#me> foaf:name "Alice" ; foaf:homepage <https://alice.example/> ; foaf:nick "ally" .`)
      render(<CardDialogHost />)
      act(() => { useCardDialog.getState().open({ uri: TTL, from: 'folder' }) })
      expect(await screen.findByLabelText('属性')).toBeInTheDocument()
      expect(screen.getByText('主页')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /alice\.example|https:\/\/alice/ })).toHaveAttribute('href', 'https://alice.example/')
    })

    it('lists several subjects and opens one in the same popup', async () => {
      mockTurtle(`@prefix foaf: <http://xmlns.com/foaf/0.1/> .
<#a> foaf:name "Alice" ; foaf:nick "ally" .
<#b> foaf:name "Bob" .`)
      render(<CardDialogHost />)
      act(() => { useCardDialog.getState().open({ uri: TTL, from: 'folder' }) })
      expect(await screen.findByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
      expect(screen.getByText(/展开/, { selector: 'p' })).toBeInTheDocument()
      fireEvent.click(screen.getByText('Bob'))
      expect(useCardDialog.getState().request).toMatchObject({ uri: `${TTL}#b`, siblings: [`${TTL}#a`, `${TTL}#b`] })
    })

    it('never leaves the body empty', async () => {
      mockTurtle('')
      render(<CardDialogHost />)
      act(() => { useCardDialog.getState().open({ uri: TTL, from: 'folder' }) })
      expect(await screen.findByText('这个文件里还没有内容')).toBeInTheDocument()
    })
  })
})
