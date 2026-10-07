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
      entries: () => createQueryOptions(['files', 'entries', 'all'], filesFixtures.entries),
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

  filesFixtures.entries = [
    makeEntry({
      id: `${podRootUri}public/`,
      uri: `${podRootUri}public/`,
      name: 'public',
      kind: 'container',
      semanticKind: 'container',
      parentUri: podRootUri,
      mimeType: null,
      size: null,
      modifiedAt: null,
    }),
    makeEntry({
      id: `${podRootUri}public/notes.txt`,
      uri: `${podRootUri}public/notes.txt`,
      name: 'notes.txt',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: `${podRootUri}public/`,
      mimeType: 'text/plain',
      size: 5,
      modifiedAt: null,
    }),
  ]
  filesFixtures.searchEntries = [...filesFixtures.entries]
  filesFixtures.containerEntries = {
    [podRootUri]: [
      makeEntry({
        id: `${podRootUri}public/`,
        uri: `${podRootUri}public/`,
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: podRootUri,
        mimeType: null,
        size: null,
        modifiedAt: null,
      }),
      makeEntry({
        id: `${podRootUri}.vocab/`,
        uri: `${podRootUri}.vocab/`,
        name: '.vocab',
        kind: 'container',
        semanticKind: 'container',
        parentUri: podRootUri,
        mimeType: null,
        size: null,
        modifiedAt: null,
      }),
    ],
    [`${podRootUri}.vocab/`]: [
      ...['terms.ttl', 'shapes.ttl', 'namespaces.ttl'].map((name) => makeEntry({
        id: `${podRootUri}.vocab/${name}`,
        uri: `${podRootUri}.vocab/${name}`,
        name,
        kind: 'resource',
        semanticKind: name === 'terms.ttl'
          ? 'vocab-terms'
          : name === 'shapes.ttl'
            ? 'vocab-shapes'
            : 'vocab-namespaces',
        parentUri: `${podRootUri}.vocab/`,
        mimeType: 'text/turtle',
        size: 1,
        modifiedAt: null,
      })),
    ],
    [`${podRootUri}.data/workspaces/`]: [
      makeEntry({
        id: workspaceUri,
        uri: workspaceUri,
        name: 'ws-1',
        kind: 'container',
        semanticKind: 'container',
        parentUri: `${podRootUri}.data/workspaces/`,
        mimeType: null,
        size: null,
        modifiedAt: null,
      }),
    ],
  }
  filesFixtures.rootData = {
    podRootUri,
    entries: filesFixtures.entries,
    nodes: [
      { id: 'all', label: '全部可浏览资源', type: 'all', count: 3 },
      { id: 'smart-root:recent', label: '最近文件', type: 'recent', count: 2 },
      {
        id: `workspace:${workspaceUri}`,
        label: '当前话题容器',
        type: 'workspace',
        uri: workspaceUri,
        count: 1,
      },
      {
        id: 'pod-root',
        label: 'Pod 根目录',
        type: 'container',
        uri: podRootUri,
        count: 2,
      },
      {
        id: `container:${podRootUri}.vocab/`,
        label: '.vocab',
        type: 'container',
        uri: `${podRootUri}.vocab/`,
        count: 3,
      },
      {
        id: 'smart-root:agents',
        label: 'Agent homes',
        type: 'agents-root',
        uri: `${podRootUri}.data/agents/`,
        count: 1,
      },
      {
        id: 'smart-root:workspaces',
        label: 'Workspaces',
        type: 'workspaces-root',
        uri: `${podRootUri}.data/workspaces/`,
        count: 2,
      },
      {
        id: 'smart-root:repositories',
        label: 'Repositories',
        type: 'repositories-root',
        uri: `${podRootUri}.data/repositories/`,
        count: 0,
      },
    ],
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

describe('FilesTreePane', () => {
  it('renders real root nodes with the search and add header', () => {
    renderTreePane()

    expect(screen.getByRole('textbox', { name: '搜索文件树' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加' })).toBeInTheDocument()
    expect(screen.queryByText('资源范围')).not.toBeInTheDocument()
    expect(screen.getByText('全部可浏览资源')).toBeInTheDocument()
    expect(screen.getByText('最近文件')).toBeInTheDocument()
    expect(screen.getByText('当前话题容器')).toBeInTheDocument()
    expect(screen.getByText('Pod 根目录')).toBeInTheDocument()
    expect(screen.getByText('Agent homes')).toBeInTheDocument()
    expect(screen.getByText('Workspaces')).toBeInTheDocument()
    expect(screen.getByText('Repositories')).toBeInTheDocument()
  })

  it('selects a root container and its right-side folder preview on click', () => {
    renderTreePane()

    fireEvent.click(screen.getByText('当前话题容器'))

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('workspace:https://pod.example/.data/workspaces/ws-1/')
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/ws-1/')
  })

  it('selects root nodes with keyboard activation', () => {
    renderTreePane()

    const workspaceNode = screen.getByRole('treeitem', { name: /当前话题容器/ })

    fireEvent.keyDown(workspaceNode, { key: 'Enter' })

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('workspace:https://pod.example/.data/workspaces/ws-1/')
  })

  it('uses roving focus and arrow navigation across visible tree items', () => {
    renderTreePane()

    const allNode = screen.getByRole('treeitem', { name: /全部可浏览资源/ })
    const recentNode = screen.getByRole('treeitem', { name: /最近文件/ })
    const repositoryNode = screen.getByRole('treeitem', { name: /Repositories/ })

    expect(allNode).toHaveAttribute('tabindex', '0')
    expect(recentNode).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('button', { name: '展开 Pod 根目录' })).toHaveAttribute('tabindex', '-1')

    allNode.focus()
    fireEvent.keyDown(allNode, { key: 'ArrowDown' })
    expect(recentNode).toHaveFocus()

    fireEvent.keyDown(recentNode, { key: 'End' })
    expect(repositoryNode).toHaveFocus()
  })

  it('selects the recent files smart root on click', () => {
    renderTreePane()

    fireEvent.click(screen.getByText('最近文件'))

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('smart-root:recent')
    expect(useFilesStore.getState().selectedFileId).toBeNull()
  })

  it('expands pod root and renders child containers', () => {
    renderTreePane()

    const rootLabel = screen.getByText('Pod 根目录')
    const expandButton = rootLabel.parentElement?.querySelector('button')
    expect(expandButton).toBeTruthy()

    fireEvent.click(expandButton!)

    expect(screen.getByText('public')).toBeInTheDocument()
  })

  it('selects an expanded child folder for the right-side preview', () => {
    renderTreePane()

    fireEvent.click(screen.getByRole('button', { name: '展开 Pod 根目录' }))
    fireEvent.click(screen.getByRole('treeitem', { name: 'public' }))

    expect(useFilesStore.getState()).toMatchObject({
      selectedTreeNodeId: 'container:https://pod.example/public/',
      selectedFileId: 'https://pod.example/public/',
    })
    expect(useFilesStore.getState().editableFileSheetOpenRequestUri).toBeNull()
  })

  it('keeps resource actions on the selected tree row and opens sidecars from its menu', () => {
    renderTreePane()

    fireEvent.click(screen.getByRole('button', { name: '展开 Pod 根目录' }))
    fireEvent.click(screen.getByRole('treeitem', { name: 'public' }))

    expect(screen.getByRole('button', { name: '收藏 public' })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: '更多 public 操作' }), { button: 0 })
    fireEvent.click(screen.getByRole('menuitem', { name: '查看 .meta' }))

    expect(useFilesStore.getState().sidecarActionRequest).toEqual({
      uri: 'https://pod.example/public/',
      action: 'meta',
    })
  })

  it('renders resource tree rows at the compact 28px shell rhythm', () => {
    renderTreePane()

    expect(screen.getByRole('treeitem', { name: /全部可浏览资源/ }).className).toContain('h-7')
    expect(screen.getByRole('treeitem', { name: /当前话题容器/ }).className).toContain('h-7')
  })

  it('expands containers with an accessible keyboard toggle', () => {
    renderTreePane()

    const expandButton = screen.getByRole('button', { name: '展开 Pod 根目录' })

    fireEvent.keyDown(expandButton, { key: ' ' })

    expect(screen.getByText('public')).toBeInTheDocument()
  })

  it('expands a path-backed smart root and renders child containers', () => {
    renderTreePane()

    const workspacesLabel = screen.getByText('Workspaces')
    const expandButton = workspacesLabel.parentElement?.querySelector('button')
    expect(expandButton).toBeTruthy()

    fireEvent.click(expandButton!)

    expect(screen.getByText('ws-1')).toBeInTheDocument()
  })

  it('shows vocab as registry files without fake official folders or sidecars', () => {
    renderTreePane()

    const vocabLabel = screen.getByText('.vocab')
    const expandButton = vocabLabel.parentElement?.querySelector('button')
    expect(expandButton).toBeTruthy()

    fireEvent.click(expandButton!)

    expect(screen.getByText('terms.ttl')).toBeInTheDocument()
    expect(screen.getByText('shapes.ttl')).toBeInTheDocument()
    expect(screen.getByText('namespaces.ttl')).toBeInTheDocument()
    expect(screen.queryByText('official')).not.toBeInTheDocument()
    expect(screen.queryByText('personal')).not.toBeInTheDocument()
    expect(screen.queryByText('.meta')).not.toBeInTheDocument()
    expect(screen.queryByText('.acl')).not.toBeInTheDocument()
    expect(screen.queryByText('.acr')).not.toBeInTheDocument()
  })

  it('filters the tree into flat recursive search results and opens a match', () => {
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
        {
          id: 'https://pod.example/public/notes.txt',
          uri: 'https://pod.example/public/notes.txt',
          name: 'notes.txt',
          kind: 'resource',
          semanticKind: 'file',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/plain',
          size: 5,
          modifiedAt: null,
        },
    ]
    renderTreePane()

    fireEvent.change(screen.getByRole('textbox', { name: '搜索文件树' }), { target: { value: 'report' } })

    expect(screen.getByText('report.md')).toBeInTheDocument()
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument()
    expect(screen.queryByText('全部可浏览资源')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('report.md'))

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('resource:https://pod.example/public/docs/report.md')
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/docs/report.md')
  })

  it('opens a container search result as a folder selection', () => {
    filesFixtures.searchEntries = [
        {
          id: 'https://pod.example/public/docs/',
          uri: 'https://pod.example/public/docs/',
          name: 'docs',
          kind: 'container',
          semanticKind: 'container',
          parentUri: 'https://pod.example/public/',
          mimeType: null,
          size: null,
          modifiedAt: null,
        },
    ]
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
    expect(screen.getByText('全部可浏览资源')).toBeInTheDocument()
  })

  it('targets the selected container with the add menu', () => {
    renderTreePane()

    fireEvent.click(screen.getByText('当前话题容器'))

    expect(screen.getByRole('button', { name: '添加' })).toHaveAttribute(
      'data-add-container',
      'https://pod.example/.data/workspaces/ws-1/',
    )

    fireEvent.click(screen.getByRole('button', { name: '添加' }))

    expect(filesFixtures.queryCalls).toContainEqual({
      type: 'containerEntries',
      containerUri: 'https://pod.example/.data/workspaces/ws-1/',
    })
  })

  it('shows loading state while root nodes are loading', () => {
    filesFixtures.rootLoading = true
    renderTreePane()

    expect(screen.getByRole('status', { name: '正在加载容器…' })).toBeInTheDocument()
  })
})
