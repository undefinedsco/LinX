/**
 * FilesListPane - Unit tests
 *
 * Tests sorting, search filtering, and file selection.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilesListPane } from './FilesListPane'
import { useFilesStore } from '../store'

// Reset store before each test
beforeEach(() => {
  useFilesStore.setState({
    selectedTreeNodeId: 'all',
    selectedFileId: null,
    searchText: '',
    sortField: 'modifiedAt',
    sortDirection: 'desc',
    detailTab: 'preview',
  })
})

const defaultProps = { paneId: 'list', appId: 'files' }

describe('FilesListPane', () => {
  it('renders mock file list', () => {
    render(<FilesListPane {...defaultProps} />)
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('config.json')).toBeInTheDocument()
    expect(screen.getByText('notes.md')).toBeInTheDocument()
  })

  it('renders column headers', () => {
    render(<FilesListPane {...defaultProps} />)
    expect(screen.getByText('名称')).toBeInTheDocument()
    expect(screen.getByText('同步')).toBeInTheDocument()
  })

  it('selects a file on click', () => {
    render(<FilesListPane {...defaultProps} />)
    fireEvent.click(screen.getByText('README.md'))
    expect(useFilesStore.getState().selectedFileId).toBe('f1')
  })

  it('filters files by search text', () => {
    render(<FilesListPane {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText('搜索文件名...')
    fireEvent.change(searchInput, { target: { value: 'README' } })

    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.queryByText('config.json')).not.toBeInTheDocument()
  })

  it('shows empty state when search has no results', () => {
    render(<FilesListPane {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText('搜索文件名...')
    fireEvent.change(searchInput, { target: { value: 'nonexistent-file' } })

    expect(screen.getByText('当前分组暂无文件')).toBeInTheDocument()
  })

  it('sorts by name when name column header is clicked', () => {
    render(<FilesListPane {...defaultProps} />)
    fireEvent.click(screen.getByText('名称'))
    expect(useFilesStore.getState().sortField).toBe('name')
  })

  it('toggles sort direction when same column is clicked twice', () => {
    useFilesStore.setState({ sortField: 'name', sortDirection: 'asc' })
    render(<FilesListPane {...defaultProps} />)
    fireEvent.click(screen.getByText('名称'))
    expect(useFilesStore.getState().sortDirection).toBe('desc')
  })

  it('filters by starred when starred tree node is selected', () => {
    useFilesStore.setState({ selectedTreeNodeId: 'starred' })
    render(<FilesListPane {...defaultProps} />)
    // Only starred files should be visible
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('profile-photo.png')).toBeInTheDocument()
    expect(screen.queryByText('config.json')).not.toBeInTheDocument()
  })

  it('renders source tags for session and imported files', () => {
    render(<FilesListPane {...defaultProps} />)
    expect(screen.getAllByText('Session').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Imported').length).toBeGreaterThan(0)
  })

  it('renders sync status badges', () => {
    render(<FilesListPane {...defaultProps} />)
    const syncBadges = screen.getAllByText('已同步')
    expect(syncBadges.length).toBeGreaterThan(0)
  })
})
