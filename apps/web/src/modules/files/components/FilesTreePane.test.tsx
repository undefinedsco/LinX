import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FilesTreePane } from './FilesTreePane'
import { useFilesStore } from '../store'

const mockUseFilesRootNodes = vi.fn()
const mockUseContainerChildTreeNodes = vi.fn()
const mockUseActiveFilesWorkspaceContext = vi.fn()

vi.mock('../queries', () => ({
  useFilesRootNodes: () => mockUseFilesRootNodes(),
  useContainerChildTreeNodes: (node: unknown) => mockUseContainerChildTreeNodes(node),
  useActiveFilesWorkspaceContext: () => mockUseActiveFilesWorkspaceContext(),
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
    return { data: [], isLoading: false }
  })
})

const defaultProps = { paneId: 'tree', appId: 'files' }

describe('FilesTreePane', () => {
  it('renders real root nodes and current thread summary', () => {
    render(<FilesTreePane {...defaultProps} />)

    expect(screen.getByText('全部可浏览资源')).toBeInTheDocument()
    expect(screen.getByText('当前话题容器')).toBeInTheDocument()
    expect(screen.getByText('Pod 根目录')).toBeInTheDocument()
    expect(screen.getByText('当前话题：代码审阅')).toBeInTheDocument()
  })

  it('selects a root node on click', () => {
    render(<FilesTreePane {...defaultProps} />)

    fireEvent.click(screen.getByText('当前话题容器'))

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('workspace:https://pod.example/.data/workspaces/ws-1/')
  })

  it('expands pod root and renders child containers', () => {
    render(<FilesTreePane {...defaultProps} />)

    const rootLabel = screen.getByText('Pod 根目录')
    const expandButton = rootLabel.parentElement?.querySelector('button')
    expect(expandButton).toBeTruthy()

    fireEvent.click(expandButton!)

    expect(screen.getByText('public')).toBeInTheDocument()
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
