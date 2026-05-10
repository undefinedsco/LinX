import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FilesListPane } from './FilesListPane'
import { createContainerNodeId } from '../browser'
import { useFilesStore } from '../store'

const mockUseFilesEntries = vi.fn()
const mockUseSelectedFilesLocation = vi.fn()

vi.mock('../queries', () => ({
  useFilesEntries: () => mockUseFilesEntries(),
  useSelectedFilesLocation: () => mockUseSelectedFilesLocation(),
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

  mockUseSelectedFilesLocation.mockReturnValue({ kind: 'all' })
  mockUseFilesEntries.mockReturnValue({
    data: [
      {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
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
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/markdown',
        size: 1024,
        modifiedAt: '2026-03-01T10:00:00Z',
        sourceLabel: '当前话题',
      },
      {
        id: 'https://pod.example/public/config.json',
        uri: 'https://pod.example/public/config.json',
        name: 'config.json',
        kind: 'resource',
        parentUri: 'https://pod.example/public/',
        mimeType: 'application/json',
        size: 512,
        modifiedAt: '2026-03-01T09:00:00Z',
        sourceLabel: 'Pod 根目录',
      },
    ],
    isLoading: false,
    error: null,
  })
})

const defaultProps = { paneId: 'list', appId: 'files' }

describe('FilesListPane', () => {
  it('renders queried entries', () => {
    render(<FilesListPane {...defaultProps} />)

    expect(screen.getByText('public')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('config.json')).toBeInTheDocument()
  })

  it('filters entries by search text', () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.change(screen.getByPlaceholderText('搜索当前范围...'), {
      target: { value: 'README' },
    })

    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.queryByText('config.json')).not.toBeInTheDocument()
  })

  it('double-clicking a container enters that container', () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.doubleClick(screen.getByText('public'))

    expect(useFilesStore.getState().selectedTreeNodeId).toBe(createContainerNodeId('https://pod.example/public/'))
    expect(useFilesStore.getState().selectedFileId).toBeNull()
  })

  it('clicking the name header updates sort field', () => {
    render(<FilesListPane {...defaultProps} />)

    fireEvent.click(screen.getByText('名称'))

    expect(useFilesStore.getState().sortField).toBe('name')
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
    expect(screen.getByText(/\/repo\/linx/)).toBeInTheDocument()
  })
})
