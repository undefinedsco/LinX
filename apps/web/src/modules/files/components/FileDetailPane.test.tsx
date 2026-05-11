import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FileDetailPane } from './FileDetailPane'
import { useFilesStore } from '../store'

const mockUseFileDetail = vi.fn()
const mockUseFavoriteList = vi.fn()
const mockOnStarredChange = vi.fn()

vi.mock('../queries', () => ({
  useFileDetail: () => mockUseFileDetail(),
}))

vi.mock('@/modules/favorites/collections', () => ({
  useFavoriteList: () => mockUseFavoriteList(),
  favoriteHooks: {
    onStarredChange: (...args: unknown[]) => mockOnStarredChange(...args),
  },
}))

beforeEach(() => {
  useFilesStore.setState({
    selectedTreeNodeId: 'container:https://pod.example/public/',
    expandedTreeNodeIds: new Set(),
    selectedFileId: 'https://pod.example/public/README.md',
    selectedFileIds: new Set(),
    searchText: '',
    sortField: 'modifiedAt',
    sortDirection: 'desc',
    mimeTypeFilter: null,
    detailTab: 'preview',
  })

  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn(),
    },
  })
  vi.stubGlobal('open', vi.fn())

  mockUseFileDetail.mockReturnValue({
    data: {
      id: 'https://pod.example/public/README.md',
      uri: 'https://pod.example/public/README.md',
      name: 'README.md',
      kind: 'resource',
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 1024,
      modifiedAt: '2026-03-01T10:00:00Z',
      headers: {},
      previewText: '# Hello\nLinX',
    },
    isLoading: false,
    error: null,
  })
  mockUseFavoriteList.mockReturnValue({
    data: [],
  })
  mockOnStarredChange.mockResolvedValue(undefined)
})

describe('FileDetailPane', () => {
  it('renders selected file detail and preview', () => {
    render(<FileDetailPane />)

    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.getByText(/# Hello/)).toBeInTheDocument()
    expect(screen.getByText(/LinX/)).toBeInTheDocument()
  })

  it('copies file uri', () => {
    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: '复制 URI' }))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://pod.example/public/README.md')
  })

  it('opens original uri in new window', () => {
    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: '打开原始 URI' }))

    expect(window.open).toHaveBeenCalledWith('https://pod.example/public/README.md', '_blank', 'noopener,noreferrer')
  })

  it('toggles favorite using real file uri', async () => {
    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: '收藏' }))

    expect(mockOnStarredChange).toHaveBeenCalledWith(
      'files',
      'https://pod.example/public/README.md',
      true,
      expect.objectContaining({
        title: 'README.md',
        snapshotMeta: JSON.stringify({
          fileId: 'https://pod.example/public/README.md',
          treeNodeId: 'container:https://pod.example/public/',
        }),
      }),
    )
  })

  it('switches to metadata tab', () => {
    render(<FileDetailPane />)

    fireEvent.click(screen.getByText('元数据'))

    expect(screen.getByText('父容器')).toBeInTheDocument()
    expect(screen.getAllByText('https://pod.example/public/').length).toBeGreaterThan(0)
  })
})
