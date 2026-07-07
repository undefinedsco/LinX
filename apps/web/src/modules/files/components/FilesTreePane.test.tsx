import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FilesTreePane } from '../features/tree/FilesTreePane'
import { useFilesStore } from '../app/store'

const mockUseFilesRootNodes = vi.fn()
const mockUseContainerChildTreeNodes = vi.fn()
const mockUseActiveFilesWorkspaceContext = vi.fn()

vi.mock('../data/queries', () => ({
  useFilesRootNodes: () => mockUseFilesRootNodes(),
  useContainerChildTreeNodes: (node: unknown) => mockUseContainerChildTreeNodes(node),
  useActiveFilesWorkspaceContext: () => mockUseActiveFilesWorkspaceContext(),
}))

beforeEach(() => {
  useFilesStore.setState({
    selectedTreeNodeId: 'all',
    expandedTreeNodeIds: new Set(),
    resourceRailCollapsed: false,
    selectedFileId: null,
    selectedFileIds: new Set(),
    searchText: '',
    sortField: 'modifiedAt',
    sortDirection: 'desc',
    mimeTypeFilter: null,
    tagFilter: null,
    detailTab: 'preview',
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
  it('renders real root nodes and current thread summary', () => {
    render(<FilesTreePane {...defaultProps} />)

    expect(screen.getByText('全部可浏览资源')).toBeInTheDocument()
    expect(screen.getByText('最近文件')).toBeInTheDocument()
    expect(screen.getByText('当前话题容器')).toBeInTheDocument()
    expect(screen.getByText('Pod 根目录')).toBeInTheDocument()
    expect(screen.getByText('Agent homes')).toBeInTheDocument()
    expect(screen.getByText('Workspaces')).toBeInTheDocument()
    expect(screen.getByText('Repositories')).toBeInTheDocument()
    expect(screen.getByText('当前话题：代码审阅')).toBeInTheDocument()
  })

  it('selects a root node on click', () => {
    render(<FilesTreePane {...defaultProps} />)

    fireEvent.click(screen.getByText('当前话题容器'))

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('workspace:https://pod.example/.data/workspaces/ws-1/')
  })

  it('selects root nodes with keyboard activation', () => {
    render(<FilesTreePane {...defaultProps} />)

    const workspaceNode = screen.getByRole('treeitem', { name: /当前话题容器/ })

    fireEvent.keyDown(workspaceNode, { key: 'Enter' })

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('workspace:https://pod.example/.data/workspaces/ws-1/')
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

  it('collapses the resource tree into a narrow semantic rail', () => {
    render(<FilesTreePane {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: '收起资源栏' }))

    expect(useFilesStore.getState().resourceRailCollapsed).toBe(true)
    expect(screen.queryByText('资源范围')).not.toBeInTheDocument()
    expect(screen.queryByText('当前话题：代码审阅')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开资源栏' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: '全部可浏览资源' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: '最近文件' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: '当前话题容器' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '展开资源栏' }))

    expect(useFilesStore.getState().resourceRailCollapsed).toBe(false)
    expect(screen.getByText('资源范围')).toBeInTheDocument()
    expect(screen.getByText('当前话题：代码审阅')).toBeInTheDocument()
  })

  it('shows loading state while root nodes are loading', () => {
    mockUseFilesRootNodes.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    })

    render(<FilesTreePane {...defaultProps} />)

    expect(screen.getByText('正在加载容器…')).toBeInTheDocument()
  })
})
