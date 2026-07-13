import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { FilesListPane } from './FilesListPane'
import { createContainerNodeId, FilesResourceReadError } from '../browser'
import { useFilesStore } from '../app/store'

const mockUseFilesEntries = vi.fn()
const mockUseSelectedFilesLocation = vi.fn()
const mockUseDeleteFileResource = vi.fn()
const mockDeleteFileResource = vi.fn()
const mockUseCopyFileResource = vi.fn()
const mockCopyFileResource = vi.fn()
const mockUseMoveFileResource = vi.fn()
const mockMoveFileResource = vi.fn()
const mockUseCreateSourceIngest = vi.fn()
const mockCreateSourceIngest = vi.fn()
const mockToast = vi.fn()

vi.mock('../data/queries', () => ({
  useFilesEntries: (...args: unknown[]) => mockUseFilesEntries(...args),
  useSelectedFilesLocation: () => mockUseSelectedFilesLocation(),
  useDeleteFileResource: () => mockUseDeleteFileResource(),
  useCopyFileResource: () => mockUseCopyFileResource(),
  useMoveFileResource: () => mockUseMoveFileResource(),
  useCreateSourceIngest: () => mockUseCreateSourceIngest(),
}))

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

beforeEach(() => {
  useFilesStore.setState({
    selectedTreeNodeId: 'all',
    expandedTreeNodeIds: new Set(),
    selectedFileId: null,
    selectedFileIds: new Set(),
    entryScope: 'all',
    searchText: '',
    sortField: 'modifiedAt',
    sortDirection: 'desc',
    mimeTypeFilter: null,
    tagFilter: null,
    detailTab: 'preview',
    editableFileSheetOpenRequestUri: null,
    folderHistory: [],
  })
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn(),
    },
  })
  mockUseSelectedFilesLocation.mockReturnValue({ kind: 'all' })
  mockDeleteFileResource.mockResolvedValue(undefined)
  mockUseDeleteFileResource.mockReturnValue({
    mutateAsync: mockDeleteFileResource,
    isPending: false,
  })
  mockCopyFileResource.mockResolvedValue(undefined)
  mockUseCopyFileResource.mockReturnValue({
    mutateAsync: mockCopyFileResource,
    isPending: false,
  })
  mockMoveFileResource.mockResolvedValue(undefined)
  mockUseMoveFileResource.mockReturnValue({
    mutateAsync: mockMoveFileResource,
    isPending: false,
  })
  mockCreateSourceIngest.mockResolvedValue({
    targetResourceUri: 'https://pod.example/public/quarterly-report.card.ttl',
  })
  mockUseCreateSourceIngest.mockReturnValue({
    mutateAsync: mockCreateSourceIngest,
    isPending: false,
  })
  mockDeleteFileResource.mockClear()
  mockCopyFileResource.mockClear()
  mockMoveFileResource.mockClear()
  mockCreateSourceIngest.mockClear()
  mockToast.mockClear()
  mockUseFilesEntries.mockReturnValue({
    data: [
      {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        sourceLabel: 'Pod 根目录',
      },
      {
        id: 'https://pod.example/public/README.md',
        uri: 'https://pod.example/public/README.md',
        name: 'README.md',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/markdown',
        size: 1024,
        modifiedAt: '2026-03-01T10:00:00Z',
        sourceLabel: '当前话题',
        tags: ['docs', 'focus'],
      },
      {
        id: 'https://pod.example/public/config.json',
        uri: 'https://pod.example/public/config.json',
        name: 'config.json',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/public/',
        mimeType: 'application/json',
        size: 512,
        modifiedAt: '2026-03-01T09:00:00Z',
        sourceLabel: 'Pod 根目录',
        tags: ['config'],
      },
    ],
    isLoading: false,
    error: null,
  })
})

const defaultProps = { paneId: 'list', appId: 'files' }

