import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FilesWorkspacePane } from '../app/FilesWorkspacePane'
import { FilesRouteBridgeProvider } from '../app/FilesRouteContext'
import { useFilesStore } from '../app/store'

const mockMutateAsync = vi.fn()
const mockUseCreateSourceIngest = vi.fn()
const mockUseSelectedFilesLocation = vi.fn()

vi.mock('@/providers/solid-session-provider', () => ({
  useSession: () => ({ session: { info: { isLoggedIn: false } } }),
}))

vi.mock('../features/list/FilesListPane', () => ({
  FilesListPane: () => <div>files list</div>,
}))

vi.mock('../features/detail/FileDetailPane', () => ({
  FileDetailPane: () => <div>file detail</div>,
}))

vi.mock('../features/tree/FilesTreePane', () => ({
  FilesTreePane: ({ forceExpanded = false }: { forceExpanded?: boolean }) => (
    <div data-testid="compact-files-tree" data-force-expanded={forceExpanded ? 'true' : 'false'}>files tree</div>
  ),
}))

vi.mock('../queries', () => ({
  useCreateSourceIngest: () => mockUseCreateSourceIngest(),
  useSelectedFilesLocation: (...args: unknown[]) => mockUseSelectedFilesLocation(...args),
}))

beforeEach(() => {
  window.history.replaceState({}, '', '/files')
  useFilesStore.setState({
    selectedTreeNodeId: 'container:https://pod.example/.data/workspaces/ws-1/cards/',
    selectedFileId: null,
    entryScope: 'all',
    structuredViewMode: 'table',
    structuredClassScope: null,
    structuredSearchText: '',
    structuredSortKey: null,
    structuredSortDirection: 'asc',
    structuredHiddenPredicates: new Set(),
    structuredKanbanGroupPredicate: null,
    structuredSubjectReturnContext: null,
    structuredScrollRestoration: null,
  })
  mockMutateAsync.mockClear()
  mockMutateAsync.mockResolvedValue({
    targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
  })
  mockUseCreateSourceIngest.mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: false,
  })
  mockUseSelectedFilesLocation.mockReturnValue({
    kind: 'container',
    containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
  })
})

