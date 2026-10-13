import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FilesTreePane } from '../features/tree/FilesTreePane'
import { useFilesStore } from '../app/store'
import type { FilesEntry, FilesRootData } from '../domain/resource/resource-model'

const { filesFixtures, mockFavoriteChange } = vi.hoisted(() => ({
  filesFixtures: {
    podRootUri: 'https://pod.example/',
    workspaceUri: 'https://pod.example/.data/workspaces/ws-1/',
    rootData: null as FilesRootData | null,
    rootLoading: false,
    entries: [] as FilesEntry[],
    searchEntries: [] as FilesEntry[],
    containerEntries: {} as Record<string, FilesEntry[]>,
    queryCalls: [] as Array<{ type: string; containerUri?: string | null }>,
  },
  mockFavoriteChange: vi.fn(),
}))

function createQueryOptions<T>(queryKey: readonly unknown[], data: T, enabled = true) {
  return {
    queryKey,
    queryFn: async () => data,
    enabled,
    staleTime: Infinity,
    initialData: data,
  }
}

// Keep the production query hooks in this test. Only the collection boundary is
// backed by deterministic Pod-shaped data, so the test exercises query selection,
// initial-data hydration, loading state, and tree projection together.
vi.mock('../data/collections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/collections')>()
  return {
    ...actual,
    filesResourceQueryCollection: {
      ...actual.filesResourceQueryCollection,
      resolveCurrentPodRootUri: () => filesFixtures.podRootUri,
      roots: () => {
        const options = createQueryOptions(['files', 'roots', filesFixtures.workspaceUri], filesFixtures.rootData)
        if (filesFixtures.rootLoading) delete options.initialData
        return options
      },
      containerEntries: ({ containerUri }: { containerUri?: string | null }) => {
        filesFixtures.queryCalls.push({ type: 'containerEntries', containerUri })
        const data = containerUri ? filesFixtures.containerEntries[containerUri] ?? [] : []
        return createQueryOptions(['files', 'container-entries', containerUri ?? ''], data, !!containerUri)
      },
      entries: () => {
        const options = createQueryOptions(['files', 'entries', 'all'], filesFixtures.entries)
        if (filesFixtures.rootLoading) delete options.initialData
        return options
      },
      treeSearchEntries: () => createQueryOptions(['files', 'tree-search', filesFixtures.workspaceUri], filesFixtures.searchEntries),
    },
  }
})

vi.mock('../data/queries/chat-source-queries', () => ({
  useActiveFilesWorkspaceContext: () => ({
    chatId: 'chat-1',
    threadId: 'thread-1',
    workspaceUri: filesFixtures.workspaceUri,
    threadTitle: '代码审阅',
  }),
  useFilesChatMessages: () => ({ data: [], isLoading: false, error: null }),
}))

vi.mock('../data/queries/favorite-queries', () => ({
  useFilesFavoriteList: () => ({ data: [] }),
  filesFavoriteHooks: {
    onStarredChange: (...args: unknown[]) => mockFavoriteChange(...args),
  },
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({ db: { id: 'files-tree-test-db' } }),
}))

vi.mock('../data/queries/agent-name-queries', () => ({
  useFilesAgentNames: () => ({ main: 'LinX 助手', helper: 'Reviewer' }),
}))

vi.mock('../features/add/FilesAddMenu', () => ({
  FilesAddMenu: ({
    containerUri,
    onOpenChange,
  }: {
    containerUri: string | null
    onOpenChange: (open: boolean) => void
  }) => (
    <button
      type="button"
      aria-label="添加"
      data-add-container={containerUri ?? ''}
      onClick={() => onOpenChange(true)}
    />
  ),
}))

beforeEach(() => {
  const podRootUri = filesFixtures.podRootUri
  const workspaceUri = filesFixtures.workspaceUri
  const makeEntry = (entry: FilesEntry) => entry

  const container = (uri: string, name: string, parentUri: string): FilesEntry => makeEntry({
    id: uri, uri, name, kind: 'container', semanticKind: 'container', parentUri, mimeType: null, size: null, modifiedAt: null,
  })
  const file = (uri: string, name: string, parentUri: string, semanticKind: FilesEntry['semanticKind'] = 'file'): FilesEntry => makeEntry({
    id: uri, uri, name, kind: 'resource', semanticKind, parentUri, mimeType: 'text/turtle', size: 1, modifiedAt: null,
  })
  const vocabUri = `${podRootUri}.vocab/`
  const mainHome = `${podRootUri}.data/agents/main/`
  const helperHome = `${podRootUri}.data/agents/helper/`
  filesFixtures.entries = [
    container(`${podRootUri}public/`, 'public', podRootUri),
    container(vocabUri, '.vocab', podRootUri),
    container(`${podRootUri}.data/agents/`, 'agents', podRootUri),
    file(`${podRootUri}readme.md`, 'readme.md', podRootUri),
  ]
  filesFixtures.searchEntries = [...filesFixtures.entries]
  filesFixtures.containerEntries = {
    [`${podRootUri}public/`]: [
      container(`${podRootUri}public/docs/`, 'docs', `${podRootUri}public/`),
      file(`${podRootUri}public/notes.txt`, 'notes.txt', `${podRootUri}public/`),
    ],
    [vocabUri]: ['terms.ttl', 'shapes.ttl', 'namespaces.ttl'].map((name) => file(
      `${vocabUri}${name}`,
      name,
      vocabUri,
      name === 'terms.ttl' ? 'vocab-terms' : name === 'shapes.ttl' ? 'vocab-shapes' : 'vocab-namespaces',
    )),
    [`${podRootUri}.data/agents/`]: [
      container(mainHome, 'main', `${podRootUri}.data/agents/`),
      container(helperHome, 'helper', `${podRootUri}.data/agents/`),
    ],
    [mainHome]: [file(`${mainHome}notes.md`, 'notes.md', mainHome)],
    [helperHome]: [],
  }
  filesFixtures.rootData = {
    podRootUri,
    entries: filesFixtures.entries,
    nodes: [{ id: 'all', label: '全部可浏览资源', type: 'all', count: 4 }],
  }
  filesFixtures.queryCalls = []
  filesFixtures.rootLoading = false
  mockFavoriteChange.mockReset()

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
    sidecarActionRequest: null,
    folderHistory: [],
  })
})