describe('FilesListPane', () => {
  it('shows the current path and restores the previous folder from the head', () => {
    useFilesStore.setState({
      selectedTreeNodeId: createContainerNodeId('https://pod.example/public/docs/'),
      selectedFileId: 'https://pod.example/public/docs/',
      folderHistory: [{
        treeNodeId: createContainerNodeId('https://pod.example/public/'),
        selectedFileId: 'https://pod.example/public/',
        scrollKey: null,
      }],
    })
    mockUseSelectedFilesLocation.mockReturnValue({
      kind: 'container',
      containerUri: 'https://pod.example/public/docs/',
    })

    render(<FilesListPane {...defaultProps} />)

    expect(screen.getByLabelText('当前文件夹路径')).toHaveTextContent('/public/docs')
    fireEvent.click(screen.getByRole('button', { name: '返回上一个文件夹' }))
    expect(useFilesStore.getState()).toMatchObject({
      selectedTreeNodeId: createContainerNodeId('https://pod.example/public/'),
      selectedFileId: 'https://pod.example/public/',
    })
  })

  it('renders queried entries', () => {
    render(<FilesListPane {...defaultProps} />)

    expect(screen.getByText('public')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('config.json')).toBeInTheDocument()
    expect(screen.getByText('1.0 KB')).toBeInTheDocument()
    expect(screen.getByText('512 B')).toBeInTheDocument()
    expect(screen.getByText('text/markdown')).toBeInTheDocument()
    expect(screen.getByText('application/json')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '名称' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '类别' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '修改时间' })).not.toBeInTheDocument()
    expect(screen.queryByText('来源')).not.toBeInTheDocument()
    expect(screen.queryByText('当前话题')).not.toBeInTheDocument()
    expect(screen.queryByText('Pod 根目录')).not.toBeInTheDocument()
    expect(screen.queryByText('/public/')).not.toBeInTheDocument()
  })

  it('keeps source ingest in the list toolbar instead of a workspace overlay', async () => {
    useFilesStore.setState({
      selectedTreeNodeId: createContainerNodeId('https://pod.example/public/'),
    })
    mockUseSelectedFilesLocation.mockReturnValue({
      kind: 'container',
      containerUri: 'https://pod.example/public/',
    })

    render(<FilesListPane {...defaultProps} />)

    const toolbar = screen.getByLabelText('资源工具栏')
    expect(within(toolbar).getByPlaceholderText('搜索当前范围...')).toBeInTheDocument()
    const ingestButton = within(toolbar).getByRole('button', { name: 'Ingest 来源' })
    expect(ingestButton.closest('[data-files-ingest-action="true"]')).toBeNull()

    fireEvent.click(ingestButton)
    fireEvent.change(screen.getByLabelText('来源地址'), {
      target: { value: 'https://example.com/report.pdf' },
    })
    fireEvent.change(screen.getByLabelText('卡片标题'), {
      target: { value: 'Quarterly report' },
    })
    fireEvent.change(screen.getByLabelText('来源类型'), {
      target: { value: 'pdf' },
    })
    fireEvent.click(screen.getByRole('button', { name: '创建 Ingest 卡片' }))

    await waitFor(() => {
      expect(mockCreateSourceIngest).toHaveBeenCalledWith({
        containerUri: 'https://pod.example/public/',
        sourceUri: 'https://example.com/report.pdf',
        title: 'Quarterly report',
        sourceKind: 'pdf',
      })
    })
    expect(await screen.findByText('已创建 Ingest 卡片')).toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/quarterly-report.card.ttl')
  })

  it('keeps list-toolbar source ingest disabled outside a concrete container', () => {
    mockUseSelectedFilesLocation.mockReturnValue({ kind: 'all' })

    render(<FilesListPane {...defaultProps} />)

    fireEvent.click(within(screen.getByLabelText('资源工具栏')).getByRole('button', { name: 'Ingest 来源' }))
    expect(screen.getByRole('button', { name: '创建 Ingest 卡片' })).toBeDisabled()
    expect(screen.getByText('先选文件夹')).toBeInTheDocument()
  })

  it('shows user-facing source ingest errors from the list toolbar', async () => {
    mockCreateSourceIngest.mockRejectedValue(new Error('ParserIndexManifest is unavailable'))
    mockUseSelectedFilesLocation.mockReturnValue({
      kind: 'container',
      containerUri: 'https://pod.example/public/',
    })

    render(<FilesListPane {...defaultProps} />)

    fireEvent.click(within(screen.getByLabelText('资源工具栏')).getByRole('button', { name: 'Ingest 来源' }))
    fireEvent.change(screen.getByLabelText('来源地址'), {
      target: { value: 'https://example.com/report.pdf' },
    })
    fireEvent.change(screen.getByLabelText('卡片标题'), {
      target: { value: 'Quarterly report' },
    })
    fireEvent.click(screen.getByRole('button', { name: '创建 Ingest 卡片' }))

    expect(await screen.findByText('Ingest 队列暂不可用')).toBeInTheDocument()
    expect(screen.queryByText(/ParserIndexManifest/)).not.toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBeNull()
  })

  it('requests chat-scoped entries and shows an honest empty state', () => {
    useFilesStore.setState({ entryScope: 'chat-files' })
    mockUseFilesEntries.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    })

    render(<FilesListPane {...defaultProps} />)

    expect(mockUseFilesEntries).toHaveBeenCalledWith('all', 'chat-files')
    expect(screen.getByText('当前聊天没有关联文件')).toBeInTheDocument()
    expect(screen.getByText('聊天中引用的文件和当前话题 workspace 里的生成文件会显示在这里。')).toBeInTheDocument()
  })

  it('switches all, recent, and chat files inside the browser head', () => {
    mockUseSelectedFilesLocation.mockImplementation(() => (
      useFilesStore.getState().selectedTreeNodeId === 'smart-root:recent'
        ? { kind: 'recent' }
        : { kind: 'all' }
    ))
    render(<FilesListPane {...defaultProps} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '文件范围：全部文件' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '最近文件' }))

    expect(useFilesStore.getState()).toMatchObject({
      entryScope: 'all',
      selectedTreeNodeId: 'smart-root:recent',
    })

    fireEvent.pointerDown(screen.getByRole('button', { name: '文件范围：最近文件' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '聊天文件' }))

    expect(useFilesStore.getState()).toMatchObject({
      entryScope: 'chat-files',
      selectedTreeNodeId: 'all',
    })

    fireEvent.pointerDown(screen.getByRole('button', { name: '文件范围：聊天文件' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '全部文件' }))

    expect(useFilesStore.getState()).toMatchObject({
      entryScope: 'all',
      selectedTreeNodeId: 'all',
    })
  })

  it('renders recent files scope as modified entries with parent paths', () => {
    useFilesStore.setState({ selectedTreeNodeId: 'smart-root:recent' })
    mockUseSelectedFilesLocation.mockReturnValue({ kind: 'recent' })
    mockUseFilesEntries.mockReturnValue({
      data: [
        {
          id: 'https://pod.example/public/',
          uri: 'https://pod.example/public/',
          name: 'public',
          kind: 'container',
          semanticKind: 'container',
          parentUri: 'https://pod.example/',
          mimeType: 'inode/container',
          size: null,
          modifiedAt: '2026-03-04T10:00:00Z',
        },
        {
          id: 'https://pod.example/public/old.md',
          uri: 'https://pod.example/public/old.md',
          name: 'old.md',
          kind: 'resource',
          semanticKind: 'file',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/markdown',
          size: 100,
          modifiedAt: '2026-03-01T10:00:00Z',
        },
        {
          id: 'https://pod.example/public/new.md',
          uri: 'https://pod.example/public/new.md',
          name: 'new.md',
          kind: 'resource',
          semanticKind: 'file',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/markdown',
          size: 200,
          modifiedAt: '2026-03-03T10:00:00Z',
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<FilesListPane {...defaultProps} />)

    expect(screen.getByText('new.md')).toBeInTheDocument()
    expect(screen.getByText('old.md')).toBeInTheDocument()
    expect(screen.getByText('public')).toBeInTheDocument()
    expect(screen.getByText('最近文件')).toBeInTheDocument()
    expect(screen.getByText('/')).toBeInTheDocument()
    expect(screen.getAllByText('/public/')).toHaveLength(2)
  })

  it('marks entries whose metadata could not be read', () => {
    mockUseFilesEntries.mockReturnValue({
      data: [
        {
          id: 'https://pod.example/public/private.md',
          uri: 'https://pod.example/public/private.md',
          name: 'private.md',
          kind: 'resource',
          semanticKind: 'file',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/markdown',
          size: null,
          modifiedAt: null,
          metadataState: 'unavailable',
          metadataError: 'Forbidden',
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<FilesListPane {...defaultProps} />)

    expect(screen.getByText('private.md')).toBeInTheDocument()
    expect(screen.getByLabelText('元数据不可用')).toBeInTheDocument()
  })

  it('marks permission metadata failures with a permission-specific label', () => {
    mockUseFilesEntries.mockReturnValue({
      data: [
        {
          id: 'https://pod.example/public/private.md',
          uri: 'https://pod.example/public/private.md',
          name: 'private.md',
          kind: 'resource',
          semanticKind: 'file',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/markdown',
          size: null,
          modifiedAt: null,
          metadataState: 'unavailable',
          metadataErrorKind: 'forbidden',
          metadataError: 'HTTP 403',
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<FilesListPane {...defaultProps} />)

    expect(screen.getByText('private.md')).toBeInTheDocument()
    expect(screen.getByLabelText('无权限读取元数据')).toBeInTheDocument()
  })

  it('keeps structured and vocab resource names readable in the compact list', () => {
    mockUseFilesEntries.mockReturnValue({
      data: [
        {
          id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
          uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
          name: 'state.ttl',
          kind: 'resource',
          semanticKind: 'structured-data',
          parentUri: 'https://pod.example/.data/workspaces/ws-1/',
          mimeType: 'text/turtle',
          size: 128,
          modifiedAt: '2026-03-01T10:00:00Z',
        },
        {
          id: 'https://pod.example/.vocab/terms.ttl',
          uri: 'https://pod.example/.vocab/terms.ttl',
          name: 'terms.ttl',
          kind: 'resource',
          semanticKind: 'vocab-terms',
          parentUri: 'https://pod.example/.vocab/',
          mimeType: 'text/turtle',
          size: 256,
          modifiedAt: '2026-03-01T10:00:00Z',
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<FilesListPane {...defaultProps} />)

    expect(screen.getByText('state.ttl')).toBeInTheDocument()
    expect(screen.getByText('terms.ttl')).toBeInTheDocument()
    expect(screen.getByText('.data 表')).toBeInTheDocument()
    expect(screen.getByText('vocab terms')).toBeInTheDocument()
    expect(screen.queryByText('text/turtle')).not.toBeInTheDocument()
  })

  it('filters entries by search text', () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText('搜索当前范围...'), {
      target: { value: 'README' },
    })

    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.queryByText('config.json')).not.toBeInTheDocument()
  })

  it('filters entries by uri and mime text from the list search box', () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText('搜索当前范围...'), {
      target: { value: 'application/json' },
    })

    expect(screen.getByText('config.json')).toBeInTheDocument()
    expect(screen.queryByText('README.md')).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('搜索当前范围...'), {
      target: { value: 'public/README' },
    })

    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.queryByText('config.json')).not.toBeInTheDocument()
  })

  it('hides metadata and access sidecars from the ordinary file list', () => {
    mockUseFilesEntries.mockReturnValue({
      data: [
        {
          id: 'https://pod.example/public/README.md',
          uri: 'https://pod.example/public/README.md',
          name: 'README.md',
          kind: 'resource',
          semanticKind: 'file',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/markdown',
          size: 1024,
          modifiedAt: '2026-03-01T10:00:00Z',
        },
        {
          id: 'https://pod.example/public/README.md.meta',
          uri: 'https://pod.example/public/README.md.meta',
          name: 'README.md.meta',
          kind: 'resource',
          semanticKind: 'meta-sidecar',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/turtle',
          size: 128,
          modifiedAt: '2026-03-01T10:01:00Z',
        },
        {
          id: 'https://pod.example/public/README.md.acr',
          uri: 'https://pod.example/public/README.md.acr',
          name: 'README.md.acr',
          kind: 'resource',
          semanticKind: 'access-policy-sidecar',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/turtle',
          size: 96,
          modifiedAt: '2026-03-01T10:02:00Z',
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<FilesListPane {...defaultProps} />)

    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.queryByText('README.md.meta')).not.toBeInTheDocument()
    expect(screen.queryByText('README.md.acr')).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: '类型筛选' }))
    expect(screen.getByRole('menuitemradio', { name: 'text/markdown' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitemradio', { name: 'text/turtle' })).not.toBeInTheDocument()
  })

  it('hides filename sidecars even when raw entries have generic file semantics', () => {
    mockUseFilesEntries.mockReturnValue({
      data: [
        {
          id: 'https://pod.example/public/README.md',
          uri: 'https://pod.example/public/README.md',
          name: 'README.md',
          kind: 'resource',
          semanticKind: 'file',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/markdown',
          size: 1024,
          modifiedAt: '2026-03-01T10:00:00Z',
        },
        {
          id: 'https://pod.example/public/README.md.meta',
          uri: 'https://pod.example/public/README.md.meta',
          name: 'README.md.meta',
          kind: 'resource',
          semanticKind: 'file',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/turtle',
          size: 128,
          modifiedAt: '2026-03-01T10:01:00Z',
        },
        {
          id: 'https://pod.example/public/README.md.acl',
          uri: 'https://pod.example/public/README.md.acl',
          name: 'README.md.acl',
          kind: 'resource',
          semanticKind: 'file',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/turtle',
          size: 96,
          modifiedAt: '2026-03-01T10:02:00Z',
        },
        {
          id: 'https://pod.example/public/README.md.acr',
          uri: 'https://pod.example/public/README.md.acr',
          name: 'README.md.acr',
          kind: 'resource',
          semanticKind: 'file',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/turtle',
          size: 96,
          modifiedAt: '2026-03-01T10:03:00Z',
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<FilesListPane {...defaultProps} />)

    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.queryByText('README.md.meta')).not.toBeInTheDocument()
    expect(screen.queryByText('README.md.acl')).not.toBeInTheDocument()
    expect(screen.queryByText('README.md.acr')).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: '类型筛选' }))
    expect(screen.getByRole('menuitemradio', { name: 'text/markdown' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitemradio', { name: 'text/turtle' })).not.toBeInTheDocument()
  })

  it('filters entries by mime type from store state', () => {
    useFilesStore.setState({ mimeTypeFilter: 'text/markdown' })

    render(<FilesListPane {...defaultProps} />)

    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.queryByText('config.json')).not.toBeInTheDocument()
    expect(screen.queryByText('public')).not.toBeInTheDocument()
  })

  it('filters entries from the visible type menu and can clear it', () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '类型筛选' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'text/markdown' }))

    expect(useFilesStore.getState().mimeTypeFilter).toBe('text/markdown')
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.queryByText('config.json')).not.toBeInTheDocument()
    expect(screen.queryByText('public')).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: '类型筛选' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '全部类型' }))

    expect(useFilesStore.getState().mimeTypeFilter).toBeNull()
    expect(screen.getByText('public')).toBeInTheDocument()
    expect(screen.getByText('config.json')).toBeInTheDocument()
  })

  it('filters entries from the visible tag menu and can clear it', () => {
    render(<FilesListPane {...defaultProps} />)

    expect(screen.queryByText('当前话题')).not.toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: '标签筛选' }))
    expect(screen.queryByRole('menuitemradio', { name: '当前话题' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'docs' }))

    expect(useFilesStore.getState().tagFilter).toBe('docs')
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.queryByText('config.json')).not.toBeInTheDocument()
    expect(screen.queryByText('public')).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: '标签筛选' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '全部标签' }))

    expect(useFilesStore.getState().tagFilter).toBeNull()
    expect(screen.getByText('public')).toBeInTheDocument()
    expect(screen.getByText('config.json')).toBeInTheDocument()
  })

  it('combines mime type filtering with search text', () => {
    useFilesStore.setState({ mimeTypeFilter: 'application/json' })

    render(<FilesListPane {...defaultProps} />)

    expect(screen.getByText('config.json')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('搜索当前范围...'), {
      target: { value: 'README' },
    })

    expect(screen.getByText('没有匹配的资源')).toBeInTheDocument()
    expect(screen.queryByText('README.md')).not.toBeInTheDocument()
    expect(screen.queryByText('config.json')).not.toBeInTheDocument()
  })

  it('combines tag filtering with search text and mime type', () => {
    useFilesStore.setState({ tagFilter: 'config', mimeTypeFilter: 'application/json' })

    render(<FilesListPane {...defaultProps} />)

    expect(screen.getByText('config.json')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('搜索当前范围...'), {
      target: { value: 'README' },
    })

    expect(screen.getByText('没有匹配的资源')).toBeInTheDocument()
    expect(screen.queryByText('README.md')).not.toBeInTheDocument()
    expect(screen.queryByText('config.json')).not.toBeInTheDocument()
  })

  it('shows an actionable message when a container is forbidden', () => {
    mockUseFilesEntries.mockReturnValue({
      data: [],
      isLoading: false,
      error: new FilesResourceReadError('https://pod.example/private/', { status: 403 }),
    })

    render(<FilesListPane {...defaultProps} />)

    expect(screen.getByText('没有权限读取这个容器')).toBeInTheDocument()
    expect(screen.getByText('可以检查 ACL/ACR 权限，或切换到其它可浏览范围。')).toBeInTheDocument()
  })

  it('double-clicking a container enters that container', () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.doubleClick(screen.getByText('public'))

    expect(useFilesStore.getState().selectedTreeNodeId).toBe(createContainerNodeId('https://pod.example/public/'))
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
  })

  it('single-clicking a container selects it for folder detail without entering it', () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.click(screen.getByText('public'))

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
    expect(useFilesStore.getState().selectedTreeNodeId).toBe('all')
  })

  it('uses entry URI rather than presentation id for file selection', () => {
    mockUseFilesEntries.mockReturnValue({
      data: [
        {
          id: 'row:readme',
          uri: 'https://pod.example/public/README.md',
          name: 'README.md',
          kind: 'resource',
          semanticKind: 'file',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/markdown',
          size: 1024,
          modifiedAt: '2026-03-01T10:00:00Z',
        },
      ],
      isLoading: false,
      error: null,
    })
    render(<FilesListPane {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'README.md' }))

    expect(Array.from(useFilesStore.getState().selectedFileIds)).toEqual([
      'https://pod.example/public/README.md',
    ])
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/README.md')
  })

  it('single-clicking an editable file selects it and double-clicking requests its editor sheet', () => {
    render(<FilesListPane {...defaultProps} />)

    const readmeRow = screen.getByRole('button', { name: 'README.md' })
    fireEvent.click(readmeRow)

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/README.md')
    expect(useFilesStore.getState().detailTab).toBe('preview')
    expect(useFilesStore.getState().editableFileSheetOpenRequestUri).toBeNull()

    fireEvent.doubleClick(readmeRow)

    expect(useFilesStore.getState().editableFileSheetOpenRequestUri).toBe('https://pod.example/public/README.md')
  })

  it('tracks Cmd/Ctrl multi-selection in the main file list', () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'README.md' }), { metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'config.json' }), { ctrlKey: true })

    expect(Array.from(useFilesStore.getState().selectedFileIds)).toEqual([
      'https://pod.example/public/README.md',
      'https://pod.example/public/config.json',
    ])
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/config.json')
  })

  it('tracks Shift range selection in the main file list', () => {
    render(<FilesListPane {...defaultProps} />)

    const rows = screen.getAllByRole('button', { name: /public|README\.md|config\.json/ })
    fireEvent.click(rows[0])
    fireEvent.click(rows[rows.length - 1], { shiftKey: true })

    expect(useFilesStore.getState().selectedFileIds).toEqual(new Set([
      'https://pod.example/public/',
      'https://pod.example/public/README.md',
      'https://pod.example/public/config.json',
    ]))
    expect(useFilesStore.getState().selectedFileId).toBe(rows[rows.length - 1].getAttribute('aria-label') === 'public'
      ? 'https://pod.example/public/'
      : rows[rows.length - 1].getAttribute('aria-label') === 'README.md'
        ? 'https://pod.example/public/README.md'
        : 'https://pod.example/public/config.json')
  })

  it('clears main file list multi-selection on ordinary click', () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/public/config.json',
      selectedFileIds: new Set([
        'https://pod.example/public/README.md',
        'https://pod.example/public/config.json',
      ]),
    })
    render(<FilesListPane {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'README.md' }))

    expect(Array.from(useFilesStore.getState().selectedFileIds)).toEqual([
      'https://pod.example/public/README.md',
    ])
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/README.md')
  })

  it('copies selected main list file URIs from the batch toolbar', () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'README.md' }), { metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'config.json' }), { metaKey: true })

    expect(screen.getByText('已选择 2 项')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '复制所选 URI' }))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith([
      'https://pod.example/public/README.md',
      'https://pod.example/public/config.json',
    ].join('\n'))
  })

  it('deletes selected main list files from the batch toolbar', async () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'README.md' }), { metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'config.json' }), { metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: '删除所选项' }))

    expect(screen.getByRole('dialog', { name: '删除 2 项' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => {
      expect(mockDeleteFileResource).toHaveBeenCalledTimes(2)
    })
    expect(mockDeleteFileResource).toHaveBeenNthCalledWith(1, 'https://pod.example/public/README.md')
    expect(mockDeleteFileResource).toHaveBeenNthCalledWith(2, 'https://pod.example/public/config.json')
    expect(useFilesStore.getState().selectedFileIds.size).toBe(0)
    expect(useFilesStore.getState().selectedFileId).toBeNull()
    expect(mockToast).toHaveBeenCalledWith({ description: '已删除 2 项' })
  })

  it('keeps selected main list files and shows a toast when batch delete fails', async () => {
    mockDeleteFileResource.mockRejectedValueOnce(new Error('HTTP 403'))
    render(<FilesListPane {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'README.md' }), { metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'config.json' }), { metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: '删除所选项' }))
    fireEvent.click(screen.getByRole('button', { name: '删除' }))

    await waitFor(() => {
      expect(mockDeleteFileResource).toHaveBeenCalledTimes(1)
    })
    expect(useFilesStore.getState().selectedFileIds.size).toBe(2)
    expect(mockToast).toHaveBeenCalledWith({
      description: '删除失败：HTTP 403',
      variant: 'destructive',
    })
  })

  it('opens a single-item context menu from an unselected main list row', async () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'README.md' }), { metaKey: true })
    fireEvent.contextMenu(screen.getByRole('button', { name: 'public' }))

    expect(await screen.findByRole('menuitem', { name: '复制 URI' })).toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/README.md')

    fireEvent.click(screen.getByRole('menuitem', { name: '复制 URI' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://pod.example/public/')
    await waitFor(() => {
      expect(Array.from(useFilesStore.getState().selectedFileIds)).toEqual([
        'https://pod.example/public/README.md',
      ])
      expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/README.md')
    })
  })

  it('opens a rename operation for the right-click target without rewriting the active selection', async () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/public/README.md',
      selectedFileIds: new Set(['https://pod.example/public/README.md']),
    })
    render(<FilesListPane {...defaultProps} />)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'config.json' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '重命名' }))

    expect(await screen.findByLabelText('新名称')).toHaveValue('config.json')
    await waitFor(() => {
      expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/README.md')
      expect(useFilesStore.getState().selectedFileIds).toEqual(new Set(['https://pod.example/public/README.md']))
    })
  })

  it('defers unselected-row context menu selection until the menu closes', async () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/public/README.md',
      selectedFileIds: new Set(['https://pod.example/public/README.md']),
    })
    render(<FilesListPane {...defaultProps} />)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'config.json' }))

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/README.md')
    expect(useFilesStore.getState().selectedFileIds).toEqual(new Set(['https://pod.example/public/README.md']))
    expect(await screen.findByRole('menuitem', { name: '移动到...' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/config.json')
      expect(useFilesStore.getState().selectedFileIds).toEqual(new Set(['https://pod.example/public/config.json']))
    })
  })

  it('keeps the context menu open while deferring right-click selection until contextmenu dispatch', async () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/public/README.md',
      selectedFileIds: new Set(['https://pod.example/public/README.md']),
    })
    render(<FilesListPane {...defaultProps} />)

    const configRow = screen.getByRole('button', { name: 'config.json' })
    fireEvent.pointerDown(configRow, { button: 2, buttons: 2 })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/README.md')
    expect(useFilesStore.getState().selectedFileIds).toEqual(new Set(['https://pod.example/public/README.md']))

    fireEvent.contextMenu(configRow)

    expect(await screen.findByRole('menuitem', { name: '移动到...' })).toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/README.md')

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/config.json')
      expect(useFilesStore.getState().selectedFileIds).toEqual(new Set(['https://pod.example/public/config.json']))
    })
  })

  it('keeps multi-selection when opening a context menu on a selected main list row', async () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'README.md' }), { metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'config.json' }), { metaKey: true })
    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))

    expect(screen.getByText('已选择 2 项')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('menuitem', { name: '复制所选 URI' }))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith([
      'https://pod.example/public/README.md',
      'https://pod.example/public/config.json',
    ].join('\n'))

    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '删除所选项' }))
    fireEvent.click(await screen.findByRole('button', { name: '删除' }))

    await waitFor(() => {
      expect(mockDeleteFileResource).toHaveBeenCalledTimes(2)
    })
  })

  it('renames a single main list row from its context menu', async () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '重命名' }))
    const input = await screen.findByLabelText('新名称')
    fireEvent.change(input, { target: { value: 'README-renamed.md' } })
    fireEvent.click(screen.getByRole('button', { name: '重命名' }))

    await waitFor(() => {
      expect(mockMoveFileResource).toHaveBeenCalledWith({
        sourceUri: 'https://pod.example/public/README.md',
        destinationUri: 'https://pod.example/public/README-renamed.md',
      })
    })
    expect(mockToast).toHaveBeenCalledWith({ description: '重命名已开始' })
  })

  it('moves the active selection to the renamed uri after a successful main list rename', async () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/public/README.md',
      selectedFileIds: new Set(['https://pod.example/public/README.md']),
    })
    render(<FilesListPane {...defaultProps} />)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '重命名' }))
    fireEvent.change(await screen.findByLabelText('新名称'), {
      target: { value: 'README-renamed.md' },
    })
    fireEvent.click(screen.getByRole('button', { name: '重命名' }))

    await waitFor(() => {
      expect(mockMoveFileResource).toHaveBeenCalledWith({
        sourceUri: 'https://pod.example/public/README.md',
        destinationUri: 'https://pod.example/public/README-renamed.md',
      })
    })
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/README-renamed.md')
    expect(useFilesStore.getState().selectedFileIds).toEqual(new Set(['https://pod.example/public/README-renamed.md']))
  })

  it('does not rewrite an already single-selected row when opening its context menu', async () => {
    const selectedFileIds = new Set(['https://pod.example/public/README.md'])
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/public/README.md',
      selectedFileIds,
    })
    render(<FilesListPane {...defaultProps} />)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))

    expect(await screen.findByRole('menuitem', { name: '重命名' })).toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/README.md')
    expect(useFilesStore.getState().selectedFileIds).toBe(selectedFileIds)
  })

  it('confirms a rename operation with Enter from the operation input', async () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '重命名' }))
    const input = await screen.findByLabelText('新名称')

    fireEvent.change(input, { target: { value: 'README-enter.md' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockMoveFileResource).toHaveBeenCalledWith({
        sourceUri: 'https://pod.example/public/README.md',
        destinationUri: 'https://pod.example/public/README-enter.md',
      })
    })
  })

  it('validates main list rename input before moving the resource', async () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '重命名' }))
    const input = await screen.findByLabelText('新名称')

    fireEvent.change(input, { target: { value: 'config.json' } })
    expect(screen.getByText('当前文件夹已有同名资源')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重命名' })).toBeDisabled()

    fireEvent.change(input, { target: { value: '../escape.md' } })
    expect(screen.getByText('名称不能包含路径或离开当前文件夹')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重命名' })).toBeDisabled()

    fireEvent.change(input, { target: { value: 'README-renamed.md' } })
    expect(screen.queryByText('当前文件夹已有同名资源')).not.toBeInTheDocument()
    expect(screen.queryByText('名称不能包含路径或离开当前文件夹')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重命名' })).not.toBeDisabled()
    expect(mockMoveFileResource).not.toHaveBeenCalled()
  })

  it('closes the operation sheet with Escape without running the operation', async () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '移动到...' }))
    const dialog = await screen.findByRole('dialog', { name: '移动到' })

    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: '移动到' })).not.toBeInTheDocument()
    expect(mockMoveFileResource).not.toHaveBeenCalled()
  })

  it('copies and moves a single main list row from its context menu with Finder-style target paths', async () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '复制到...' }))
    expect(await screen.findByLabelText('目标路径')).toHaveValue('README copy.md')
    fireEvent.click(screen.getByRole('button', { name: '复制' }))
    await waitFor(() => {
      expect(mockCopyFileResource).toHaveBeenCalledWith({
        sourceUri: 'https://pod.example/public/README.md',
        destinationUri: 'https://pod.example/public/README%20copy.md',
      })
    })

    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '移动到...' }))
    fireEvent.change(await screen.findByLabelText('目标路径'), {
      target: { value: 'archive/' },
    })
    fireEvent.click(screen.getByRole('button', { name: '移动' }))
    await waitFor(() => {
      expect(mockMoveFileResource).toHaveBeenCalledWith({
        sourceUri: 'https://pod.example/public/README.md',
        destinationUri: 'https://pod.example/public/archive/README.md',
      })
    })
    expect(mockToast).toHaveBeenCalledWith({ description: '文件复制已开始' })
    expect(mockToast).toHaveBeenCalledWith({ description: '文件移动已开始' })
  })

  it('keeps main list copy and move inside the same Pod with sheet validation', async () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '移动到...' }))
    const input = await screen.findByLabelText('目标路径')

    fireEvent.change(input, { target: { value: 'https://other.example/public/README.md' } })

    expect(screen.getByText('只能移动到当前 Pod 内的位置')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移动' })).toBeDisabled()
    expect(mockMoveFileResource).not.toHaveBeenCalled()
  })

  it('double-clicking an editable file requests its editor sheet', () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.doubleClick(screen.getByText('README.md'))

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/README.md')
    expect(useFilesStore.getState().detailTab).toBe('preview')
    expect(useFilesStore.getState().editableFileSheetOpenRequestUri).toBe('https://pod.example/public/README.md')
  })

  it('selects a row with keyboard Space without entering containers', () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.keyDown(screen.getByRole('button', { name: /public/ }), { key: ' ' })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
    expect(useFilesStore.getState().selectedTreeNodeId).toBe('all')
  })

  it('opens a row with keyboard Enter using the same path as double click', () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.keyDown(screen.getByRole('button', { name: /public/ }), { key: 'Enter' })

    expect(useFilesStore.getState().selectedTreeNodeId).toBe(createContainerNodeId('https://pod.example/public/'))
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
  })

  it('clicking the name header updates sort field', () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.click(screen.getByText('名称'))

    expect(useFilesStore.getState().sortField).toBe('name')
  })

  it('keeps all sort fields available from the compact list toolbar', () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '排序' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '大小' }))
    expect(useFilesStore.getState().sortField).toBe('size')

    fireEvent.pointerDown(screen.getByRole('button', { name: '排序' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '升序' }))
    expect(useFilesStore.getState().sortDirection).toBe('asc')
  })

  it('shows local workspace empty state when current node is local', () => {
    mockUseSelectedFilesLocation.mockReturnValue({
      kind: 'local-workspace',
      localPath: '/repo/linx',
    })
    mockUseFilesEntries.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    })

    render(<FilesListPane {...defaultProps} />)

    expect(screen.getByText('当前话题绑定的是本地目录')).toBeInTheDocument()
    expect(screen.getByText(/\/repo\/linx 暂时不能/)).toBeInTheDocument()
  })
})