describe('FilesWorkspacePane', () => {
  it('offers the folder tree through an invoked drawer in compact content', () => {
    render(<FilesWorkspacePane theme="light" compact />)

    fireEvent.click(screen.getByRole('button', { name: '浏览文件夹' }))

    expect(screen.getByRole('dialog', { name: '文件夹' })).toBeInTheDocument()
    expect(screen.getByTestId('compact-files-tree')).toHaveAttribute('data-force-expanded', 'true')
  })

  it('keeps compact Files connected to the application module switcher', () => {
    const onNavigate = vi.fn()
    render(
      <FilesWorkspacePane
        theme="light"
        compact
        compactNavigation={<button onClick={() => onNavigate('chat')}>切换模块</button>}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '切换模块' }))

    expect(onNavigate).toHaveBeenCalledWith('chat')
  })

  it('restores a structured subject route from the initial URL', () => {
    window.history.replaceState({}, '', '/files?filesRoute=linx.files.structuredSubjectRoute.v1&filesDocument=https%3A%2F%2Fpod.example%2F.data%2Fstate.ttl&filesSubject=%23Report&filesTarget=https%3A%2F%2Fpod.example%2Fpublic%2Freport.md&filesScroll=96&filesView=kanban&filesClass=udfs%3AWorkspace&filesSearch=report&filesSort=title&filesSortDirection=desc&filesHidden=tags&filesKanban=status')

    render(<FilesWorkspacePane theme="light" />)

    expect(useFilesStore.getState()).toMatchObject({
      selectedFileId: 'https://pod.example/public/report.md',
      structuredViewMode: 'kanban',
      structuredClassScope: 'udfs:Workspace',
      structuredSearchText: 'report',
      structuredSortKey: 'title',
      structuredSortDirection: 'desc',
      structuredKanbanGroupPredicate: 'status',
      structuredSubjectReturnContext: {
        documentUri: 'https://pod.example/.data/state.ttl',
        subject: '#Report',
        scrollTop: 96,
      },
    })
    expect(Array.from(useFilesStore.getState().structuredHiddenPredicates)).toEqual(['tags'])
  })

  it('restores a structured subject route from the injected router search bridge', () => {
    window.history.replaceState({}, '', '/files')

    render(
      <FilesRouteBridgeProvider bridge={{
        search: {
          filesRoute: 'linx.files.structuredSubjectRoute.v1',
          filesDocument: 'https://pod.example/.data/state.ttl',
          filesSubject: '#Report',
          filesTarget: 'https://pod.example/public/report.md',
          filesScroll: '64',
          filesView: 'whiteboard',
          filesClass: 'udfs:Workspace',
          filesSearch: 'report',
          filesSortDirection: 'desc',
        },
        pushStructuredSubjectRoute: vi.fn(),
        clearStructuredSubjectRoute: vi.fn(),
      }}>
        <FilesWorkspacePane theme="light" />
      </FilesRouteBridgeProvider>,
    )

    expect(useFilesStore.getState()).toMatchObject({
      selectedFileId: 'https://pod.example/public/report.md',
      structuredViewMode: 'whiteboard',
      structuredClassScope: 'udfs:Workspace',
      structuredSearchText: 'report',
      structuredSortDirection: 'desc',
      structuredSubjectReturnContext: {
        documentUri: 'https://pod.example/.data/state.ttl',
        subject: '#Report',
        scrollTop: 64,
      },
    })
  })

  it('does not clear an explicit editable sheet request when restoring the matching subject route', () => {
    useFilesStore.setState({
      editableFileSheetOpenRequestUri: 'https://pod.example/public/report.md',
    })

    render(
      <FilesRouteBridgeProvider bridge={{
        search: {
          filesRoute: 'linx.files.structuredSubjectRoute.v1',
          filesDocument: 'https://pod.example/.data/state.ttl',
          filesSubject: 'https://pod.example/public/report.md',
          filesTarget: 'https://pod.example/public/report.md',
          filesScroll: '64',
          filesView: 'table',
          filesSortDirection: 'asc',
        },
        pushStructuredSubjectRoute: vi.fn(),
        clearStructuredSubjectRoute: vi.fn(),
      }}>
        <FilesWorkspacePane theme="light" />
      </FilesRouteBridgeProvider>,
    )

    expect(useFilesStore.getState()).toMatchObject({
      selectedFileId: 'https://pod.example/public/report.md',
      editableFileSheetOpenRequestUri: 'https://pod.example/public/report.md',
      structuredSubjectReturnContext: {
        documentUri: 'https://pod.example/.data/state.ttl',
        subject: 'https://pod.example/public/report.md',
        scrollTop: 64,
      },
    })
  })

  it('restores and returns structured subject state from popstate', () => {
    render(<FilesWorkspacePane theme="light" />)

    act(() => {
      window.history.pushState({}, '', '/files?filesRoute=linx.files.structuredSubjectRoute.v1&filesDocument=https%3A%2F%2Fpod.example%2F.data%2Fstate.ttl&filesSubject=%23Report&filesTarget=https%3A%2F%2Fpod.example%2Fpublic%2Freport.md&filesScroll=128')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/report.md')
    expect(useFilesStore.getState().structuredSubjectReturnContext?.documentUri).toBe('https://pod.example/.data/state.ttl')

    act(() => {
      window.history.pushState({}, '', '/files')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/state.ttl')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toBeNull()
    expect(useFilesStore.getState().structuredScrollRestoration).toEqual({
      documentUri: 'https://pod.example/.data/state.ttl',
      subject: '#Report',
      scrollTop: 128,
    })
  })

  it('renders the resource detail in the desktop content pane', () => {
    render(<FilesWorkspacePane theme="light" />)

    expect(screen.getByText('file detail')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ingest 来源' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-files-ingest-action="true"]')).toBeNull()
  })

  it('renders the Files list through the shared compact workspace path', () => {
    render(<FilesWorkspacePane theme="light" compact />)

    expect(screen.getByLabelText('文件列表')).toBeInTheDocument()
    expect(screen.getByText('files list')).toBeInTheDocument()
  })

  it('shows the file list first in the compact Files workspace when no file is selected', () => {
    useFilesStore.setState({ selectedFileId: null })

    render(<FilesWorkspacePane theme="light" compact />)

    expect(screen.getByLabelText('文件列表').className).toContain('max-md:flex')
    expect(screen.getByLabelText('文件工作区').className).toContain('max-md:hidden')
  })

  it('prioritizes the selected file detail in the compact Files workspace and can return to the list', async () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl' })

    render(<FilesWorkspacePane theme="light" compact />)

    expect(screen.getByLabelText('文件列表').className).toContain('max-md:hidden')
    expect(screen.getByLabelText('文件工作区').className).toContain('max-md:flex')

    fireEvent.click(screen.getByRole('button', { name: '返回文件列表' }))

    await waitFor(() => {
      expect(useFilesStore.getState().selectedFileId).toBeNull()
    })
  })

  it('shows when Files is opened from the chat files shortcut', () => {
    useFilesStore.setState({ entryScope: 'chat-files' })

    render(<FilesWorkspacePane theme="light" />)

    expect(screen.getByText('聊天文件')).toBeInTheDocument()
    expect(screen.getByText('当前范围来自聊天关联文件；目录仍按 Pod 原始位置打开。')).toBeInTheDocument()
  })

})
