import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FilesMetaSidebar } from './FilesMetaSidebar'
import { useFilesStore } from '../../app/store'

const mockUseFileDetail = vi.fn()
const mockResourceMetaDrawer = vi.fn()

vi.mock('../../data/queries', () => ({
  useFileDetail: (selectedFileId: string | null) => mockUseFileDetail(selectedFileId),
}))

vi.mock('./ResourceSidecars', () => ({
  ResourceMetaDrawer: (props: {
    children?: React.ReactNode
    open: boolean
    onClose: () => void
    showUserMetadata?: boolean
    variant?: string
  }) => {
    mockResourceMetaDrawer(props)
    return (
      <div
        data-open={props.open}
        data-show-user-metadata={String(props.showUserMetadata)}
        data-testid="meta-drawer"
        data-variant={props.variant ?? ''}
      >
        {props.children}
      </div>
    )
  },
}))

vi.mock('../detail/FileDetailMetadataPanels', () => ({
  FileDrawerMetadata: () => <div data-testid="file-drawer-metadata" />,
  SourceLinkedCardDrawerMetadata: () => <div data-testid="card-drawer-metadata" />,
}))

function buildFile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'https://pod.example/public/README.md',
    uri: 'https://pod.example/public/README.md',
    name: 'README.md',
    kind: 'resource',
    semanticKind: 'file',
    parentUri: 'https://pod.example/public/',
    mimeType: 'text/markdown',
    size: 1024,
    modifiedAt: '2026-03-01T10:00:00Z',
    headers: {},
    previewText: '# Hello',
    ...overrides,
  }
}

describe('FilesMetaSidebar', () => {
  beforeEach(() => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/public/README.md',
      detailTab: 'preview',
      metaSidebarOpen: true,
    })
    mockUseFileDetail.mockReturnValue({
      data: buildFile(),
      isLoading: false,
      error: null,
    })
    mockResourceMetaDrawer.mockClear()
  })

  it('renders nothing without a selected file', () => {
    useFilesStore.setState({ selectedFileId: null })
    mockUseFileDetail.mockReturnValue({ data: null, isLoading: false, error: null })

    const { container } = render(<FilesMetaSidebar />)

    expect(container).toBeEmptyDOMElement()
  })

  it('hides read-only user metadata rows for editable text files', () => {
    render(<FilesMetaSidebar />)

    const drawer = screen.getByTestId('meta-drawer')
    expect(drawer).toHaveAttribute('data-variant', 'embedded')
    expect(drawer).toHaveAttribute('data-show-user-metadata', 'false')
    expect(screen.getByTestId('file-drawer-metadata')).toBeInTheDocument()
    expect(screen.queryByTestId('card-drawer-metadata')).not.toBeInTheDocument()
  })

  it('keeps read-only user metadata rows for read-only binary files', () => {
    mockUseFileDetail.mockReturnValue({
      data: buildFile({ mimeType: 'image/png', previewText: null }),
      isLoading: false,
      error: null,
    })

    render(<FilesMetaSidebar />)

    expect(screen.getByTestId('meta-drawer')).toHaveAttribute('data-show-user-metadata', 'true')
    expect(screen.queryByTestId('file-drawer-metadata')).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-drawer-metadata')).not.toBeInTheDocument()
  })

  it('renders the source-linked card metadata panel for cards', () => {
    mockUseFileDetail.mockReturnValue({
      data: buildFile({ semanticKind: 'source-linked-card' }),
      isLoading: false,
      error: null,
    })

    render(<FilesMetaSidebar />)

    expect(screen.getByTestId('meta-drawer')).toHaveAttribute('data-show-user-metadata', 'true')
    expect(screen.getByTestId('card-drawer-metadata')).toBeInTheDocument()
    expect(screen.queryByTestId('file-drawer-metadata')).not.toBeInTheDocument()
  })

  it('closes the sidebar via the store when the drawer closes', () => {
    render(<FilesMetaSidebar />)

    mockResourceMetaDrawer.mock.calls.at(-1)?.[0].onClose()

    expect(useFilesStore.getState().metaSidebarOpen).toBe(false)
  })
})
