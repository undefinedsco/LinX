import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFilesStore } from '../../app/store'
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
  placements: [] as Array<{ boardUri: string; viewOf: string | null; name: string }>,
  selectChat: vi.fn(),
  writeCell: vi.fn().mockResolvedValue(undefined),
  confirmTerm: vi.fn().mockResolvedValue(undefined),
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
  // The vocabulary documents are not part of these cards.
  useRawTextResource: (uri: string) => (uri.endsWith('/terms.ttl') || uri.endsWith('/shapes.ttl') || uri.endsWith('/namespaces.ttl')
    ? { data: undefined, isLoading: false, isError: false, error: null }
    : mocks.raw()),
  useFilesVocabRegistryDiscovery: () => ({ data: undefined }),
  useConfirmVocabTerm: () => ({ mutateAsync: mocks.confirmTerm }),
  useBlobResource: () => ({ data: undefined, isLoading: false }),
  useFilesCurrentPodRootUri: () => 'https://pod.example/',
  useFilesMetaSidecar: () => ({ data: undefined }),
  useSaveRawTextResource: () => ({ mutateAsync: mocks.saveRaw }),
  useWriteOwnStructuredCellChange: () => ({ mutateAsync: mocks.writeCell }),
  useCardHistoryAccess: () => mocks.history,
  useAiDraft: () => ({ data: null }),
  useCreateRawTextResource: () => ({ mutateAsync: vi.fn() }),
  useActOnAiDraft: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFilesCitingWork: () => mocks.citing,
  useCardWhiteboardPlacements: () => mocks.placements,
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
    mocks.placements = []
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
    fireEvent.click(screen.getByRole('button', { name: '展开成整页' }))
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

  it('shows the title once when the body starts with the same heading', async () => {
    mocks.raw.mockReturnValue({
      data: { uri: DOC, content: '# plan\n\n正文', mimeType: 'text/markdown', etag: 'e1', headers: {} },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    })
    render(<CardDialogHost />)
    act(() => { useCardDialog.getState().open({ uri: DOC }) })
    await screen.findByText('正文')
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByText('plan', { selector: 'h1, h2:not(.sr-only)' })).toHaveLength(1)
  })

  it('shows the title once for a made card whose file name adds the date', async () => {
    const excerpt = 'https://pod.example/摘录/%E7%BB%B4%E6%8A%A4%E6%88%90%E6%9C%AC%2010-24.md'
    mocks.detail.mockReturnValue({
      data: {
        id: excerpt, uri: excerpt, name: '维护成本 10-24.md', kind: 'resource', semanticKind: 'file',
        parentUri: 'https://pod.example/摘录/', mimeType: 'text/markdown', size: 10, modifiedAt: null, headers: {}, previewText: '',
      },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    })
    mocks.raw.mockReturnValue({
      data: { uri: excerpt, content: '# 维护成本\n\n> 太高\n', mimeType: 'text/markdown', etag: 'e1', headers: {} },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    })
    render(<CardDialogHost />)
    act(() => { useCardDialog.getState().open({ uri: excerpt }) })
    await screen.findByText('维护成本', { selector: 'h1' })
    expect(within(screen.getByRole('dialog')).queryByText('维护成本 10-24', { selector: 'h2:not(.sr-only)' })).not.toBeInTheDocument()
  })

  it('opens a link into the Pod as a card at its line instead of leaving LinX', async () => {
    mocks.raw.mockReturnValue({
      data: { uri: DOC, content: '# plan\n\n来源：[会议纪要 · 第 3 行](https://pod.example/%E4%BC%9A%E8%AE%AE.md#line=3)', mimeType: 'text/markdown', etag: 'e1', headers: {} },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    })
    render(<CardDialogHost />)
    act(() => { useCardDialog.getState().open({ uri: DOC }) })
    const link = await screen.findByRole('link', { name: '会议纪要 · 第 3 行' })
    expect(fireEvent.click(link)).toBe(false) // default navigation was prevented
    expect(useCardDialog.getState().request).toMatchObject({
      uri: 'https://pod.example/%E4%BC%9A%E8%AE%AE.md',
      locator: { line: 3 },
    })
  })

  it('opens links to other sites in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    mocks.raw.mockReturnValue({
      data: { uri: DOC, content: '# plan\n\n[官网](https://example.com/a)', mimeType: 'text/markdown', etag: 'e1', headers: {} },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    })
    render(<CardDialogHost />)
    act(() => { useCardDialog.getState().open({ uri: DOC }) })
    fireEvent.click(await screen.findByRole('link', { name: '官网' }))
    expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer')
    expect(useCardDialog.getState().request?.uri).toBe(DOC)
    open.mockRestore()
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
    expect(screen.getByText(/被 1 处引用/)).toBeInTheDocument()
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
    expect(screen.getByText(/用过它的工作 2 次/)).toBeInTheDocument()
    fireEvent.click(within(section).getByText('周报讨论'))
    expect(mocks.selectChat).toHaveBeenCalledWith('c1')
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/$microAppId', params: { microAppId: 'chat' } })
    expect(useCardDialog.getState().request).toBeNull()
  })

  it('lists the whiteboards the card sits on under 被引用 and opens that board', async () => {
    mocks.placements = [{ boardUri: 'https://pod.example/.data/views/whiteboard/plan.canvas', viewOf: 'https://pod.example/tasks.ttl', name: '任务' }]
    render(<CardDialogHost />)
    act(() => { useCardDialog.getState().open({ uri: DOC }) })
    const section = await screen.findByLabelText('被引用')
    expect(within(section).getByText('在白板上')).toBeInTheDocument()
    fireEvent.click(within(section).getByText('任务'))
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/tasks.ttl')
    expect(useFilesStore.getState().structuredViewMode).toBe('whiteboard')
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/$microAppId', params: { microAppId: 'files' } })
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

    it('looks like an opened card: the title where the heading sits, then the body and properties places', async () => {
      render(<CardDialogHost />)
      open(vi.fn())
      const title = await screen.findByLabelText('卡片标题')
      expect(title).toHaveAttribute('data-card-title', 'true')
      expect(title.className).toContain('text-2xl')
      expect(screen.getByLabelText('属性')).toBeInTheDocument()
      expect(screen.getByText('起好名字后，在这里写正文')).toBeInTheDocument()
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

  describe('a row of a table', () => {
    const TABLE = 'https://pod.example/cards/t.ttl'
    const SOURCE = `@prefix schema: <http://schema.org/>.
@prefix udfs: <https://undefineds.co/vocab/>.
<#a> a schema:Thing; schema:name "周报"; schema:text "正文"; udfs:stage "进行中"; udfs:score 5; schema:url <https://a.example/>.
<#b> a schema:Thing; schema:name "写稿"; udfs:stage "待办".`
    const mockTable = (source = SOURCE) => {
      mocks.detail.mockReturnValue({
        data: {
          id: TABLE, uri: TABLE, name: 't.ttl', kind: 'resource', semanticKind: 'structured-data',
          parentUri: 'https://pod.example/cards/', mimeType: 'text/turtle', size: 100, modifiedAt: null, headers: {},
        },
        isLoading: false, isError: false, error: null, refetch: vi.fn(),
      })
      mocks.raw.mockReturnValue({
        data: { uri: TABLE, content: source, mimeType: 'text/turtle', etag: 'e1', headers: {} },
        isLoading: false, isError: false, error: null, refetch: vi.fn(),
      })
    }
    const openCard = (id: string) => {
      render(<CardDialogHost />)
      act(() => { useCardDialog.getState().open({ uri: `${TABLE}#${id}`, from: 'table' }) })
    }

    it('lays the table columns out as label and value, without the body as a property', async () => {
      mockTable()
      openCard('a')
      const section = await screen.findByLabelText('属性')
      expect(within(section).getByText('Stage')).toBeInTheDocument()
      expect(within(section).getByLabelText('Stage')).toHaveValue('进行中')
      expect(within(section).getByLabelText('Score')).toHaveValue(5)
      expect(within(section).queryByText('Text')).not.toBeInTheDocument()
      expect(within(section).queryByText('正文')).not.toBeInTheDocument()
      expect(within(section).getByRole('link', { name: /a\.example/ })).toHaveAttribute('href', 'https://a.example/')
      expect(within(section).getByRole('button', { name: '+ 属性' })).toBeInTheDocument()
    })

    it('also shows the columns this card has no value for', async () => {
      mockTable()
      openCard('b')
      const section = await screen.findByLabelText('属性')
      expect(within(section).getByLabelText('Score')).toHaveValue('')
    })

    it('writes an edited property straight into the row', async () => {
      mockTable()
      openCard('a')
      const stage = await screen.findByLabelText('Stage')
      fireEvent.change(stage, { target: { value: '完成' } })
      fireEvent.blur(stage)
      await waitFor(() => expect(mocks.writeCell).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: TABLE,
        subject: `${TABLE}#a`,
        predicate: 'https://undefineds.co/vocab/stage',
        previousValues: ['"进行中"'],
        nextValues: ['"完成"'],
      })))
      const score = screen.getByLabelText('Score')
      fireEvent.change(score, { target: { value: '8' } })
      fireEvent.blur(score)
      await waitFor(() => expect(mocks.writeCell).toHaveBeenCalledWith(expect.objectContaining({
        predicate: 'https://undefineds.co/vocab/score',
        previousValues: ['5'],
        nextValues: ['8'],
      })))
    })

    it('adds a column to the table from + 属性 and offers it at once', async () => {
      mockTable()
      openCard('a')
      fireEvent.click(await screen.findByRole('button', { name: '+ 属性' }))
      fireEvent.change(screen.getByLabelText('属性名'), { target: { value: '负责人' } })
      fireEvent.keyDown(screen.getByLabelText('属性名'), { key: 'Enter' })
      await waitFor(() => expect(mocks.confirmTerm).toHaveBeenCalledTimes(1))
      const { proposal } = mocks.confirmTerm.mock.calls[0]![0]
      expect(proposal).toMatchObject({ termKind: 'predicate', label: '负责人', classScope: 'schema:Thing', documentUri: TABLE })
      expect(await screen.findByLabelText('负责人')).toHaveValue('')
      expect(screen.queryByLabelText('属性名')).not.toBeInTheDocument()
    })

    it('takes the new column back when the vocabulary refuses it', async () => {
      mockTable()
      mocks.confirmTerm.mockRejectedValueOnce(new Error('no'))
      openCard('a')
      fireEvent.click(await screen.findByRole('button', { name: '+ 属性' }))
      fireEvent.change(screen.getByLabelText('属性名'), { target: { value: '负责人' } })
      fireEvent.keyDown(screen.getByLabelText('属性名'), { key: 'Enter' })
      await waitFor(() => expect(mocks.confirmTerm).toHaveBeenCalled())
      await waitFor(() => expect(screen.queryByLabelText('负责人')).not.toBeInTheDocument())
    })

    it('says "被 N 处引用 · 用过它的工作 N 次" in one line above the lists', async () => {
      mockTable()
      mocks.citing = [{ chatRef: 'c1', chatId: 'c1', title: '周报讨论', count: 4, quote: null, lastAt: null }]
      mocks.texts = [{ uri: 'https://pod.example/摘录/idea.md', title: 'idea.md', text: `来源：[周报](${TABLE}#a)` }]
      openCard('a')
      const summary = await screen.findByText(/被 1 处引用 · 用过它的工作 4 次/)
      const list = await screen.findByLabelText('被引用')
      expect(summary.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
