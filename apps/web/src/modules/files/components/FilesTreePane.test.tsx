import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FilesTreePane } from '../features/tree/FilesTreePane'
import { useFilesStore } from '../app/store'

const mockUseFilesRootNodes = vi.fn()
const mockUseContainerChildTreeNodes = vi.fn()
const mockUseActiveFilesWorkspaceContext = vi.fn()
const mockUseFilesTreeSearchEntries = vi.fn()
const mockUseFilesContainerEntries = vi.fn()
const mockUseSelectedFilesLocation = vi.fn()
const mockFavoriteChange = vi.fn()

vi.mock('../data/queries', () => ({
  useFilesRootNodes: () => mockUseFilesRootNodes(),
  useContainerChildTreeNodes: (node: unknown) => mockUseContainerChildTreeNodes(node),
  useActiveFilesWorkspaceContext: () => mockUseActiveFilesWorkspaceContext(),
  useFilesTreeSearchEntries: (enabled: boolean) => mockUseFilesTreeSearchEntries(enabled),
  useFilesContainerEntries: (containerUri: string | null, enabled?: boolean) => mockUseFilesContainerEntries(containerUri, enabled),
  useSelectedFilesLocation: (selectedTreeNodeId: string | null) => mockUseSelectedFilesLocation(selectedTreeNodeId),
  useFilesFavoriteList: () => ({ data: [] }),
  filesFavoriteHooks: {
    onStarredChange: (...args: unknown[]) => mockFavoriteChange(...args),
  },
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
  useFilesStore.setState({
    selectedTreeNodeId: 'all',
    expandedTreeNodeIds: new Set(),
    selectedFileId: null,
    selectedFileIds: new Set(),
    searchText: '',
    sortField: 'modifiedAt',
    sortDirection: 'desc',
    mimeTypeFilter: null,
    tagFilter: null,
    detailTab: 'preview',
    editableFileSheetOpenRequestUri: null,
  })

  mockUseFilesTreeSearchEntries.mockReturnValue({ data: [], isLoading: false, error: null })
  mockUseFilesContainerEntries.mockReturnValue({ data: [], isLoading: false, error: null })
  mockUseSelectedFilesLocation.mockImplementation((selectedTreeNodeId: string | null) => {
    if (selectedTreeNodeId === 'workspace:https://pod.example/.data/workspaces/ws-1/') {
      return { kind: 'container', containerUri: 'https://pod.example/.data/workspaces/ws-1/' }
    }
    return { kind: 'all' }
  })

  mockUseActiveFilesWorkspaceContext.mockReturnValue({
    workspaceUri: 'https://pod.example/.data/workspaces/ws-1/',
    threadTitle: '代码审阅',
  })

  mockUseFilesRootNodes.mockReturnValue({
    data: {
      podRootUri: 'https://pod.example/',
      nodes: [
        { id: 'all', label: '全部可浏览资源', type: 'all', count: 3 },
        { id: 'smart-root:recent', label: '最近文件', type: 'recent', count: 2 },
        {
          id: 'workspace:https://pod.example/.data/workspaces/ws-1/',
          label: '当前话题容器',
          type: 'workspace',
          uri: 'https://pod.example/.data/workspaces/ws-1/',
          count: 1,
        },
        {
          id: 'pod-root',
          label: 'Pod 根目录',
          type: 'container',
          uri: 'https://pod.example/',
          count: 2,
        },
        {
          id: 'container:https://pod.example/.vocab/',
          label: '.vocab',
          type: 'container',
          uri: 'https://pod.example/.vocab/',
          count: 3,
        },
        {
          id: 'smart-root:agents',
          label: 'Agent homes',
          type: 'agents-root',
          uri: 'https://pod.example/.data/agents/',
          count: 1,
        },
        {
          id: 'smart-root:workspaces',
          label: 'Workspaces',
          type: 'workspaces-root',
          uri: 'https://pod.example/.data/workspaces/',
          count: 2,
        },
        {
          id: 'smart-root:repositories',
          label: 'Repositories',
          type: 'repositories-root',
          uri: 'https://pod.example/.data/repositories/',
          count: 0,
        },
      ],
    },
    isLoading: false,
    error: null,
  })

  mockUseContainerChildTreeNodes.mockImplementation((node: { id: string }) => {
    if (node.id === 'pod-root') {
      return {
        data: [
          {
            id: 'container:https://pod.example/public/',
            label: 'public',
            type: 'container',
            uri: 'https://pod.example/public/',
            parentId: 'pod-root',
          },
        ],
        isLoading: false,
      }
    }
    if (node.id === 'smart-root:workspaces') {
      return {
        data: [
          {
            id: 'container:https://pod.example/.data/workspaces/ws-1/',
            label: 'ws-1',
            type: 'container',
            uri: 'https://pod.example/.data/workspaces/ws-1/',
            parentId: 'smart-root:workspaces',
          },
        ],
        isLoading: false,
      }
    }
    if (node.id === 'container:https://pod.example/.vocab/') {
      return {
        data: [
          {
            id: 'resource:https://pod.example/.vocab/terms.ttl',
            label: 'terms.ttl',
            type: 'container',
            uri: 'https://pod.example/.vocab/terms.ttl',
            parentId: 'container:https://pod.example/.vocab/',
          },
          {
            id: 'resource:https://pod.example/.vocab/shapes.ttl',
            label: 'shapes.ttl',
            type: 'container',
            uri: 'https://pod.example/.vocab/shapes.ttl',
            parentId: 'container:https://pod.example/.vocab/',
          },
          {
            id: 'resource:https://pod.example/.vocab/namespaces.ttl',
            label: 'namespaces.ttl',
            type: 'container',
            uri: 'https://pod.example/.vocab/namespaces.ttl',
            parentId: 'container:https://pod.example/.vocab/',
          },
        ],
        isLoading: false,
      }
    }
    return { data: [], isLoading: false }
  })
})

const defaultProps = { paneId: 'tree', appId: 'files' }

describe('FilesTreePane', () => {
  it('renders real root nodes with the search and add header', () => {
    render(<FilesTreePane {...defaultProps} />)

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
    render(<FilesTreePane {...defaultProps} />)

    fireEvent.click(screen.getByText('当前话题容器'))

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('workspace:https://pod.example/.data/workspaces/ws-1/')
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/ws-1/')
  })

  it('selects root nodes with keyboard activation', () => {
    render(<FilesTreePane {...defaultProps} />)

    const workspaceNode = screen.getByRole('treeitem', { name: /当前话题容器/ })

    fireEvent.keyDown(workspaceNode, { key: 'Enter' })

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('workspace:https://pod.example/.data/workspaces/ws-1/')
  })

  it('uses roving focus and arrow navigation across visible tree items', () => {
    render(<FilesTreePane {...defaultProps} />)

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
    render(<FilesTreePane {...defaultProps} />)

    fireEvent.click(screen.getByText('最近文件'))

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('smart-root:recent')
    expect(useFilesStore.getState().selectedFileId).toBeNull()
  })

  it('expands pod root and renders child containers', () => {
    render(<FilesTreePane {...defaultProps} />)

    const rootLabel = screen.getByText('Pod 根目录')
    const expandButton = rootLabel.parentElement?.querySelector('button')
    expect(expandButton).toBeTruthy()

    fireEvent.click(expandButton!)

    expect(screen.getByText('public')).toBeInTheDocument()
  })

  it('selects an expanded child folder for the right-side preview', () => {
    render(<FilesTreePane {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: '展开 Pod 根目录' }))
    fireEvent.click(screen.getByRole('treeitem', { name: 'public' }))

    expect(useFilesStore.getState()).toMatchObject({
      selectedTreeNodeId: 'container:https://pod.example/public/',
      selectedFileId: 'https://pod.example/public/',
    })
    expect(useFilesStore.getState().editableFileSheetOpenRequestUri).toBeNull()
  })

  it('keeps resource actions on the selected tree row and opens sidecars from its menu', () => {
    render(<FilesTreePane {...defaultProps} />)

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
    render(<FilesTreePane {...defaultProps} />)

    expect(screen.getByRole('treeitem', { name: /全部可浏览资源/ }).className).toContain('h-7')
    expect(screen.getByRole('treeitem', { name: /当前话题容器/ }).className).toContain('h-7')
  })

  it('expands containers with an accessible keyboard toggle', () => {
    render(<FilesTreePane {...defaultProps} />)

    const expandButton = screen.getByRole('button', { name: '展开 Pod 根目录' })

    fireEvent.keyDown(expandButton, { key: ' ' })

    expect(screen.getByText('public')).toBeInTheDocument()
  })

  it('expands a path-backed smart root and renders child containers', () => {
    render(<FilesTreePane {...defaultProps} />)

    const workspacesLabel = screen.getByText('Workspaces')
    const expandButton = workspacesLabel.parentElement?.querySelector('button')
    expect(expandButton).toBeTruthy()

    fireEvent.click(expandButton!)

    expect(screen.getByText('ws-1')).toBeInTheDocument()
  })

  it('shows vocab as registry files without fake official folders or sidecars', () => {
    render(<FilesTreePane {...defaultProps} />)

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
    mockUseFilesTreeSearchEntries.mockReturnValue({
      data: [
        {
          id: 'https://pod.example/public/docs/report.md',
          uri: 'https://pod.example/public/docs/report.md',
          name: 'report.md',
          kind: 'resource',
          semanticKind: 'markdown',
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
          semanticKind: 'text',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/plain',
          size: 5,
          modifiedAt: null,
        },
      ],
      isLoading: false,
      error: null,
    })
    render(<FilesTreePane {...defaultProps} />)

    fireEvent.change(screen.getByRole('textbox', { name: '搜索文件树' }), { target: { value: 'report' } })

    expect(mockUseFilesTreeSearchEntries).toHaveBeenCalledWith(true)
    expect(screen.getByText('report.md')).toBeInTheDocument()
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument()
    expect(screen.queryByText('全部可浏览资源')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('report.md'))

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('resource:https://pod.example/public/docs/report.md')
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/docs/report.md')
  })

  it('opens a container search result as a folder selection', () => {
    mockUseFilesTreeSearchEntries.mockReturnValue({
      data: [
        {
          id: 'https://pod.example/public/docs/',
          uri: 'https://pod.example/public/docs/',
          name: 'docs',
          kind: 'container',
          semanticKind: 'folder',
          parentUri: 'https://pod.example/public/',
          mimeType: null,
          size: null,
          modifiedAt: null,
        },
      ],
      isLoading: false,
      error: null,
    })
    render(<FilesTreePane {...defaultProps} />)

    fireEvent.change(screen.getByRole('textbox', { name: '搜索文件树' }), { target: { value: 'docs' } })
    fireEvent.click(screen.getByText('docs'))

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('container:https://pod.example/public/docs/')
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/docs/')
  })

  it('shows the empty search hint and clears the query with escape', () => {
    render(<FilesTreePane {...defaultProps} />)

    const input = screen.getByRole('textbox', { name: '搜索文件树' })
    fireEvent.change(input, { target: { value: 'missing' } })

    expect(screen.getByText('没有匹配“missing”的资源')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByText('没有匹配“missing”的资源')).not.toBeInTheDocument()
    expect(screen.getByText('全部可浏览资源')).toBeInTheDocument()
  })

  it('targets the selected container with the add menu', () => {
    render(<FilesTreePane {...defaultProps} />)

    expect(mockUseFilesContainerEntries).toHaveBeenLastCalledWith(
      null,
      false,
    )

    fireEvent.click(screen.getByText('当前话题容器'))

    expect(screen.getByRole('button', { name: '添加' })).toHaveAttribute(
      'data-add-container',
      'https://pod.example/.data/workspaces/ws-1/',
    )

    fireEvent.click(screen.getByRole('button', { name: '添加' }))

    expect(mockUseFilesContainerEntries).toHaveBeenLastCalledWith(
      'https://pod.example/.data/workspaces/ws-1/',
      true,
    )
  })

  it('shows loading state while root nodes are loading', () => {
    mockUseFilesRootNodes.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    })

    render(<FilesTreePane {...defaultProps} />)

    expect(screen.getByRole('status', { name: '正在加载容器…' })).toBeInTheDocument()
  })
})
