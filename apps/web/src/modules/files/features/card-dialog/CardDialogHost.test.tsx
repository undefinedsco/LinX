import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
}))

const DOC = 'https://pod.example/notes/plan.md'

describe('CardDialogHost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCardDialog.setState({ request: null })
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
    expect(await screen.findByText('notes / plan.md')).toBeInTheDocument()
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