const defaultProps = { paneId: 'tree', appId: 'files' }

function renderTreePane() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false, refetchOnWindowFocus: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <FilesTreePane {...defaultProps} />
    </QueryClientProvider>,
  )
}

function expandFolder(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `展开 ${name}` }))
}

describe('FilesTreePane', () => {
  it('shows search, add menu and the 我的空间 / 共享给我 groups without the old roots', () => {
    renderTreePane()

    expect(screen.getByRole('textbox', { name: '搜索文件树' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加' })).toBeInTheDocument()
    expect(screen.getByText('我的空间')).toBeInTheDocument()
    expect(screen.getByText('共享给我')).toBeInTheDocument()
    expect(screen.queryByText('全部可浏览资源')).not.toBeInTheDocument()
    expect(screen.queryByText('最近文件')).not.toBeInTheDocument()
  })

  it('lists folders only at the root: no leaf files', () => {
    renderTreePane()

    expect(screen.getByRole('treeitem', { name: 'public' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: '词表' })).toBeInTheDocument()
    expect(screen.queryByText('readme.md')).not.toBeInTheDocument()
  })

  it('selects a folder for the workspace table and expands it, hiding leaf files', () => {
    renderTreePane()

    fireEvent.click(screen.getByRole('treeitem', { name: 'public' }))

    expect(useFilesStore.getState()).toMatchObject({
      selectedTreeNodeId: 'container:https://pod.example/public/',
      selectedFileId: 'https://pod.example/public/',
    })
    expect(screen.getByRole('treeitem', { name: 'docs' })).toBeInTheDocument()
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument()
  })

  it('shows 词表 with 属性 / 类型 / 命名空间', () => {
    renderTreePane()

    expandFolder('词表')

    expect(screen.getByRole('treeitem', { name: '属性' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: '类型' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: '命名空间' })).toBeInTheDocument()
    expect(screen.queryByText('terms.ttl')).not.toBeInTheDocument()
  })

  it('names assistant folders by the assistant with 授权 and 记住的 inside', () => {
    renderTreePane()

    expandFolder('agents')
    expect(screen.getByRole('treeitem', { name: 'LinX 助手' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: 'Reviewer' })).toBeInTheDocument()
    expandFolder('LinX 助手')

    expect(screen.getByRole('treeitem', { name: '授权' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: '记住的' })).toBeInTheDocument()
    expect(screen.queryByText('notes.md')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('treeitem', { name: '授权' }))
    expect(useFilesStore.getState().selectedFileId).toBe('linx://view/grants/main')
  })

  it('renders tree rows at the compact 28px rhythm', () => {
    renderTreePane()

    expect(screen.getByRole('treeitem', { name: 'public' }).className).toContain('h-7')
  })

  it('keeps recent and leaf files reachable through flat search results', () => {
    filesFixtures.searchEntries = [
      {
        id: 'https://pod.example/public/docs/report.md',
        uri: 'https://pod.example/public/docs/report.md',
        name: 'report.md',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/public/docs/',
        mimeType: 'text/markdown',
        size: 12,
        modifiedAt: null,
      },
    ]
    renderTreePane()

    fireEvent.change(screen.getByRole('textbox', { name: '搜索文件树' }), { target: { value: 'report' } })
    expect(screen.queryByText('我的空间')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('report.md'))

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('resource:https://pod.example/public/docs/report.md')
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/docs/report.md')
  })

  it('opens a container search result as a folder selection', () => {
    filesFixtures.searchEntries = [{
      id: 'https://pod.example/public/docs/',
      uri: 'https://pod.example/public/docs/',
      name: 'docs',
      kind: 'container',
      semanticKind: 'container',
      parentUri: 'https://pod.example/public/',
      mimeType: null,
      size: null,
      modifiedAt: null,
    }]
    renderTreePane()

    fireEvent.change(screen.getByRole('textbox', { name: '搜索文件树' }), { target: { value: 'docs' } })
    fireEvent.click(screen.getByText('docs'))

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('container:https://pod.example/public/docs/')
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/docs/')
  })

  it('shows the empty search hint and clears the query with escape', () => {
    renderTreePane()

    const input = screen.getByRole('textbox', { name: '搜索文件树' })
    fireEvent.change(input, { target: { value: 'missing' } })
    expect(screen.getByText('没有匹配“missing”的资源')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByText('没有匹配“missing”的资源')).not.toBeInTheDocument()
    expect(screen.getByText('我的空间')).toBeInTheDocument()
  })

  it('targets the selected container with the add menu', () => {
    renderTreePane()

    fireEvent.click(screen.getByRole('treeitem', { name: 'public' }))

    expect(screen.getByRole('button', { name: '添加' })).toHaveAttribute(
      'data-add-container',
      'https://pod.example/public/',
    )
  })

  it('shows loading state while root entries are loading', () => {
    filesFixtures.rootLoading = true
    renderTreePane()

    expect(screen.getByRole('status', { name: '正在加载容器…' })).toBeInTheDocument()
  })
})
