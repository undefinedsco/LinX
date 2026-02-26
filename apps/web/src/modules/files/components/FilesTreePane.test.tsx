/**
 * FilesTreePane - Unit tests
 *
 * Tests node rendering, expand/collapse, selection, and search filtering.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilesTreePane } from './FilesTreePane'
import { useFilesStore } from '../store'

// Reset store before each test
beforeEach(() => {
  useFilesStore.setState({
    selectedTreeNodeId: 'all',
    expandedTreeNodeIds: new Set(),
    searchText: '',
  })
})

const defaultProps = { paneId: 'tree', appId: 'files' }

describe('FilesTreePane', () => {
  it('renders all virtual group nodes', () => {
    render(<FilesTreePane {...defaultProps} />)
    expect(screen.getByText('全部文件')).toBeInTheDocument()
    expect(screen.getByText('最近修改')).toBeInTheDocument()
    expect(screen.getByText('已标星')).toBeInTheDocument()
    expect(screen.getByText('按会话')).toBeInTheDocument()
    expect(screen.getByText('导入数据')).toBeInTheDocument()
    expect(screen.getByText('Pod 目录')).toBeInTheDocument()
  })

  it('renders file count badges', () => {
    render(<FilesTreePane {...defaultProps} />)
    // '8' for recent, '3' for starred — these are unique counts
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    // '24' appears twice (all + pod-directory), so use getAllByText
    expect(screen.getAllByText('24')).toHaveLength(2)
  })

  it('selects a node on click', () => {
    render(<FilesTreePane {...defaultProps} />)
    fireEvent.click(screen.getByText('已标星'))
    expect(useFilesStore.getState().selectedTreeNodeId).toBe('starred')
  })

  it('expands a group node and shows children', () => {
    render(<FilesTreePane {...defaultProps} />)
    // Find the expand button for "按会话" — it's the chevron button
    const sessionNode = screen.getByText('按会话')
    const expandBtn = sessionNode.closest('div')?.querySelector('button')
    expect(expandBtn).toBeTruthy()
    fireEvent.click(expandBtn!)

    // Children should now be visible
    expect(screen.getByText('Claude Code #1')).toBeInTheDocument()
    expect(screen.getByText('Claude Code #2')).toBeInTheDocument()
    expect(screen.getByText('Cursor Session')).toBeInTheDocument()
  })

  it('collapses an expanded group node', () => {
    // Pre-expand
    useFilesStore.setState({ expandedTreeNodeIds: new Set(['by-session']) })
    render(<FilesTreePane {...defaultProps} />)
    expect(screen.getByText('Claude Code #1')).toBeInTheDocument()

    // Click expand button again to collapse
    const sessionNode = screen.getByText('按会话')
    const expandBtn = sessionNode.closest('div')?.querySelector('button')
    fireEvent.click(expandBtn!)

    expect(screen.queryByText('Claude Code #1')).not.toBeInTheDocument()
  })

  it('filters tree nodes by search text', () => {
    render(<FilesTreePane {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText('搜索文件')
    fireEvent.change(searchInput, { target: { value: '标星' } })

    expect(screen.getByText('已标星')).toBeInTheDocument()
    expect(screen.queryByText('全部文件')).not.toBeInTheDocument()
    expect(screen.queryByText('最近修改')).not.toBeInTheDocument()
  })

  it('shows all nodes when search is cleared', () => {
    useFilesStore.setState({ searchText: '标星' })
    render(<FilesTreePane {...defaultProps} />)
    expect(screen.queryByText('全部文件')).not.toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText('搜索文件')
    fireEvent.change(searchInput, { target: { value: '' } })

    expect(screen.getByText('全部文件')).toBeInTheDocument()
  })

  it('selects child node on click', () => {
    useFilesStore.setState({ expandedTreeNodeIds: new Set(['by-session']) })
    render(<FilesTreePane {...defaultProps} />)
    fireEvent.click(screen.getByText('Claude Code #1'))
    expect(useFilesStore.getState().selectedTreeNodeId).toBe('session-1')
  })
})
