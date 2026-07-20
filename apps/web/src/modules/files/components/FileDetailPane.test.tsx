import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { FileDetailPane } from './FileDetailPane'
import { useFilesStore } from '../app/store'
import { FilesResourceReadError } from '../browser'
import { createSourceUpdateProposal, renderSourceUpdateProposalTurtle } from '../source-approval'
import { createStructuredCellChangeProposal } from '../structured-cell-approval'
import { createVocabTermProposal } from '../structured-table'

const mockUseFileDetail = vi.fn()
const mockUseFilesAccessBasics = vi.fn()
const mockUseFilesMetaSidecar = vi.fn()
const mockUseStructuredViewMetadata = vi.fn()
const mockUseRawTextResource = vi.fn()
const mockUseBlobResource = vi.fn()
const mockUseSaveStructuredViewMetadata = vi.fn()
const mockUseSaveRawTextResource = vi.fn()
const mockUseCreateRawTextResource = vi.fn()
const mockUseCreateBlobResource = vi.fn()
const mockUseApproveVocabTermProposal = vi.fn()
const mockUseCreateVocabTermProposalInboxApproval = vi.fn()
const mockUseCreateAiChangeProposal = vi.fn()
const mockUseCreateAccessPolicyProposal = vi.fn()
const mockUseCopyFileResource = vi.fn()
const mockUseCreateFolderResource = vi.fn()
const mockUseCreateSourceUpdateProposal = vi.fn()
const mockUseCreateStructuredCellChangeProposal = vi.fn()
const mockUsePendingStructuredCellChangeProposals = vi.fn()
const mockUsePendingSourceUpdateProposals = vi.fn()
const mockUsePendingAccessPolicyProposals = vi.fn()
const mockUsePendingVocabTermProposals = vi.fn()
const mockUseMoveFileResource = vi.fn()
const mockUseFilesVocabRegistryDiscovery = vi.fn()
const mockUseFilesCurrentPodRootUri = vi.fn()
const mockUseRefreshSourceLinkedCard = vi.fn()

function getRichEditorTextbox(): HTMLElement {
  const editor = document.querySelector('.ProseMirror')
  if (!(editor instanceof HTMLElement)) {
    throw new Error('Rich editor textbox was not rendered')
  }
  return editor
}

function revealRichTextToolbar(editor = getRichEditorTextbox()) {
  fireEvent.focus(editor)
}

function getEditableFileSurface(): HTMLElement {
  return screen.queryByRole('dialog', { name: 'Hello' }) ?? document.body
}

function getEditableFileMetaTail(): HTMLElement {
  return within(getEditableFileSurface()).getByLabelText('文件 meta')
}

function getEditableFileMetaControl(label: string): HTMLElement {
  return within(getEditableFileSurface()).getByLabelText(label)
}

function getFolderTreeItem(name: RegExp) {
  const button = within(screen.getByRole('tree', { name: 'Folder list view' })).getByRole('button', { name })
  const treeItem = button.closest('[role="treeitem"]')
  if (!(treeItem instanceof HTMLElement)) throw new Error('Folder tree item was not rendered')
  return treeItem
}
const mockUseDeleteFileResource = vi.fn()
const mockUseApprovalByTarget = vi.fn()
const mockUseResolveInboxApproval = vi.fn()
const mockUseFavoriteList = vi.fn()
const mockOnStarredChange = vi.fn()
const mockToast = vi.fn()
const mockMutateRaw = vi.fn()
const mockCreateRaw = vi.fn()
const mockCreateBlob = vi.fn()
const mockApproveVocab = vi.fn()
const mockCreateInboxApproval = vi.fn()
const mockCreateAiChangeProposal = vi.fn()
const mockCreateAccessProposal = vi.fn()
const mockCopyFileResource = vi.fn()
const mockCreateFolderResource = vi.fn()
const mockCreateSourceProposal = vi.fn()
const mockCreateCellProposal = vi.fn()
const mockMoveFileResource = vi.fn()
const mockDeleteFileResource = vi.fn()
const mockRefreshSourceLinkedCard = vi.fn()
const mockSaveStructuredViewMetadata = vi.fn()
const mockRequestIngestRange = vi.fn()
const mockResolveInboxApproval = vi.fn()

function closeAutoOpenedFileSheet() {
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
}

function requestDefaultEditableFileSheetOpen() {
  useFilesStore.setState({ editableFileSheetOpenRequestUri: 'https://pod.example/public/README.md' })
}

function selectFileEditorMode(label: '富文本' | '源码') {
  fireEvent.pointerDown(screen.getByRole('button', { name: '更多文件操作' }))
  fireEvent.click(screen.getByRole('menuitem', { name: label }))
}

function openResourceActionsMenu() {
  fireEvent.pointerDown(screen.getByRole('button', { name: '更多资源操作' }))
}

function openHeaderMetaDrawer() {
  const head = screen.queryByLabelText('文件详情 head')
  const headMetaButton = head ? within(head).queryByRole('button', { name: '查看 .meta' }) : null
  if (headMetaButton) {
    fireEvent.click(headMetaButton)
    return
  }
  openResourceActionsMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: '查看 .meta' }))
}

function openHeaderAccessDialog() {
  const editableLauncher = screen.queryByRole('button', { name: '打开文件编辑器' })
    ?? screen.queryByRole('button', { name: '打开文件详情' })
  if (editableLauncher) {
    fireEvent.click(editableLauncher)
    const editorSheet = screen.getByRole('dialog', { name: 'Hello' })
    fireEvent.pointerDown(within(editorSheet).getByRole('button', { name: '更多文件操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '查看 Access 来源' }))
    return
  }
  const head = screen.queryByLabelText('文件详情 head')
  const headAccessButton = head ? within(head).queryByRole('button', { name: '查看 Access 来源' }) : null
  if (headAccessButton) {
    fireEvent.click(headAccessButton)
    return
  }
  openResourceActionsMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: '查看 Access 来源' }))
}

async function fillOperationSheet(label: string, value: string, confirmLabel: string) {
  const input = await screen.findByLabelText(label)
  const dialog = input.closest('[role="dialog"]')
  fireEvent.change(input, { target: { value } })
  fireEvent.click(within(dialog as HTMLElement).getByRole('button', { name: confirmLabel }))
  await waitFor(() => expect(dialog).not.toBeInTheDocument())
}

async function confirmOperationSheet(confirmLabel: string) {
  const button = await screen.findByRole('button', { name: confirmLabel })
  const dialog = button.closest('[role="dialog"]')
  fireEvent.click(button)
  await waitFor(() => expect(dialog).not.toBeInTheDocument())
}

vi.mock('../data/queries', () => ({
  useFileDetail: (...args: unknown[]) => mockUseFileDetail(...args),
  useFilesFavoriteList: () => mockUseFavoriteList(),
  filesFavoriteHooks: {
    onStarredChange: (...args: unknown[]) => mockOnStarredChange(...args),
  },
  useFilesAccessBasics: (...args: unknown[]) => mockUseFilesAccessBasics(...args),
  useFilesMetaSidecar: (...args: unknown[]) => mockUseFilesMetaSidecar(...args),
  useStructuredViewMetadata: (...args: unknown[]) => mockUseStructuredViewMetadata(...args),
  useRawTextResource: (...args: unknown[]) => mockUseRawTextResource(...args),
  useBlobResource: (...args: unknown[]) => mockUseBlobResource(...args),
  useSaveStructuredViewMetadata: () => mockUseSaveStructuredViewMetadata(),
  useSaveRawTextResource: () => mockUseSaveRawTextResource(),
  useCreateRawTextResource: () => mockUseCreateRawTextResource(),
  useCreateBlobResource: () => mockUseCreateBlobResource(),
  useApproveVocabTermProposal: () => mockUseApproveVocabTermProposal(),
  useCreateVocabTermProposalInboxApproval: () => mockUseCreateVocabTermProposalInboxApproval(),
  useCreateAiChangeProposal: () => mockUseCreateAiChangeProposal(),
  useCreateAccessPolicyProposal: () => mockUseCreateAccessPolicyProposal(),
  useCopyFileResource: () => mockUseCopyFileResource(),
  useCreateFolderResource: () => mockUseCreateFolderResource(),
  useCreateSourceUpdateProposal: () => mockUseCreateSourceUpdateProposal(),
  useCreateStructuredCellChangeProposal: () => mockUseCreateStructuredCellChangeProposal(),
  usePendingStructuredCellChangeProposals: (...args: unknown[]) => mockUsePendingStructuredCellChangeProposals(...args),
  usePendingSourceUpdateProposals: (...args: unknown[]) => mockUsePendingSourceUpdateProposals(...args),
  usePendingAccessPolicyProposals: (...args: unknown[]) => mockUsePendingAccessPolicyProposals(...args),
  usePendingVocabTermProposals: (...args: unknown[]) => mockUsePendingVocabTermProposals(...args),
  useFilesApprovalByTarget: (...args: unknown[]) => mockUseApprovalByTarget(...args),
  useResolveFilesInboxApproval: () => mockUseResolveInboxApproval(),
  useFilesCurrentPodRootUri: () => mockUseFilesCurrentPodRootUri(),
  useFilesVocabRegistryDiscovery: (...args: unknown[]) => mockUseFilesVocabRegistryDiscovery(...args),
  useMoveFileResource: () => mockUseMoveFileResource(),
  useDeleteFileResource: () => mockUseDeleteFileResource(),
  useRequestSourceIngestRange: () => ({
    mutateAsync: mockRequestIngestRange,
    isPending: false,
  }),
  useRefreshSourceLinkedCard: () => mockUseRefreshSourceLinkedCard(),
}))

vi.mock('@/modules/favorites/collections', () => ({
  useFavoriteList: () => mockUseFavoriteList(),
  favoriteHooks: {
    onStarredChange: (...args: unknown[]) => mockOnStarredChange(...args),
  },
}))

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('@/modules/inbox/collections', () => ({
  useApprovalByTarget: (...args: unknown[]) => mockUseApprovalByTarget(...args),
  useResolveInboxApproval: () => mockUseResolveInboxApproval(),
}))

beforeEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
  window.history.replaceState({}, '', '/files')
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
    editableFileSheetOpenRequestUri: null,
    sidecarActionRequest: null,
    structuredViewMode: 'table',
    structuredClassScope: null,
    structuredSearchText: '',
    structuredSortKey: null,
    structuredSortDirection: 'asc',
    structuredHiddenPredicates: new Set(),
    structuredViewConfigsByDocument: {},
    structuredColumnSizingByDocument: {},
    structuredWhiteboardLayoutsByDocument: {},
    structuredWhiteboardSubjectsByDocument: {},
    structuredWhiteboardRelationsByDocument: {},
    structuredWhiteboardSnapshotByDocument: {},
    structuredKanbanGroupPredicate: null,
    structuredKanbanOrderByDocument: {},
    structuredKanbanBoardByDocument: {},
    structuredViewDirtyDocuments: new Set(),
    structuredSubjectReturnContext: null,
    structuredScrollRestoration: null,
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
      semanticKind: 'file',
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
  mockUseRawTextResource.mockReturnValue({
    data: {
      uri: 'https://pod.example/public/README.md',
      content: '# Hello\nLinX full raw',
      mimeType: 'text/markdown',
      etag: '"raw-1"',
      headers: { etag: '"raw-1"', 'content-type': 'text/markdown' },
    },
    isLoading: false,
    error: null,
  })
  mockUseFilesVocabRegistryDiscovery.mockReturnValue({
    data: {
      publicTypeIndexUri: null,
      privateTypeIndexUri: null,
      public: [],
      private: [],
    },
    isLoading: false,
    error: null,
  })
  mockUseFilesCurrentPodRootUri.mockReturnValue('https://pod.example/')
  mockUseBlobResource.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  })
  mockMutateRaw.mockResolvedValue({
    uri: 'https://pod.example/public/README.md',
    content: '# Hello\nLinX changed',
    mimeType: 'text/markdown',
    etag: '"raw-2"',
    headers: { etag: '"raw-2"', 'content-type': 'text/markdown' },
  })
  mockUseSaveRawTextResource.mockReturnValue({
    mutateAsync: mockMutateRaw,
    isPending: false,
  })
  mockCreateRaw.mockResolvedValue({
    uri: 'https://pod.example/.data/proposals/vocab/summary.ttl',
    content: '<#proposal> a <#Proposal> .',
    mimeType: 'text/turtle',
    etag: '"proposal-1"',
    headers: { etag: '"proposal-1"', 'content-type': 'text/turtle' },
  })
  mockUseCreateRawTextResource.mockReturnValue({
    mutateAsync: mockCreateRaw,
    isPending: false,
  })
  mockCreateBlob.mockResolvedValue({
    uri: 'https://pod.example/public/diagram.png',
    id: 'https://pod.example/public/diagram.png',
    name: 'diagram.png',
    kind: 'resource',
    semanticKind: 'file',
    parentUri: 'https://pod.example/public/',
    mimeType: 'image/png',
    size: 4,
    modifiedAt: '2026-06-17T00:00:00.000Z',
    headers: {},
    previewText: null,
  })
  mockUseCreateBlobResource.mockReturnValue({
    mutateAsync: mockCreateBlob,
    isPending: false,
  })
  mockApproveVocab.mockResolvedValue({
    uri: 'https://pod.example/.vocab/terms.ttl',
    content: '<#summary> a <#PredicateTerm> .',
    mimeType: 'text/turtle',
    etag: '"vocab-2"',
    headers: { etag: '"vocab-2"', 'content-type': 'text/turtle' },
  })
  mockUseApproveVocabTermProposal.mockReturnValue({
    mutateAsync: mockApproveVocab,
    isPending: false,
  })
  mockCreateInboxApproval.mockResolvedValue('https://pod.example/.data/approvals/2026/06/17.ttl#approval-1')
  mockUseCreateVocabTermProposalInboxApproval.mockReturnValue({
    mutateAsync: mockCreateInboxApproval,
    isPending: false,
  })
  mockCreateAiChangeProposal.mockResolvedValue('https://pod.example/.data/approvals/2026/06/17.ttl#ai-change-approval-1')
  mockUseCreateAiChangeProposal.mockReturnValue({
    mutateAsync: mockCreateAiChangeProposal,
    isPending: false,
  })
  mockCreateAccessProposal.mockResolvedValue('https://pod.example/.data/approvals/2026/06/17.ttl#access-approval-1')
  mockUseCreateAccessPolicyProposal.mockReturnValue({
    mutateAsync: mockCreateAccessProposal,
    isPending: false,
  })
  mockCopyFileResource.mockResolvedValue({
    uri: 'https://pod.example/public/diagram copy.png',
  })
  mockUseCopyFileResource.mockReturnValue({
    mutateAsync: mockCopyFileResource,
    isPending: false,
  })
  mockCreateFolderResource.mockResolvedValue({
    uri: 'https://pod.example/public/Project%20Notes/',
    id: 'https://pod.example/public/Project%20Notes/',
    name: 'Project Notes',
    kind: 'container',
    semanticKind: 'container',
    parentUri: 'https://pod.example/public/',
    mimeType: 'inode/container',
    size: null,
    modifiedAt: '2026-06-17T00:00:00.000Z',
    headers: {},
    previewText: null,
    childEntries: [],
  })
  mockUseCreateFolderResource.mockReturnValue({
    mutateAsync: mockCreateFolderResource,
    isPending: false,
  })
  mockCreateSourceProposal.mockResolvedValue('https://pod.example/.data/approvals/2026/06/17.ttl#source-approval-1')
  mockUseCreateSourceUpdateProposal.mockReturnValue({
    mutateAsync: mockCreateSourceProposal,
    isPending: false,
  })
  mockRefreshSourceLinkedCard.mockResolvedValue({
    action: 'unchanged',
    sourceProposal: null,
  })
  mockUseRefreshSourceLinkedCard.mockReturnValue({
    mutateAsync: mockRefreshSourceLinkedCard,
    isPending: false,
  })
  mockCreateCellProposal.mockResolvedValue('https://pod.example/.data/approvals/2026/06/17.ttl#cell-approval-1')
  mockUseCreateStructuredCellChangeProposal.mockReturnValue({
    mutateAsync: mockCreateCellProposal,
    isPending: false,
  })
  mockUsePendingStructuredCellChangeProposals.mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  })
  mockUsePendingSourceUpdateProposals.mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  })
  mockUsePendingAccessPolicyProposals.mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  })
  mockUsePendingVocabTermProposals.mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  })
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:https://pod.example/diagram-preview'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  })
  mockMoveFileResource.mockResolvedValue({
    uri: 'https://pod.example/public/archive/diagram.png',
  })
  mockUseMoveFileResource.mockReturnValue({
    mutateAsync: mockMoveFileResource,
    isPending: false,
  })
  mockDeleteFileResource.mockResolvedValue(undefined)
  mockUseDeleteFileResource.mockReturnValue({
    mutateAsync: mockDeleteFileResource,
    isPending: false,
  })
  mockUseFilesAccessBasics.mockReturnValue({
    data: {
      ownerUri: 'https://pod.example/public/README.md',
      activeSource: {
        provider: 'acl',
        uri: 'https://pod.example/public/README.md.acl',
        confidence: 'linked',
        inheritance: 'direct',
      },
      effectiveAccess: {
        user: { read: true, append: true, write: false, control: true },
        public: { read: true, append: false, write: false, control: false },
      },
      policySummary: {
        uri: 'https://pod.example/public/README.md.acl',
        provider: 'acl',
        state: 'exists',
        grants: [
          {
            audience: 'authenticated',
            audienceRef: 'acl:AuthenticatedAgent',
            modes: { read: true, append: true, write: false, control: false },
          },
          {
            audience: 'agent',
            audienceRef: 'https://app.example/profile#me',
            modes: { read: true, append: false, write: true, control: false },
          },
        ],
      },
      candidates: [
        {
          provider: 'acr',
          uri: 'https://pod.example/public/README.md.acr',
          existence: { uri: 'https://pod.example/public/README.md.acr', state: 'missing', status: 404 },
        },
        {
          provider: 'acl',
          uri: 'https://pod.example/public/README.md.acl',
          existence: { uri: 'https://pod.example/public/README.md.acl', state: 'exists', status: 200 },
        },
      ],
    },
    isLoading: false,
    error: null,
  })
  mockUseApprovalByTarget.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  })
  mockResolveInboxApproval.mockResolvedValue(undefined)
  mockUseResolveInboxApproval.mockReturnValue({
    mutateAsync: mockResolveInboxApproval,
    isPending: false,
  })
  mockUseFilesMetaSidecar.mockReturnValue({
    data: {
      ownerUri: 'https://pod.example/public/README.md',
      metaUri: 'https://pod.example/public/README.md.meta',
      state: 'exists',
      status: 200,
      content: '@prefix dcterms: <http://purl.org/dc/terms/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n@prefix udfs: <https://undefineds.co/vocab/> .\n<#meta> dcterms:source <https://source.example/readme> ; rdfs:seeAlso <https://pod.example/public/spec.md> ; udfs:vocab <https://pod.example/.vocab/terms.ttl> ; udfs:shape <https://pod.example/.vocab/shapes.ttl#MarkdownFileShape> .',
      mimeType: 'text/turtle',
      etag: '"meta-1"',
      size: 320,
    },
    isLoading: false,
    error: null,
  })
  mockUseStructuredViewMetadata.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  })
  mockUseSaveStructuredViewMetadata.mockReturnValue({
    mutate: mockSaveStructuredViewMetadata,
    mutateAsync: mockSaveStructuredViewMetadata,
    isPending: false,
  })
  mockToast.mockClear()
  mockMutateRaw.mockClear()
  mockCreateRaw.mockClear()
  mockCreateBlob.mockClear()
  mockApproveVocab.mockClear()
  mockCreateInboxApproval.mockClear()
  mockCreateAccessProposal.mockClear()
  mockCopyFileResource.mockClear()
  mockCreateSourceProposal.mockClear()
  mockCreateCellProposal.mockClear()
  mockMoveFileResource.mockClear()
  mockDeleteFileResource.mockClear()
  mockSaveStructuredViewMetadata.mockClear()
  mockRequestIngestRange.mockClear()
  mockUseRefreshSourceLinkedCard.mockClear()
  mockRefreshSourceLinkedCard.mockClear()
  mockRequestIngestRange.mockResolvedValue({
    action: 'updated-priority',
    manifest: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('FileDetailPane', () => {
  it('shows an actionable message when the selected file is forbidden', () => {
    mockUseFileDetail.mockReturnValue({
      data: null,
      isLoading: false,
      error: new FilesResourceReadError('https://pod.example/private.md', { status: 403 }),
    })

    render(<FileDetailPane />)

    expect(screen.getByText('没有权限读取这个文件')).toBeInTheDocument()
    expect(screen.getByText('当前账号没有读取权限，可以申请授权或从文件夹中选择其它文件。')).toBeInTheDocument()
  })

  it('shows a lightweight object preview for a selected editable file before opening the editor sheet', async () => {
    render(<FileDetailPane />)

    const preview = screen.getByLabelText('可编辑文件预览')
    expect(within(preview).getByRole('heading', { name: 'README.md' })).toBeInTheDocument()
    expect(within(preview).getAllByText('text/markdown').length).toBeGreaterThan(0)
    expect(within(preview).getAllByText('1.0 KB').length).toBeGreaterThan(0)
    expect(within(preview).getAllByText('https://pod.example/public/README.md').length).toBeGreaterThan(0)
    expect(preview.querySelector('pre')).toHaveTextContent('# Hello')
    expect(screen.queryByRole('dialog', { name: 'Hello' })).not.toBeInTheDocument()
    expect(mockUseFilesMetaSidecar).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'https://pod.example/public/README.md',
    }), false)

    fireEvent.doubleClick(preview)
    expect(await screen.findByRole('dialog', { name: 'Hello' })).toBeInTheDocument()
    closeAutoOpenedFileSheet()

    fireEvent.keyDown(preview, { key: 'Enter' })
    expect(await screen.findByRole('dialog', { name: 'Hello' })).toBeInTheDocument()
    closeAutoOpenedFileSheet()

    fireEvent.click(within(preview).getByRole('button', { name: '打开文件详情' }))
    expect(await screen.findByRole('dialog', { name: 'Hello' })).toBeInTheDocument()
    closeAutoOpenedFileSheet()

    act(() => {
      useFilesStore.getState().requestEditableFileSheetOpen('https://pod.example/public/README.md')
    })

    expect(await screen.findByRole('dialog', { name: 'Hello' })).toBeInTheDocument()
  })

  it('opens editable file detail in a centered editor modal', async () => {
    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    expect(screen.getAllByText('README.md').length).toBeGreaterThan(0)
    const editorSheet = screen.getByRole('dialog', { name: 'Hello' })
    expect(editorSheet).toBeInTheDocument()
    expect(editorSheet).toHaveAttribute('data-document-editor-modal', 'true')
    expect(editorSheet).not.toHaveAttribute('data-files-editor-sheet')
    expect(editorSheet).toHaveClass('left-[50%]')
    expect(editorSheet).toHaveClass('top-[50%]')
    expect(editorSheet).toHaveClass('max-h-[92vh]')
    expect(editorSheet).toHaveClass('rounded-xl')
    expect(editorSheet).not.toHaveClass('right-0')
    expect(editorSheet).not.toHaveClass('h-dvh')
    const sheetHeader = within(editorSheet).getByLabelText('文件详情标题')
    const dialogTitle = within(sheetHeader).getByText('Hello')
    expect(dialogTitle.tagName.toLowerCase()).toBe('h2')
    expect(screen.queryByLabelText('笔记标题')).not.toBeInTheDocument()
    expect(within(editorSheet).getByRole('heading', { name: 'Hello', level: 1 })).toBeInTheDocument()
    expect(within(sheetHeader).queryByText('text/markdown')).not.toBeInTheDocument()
    expect(within(sheetHeader).getByText('README.md')).toBeInTheDocument()
    expect(within(sheetHeader).getByText('README.md')).toHaveAttribute('data-document-editor-file-title', 'true')
    expect(within(sheetHeader).queryByText('https://pod.example/public/README.md')).not.toBeInTheDocument()
    expect(within(sheetHeader).queryByLabelText('文件详情 byline')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '富文本' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '源码' })).not.toBeInTheDocument()
    expect(screen.getByTestId('rich-text-file-editor')).toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: '富文本块工具' })).not.toBeInTheDocument()
    const metaTail = getEditableFileMetaTail()
    const titleRegion = within(editorSheet).getByLabelText('文件详情标题')
    const contentRegion = screen.getByTestId('rich-text-file-editor')
    const sheetScrollArea = within(editorSheet).getByLabelText('文件详情内容滚动区')
    expect(metaTail).toBeInTheDocument()
    expect(sheetScrollArea).toContainElement(metaTail)
    expect(titleRegion.compareDocumentPosition(contentRegion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(contentRegion.compareDocumentPosition(metaTail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(metaTail).getByText('MIME 类型')).toBeInTheDocument()
    expect(within(metaTail).getByRole('button', { name: '收起 Info' })).toBeInTheDocument()
    expect(within(metaTail).getByText('text/markdown')).toBeInTheDocument()
    expect(within(metaTail).getByText('大小')).toBeInTheDocument()
    expect(within(metaTail).getByText('1.0 KB')).toBeInTheDocument()
    expect(within(metaTail).getByText('父容器')).toBeInTheDocument()
    expect(within(metaTail).getByText('https://pod.example/public/')).toBeInTheDocument()
    expect(within(metaTail).queryByText('访问权限')).not.toBeInTheDocument()
    expect(within(metaTail).queryByText('你：可查看、可追加、可管理权限')).not.toBeInTheDocument()
    expect(within(metaTail).queryByText('公开访问：可查看')).not.toBeInTheDocument()
    expect(within(metaTail).getAllByText('.meta').length).toBeGreaterThan(0)
    expect(within(metaTail).getAllByText('来源').length).toBeGreaterThan(0)
    expect(within(metaTail).getByText('https://source.example/readme')).toBeInTheDocument()
    expect(within(metaTail).getByText('相关链接')).toBeInTheDocument()
    expect(within(metaTail).getByText('https://pod.example/public/spec.md')).toBeInTheDocument()
    expect(within(metaTail).getByText('词表 / Schema')).toBeInTheDocument()
    expect(within(metaTail).getAllByText(/terms\.ttl/).length).toBeGreaterThan(0)
    expect(within(metaTail).getAllByText(/MarkdownFileShape/).length).toBeGreaterThan(0)
    expect(within(metaTail).getByLabelText('RDF metadata')).toBeInTheDocument()
    expect(within(metaTail).getByLabelText('File title meta predicate')).toHaveValue('Hello')
    expect(within(metaTail).getByLabelText('File review status meta predicate')).toHaveValue('')
    expect(within(metaTail).getByRole('combobox', { name: 'File tags meta predicate' })).toHaveValue('')
    expect(within(metaTail).getByLabelText('File source meta predicate')).toHaveValue('https://source.example/readme')
    const sheetInfoButton = within(titleRegion).getByRole('button', { name: '显示 Info' })
    expect(sheetInfoButton).toBeInTheDocument()
    fireEvent.pointerDown(within(titleRegion).getByRole('button', { name: '更多文件操作' }))
    expect(screen.getByRole('menuitem', { name: '显示 Info' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '查看 Access 来源' })).toBeInTheDocument()
    expect(within(metaTail).queryByRole('button', { name: '查看 .meta' })).not.toBeInTheDocument()
    expect(within(metaTail).queryByRole('button', { name: '查看 Access 来源' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: '显示 Info' }))
    expect(screen.queryByLabelText('Resource .meta inspector')).not.toBeInTheDocument()
    expect(getEditableFileMetaTail()).toBe(metaTail)
    expect(screen.queryByRole('button', { name: /保存/ })).not.toBeInTheDocument()
    expect(within(getRichEditorTextbox()).getByRole('heading', { name: 'Hello' })).toBeInTheDocument()
    expect(getRichEditorTextbox()).toHaveAttribute('contenteditable', 'true')
    expect(screen.getByText(/LinX full raw/)).toBeInTheDocument()

    fireEvent.change(within(metaTail).getByLabelText('File title meta predicate'), { target: { value: 'Hello RDF' } })
    fireEvent.blur(within(metaTail).getByLabelText('File title meta predicate'))
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/public/README.md.meta',
        subject: '#meta',
        predicate: 'rdfs:label',
        previousValues: [],
        nextValues: ['"Hello RDF"'],
        writesCanonicalResource: false,
      }))
    })
    mockCreateCellProposal.mockClear()

    const reviewStatusInput = within(metaTail).getByLabelText('File review status meta predicate')
    fireEvent.change(reviewStatusInput, { target: { value: 'Ready' } })
    fireEvent.keyDown(reviewStatusInput, { key: 'Enter' })
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/public/README.md.meta',
        subject: '#meta',
        predicate: 'udfs:reviewStatus',
        previousValues: [],
        nextValues: ['"Ready"'],
        writesCanonicalResource: false,
      }))
    })
    mockCreateCellProposal.mockClear()

    fireEvent.change(getEditableFileMetaControl('File tags meta predicate'), { target: { value: 'docs' } })
    fireEvent.keyDown(getEditableFileMetaControl('File tags meta predicate'), { key: 'Enter' })
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/public/README.md.meta',
        subject: '#meta',
        predicate: 'udfs:tags',
        previousValues: [],
        nextValues: ['"docs"'],
        writesCanonicalResource: false,
      }))
    })
    expect(within(metaTail).getByLabelText('已选择值 docs')).toBeInTheDocument()
    mockCreateCellProposal.mockClear()

    fireEvent.change(getEditableFileMetaControl('File source meta predicate'), { target: { value: 'https://source.example/readme-v2' } })
    fireEvent.blur(getEditableFileMetaControl('File source meta predicate'))
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/public/README.md.meta',
        subject: '#meta',
        predicate: 'dcterms:source',
        previousValues: ['<https://source.example/readme>'],
        nextValues: ['<https://source.example/readme-v2>'],
        writesCanonicalResource: false,
      }))
    })

    selectFileEditorMode('源码')

    expect(screen.queryByTestId('rich-text-file-editor')).not.toBeInTheDocument()
    expect(screen.getByLabelText('原始内容')).toHaveValue('# Hello\nLinX full raw')
    expect(screen.getByRole('button', { name: '保存原始内容' })).toBeDisabled()
  })

  it('keeps editable file sheet chrome minimal until Info or More is requested', async () => {
    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    const editorSheet = screen.getByRole('dialog', { name: 'Hello' })
    const sheetHeader = within(editorSheet).getByLabelText('文件详情标题')

    expect(within(sheetHeader).getByText('README.md')).toBeInTheDocument()
    expect(within(sheetHeader).queryByText('text/markdown')).not.toBeInTheDocument()
    expect(within(sheetHeader).queryByText('https://pod.example/public/README.md')).not.toBeInTheDocument()
    expect(within(sheetHeader).queryByLabelText('文件详情 byline')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '富文本' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '源码' })).not.toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: '富文本块工具' })).not.toBeInTheDocument()

    expect(within(sheetHeader).getByRole('button', { name: '显示 Info' })).toBeInTheDocument()
    fireEvent.pointerDown(within(sheetHeader).getByRole('button', { name: '更多文件操作' }))
    expect(screen.getByRole('menuitem', { name: '源码' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '查看 Access 来源' })).toBeInTheDocument()
  })

  it('keeps editable file content out of the main detail pane until the sheet opens', async () => {
    useFilesStore.setState({ editableFileSheetOpenRequestUri: null })

    render(<FileDetailPane />)

    expect(screen.getAllByText('README.md').length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog', { name: 'Hello' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开文件编辑器' })).not.toBeInTheDocument()

    act(() => {
      useFilesStore.getState().requestEditableFileSheetOpen('https://pod.example/public/README.md')
    })

    expect(await screen.findByRole('dialog', { name: 'Hello' })).toBeInTheDocument()
    expect(getEditableFileMetaTail()).toBeInTheDocument()
  })

  it('restores the originating structured context when closing a document editor opened from a subject resource', async () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/public/README.md',
      selectedTreeNodeId: 'container:https://pod.example/public/',
      structuredViewMode: 'raw',
      structuredClassScope: 'udfs:Draft',
      structuredSearchText: 'stale',
      structuredSortKey: 'modifiedAt',
      structuredSortDirection: 'desc',
      structuredHiddenPredicates: new Set(['draftOnly']),
      structuredKanbanGroupPredicate: 'phase',
      structuredSubjectReturnContext: {
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '../docs/README.md',
        scrollTop: 144,
        rowIndex: 2,
        viewMode: 'kanban',
        classScope: 'udfs:Workspace',
        searchText: 'readme',
        sortKey: 'title',
        sortDirection: 'asc',
        hiddenPredicates: ['internalNotes'],
        kanbanGroupPredicate: 'status',
      },
    })
    requestDefaultEditableFileSheetOpen()

    render(<FileDetailPane />)

    const editorModal = await screen.findByRole('dialog', { name: 'Hello' })
    fireEvent.click(within(editorModal).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Hello' })).not.toBeInTheDocument())
    expect(useFilesStore.getState()).toMatchObject({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      detailTab: 'preview',
      structuredViewMode: 'kanban',
      structuredClassScope: 'udfs:Workspace',
      structuredSearchText: 'readme',
      structuredSortKey: 'title',
      structuredSortDirection: 'asc',
      structuredKanbanGroupPredicate: 'status',
      structuredSubjectReturnContext: null,
      structuredScrollRestoration: {
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '../docs/README.md',
        scrollTop: 144,
        rowIndex: 2,
      },
    })
    expect(Array.from(useFilesStore.getState().structuredHiddenPredicates)).toEqual(['internalNotes'])
  })

  it('uses the document heading as the single editable note title', async () => {
    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    const editorSheet = await screen.findByRole('dialog', { name: 'Hello' })
    expect(within(editorSheet).queryByRole('textbox', { name: '笔记标题' })).not.toBeInTheDocument()
    expect(within(editorSheet).getByRole('heading', { name: 'Hello', level: 1 })).toBeInTheDocument()
  })

  it('opens the editable file sheet when a folder or route requests it', async () => {
    useFilesStore.setState({ editableFileSheetOpenRequestUri: null })

    render(<FileDetailPane />)

    expect(screen.queryByRole('dialog', { name: 'Hello' })).not.toBeInTheDocument()

    act(() => {
      useFilesStore.getState().requestEditableFileSheetOpen('https://pod.example/public/README.md')
    })

    expect(await screen.findByRole('dialog', { name: 'Hello' })).toBeInTheDocument()
  })

  it('saves real rich editor edits from the editable file sheet through the raw resource mutation', async () => {
    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    const editor = getRichEditorTextbox()
    revealRichTextToolbar(editor)
    fireEvent.paste(editor, {
      clipboardData: {
        getData: (type: string) => type === 'text/plain' ? 'New sheet paragraph' : '<p>New sheet paragraph</p>',
      },
    })

    await waitFor(() => expect(screen.getByText('未保存')).toBeInTheDocument())

    fireEvent.blur(editor)

    await waitFor(() => {
      expect(mockMutateRaw).toHaveBeenCalledWith({
        resource: expect.objectContaining({
          uri: 'https://pod.example/public/README.md',
          mimeType: 'text/markdown',
          etag: '"raw-1"',
        }),
        content: expect.stringContaining('New sheet paragraph'),
      })
    })
  })

  it('keeps editable file content dirty when the raw resource save fails', async () => {
    mockMutateRaw.mockRejectedValueOnce(new Error('Pod write failed'))
    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    const editor = getRichEditorTextbox()
    revealRichTextToolbar(editor)
    fireEvent.paste(editor, {
      clipboardData: {
        getData: (type: string) => type === 'text/plain' ? 'Unsaved sheet paragraph' : '<p>Unsaved sheet paragraph</p>',
      },
    })

    await waitFor(() => expect(screen.getByText('未保存')).toBeInTheDocument())

    fireEvent.blur(editor)
    revealRichTextToolbar(editor)

    await waitFor(() => expect(screen.getByText('保存失败')).toBeInTheDocument())
    expect(screen.queryByText('已保存')).not.toBeInTheDocument()
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Pod write failed',
      variant: 'destructive',
    }))
  })

  it('requires an explicit discard after a failed save before closing the editor sheet', async () => {
    mockMutateRaw.mockRejectedValue(new Error('Pod write failed'))
    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    const editorSheet = await screen.findByRole('dialog', { name: 'Hello' })
    const editor = getRichEditorTextbox()
    revealRichTextToolbar(editor)
    fireEvent.paste(editor, {
      clipboardData: {
        getData: (type: string) => type === 'text/plain' ? 'Keep this draft' : '<p>Keep this draft</p>',
      },
    })
    await waitFor(() => expect(screen.getByText('未保存')).toBeInTheDocument())

    fireEvent.click(within(editorSheet).getByRole('button', { name: 'Close' }))

    const discardDialog = await screen.findByRole('dialog', { name: '未保存的修改' })
    expect(editorSheet).toBeInTheDocument()
    fireEvent.click(within(discardDialog).getByRole('button', { name: '继续编辑' }))
    expect(editorSheet).toBeInTheDocument()

    fireEvent.click(within(editorSheet).getByRole('button', { name: 'Close' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: '未保存的修改' })).getByRole('button', { name: '放弃修改' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Hello' })).not.toBeInTheDocument())
  })

  it('does not discard or outlive an in-flight rich-text save when closing the sheet', async () => {
    let resolveSave: ((value: unknown) => void) | undefined
    mockMutateRaw.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSave = resolve
    }))
    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    const editorSheet = await screen.findByRole('dialog', { name: 'Hello' })
    const editor = getRichEditorTextbox()
    fireEvent.paste(editor, {
      clipboardData: {
        getData: (type: string) => type === 'text/plain' ? 'Save before close' : '<p>Save before close</p>',
      },
    })
    fireEvent.blur(editor)
    await waitFor(() => expect(mockMutateRaw).toHaveBeenCalledTimes(1))

    fireEvent.click(within(editorSheet).getByRole('button', { name: 'Close' }))
    const discardDialog = await screen.findByRole('dialog', { name: '未保存的修改' })
    expect(within(discardDialog).getByRole('button', { name: '放弃修改' })).toBeDisabled()

    await act(async () => {
      resolveSave?.({
        uri: 'https://pod.example/public/README.md',
        content: '# Hello\nSave before close',
        mimeType: 'text/markdown',
        etag: '"raw-2"',
      })
    })

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Hello' })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: '未保存的修改' })).not.toBeInTheDocument()
  })

  it('requires an explicit discard before closing a dirty raw source draft', async () => {
    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    selectFileEditorMode('源码')
    fireEvent.change(screen.getByLabelText('原始内容'), {
      target: { value: '# Hello\nUnsaved raw draft' },
    })

    const editorSheet = screen.getByRole('dialog', { name: 'Hello' })
    fireEvent.click(within(editorSheet).getByRole('button', { name: 'Close' }))

    expect(await screen.findByRole('dialog', { name: '未保存的修改' })).toBeInTheDocument()
    expect(editorSheet).toBeInTheDocument()
  })

  it('requires an explicit discard before switching away from a dirty editor mode', async () => {
    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    selectFileEditorMode('源码')
    fireEvent.change(screen.getByLabelText('原始内容'), {
      target: { value: '# Hello\nKeep this raw draft' },
    })
    selectFileEditorMode('富文本')

    const discardDialog = await screen.findByRole('dialog', { name: '未保存的修改' })
    expect(screen.getByLabelText('原始内容')).toHaveValue('# Hello\nKeep this raw draft')

    fireEvent.click(within(discardDialog).getByRole('button', { name: '放弃修改' }))
    expect(getRichEditorTextbox()).toBeInTheDocument()
  })

  it('hydrates editable file RDF metadata from .meta and stages edits against the meta values', async () => {
    requestDefaultEditableFileSheetOpen()
    mockUseFilesMetaSidecar.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/public/README.md',
        metaUri: 'https://pod.example/public/README.md.meta',
        state: 'exists',
        status: 200,
        content: [
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '<#meta> rdfs:label "Readme metadata title" ;',
          '  udfs:reviewStatus "Needs review" ;',
          '  udfs:tags "core", "rdf" ;',
          '  dcterms:source <https://source.example/readme> .',
        ].join('\n'),
        mimeType: 'text/turtle',
        etag: '"meta-2"',
        size: 300,
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(getEditableFileMetaControl('File title meta predicate')).toHaveValue('Readme metadata title')
    expect(getEditableFileMetaControl('File review status meta predicate')).toHaveValue('Needs review')
    expect(within(getEditableFileMetaTail()).getByLabelText('已选择值 core')).toBeInTheDocument()
    expect(within(getEditableFileMetaTail()).getByLabelText('已选择值 rdf')).toBeInTheDocument()
    expect(getEditableFileMetaControl('File source meta predicate')).toHaveValue('https://source.example/readme')

    fireEvent.change(getEditableFileMetaControl('File title meta predicate'), { target: { value: 'Readme display title' } })
    fireEvent.blur(getEditableFileMetaControl('File title meta predicate'))
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/public/README.md.meta',
        subject: '#meta',
        predicate: 'rdfs:label',
        previousValues: ['"Readme metadata title"'],
        nextValues: ['"Readme display title"'],
        writesCanonicalResource: false,
      }))
    })
    mockCreateCellProposal.mockClear()

    const reviewStatusInput = getEditableFileMetaControl('File review status meta predicate')
    fireEvent.change(reviewStatusInput, { target: { value: 'Published' } })
    fireEvent.keyDown(reviewStatusInput, { key: 'Enter' })
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/public/README.md.meta',
        subject: '#meta',
        predicate: 'udfs:reviewStatus',
        previousValues: ['"Needs review"'],
        nextValues: ['"Published"'],
        writesCanonicalResource: false,
      }))
    })
    mockCreateCellProposal.mockClear()

    fireEvent.change(getEditableFileMetaControl('File tags meta predicate'), { target: { value: 'files' } })
    fireEvent.keyDown(getEditableFileMetaControl('File tags meta predicate'), { key: 'Enter' })
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/public/README.md.meta',
        subject: '#meta',
        predicate: 'udfs:tags',
        previousValues: ['"core"', '"rdf"'],
        nextValues: ['"core"', '"rdf"', '"files"'],
        writesCanonicalResource: false,
      }))
    })
  })

  it('shows field-level pending and error state for editable file RDF metadata predicate proposals', async () => {
    requestDefaultEditableFileSheetOpen()
    mockUseFilesMetaSidecar.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/public/README.md',
        metaUri: 'https://pod.example/public/README.md.meta',
        state: 'exists',
        status: 200,
        content: [
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '<#meta> rdfs:label "Readme metadata title" ;',
          '  udfs:reviewStatus "Needs review" ;',
          '  udfs:tags "core", "rdf" ;',
          '  dcterms:source <https://source.example/readme> .',
        ].join('\n'),
        mimeType: 'text/turtle',
        etag: '"meta-2"',
        size: 300,
      },
      isLoading: false,
      error: null,
    })
    mockCreateCellProposal
      .mockResolvedValueOnce('https://pod.example/.data/approvals/2026/06/17.ttl#title-approval')
      .mockRejectedValueOnce(new Error('proposal write failed'))

    render(<FileDetailPane />)

    fireEvent.change(getEditableFileMetaControl('File title meta predicate'), { target: { value: 'Readme display title' } })
    fireEvent.blur(getEditableFileMetaControl('File title meta predicate'))

    await waitFor(() => {
      expect(screen.getByLabelText('待审核更改：File title meta predicate')).toHaveTextContent('*')
    })
    expect(screen.queryByLabelText('meta predicate 更改提交失败：File title meta predicate')).not.toBeInTheDocument()

    fireEvent.change(getEditableFileMetaControl('File tags meta predicate'), { target: { value: 'files' } })
    fireEvent.keyDown(getEditableFileMetaControl('File tags meta predicate'), { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByLabelText('meta predicate 更改提交失败：File tags meta predicate')).toHaveTextContent('!')
    })
    expect(within(getEditableFileMetaTail()).getByLabelText('已选择值 files')).toBeInTheDocument()
    expect(screen.getByLabelText('待审核更改：File title meta predicate')).toBeInTheDocument()

    fireEvent.change(getEditableFileMetaControl('File source meta predicate'), { target: { value: 'https://source.example/readme-v2' } })
    fireEvent.blur(getEditableFileMetaControl('File source meta predicate'))

    await waitFor(() => {
      expect(screen.getByLabelText('待审核更改：File source meta predicate')).toHaveTextContent('*')
    })
  })

  it('hydrates pending editable file RDF metadata predicate proposals from Inbox targets', () => {
    requestDefaultEditableFileSheetOpen()
    mockUseFilesMetaSidecar.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/public/README.md',
        metaUri: 'https://pod.example/public/README.md.meta',
        state: 'exists',
        status: 200,
        content: [
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '<#meta> rdfs:label "Readme metadata title" ;',
          '  udfs:reviewStatus "Needs review" ;',
          '  udfs:tags "core", "rdf" ;',
          '  dcterms:source <https://source.example/readme> .',
        ].join('\n'),
        mimeType: 'text/turtle',
        etag: '"meta-2"',
        size: 300,
      },
      isLoading: false,
      error: null,
    })
    mockUsePendingStructuredCellChangeProposals.mockReturnValue({
      data: [
        createStructuredCellChangeProposal({
          documentUri: 'https://pod.example/public/README.md.meta',
          subject: '#meta',
          predicate: 'rdfs:label',
          previousValues: ['"Readme metadata title"'],
          nextValues: ['"Readme display title"'],
          createdAt: '2026-06-18T00:00:00.000Z',
        }),
        createStructuredCellChangeProposal({
          documentUri: 'https://pod.example/public/README.md.meta',
          subject: '#meta',
          predicate: 'udfs:tags',
          previousValues: ['"core"', '"rdf"'],
          nextValues: ['"core"', '"rdf"', '"files"'],
          createdAt: '2026-06-18T00:00:00.000Z',
        }),
        createStructuredCellChangeProposal({
          documentUri: 'https://pod.example/public/README.md.meta',
          subject: '#meta',
          predicate: 'dcterms:source',
          previousValues: ['<https://source.example/readme>'],
          nextValues: ['<https://source.example/readme-v2>'],
          createdAt: '2026-06-18T00:00:00.000Z',
        }),
      ],
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(mockUsePendingStructuredCellChangeProposals).toHaveBeenCalledWith('https://pod.example/public/README.md.meta', true)
    expect(getEditableFileMetaControl('File title meta predicate')).toHaveValue('Readme display title')
    expect(within(getEditableFileMetaTail()).getByLabelText('已选择值 core')).toBeInTheDocument()
    expect(within(getEditableFileMetaTail()).getByLabelText('已选择值 rdf')).toBeInTheDocument()
    expect(within(getEditableFileMetaTail()).getByLabelText('已选择值 files')).toBeInTheDocument()
    expect(getEditableFileMetaControl('File source meta predicate')).toHaveValue('https://source.example/readme-v2')
    expect(within(getEditableFileMetaTail()).getByLabelText('待审核更改：File title meta predicate')).toHaveTextContent('*')
    expect(within(getEditableFileMetaTail()).getByLabelText('待审核更改：File tags meta predicate')).toHaveTextContent('*')
    expect(within(getEditableFileMetaTail()).getByLabelText('待审核更改：File source meta predicate')).toHaveTextContent('*')
  })

  it('stages editable file RDF metadata predicate edits against the existing owner subject in .meta', async () => {
    requestDefaultEditableFileSheetOpen()
    mockUseFilesMetaSidecar.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/public/README.md',
        metaUri: 'https://pod.example/public/README.md.meta',
        state: 'exists',
        status: 200,
        content: [
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '<#audit> rdfs:label "Audit title" ; udfs:tags "audit" .',
          '<https://pod.example/public/README.md> rdfs:label "Owner title" ;',
          '  udfs:tags "owner" ;',
          '  dcterms:source <https://source.example/readme> .',
        ].join('\n'),
        mimeType: 'text/turtle',
        etag: '"meta-owner-1"',
        size: 300,
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(getEditableFileMetaControl('File title meta predicate')).toHaveValue('Owner title')
    expect(within(getEditableFileMetaTail()).getByLabelText('已选择值 owner')).toBeInTheDocument()
    fireEvent.change(getEditableFileMetaControl('File title meta predicate'), { target: { value: 'Owner title v2' } })
    fireEvent.blur(getEditableFileMetaControl('File title meta predicate'))

    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/public/README.md.meta',
        subject: 'https://pod.example/public/README.md',
        predicate: 'rdfs:label',
        previousValues: ['"Owner title"'],
        nextValues: ['"Owner title v2"'],
        writesCanonicalResource: false,
      }))
    })
  })

  it('keeps the detail head compact without duplicating content breadcrumbs', () => {
    useFilesStore.setState({ editableFileSheetOpenRequestUri: null })

    render(<FileDetailPane />)

    expect(screen.queryByRole('navigation', { name: 'Files breadcrumb' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('文件详情 head')).toHaveClass('min-h-12')

    openResourceActionsMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '进入所在容器' }))

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('container:https://pod.example/public/')
  })

  it('renders source-linked card detail from imported card turtle', async () => {
    const manifestUri = 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl'
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      subject: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md',
      sourceUri: 'https://example.com/report.pdf',
      parserManifestUri: manifestUri,
      parserVersion: 'pdf-parser-v1',
      sourceHash: 'sha256-pdf-1',
      summary: '审阅 Quarterly report 的来源。',
      diff: 'Ingest 已刷新 report 标题和摘要。',
      proposedContent: [
        '<!-- linx-source-block id="chunk:proposal" hash="sha256-pdf-1" origin="source" -->',
        '# Quarterly report',
        '',
        'Open [source](https://example.com/report.pdf) and keep **ingest draft** body.',
      ].join('\n'),
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        name: 'quarterly-report.card.ttl',
        kind: 'resource',
        semanticKind: 'source-linked-card',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        mimeType: 'text/turtle',
        size: 512,
        modifiedAt: '2026-06-17T00:00:00Z',
        headers: {},
        previewText: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '',
          '<#card> a udfs:SourceLinkedCard ;',
          '  rdfs:label "Quarterly report" ;',
          '  udfs:reviewStatus "Needs review" ;',
          '  udfs:tags "source-linked", "finance" ;',
          '  dcterms:source <https://example.com/report.pdf> ;',
          '  dcterms:format "application/pdf" ;',
          '  udfs:sourceKind "pdf" ;',
          '  udfs:sourceHash "sha256-pdf-1" ;',
          '  udfs:parserVersion "pdf-parser-v1" ;',
          `  udfs:parserManifest <${manifestUri}> ;`,
          '  udfs:bodyResource <https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md> ;',
          '  dcterms:created "2026-06-17T00:00:00.000Z" ;',
          '  udfs:writesCanonicalContent false .',
        ].join('\n'),
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri === proposal.proposalResourceUri) {
        return {
          data: {
            uri,
            content: renderSourceUpdateProposalTurtle(proposal),
            mimeType: 'text/turtle',
            etag: '"source-proposal-1"',
            headers: {},
          },
          isLoading: false,
          error: null,
        }
      }
      if (uri === manifestUri) {
        return {
          data: {
            uri,
            content: [
              '@prefix udfs: <https://undefineds.co/vocab/> .',
              '@prefix dcterms: <http://purl.org/dc/terms/> .',
              '',
              '<#manifest> a udfs:ParserIndexManifest ;',
              '  dcterms:source <https://example.com/report.pdf> ;',
              '  udfs:sourceHash "sha256-pdf-1" ;',
              '  udfs:parserVersion "pdf-parser-v1" ;',
              '  udfs:parserStatus "partial" ;',
              '  udfs:readChunks 3 ;',
              '  udfs:totalChunks 12 ;',
              '  udfs:parsedRange "page:1..page:3" ;',
              '  udfs:pendingRange "page:4..page:8" ;',
              '  udfs:pendingRange "page:9..page:12" ;',
              '  udfs:priorityQueue "page:4..page:8" ;',
              '  udfs:lastParsedAt "2026-06-17T01:00:00.000Z" ;',
              '  udfs:writesCanonicalContent false .',
            ].join('\n'),
            mimeType: 'text/turtle',
            etag: '"manifest-1"',
            headers: {},
          },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: null,
        isLoading: false,
        error: new FilesResourceReadError(uri, { status: 404 }),
      }
    })
    mockUseApprovalByTarget.mockReturnValue({
      data: {
        id: 'source-approval-1',
        target: proposal.id,
        status: 'pending',
        createdAt: new Date('2026-06-17T02:00:00.000Z'),
      },
      isLoading: false,
      error: null,
    })
    mockUsePendingSourceUpdateProposals.mockReturnValue({
      data: [proposal],
      isLoading: false,
      error: null,
    })
    mockRefreshSourceLinkedCard.mockResolvedValueOnce({
      action: 'changed',
      sourceProposal: {
        proposalResourceUri: 'https://pod.example/.data/proposals/source/refreshed-pdf.ttl',
      },
    })

    render(<FileDetailPane />)

    expect(screen.getByRole('button', { name: 'Ingest 与审批' })).toBeInTheDocument()
    expect(screen.getAllByText('Quarterly report').length).toBeGreaterThan(0)
    expect(screen.getAllByText('https://example.com/report.pdf').length).toBeGreaterThan(0)
    expect(screen.queryByText('Ingest 状态')).not.toBeInTheDocument()
    expect(screen.queryByText('Source proposal')).not.toBeInTheDocument()
    expect(screen.queryByText('审批 ID')).not.toBeInTheDocument()
    expect(screen.queryByText(manifestUri)).not.toBeInTheDocument()
    expect(screen.queryByText('canonical 内容需审批后更新')).not.toBeInTheDocument()
    expect(screen.queryByText('Source-linked card')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Quarterly report' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Quarterly report' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'source' })).toHaveAttribute('href', 'https://example.com/report.pdf')
    expect(screen.getByText('ingest draft').tagName.toLowerCase()).toBe('strong')
    expect(screen.queryByText(/linx-source-block/)).not.toBeInTheDocument()
    const bodyPreview = screen.getByText(/body\./)
    expect(bodyPreview).toBeInTheDocument()
    expect(screen.queryByLabelText('文件 meta')).not.toBeInTheDocument()
    openHeaderMetaDrawer()
    const metaDrawer = screen.getByLabelText('Resource .meta inspector')
    expect(bodyPreview.compareDocumentPosition(metaDrawer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(metaDrawer).getByLabelText('RDF metadata')).toBeInTheDocument()
    expect(within(metaDrawer).getByLabelText('Card title meta predicate')).toHaveValue('Quarterly report')
    expect(within(metaDrawer).getByRole('combobox', { name: 'Card review status meta predicate' })).toHaveValue('Needs review')
    expect(within(metaDrawer).getByLabelText('已选择值 source-linked')).toBeInTheDocument()
    expect(within(metaDrawer).getByLabelText('已选择值 finance')).toBeInTheDocument()
    expect(within(metaDrawer).getByLabelText('Card relation meta predicate')).toHaveValue('https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md')

    const reviewStatusInput = within(metaDrawer).getByRole('combobox', { name: 'Card review status meta predicate' })
    fireEvent.change(reviewStatusInput, { target: { value: 'Ready' } })
    fireEvent.keyDown(reviewStatusInput, { key: 'Enter' })
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        subject: '#card',
        predicate: 'udfs:reviewStatus',
        previousValues: ['"Needs review"'],
        nextValues: ['"Ready"'],
        writesCanonicalResource: false,
      }))
    })
    expect(within(metaDrawer).getByLabelText('待审核更改：Card review status meta predicate')).toHaveTextContent('*')
    mockCreateCellProposal.mockClear()

    mockCreateCellProposal.mockRejectedValueOnce(new Error('proposal write failed'))
    const tagsInput = within(metaDrawer).getByRole('combobox', { name: 'Card tags meta predicate' })
    fireEvent.change(tagsInput, { target: { value: 'audited' } })
    fireEvent.keyDown(tagsInput, { key: 'Enter' })
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        subject: '#card',
        predicate: 'udfs:tags',
        previousValues: ['"source-linked"', '"finance"'],
        nextValues: ['"source-linked"', '"finance"', '"audited"'],
        writesCanonicalResource: false,
      }))
    })
    expect(within(metaDrawer).getByLabelText('meta predicate 更改提交失败：Card tags meta predicate')).toHaveTextContent('!')
    expect(within(metaDrawer).getByLabelText('已选择值 audited')).toBeInTheDocument()
    mockCreateCellProposal.mockClear()

    fireEvent.change(screen.getByLabelText('Card title meta predicate'), { target: { value: 'Quarterly report v2' } })
    fireEvent.blur(screen.getByLabelText('Card title meta predicate'))
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        subject: '#card',
        predicate: 'rdfs:label',
        previousValues: ['"Quarterly report"'],
        nextValues: ['"Quarterly report v2"'],
        writesCanonicalResource: false,
      }))
    })
    mockCreateCellProposal.mockClear()

    fireEvent.change(screen.getByLabelText('Card relation meta predicate'), { target: { value: 'https://pod.example/.data/workspaces/ws-1/cards/revised-report.md' } })
    fireEvent.blur(screen.getByLabelText('Card relation meta predicate'))
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        subject: '#card',
        predicate: 'udfs:bodyResource',
        previousValues: ['<https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md>'],
        nextValues: ['<https://pod.example/.data/workspaces/ws-1/cards/revised-report.md>'],
        writesCanonicalResource: false,
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Ingest 与审批' }))

    expect(screen.getAllByText(manifestUri).length).toBeGreaterThan(0)
    expect(screen.getByText('Ingest 记录')).toBeInTheDocument()
    expect(screen.queryByText('Ingest manifest')).not.toBeInTheDocument()
    expect(screen.getByText('Ingest')).toBeInTheDocument()
    expect(screen.queryByText('Source Ingest')).not.toBeInTheDocument()
    expect(screen.getByText('pdf-ingest-v1')).toBeInTheDocument()
    expect(screen.queryByText('pdf-parser-v1')).not.toBeInTheDocument()
    expect(screen.getByText('Ingest 状态')).toBeInTheDocument()
    expect(screen.getByText('partial')).toBeInTheDocument()
    expect(screen.getByText('已 Ingest chunk')).toBeInTheDocument()
    expect(screen.getByText('3 / 12')).toBeInTheDocument()
    expect(screen.getByText('待 Ingest')).toBeInTheDocument()
    expect(screen.getByText('page:4..page:8, page:9..page:12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ingest 下一段' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ingest 全部' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '处理下一段' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '处理全部' })).not.toBeInTheDocument()
    expect(screen.getByText('最近 Ingest')).toBeInTheDocument()
    expect(screen.getAllByText(/2026.*6.*17/).length).toBeGreaterThan(0)
    expect(screen.getByText('Ingest 审批')).toBeInTheDocument()
    expect(screen.queryByText('Ingest proposal')).not.toBeInTheDocument()
    expect(screen.getByText('审阅 Quarterly report 的来源。')).toBeInTheDocument()
    expect(screen.getByText('Ingest 已刷新 report 标题和摘要。')).toBeInTheDocument()
    expect(screen.getByText('待审批内容')).toBeInTheDocument()
    expect(screen.getByText('已准备')).toBeInTheDocument()
    expect(screen.getByText('审批状态')).toBeInTheDocument()
    expect(screen.getByText('审批 ID')).toBeInTheDocument()
    expect(screen.getByText('source-approval-1')).toBeInTheDocument()
    expect(mockUseApprovalByTarget).toHaveBeenCalledWith(proposal.id, expect.objectContaining({ enabled: true }))
    expect(screen.getByText('canonical 内容需审批后更新')).toBeInTheDocument()
    expect(screen.getAllByText('Source-linked card').length).toBeGreaterThan(0)

    expect(screen.getByRole('button', { name: '刷新来源' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '刷新来源' }))
    await waitFor(() => {
      expect(mockRefreshSourceLinkedCard).toHaveBeenCalledWith({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        subject: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl#card',
        targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md',
        sourceUri: 'https://example.com/report.pdf',
        sourceKind: 'pdf',
        title: 'Quarterly report',
        mimeType: 'application/pdf',
        currentSourceHash: 'sha256-pdf-1',
        ingestVersion: 'pdf-parser-v1',
        sourceIngestManifestUri: manifestUri,
      })
    })
    expect(mockToast).toHaveBeenCalledWith({ description: '来源已变化，Ingest 审批已创建' })
    mockRefreshSourceLinkedCard.mockClear()

    mockRequestIngestRange.mockResolvedValueOnce({
      action: 'reused',
      manifest: null,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ingest 下一段' }))
    await waitFor(() => {
      expect(mockRequestIngestRange).toHaveBeenCalledWith({
        manifest: expect.objectContaining({
          manifestUri,
          sourceUri: 'https://example.com/report.pdf',
          sourceHash: 'sha256-pdf-1',
          ingestVersion: 'pdf-parser-v1',
        }),
        range: { start: 'page:4', end: 'page:8' },
      })
    })
    expect(mockToast).toHaveBeenCalledWith({ description: 'Ingest 队列已有：page:4..page:8' })
    mockRequestIngestRange.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Ingest 全部' }))
    await waitFor(() => {
      expect(mockRequestIngestRange).toHaveBeenCalledWith({
        manifest: expect.objectContaining({
          manifestUri,
          sourceUri: 'https://example.com/report.pdf',
          sourceHash: 'sha256-pdf-1',
          ingestVersion: 'pdf-parser-v1',
        }),
        ranges: [
          { start: 'page:4', end: 'page:8' },
          { start: 'page:9', end: 'page:12' },
        ],
      })
    })
    expect(mockToast).toHaveBeenCalledWith({ description: '已加入 Ingest 队列：全部 2 段' })

    fireEvent.click(screen.getByRole('button', { name: '打开来源' }))
    expect(window.open).toHaveBeenCalledWith('https://example.com/report.pdf', '_blank', 'noopener,noreferrer')

    fireEvent.click(screen.getByRole('button', { name: '编辑正文' }))
    expect(screen.getByRole('dialog', { name: 'Quarterly report' })).toBeInTheDocument()
    closeAutoOpenedFileSheet()

    fireEvent.click(screen.getByRole('button', { name: '打开正文资源' }))
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md')

    act(() => {
      useFilesStore.setState({ selectedFileId: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl' })
    })
    fireEvent.click(screen.getByRole('button', { name: '审阅 Ingest' }))
    expect(useFilesStore.getState().selectedFileId).toBe(proposal.proposalResourceUri)
    expect(mockCreateSourceProposal).not.toHaveBeenCalled()
  })

  it('shows unknown Ingest chunk totals instead of impossible progress', () => {
    const manifestUri = 'https://pod.example/.data/ingest/sources/example-com-report-025svsu/manifest.ttl'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        name: 'quarterly-report.card.ttl',
        kind: 'resource',
        semanticKind: 'source-linked-card',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        mimeType: 'text/turtle',
        size: 512,
        modifiedAt: '2026-06-17T00:00:00Z',
        headers: {},
        previewText: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '',
          '<#card> a udfs:SourceLinkedCard ;',
          '  rdfs:label "Quarterly report" ;',
          '  dcterms:source <https://example.com/report> ;',
          '  dcterms:format "text/html" ;',
          '  udfs:sourceKind "url" ;',
          '  udfs:sourceHash "sha256-url-1" ;',
          '  udfs:ingestVersion "url-ingest-v1" ;',
          `  udfs:ingestManifest <${manifestUri}> ;`,
          '  udfs:bodyResource <https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md> ;',
          '  dcterms:created "2026-06-17T00:00:00.000Z" ;',
          '  udfs:writesCanonicalContent false .',
        ].join('\n'),
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri === manifestUri) {
        return {
          data: {
            uri,
            content: [
              '@prefix udfs: <https://undefineds.co/vocab/> .',
              '@prefix dcterms: <http://purl.org/dc/terms/> .',
              '',
              '<#manifest> a udfs:SourceIngestManifest ;',
              '  dcterms:source <https://example.com/report> ;',
              '  udfs:sourceHash "sha256-url-1" ;',
              '  udfs:ingestVersion "url-ingest-v1" ;',
              '  udfs:ingestStatus "partial" ;',
              '  udfs:readChunks 1 ;',
              '  udfs:totalChunks 0 ;',
              '  udfs:ingestedRange "chunk:1..chunk:1" ;',
              '  udfs:pendingRange "chunk:2..chunk:*" ;',
              '  udfs:priorityQueue "chunk:2" ;',
              '  udfs:lastIngestedAt "2026-06-17T01:00:00.000Z" ;',
              '  udfs:writesCanonicalContent false .',
            ].join('\n'),
            mimeType: 'text/turtle',
            etag: '"manifest-1"',
            headers: {},
          },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: {
          uri,
          content: '# Quarterly report\n\nStaged body preview.',
          mimeType: 'text/markdown',
          etag: '"body-1"',
          headers: {},
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: 'Ingest 与审批' }))

    expect(screen.getByText('已 Ingest chunk')).toBeInTheDocument()
    expect(screen.queryByText('1 / 0')).not.toBeInTheDocument()
    expect(screen.getByText('1 / 未知')).toBeInTheDocument()
  })

  it('hydrates pending source-linked card RDF metadata predicate proposals from Inbox targets', () => {
    const manifestUri = 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        name: 'quarterly-report.card.ttl',
        kind: 'resource',
        semanticKind: 'source-linked-card',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        mimeType: 'text/turtle',
        size: 512,
        modifiedAt: '2026-06-17T00:00:00Z',
        headers: {},
        previewText: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '',
          '<#card> a udfs:SourceLinkedCard ;',
          '  rdfs:label "Quarterly report" ;',
          '  udfs:reviewStatus "Needs review" ;',
          '  udfs:tags "source-linked", "finance" ;',
          '  dcterms:source <https://example.com/report.pdf> ;',
          '  dcterms:format "application/pdf" ;',
          '  udfs:sourceKind "pdf" ;',
          '  udfs:sourceHash "sha256-pdf-1" ;',
          '  udfs:parserVersion "pdf-parser-v1" ;',
          `  udfs:parserManifest <${manifestUri}> ;`,
          '  udfs:bodyResource <https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md> ;',
          '  dcterms:created "2026-06-17T00:00:00.000Z" ;',
          '  udfs:writesCanonicalContent false .',
        ].join('\n'),
      },
      isLoading: false,
      error: null,
    })
    mockUsePendingStructuredCellChangeProposals.mockReturnValue({
      data: [
        createStructuredCellChangeProposal({
          documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
          subject: '#card',
          predicate: 'rdfs:label',
          previousValues: ['"Quarterly report"'],
          nextValues: ['"Quarterly report reviewed"'],
          createdAt: '2026-06-18T00:00:00.000Z',
        }),
        createStructuredCellChangeProposal({
          documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
          subject: '#card',
          predicate: 'udfs:reviewStatus',
          previousValues: ['"Needs review"'],
          nextValues: ['"Ready"'],
          createdAt: '2026-06-18T00:00:00.000Z',
        }),
        createStructuredCellChangeProposal({
          documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
          subject: '#card',
          predicate: 'udfs:tags',
          previousValues: ['"source-linked"', '"finance"'],
          nextValues: ['"source-linked"', '"finance"', '"audited"'],
          createdAt: '2026-06-18T00:00:00.000Z',
        }),
        createStructuredCellChangeProposal({
          documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
          subject: '#card',
          predicate: 'udfs:bodyResource',
          previousValues: ['<https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md>'],
          nextValues: ['<https://pod.example/.data/workspaces/ws-1/cards/quarterly-report-reviewed.md>'],
          createdAt: '2026-06-18T00:00:00.000Z',
        }),
      ],
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(mockUsePendingStructuredCellChangeProposals).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Card title meta predicate')).not.toBeInTheDocument()
    openHeaderMetaDrawer()
    expect(mockUsePendingStructuredCellChangeProposals).toHaveBeenCalledWith(
      'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      true,
    )
    const metaDrawer = screen.getByLabelText('Resource .meta inspector')
    expect(within(metaDrawer).getByLabelText('Card title meta predicate')).toHaveValue('Quarterly report reviewed')
    expect(within(metaDrawer).getByRole('combobox', { name: 'Card review status meta predicate' })).toHaveValue('Ready')
    expect(within(metaDrawer).getByLabelText('已选择值 source-linked')).toBeInTheDocument()
    expect(within(metaDrawer).getByLabelText('已选择值 finance')).toBeInTheDocument()
    expect(within(metaDrawer).getByLabelText('已选择值 audited')).toBeInTheDocument()
    expect(within(metaDrawer).getByLabelText('Card relation meta predicate')).toHaveValue('https://pod.example/.data/workspaces/ws-1/cards/quarterly-report-reviewed.md')
    expect(within(metaDrawer).getByLabelText('待审核更改：Card title meta predicate')).toHaveTextContent('*')
    expect(within(metaDrawer).getByLabelText('待审核更改：Card review status meta predicate')).toHaveTextContent('*')
    expect(within(metaDrawer).getByLabelText('待审核更改：Card tags meta predicate')).toHaveTextContent('*')
    expect(within(metaDrawer).getByLabelText('待审核更改：Card relation meta predicate')).toHaveTextContent('*')
    fireEvent.blur(within(metaDrawer).getByLabelText('Card title meta predicate'))
    expect(mockCreateCellProposal).not.toHaveBeenCalled()
  })

  it('hydrates pending Ingest proposals for source-linked cards outside .data', async () => {
    const cardUri = 'https://pod.example/public/reports/report.card.ttl'
    const bodyUri = 'https://pod.example/public/reports/report.md'
    const manifestUri = 'https://pod.example/.data/ingest/sources/example-com-report-01rzlsa/manifest.ttl'
    const proposal = createSourceUpdateProposal({
      documentUri: cardUri,
      subject: `${cardUri}#card`,
      targetResourceUri: bodyUri,
      sourceUri: 'https://example.com/report',
      sourceIngestManifestUri: manifestUri,
      ingestVersion: 'url-ingest-v1',
      sourceHash: 'sha256-url-2',
      summary: '审阅 public report 的来源。',
      diff: 'Ingest 已暂存更新后的 public report 正文。',
      proposedContent: '# Public report\n\nPending Ingest body.',
      createdAt: '2026-06-18T05:00:00.000Z',
    })
    useFilesStore.setState({
      selectedFileId: cardUri,
      editableFileSheetOpenRequestUri: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: cardUri,
        uri: cardUri,
        name: 'report.card.ttl',
        kind: 'resource',
        semanticKind: 'source-linked-card',
        parentUri: 'https://pod.example/public/reports/',
        mimeType: 'text/turtle',
        size: 512,
        modifiedAt: '2026-06-18T00:00:00Z',
        headers: {},
        previewText: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '',
          '<#card> a udfs:SourceLinkedCard ;',
          '  rdfs:label "Public report" ;',
          '  dcterms:source <https://example.com/report> ;',
          '  dcterms:format "text/html" ;',
          '  udfs:sourceKind "url" ;',
          '  udfs:sourceHash "sha256-url-1" ;',
          '  udfs:ingestVersion "url-ingest-v1" ;',
          `  udfs:ingestManifest <${manifestUri}> ;`,
          `  udfs:bodyResource <${bodyUri}> ;`,
          '  dcterms:created "2026-06-18T00:00:00.000Z" ;',
          '  udfs:writesCanonicalContent false .',
        ].join('\n'),
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri === manifestUri) {
        return {
          data: {
            uri,
            content: [
              '@prefix udfs: <https://undefineds.co/vocab/> .',
              '@prefix dcterms: <http://purl.org/dc/terms/> .',
              '',
              '<#manifest> a udfs:SourceIngestManifest ;',
              '  dcterms:source <https://example.com/report> ;',
              '  udfs:sourceHash "sha256-url-2" ;',
              '  udfs:ingestVersion "url-ingest-v1" ;',
              '  udfs:ingestStatus "partial" ;',
              '  udfs:readChunks 1 ;',
              '  udfs:totalChunks 2 ;',
              '  udfs:pendingRange "chunk:2..chunk:2" ;',
              '  udfs:lastIngestedAt "2026-06-18T05:00:00.000Z" ;',
              '  udfs:writesCanonicalContent false .',
            ].join('\n'),
            mimeType: 'text/turtle',
            etag: '"manifest-public-1"',
            headers: {},
          },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: {
          uri,
          content: '# Public report\n\nCanonical body.',
          mimeType: 'text/markdown',
          etag: '"body-public-1"',
          headers: { etag: '"body-public-1"', 'content-type': 'text/markdown' },
        },
        isLoading: false,
        error: null,
      }
    })
    mockUsePendingSourceUpdateProposals.mockReturnValue({
      data: [proposal],
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(mockUsePendingSourceUpdateProposals).toHaveBeenCalledWith(cardUri, true)
    expect(screen.getByRole('heading', { name: 'Public report' })).toBeInTheDocument()
    expect(screen.getByText('Canonical body.')).toBeInTheDocument()
    expect(screen.queryByText('Pending Ingest body.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ingest 与审批' }))
    expect(screen.getByText('审阅 public report 的来源。')).toBeInTheDocument()
    expect(screen.getByText('Ingest 已暂存更新后的 public report 正文。')).toBeInTheDocument()
    expect(screen.getByText(/Pending Ingest body/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '审阅 Ingest' }))
    expect(useFilesStore.getState().selectedFileId).toBe(proposal.proposalResourceUri)
    expect(mockRefreshSourceLinkedCard).not.toHaveBeenCalled()
    expect(mockCreateSourceProposal).not.toHaveBeenCalled()
  })

  it('keeps local source-linked card edits by submitting a source proposal without writing the body resource', async () => {
    const manifestUri = 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        name: 'quarterly-report.card.ttl',
        kind: 'resource',
        semanticKind: 'source-linked-card',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        mimeType: 'text/turtle',
        size: 512,
        modifiedAt: '2026-06-17T00:00:00Z',
        headers: {},
        previewText: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '',
          '<#card> a udfs:SourceLinkedCard ;',
          '  rdfs:label "Quarterly report" ;',
          '  udfs:reviewStatus "Needs review" ;',
          '  dcterms:source <https://example.com/report.pdf> ;',
          '  dcterms:format "application/pdf" ;',
          '  udfs:sourceKind "pdf" ;',
          '  udfs:sourceHash "sha256-pdf-1" ;',
          '  udfs:parserVersion "pdf-parser-v1" ;',
          `  udfs:parserManifest <${manifestUri}> ;`,
          '  udfs:bodyResource <https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md> ;',
          '  dcterms:created "2026-06-17T00:00:00.000Z" ;',
          '  udfs:writesCanonicalContent false .',
        ].join('\n'),
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: {
        uri,
        content: uri === manifestUri
          ? [
              '@prefix udfs: <https://undefineds.co/vocab/> .',
              '@prefix dcterms: <http://purl.org/dc/terms/> .',
              '',
              '<#manifest> a udfs:ParserIndexManifest ;',
              '  dcterms:source <https://example.com/report.pdf> ;',
              '  udfs:sourceHash "sha256-pdf-1" ;',
              '  udfs:parserVersion "pdf-parser-v1" ;',
              '  udfs:parserStatus "partial" ;',
              '  udfs:readChunks 3 ;',
              '  udfs:totalChunks 12 ;',
              '  udfs:pendingRange "page:4..page:12" ;',
              '  udfs:lastParsedAt "2026-06-17T01:00:00.000Z" ;',
              '  udfs:writesCanonicalContent false .',
            ].join('\n')
          : '# Quarterly report\n\nLocal edited body that should win.',
        mimeType: uri.endsWith('.ttl') ? 'text/turtle' : 'text/markdown',
        etag: '"body-1"',
        headers: { etag: '"body-1"' },
      },
      isLoading: false,
      error: null,
    }))
    mockUseApprovalByTarget.mockReturnValue({
      data: {
        id: 'source-approval-keep-local',
        target: 'https://pod.example/.data/proposals/source/quarterly-report-card-ttl-card-https-example-com-report-pdf.ttl#proposal',
        status: 'pending',
        createdAt: new Date('2026-06-17T02:00:00.000Z'),
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: 'Ingest 与审批' }))
    fireEvent.click(screen.getByRole('button', { name: '保留本地编辑' }))

    await waitFor(() => expect(mockResolveInboxApproval).toHaveBeenCalledTimes(1))
    expect(mockResolveInboxApproval).toHaveBeenCalledWith(expect.objectContaining({
      approval: expect.objectContaining({
        id: 'source-approval-keep-local',
      }),
      decision: 'rejected',
      reason: 'Keep local edits for Quarterly report.',
    }))
    expect(mockCreateSourceProposal).not.toHaveBeenCalled()
    expect(mockMutateRaw).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith({ description: '本地编辑已保留' })
  })

  it('shows a local source-linked card error when keeping local edits fails', async () => {
    const manifestUri = 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        name: 'quarterly-report.card.ttl',
        kind: 'resource',
        semanticKind: 'source-linked-card',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        mimeType: 'text/turtle',
        size: 512,
        modifiedAt: '2026-06-17T00:00:00Z',
        headers: {},
        previewText: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '',
          '<#card> a udfs:SourceLinkedCard ;',
          '  rdfs:label "Quarterly report" ;',
          '  udfs:reviewStatus "Needs review" ;',
          '  dcterms:source <https://example.com/report.pdf> ;',
          '  dcterms:format "application/pdf" ;',
          '  udfs:sourceKind "pdf" ;',
          '  udfs:sourceHash "sha256-pdf-1" ;',
          '  udfs:parserVersion "pdf-parser-v1" ;',
          `  udfs:parserManifest <${manifestUri}> ;`,
          '  udfs:bodyResource <https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.md> ;',
          '  dcterms:created "2026-06-17T00:00:00.000Z" ;',
          '  udfs:writesCanonicalContent false .',
        ].join('\n'),
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: {
        uri,
        content: uri === manifestUri
          ? [
              '@prefix udfs: <https://undefineds.co/vocab/> .',
              '@prefix dcterms: <http://purl.org/dc/terms/> .',
              '',
              '<#manifest> a udfs:ParserIndexManifest ;',
              '  dcterms:source <https://example.com/report.pdf> ;',
              '  udfs:sourceHash "sha256-pdf-1" ;',
              '  udfs:parserVersion "pdf-parser-v1" ;',
              '  udfs:parserStatus "partial" ;',
              '  udfs:readChunks 3 ;',
              '  udfs:totalChunks 12 ;',
              '  udfs:pendingRange "page:4..page:12" ;',
              '  udfs:lastParsedAt "2026-06-17T01:00:00.000Z" ;',
              '  udfs:writesCanonicalContent false .',
            ].join('\n')
          : '# Quarterly report\n\nLocal edited body that should win.',
        mimeType: uri.endsWith('.ttl') ? 'text/turtle' : 'text/markdown',
        etag: '"body-1"',
        headers: { etag: '"body-1"' },
      },
      isLoading: false,
      error: null,
    }))
    mockUseApprovalByTarget.mockReturnValue({
      data: {
        id: 'source-approval-keep-local',
        target: 'https://pod.example/.data/proposals/source/quarterly-report-card-ttl-card-https-example-com-report-pdf.ttl#proposal',
        status: 'pending',
        createdAt: new Date('2026-06-17T02:00:00.000Z'),
      },
      isLoading: false,
      error: null,
    })
    mockResolveInboxApproval.mockRejectedValueOnce(new Error('approval write failed'))

    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: 'Ingest 与审批' }))
    fireEvent.click(screen.getByRole('button', { name: '保留本地编辑' }))

    const sourceCard = screen.getByRole('button', { name: '保留本地编辑' }).closest('.rounded-lg')
    expect(sourceCard).not.toBeNull()
    await waitFor(() => {
      expect(within(sourceCard as HTMLElement).getByRole('alert')).toHaveTextContent('保留本地编辑失败：approval write failed')
    })
    expect(mockResolveInboxApproval).toHaveBeenCalledTimes(1)
    expect(mockToast).not.toHaveBeenCalledWith({ description: '本地编辑已保留' })
    expect(mockToast).not.toHaveBeenCalledWith({ description: '本地编辑已保留，Ingest 审批已创建' })
  })

  it('refreshes URL source-linked cards from the detail preview', async () => {
    const manifestUri = 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        name: 'release-notes.card.ttl',
        kind: 'resource',
        semanticKind: 'source-linked-card',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        mimeType: 'text/turtle',
        size: 512,
        modifiedAt: '2026-06-17T00:00:00Z',
        headers: {},
        previewText: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '',
          '<#card> a udfs:SourceLinkedCard ;',
          '  rdfs:label "Release notes" ;',
          '  dcterms:source <https://example.com/report> ;',
          '  dcterms:format "text/html" ;',
          '  udfs:sourceKind "url" ;',
          '  udfs:sourceHash "fnv1a-old" ;',
          '  udfs:parserVersion "url-parser-v1" ;',
          `  udfs:parserManifest <${manifestUri}> ;`,
          '  udfs:bodyResource <https://pod.example/.data/workspaces/ws-1/cards/release-notes.md> ;',
          '  dcterms:created "2026-06-17T00:00:00.000Z" ;',
          '  udfs:writesCanonicalContent false .',
        ].join('\n'),
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri === manifestUri) {
        return {
          data: {
            uri,
            content: [
              '@prefix udfs: <https://undefineds.co/vocab/> .',
              '@prefix dcterms: <http://purl.org/dc/terms/> .',
              '',
              '<#manifest> a udfs:ParserIndexManifest ;',
              '  dcterms:source <https://example.com/report> ;',
              '  udfs:sourceHash "fnv1a-old" ;',
              '  udfs:parserVersion "url-parser-v1" ;',
              '  udfs:parserStatus "complete" ;',
              '  udfs:readChunks 1 ;',
              '  udfs:totalChunks 1 ;',
              '  udfs:parsedRange "chunk:1..chunk:1" ;',
              '  udfs:lastParsedAt "2026-06-17T01:00:00.000Z" ;',
              '  udfs:writesCanonicalContent false .',
            ].join('\n'),
            mimeType: 'text/turtle',
            etag: '"manifest-1"',
            headers: {},
          },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: {
          uri,
          content: '# Release notes\n\nCurrent body.',
          mimeType: 'text/markdown',
          etag: '"body-1"',
          headers: { etag: '"body-1"', 'content-type': 'text/markdown' },
        },
        isLoading: false,
        error: null,
      }
    })
    mockRefreshSourceLinkedCard.mockResolvedValueOnce({
      action: 'changed',
      sourceProposal: {
        proposalResourceUri: 'https://pod.example/.data/proposals/source/refreshed.ttl',
      },
    })

    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: '刷新来源' }))

    await waitFor(() => {
      expect(mockRefreshSourceLinkedCard).toHaveBeenCalledWith({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        subject: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl#card',
        targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.md',
        sourceUri: 'https://example.com/report',
        sourceKind: 'url',
        title: 'Release notes',
        mimeType: 'text/html',
        currentSourceHash: 'fnv1a-old',
        ingestVersion: 'url-parser-v1',
        sourceIngestManifestUri: manifestUri,
      })
    })
    expect(mockToast).toHaveBeenCalledWith({ description: '来源已变化，Ingest 审批已创建' })
  })

  it('uses source refresh for Review Ingest when there is no staged proposal yet', async () => {
    const manifestUri = 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        name: 'release-notes.card.ttl',
        kind: 'resource',
        semanticKind: 'source-linked-card',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        mimeType: 'text/turtle',
        size: 512,
        modifiedAt: '2026-06-17T00:00:00Z',
        headers: {},
        previewText: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '',
          '<#card> a udfs:SourceLinkedCard ;',
          '  rdfs:label "Release notes" ;',
          '  dcterms:source <https://example.com/report> ;',
          '  dcterms:format "text/html" ;',
          '  udfs:sourceKind "url" ;',
          '  udfs:sourceHash "fnv1a-old" ;',
          '  udfs:parserVersion "url-parser-v1" ;',
          `  udfs:parserManifest <${manifestUri}> ;`,
          '  udfs:bodyResource <https://pod.example/.data/workspaces/ws-1/cards/release-notes.md> ;',
          '  dcterms:created "2026-06-17T00:00:00.000Z" ;',
          '  udfs:writesCanonicalContent false .',
        ].join('\n'),
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri === manifestUri) {
        return {
          data: {
            uri,
            content: [
              '@prefix udfs: <https://undefineds.co/vocab/> .',
              '@prefix dcterms: <http://purl.org/dc/terms/> .',
              '',
              '<#manifest> a udfs:ParserIndexManifest ;',
              '  dcterms:source <https://example.com/report> ;',
              '  udfs:sourceHash "fnv1a-old" ;',
              '  udfs:parserVersion "url-parser-v1" ;',
              '  udfs:parserStatus "complete" ;',
              '  udfs:readChunks 1 ;',
              '  udfs:totalChunks 1 ;',
              '  udfs:parsedRange "chunk:1..chunk:1" ;',
              '  udfs:lastParsedAt "2026-06-17T01:00:00.000Z" ;',
              '  udfs:writesCanonicalContent false .',
            ].join('\n'),
            mimeType: 'text/turtle',
            etag: '"manifest-1"',
            headers: {},
          },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: {
          uri,
          content: '# Release notes\n\nCurrent body.',
          mimeType: 'text/markdown',
          etag: '"body-1"',
          headers: { etag: '"body-1"', 'content-type': 'text/markdown' },
        },
        isLoading: false,
        error: null,
      }
    })
    mockUsePendingSourceUpdateProposals.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    })
    mockRefreshSourceLinkedCard.mockResolvedValueOnce({
      action: 'changed',
      sourceProposal: {
        proposalResourceUri: 'https://pod.example/.data/proposals/source/refreshed.ttl',
        proposedContent: '# Release notes\n\nFresh staged Ingest body.',
      },
    })

    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: '审阅 Ingest' }))

    await waitFor(() => {
      expect(mockRefreshSourceLinkedCard).toHaveBeenCalledWith({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        subject: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl#card',
        targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.md',
        sourceUri: 'https://example.com/report',
        sourceKind: 'url',
        title: 'Release notes',
        mimeType: 'text/html',
        currentSourceHash: 'fnv1a-old',
        ingestVersion: 'url-parser-v1',
        sourceIngestManifestUri: manifestUri,
      })
    })
    expect(mockCreateSourceProposal).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith({ description: '来源已变化，Ingest 审批已创建' })
  })

  it('does not create an audit-only Review Ingest proposal when source refresh is unchanged', async () => {
    const manifestUri = 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        name: 'release-notes.card.ttl',
        kind: 'resource',
        semanticKind: 'source-linked-card',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        mimeType: 'text/turtle',
        size: 512,
        modifiedAt: '2026-06-17T00:00:00Z',
        headers: {},
        previewText: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '',
          '<#card> a udfs:SourceLinkedCard ;',
          '  rdfs:label "Release notes" ;',
          '  dcterms:source <https://example.com/report> ;',
          '  dcterms:format "text/html" ;',
          '  udfs:sourceKind "url" ;',
          '  udfs:sourceHash "fnv1a-old" ;',
          '  udfs:parserVersion "url-parser-v1" ;',
          `  udfs:parserManifest <${manifestUri}> ;`,
          '  udfs:bodyResource <https://pod.example/.data/workspaces/ws-1/cards/release-notes.md> ;',
          '  dcterms:created "2026-06-17T00:00:00.000Z" ;',
          '  udfs:writesCanonicalContent false .',
        ].join('\n'),
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: {
        uri,
        content: uri === manifestUri
          ? [
              '@prefix udfs: <https://undefineds.co/vocab/> .',
              '@prefix dcterms: <http://purl.org/dc/terms/> .',
              '',
              '<#manifest> a udfs:ParserIndexManifest ;',
              '  dcterms:source <https://example.com/report> ;',
              '  udfs:sourceHash "fnv1a-old" ;',
              '  udfs:parserVersion "url-parser-v1" ;',
              '  udfs:parserStatus "complete" ;',
              '  udfs:readChunks 1 ;',
              '  udfs:totalChunks 1 ;',
              '  udfs:lastParsedAt "2026-06-17T01:00:00.000Z" ;',
              '  udfs:writesCanonicalContent false .',
            ].join('\n')
          : '# Release notes\n\nCurrent body.',
        mimeType: uri === manifestUri ? 'text/turtle' : 'text/markdown',
        etag: '"resource-1"',
        headers: { etag: '"resource-1"' },
      },
      isLoading: false,
      error: null,
    }))
    mockUsePendingSourceUpdateProposals.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    })
    mockRefreshSourceLinkedCard.mockResolvedValueOnce({
      action: 'unchanged',
      sourceProposal: null,
    })

    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: '审阅 Ingest' }))

    await waitFor(() => expect(mockRefreshSourceLinkedCard).toHaveBeenCalledTimes(1))
    expect(mockCreateSourceProposal).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith({ description: '来源无变化' })
  })

  it('disables Review Ingest while source refresh is already pending', () => {
    const manifestUri = 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        name: 'release-notes.card.ttl',
        kind: 'resource',
        semanticKind: 'source-linked-card',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        mimeType: 'text/turtle',
        size: 512,
        modifiedAt: '2026-06-17T00:00:00Z',
        headers: {},
        previewText: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '',
          '<#card> a udfs:SourceLinkedCard ;',
          '  rdfs:label "Release notes" ;',
          '  dcterms:source <https://example.com/report> ;',
          '  dcterms:format "text/html" ;',
          '  udfs:sourceKind "url" ;',
          '  udfs:sourceHash "fnv1a-old" ;',
          '  udfs:parserVersion "url-parser-v1" ;',
          `  udfs:parserManifest <${manifestUri}> ;`,
          '  udfs:bodyResource <https://pod.example/.data/workspaces/ws-1/cards/release-notes.md> ;',
          '  dcterms:created "2026-06-17T00:00:00.000Z" ;',
          '  udfs:writesCanonicalContent false .',
        ].join('\n'),
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: {
        uri,
        content: uri === manifestUri
          ? [
              '@prefix udfs: <https://undefineds.co/vocab/> .',
              '@prefix dcterms: <http://purl.org/dc/terms/> .',
              '',
              '<#manifest> a udfs:ParserIndexManifest ;',
              '  dcterms:source <https://example.com/report> ;',
              '  udfs:sourceHash "fnv1a-old" ;',
              '  udfs:parserVersion "url-parser-v1" ;',
              '  udfs:parserStatus "complete" ;',
              '  udfs:readChunks 1 ;',
              '  udfs:totalChunks 1 ;',
              '  udfs:lastParsedAt "2026-06-17T01:00:00.000Z" ;',
              '  udfs:writesCanonicalContent false .',
            ].join('\n')
          : '# Release notes\n\nCurrent body.',
        mimeType: uri === manifestUri ? 'text/turtle' : 'text/markdown',
        etag: '"resource-1"',
        headers: { etag: '"resource-1"' },
      },
      isLoading: false,
      error: null,
    }))
    mockUseRefreshSourceLinkedCard.mockReturnValue({
      mutateAsync: mockRefreshSourceLinkedCard,
      isPending: true,
    })

    render(<FileDetailPane />)

    expect(screen.getByRole('button', { name: '审阅 Ingest' })).toBeDisabled()
  })

  it('disables Review Ingest while pending source proposal lookup is loading', () => {
    const manifestUri = 'https://pod.example/.data/index/sources/example-com-report-01rzlsa/manifest.ttl'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/release-notes.card.ttl',
        name: 'release-notes.card.ttl',
        kind: 'resource',
        semanticKind: 'source-linked-card',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        mimeType: 'text/turtle',
        size: 512,
        modifiedAt: '2026-06-17T00:00:00Z',
        headers: {},
        previewText: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '',
          '<#card> a udfs:SourceLinkedCard ;',
          '  rdfs:label "Release notes" ;',
          '  dcterms:source <https://example.com/report> ;',
          '  dcterms:format "text/html" ;',
          '  udfs:sourceKind "url" ;',
          '  udfs:sourceHash "fnv1a-old" ;',
          '  udfs:parserVersion "url-parser-v1" ;',
          `  udfs:parserManifest <${manifestUri}> ;`,
          '  udfs:bodyResource <https://pod.example/.data/workspaces/ws-1/cards/release-notes.md> ;',
          '  dcterms:created "2026-06-17T00:00:00.000Z" ;',
          '  udfs:writesCanonicalContent false .',
        ].join('\n'),
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: {
        uri,
        content: uri === manifestUri
          ? [
              '@prefix udfs: <https://undefineds.co/vocab/> .',
              '@prefix dcterms: <http://purl.org/dc/terms/> .',
              '',
              '<#manifest> a udfs:ParserIndexManifest ;',
              '  dcterms:source <https://example.com/report> ;',
              '  udfs:sourceHash "fnv1a-old" ;',
              '  udfs:parserVersion "url-parser-v1" ;',
              '  udfs:parserStatus "complete" ;',
              '  udfs:readChunks 1 ;',
              '  udfs:totalChunks 1 ;',
              '  udfs:lastParsedAt "2026-06-17T01:00:00.000Z" ;',
              '  udfs:writesCanonicalContent false .',
            ].join('\n')
          : '# Release notes\n\nCurrent body.',
        mimeType: uri === manifestUri ? 'text/turtle' : 'text/markdown',
        etag: '"resource-1"',
        headers: { etag: '"resource-1"' },
      },
      isLoading: false,
      error: null,
    }))
    mockUsePendingSourceUpdateProposals.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByRole('button', { name: '审阅 Ingest' })).toBeDisabled()
  })

  it('does not render a blank rich editor when full raw content fails to load', () => {
    mockUseRawTextResource.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Forbidden'),
    })

    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeInTheDocument()
    expect(screen.queryByTestId('rich-text-file-editor')).not.toBeInTheDocument()
    expect(screen.getByText('完整内容暂时不可用，不能进入编辑。')).toBeInTheDocument()

    selectFileEditorMode('源码')

    expect(screen.getByText('完整原始内容暂时不可用。')).toBeInTheDocument()
  })

  it('saves edited raw source from the file sheet', async () => {
    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    selectFileEditorMode('源码')
    fireEvent.change(screen.getByLabelText('原始内容'), {
      target: { value: '# Hello\nLinX changed' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存原始内容' }))

    expect(mockMutateRaw).toHaveBeenCalledWith({
      resource: expect.objectContaining({
        uri: 'https://pod.example/public/README.md',
        mimeType: 'text/markdown',
        etag: '"raw-1"',
      }),
      content: '# Hello\nLinX changed',
    })
  })

  it('does not save rich text when the editor has not produced a document update', async () => {
    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    const editor = getRichEditorTextbox()
    await act(async () => {
      fireEvent.input(editor, {
        target: { textContent: 'Updated note body' },
      })
      fireEvent.blur(editor)
    })

    expect(mockMutateRaw).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByRole('button', { name: '更多文件操作' }))
    expect(screen.getByRole('menuitem', { name: '源码' })).toBeInTheDocument()
  })

  it('opens access policy modal with effective access and candidate states', () => {
    render(<FileDetailPane />)

    openHeaderAccessDialog()

    const accessDialog = screen.getByRole('dialog', { name: '权限' })
    expect(accessDialog).toBeInTheDocument()
    expect(screen.getAllByText('https://pod.example/public/README.md').length).toBeGreaterThan(0)
    expect(within(accessDialog).getByText('当前权限来源')).toBeInTheDocument()
    expect(within(accessDialog).getByText('当前可访问性')).toBeInTheDocument()
    expect(within(accessDialog).getByText('当前资源')).toBeInTheDocument()
    expect(within(accessDialog).getByText('当前会话')).toBeInTheDocument()
    expect(within(accessDialog).getByText('可查看、可追加、可管理权限')).toBeInTheDocument()
    expect(within(accessDialog).getByText('public')).toBeInTheDocument()
    expect(within(accessDialog).getByText('可查看')).toBeInTheDocument()
    expect(within(accessDialog).getByText('authenticated')).toBeInTheDocument()
    expect(within(accessDialog).getByText('可查看、可追加')).toBeInTheDocument()
    expect(within(accessDialog).getByText('app / agent')).toBeInTheDocument()
    expect(within(accessDialog).getByText('https://app.example/profile#me · 可查看、可编辑')).toBeInTheDocument()
    expect(within(accessDialog).getByText('owner')).toBeInTheDocument()
    expect(within(accessDialog).getAllByText('需读取策略').length).toBe(1)
    expect(within(accessDialog).getByText('策略维护')).toBeInTheDocument()
    expect(within(accessDialog).getByText('当前只创建待确认的权限申请；真正写入 ACL/ACR 需要进入审批链。')).toBeInTheDocument()
    expect(within(accessDialog).getByRole('button', { name: '打开当前策略' })).toBeEnabled()
    expect(within(accessDialog).queryByRole('button', { name: '编辑策略草案' })).not.toBeInTheDocument()
    expect(screen.getByText('https://pod.example/public/README.md.acr')).toBeInTheDocument()
    expect(screen.getAllByText('https://pod.example/public/README.md.acl').length).toBeGreaterThan(0)
    expect(screen.getByText('未找到')).toBeInTheDocument()
    expect(screen.getAllByText('已找到').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '打开 ACR 权限文件' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开 ACL 权限文件' })).toBeInTheDocument()
    expect(screen.getByText('申请权限变更')).toBeInTheDocument()
    expect(screen.getByLabelText('访问对象')).toHaveValue('public')
    expect(screen.getByLabelText('Agent/WebID')).toBeDisabled()
    expect(screen.getByLabelText('权限级别')).toHaveValue('viewer')
    expect(screen.getByLabelText('说明')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提交申请' })).toBeEnabled()
    expect(screen.getByText('提交后等待确认；确认前不会写入 ACL/ACR。')).toBeInTheDocument()
    const currentAccessHeading = within(accessDialog).getByText('当前可访问性')
    const currentSourceHeading = within(accessDialog).getByText('当前权限来源')
    const requestAccessHeading = within(accessDialog).getByText('申请权限变更')
    const technicalDetailsHeading = within(accessDialog).getByText('技术信息')
    expect(currentSourceHeading.closest('details')).toBeNull()
    expect(currentAccessHeading.compareDocumentPosition(currentSourceHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(currentSourceHeading.compareDocumentPosition(requestAccessHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(currentAccessHeading.compareDocumentPosition(requestAccessHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(requestAccessHeading.compareDocumentPosition(technicalDetailsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(technicalDetailsHeading.closest('details')).not.toHaveAttribute('open')
    expect(within(accessDialog).queryByText('当前只创建待确认 proposal；真正写入 ACL/ACR 需要进入审批链。')).not.toBeInTheDocument()
    expect(screen.queryByText(/connected|not enabled|policy source|Effective access|Draft access/i)).not.toBeInTheDocument()

    fireEvent.click(within(accessDialog).getByRole('button', { name: '打开当前策略' }))
    expect(window.open).toHaveBeenCalledWith('https://pod.example/public/README.md.acl', '_blank', 'noopener,noreferrer')
  })

  it('creates a visible pending access proposal without writing ACL or ACR', async () => {
    render(<FileDetailPane />)

    openHeaderAccessDialog()
    fireEvent.change(screen.getByLabelText('权限级别'), {
      target: { value: 'editor' },
    })
    fireEvent.change(screen.getByLabelText('说明'), {
      target: { value: 'Share editable draft with the public.' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }))

    await waitFor(() => {
      expect(mockCreateAccessProposal).toHaveBeenCalledWith(expect.objectContaining({
        ownerUri: 'https://pod.example/public/README.md',
        activePolicyUri: 'https://pod.example/public/README.md.acl',
        targetPolicyUri: 'https://pod.example/public/README.md.acl',
        provider: 'acl',
        audience: 'public',
        audienceRef: 'public',
        role: 'editor',
        modes: ['read', 'append', 'write'],
        writesCanonicalPolicy: false,
      }))
    })
    expect(await screen.findByText('待确认的权限申请')).toBeInTheDocument()
    expect(screen.getByText('公开访问 · 可查看、可追加、可编辑')).toBeInTheDocument()
    expect(screen.getByText('Share editable draft with the public.')).toBeInTheDocument()
    expect(screen.getByText(/^https:\/\/pod\.example\/\.data\/proposals\/access\/public-editor-public-[a-z0-9]{7}\.ttl$/)).toBeInTheDocument()
    expect(screen.getByText('等待确认；ACL/ACR 暂不变更。')).toBeInTheDocument()
    expect(screen.queryByText(/No ACL\/ACR write yet|not enabled/i)).not.toBeInTheDocument()
    expect(window.open).not.toHaveBeenCalledWith(
      expect.stringMatching(/README\.md\.a(?:cl|cr)$/),
      expect.anything(),
      expect.anything(),
    )
  })

  it('hydrates pending access proposals from Inbox proposal targets when the access modal opens', () => {
    mockUsePendingAccessPolicyProposals.mockReturnValue({
      data: [
        {
          id: 'https://pod.example/.data/proposals/access/agent-editor-agent.ttl#proposal',
          kind: 'access-policy-proposal',
          status: 'pending',
          operation: 'request-change',
          proposalResourceUri: 'https://pod.example/.data/proposals/access/agent-editor-agent.ttl',
          ownerUri: 'https://pod.example/public/README.md',
          activePolicyUri: 'https://pod.example/public/README.md.acl',
          targetPolicyUri: 'https://pod.example/public/README.md.acl',
          provider: 'acl',
          audience: 'agent',
          audienceRef: 'https://agent.example/profile#me',
          role: 'editor',
          modes: ['read', 'append', 'write'],
          reason: 'Existing Inbox proposal should survive reopening the dialog.',
          createdAt: '2026-06-17T12:00:00.000Z',
          writesCanonicalPolicy: false,
        },
      ],
      isLoading: false,
      error: null,
    })
    render(<FileDetailPane />)

    openHeaderAccessDialog()

    expect(mockUsePendingAccessPolicyProposals).toHaveBeenCalledWith('https://pod.example/public/README.md', true)
    const accessDialog = screen.getByRole('dialog', { name: '权限' })
    expect(within(accessDialog).getByText('待确认的权限申请')).toBeInTheDocument()
    expect(within(accessDialog).getByText('https://agent.example/profile#me · 可查看、可追加、可编辑')).toBeInTheDocument()
    expect(within(accessDialog).getByText('Existing Inbox proposal should survive reopening the dialog.')).toBeInTheDocument()
    expect(within(accessDialog).getByText('https://pod.example/.data/proposals/access/agent-editor-agent.ttl')).toBeInTheDocument()
    expect(mockCreateAccessProposal).not.toHaveBeenCalled()
  })

  it('creates review-only access proposals against the candidate ACL when no linked policy source is confirmed', async () => {
    mockUseFilesAccessBasics.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/public/README.md',
        activeSource: null,
        effectiveAccess: {
          user: { read: true, append: false, write: false, control: false },
          public: { read: false, append: false, write: false, control: false },
        },
        policySummary: null,
        candidates: [
          {
            provider: 'acr',
            uri: 'https://pod.example/public/README.md.acr',
            existence: { uri: 'https://pod.example/public/README.md.acr', state: 'missing', status: 404 },
          },
          {
            provider: 'acl',
            uri: 'https://pod.example/public/README.md.acl',
            existence: { uri: 'https://pod.example/public/README.md.acl', state: 'exists', status: 200 },
          },
        ],
      },
      isLoading: false,
      error: null,
    })
    render(<FileDetailPane />)

    openHeaderAccessDialog()

    expect(screen.getByText('没有发现已关联的权限来源。')).toBeInTheDocument()
    expect(screen.getByText('申请预览：公开访问 · 可查看。候选 ACL，确认前不会写入策略。')).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: '提交申请' })
    expect(submit).toBeEnabled()

    fireEvent.click(submit)

    await waitFor(() => {
      expect(mockCreateAccessProposal).toHaveBeenCalledWith(expect.objectContaining({
        ownerUri: 'https://pod.example/public/README.md',
        activePolicyUri: null,
        targetPolicyUri: 'https://pod.example/public/README.md.acl',
        provider: 'acl',
        audience: 'public',
        audienceRef: 'public',
        role: 'viewer',
        modes: ['read'],
        writesCanonicalPolicy: false,
      }))
    })
    expect(await screen.findByText('待确认的权限申请')).toBeInTheDocument()
    expect(screen.getByText('公开访问 · 可查看')).toBeInTheDocument()
    expect(screen.getByText('等待确认；ACL/ACR 暂不变更。')).toBeInTheDocument()
    expect(window.open).not.toHaveBeenCalledWith(
      'https://pod.example/public/README.md.acl',
      expect.anything(),
      expect.anything(),
    )
  })

  it('targets the owner sidecar candidate when the active access policy is inherited', async () => {
    mockUseFilesAccessBasics.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/public/README.md',
        activeSource: {
          provider: 'acl',
          uri: 'https://pod.example/public/.acl',
          confidence: 'linked',
          inheritance: 'inherited-or-candidate',
        },
        effectiveAccess: {
          user: { read: true, append: true, write: false, control: false },
          public: { read: true, append: false, write: false, control: false },
        },
        policySummary: null,
        candidates: [
          {
            provider: 'acr',
            uri: 'https://pod.example/public/README.md.acr',
            existence: { uri: 'https://pod.example/public/README.md.acr', state: 'missing', status: 404 },
          },
          {
            provider: 'acl',
            uri: 'https://pod.example/public/README.md.acl',
            existence: { uri: 'https://pod.example/public/README.md.acl', state: 'missing', status: 404 },
          },
        ],
      },
      isLoading: false,
      error: null,
    })
    render(<FileDetailPane />)

    openHeaderAccessDialog()

    const accessDialog = screen.getByRole('dialog', { name: '权限' })
    expect(within(accessDialog).getByText('继承策略')).toBeInTheDocument()
    expect(within(accessDialog).getByText('申请预览：公开访问 · 可查看。候选 ACL，确认前不会写入策略。')).toBeInTheDocument()

    fireEvent.click(within(accessDialog).getByRole('button', { name: '提交申请' }))

    await waitFor(() => {
      expect(mockCreateAccessProposal).toHaveBeenCalledWith(expect.objectContaining({
        ownerUri: 'https://pod.example/public/README.md',
        activePolicyUri: 'https://pod.example/public/.acl',
        targetPolicyUri: 'https://pod.example/public/README.md.acl',
        provider: 'acl',
        audience: 'public',
        audienceRef: 'public',
        role: 'viewer',
        modes: ['read'],
        writesCanonicalPolicy: false,
      }))
    })
  })

  it('keeps inherited ACR proposals on the owner ACR candidate even when the child ACR is missing', async () => {
    mockUseFilesAccessBasics.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/public/README.md',
        activeSource: {
          provider: 'acr',
          uri: 'https://pod.example/public/.acr',
          confidence: 'linked',
          inheritance: 'inherited-or-candidate',
        },
        effectiveAccess: {
          user: { read: true, append: true, write: false, control: false },
          public: { read: true, append: false, write: false, control: false },
        },
        policySummary: null,
        candidates: [
          {
            provider: 'acr',
            uri: 'https://pod.example/public/README.md.acr',
            existence: { uri: 'https://pod.example/public/README.md.acr', state: 'missing', status: 404 },
          },
          {
            provider: 'acl',
            uri: 'https://pod.example/public/README.md.acl',
            existence: { uri: 'https://pod.example/public/README.md.acl', state: 'missing', status: 404 },
          },
        ],
      },
      isLoading: false,
      error: null,
    })
    render(<FileDetailPane />)

    openHeaderAccessDialog()

    const accessDialog = screen.getByRole('dialog', { name: '权限' })
    expect(within(accessDialog).getByText('继承策略')).toBeInTheDocument()
    expect(within(accessDialog).getByText('申请预览：公开访问 · 可查看。ACR 申请会进入审批链，暂不直接写入策略。')).toBeInTheDocument()

    fireEvent.click(within(accessDialog).getByRole('button', { name: '提交申请' }))

    await waitFor(() => {
      expect(mockCreateAccessProposal).toHaveBeenCalledWith(expect.objectContaining({
        ownerUri: 'https://pod.example/public/README.md',
        activePolicyUri: 'https://pod.example/public/.acr',
        targetPolicyUri: 'https://pod.example/public/README.md.acr',
        provider: 'acr',
        audience: 'public',
        audienceRef: 'public',
        role: 'viewer',
        modes: ['read'],
        writesCanonicalPolicy: false,
      }))
    })
  })

  it('creates review-only access proposals for ACR-backed policies', async () => {
    mockUseFilesAccessBasics.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/public/README.md',
        activeSource: {
          provider: 'acr',
          uri: 'https://pod.example/public/README.md.acr',
          inheritance: 'direct',
        },
        effectiveAccess: {
          user: { read: true, append: true, write: false, control: false },
          public: { read: false, append: false, write: false, control: false },
        },
        policySummary: null,
        candidates: [
          {
            provider: 'acr',
            uri: 'https://pod.example/public/README.md.acr',
            existence: { uri: 'https://pod.example/public/README.md.acr', state: 'exists', status: 200 },
          },
          {
            provider: 'acl',
            uri: 'https://pod.example/public/README.md.acl',
            existence: { uri: 'https://pod.example/public/README.md.acl', state: 'missing', status: 404 },
          },
        ],
      },
      isLoading: false,
      error: null,
    })
    render(<FileDetailPane />)

    openHeaderAccessDialog()

    const accessDialog = screen.getByRole('dialog', { name: '权限' })
    expect(within(accessDialog).getByText('权限规则')).toBeInTheDocument()
    expect(within(accessDialog).getAllByText('ACR').length).toBeGreaterThan(0)
    expect(within(accessDialog).queryByRole('button', { name: '打开 ACL 权限文件' })).not.toBeInTheDocument()
    expect(within(accessDialog).getByRole('button', { name: '打开 ACR 权限文件' })).toBeInTheDocument()
    expect(within(accessDialog).getByText('申请预览：公开访问 · 可查看。ACR 申请会进入审批链，暂不直接写入策略。')).toBeInTheDocument()
    expect(within(accessDialog).getByRole('button', { name: '提交申请' })).toBeEnabled()

    fireEvent.click(within(accessDialog).getByRole('button', { name: '提交申请' }))

    await waitFor(() => {
      expect(mockCreateAccessProposal).toHaveBeenCalledWith(expect.objectContaining({
        ownerUri: 'https://pod.example/public/README.md',
        activePolicyUri: 'https://pod.example/public/README.md.acr',
        targetPolicyUri: 'https://pod.example/public/README.md.acr',
        provider: 'acr',
        audience: 'public',
        audienceRef: 'public',
        role: 'viewer',
        modes: ['read'],
        writesCanonicalPolicy: false,
      }))
    })
    expect(within(accessDialog).getByText('待确认的权限申请')).toBeInTheDocument()
  })

  it('targets an existing candidate ACR before falling back to candidate ACL when no policy source is linked', async () => {
    mockUseFilesAccessBasics.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/public/README.md',
        activeSource: null,
        effectiveAccess: {
          user: { read: true, append: false, write: false, control: false },
          public: { read: false, append: false, write: false, control: false },
        },
        policySummary: null,
        candidates: [
          {
            provider: 'acr',
            uri: 'https://pod.example/public/README.md.acr',
            existence: { uri: 'https://pod.example/public/README.md.acr', state: 'exists', status: 200 },
          },
          {
            provider: 'acl',
            uri: 'https://pod.example/public/README.md.acl',
            existence: { uri: 'https://pod.example/public/README.md.acl', state: 'missing', status: 404 },
          },
        ],
      },
      isLoading: false,
      error: null,
    })
    render(<FileDetailPane />)

    openHeaderAccessDialog()

    const accessDialog = screen.getByRole('dialog', { name: '权限' })
    expect(within(accessDialog).getByText('发现候选 ACR，尚未关联为当前权限来源。')).toBeInTheDocument()
    expect(within(accessDialog).queryByText('此资源按当前 Pod policy provider 维护')).not.toBeInTheDocument()
    expect(within(accessDialog).getByText('申请预览：公开访问 · 可查看。候选 ACR，确认前不会写入策略。')).toBeInTheDocument()

    fireEvent.click(within(accessDialog).getByRole('button', { name: '提交申请' }))

    await waitFor(() => {
      expect(mockCreateAccessProposal).toHaveBeenCalledWith(expect.objectContaining({
        ownerUri: 'https://pod.example/public/README.md',
        activePolicyUri: null,
        targetPolicyUri: 'https://pod.example/public/README.md.acr',
        provider: 'acr',
        audience: 'public',
        audienceRef: 'public',
        role: 'viewer',
        modes: ['read'],
        writesCanonicalPolicy: false,
      }))
    })
  })

  it('opens access policy modal from the main detail header', () => {
    render(<FileDetailPane />)

    openHeaderAccessDialog()

    expect(screen.getByRole('dialog', { name: '权限' })).toBeInTheDocument()
    expect(screen.getAllByText('https://pod.example/public/README.md').length).toBeGreaterThan(0)
    expect(screen.getByText('当前可访问性')).toBeInTheDocument()
  })

  it('shows access query errors instead of treating them as missing policy sources', () => {
    mockUseFilesAccessBasics.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('HTTP 403 while reading access policy'),
    })
    render(<FileDetailPane />)

    openHeaderAccessDialog()

    const accessDialog = screen.getByRole('dialog', { name: '权限' })
    expect(within(accessDialog).getByText('权限信息读取失败')).toBeInTheDocument()
    expect(within(accessDialog).getByText('HTTP 403 while reading access policy')).toBeInTheDocument()
    expect(within(accessDialog).queryByText('没有发现已关联的权限来源。')).not.toBeInTheDocument()
    expect(within(accessDialog).getByRole('button', { name: '提交申请' })).toBeDisabled()
  })

  it('creates an authenticated-user access proposal without requiring an agent WebID', async () => {
    render(<FileDetailPane />)

    openHeaderAccessDialog()
    fireEvent.change(screen.getByLabelText('访问对象'), {
      target: { value: 'authenticated' },
    })
    fireEvent.change(screen.getByLabelText('权限级别'), {
      target: { value: 'contributor' },
    })
    fireEvent.change(screen.getByLabelText('说明'), {
      target: { value: 'Let signed-in collaborators add notes.' },
    })

    expect(screen.getByLabelText('Agent/WebID')).toBeDisabled()
    expect(screen.getByRole('button', { name: '提交申请' })).toBeEnabled()
    expect(screen.getByText('申请预览：已登录用户 · 可查看、可追加')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '提交申请' }))

    await waitFor(() => {
      expect(mockCreateAccessProposal).toHaveBeenCalledWith(expect.objectContaining({
        audience: 'authenticated',
        audienceRef: 'authenticated',
        role: 'contributor',
        modes: ['read', 'append'],
        writesCanonicalPolicy: false,
      }))
    })
    expect(screen.getByText('已登录用户 · 可查看、可追加')).toBeInTheDocument()
    expect(screen.getByText('Let signed-in collaborators add notes.')).toBeInTheDocument()
    expect(screen.getByText(/^https:\/\/pod\.example\/\.data\/proposals\/access\/authenticated-contributor-authenticated-[a-z0-9]{7}\.ttl$/)).toBeInTheDocument()
  })

  it('enables the Agent/WebID field only for agent access drafts', () => {
    render(<FileDetailPane />)

    openHeaderAccessDialog()

    expect(screen.getByLabelText('Agent/WebID')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('访问对象'), {
      target: { value: 'authenticated' },
    })

    expect(screen.getByLabelText('Agent/WebID')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('访问对象'), {
      target: { value: 'agent' },
    })

    expect(screen.getByLabelText('Agent/WebID')).not.toBeDisabled()
  })

  it('requires and previews agent webid before creating an agent access proposal', async () => {
    render(<FileDetailPane />)

    openHeaderAccessDialog()
    fireEvent.change(screen.getByLabelText('访问对象'), {
      target: { value: 'agent' },
    })

    expect(screen.getByRole('button', { name: '提交申请' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Agent/WebID'), {
      target: { value: 'not a webid' },
    })

    expect(screen.getByText('Agent/WebID 必须是 http(s) URL。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提交申请' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Agent/WebID'), {
      target: { value: 'https://agent.example/profile#me' },
    })
    fireEvent.change(screen.getByLabelText('权限级别'), {
      target: { value: 'contributor' },
    })

    expect(screen.getByText('申请预览：https://agent.example/profile#me · 可查看、可追加')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '提交申请' }))

    await waitFor(() => {
      expect(mockCreateAccessProposal).toHaveBeenCalledWith(expect.objectContaining({
        audience: 'agent',
        audienceRef: 'https://agent.example/profile#me',
        role: 'contributor',
        modes: ['read', 'append'],
      }))
    })
    expect(screen.getByText('https://agent.example/profile#me · 可查看、可追加')).toBeInTheDocument()
    expect(screen.getByLabelText('Agent/WebID')).toHaveValue('')
  })

  it('keeps ordinary file meta inside the opened sheet instead of the main right drawer', () => {
    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    expect(screen.queryByLabelText('Resource .meta inspector')).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('文件详情 head')).queryByRole('button', { name: '查看 .meta' })).not.toBeInTheDocument()

    const sheetHeader = within(screen.getByRole('dialog', { name: 'Hello' })).getByLabelText('文件详情标题')
    expect(within(sheetHeader).getByRole('button', { name: '显示 Info' })).toBeInTheDocument()
    expect(getEditableFileMetaTail()).toBeInTheDocument()
    expect(screen.queryByLabelText('Resource .meta inspector')).not.toBeInTheDocument()
  })

  it('does not fetch the editable file meta sidecar until the editor sheet opens', () => {
    render(<FileDetailPane />)

    expect(mockUseFilesMetaSidecar).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'https://pod.example/public/README.md' }),
      false,
    )
    expect(mockUseFilesMetaSidecar).not.toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'https://pod.example/public/README.md' }),
      true,
    )
  })

  it('shows the editable file meta sidecar at the bottom of the sheet', () => {
    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    const metaTail = getEditableFileMetaTail()

    expect(within(metaTail).getByText('text/markdown')).toBeInTheDocument()
    expect(within(metaTail).getByText('1.0 KB')).toBeInTheDocument()
    expect(within(metaTail).queryByText('权限')).not.toBeInTheDocument()
    expect(within(metaTail).queryByText('ACL · direct')).not.toBeInTheDocument()
    expect(within(metaTail).queryByText('可查看、可追加、可管理权限')).not.toBeInTheDocument()
    expect(within(metaTail).getByText('https://pod.example/public/README.md.meta')).toBeInTheDocument()
    expect(within(metaTail).getByText('链接与 Schema')).toBeInTheDocument()
    expect(within(metaTail).getByText('来源')).toBeInTheDocument()
    expect(within(metaTail).getByText('https://source.example/readme')).toBeInTheDocument()
    expect(within(metaTail).getByText('相关链接')).toBeInTheDocument()
    expect(within(metaTail).getByText('https://pod.example/public/spec.md')).toBeInTheDocument()
    expect(within(metaTail).getByText('已连接')).toBeInTheDocument()
    expect(within(metaTail).queryByText('Linked metadata')).not.toBeInTheDocument()
    expect(within(metaTail).queryByText('exists')).not.toBeInTheDocument()
    const rawMetaDetails = within(metaTail).getByText('原始数据').closest('details')
    expect(rawMetaDetails).toBeInTheDocument()
    expect(rawMetaDetails).not.toHaveAttribute('open')
    expect(within(metaTail).getByText(/@prefix dcterms:/)).toBeInTheDocument()
    expect(within(metaTail).getByText(/<#meta> dcterms:source <https:\/\/source\.example\/readme>/)).toBeInTheDocument()
    expect(within(metaTail).getByText(/udfs:shape <https:\/\/pod\.example\/\.vocab\/shapes\.ttl#MarkdownFileShape>/)).toBeInTheDocument()

    const head = screen.getByLabelText('文件详情 head')
    expect(within(head).queryByRole('button', { name: '查看 Access 来源' })).not.toBeInTheDocument()
    const sheetHeader = within(screen.getByRole('dialog', { name: 'Hello' })).getByLabelText('文件详情标题')
    expect(sheetHeader.parentElement).toHaveClass('pr-14')
    fireEvent.click(within(sheetHeader).getByRole('button', { name: '显示 Info' }))
    expect(screen.queryByLabelText('Resource .meta inspector')).not.toBeInTheDocument()
    expect(getEditableFileMetaTail()).toBe(metaTail)
    expect(within(metaTail).queryByRole('button', { name: '查看 Access 来源' })).not.toBeInTheDocument()
    fireEvent.pointerDown(within(sheetHeader).getByRole('button', { name: '更多文件操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '查看 Access 来源' }))
    const accessDialog = screen.getByRole('dialog', { name: '权限' })
    expect(within(accessDialog).getAllByText('ACL').length).toBeGreaterThan(0)
    expect(within(accessDialog).getByText('当前资源')).toBeInTheDocument()
    expect(within(accessDialog).getByText('可查看、可追加、可管理权限')).toBeInTheDocument()
    expect(within(accessDialog).getByText('技术信息')).toBeInTheDocument()
    expect(within(accessDialog).queryByText('当前 Pod 权限模型')).not.toBeInTheDocument()
    expect(within(accessDialog).queryByText(/policy provider/i)).not.toBeInTheDocument()
  })

  it('shows editable sheet meta sidecar query errors without duplicating file metadata', () => {
    mockUseFilesMetaSidecar.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('meta unavailable'),
    })

    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    const metaTail = getEditableFileMetaTail()

    expect(within(metaTail).getAllByText('ID')).toHaveLength(1)
    expect(within(metaTail).getByText('无法读取 .meta。')).toBeInTheDocument()
    expect(within(metaTail).getByText('meta unavailable')).toBeInTheDocument()
  })

  it('shows missing editable file meta sidecar state at the bottom of the sheet', () => {
    mockUseFilesMetaSidecar.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/public/README.md',
        metaUri: 'https://pod.example/public/README.md.meta',
        state: 'missing',
        status: 404,
        content: null,
        mimeType: null,
        etag: null,
        size: null,
      },
      isLoading: false,
      error: null,
    })

    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    const metaTail = getEditableFileMetaTail()

    expect(within(metaTail).getByText('https://pod.example/public/README.md.meta')).toBeInTheDocument()
    expect(within(metaTail).getByText('未找到 .meta。')).toBeInTheDocument()
    expect(within(metaTail).getByLabelText('RDF metadata')).toBeInTheDocument()
    expect(screen.queryByLabelText('Resource .meta inspector')).not.toBeInTheDocument()
  })

  it('does not open the right meta drawer for editable file sheet metadata', () => {
    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    expect(screen.queryByLabelText('Resource .meta inspector')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeInTheDocument()
    expect(getEditableFileMetaTail()).toBeInTheDocument()
  })

  it('opens structured ttl meta in the right drawer instead of file sheet meta', () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/state.ttl',
        uri: 'https://pod.example/.data/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '<#a> <#b> "c" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseFilesMetaSidecar.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/.data/state.ttl',
        metaUri: 'https://pod.example/.data/state.ttl.meta',
        state: 'exists',
        status: 200,
        content: '<#meta> <#summary> "State metadata" .',
        mimeType: 'text/turtle',
        etag: '"state-meta-1"',
        size: 48,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" .',
        mimeType: 'text/turtle',
        etag: '"raw-fail-1"',
        headers: { etag: '"raw-fail-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" .',
        mimeType: 'text/turtle',
        etag: '"raw-fail-1"',
        headers: { etag: '"raw-fail-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.queryByLabelText('文件 meta')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'state.ttl' })).not.toBeInTheDocument()
    const head = screen.getByLabelText('文件详情 head')
    expect(within(head).queryByRole('button', { name: '查看 .meta' })).not.toBeInTheDocument()
    expect(within(head).queryByRole('button', { name: '查看 Access 来源' })).not.toBeInTheDocument()

    openHeaderMetaDrawer()

    const drawer = screen.getByLabelText('Resource .meta inspector')
    expect(drawer).toHaveAttribute('data-sidecar-coverage', 'content')
    expect(drawer).toHaveClass('inset-y-0', 'right-0', 'w-[360px]', 'max-w-full')
    expect(drawer).not.toHaveClass('inset-0', 'w-full', 'max-w-none')
    expect(within(drawer).getByText('https://pod.example/.data/state.ttl.meta')).toBeInTheDocument()
    expect(within(drawer).getByText(/State metadata/)).toBeInTheDocument()
    expect(screen.queryByLabelText('文件 meta')).not.toBeInTheDocument()
    openResourceActionsMenu()
    expect(screen.getByRole('menuitem', { name: '查看 .meta' })).toBeInTheDocument()
  })

  it('renders image resources as readonly previews with metadata in the right drawer', () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/public/diagram.png',
      editableFileSheetOpenRequestUri: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/diagram.png',
        uri: 'https://pod.example/public/diagram.png',
        name: 'diagram.png',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/public/',
        mimeType: 'image/png',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: null,
        previewUnavailableReason: '图片可预览。',
      },
      isLoading: false,
      error: null,
    })
    mockUseFilesMetaSidecar.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/public/diagram.png',
        metaUri: 'https://pod.example/public/diagram.png.meta',
        state: 'exists',
        status: 200,
        content: '<#meta> <#summary> "Diagram metadata" .',
        mimeType: 'text/turtle',
        etag: '"diagram-meta-1"',
        size: 64,
      },
      isLoading: false,
      error: null,
    })
    mockUseBlobResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/public/diagram.png',
        blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
        mimeType: 'image/png',
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.queryByRole('dialog', { name: 'diagram.png' })).not.toBeInTheDocument()
    const image = screen.getByRole('img', { name: 'diagram.png' })
    expect(mockUseBlobResource).toHaveBeenCalledWith('https://pod.example/public/diagram.png', true)
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(image).toHaveAttribute('src', 'blob:https://pod.example/diagram-preview')
    expect(image).toHaveClass('object-contain')
    expect(screen.queryByLabelText('文件 meta')).not.toBeInTheDocument()

    openHeaderMetaDrawer()

    const drawer = screen.getByLabelText('Resource .meta inspector')
    expect(within(drawer).getByText('https://pod.example/public/diagram.png.meta')).toBeInTheDocument()
    expect(within(drawer).getByText(/Diagram metadata/)).toBeInTheDocument()
  })

  it('renders PDF resources through the authenticated binary preview', () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/private/report.pdf',
      editableFileSheetOpenRequestUri: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/private/report.pdf',
        uri: 'https://pod.example/private/report.pdf',
        name: 'report.pdf',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/private/',
        mimeType: 'application/pdf',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: null,
      },
      isLoading: false,
      error: null,
    })
    mockUseBlobResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/private/report.pdf',
        blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'application/pdf' }),
        mimeType: 'application/pdf',
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByTitle('report.pdf')).toHaveAttribute('src', 'blob:https://pod.example/diagram-preview')
    expect(mockUseBlobResource).toHaveBeenCalledWith('https://pod.example/private/report.pdf', true)
  })

  it('shows missing meta sidecar state in the resource drawer', () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/state.ttl',
        uri: 'https://pod.example/.data/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '<#a> <#b> "c" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseFilesMetaSidecar.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/.data/state.ttl',
        metaUri: 'https://pod.example/.data/state.ttl.meta',
        state: 'missing',
        status: 404,
        content: null,
        mimeType: null,
        etag: null,
        size: null,
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)
    openHeaderMetaDrawer()

    const drawer = screen.getByLabelText('Resource .meta inspector')
    expect(within(drawer).getByText('https://pod.example/.data/state.ttl.meta')).toBeInTheDocument()
    expect(within(drawer).getByText('未找到 .meta。')).toBeInTheDocument()
  })

  it('shows inaccessible meta sidecar state separately from missing', () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/state.ttl',
        uri: 'https://pod.example/.data/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '<#a> <#b> "c" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseFilesMetaSidecar.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/.data/state.ttl',
        metaUri: 'https://pod.example/.data/state.ttl.meta',
        state: 'inaccessible',
        status: 403,
        content: null,
        mimeType: null,
        etag: null,
        size: null,
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)
    openHeaderMetaDrawer()

    const drawer = screen.getByLabelText('Resource .meta inspector')
    expect(within(drawer).getByText('403')).toBeInTheDocument()
    expect(within(drawer).getByText('.meta 不可访问。')).toBeInTheDocument()
  })

  it('shows meta sidecar query errors separately from missing or inaccessible states', () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/state.ttl',
        uri: 'https://pod.example/.data/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '<#a> <#b> "c" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseFilesMetaSidecar.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('HTTP 500 while reading .meta'),
    })

    render(<FileDetailPane />)
    openHeaderMetaDrawer()

    const drawer = screen.getByLabelText('Resource .meta inspector')
    expect(within(drawer).getByText('无法读取 .meta。')).toBeInTheDocument()
    expect(within(drawer).getByText('HTTP 500 while reading .meta')).toBeInTheDocument()
    expect(within(drawer).queryByText('未找到 .meta。')).not.toBeInTheDocument()
    expect(within(drawer).queryByText('.meta 不可访问。')).not.toBeInTheDocument()
  })

  it('shows workspace repository metadata as semantic rows in the meta drawer', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/.data/workspaces/ws-1/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/',
        uri: 'https://pod.example/.data/workspaces/ws-1/',
        name: 'ws-1',
        kind: 'container',
        semanticKind: 'folder',
        parentUri: 'https://pod.example/.data/workspaces/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        childEntries: [],
      },
      isLoading: false,
      error: null,
    })
    mockUseFilesMetaSidecar.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/.data/workspaces/ws-1/',
        metaUri: 'https://pod.example/.data/workspaces/ws-1/.meta',
        state: 'exists',
        status: 200,
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix git: <https://undefineds.co/vocab/git/> .\n<#workspace> udfs:repository <https://pod.example/.data/repositories/linx.git> ; udfs:localPath "/Users/ganlu/develop/linx-files" ; udfs:cwd "/Users/ganlu/develop/linx-files/apps/web" ; git:branchName "files-module" ; git:branchRef "refs/heads/files-module" ; git:startCommit "abc123" ; git:currentCommit "def456" ; git:dirtyState "dirty" .',
        mimeType: 'text/turtle',
        etag: '"workspace-meta-1"',
        size: 512,
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)
    openHeaderMetaDrawer()

    const drawer = screen.getByLabelText('Resource .meta inspector')
    expect(within(drawer).getByText('工作区状态')).toBeInTheDocument()
    expect(within(drawer).getByText('仓库')).toBeInTheDocument()
    expect(within(drawer).getByText('https://pod.example/.data/repositories/linx.git')).toBeInTheDocument()
    expect(within(drawer).getByText('本地路径')).toBeInTheDocument()
    expect(within(drawer).getByText('/Users/ganlu/develop/linx-files')).toBeInTheDocument()
    expect(within(drawer).getByText('分支')).toBeInTheDocument()
    expect(within(drawer).getByText('files-module (refs/heads/files-module)')).toBeInTheDocument()
    expect(within(drawer).getByText('变更状态')).toBeInTheDocument()
    expect(within(drawer).getByText('dirty')).toBeInTheDocument()
  })

  it('returns from a subject resource detail to the source structured table', () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/public/report.md',
      structuredViewMode: 'kanban',
      structuredClassScope: 'udfs:Document',
      structuredSearchText: 'report',
      structuredSortKey: 'title',
      structuredSortDirection: 'desc',
      structuredHiddenPredicates: new Set(['status']),
      structuredViewConfigsByDocument: {},
      structuredColumnSizingByDocument: {},
      structuredSubjectReturnContext: {
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: 'https://pod.example/public/report.md',
        scrollTop: 72,
        viewMode: 'whiteboard',
        classScope: 'udfs:Workspace',
        searchText: 'Files',
        sortKey: 'updatedAt',
        sortDirection: 'asc',
        hiddenPredicates: ['tags'],
        kanbanGroupPredicate: 'status',
      },
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/report.md',
        uri: 'https://pod.example/public/report.md',
        name: 'report.md',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/markdown',
        size: 1024,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '# Report',
      },
      isLoading: false,
      error: null,
    })
    mockUseFilesMetaSidecar.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/public/',
        metaUri: 'https://pod.example/public/.meta',
        state: 'exists',
        status: 200,
        content: '<#container> <#summary> "Folder metadata" .',
        mimeType: 'text/turtle',
        etag: '"folder-meta-1"',
        size: 42,
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    window.history.replaceState({
      linxFilesStructuredSubjectRoute: {
        targetUri: 'https://pod.example/public/report.md',
      },
    }, '', '/files?keep=1&filesRoute=linx.files.structuredSubjectRoute.v1&filesDocument=https%3A%2F%2Fpod.example%2F.data%2Fworkspaces%2Fws-1%2Fstate.ttl&filesSubject=https%3A%2F%2Fpod.example%2Fpublic%2Freport.md&filesTarget=https%3A%2F%2Fpod.example%2Fpublic%2Freport.md')
    fireEvent.click(screen.getByRole('button', { name: '返回来源表 · https://pod.example/public/report.md' }))

    const routeParams = new URLSearchParams(window.location.search)
    expect(routeParams.get('keep')).toBe('1')
    expect(routeParams.get('filesRoute')).toBeNull()
    expect(window.history.state?.linxFilesStructuredSubjectRoute).toBeUndefined()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/ws-1/state.ttl')
    expect(useFilesStore.getState().structuredViewMode).toBe('whiteboard')
    expect(useFilesStore.getState().structuredClassScope).toBe('udfs:Workspace')
    expect(useFilesStore.getState().structuredSearchText).toBe('Files')
    expect(useFilesStore.getState().structuredSortKey).toBe('updatedAt')
    expect(useFilesStore.getState().structuredSortDirection).toBe('asc')
    expect(Array.from(useFilesStore.getState().structuredHiddenPredicates)).toEqual(['tags'])
    expect(useFilesStore.getState().structuredKanbanGroupPredicate).toBe('status')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toBeNull()
  })

  it('copies file uri', () => {
    render(<FileDetailPane />)

    openResourceActionsMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '复制 URI' }))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://pod.example/public/README.md')
  })

  it('opens editable file meta in the detail sheet for a sidecar request from the list row', async () => {
    useFilesStore.setState({
      sidecarActionRequest: {
        uri: 'https://pod.example/public/README.md',
        action: 'meta',
      },
    })

    render(<FileDetailPane />)

    expect(await screen.findByRole('dialog', { name: 'Hello' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Resource .meta inspector')).not.toBeInTheDocument()
    expect(useFilesStore.getState().sidecarActionRequest).toBeNull()
  })

  it('opens Access directly for a sidecar request from the list row', async () => {
    useFilesStore.setState({
      sidecarActionRequest: {
        uri: 'https://pod.example/public/README.md',
        action: 'access',
      },
    })

    render(<FileDetailPane />)

    expect(await screen.findByRole('dialog', { name: '权限' })).toBeInTheDocument()
    expect(useFilesStore.getState().sidecarActionRequest).toBeNull()
  })

  it('keeps only favorite visible and collects URI, .meta, and Access actions in More', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/diagram.png' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/diagram.png',
        uri: 'https://pod.example/public/diagram.png',
        name: 'diagram.png',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/public/',
        mimeType: 'image/png',
        size: 1024,
        modifiedAt: '2026-06-17T00:00:00.000Z',
        headers: {},
        previewText: 'Architecture diagram preview.',
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const head = screen.getByLabelText('文件详情 head')
    expect(within(head).queryByRole('button', { name: '打开原始 URI' })).not.toBeInTheDocument()
    expect(within(head).queryByRole('button', { name: '复制 URI' })).not.toBeInTheDocument()
    expect(within(head).getByRole('button', { name: '收藏' })).toBeInTheDocument()
    expect(within(head).queryByRole('button', { name: '查看 .meta' })).not.toBeInTheDocument()
    expect(within(head).queryByRole('button', { name: '查看 Access 来源' })).not.toBeInTheDocument()
    expect(within(head).getByRole('button', { name: '更多资源操作' })).toBeInTheDocument()
    expect(within(head).queryByText('打开 URI')).not.toBeInTheDocument()
    expect(within(head).queryByText('复制 URI')).not.toBeInTheDocument()
    expect(within(head).queryByText('进入容器')).not.toBeInTheDocument()

    openResourceActionsMenu()

    expect(screen.getByRole('menuitem', { name: '打开原始 URI' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '复制 URI' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '查看 .meta' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '查看 Access 来源' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '加入收藏' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '取消收藏' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '进入所在容器' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '下载 diagram.png' })).toBeInTheDocument()
  })

  it('opens original uri in new window', () => {
    render(<FileDetailPane />)

    openResourceActionsMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '打开原始 URI' }))

    expect(window.open).toHaveBeenCalledWith('https://pod.example/public/README.md', '_blank', 'noopener,noreferrer')
  })

  it('hides system open when the desktop shell is unavailable', () => {
    delete window.xpodDesktop

    render(<FileDetailPane />)

    openResourceActionsMenu()
    expect(screen.queryByRole('menuitem', { name: '系统打开' })).not.toBeInTheDocument()
  })

  it('opens the selected resource through the desktop shell when available', () => {
    const openExternal = vi.fn().mockResolvedValue(undefined)
    window.xpodDesktop = { app: { openExternal } } as any

    render(<FileDetailPane />)

    openResourceActionsMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '系统打开' }))

    expect(openExternal).toHaveBeenCalledWith('https://pod.example/public/README.md')
  })

  it('enters the parent Pod container from file detail', () => {
    useFilesStore.setState({
      selectedTreeNodeId: 'all',
      selectedFileId: 'https://pod.example/public/README.md',
    })

    render(<FileDetailPane />)

    openResourceActionsMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '进入所在容器' }))

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('container:https://pod.example/public/')
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
  })

  it('exposes a native download action for resource files', () => {
    render(<FileDetailPane />)

    openResourceActionsMenu()
    const download = screen.getByRole('menuitem', { name: '下载 README.md' })

    expect(download).toHaveAttribute('href', 'https://pod.example/public/README.md')
    expect(download).toHaveAttribute('download', 'README.md')
  })

  it('toggles favorite using real file uri', async () => {
    render(<FileDetailPane />)

    const head = screen.getByLabelText('文件详情 head')
    fireEvent.click(within(head).getByRole('button', { name: '收藏' }))

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

  it('does not expose embedded metadata tabs for editable files', () => {
    requestDefaultEditableFileSheetOpen()
    render(<FileDetailPane />)

    expect(screen.queryByRole('button', { name: '元数据' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '来源' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeInTheDocument()
    expect(getEditableFileMetaTail()).toBeInTheDocument()
  })

  it('renders locked vocab registry semantics', () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.vocab/terms.ttl',
        uri: 'https://pod.example/.vocab/terms.ttl',
        name: 'terms.ttl',
        kind: 'resource',
        semanticKind: 'vocab-terms',
        parentUri: 'https://pod.example/.vocab/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<#tags> a udfs:Predicate ; rdfs:label "tags" ; rdfs:comment "Topic labels" ; udfs:range "skos:Concept" ; udfs:shape <#TagsShape> ; udfs:deprecated false .',
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByText('词表定义表')).toBeInTheDocument()
    expect(screen.getByText('1 条定义')).toBeInTheDocument()
    expect(screen.getByText('只读')).toBeInTheDocument()
    expect(screen.getByText('定义表只读；修改通过待确认提案进入审批。')).toBeInTheDocument()
    const lockedViewport = screen.getByLabelText('Locked vocab registry viewport')
    expect(lockedViewport).not.toHaveClass('rounded-lg')
    expect(lockedViewport).not.toHaveClass('border')
    expect(lockedViewport).not.toHaveClass('bg-muted/20')
    expect(screen.queryByText(/System Predicates/)).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索定义')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '术语 URI' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '名称' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '说明' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '类型' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '值类型' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '状态' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Shape' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'subject' })).not.toBeInTheDocument()
    expect(screen.getByText('#tags')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'tags' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Topic labels' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'udfs:Predicate' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'skos:Concept' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'active' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '#TagsShape' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'rdfs:comment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'rdf:type' })).not.toBeInTheDocument()
    expect(screen.queryByText(/@prefix udfs/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ 视图' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kanban' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ predicate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Subject' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('cell', { name: 'tags' }))
    expect(screen.queryByRole('textbox', { name: /Edit/ })).not.toBeInTheDocument()
  })

  it('renders locked shape registry semantics', () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.vocab/shapes.ttl',
        uri: 'https://pod.example/.vocab/shapes.ttl',
        name: 'shapes.ttl',
        kind: 'resource',
        semanticKind: 'vocab-shapes',
        parentUri: 'https://pod.example/.vocab/',
        mimeType: 'text/turtle',
        size: 1024,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<#summary-shape> a udfs:ShapeRule ; rdfs:label "Summary shape" ; udfs:term <https://pod.example/.vocab/terms.ttl#summary> ; udfs:classScope "udfs:Workspace" ; udfs:constraint "minCount 0 · maxCount 1" ; udfs:status "pending" .\n<#title-shape> a udfs:ShapeRule ; rdfs:label "Title shape" ; udfs:term <https://pod.example/.vocab/terms.ttl#title> ; udfs:classScope "udfs:Workspace" ; udfs:constraint "minCount 1 · maxCount 1" ; udfs:status "active" .',
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByText('Shape 规则表')).toBeInTheDocument()
    expect(screen.getByText('2 条规则')).toBeInTheDocument()
    expect(screen.getByText('只读')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索定义')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '规则 URI' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '名称' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'term' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'class' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '约束' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '状态' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'range' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Shape' })).not.toBeInTheDocument()
    expect(screen.getByText('#summary-shape')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Summary shape' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'https://pod.example/.vocab/terms.ttl#summary' })).toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: 'udfs:Workspace' })).toHaveLength(2)
    expect(screen.getByRole('cell', { name: 'minCount 0 · maxCount 1' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'pending' })).toBeInTheDocument()
    expect(screen.getByText('#title-shape')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('搜索定义'), {
      target: { value: 'pending' },
    })

    expect(screen.getByText('#summary-shape')).toBeInTheDocument()
    expect(screen.queryByText('#title-shape')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ predicate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Subject' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('cell', { name: 'Summary shape' }))
    expect(screen.queryByRole('textbox', { name: /Edit/ })).not.toBeInTheDocument()
  })

  it('renders locked namespace registry semantics', () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.vocab/namespaces.ttl',
        uri: 'https://pod.example/.vocab/namespaces.ttl',
        name: 'namespaces.ttl',
        kind: 'resource',
        semanticKind: 'vocab-namespaces',
        parentUri: 'https://pod.example/.vocab/',
        mimeType: 'text/turtle',
        size: 1024,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n@prefix sh: <http://www.w3.org/ns/shacl#> .\n<#schema> a udfs:Namespace ; sh:prefix "schema" ; sh:namespace "https://schema.org/" ; rdfs:comment "Schema.org terms" .',
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByText('命名空间表')).toBeInTheDocument()
    expect(screen.getByText('1 个命名空间')).toBeInTheDocument()
    expect(screen.getByText('只读')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '前缀' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '命名空间' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'URI' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '状态' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '说明' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'range' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Shape' })).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'schema' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'https://schema.org/' })).toBeInTheDocument()
    expect(screen.getByText('#schema')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'active' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Schema.org terms' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ predicate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Subject' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('cell', { name: 'schema' }))
    expect(screen.queryByRole('textbox', { name: /Edit/ })).not.toBeInTheDocument()
  })

  it('opens locked vocab meta in the right drawer instead of file sheet meta', () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.vocab/terms.ttl',
        uri: 'https://pod.example/.vocab/terms.ttl',
        name: 'terms.ttl',
        kind: 'resource',
        semanticKind: 'vocab-terms',
        parentUri: 'https://pod.example/.vocab/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#tags> a udfs:Predicate ; rdfs:label "tags" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseFilesMetaSidecar.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/.vocab/terms.ttl',
        metaUri: 'https://pod.example/.vocab/terms.ttl.meta',
        state: 'exists',
        status: 200,
        content: '<#meta> <#summary> "Vocab metadata" .',
        mimeType: 'text/turtle',
        etag: '"vocab-meta-1"',
        size: 48,
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByText('词表定义表')).toBeInTheDocument()
    expect(screen.queryByLabelText('文件 meta')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'terms.ttl' })).not.toBeInTheDocument()

    openHeaderMetaDrawer()

    const drawer = screen.getByLabelText('Resource .meta inspector')
    expect(within(drawer).getByText('https://pod.example/.vocab/terms.ttl.meta')).toBeInTheDocument()
    expect(within(drawer).getByText(/Vocab metadata/)).toBeInTheDocument()
    expect(screen.queryByLabelText('文件 meta')).not.toBeInTheDocument()
  })

  it('opens locked vocab registry terms as readonly term cards', () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.vocab/terms.ttl',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.vocab/terms.ttl',
        uri: 'https://pod.example/.vocab/terms.ttl',
        name: 'terms.ttl',
        kind: 'resource',
        semanticKind: 'vocab-terms',
        parentUri: 'https://pod.example/.vocab/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<#tags> a udfs:Predicate ; rdfs:label "tags" ; rdfs:comment "Topic labels" .',
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Open term tags' })[0])

    const termSidecar = screen.getByLabelText('Structured term peek')
    expect(termSidecar).toHaveAttribute('data-structured-subject-peek', 'true')
    expect(termSidecar).not.toHaveAttribute('data-sidecar-coverage')
    expect(termSidecar).not.toHaveClass('inset-y-0', 'w-[360px]')
    expect(termSidecar).not.toHaveClass('inset-0', 'w-full', 'max-w-none')
    expect(screen.queryByRole('dialog', { name: 'term definition' })).not.toBeInTheDocument()
    expect(within(termSidecar).queryByText('#tags')).not.toBeInTheDocument()
    fireEvent.click(within(termSidecar).getByRole('button', { name: '查看 URI 详情' }))
    expect(within(termSidecar).getByText('#tags')).toBeInTheDocument()
    expect(within(termSidecar).getByText('https://pod.example/.vocab/terms.ttl')).toBeInTheDocument()
    expect(within(termSidecar).getByText('rdfs:label')).toBeInTheDocument()
    expect(within(termSidecar).getByText('"tags"')).toBeInTheDocument()
    expect(within(termSidecar).getByText('rdfs:comment')).toBeInTheDocument()
    expect(within(termSidecar).getByText('"Topic labels"')).toBeInTheDocument()
    expect(within(termSidecar).queryByRole('button', { name: '取消' })).not.toBeInTheDocument()

    fireEvent.click(within(termSidecar).getByRole('button', { name: '关闭' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Open term tags' })[1])
    expect(screen.getByLabelText('Structured term peek')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取消' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开承载文件' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.vocab/terms.ttl')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toBeNull()
    expect(screen.queryByLabelText('Structured term peek')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ predicate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Subject' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Edit/ })).not.toBeInTheDocument()
  })

  it('renders generic JSON-LD resources under .vocab as read-only structured data', () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.vocab/domain.jsonld',
        uri: 'https://pod.example/.vocab/domain.jsonld',
        name: 'domain.jsonld',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.vocab/',
        mimeType: 'application/ld+json',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: JSON.stringify({
          '@context': {
            udfs: 'https://undefineds.co/vocab/',
            rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
          },
          '@graph': [
            {
              '@id': '#tags',
              '@type': 'udfs:Predicate',
              'rdfs:label': 'tags',
              'rdfs:comment': 'Topic labels',
              'udfs:range': 'skos:Concept',
              'udfs:shape': { '@id': '#TagsShape' },
            },
          ],
        }),
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

	    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument()
    expect(screen.queryByText('词表定义表')).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '#tags' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '"tags"' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '"Topic labels"' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '"skos:Concept"' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'TagsShape' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ predicate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Subject' })).not.toBeInTheDocument()
  })

  it('renders generic RDF/XML resources under .vocab as read-only structured data', () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.vocab/domain.rdf',
        uri: 'https://pod.example/.vocab/domain.rdf',
        name: 'domain.rdf',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.vocab/',
        mimeType: 'application/rdf+xml',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: `<?xml version="1.0"?>
          <rdf:RDF
            xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
            xmlns:udfs="https://undefineds.co/vocab/">
            <rdf:Description rdf:about="#tags">
              <rdf:type rdf:resource="https://undefineds.co/vocab/Predicate" />
              <rdfs:label>tags</rdfs:label>
              <rdfs:comment>Topic labels</rdfs:comment>
            </rdf:Description>
          </rdf:RDF>`,
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument()
    expect(screen.queryByText('词表定义表')).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '#tags' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '"tags"' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '"Topic labels"' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ predicate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Subject' })).not.toBeInTheDocument()
  })

  it('keeps Files control manifests under .data index read-only even though they are Turtle', () => {
    const manifestUri = 'https://pod.example/.data/index/sources/report/manifest.ttl'
    useFilesStore.setState({
      selectedFileId: manifestUri,
      structuredClassScope: 'udfs:SourceIndexManifest',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: manifestUri,
        uri: manifestUri,
        name: 'manifest.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/index/sources/report/',
        mimeType: 'text/turtle',
        size: 1024,
        modifiedAt: '2026-06-18T05:00:00.000Z',
        headers: {},
        previewText: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '',
          '<#manifest> a udfs:SourceIndexManifest ;',
          '  dcterms:source <https://source.example/report.pdf> ;',
          '  udfs:sourceHash "sha256-source-1" ;',
          '  udfs:ingestVersion "pdf-ingest-v1" ;',
          '  udfs:ingestStatus "partial" ;',
          '  udfs:ingestedRange "chunk:1..chunk:2" ;',
          '  udfs:pendingRange "chunk:3..chunk:9" ;',
          '  udfs:lastIngestedAt "2026-06-18T05:00:00.000Z" ;',
          '  udfs:writesCanonicalContent false .',
        ].join('\n'),
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '"partial"' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ predicate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Subject' })).not.toBeInTheDocument()
    expect(mockUsePendingStructuredCellChangeProposals).toHaveBeenCalledWith(manifestUri, false)
    expect(mockUsePendingVocabTermProposals).toHaveBeenCalledWith(manifestUri, false)

    fireEvent.click(screen.getByRole('cell', { name: '"partial"' }))

    expect(screen.queryByRole('textbox', { name: '编辑 #manifest 的 ingestStatus' })).not.toBeInTheDocument()
    expect(mockCreateCellProposal).not.toHaveBeenCalled()
  })

  it('keeps Files control manifests under .data ingest read-only even though they are Turtle', () => {
    const manifestUri = 'https://pod.example/.data/ingest/sources/report/manifest.ttl'
    useFilesStore.setState({
      selectedFileId: manifestUri,
      structuredClassScope: 'udfs:SourceIngestManifest',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: manifestUri,
        uri: manifestUri,
        name: 'manifest.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/ingest/sources/report/',
        mimeType: 'text/turtle',
        size: 1024,
        modifiedAt: '2026-06-18T05:00:00.000Z',
        headers: {},
        previewText: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '',
          '<#manifest> a udfs:SourceIngestManifest ;',
          '  dcterms:source <https://source.example/report.pdf> ;',
          '  udfs:sourceHash "sha256-source-1" ;',
          '  udfs:ingestVersion "pdf-ingest-v1" ;',
          '  udfs:ingestStatus "partial" ;',
          '  udfs:ingestedRange "chunk:1..chunk:2" ;',
          '  udfs:pendingRange "chunk:3..chunk:9" ;',
          '  udfs:lastIngestedAt "2026-06-18T05:00:00.000Z" ;',
          '  udfs:writesCanonicalContent false .',
        ].join('\n'),
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '"partial"' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ predicate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Subject' })).not.toBeInTheDocument()
    expect(mockUsePendingStructuredCellChangeProposals).toHaveBeenCalledWith(manifestUri, false)
    expect(mockUsePendingVocabTermProposals).toHaveBeenCalledWith(manifestUri, false)

    fireEvent.click(screen.getByRole('cell', { name: '"partial"' }))

    expect(screen.queryByRole('textbox', { name: '编辑 #manifest 的 ingestStatus' })).not.toBeInTheDocument()
    expect(mockCreateCellProposal).not.toHaveBeenCalled()
  })

  it('renders structured data resource semantics', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix schema: <https://schema.org/> .\n@prefix dcterms: <http://purl.org/dc/terms/> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n<#Workspace> a udfs:Workspace ; title "Files" ; schema:dateModified "2026-03-01" ; status "active" ; mode "read/write" ; priority "high" ; tags "core", "rdf" ; related <#Other> ; published true ; progress 42 ; due "2026-03-05"^^xsd:date ; fullDue "2026-04-01"^^<http://www.w3.org/2001/XMLSchema#date> .\n<#Other> a udfs:Workspace ; title "Other" ; schema:dateModified "2026-03-02" ; status "active" ; mode "read" ; tags "archive" ; fullDue "2026-04-02"^^<http://www.w3.org/2001/XMLSchema#date> .\n<https://pod.example/public/report.md> a udfs:Workspace ; title "Report" ; related <../docs/report.md> .\n<../docs/report.md> a udfs:Workspace ; title "Relative report" ; schema:description "Parsed report card summary" ; dcterms:source <https://pod.example/public/source.pdf> .\n<../docs/external.md> a udfs:Document ; title "External report" ; dcterms:source <https://source.example/report.pdf> .'
    const vocabTermsSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<#Workspace> a udfs:ClassTerm ; rdfs:label "Workspace" ; rdfs:comment "Personal workspace class." .\n<#title> a udfs:PredicateTerm ; rdfs:label "title" ; rdfs:comment "Human readable subject title." ; udfs:range "text" ; udfs:shape <#TitleShape> .\n<#tags> a udfs:PredicateTerm ; rdfs:label "tags" ; rdfs:comment "Topic labels." ; udfs:range "enum" ; udfs:shape <#TagsShape> .\n<#mode> a udfs:PredicateTerm ; rdfs:label "mode" ; rdfs:comment "File access mode." ; udfs:range "enum" ; udfs:shape <#ModeShape> .\n<#read-only> a udfs:EnumOptionTerm ; rdfs:label "read-only" ; rdfs:comment "Readonly mode." ; udfs:shape "predicate #mode" .\n<#priority> a udfs:PredicateTerm ; rdfs:label "priority" ; rdfs:comment "Review priority." ; udfs:range "enum" ; udfs:shape <#PriorityShape> .\n<#low> a udfs:EnumOptionTerm ; rdfs:label "low" ; rdfs:comment "Low priority." ; udfs:shape "predicate #priority" .\n<#published> a udfs:PredicateTerm ; rdfs:label "published" ; rdfs:comment "Publication toggle." ; udfs:range "boolean" .\n<#progress> a udfs:PredicateTerm ; rdfs:label "progress" ; rdfs:comment "Completion percent." ; udfs:range "number" .\n<#due> a udfs:PredicateTerm ; rdfs:label "due" ; rdfs:comment "Due date." ; udfs:range "date" .\n<#related> a udfs:PredicateTerm ; rdfs:label "related" ; rdfs:comment "Related resource." ; udfs:range "relation" .'
    const vocabShapesSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<#title-shape> a udfs:ShapeRule ; rdfs:label "Title shape" ; udfs:term <https://pod.example/.vocab/terms.ttl#title> ; udfs:classScope "udfs:Workspace" ; udfs:constraint "minCount 1 · maxCount 1" ; udfs:status "active" .\n<#tags-shape> a udfs:ShapeRule ; rdfs:label "Tags shape" ; udfs:term <https://pod.example/.vocab/terms.ttl#tags> ; udfs:classScope "udfs:Workspace" ; udfs:constraint "maxCount 1" ; udfs:status "active" .'
    const parserManifestUri = 'https://pod.example/.data/index/sources/pod-example-public-source-0htirth/manifest.ttl'
    const parserManifestSource = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix dcterms: <http://purl.org/dc/terms/> .',
      '',
      '<#manifest> a udfs:ParserIndexManifest ;',
      '  dcterms:source <https://pod.example/public/source.pdf> ;',
      '  udfs:sourceHash "sha256-existing-source" ;',
      '  udfs:parserVersion "linx-parser-v1" ;',
      '  udfs:parserStatus "partial" ;',
      '  udfs:readChunks 2 ;',
      '  udfs:totalChunks 9 ;',
      '  udfs:parsedRange "chunk:1..chunk:2" ;',
      '  udfs:pendingRange "chunk:3..chunk:9" ;',
      '  udfs:priorityQueue "chunk:3..chunk:9" ;',
      '  udfs:lastParsedAt "2026-06-18T05:00:00.000Z" ;',
      '  udfs:writesCanonicalContent false .',
    ].join('\n')
    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredClassScope: 'udfs:Workspace',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri === 'https://pod.example/.vocab/terms.ttl') {
        return {
          data: {
            uri,
            content: vocabTermsSource,
            mimeType: 'text/turtle',
            etag: '"vocab-terms-1"',
            headers: { etag: '"vocab-terms-1"', 'content-type': 'text/turtle' },
          },
          isLoading: false,
          error: null,
        }
      }
      if (uri === 'https://pod.example/.vocab/shapes.ttl') {
        return {
          data: {
            uri,
            content: vocabShapesSource,
            mimeType: 'text/turtle',
            etag: '"vocab-shapes-1"',
            headers: { etag: '"vocab-shapes-1"', 'content-type': 'text/turtle' },
          },
          isLoading: false,
          error: null,
        }
      }
      if (uri === parserManifestUri) {
        return {
          data: {
            uri,
            content: parserManifestSource,
            mimeType: 'text/turtle',
            etag: '"parser-manifest-1"',
            headers: { etag: '"parser-manifest-1"', 'content-type': 'text/turtle' },
          },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: {
          uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"raw-structured-semantics-1"',
          headers: { etag: '"raw-structured-semantics-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)
    const chooseClassScope = async (className: string) => {
      await act(async () => {
        fireEvent.pointerDown(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ }))
      })
      const displayName = className.includes(':') ? className.split(':').pop()! : className
      await act(async () => {
        const classItem = screen.queryByRole('menuitem', { name: className })
          ?? await screen.findByRole('menuitem', { name: displayName })
        fireEvent.click(classItem)
      })
    }
    const openStructuredFilters = async () => {
      await act(async () => {
        fireEvent.pointerDown(screen.getByRole('button', { name: '筛选' }))
      })
    }
    const chooseStructuredFilterCheckbox = async (name: string) => {
      await openStructuredFilters()
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitemcheckbox', { name }))
      })
    }
    const chooseStructuredFilterItem = async (name: string) => {
      await openStructuredFilters()
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitem', { name }))
      })
    }

    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument()
    const classScopeButton = screen.getByRole('button', { name: '当前 class：Workspace' })
    expect(classScopeButton).toBeInTheDocument()
    expect(within(classScopeButton).queryByText('Workspace')).not.toBeInTheDocument()
    expect(screen.getByText(/4 行 · \d+ predicate/)).toBeInTheDocument()
    expect(screen.getByText('1 个校验提醒')).toBeInTheDocument()
    expect(screen.getByText('#Workspace tags has 2 values; maxCount is 1.')).toBeInTheDocument()
    expect(screen.getByLabelText('Shape warning for tags on #Workspace')).toBeInTheDocument()
    await chooseStructuredFilterCheckbox('有校验提醒的 subject')
    expect(screen.getByRole('button', { name: '#Workspace' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '#Other' })).not.toBeInTheDocument()
    expect(screen.getByText('1 个校验提醒')).toBeInTheDocument()
    await chooseStructuredFilterCheckbox('有校验提醒的 subject')
    expect(screen.getByRole('button', { name: '#Other' })).toBeInTheDocument()
    await chooseStructuredFilterItem('enum')
    expect(screen.getByRole('columnheader', { name: /tags/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /mode/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /title/ })).not.toBeInTheDocument()
    await chooseStructuredFilterItem('全部类型')
    expect(screen.getByRole('columnheader', { name: /title/ })).toBeInTheDocument()
    await chooseStructuredFilterItem('schema')
    expect(screen.getByRole('columnheader', { name: /dateModified/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /description/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /title/ })).not.toBeInTheDocument()
    await chooseStructuredFilterItem('全部命名空间')
    expect(screen.getByRole('columnheader', { name: /title/ })).toBeInTheDocument()
    await chooseStructuredFilterItem('已定义 predicate')
    expect(screen.getByRole('columnheader', { name: /title/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /tags/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /dateModified/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /status/ })).not.toBeInTheDocument()
    await chooseStructuredFilterItem('全部词表定义')
    expect(screen.getByRole('columnheader', { name: /dateModified/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ 视图' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '预览' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '来源' })).not.toBeInTheDocument()
    const structuredByline = screen.getByLabelText('结构化资源信息')
    expect(structuredByline).toHaveClass('h-10')
    expect(structuredByline).toHaveClass('flex')
    expect(within(structuredByline).getByText('Workspace')).toBeInTheDocument()
    expect(within(structuredByline).queryByText('Subject')).not.toBeInTheDocument()
    const structuredResourceViewport = screen.getByLabelText('Structured resource viewport')
    expect(structuredResourceViewport).not.toHaveClass('rounded-lg')
    expect(structuredResourceViewport).not.toHaveClass('border')
    expect(structuredResourceViewport).not.toHaveClass('bg-muted/20')
    const structuredTableTools = screen.getByLabelText('结构化表工具')
    expect(structuredTableTools).toBeInTheDocument()
    expect(structuredTableTools).toHaveAttribute('data-control-surface', 'byline-tools')
    expect(structuredTableTools).toHaveClass('contents')
    expect(screen.queryByRole('button', { name: 'Kanban' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'class' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'rdf:type' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'https://pod.example/public/report.md' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '../docs/report.md' })).toBeInTheDocument()
    expect(screen.queryByText(/@prefix schema/)).not.toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '../docs/report.md' }))
    })

    const subjectSidecar = screen.getByLabelText('Structured subject peek')
    expect(subjectSidecar).toHaveAttribute('data-structured-subject-peek', 'true')
    expect(subjectSidecar).not.toHaveAttribute('data-sidecar-coverage')
    expect(subjectSidecar).not.toHaveClass('inset-y-0', 'w-[360px]')
    expect(subjectSidecar).not.toHaveClass('inset-0', 'w-full', 'max-w-none')
    expect(within(subjectSidecar).getByText('卡片预览')).toBeInTheDocument()
    expect(within(subjectSidecar).getByLabelText('Subject card summary')).toBeInTheDocument()
    expect(within(subjectSidecar).getByText('类型 · Workspace')).toBeInTheDocument()
    expect(within(subjectSidecar).queryByText(/Type:/)).not.toBeInTheDocument()
    expect(within(subjectSidecar).queryByText('Subject URI')).not.toBeInTheDocument()
    fireEvent.click(within(subjectSidecar).getByRole('button', { name: '查看 URI 详情' }))
    expect(within(subjectSidecar).getByText('Subject URI')).toBeInTheDocument()
    expect(within(subjectSidecar).queryByRole('button', { name: '审阅 Ingest' })).not.toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/ws-1/state.ttl')
    await act(async () => {
      fireEvent.click(within(subjectSidecar).getByRole('button', { name: '打开资源' }))
    })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/docs/report.md')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toMatchObject({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      viewMode: 'table',
      classScope: 'udfs:Workspace',
    })
    expect(mockCreateRaw).not.toHaveBeenCalled()
    expect(mockCreateSourceProposal).not.toHaveBeenCalled()

    act(() => {
      useFilesStore.setState({
        selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        structuredViewMode: 'table',
        structuredClassScope: null,
        structuredSearchText: '',
        structuredSortKey: null,
        structuredSortDirection: 'asc',
        structuredHiddenPredicates: new Set(),
        structuredViewConfigsByDocument: {},
        structuredColumnSizingByDocument: {},
        structuredKanbanGroupPredicate: null,
        structuredSubjectReturnContext: null,
      })
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '../docs/external.md' }))
    })
    const externalSubjectSidecar = screen.getByLabelText('Structured subject peek')
    expect(within(externalSubjectSidecar).getByText('卡片预览')).toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/ws-1/state.ttl')
    await act(async () => {
      fireEvent.click(within(externalSubjectSidecar).getByRole('button', { name: '打开资源' }))
    })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/docs/external.md')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toMatchObject({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/external.md',
    })

    act(() => {
      useFilesStore.setState({
        selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        structuredViewMode: 'table',
        structuredClassScope: null,
        structuredSearchText: '',
        structuredSortKey: null,
        structuredSortDirection: 'asc',
        structuredHiddenPredicates: new Set(),
        structuredViewConfigsByDocument: {},
        structuredColumnSizingByDocument: {},
        structuredKanbanGroupPredicate: null,
        structuredSubjectReturnContext: null,
      })
    })

    await chooseClassScope('udfs:Workspace')
    const reportSubjectButton = await screen.findByRole('button', { name: '../docs/report.md' })
    const structuredViewport = reportSubjectButton.closest('[data-structured-resource-viewport="true"]') as HTMLElement | null
    expect(structuredViewport).toBeTruthy()
    structuredViewport!.scrollTop = 184
    expect(structuredViewport!.scrollTop).toBe(184)
    fireEvent.scroll(structuredViewport!)
    window.history.replaceState({}, '', '/files')
    await act(async () => {
      fireEvent.click(reportSubjectButton)
    })
    expect(new URLSearchParams(window.location.search).get('filesRoute')).toBeNull()
    const reportSubjectSidecar = screen.getByLabelText('Structured subject peek')
    await act(async () => {
      fireEvent.click(within(reportSubjectSidecar).getByRole('button', { name: '打开资源' }))
    })

    const routeParams = new URLSearchParams(window.location.search)
    expect(routeParams.get('filesRoute')).toBe('linx.files.structuredSubjectRoute.v1')
    expect(routeParams.get('filesDocument')).toBe('https://pod.example/.data/workspaces/ws-1/state.ttl')
    expect(routeParams.get('filesSubject')).toBe('../docs/report.md')
    expect(routeParams.get('filesTarget')).toBe('https://pod.example/.data/workspaces/docs/report.md')
    expect(routeParams.get('filesScroll')).toBe('184')
    expect(routeParams.get('filesRow')).toBe('0')
    expect(routeParams.get('filesClass')).toBe('udfs:Workspace')
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/docs/report.md')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toEqual({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      scrollTop: 184,
      rowIndex: 0,
      viewMode: 'table',
      classScope: 'udfs:Workspace',
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: null,
    })

    act(() => {
      useFilesStore.setState({
        selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        structuredViewMode: 'table',
        structuredClassScope: null,
        structuredSearchText: '',
        structuredSortKey: null,
        structuredSortDirection: 'asc',
        structuredHiddenPredicates: new Set(),
        structuredViewConfigsByDocument: {},
        structuredColumnSizingByDocument: {},
        structuredKanbanGroupPredicate: null,
        structuredSubjectReturnContext: null,
      })
    })

    await chooseClassScope('udfs:Workspace')
    const absoluteSubjectButton = await screen.findByRole('button', { name: 'https://pod.example/public/report.md' })
    const absoluteStructuredViewport = absoluteSubjectButton.closest('[data-structured-resource-viewport="true"]') as HTMLElement | null
    expect(absoluteStructuredViewport).toBeTruthy()
    absoluteStructuredViewport!.scrollTop = 184
    fireEvent.scroll(absoluteStructuredViewport!)
    await act(async () => {
      fireEvent.click(absoluteSubjectButton)
    })

    const absoluteSubjectSidecar = screen.getByLabelText('Structured subject peek')
    expect(within(absoluteSubjectSidecar).getByText('卡片预览')).toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/ws-1/state.ttl')
    await act(async () => {
      fireEvent.click(within(absoluteSubjectSidecar).getByRole('button', { name: '打开资源' }))
    })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/report.md')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toEqual({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: 'https://pod.example/public/report.md',
      scrollTop: 184,
      rowIndex: 3,
      viewMode: 'table',
      classScope: 'udfs:Workspace',
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: null,
    })

    act(() => {
      useFilesStore.setState({
        selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        structuredViewMode: 'table',
        structuredClassScope: null,
        structuredSearchText: '',
        structuredSortKey: null,
        structuredSortDirection: 'asc',
        structuredHiddenPredicates: new Set(),
        structuredViewConfigsByDocument: {},
        structuredColumnSizingByDocument: {},
        structuredKanbanGroupPredicate: null,
        structuredSubjectReturnContext: null,
      })
    })

    await chooseClassScope('udfs:Workspace')
    fireEvent.pointerDown(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ }))
    fireEvent.click(screen.getByRole('button', { name: '定义' }))
    await waitFor(() => {
      expect(screen.getByText('描述：Personal workspace class.')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: '创建 class' }))
    fireEvent.change(screen.getByLabelText('新 class URI'), {
      target: { value: 'udfs:Note' },
    })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    expect(screen.getByText('note*')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '提交待确认 class *' }))
    await waitFor(() => {
      expect(mockCreateInboxApproval).toHaveBeenCalledWith(expect.objectContaining({
        id: expect.stringMatching(/^https:\/\/pod\.example\/\.data\/proposals\/vocab\/note-[a-z0-9]{7}\.ttl#proposal$/),
        proposalResourceUri: expect.stringMatching(/^https:\/\/pod\.example\/\.data\/proposals\/vocab\/note-[a-z0-9]{7}\.ttl$/),
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
        targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
        termUri: 'https://pod.example/.vocab/terms.ttl#note',
        termKind: 'class',
        label: 'note',
        valueType: 'class',
        writesCanonicalVocab: false,
      }))
    })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Workspace' }))

    expect(screen.getByText('#Workspace')).toBeInTheDocument()
    expect(screen.getAllByText('tags').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('status')).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open definition for title' }))
    expect(screen.getByText('Predicate 定义')).toBeInTheDocument()
    expect(screen.getByText('Human readable subject title.')).toBeInTheDocument()
    expect(screen.getByText('text')).toBeInTheDocument()
    expect(screen.getByText('minCount 1 · maxCount 1')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '复制 predicate URI' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /dateModified/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /schema:dateModified/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: '显示命名空间' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '隐藏 predicate' })).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: '隐藏 predicate' }))
    const namespaceVisibilityItem = screen.getByRole('menuitemcheckbox', { name: '显示命名空间' })
    expect(namespaceVisibilityItem).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(namespaceVisibilityItem)
    expect(screen.getByRole('columnheader', { name: /schema:dateModified/ })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: '隐藏 predicate' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '显示命名空间' }))
    expect(screen.queryByRole('columnheader', { name: /schema:dateModified/ })).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: '隐藏 predicate' }))
    const dateModifiedVisibilityItem = screen.getByRole('menuitemcheckbox', { name: 'dateModified' })
    expect(dateModifiedVisibilityItem).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(dateModifiedVisibilityItem)
    expect(screen.queryByRole('columnheader', { name: /dateModified/ })).not.toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: '隐藏 predicate' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'dateModified' }))
    expect(screen.getByRole('columnheader', { name: /dateModified/ })).toBeInTheDocument()
    const subjectHeader = screen.getByRole('columnheader', { name: /subject/ })
    const subjectResize = screen.getByRole('separator', { name: '调整 subject 列宽' })
    const initialSubjectWidth = Number.parseFloat(subjectHeader.style.width)
    fireEvent.mouseDown(subjectResize, { clientX: 200 })
    fireEvent.mouseMove(document, { clientX: 160 })
    fireEvent.mouseUp(document)
    expect(Number.parseFloat(subjectHeader.style.width)).toBeLessThan(initialSubjectWidth)
    const dateModifiedHeader = screen.getByRole('columnheader', { name: /dateModified/ })
    const dateModifiedResize = screen.getByRole('separator', { name: '调整 dateModified 列宽' })
    const initialWidth = Number.parseFloat(dateModifiedHeader.style.width)
    fireEvent.mouseDown(dateModifiedResize, { clientX: 200 })
    fireEvent.mouseMove(document, { clientX: 260 })
    fireEvent.mouseUp(document)
    expect(Number.parseFloat(dateModifiedHeader.style.width)).toBeGreaterThan(initialWidth)
    const resizedDateModifiedWidth = Number.parseFloat(dateModifiedHeader.style.width)
    expect(screen.getByRole('cell', { name: 'core rdf' })).toBeInTheDocument()

    mockMutateRaw.mockClear()
    mockCreateCellProposal.mockClear()
    fireEvent.click(screen.getByRole('cell', { name: '"Files"' }))
    const titleInput = screen.getByRole('textbox', { name: '编辑 #Workspace 的 title' })
    expect(titleInput).toHaveValue('Files')
    fireEvent.change(titleInput, { target: { value: 'LinX Files' } })
    fireEvent.focus(titleInput)
    fireEvent.blur(titleInput)
    expect(screen.getByRole('cell', { name: 'LinX Files' })).toBeInTheDocument()
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Workspace',
        predicate: 'title',
        previousValues: ['"Files"'],
        nextValues: ['"LinX Files"'],
        writesCanonicalResource: false,
      }))
    })
    expect(screen.getByRole('status', { name: 'Pending approval for title on #Workspace' })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: '筛选' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '有待确认更改的 subject' }))
    expect(screen.getByRole('button', { name: '#Workspace' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '#Other' })).not.toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: '筛选' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '有待确认更改的 subject' }))
    expect(screen.getByRole('button', { name: '#Other' })).toBeInTheDocument()
    expect(mockMutateRaw).not.toHaveBeenCalled()
    mockCreateCellProposal.mockClear()

    expect(screen.queryByRole('cell', { name: '"read/write"' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('cell', { name: 'read/write' }))
    expect(screen.getByRole('listbox', { name: '#Workspace 的 mode 选项' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'read/write' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'read-only' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'read-only' }))
    expect(screen.getByRole('cell', { name: 'read-only' })).toBeInTheDocument()
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Workspace',
        predicate: 'mode',
        previousValues: ['"read/write"'],
        nextValues: ['"read-only"'],
        writesCanonicalResource: false,
      }))
    })
    expect(mockMutateRaw).not.toHaveBeenCalled()
    mockCreateCellProposal.mockClear()

    fireEvent.click(screen.getByRole('cell', { name: 'core rdf' }))
    expect(screen.getByRole('listbox', { name: '#Workspace 的 tags 选项' })).toBeInTheDocument()
    expect(screen.getByLabelText('#Workspace 的 tags 已选择 core')).toBeInTheDocument()
    expect(screen.getByLabelText('#Workspace 的 tags 已选择 rdf')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'archive' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '从 #Workspace 的 tags 移除 core' }))
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Workspace',
        predicate: 'tags',
        previousValues: ['"core"', '"rdf"'],
        nextValues: ['"rdf"'],
        writesCanonicalResource: false,
      }))
    })
    expect(screen.getByRole('cell', { name: 'rdf' })).toBeInTheDocument()
    mockCreateCellProposal.mockClear()
    fireEvent.click(screen.getByRole('cell', { name: 'rdf' }))
    expect(screen.getByRole('listbox', { name: '#Workspace 的 tags 选项' })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: '选项定义 archive' }))
    expect(screen.getByText('选项定义')).toBeInTheDocument()
    expect(screen.queryByText('https://pod.example/.vocab/terms.ttl#archive')).not.toBeInTheDocument()
    expect(screen.getAllByText('tags').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('已定义或已观察')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '打开选项链接' })).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    const tagSearch = screen.getByRole('combobox', { name: '编辑 #Workspace 的 tags' })
    expect(tagSearch).toHaveAttribute('aria-expanded', 'true')
    expect(tagSearch).toHaveAttribute('placeholder', '选择或创建选项')
    expect(screen.queryByText('选择或创建选项')).not.toBeInTheDocument()
    fireEvent.change(tagSearch, {
      target: { value: 'solid-modeling' },
    })
    expect(screen.getByText('新增 solid-modeling*')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: '新增选项 solid-modeling' }))
    expect(screen.getByRole('status', { name: 'Pending approval for tags on #Workspace' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查看词表变更 solid-modeling' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '忽略词表变更 solid-modeling' })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(mockCreateInboxApproval).toHaveBeenCalledWith(expect.objectContaining({
        label: 'solid-modeling',
        id: expect.stringMatching(/^https:\/\/pod\.example\/\.data\/proposals\/vocab\/solid-modeling-[a-z0-9]{7}\.ttl#proposal$/),
        proposalResourceUri: expect.stringMatching(/^https:\/\/pod\.example\/\.data\/proposals\/vocab\/solid-modeling-[a-z0-9]{7}\.ttl$/),
        targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
        targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
        termUri: 'https://pod.example/.vocab/terms.ttl#solid-modeling',
        termKind: 'enum-option',
        valueType: 'enum-option',
        predicate: 'https://pod.example/.vocab/terms.ttl#tags',
        writesCanonicalVocab: false,
      }))
    })
    expect(screen.queryByText('待确认词表变更')).not.toBeInTheDocument()
    expect(screen.queryByText('Inbox 审批后写入 .vocab')).not.toBeInTheDocument()
    const pendingTagsCell = await screen.findByRole('cell', { name: 'rdf solid-modeling*' })
    fireEvent.click(pendingTagsCell)
    fireEvent.pointerDown(screen.getByRole('button', { name: '选项定义 solid-modeling' }))
    expect(screen.getByText('选项定义')).toBeInTheDocument()
    expect(screen.getByText('词表变更待确认')).toBeInTheDocument()
    expect(screen.getByText('审批记录已准备')).toBeInTheDocument()
    expect(screen.queryByText('https://pod.example/.vocab/terms.ttl#solid-modeling')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: '打开审批记录' }))
    expect(mockApproveVocab).not.toHaveBeenCalled()
    expect(window.open).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/pod\.example\/\.data\/proposals\/vocab\/solid-modeling-[a-z0-9]{7}\.ttl$/),
      '_blank',
      'noopener,noreferrer',
    )
    const getWorkspaceRow = () => {
      const row = screen.getAllByRole('row').find((candidate) => within(candidate).queryByRole('button', { name: '#Workspace' }))
      expect(row).toBeDefined()
      return row as HTMLElement
    }
    const getOtherRow = () => {
      const row = screen.getAllByRole('row').find((candidate) => within(candidate).queryByRole('button', { name: '#Other' }))
      expect(row).toBeDefined()
      return row as HTMLElement
    }
    const getCellByColumn = (row: HTMLElement, columnLabel: RegExp) => {
      const header = screen.getByRole('columnheader', { name: columnLabel })
      const headers = screen.getAllByRole('columnheader')
      const columnIndex = headers.indexOf(header)
      expect(columnIndex).toBeGreaterThanOrEqual(0)
      const cells = within(row).getAllByRole('cell')
      return cells[columnIndex]
    }

    const otherPriorityCell = getCellByColumn(getOtherRow(), /priority/)
    fireEvent.click(otherPriorityCell)
    expect(screen.getByRole('listbox', { name: '#Other 的 priority 选项' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'high' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'low' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '编辑 #Other 的 priority' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '编辑 #Other 的 priority' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(screen.getByRole('combobox', { name: '编辑 #Other 的 priority' }), { key: 'Escape' })

    const workspacePublishedCell = getCellByColumn(getWorkspaceRow(), /published/)
    expect(within(workspacePublishedCell).getByRole('button', { name: '切换布尔值 true' })).toBeInTheDocument()
    fireEvent.click(workspacePublishedCell)
    expect(within(getCellByColumn(getWorkspaceRow(), /published/)).getByRole('button', { name: '切换布尔值 false' })).toBeInTheDocument()
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Workspace',
        predicate: 'published',
        previousValues: ['true'],
        nextValues: ['false'],
        writesCanonicalResource: false,
      }))
    })
    expect(mockMutateRaw).not.toHaveBeenCalled()
    mockCreateCellProposal.mockClear()

    const otherPublishedCell = getCellByColumn(getOtherRow(), /published/)
    fireEvent.click(otherPublishedCell)
    expect(within(getCellByColumn(getOtherRow(), /published/)).getByRole('button', { name: '切换布尔值 true' })).toBeInTheDocument()
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Other',
        predicate: 'published',
        previousValues: [],
        nextValues: ['true'],
        writesCanonicalResource: false,
      }))
    })
    expect(mockMutateRaw).not.toHaveBeenCalled()
    mockCreateCellProposal.mockClear()

    fireEvent.keyDown(within(getWorkspaceRow()).getByRole('cell', { name: '42' }), { key: 'Enter' })
    const progressInput = within(getWorkspaceRow()).getByRole('spinbutton', { name: '编辑 #Workspace 的 progress' })
    expect(progressInput).toHaveValue(42)
    fireEvent.change(progressInput, { target: { value: '55' } })
    fireEvent.focus(progressInput)
    fireEvent.blur(progressInput)

    fireEvent.click(getCellByColumn(getOtherRow(), /progress/))
    const emptyProgressInput = within(getOtherRow()).getByRole('spinbutton', { name: '编辑 #Other 的 progress' })
    expect(emptyProgressInput).toHaveValue(null)
    fireEvent.change(emptyProgressInput, { target: { value: '13' } })
    fireEvent.focus(emptyProgressInput)
    fireEvent.blur(emptyProgressInput)

    fireEvent.click(within(getWorkspaceRow()).getByRole('cell', { name: '2026-03-05' }))
    const dueInput = within(getWorkspaceRow()).getByLabelText('编辑 #Workspace 的 due')
    expect(dueInput).toHaveAttribute('type', 'date')
    fireEvent.change(dueInput, { target: { value: '2026-03-10' } })

    fireEvent.click(getCellByColumn(getOtherRow(), /due/))
    const emptyDueInput = within(getOtherRow()).getByLabelText('编辑 #Other 的 due')
    expect(emptyDueInput).toHaveAttribute('type', 'date')
    fireEvent.change(emptyDueInput, { target: { value: '2026-03-12' } })

    fireEvent.click(getCellByColumn(getOtherRow(), /related/))
    const emptyRelationInput = screen.getByRole('textbox', { name: '编辑 #Other 的 related' })
    fireEvent.change(emptyRelationInput, { target: { value: '#Workspace' } })
    const updatedRelationInput = screen.getByRole('textbox', { name: '编辑 #Other 的 related' })
    fireEvent.focus(updatedRelationInput)
    fireEvent.blur(updatedRelationInput)
    await waitFor(() => {
      expect(within(getOtherRow()).getByRole('button', { name: 'Open predicate #Workspace' })).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Other',
        predicate: 'related',
        previousValues: [],
        nextValues: ['<#Workspace>'],
        writesCanonicalResource: false,
      }))
    })
    expect(mockMutateRaw).not.toHaveBeenCalled()

    fireEvent.click(within(getWorkspaceRow()).getByRole('cell', { name: '2026-04-01' }))
    const fullDueInput = within(getWorkspaceRow()).getByLabelText('编辑 #Workspace 的 fullDue')
    expect(fullDueInput).toHaveAttribute('type', 'date')
    mockCreateCellProposal.mockClear()
    fireEvent.change(fullDueInput, { target: { value: '2026-04-10' } })
    expect(within(getWorkspaceRow()).getByText('2026-04-10')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Workspace',
        predicate: 'fullDue',
        previousValues: ['"2026-04-01"^^<http://www.w3.org/2001/XMLSchema#date>'],
        nextValues: ['"2026-04-10"^^<http://www.w3.org/2001/XMLSchema#date>'],
        writesCanonicalResource: false,
      }))
    })
    expect(mockMutateRaw).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '+ predicate' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Subject' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'class' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'https://pod.example/public/report.md' })).toBeInTheDocument()

    mockCreateCellProposal.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '+ Subject' }))

    const createSubjectDialog = screen.getByRole('dialog', { name: '新增 subject' })
    expect(within(createSubjectDialog).getByText('udfs:Workspace')).toBeInTheDocument()
    const subjectInput = within(createSubjectDialog).getByLabelText('Subject')
    expect(subjectInput).toHaveValue('#NewSubject')
    fireEvent.change(subjectInput, { target: { value: '#InboxRule' } })
    fireEvent.click(within(createSubjectDialog).getByRole('button', { name: '创建条目审批' }))

    expect(screen.getByText('#InboxRule*')).toBeInTheDocument()
    expect(screen.getByText('待确认 subject')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#InboxRule',
        predicate: 'rdf:type',
        previousValues: [],
        nextValues: ['udfs:Workspace'],
        writesCanonicalResource: false,
      }))
    })
    expect(mockMutateRaw).not.toHaveBeenCalled()

	    fireEvent.pointerDown(screen.getByRole('button', { name: '+ predicate' }))

    const addPredicateMenu = screen.getByRole('menu')
    expect(within(addPredicateMenu).queryByText('Existing Predicates')).not.toBeInTheDocument()
    expect(within(addPredicateMenu).getByPlaceholderText('选择已有 predicate 或创建')).toBeInTheDocument()
    expect(within(addPredicateMenu).getByRole('button', { name: '新建 predicate' })).toBeInTheDocument()
		    fireEvent.click(within(addPredicateMenu).getByRole('button', { name: '新建 predicate' }))
				    expect(screen.getByLabelText('predicate 定义')).toBeInTheDocument()
				    expect(screen.getAllByText('term').length).toBeGreaterThan(0)
				    expect(screen.getAllByText('value').length).toBeGreaterThan(0)
				    expect(screen.getByText('标签')).toBeInTheDocument()
				    expect(screen.getByText('描述')).toBeInTheDocument()
				    expect(screen.queryByLabelText('predicate namespace')).not.toBeInTheDocument()
				    expect(screen.queryByLabelText('predicate URI')).not.toBeInTheDocument()
				    expect(screen.getByRole('button', { name: '类型 text' })).toHaveAttribute('aria-pressed', 'true')
				    expect(screen.getByRole('button', { name: '类型 relation' })).toHaveAttribute('aria-pressed', 'false')
		    expect(screen.queryByLabelText('predicate 最小数量')).not.toBeInTheDocument()
		    expect(screen.queryByLabelText('predicate editor type')).not.toBeInTheDocument()
		    expect(screen.getByRole('button', { name: '展开 shape 和高级信息' })).toBeInTheDocument()
		    fireEvent.click(screen.getByRole('button', { name: '展开 shape 和高级信息' }))
					    expect(screen.getAllByText('shape').length).toBeGreaterThan(0)
					    expect(screen.getByText('URI 覆盖')).toBeInTheDocument()
					    expect(screen.getByText('class scope')).toBeInTheDocument()
		    expect(screen.getByText('ns')).toBeInTheDocument()
		    expect(screen.getByLabelText('predicate class scope')).toHaveValue('udfs:Workspace')
		    expect(screen.getByText('必填')).toBeInTheDocument()
		    expect(screen.getByText('最小')).toBeInTheDocument()
	    expect(screen.getByText('最大')).toBeInTheDocument()
	    expect(screen.getByText('editor')).toBeInTheDocument()
	    expect(screen.getByText('描述')).toBeInTheDocument()
    expect(screen.getByText('提交后以 * 参与当前表格；审批通过前不改写 vocab。')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('predicate namespace'), {
      target: { value: 'udfs' },
    })
    fireEvent.change(screen.getByLabelText('predicate term'), {
      target: { value: 'summary' },
    })
    fireEvent.change(screen.getByLabelText('predicate 标签'), {
      target: { value: 'Summary' },
    })
    fireEvent.change(screen.getByLabelText('predicate URI'), {
      target: { value: 'https://undefineds.co/vocab/summary' },
    })
    fireEvent.change(screen.getByLabelText('predicate class scope'), {
      target: { value: 'udfs:Workspace' },
    })
    fireEvent.change(screen.getByLabelText('predicate 描述'), {
      target: { value: 'Short note summary shown on cards.' },
    })
    fireEvent.click(screen.getByLabelText('predicate 必填'))
    fireEvent.change(screen.getByLabelText('predicate 最小数量'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText('predicate 最大数量'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText('predicate editor type'), {
      target: { value: 'textarea' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交待确认 predicate *' }))
    expect(screen.getByRole('columnheader', { name: /Summary\*/ })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: '待确认 predicate Summary' }))
    expect(screen.getByText('待确认 predicate')).toBeInTheDocument()
    expect(screen.queryByText('https://pod.example/.vocab/terms.ttl#summary')).not.toBeInTheDocument()
    expect(screen.getAllByText('text').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Short note summary shown on cards.')).toBeInTheDocument()
    expect(screen.getByText('class udfs:Workspace · required · minCount 1 · maxCount 1 · editor textarea')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Summary\*/ })).toBeInTheDocument()
    await waitFor(() => {
      expect(mockCreateInboxApproval).toHaveBeenCalledWith(expect.objectContaining({
        id: expect.stringMatching(/^https:\/\/pod\.example\/\.data\/proposals\/vocab\/summary-[a-z0-9]{7}\.ttl#proposal$/),
        proposalResourceUri: expect.stringMatching(/^https:\/\/pod\.example\/\.data\/proposals\/vocab\/summary-[a-z0-9]{7}\.ttl$/),
        targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
        targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
        termUri: 'https://pod.example/.vocab/terms.ttl#summary',
        termKind: 'predicate',
        label: 'Summary',
        valueType: 'text',
        description: 'Short note summary shown on cards.',
        shape: 'class udfs:Workspace · required · minCount 1 · maxCount 1 · editor textarea',
        classScope: 'udfs:Workspace',
        writesCanonicalVocab: false,
      }))
    })
    fireEvent.pointerDown(screen.getByRole('button', { name: '待确认 predicate Summary' }))
    expect(screen.getByText('已提交审批记录；词表未变更。')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '打开审批记录' })).toBeInTheDocument()
    expect(screen.getByText(/^https:\/\/pod\.example\/\.data\/proposals\/vocab\/summary-[a-z0-9]{7}\.ttl$/)).toBeInTheDocument()
    expect(screen.queryByText('https://pod.example/.vocab/terms.ttl')).not.toBeInTheDocument()
    expect(screen.getByText('https://undefineds.co/vocab/summary')).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('separator', { name: '调整 Summary* 列宽' })).toBeInTheDocument()

    mockCreateCellProposal.mockClear()
    fireEvent.click(getCellByColumn(getWorkspaceRow(), /Summary/))
    const summaryInput = within(getWorkspaceRow()).getByRole('textbox', { name: '编辑 #Workspace 的 Summary' })
    fireEvent.change(summaryInput, { target: { value: 'Draft summary' } })
    fireEvent.keyDown(within(getWorkspaceRow()).getByRole('textbox', { name: '编辑 #Workspace 的 Summary' }), { key: 'Enter' })

    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Workspace',
        predicate: 'https://undefineds.co/vocab/summary',
        previousValues: [],
        nextValues: ['"Draft summary"'],
        vocabTermProposalResourceUri: expect.stringMatching(/^https:\/\/pod\.example\/\.data\/proposals\/vocab\/summary-[a-z0-9]{7}\.ttl$/),
        writesCanonicalResource: false,
      }))
    })

	    fireEvent.pointerDown(screen.getByRole('button', { name: '待确认 predicate Summary' }))
	    fireEvent.click(await screen.findByRole('menuitem', { name: '放弃 predicate' }))
    expect(screen.queryByRole('columnheader', { name: /Summary\*/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/pendingPredicate|pending-predicate-uri/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('搜索 subject'), {
      target: { value: '"Other"' },
    })

    expect(screen.getAllByText('#Other').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '#Workspace' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('搜索 subject'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sort title' }))

    expect(useFilesStore.getState().structuredSortKey).toBe('title')

    fireEvent.pointerDown(screen.getByRole('button', { name: '筛选' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'schema' }))
    expect(screen.getByRole('columnheader', { name: /dateModified/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /mode/ })).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kanban' }))

	    expect(screen.getByText('按未分组展示')).toBeInTheDocument()
	    expect(screen.getByText('Unassigned')).toBeInTheDocument()
    expect(screen.queryByText('active')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kanban' })).toBeInTheDocument()
    expect(screen.queryByTestId('rich-text-file-editor')).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: /Kanban 分组 predicate/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'mode' }))

	    expect(screen.getByText('按 mode 分组')).toBeInTheDocument()
    expect(screen.getByText('read-only')).toBeInTheDocument()
    expect(screen.getByText('read')).toBeInTheDocument()

    const otherKanbanCard = document.querySelector('[data-kanban-card-subject="#Other"] [data-structured-subject]') as HTMLElement
    expect(otherKanbanCard).toBeTruthy()
    fireEvent.click(otherKanbanCard)
    expect(otherKanbanCard).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByLabelText('Structured subject peek')).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move #Other' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '移动到 read-only' }))

    await waitFor(() => {
      expect(screen.getByText('待审批：mode -> read-only')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Table' }))

    expect(Number.parseFloat(screen.getByRole('columnheader', { name: /dateModified/ }).style.width)).toBe(resizedDateModifiedWidth)
    const whiteboardViewport = document.querySelector('[data-structured-resource-viewport="true"]') as HTMLElement
    const detailScrollViewport = whiteboardViewport.closest('[data-scroll-area-viewport="true"]') as HTMLElement
    expect(detailScrollViewport).toBeTruthy()
    expect(whiteboardViewport).toHaveClass('overflow-x-hidden')
    whiteboardViewport.scrollLeft = 360
    detailScrollViewport.scrollLeft = 360

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Whiteboard' }))

    await waitFor(() => {
      expect(whiteboardViewport.scrollLeft).toBe(0)
      expect(detailScrollViewport.scrollLeft).toBe(0)
    })
    expect(screen.getByRole('button', { name: '添加 subject 到白板' })).toHaveAttribute('title', expect.stringContaining('白板中 0 张卡片'))
    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    const whiteboardViewMenu = screen.getByRole('menu')
    expect(within(whiteboardViewMenu).queryByRole('menuitem', { name: 'Whiteboard' })).not.toBeInTheDocument()
    expect(within(whiteboardViewMenu).getByRole('menuitem', { name: 'Kanban' })).toBeInTheDocument()
    expect(within(whiteboardViewMenu).getByRole('menuitem', { name: 'Raw' })).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'Escape' })

    expect(screen.getByText('添加 subject 后会在白板中显示卡片。')).toBeInTheDocument()
    expect(document.querySelector('[data-whiteboard-subject="#Workspace"]')).toBeNull()
    fireEvent.pointerDown(screen.getByRole('button', { name: '添加 subject 到白板' }))
    fireEvent.click(screen.getByRole('button', { name: '添加 Files' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: '添加 subject 到白板' }))
    fireEvent.click(screen.getByRole('button', { name: '添加 Other' }))

    expect(document.querySelectorAll('[data-whiteboard-subject-shape]')).toHaveLength(2)
    const workspaceNode = document.querySelector('[data-whiteboard-subject="#Workspace"]') as HTMLElement
    const otherNode = document.querySelector('[data-whiteboard-subject="#Other"]') as HTMLElement
    expect(workspaceNode).toBeTruthy()
    expect(otherNode).toBeTruthy()
    expect(workspaceNode.dataset.layoutX).toBe('40')
    expect(screen.getByRole('button', { name: '添加 subject 到白板' })).toHaveAttribute('title', expect.stringContaining('白板中 2 张卡片'))

    fireEvent.doubleClick(workspaceNode)
	    const whiteboardSubjectPeek = screen.getByLabelText('Structured subject peek')
	    expect(screen.queryByRole('dialog', { name: 'Subject preview' })).not.toBeInTheDocument()
	    expect(within(whiteboardSubjectPeek).getByText('Files')).toBeInTheDocument()
	    expect(within(whiteboardSubjectPeek).getByText((_content, node) => node?.textContent === '类型 · Workspace')).toBeInTheDocument()
	    expect(within(whiteboardSubjectPeek).queryByText('https://pod.example/.data/workspaces/ws-1/state.ttl')).not.toBeInTheDocument()
	    fireEvent.click(within(whiteboardSubjectPeek).getByRole('button', { name: '查看 URI 详情' }))
	    expect(within(whiteboardSubjectPeek).getByText('https://pod.example/.data/workspaces/ws-1/state.ttl')).toBeInTheDocument()
    fireEvent.click(within(whiteboardSubjectPeek).getByRole('button', { name: '取消' }))

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Raw' }))

    expect(screen.getByText(/@prefix schema/)).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: '元数据' })).not.toBeInTheDocument()
    expect(screen.getByText(/@prefix schema/)).toBeInTheDocument()
  }, 40_000)

  it('hides 校验提醒 for rows excluded by the pending writes filter', async () => {
    const structuredSource = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '<#Workspace> a udfs:Workspace ; title "Files" ; tags "core", "rdf" .',
      '<#Other> a udfs:Workspace ; title "Other" ; tags "archive" .',
    ].join('\n')
    const vocabTermsSource = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '<#Workspace> a udfs:ClassTerm ; rdfs:label "Workspace" .',
      '<#title> a udfs:PredicateTerm ; rdfs:label "title" ; udfs:range "text" .',
      '<#tags> a udfs:PredicateTerm ; rdfs:label "tags" ; udfs:range "enum" .',
    ].join('\n')
    const vocabShapesSource = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '<#tags-shape> a udfs:ShapeRule ;',
      '  rdfs:label "Tags shape" ;',
      '  udfs:term <https://pod.example/.vocab/terms.ttl#tags> ;',
      '  udfs:classScope "udfs:Workspace" ;',
      '  udfs:constraint "maxCount 1" ;',
      '  udfs:status "active" .',
    ].join('\n')

    act(() => {
      useFilesStore.setState({
        selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        structuredClassScope: 'udfs:Workspace',
        structuredSubjectReturnContext: null,
      })
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri === 'https://pod.example/.vocab/terms.ttl') {
        return {
          data: {
            uri,
            content: vocabTermsSource,
            mimeType: 'text/turtle',
            etag: '"vocab-terms-pending-filter-1"',
            headers: { etag: '"vocab-terms-pending-filter-1"', 'content-type': 'text/turtle' },
          },
          isLoading: false,
          error: null,
        }
      }
      if (uri === 'https://pod.example/.vocab/shapes.ttl') {
        return {
          data: {
            uri,
            content: vocabShapesSource,
            mimeType: 'text/turtle',
            etag: '"vocab-shapes-pending-filter-1"',
            headers: { etag: '"vocab-shapes-pending-filter-1"', 'content-type': 'text/turtle' },
          },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: {
          uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"raw-pending-filter-1"',
          headers: { etag: '"raw-pending-filter-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })
    mockUsePendingStructuredCellChangeProposals.mockReturnValue({
      data: [
        {
          id: 'https://pod.example/.data/proposals/cell/other-title.ttl#proposal',
          proposalResourceUri: 'https://pod.example/.data/proposals/cell/other-title.ttl',
          documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
          subject: '#Other',
          predicate: 'title',
          previousValues: ['"Other"'],
          nextValues: ['"Other draft"'],
          reason: 'Existing pending proposal',
          createdAt: '2026-06-18T00:00:00.000Z',
          writesCanonicalResource: false,
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByText('1 个校验提醒')).toBeInTheDocument()
    expect(screen.getByText('#Workspace tags has 2 values; maxCount is 1.')).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: '筛选' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '有待确认更改的 subject' }))

    expect(screen.getByRole('button', { name: '#Other' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '#Workspace' })).not.toBeInTheDocument()
    expect(screen.queryByText(/校验提醒/)).not.toBeInTheDocument()
  })

  it('hides 校验提醒 for rows excluded by local in-flight pending writes filter', async () => {
    const structuredSource = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '<#Workspace> a udfs:Workspace ; title "Files" ; tags "core", "rdf" .',
      '<#Other> a udfs:Workspace ; title "Other" ; tags "archive" .',
    ].join('\n')
    const vocabTermsSource = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '<#Workspace> a udfs:ClassTerm ; rdfs:label "Workspace" .',
      '<#title> a udfs:PredicateTerm ; rdfs:label "title" ; udfs:range "text" .',
      '<#tags> a udfs:PredicateTerm ; rdfs:label "tags" ; udfs:range "enum" .',
    ].join('\n')
    const vocabShapesSource = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '<#tags-shape> a udfs:ShapeRule ;',
      '  rdfs:label "Tags shape" ;',
      '  udfs:term <https://pod.example/.vocab/terms.ttl#tags> ;',
      '  udfs:classScope "udfs:Workspace" ;',
      '  udfs:constraint "maxCount 1" ;',
      '  udfs:status "active" .',
    ].join('\n')

    mockCreateCellProposal.mockReturnValueOnce(new Promise(() => {}))
    act(() => {
      useFilesStore.setState({
        selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        structuredClassScope: 'udfs:Workspace',
        structuredSubjectReturnContext: null,
      })
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri === 'https://pod.example/.vocab/terms.ttl') {
        return {
          data: {
            uri,
            content: vocabTermsSource,
            mimeType: 'text/turtle',
            etag: '"vocab-terms-local-pending-filter-1"',
            headers: { etag: '"vocab-terms-local-pending-filter-1"', 'content-type': 'text/turtle' },
          },
          isLoading: false,
          error: null,
        }
      }
      if (uri === 'https://pod.example/.vocab/shapes.ttl') {
        return {
          data: {
            uri,
            content: vocabShapesSource,
            mimeType: 'text/turtle',
            etag: '"vocab-shapes-local-pending-filter-1"',
            headers: { etag: '"vocab-shapes-local-pending-filter-1"', 'content-type': 'text/turtle' },
          },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: {
          uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"raw-local-pending-filter-1"',
          headers: { etag: '"raw-local-pending-filter-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    expect(screen.getByText('1 个校验提醒')).toBeInTheDocument()
    expect(screen.getByText('#Workspace tags has 2 values; maxCount is 1.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('cell', { name: '"Other"' }))
    const titleInput = screen.getByRole('textbox', { name: '编辑 #Other 的 title' })
    fireEvent.change(titleInput, { target: { value: 'Other draft' } })
    fireEvent.focus(titleInput)
    fireEvent.blur(titleInput)

    expect(screen.getByRole('button', { name: 'Discard pending write for title on #Other' })).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: '筛选' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '有待确认更改的 subject' }))

    expect(screen.getByRole('button', { name: '#Other' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '#Workspace' })).not.toBeInTheDocument()
    expect(screen.queryByText(/校验提醒/)).not.toBeInTheDocument()
  })

  it('uses discovered vocab registry resources before same-Pod vocab fallback', async () => {
    const structuredSource = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '<#Workspace> a <https://schema.example/vocab/terms.ttl#Workspace> ;',
      '  <https://schema.example/vocab/terms.ttl#summary> "Uses discovered vocab" .',
    ].join('\n')
    const discoveredTermsSource = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '<#Workspace> a udfs:ClassTerm ; rdfs:label "Shared workspace" .',
      '<#summary> a udfs:PredicateTerm ; rdfs:label "Shared summary" ; rdfs:comment "Definition from discovered Type Index." ; udfs:range "text" .',
    ].join('\n')
    const discoveredShapesSource = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '<#summary-shape> a udfs:ShapeRule ;',
      '  udfs:term <https://schema.example/vocab/terms.ttl#summary> ;',
      '  udfs:classScope "https://schema.example/vocab/terms.ttl#Workspace" ;',
      '  udfs:constraint "maxCount 1" .',
    ].join('\n')
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredClassScope: 'https://schema.example/vocab/terms.ttl#Workspace',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseFilesVocabRegistryDiscovery.mockReturnValue({
      data: {
        publicTypeIndexUri: 'https://pod.example/settings/publicTypeIndex.ttl',
        privateTypeIndexUri: null,
        public: [{
          source: 'public',
          registrationUri: 'https://pod.example/settings/publicTypeIndex.ttl#files-vocab',
          forClass: 'https://undefineds.co/vocab/VocabRegistry',
          instance: 'https://schema.example/vocab/terms.ttl',
          instanceContainer: null,
        }],
        private: [],
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri === 'https://schema.example/vocab/terms.ttl') {
        return {
          data: { uri, content: discoveredTermsSource, mimeType: 'text/turtle', etag: '"terms-1"', headers: {} },
          isLoading: false,
          error: null,
        }
      }
      if (uri === 'https://schema.example/vocab/shapes.ttl') {
        return {
          data: { uri, content: discoveredShapesSource, mimeType: 'text/turtle', etag: '"shapes-1"', headers: {} },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: { uri, content: structuredSource, mimeType: 'text/turtle', etag: '"structured-1"', headers: {} },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    expect(mockUseRawTextResource).toHaveBeenCalledWith('https://schema.example/vocab/terms.ttl', true)
    expect(mockUseRawTextResource).toHaveBeenCalledWith('https://schema.example/vocab/shapes.ttl', true)
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Open definition for summary' }))
    expect(screen.getByText('Definition from discovered Type Index.')).toBeInTheDocument()
  })

  it('keeps class scope, topic tags, and resource meta as separate RDF concepts in the structured UI', () => {
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix dcterms: <http://purl.org/dc/terms/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; tags "core" ; dcterms:source <https://source.example/workspace> .'
    const vocabTermsSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<#Workspace> a udfs:ClassTerm ; rdfs:label "Workspace" ; rdfs:comment "Personal workspace class." .\n<#tags> a udfs:PredicateTerm ; rdfs:label "tags" ; rdfs:comment "Topic labels, not rdf:type class." ; udfs:range "enum" .'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredClassScope: 'udfs:Workspace',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: {
        uri,
        content: uri === 'https://pod.example/.vocab/terms.ttl' ? vocabTermsSource : structuredSource,
        mimeType: 'text/turtle',
        etag: '"structured-semantic-boundary-1"',
        headers: { etag: '"structured-semantic-boundary-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    }))
    mockUseFilesMetaSidecar.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        metaUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl.meta',
        state: 'exists',
        status: 200,
        content: '@prefix dcterms: <http://purl.org/dc/terms/> .\n<#meta> dcterms:source <https://source.example/workspace-card> .',
        mimeType: 'text/turtle',
        etag: '"structured-meta-boundary-1"',
        size: 128,
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ }))
    const classScopeMenu = screen.getByRole('menu')
    expect(within(classScopeMenu).getByRole('menuitem', { name: 'Workspace' })).toBeInTheDocument()
    expect(within(classScopeMenu).queryByRole('menuitem', { name: 'core' })).not.toBeInTheDocument()
    fireEvent.click(within(classScopeMenu).getByRole('button', { name: '定义' }))
    expect(within(classScopeMenu).getByText('描述：Personal workspace class.')).toBeInTheDocument()
    fireEvent.click(within(classScopeMenu).getByRole('menuitem', { name: 'Workspace' }))

    expect(screen.getByRole('columnheader', { name: /tags/ })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'core' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'core' })).not.toBeInTheDocument()

    openHeaderMetaDrawer()
    const drawer = screen.getByLabelText('Resource .meta inspector')
    const semanticHeading = within(drawer).getByText('链接与 Schema')
    expect(semanticHeading).toBeInTheDocument()
    expect(semanticHeading.closest('details')).toBeNull()
    expect(within(drawer).getByText('来源')).toBeInTheDocument()
    expect(within(drawer).getByText('https://source.example/workspace-card')).toBeInTheDocument()
    expect(within(drawer).queryByText('Personal workspace class.')).not.toBeInTheDocument()
  })

  it('does not create source update proposals from direct resource subject navigation', async () => {
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<../docs/report.md> a udfs:Workspace ; title "Report" ; source <https://pod.example/public/source.pdf> .\n<#Other> a udfs:Workspace ; title "Other" .'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredClassScope: 'udfs:Workspace',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: structuredSource,
        mimeType: 'text/turtle',
        etag: '"source-filter-1"',
        headers: { etag: '"source-filter-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByRole('button', { name: '../docs/report.md' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '#Other' })).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '../docs/report.md' }))
    })

    const subjectSidecar = screen.getByLabelText('Structured subject peek')
    expect(within(subjectSidecar).getByText('卡片预览')).toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/ws-1/state.ttl')
    await act(async () => {
      fireEvent.click(within(subjectSidecar).getByRole('button', { name: '打开资源' }))
    })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/docs/report.md')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toMatchObject({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      viewMode: 'table',
      classScope: 'udfs:Workspace',
    })
    expect(mockCreateSourceProposal).not.toHaveBeenCalled()

    act(() => {
      useFilesStore.setState({
        selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        structuredClassScope: 'udfs:Workspace',
        structuredSubjectReturnContext: null,
      })
    })

    await act(async () => {
      fireEvent.pointerDown(screen.getByRole('button', { name: '筛选' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '有 Ingest 更新的 subject' }))
    })

    expect(screen.getByText(/仅 Ingest 更新/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '../docs/report.md' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '#Other' })).not.toBeInTheDocument()
  })

  it('filters structured rows to pending source update proposals hydrated from Inbox', async () => {
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix dcterms: <http://purl.org/dc/terms/> .\n<../docs/report.md> a udfs:Workspace ; title "Report" ; dcterms:source <https://pod.example/public/source.pdf> .\n<#Other> a udfs:Workspace ; title "Other" .'
    const oldSourceProposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      parserManifestUri: 'https://pod.example/.data/index/sources/pod-example-public-source-0htirth/manifest.ttl',
      summary: 'Older indexed source for Report.',
      diff: 'Older source update review for ../docs/report.md.',
      createdAt: '2026-06-18T04:00:00.000Z',
    })
    const sourceProposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '../docs/report.md',
      targetResourceUri: 'https://pod.example/.data/workspaces/docs/report.md',
      sourceUri: 'https://pod.example/public/source.pdf',
      parserManifestUri: 'https://pod.example/.data/index/sources/pod-example-public-source-0htirth/manifest.ttl',
      summary: 'Latest indexed source for Report.',
      diff: 'Latest source update review for ../docs/report.md.',
      createdAt: '2026-06-18T05:00:00.000Z',
    })
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredClassScope: 'udfs:Workspace',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: structuredSource,
        mimeType: 'text/turtle',
        etag: '"source-filter-2"',
        headers: { etag: '"source-filter-2"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    mockUsePendingSourceUpdateProposals.mockReturnValue({
      data: [sourceProposal, oldSourceProposal],
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByRole('button', { name: '../docs/report.md' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '#Other' })).toBeInTheDocument()
    expect(mockUsePendingSourceUpdateProposals).toHaveBeenCalledWith('https://pod.example/.data/workspaces/ws-1/state.ttl', true)

    fireEvent.pointerDown(screen.getByRole('button', { name: '筛选' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '有 Ingest 更新的 subject' }))

    expect(screen.getByText(/仅 Ingest 更新/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '../docs/report.md' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '#Other' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '../docs/report.md' }))
    const subjectSidecar = screen.getByLabelText('Structured subject peek')
    expect(within(subjectSidecar).getByText('卡片预览')).toBeInTheDocument()
    expect(within(subjectSidecar).getByText('https://pod.example/public/source.pdf')).toBeInTheDocument()
    expect(within(subjectSidecar).queryByText('Source update proposal')).not.toBeInTheDocument()
    expect(within(subjectSidecar).queryByText('Ingest state')).not.toBeInTheDocument()
    expect(within(subjectSidecar).queryByText('lazy Ingest on demand')).not.toBeInTheDocument()
    expect(within(subjectSidecar).queryByText(sourceProposal.proposalResourceUri)).not.toBeInTheDocument()
    expect(within(subjectSidecar).queryByText(oldSourceProposal.proposalResourceUri)).not.toBeInTheDocument()
  })

  it('requires a class scope before showing editable structured subject rows', async () => {
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Loose> title "Loose" .'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/loose.ttl',
      structuredClassScope: null,
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/loose.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/loose.ttl',
        name: 'loose.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"loose-1"',
          headers: { etag: '"loose-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    expect(screen.queryByRole('button', { name: '+ Subject' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择或创建 class' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择 class' })).toHaveAttribute('title', '选择或创建 class')
    expect(screen.queryByRole('columnheader', { name: /title/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '#Loose' })).not.toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: '"Loose"' })).not.toBeInTheDocument()
    expect(mockCreateCellProposal).not.toHaveBeenCalled()
    expect(mockMutateRaw).not.toHaveBeenCalled()
  })

  it('keeps the class scope control available when a writable structured file has no typed subjects yet', () => {
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Loose> title "Loose" .'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/loose.ttl',
      structuredClassScope: null,
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/loose.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/loose.ttl',
        name: 'loose.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"loose-1"',
          headers: { etag: '"loose-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '选择 class' }))
    expect(screen.queryByLabelText('新 class URI')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '定义' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '创建 class' }))

    expect(screen.getByLabelText('新 class URI')).toBeInTheDocument()
  })

  it('lets pending class proposals become the active class scope before approval', () => {
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Loose> title "Loose" .'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/loose.ttl',
      structuredClassScope: null,
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/loose.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/loose.ttl',
        name: 'loose.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"loose-1"',
          headers: { etag: '"loose-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '选择 class' }))
    fireEvent.click(screen.getByRole('button', { name: '创建 class' }))
    fireEvent.change(screen.getByLabelText('新 class URI'), { target: { value: 'udfs:Workspace' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    const pendingClassOption = screen.getByRole('menuitem', { name: 'workspace*' })
    fireEvent.click(pendingClassOption)

    expect(screen.getByRole('button', { name: '当前 class：workspace' })).toHaveAttribute('title', 'workspace')
    expect(screen.getByRole('button', { name: '+ Subject' })).toBeEnabled()
    expect(useFilesStore.getState().structuredClassScope).toMatch(/\.vocab\/terms\.ttl#workspace$/)
  })

  it('keeps the class scope control visible for read-only untyped structured resources', () => {
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Loose> title "Loose" .'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/public/loose.ttl',
      structuredClassScope: null,
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/loose.ttl',
        uri: 'https://pod.example/public/loose.ttl',
        name: 'loose.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"loose-readonly-1"',
          headers: { etag: '"loose-readonly-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '选择 class' }))
    expect(screen.queryByRole('button', { name: '定义' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('新 class URI')).not.toBeInTheDocument()
  })

  it('does not report a required predicate as missing when the populated column is hidden', () => {
    const structuredSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#Workspace> a udfs:Workspace ; udfs:title "Files" ; udfs:owner <#Me> .
    `
    const vocabTermsSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      udfs:title a udfs:PredicateTerm ; rdfs:label "title" ; udfs:valueType "text" .
      udfs:owner a udfs:PredicateTerm ; rdfs:label "owner" ; udfs:valueType "relation" .
    `
    const vocabShapesSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#owner-shape> a udfs:ShapeRule ;
        udfs:term udfs:owner ;
        udfs:classScope "udfs:Workspace" ;
        udfs:constraint "minCount 1" .
    `
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredClassScope: 'udfs:Workspace',
      structuredHiddenPredicates: new Set(['udfs:owner']),
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 256,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl')) {
        return {
          data: { uri, content: vocabTermsSource, mimeType: 'text/turtle', etag: '"terms-1"', headers: { etag: '"terms-1"', 'content-type': 'text/turtle' } },
          isLoading: false,
          error: null,
        }
      }
      if (uri.endsWith('/.vocab/shapes.ttl')) {
        return {
          data: { uri, content: vocabShapesSource, mimeType: 'text/turtle', etag: '"shapes-1"', headers: { etag: '"shapes-1"', 'content-type': 'text/turtle' } },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    expect(screen.queryByText(/校验提醒/)).not.toBeInTheDocument()
    expect(screen.getByText(/2 predicates/)).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /owner/ })).not.toBeInTheDocument()
    expect(screen.getByText(/2 predicates.*1 hidden predicate/)).toBeInTheDocument()
    expect(screen.queryByText(/校验提醒/)).not.toBeInTheDocument()
  })

  it('keeps schema-only predicates visible without persistent visibility controls', () => {
    const structuredSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#Workspace> a udfs:Workspace .
    `
    const vocabTermsSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      udfs:owner a udfs:PredicateTerm ; rdfs:label "owner" ; udfs:valueType "relation" .
    `
    const vocabShapesSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#owner-shape> a udfs:ShapeRule ;
        udfs:term udfs:owner ;
        udfs:classScope "udfs:Workspace" ;
        udfs:constraint "minCount 0" .
    `
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredClassScope: 'udfs:Workspace',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 256,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl')) {
        return {
          data: { uri, content: vocabTermsSource, mimeType: 'text/turtle', etag: '"terms-1"', headers: { etag: '"terms-1"', 'content-type': 'text/turtle' } },
          isLoading: false,
          error: null,
        }
      }
      if (uri.endsWith('/.vocab/shapes.ttl')) {
        return {
          data: { uri, content: vocabShapesSource, mimeType: 'text/turtle', etag: '"shapes-1"', headers: { etag: '"shapes-1"', 'content-type': 'text/turtle' } },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    expect(screen.getByRole('columnheader', { name: /owner/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '隐藏 predicate' })).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: '显示命名空间' })).not.toBeInTheDocument()
  })

  it('hides 校验提醒 for hidden schema-only required predicates', async () => {
    const structuredSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#Workspace> a udfs:Workspace ; udfs:title "Files" .
    `
    const vocabTermsSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      udfs:title a udfs:PredicateTerm ; rdfs:label "title" ; udfs:valueType "text" .
      udfs:owner a udfs:PredicateTerm ; rdfs:label "owner" ; udfs:valueType "relation" .
    `
    const vocabShapesSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#owner-shape> a udfs:ShapeRule ;
        udfs:term udfs:owner ;
        udfs:classScope "udfs:Workspace" ;
        udfs:constraint "minCount 1" .
    `
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredClassScope: 'udfs:Workspace',
      structuredHiddenPredicates: new Set(['udfs:owner']),
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 256,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl')) {
        return {
          data: { uri, content: vocabTermsSource, mimeType: 'text/turtle', etag: '"terms-1"', headers: { etag: '"terms-1"', 'content-type': 'text/turtle' } },
          isLoading: false,
          error: null,
        }
      }
      if (uri.endsWith('/.vocab/shapes.ttl')) {
        return {
          data: { uri, content: vocabShapesSource, mimeType: 'text/turtle', etag: '"shapes-1"', headers: { etag: '"shapes-1"', 'content-type': 'text/turtle' } },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    expect(screen.queryByRole('columnheader', { name: /owner/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/校验提醒/)).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: '筛选' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '有校验提醒的 subject' }))

    expect(screen.queryByRole('row', { name: /#Workspace/ })).not.toBeInTheDocument()
  })

  it('keeps class predicates in the + predicate menu when predicate filters hide them', () => {
    const structuredSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix schema: <https://schema.org/> .
      <#Workspace> a udfs:Workspace ;
        udfs:title "Files" ;
        schema:dateModified "2026-03-01" .
    `
    const vocabTermsSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      udfs:title a udfs:PredicateTerm ; rdfs:label "title" ; udfs:valueType "text" .
      schema:dateModified a udfs:PredicateTerm ; rdfs:label "dateModified" ; udfs:valueType "date" .
    `
    const vocabShapesSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix schema: <https://schema.org/> .
      <#title-shape> a udfs:ShapeRule ;
        udfs:term udfs:title ;
        udfs:classScope "udfs:Workspace" ;
        udfs:constraint "minCount 0" .
      <#date-shape> a udfs:ShapeRule ;
        udfs:term schema:dateModified ;
        udfs:classScope "udfs:Workspace" ;
        udfs:constraint "minCount 0" .
    `
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredClassScope: 'udfs:Workspace',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 256,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl')) {
        return {
          data: { uri, content: vocabTermsSource, mimeType: 'text/turtle', etag: '"terms-1"', headers: { etag: '"terms-1"', 'content-type': 'text/turtle' } },
          isLoading: false,
          error: null,
        }
      }
      if (uri.endsWith('/.vocab/shapes.ttl')) {
        return {
          data: { uri, content: vocabShapesSource, mimeType: 'text/turtle', etag: '"shapes-1"', headers: { etag: '"shapes-1"', 'content-type': 'text/turtle' } },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '筛选' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'schema' }))

    expect(screen.getByRole('columnheader', { name: /dateModified/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /title/ })).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ predicate' }))

    const addPredicateMenu = screen.getByRole('menu')
    expect(within(addPredicateMenu).getByText('dateModified')).toBeInTheDocument()
    expect(within(addPredicateMenu).getByText('title')).toBeInTheDocument()

    const predicateSearch = within(addPredicateMenu).getByPlaceholderText('选择已有 predicate 或创建')
    fireEvent.change(predicateSearch, { target: { value: 'title' } })
    expect(within(addPredicateMenu).getByRole('button', { name: '选择 predicate title' })).toBeInTheDocument()
    expect(within(addPredicateMenu).queryByRole('button', { name: '选择 predicate dateModified' })).not.toBeInTheDocument()

    fireEvent.click(within(addPredicateMenu).getByRole('button', { name: '选择 predicate title' }))

    expect(screen.getByRole('columnheader', { name: /title/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /dateModified/ })).toBeInTheDocument()
  })

  it('shows predicate definition context before opening the create flow', () => {
    const structuredSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix schema: <https://schema.org/> .
      <#Workspace> a udfs:Workspace ;
        udfs:title "Files" .
    `
    const vocabTermsSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      udfs:title a udfs:PredicateTerm ;
        rdfs:label "Title" ;
        udfs:valueType "text" ;
        rdfs:comment "Short display name for the workspace." .
      schema:dateModified a udfs:PredicateTerm ;
        rdfs:label "Modified" ;
        udfs:valueType "date" ;
        rdfs:comment "Last meaningful content update." .
    `
    const vocabShapesSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix schema: <https://schema.org/> .
      <#title-shape> a udfs:ShapeRule ;
        udfs:term udfs:title ;
        udfs:classScope "udfs:Workspace" ;
        udfs:constraint "minCount 1" .
      <#date-shape> a udfs:ShapeRule ;
        udfs:term schema:dateModified ;
        udfs:classScope "udfs:Workspace" ;
        udfs:constraint "datatype xsd:date" .
    `
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredClassScope: 'udfs:Workspace',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 256,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl')) {
        return {
          data: { uri, content: vocabTermsSource, mimeType: 'text/turtle', etag: '"terms-1"', headers: { etag: '"terms-1"', 'content-type': 'text/turtle' } },
          isLoading: false,
          error: null,
        }
      }
      if (uri.endsWith('/.vocab/shapes.ttl')) {
        return {
          data: { uri, content: vocabShapesSource, mimeType: 'text/turtle', etag: '"shapes-1"', headers: { etag: '"shapes-1"', 'content-type': 'text/turtle' } },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ predicate' }))

    const addPredicateMenu = screen.getByRole('menu')
    const createPredicate = within(addPredicateMenu).getByRole('button', { name: '新建 predicate' })
    const titlePredicate = within(addPredicateMenu).getByRole('button', { name: '选择 predicate Title' })
    expect(titlePredicate.compareDocumentPosition(createPredicate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(titlePredicate).getByText('text')).toBeInTheDocument()
    expect(within(titlePredicate).getByText('Short display name for the workspace.')).toBeInTheDocument()
    expect(within(addPredicateMenu).getByText('Modified')).toBeInTheDocument()
    expect(within(addPredicateMenu).getByText('date')).toBeInTheDocument()
    expect(within(addPredicateMenu).queryByLabelText('predicate namespace')).not.toBeInTheDocument()

    fireEvent.click(createPredicate)

    expect(within(addPredicateMenu).queryByLabelText('predicate namespace')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '展开 shape 和高级信息' }))
    expect(within(addPredicateMenu).getByLabelText('predicate namespace')).toBeInTheDocument()
  })

  it('renders required vocab schema predicates as editable empty table cells', async () => {
    const structuredSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#Workspace> a udfs:Workspace ; udfs:title "Files" .
    `
    const vocabTermsSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      udfs:title a udfs:PredicateTerm ; rdfs:label "title" ; udfs:valueType "text" .
      udfs:owner a udfs:PredicateTerm ; rdfs:label "owner" ; udfs:valueType "relation" .
    `
    const vocabShapesSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#owner-shape> a udfs:ShapeRule ;
        udfs:term udfs:owner ;
        udfs:classScope "udfs:Workspace" ;
        udfs:constraint "minCount 1" .
    `
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredClassScope: 'udfs:Workspace',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 256,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl')) {
        return {
          data: { uri, content: vocabTermsSource, mimeType: 'text/turtle', etag: '"terms-1"', headers: { etag: '"terms-1"', 'content-type': 'text/turtle' } },
          isLoading: false,
          error: null,
        }
      }
      if (uri.endsWith('/.vocab/shapes.ttl')) {
        return {
          data: { uri, content: vocabShapesSource, mimeType: 'text/turtle', etag: '"shapes-1"', headers: { etag: '"shapes-1"', 'content-type': 'text/turtle' } },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    expect(screen.getByRole('columnheader', { name: /owner/ })).toBeInTheDocument()
    expect(screen.getByText('1 个校验提醒')).toBeInTheDocument()
    expect(screen.getByLabelText('Shape warning for owner on #Workspace')).toBeInTheDocument()

    const workspaceRow = screen.getByRole('row', { name: /#Workspace/ })
    const workspaceCells = within(workspaceRow).getAllByRole('cell')
    fireEvent.click(workspaceCells[2]!)
    const ownerInput = screen.getByRole('textbox', { name: '编辑 #Workspace 的 owner' })
    ;(ownerInput as HTMLInputElement).value = 'https://pod.example/people/me#id'
    fireEvent.keyDown(ownerInput, { key: 'Enter' })

    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Workspace',
        predicate: 'udfs:owner',
        previousValues: [],
        nextValues: ['<https://pod.example/people/me#id>'],
        writesCanonicalResource: false,
      }))
    })
    expect(mockMutateRaw).not.toHaveBeenCalled()
  })

  it.each([
    ['date', 'dateModified', 'Date modified', 'date', 'datatype xsd:date'],
    ['boolean', 'published', 'Published', 'checkbox', 'datatype xsd:boolean'],
    ['number', 'progress', 'Progress', 'input', 'datatype xsd:decimal'],
    ['relation', 'owner', 'Owner', 'relation', 'range resource'],
    ['url', 'source', 'Source URL', 'relation', 'range resource'],
  ])('includes type shape semantics when creating %s predicates from the table head', async (
    predicateType,
    localName,
    label,
    editorType,
    shapeRule,
  ) => {
    const structuredSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#Workspace> a udfs:Workspace .
    `
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredClassScope: 'udfs:Workspace',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 256,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return {
          data: { uri, content: '@prefix udfs: <https://undefineds.co/vocab/> .', mimeType: 'text/turtle', etag: '"vocab-1"', headers: { etag: '"vocab-1"', 'content-type': 'text/turtle' } },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ predicate' }))
    fireEvent.click(screen.getByRole('button', { name: '新建 predicate' }))
    fireEvent.change(screen.getByLabelText('predicate term'), { target: { value: localName } })
    fireEvent.change(screen.getByLabelText('predicate 标签'), { target: { value: label } })
    fireEvent.click(screen.getByRole('button', { name: `类型 ${predicateType}` }))
    fireEvent.click(screen.getByRole('button', { name: '展开 shape 和高级信息' }))
    fireEvent.change(screen.getByLabelText('predicate namespace'), { target: { value: 'schema' } })
    fireEvent.change(screen.getByLabelText('predicate class scope'), { target: { value: 'udfs:Workspace' } })
    fireEvent.change(screen.getByLabelText('predicate editor type'), { target: { value: editorType } })
    fireEvent.click(screen.getByRole('button', { name: '提交待确认 predicate *' }))
    await waitFor(() => {
      expect(mockCreateInboxApproval).toHaveBeenCalled()
    })

    fireEvent.pointerDown(screen.getByRole('button', { name: `待确认 predicate ${label}` }))
    expect(screen.getAllByText(predicateType).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(`class udfs:Workspace · ${shapeRule} · editor ${editorType}`)).toBeInTheDocument()
  })

  it('uses pending enum options immediately when editing structured cells', async () => {
    const structuredSource = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#Workspace> a udfs:Workspace .
    `
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredClassScope: 'udfs:Workspace',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 256,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return {
          data: { uri, content: '@prefix udfs: <https://undefineds.co/vocab/> .', mimeType: 'text/turtle', etag: '"vocab-1"', headers: { etag: '"vocab-1"', 'content-type': 'text/turtle' } },
          isLoading: false,
          error: null,
        }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ predicate' }))
    fireEvent.click(screen.getByRole('button', { name: '新建 predicate' }))
    fireEvent.change(screen.getByLabelText('predicate term'), { target: { value: 'status' } })
    fireEvent.change(screen.getByLabelText('predicate 标签'), { target: { value: 'Status' } })
    fireEvent.click(screen.getByRole('button', { name: '类型 enum' }))
    fireEvent.click(screen.getByRole('button', { name: '展开 shape 和高级信息' }))
    fireEvent.change(screen.getByLabelText('predicate editor type'), { target: { value: 'select' } })
    fireEvent.change(screen.getByLabelText('predicate 枚举选项'), { target: { value: 'Ready, Blocked' } })
    fireEvent.click(screen.getByRole('button', { name: '提交待确认 predicate *' }))
    await waitFor(() => {
      expect(mockCreateInboxApproval).toHaveBeenCalledWith(expect.objectContaining({
        label: 'Status',
        termKind: 'predicate',
        valueType: 'enum',
      }))
    })
    mockCreateInboxApproval.mockClear()

    const workspaceRow = screen.getByRole('row', { name: /#Workspace/ })
    const workspaceCells = within(workspaceRow).getAllByRole('cell')
    fireEvent.click(workspaceCells[1]!)

    expect(screen.getByRole('combobox', { name: '编辑 #Workspace 的 Status' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'Ready' }))

    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Workspace',
        predicate: 'https://undefineds.co/vocab/status',
        previousValues: [],
        nextValues: ['"Ready"'],
        writesCanonicalResource: false,
      }))
    })
    expect(mockCreateInboxApproval).not.toHaveBeenCalled()
  })

  it('keeps the + Subject row available for an empty structured ttl with a selected class', async () => {
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/empty.ttl',
      structuredClassScope: 'udfs:Workspace',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/empty.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/empty.ttl',
        name: 'empty.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 36,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"empty-1"',
          headers: { etag: '"empty-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    expect(screen.queryByText('没有可展示的 subject。')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Subject' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '+ Subject' }))
    const createSubjectDialog = screen.getByRole('dialog', { name: '新增 subject' })
    expect(within(createSubjectDialog).getByText('udfs:Workspace')).toBeInTheDocument()
    fireEvent.change(within(createSubjectDialog).getByLabelText('Subject'), { target: { value: '#FirstSubject' } })
    fireEvent.click(within(createSubjectDialog).getByRole('button', { name: '创建条目审批' }))

    expect(screen.getByText('#FirstSubject*')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/empty.ttl',
        subject: '#FirstSubject',
        predicate: 'rdf:type',
        previousValues: [],
        nextValues: ['udfs:Workspace'],
        writesCanonicalResource: false,
      }))
    })
    expect(mockMutateRaw).not.toHaveBeenCalled()
  }, 60_000)

  it('restores structured table scroll after returning from a subject resource', async () => {
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Report> a udfs:Workspace ; title "Report" .'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredViewMode: 'table',
      structuredClassScope: 'udfs:Workspace',
      structuredScrollRestoration: {
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Report',
        scrollTop: 144,
      },
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    const viewport = document.querySelector('[data-structured-resource-viewport="true"]') as HTMLElement
    await waitFor(() => {
      expect(viewport.scrollTop).toBe(144)
      expect(useFilesStore.getState().structuredScrollRestoration).toBeNull()
    })
  })

  it('keeps structured table scroll restoration pending until the subject cell is rendered', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Report> a udfs:Workspace ; title "Report" .'
    let rawState: ReturnType<typeof mockUseRawTextResource> = {
      data: null,
      isLoading: true,
      error: null,
    }

    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredViewMode: 'table',
      structuredClassScope: 'udfs:Workspace',
      structuredScrollRestoration: {
        documentUri,
        subject: '#Report',
        scrollTop: 144,
        rowIndex: 0,
      },
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: null,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl') || uri.endsWith('/.vocab/namespaces.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return rawState
    })

    const { rerender } = render(<FileDetailPane />)

    expect(screen.getByLabelText('结构化表加载中')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '#Report' })).not.toBeInTheDocument()
    expect(useFilesStore.getState().structuredScrollRestoration).toEqual({
      documentUri,
      subject: '#Report',
      scrollTop: 144,
      rowIndex: 0,
    })

    rawState = {
      data: {
        uri: documentUri,
        content: structuredSource,
        mimeType: 'text/turtle',
        etag: '"state-1"',
        headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    }
    rerender(<FileDetailPane />)

    const subjectButton = await screen.findByRole('button', { name: '#Report' })
    const viewport = document.querySelector('[data-structured-resource-viewport="true"]') as HTMLElement
    await waitFor(() => {
      expect(viewport.scrollTop).toBe(144)
      expect(subjectButton).toHaveFocus()
      expect(useFilesStore.getState().structuredScrollRestoration).toBeNull()
    })
  })

  it('defaults new predicates to the current Pod vocab registry when URI is blank', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" .'
    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredViewMode: 'table',
      structuredClassScope: 'udfs:Workspace',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ predicate' }))
    fireEvent.click(screen.getByRole('button', { name: '新建 predicate' }))
    fireEvent.change(screen.getByLabelText('predicate term'), {
      target: { value: 'summary' },
    })
    fireEvent.change(screen.getByLabelText('predicate 标签'), {
      target: { value: 'Summary' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交待确认 predicate *' }))
    await waitFor(() => {
      expect(mockCreateInboxApproval).toHaveBeenCalled()
    })

    expect(screen.getByRole('columnheader', { name: /Summary\*/ })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: '待确认 predicate Summary' }))
    expect(screen.queryByText('https://pod.example/.vocab/terms.ttl#summary')).not.toBeInTheDocument()
  })

  it('keeps new field definitions in the current Pod vocab when namespace prefixes are external', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" .'
    const namespacesSource = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix sh: <http://www.w3.org/ns/shacl#> .',
      '<#schema> a udfs:Namespace ;',
      '  sh:prefix "schema" ;',
      '  sh:namespace "https://schema.org/" .',
    ].join('\n')
    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredViewMode: 'table',
      structuredClassScope: 'udfs:Workspace',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/namespaces.ttl')) {
        return {
          data: {
            uri,
            content: namespacesSource,
            mimeType: 'text/turtle',
            etag: '"namespaces-1"',
            headers: { etag: '"namespaces-1"', 'content-type': 'text/turtle' },
          },
          isLoading: false,
          error: null,
        }
      }
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ predicate' }))
    fireEvent.click(screen.getByRole('button', { name: '新建 predicate' }))
    fireEvent.change(screen.getByLabelText('predicate term'), {
      target: { value: 'summary' },
    })
    fireEvent.change(screen.getByLabelText('predicate 标签'), {
      target: { value: 'Summary' },
    })
    fireEvent.click(screen.getByRole('button', { name: '展开 shape 和高级信息' }))
    fireEvent.change(screen.getByLabelText('predicate namespace'), {
      target: { value: 'schema' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交待确认 predicate *' }))

    await waitFor(() => {
      expect(mockCreateInboxApproval).toHaveBeenCalledWith(expect.objectContaining({
        targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
        targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
        termUri: 'https://pod.example/.vocab/terms.ttl#summary',
        termKind: 'predicate',
        label: 'Summary',
        predicate: 'https://schema.org/summary',
        writesCanonicalVocab: false,
      }))
    })
    fireEvent.pointerDown(screen.getByRole('button', { name: '待确认 predicate Summary' }))
    expect(screen.queryByText('https://pod.example/.vocab/terms.ttl#summary')).not.toBeInTheDocument()
    expect(screen.getByText('https://schema.org/summary')).toBeInTheDocument()
  })

  it('stores explicit external predicate URIs as predicate references on current Pod vocab proposals', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" .'
    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredViewMode: 'table',
      structuredClassScope: 'udfs:Workspace',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl') || uri.endsWith('/.vocab/namespaces.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ predicate' }))
    fireEvent.click(screen.getByRole('button', { name: '新建 predicate' }))
    fireEvent.change(screen.getByLabelText('predicate term'), {
      target: { value: 'summary' },
    })
	    fireEvent.change(screen.getByLabelText('predicate 标签'), {
	      target: { value: 'Summary' },
	    })
	    fireEvent.click(screen.getByRole('button', { name: '展开 shape 和高级信息' }))
	    fireEvent.change(screen.getByLabelText('predicate URI'), {
	      target: { value: 'https://schema.org/summary' },
	    })
    fireEvent.click(screen.getByRole('button', { name: '提交待确认 predicate *' }))

    await waitFor(() => {
      expect(mockCreateInboxApproval).toHaveBeenCalledWith(expect.objectContaining({
        targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
        targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
        termUri: 'https://pod.example/.vocab/terms.ttl#summary',
        termKind: 'predicate',
        label: 'Summary',
        predicate: 'https://schema.org/summary',
        writesCanonicalVocab: false,
      }))
    })
    fireEvent.pointerDown(screen.getByRole('button', { name: '待确认 predicate Summary' }))
    expect(screen.queryByText('https://pod.example/.vocab/terms.ttl#summary')).not.toBeInTheDocument()
    expect(screen.getByText('https://schema.org/summary')).toBeInTheDocument()
  })

  it('navigates from the subject cell with Enter while preserving table return context', async () => {
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<https://pod.example/public/report.md> a udfs:Workspace ; title "Report" .'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredViewMode: 'table',
      structuredClassScope: 'udfs:Workspace',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    const subjectButton = await screen.findByRole('button', { name: 'https://pod.example/public/report.md' })
    await act(async () => {
      fireEvent.keyDown(subjectButton, { key: 'Enter' })
    })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/report.md')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toMatchObject({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: 'https://pod.example/public/report.md',
      rowIndex: 0,
    })
    expect(new URLSearchParams(window.location.search).get('filesRow')).toBe('0')
    expect(screen.queryByLabelText('Structured subject peek')).not.toBeInTheDocument()
  })

  it('opens resource subjects in a peek on click and navigates from the explicit open action', async () => {
    const structuredSource = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '<https://pod.example/public/report.md> a udfs:Workspace ; title "Report" ; term <https://pod.example/.vocab/terms.ttl#tags> .',
      '<https://pod.example/.vocab/terms.ttl#tags> a udfs:PredicateTerm ; rdfs:label "tags" ; rdfs:comment "Topic labels" .',
    ].join('\n')
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredViewMode: 'table',
      structuredClassScope: 'udfs:Workspace',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    const sourceTableUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    fireEvent.click(await screen.findByRole('button', { name: 'https://pod.example/public/report.md' }))

    expect(useFilesStore.getState().selectedFileId).toBe(sourceTableUri)
    expect(new URLSearchParams(window.location.search).get('filesRow')).toBeNull()
    const subjectSidecar = screen.getByLabelText('Structured subject peek')
    expect(within(subjectSidecar).getByText('卡片预览')).toBeInTheDocument()
    expect(within(subjectSidecar).queryByText('https://pod.example/public/report.md')).not.toBeInTheDocument()
    fireEvent.click(within(subjectSidecar).getByRole('button', { name: '查看 URI 详情' }))
    expect(within(subjectSidecar).getAllByText('https://pod.example/public/report.md').length).toBeGreaterThan(0)
    expect(within(subjectSidecar).getByText('Report')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(within(subjectSidecar).getByRole('button', { name: '打开资源' }))
    })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/report.md')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toMatchObject({
      documentUri: sourceTableUri,
      subject: 'https://pod.example/public/report.md',
      rowIndex: 0,
    })
    expect(new URLSearchParams(window.location.search).get('filesRow')).toBe('0')
    expect(screen.queryByLabelText('Structured subject peek')).not.toBeInTheDocument()

  })

  it('shows source-linked card facts when a structured subject points at a card descriptor', async () => {
    const sourceTableUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const cardUri = 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl'
    const bodyUri = 'https://pod.example/.data/workspaces/ws-1/cards/report.md'
    const manifestUri = 'https://pod.example/.data/ingest/sources/example-com-report-025svsu/manifest.ttl'
    const structuredSource = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix dcterms: <http://purl.org/dc/terms/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      `<${cardUri}> a udfs:Workspace, udfs:SourceLinkedCard ;`,
      '  rdfs:label "Quarterly report" ;',
      '  dcterms:source <https://example.com/report.pdf> ;',
      `  udfs:bodyResource <${bodyUri}> ;`,
      `  udfs:ingestManifest <${manifestUri}> ;`,
      '  udfs:ingestVersion "pdf-ingest-v1" ;',
      '  udfs:sourceHash "sha256-source-1" .',
    ].join('\n')
    useFilesStore.setState({
      selectedFileId: sourceTableUri,
      structuredViewMode: 'table',
      structuredClassScope: 'udfs:Workspace',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: sourceTableUri,
        uri: sourceTableUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 512,
        modifiedAt: '2026-06-18T00:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-source-card-1"',
          headers: { etag: '"state-source-card-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: cardUri }))
    })

    const subjectSidecar = screen.getByLabelText('Structured subject peek')
    expect(within(subjectSidecar).getByText('来源与同步')).toBeInTheDocument()
    expect(within(subjectSidecar).queryByText('来源卡片')).not.toBeInTheDocument()
    expect(within(subjectSidecar).getByText('Quarterly report')).toBeInTheDocument()
    expect(within(subjectSidecar).getByText('https://example.com/report.pdf')).toBeInTheDocument()
    expect(within(subjectSidecar).getByText(bodyUri)).toBeInTheDocument()
    expect(within(subjectSidecar).getByText('pdf-ingest-v1')).toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe(sourceTableUri)

    await act(async () => {
      fireEvent.click(within(subjectSidecar).getByRole('button', { name: '打开资源' }))
    })

    expect(useFilesStore.getState().selectedFileId).toBe(cardUri)
    expect(useFilesStore.getState().structuredSubjectReturnContext).toMatchObject({
      documentUri: sourceTableUri,
      subject: cardUri,
      rowIndex: 0,
    })
    expect(mockRefreshSourceLinkedCard).not.toHaveBeenCalled()
    expect(mockCreateSourceProposal).not.toHaveBeenCalled()
  })

  it('shows source-linked card facts from expanded Ingest predicate IRIs in structured subject peek', async () => {
    const sourceTableUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const cardUri = 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl'
    const bodyUri = 'https://pod.example/.data/workspaces/ws-1/cards/report.md'
    const manifestUri = 'https://pod.example/.data/ingest/sources/source-pdf/manifest.ttl'
    const structuredSource = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix dcterms: <http://purl.org/dc/terms/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      `<${cardUri}> a udfs:Workspace, <https://undefineds.co/vocab/SourceLinkedCard> ;`,
      '  rdfs:label "Expanded report" ;',
      '  <http://purl.org/dc/terms/source> <https://example.com/report.pdf> ;',
      `  <https://undefineds.co/vocab/bodyResource> <${bodyUri}> ;`,
      `  <https://undefineds.co/vocab/ingestManifest> <${manifestUri}> ;`,
      '  <https://undefineds.co/vocab/ingestVersion> "pdf-ingest-v2" ;',
      '  <https://undefineds.co/vocab/sourceHash> "sha256-source-2" .',
    ].join('\n')
    useFilesStore.setState({
      selectedFileId: sourceTableUri,
      structuredViewMode: 'table',
      structuredClassScope: 'udfs:Workspace',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: sourceTableUri,
        uri: sourceTableUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 512,
        modifiedAt: '2026-06-18T00:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-source-card-expanded-1"',
          headers: { etag: '"state-source-card-expanded-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: cardUri }))
    })

    const subjectSidecar = screen.getByLabelText('Structured subject peek')
    expect(within(subjectSidecar).getByText('来源与同步')).toBeInTheDocument()
    expect(within(subjectSidecar).queryByText('来源卡片')).not.toBeInTheDocument()
    expect(within(subjectSidecar).getByText('Expanded report')).toBeInTheDocument()
    const sourceLinkedCardBlock = within(subjectSidecar).getByLabelText('来源与同步信息')
    expect(sourceLinkedCardBlock).not.toBeNull()
    expect(within(sourceLinkedCardBlock).getByText('https://example.com/report.pdf')).toBeInTheDocument()
    expect(within(sourceLinkedCardBlock).getByText(bodyUri)).toBeInTheDocument()
    expect(within(sourceLinkedCardBlock).getByText('pdf-ingest-v2')).toBeInTheDocument()
    expect(within(sourceLinkedCardBlock).getByText('同步记录')).toBeInTheDocument()
    expect(within(sourceLinkedCardBlock).queryByText('manifest')).not.toBeInTheDocument()
    expect(within(sourceLinkedCardBlock).getByTitle(manifestUri)).toBeInTheDocument()
    expect(within(sourceLinkedCardBlock).queryByText(/parser/i)).not.toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe(sourceTableUri)
    expect(mockRefreshSourceLinkedCard).not.toHaveBeenCalled()
    expect(mockCreateSourceProposal).not.toHaveBeenCalled()
  })

  it('opens a structured subject resource directly with double click from the subject cell', async () => {
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<https://pod.example/public/report.md> a udfs:Workspace ; title "Report" .'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredViewMode: 'table',
      structuredClassScope: 'udfs:Workspace',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    await act(async () => {
      fireEvent.doubleClick(await screen.findByRole('button', { name: 'https://pod.example/public/report.md' }))
    })

    expect(screen.queryByRole('dialog', { name: 'Subject preview' })).not.toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/report.md')
  })

  it('opens external IRI subjects in a peek instead of navigating as Files resources', async () => {
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<https://source.example/report.pdf> a udfs:Workspace ; title "External report" .'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredViewMode: 'table',
      structuredClassScope: 'udfs:Workspace',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    const subjectButton = await screen.findByRole('button', { name: 'https://source.example/report.pdf' })
    await act(async () => {
      fireEvent.doubleClick(subjectButton)
    })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/ws-1/state.ttl')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toBeNull()
    const externalSidecar = screen.getByLabelText('Structured subject peek')
    expect(within(externalSidecar).getByText('链接预览')).toBeInTheDocument()
    expect(within(externalSidecar).queryByText('https://source.example/report.pdf')).not.toBeInTheDocument()
    fireEvent.click(within(externalSidecar).getByRole('button', { name: '查看 URI 详情' }))
    expect(within(externalSidecar).getAllByText('https://source.example/report.pdf').length).toBeGreaterThan(0)

    await act(async () => {
      fireEvent.click(within(externalSidecar).getByRole('button', { name: '打开 URL' }))
    })

    expect(window.open).toHaveBeenCalledWith('https://source.example/report.pdf', '_blank', 'noopener,noreferrer')
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/ws-1/state.ttl')
  })

  it('previews a kanban subject with Enter and navigates only from the detail action', async () => {
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<https://pod.example/public/report.md> a udfs:Workspace ; title "Report" ; mode "read/write" .'
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredViewMode: 'kanban',
      structuredClassScope: 'udfs:Workspace',
      structuredKanbanGroupPredicate: 'mode',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    const card = await waitFor(() => {
      const element = document.querySelector('[data-kanban-card-subject="https://pod.example/public/report.md"]')
      expect(element).toBeTruthy()
      return element as HTMLElement
    })
    const cardContent = card.querySelector('[data-structured-subject]') as HTMLElement
    expect(cardContent).toBeTruthy()
    fireEvent.keyDown(cardContent, { key: 'Enter' })

    const subjectPeek = screen.getByLabelText('Structured subject peek')
    expect(subjectPeek).toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/ws-1/state.ttl')

    fireEvent.click(within(subjectPeek).getByRole('button', { name: '打开资源' }))

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/report.md')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toMatchObject({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: 'https://pod.example/public/report.md',
      viewMode: 'kanban',
      classScope: 'udfs:Workspace',
      kanbanGroupPredicate: 'mode',
    })
  })

  it('does not open a kanban subject preview from the click synthesized after dragging a card', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const subjectUri = 'https://pod.example/public/report.md'
    const structuredSource = `@prefix udfs: <https://undefineds.co/vocab/> .\n<${subjectUri}> a udfs:Workspace ; title "Report" ; mode "read/write" .`
    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredViewMode: 'kanban',
      structuredClassScope: 'udfs:Workspace',
      structuredKanbanGroupPredicate: 'mode',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })
    const transfer = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn((type: string, value: string) => transfer.set(type, value)),
      getData: vi.fn((type: string) => transfer.get(type) ?? ''),
    }

    render(<FileDetailPane />)

    const card = await waitFor(() => {
      const element = document.querySelector(`[data-kanban-card-subject="${subjectUri}"]`)
      expect(element).toBeTruthy()
      return element as HTMLElement
    })
    fireEvent.dragStart(card, { dataTransfer })
    fireEvent.dragEnd(card)
    fireEvent.click(card)

    expect(screen.queryByLabelText('Structured subject peek')).not.toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe(documentUri)
    expect(useFilesStore.getState().structuredSubjectReturnContext).toBeNull()
  })

  it('opens a whiteboard subject resource directly with double click from the node', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<https://pod.example/public/report.md> a udfs:Workspace ; title "Report" .'
    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredViewMode: 'whiteboard',
      structuredClassScope: 'udfs:Workspace',
      structuredWhiteboardSubjectsByDocument: {
        [documentUri]: ['https://pod.example/public/report.md'],
      },
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    fireEvent.doubleClick(await screen.findByLabelText('打开 subject Report'))

    expect(screen.queryByRole('dialog', { name: 'Subject preview' })).not.toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/report.md')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toMatchObject({
      documentUri,
      subject: 'https://pod.example/public/report.md',
      viewMode: 'whiteboard',
    })
  })

  it('previews a whiteboard subject node with Enter and navigates only from the detail action', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<https://pod.example/public/report.md> a udfs:Workspace ; title "Report" .'
    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredViewMode: 'whiteboard',
      structuredClassScope: 'udfs:Workspace',
      structuredWhiteboardSubjectsByDocument: {
        [documentUri]: ['https://pod.example/public/report.md'],
      },
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    fireEvent.keyDown(await screen.findByLabelText('打开 subject Report'), { key: 'Enter' })

    const subjectPeek = screen.getByLabelText('Structured subject peek')
    expect(subjectPeek).toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe(documentUri)

    fireEvent.click(within(subjectPeek).getByRole('button', { name: '打开资源' }))

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/report.md')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toMatchObject({
      documentUri,
      subject: 'https://pod.example/public/report.md',
      viewMode: 'whiteboard',
      classScope: 'udfs:Workspace',
    })
  })

  it('does not open a whiteboard subject preview from a single card click', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" .'
    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredViewMode: 'whiteboard',
      structuredClassScope: 'udfs:Workspace',
      structuredWhiteboardSubjectsByDocument: {
        [documentUri]: ['#Workspace'],
      },
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    const workspaceNode = await screen.findByLabelText('打开 subject Files')
    fireEvent.click(workspaceNode)
    expect(screen.queryByLabelText('Structured subject peek')).not.toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe(documentUri)
    expect(useFilesStore.getState().structuredSubjectReturnContext).toBeNull()
  })

  it('opens whiteboard fragment terms as definitions with Enter instead of direct resource navigation', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const termSubject = 'https://pod.example/.vocab/terms.ttl#tags'
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<https://pod.example/.vocab/terms.ttl#tags> a udfs:Predicate ; rdfs:label "tags" ; rdfs:comment "Topic labels" .'
    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredViewMode: 'whiteboard',
      structuredClassScope: 'udfs:Predicate',
      structuredWhiteboardSubjectsByDocument: {
        [documentUri]: [termSubject],
      },
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 128,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')) {
        return { data: null, isLoading: false, error: null }
      }
      return {
        data: {
          uri,
          content: structuredSource,
          mimeType: 'text/turtle',
          etag: '"state-1"',
          headers: { etag: '"state-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    expect(screen.getByRole('button', { name: 'Whiteboard' })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    const viewMenu = screen.getByRole('menu')
    expect(within(viewMenu).queryByRole('menuitem', { name: 'Whiteboard' })).not.toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    fireEvent.keyDown(await screen.findByLabelText('打开 subject tags'), { key: 'Enter' })

    const termSidecar = screen.getByLabelText('Structured term peek')
    expect(screen.queryByRole('dialog', { name: 'term definition' })).not.toBeInTheDocument()
    expect(within(termSidecar).queryByText(termSubject)).not.toBeInTheDocument()
    fireEvent.click(within(termSidecar).getByRole('button', { name: '查看 URI 详情' }))
    expect(within(termSidecar).getByText(termSubject)).toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe(documentUri)
    expect(useFilesStore.getState().structuredSubjectReturnContext).toBeNull()
  })

  it('hydrates structured view state from resource meta sidecar metadata', async () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
        mimeType: 'text/turtle',
        etag: '"raw-meta-view-1"',
        headers: { etag: '"raw-meta-view-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    mockUseStructuredViewMetadata.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        metaUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl.meta',
        state: 'exists',
        metadata: {
          documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
          viewMode: 'whiteboard',
          classScope: 'udfs:Workspace',
          searchText: '',
          sortKey: 'title',
          sortDirection: 'desc',
          hiddenPredicates: ['mode'],
          kanbanGroupPredicate: 'mode',
          columnSizing: { title: 180 },
          whiteboard: {
            selectedSubjects: ['#Workspace', '#Other'],
            positions: {
              '#Workspace': { x: 120, y: 96 },
              '#Other': { x: 320, y: 120 },
            },
            visualRelations: [
              {
                id: 'visual-workspace-other',
                from: '#Workspace',
                to: '#Other',
                label: 'sketch link',
              },
            ],
          },
          writesCanonicalData: false,
        },
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    await waitFor(() => {
      expect(useFilesStore.getState().structuredViewMode).toBe('whiteboard')
    })
    expect(useFilesStore.getState().structuredClassScope).toBe('udfs:Workspace')
    expect(useFilesStore.getState().structuredHiddenPredicates).toEqual(new Set(['mode']))
    expect(useFilesStore.getState().structuredColumnSizingByDocument['https://pod.example/.data/workspaces/ws-1/state.ttl']).toEqual({ title: 180 })
    expect(useFilesStore.getState().structuredWhiteboardSubjectsByDocument['https://pod.example/.data/workspaces/ws-1/state.ttl']).toEqual(['#Workspace', '#Other'])
    expect(useFilesStore.getState().structuredWhiteboardRelationsByDocument['https://pod.example/.data/workspaces/ws-1/state.ttl']).toEqual([
      {
        id: 'visual-workspace-other',
        from: '#Workspace',
        to: '#Other',
        label: 'sketch link',
      },
    ])
    expect(screen.getByRole('button', { name: '添加 subject 到白板' })).toHaveAttribute('title', expect.stringContaining('白板中 2 张卡片'))
    expect(document.querySelectorAll('[data-whiteboard-relation-source="visual"]')).toHaveLength(1)
    expect((document.querySelector('[data-whiteboard-subject="#Workspace"]') as HTMLElement).dataset.layoutX).toBe('120')
    expect(document.querySelector('[data-whiteboard-relation-source="visual"]')).toBeTruthy()
  })

  it('creates a temporary whiteboard visual relation through view metadata only', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 256,
        modifiedAt: '2026-06-17T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: documentUri,
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
        mimeType: 'text/turtle',
        etag: '"raw-meta-view-1"',
        headers: { etag: '"raw-meta-view-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    mockUseStructuredViewMetadata.mockReturnValue({
      data: {
        ownerUri: documentUri,
        metaUri: `${documentUri}.meta`,
        state: 'exists',
        metadata: {
          documentUri,
          viewMode: 'whiteboard',
          classScope: 'udfs:Workspace',
          searchText: '',
          sortKey: null,
          sortDirection: 'asc',
          hiddenPredicates: [],
          kanbanGroupPredicate: null,
          kanbanOrder: {},
          columnSizing: {},
          whiteboard: {
            selectedSubjects: ['#Workspace', '#Other'],
            positions: {},
            visualRelations: [],
          },
          writesCanonicalData: false,
        },
      },
      isLoading: false,
      error: null,
    })
    mockSaveStructuredViewMetadata.mockResolvedValue(undefined)

    render(<FileDetailPane />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加 subject 到白板' })).toHaveAttribute('title', expect.stringContaining('白板中 2 张卡片'))
    })
    mockSaveStructuredViewMetadata.mockClear()
    mockCreateCellProposal.mockClear()
    mockMutateRaw.mockClear()
    mockCreateRaw.mockClear()
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('button', { name: '添加视觉关系' }))
    fireEvent.change(screen.getByLabelText('Relation label'), {
      target: { value: 'sketch link' },
    })
    fireEvent.click(screen.getByRole('button', { name: '创建视觉关系' }))

    expect(useFilesStore.getState().structuredWhiteboardRelationsByDocument[documentUri]).toEqual([
      expect.objectContaining({
        from: '#Workspace',
        to: '#Other',
        label: 'sketch link',
      }),
    ])
    expect(document.querySelector('[data-whiteboard-relation-source="visual"]')).toBeTruthy()
    expect(mockCreateCellProposal).not.toHaveBeenCalled()
    expect(mockMutateRaw).not.toHaveBeenCalled()
    expect(mockCreateRaw).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900)
    })

    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledTimes(1)
    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledWith({
      file: {
        uri: documentUri,
        kind: 'resource',
      },
      metadata: expect.objectContaining({
        documentUri,
        viewMode: 'whiteboard',
        writesCanonicalData: false,
        whiteboard: expect.objectContaining({
          selectedSubjects: ['#Workspace', '#Other'],
          visualRelations: [
            expect.objectContaining({
              from: '#Workspace',
              to: '#Other',
              label: 'sketch link',
            }),
          ],
        }),
      }),
    })
  })

  it('edits a temporary whiteboard visual relation label without creating RDF facts', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 256,
        modifiedAt: '2026-06-17T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: documentUri,
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
        mimeType: 'text/turtle',
        etag: '"raw-meta-view-1"',
        headers: { etag: '"raw-meta-view-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    mockUseStructuredViewMetadata.mockReturnValue({
      data: {
        ownerUri: documentUri,
        metaUri: `${documentUri}.meta`,
        state: 'exists',
        metadata: {
          documentUri,
          viewMode: 'whiteboard',
          classScope: 'udfs:Workspace',
          searchText: '',
          sortKey: null,
          sortDirection: 'asc',
          hiddenPredicates: [],
          kanbanGroupPredicate: null,
          kanbanOrder: {},
          columnSizing: {},
          whiteboard: {
            selectedSubjects: ['#Workspace', '#Other'],
            positions: {},
            visualRelations: [
              {
                id: 'visual-workspace-other',
                from: '#Workspace',
                to: '#Other',
                label: 'sketch link',
              },
            ],
          },
          writesCanonicalData: false,
        },
      },
      isLoading: false,
      error: null,
    })
    mockSaveStructuredViewMetadata.mockResolvedValue(undefined)

    render(<FileDetailPane />)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-whiteboard-relation-source="visual"]')).toHaveLength(1)
    })
    mockSaveStructuredViewMetadata.mockClear()
    mockCreateCellProposal.mockClear()
    mockMutateRaw.mockClear()
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('button', { name: '编辑视觉关系 sketch link' }))
    fireEvent.change(screen.getByLabelText('Relation label'), {
      target: { value: 'updated sketch' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存视觉关系' }))

    expect(useFilesStore.getState().structuredWhiteboardRelationsByDocument[documentUri]).toEqual([
      {
        id: 'visual-workspace-other',
        from: '#Workspace',
        to: '#Other',
        label: 'updated sketch',
      },
    ])
    expect(mockCreateCellProposal).not.toHaveBeenCalled()
    expect(mockMutateRaw).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900)
    })

    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledTimes(1)
    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        whiteboard: expect.objectContaining({
          visualRelations: [
            {
              id: 'visual-workspace-other',
              from: '#Workspace',
              to: '#Other',
              label: 'updated sketch',
            },
          ],
        }),
      }),
    }))
  })

  it('removes a temporary whiteboard visual relation without changing RDF facts', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 256,
        modifiedAt: '2026-06-17T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: documentUri,
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
        mimeType: 'text/turtle',
        etag: '"raw-meta-view-1"',
        headers: { etag: '"raw-meta-view-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    mockUseStructuredViewMetadata.mockReturnValue({
      data: {
        ownerUri: documentUri,
        metaUri: `${documentUri}.meta`,
        state: 'exists',
        metadata: {
          documentUri,
          viewMode: 'whiteboard',
          classScope: 'udfs:Workspace',
          searchText: '',
          sortKey: null,
          sortDirection: 'asc',
          hiddenPredicates: [],
          kanbanGroupPredicate: null,
          kanbanOrder: {},
          columnSizing: {},
          whiteboard: {
            selectedSubjects: ['#Workspace', '#Other'],
            positions: {},
            visualRelations: [
              {
                id: 'visual-workspace-other',
                from: '#Workspace',
                to: '#Other',
                label: 'sketch link',
              },
            ],
          },
          writesCanonicalData: false,
        },
      },
      isLoading: false,
      error: null,
    })
    mockSaveStructuredViewMetadata.mockResolvedValue(undefined)

    render(<FileDetailPane />)
    await waitFor(() => {
      expect(document.querySelector('[data-whiteboard-relation-source="visual"]')).toBeTruthy()
    })
    mockSaveStructuredViewMetadata.mockClear()
    mockCreateCellProposal.mockClear()
    mockMutateRaw.mockClear()
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('button', { name: '删除视觉关系 sketch link' }))

    expect(useFilesStore.getState().structuredWhiteboardRelationsByDocument[documentUri]).toEqual([])
    expect(document.querySelector('[data-whiteboard-relation-source="visual"]')).toBeNull()
    expect(mockCreateCellProposal).not.toHaveBeenCalled()
    expect(mockMutateRaw).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900)
    })

    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledTimes(1)
    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        whiteboard: expect.objectContaining({
          visualRelations: [],
        }),
      }),
    }))
  })

  it('does not autosave stale default structured view metadata immediately after hydration', async () => {
    vi.useFakeTimers()
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
        mimeType: 'text/turtle',
        etag: '"raw-meta-view-1"',
        headers: { etag: '"raw-meta-view-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    mockUseStructuredViewMetadata.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        metaUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl.meta',
        state: 'exists',
        etag: '"meta-view-hydrate-1"',
        metadata: {
          documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
          viewMode: 'whiteboard',
          classScope: 'udfs:Workspace',
          searchText: '',
          sortKey: 'title',
          sortDirection: 'desc',
          hiddenPredicates: ['mode'],
          kanbanGroupPredicate: 'mode',
          columnSizing: { title: 180 },
          whiteboard: {
            selectedSubjects: ['#Workspace'],
            positions: {
              '#Workspace': { x: 120, y: 96 },
            },
          },
          writesCanonicalData: false,
        },
      },
      isLoading: false,
      error: null,
    })
    mockSaveStructuredViewMetadata.mockResolvedValue(undefined)

    render(<FileDetailPane />)

    await vi.advanceTimersByTimeAsync(0)
    expect(useFilesStore.getState().structuredViewMode).toBe('whiteboard')
    await vi.advanceTimersByTimeAsync(900)

    expect(mockSaveStructuredViewMetadata).not.toHaveBeenCalled()
  })

  it('autosaves structured view metadata after user changes the view state', async () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .',
        mimeType: 'text/turtle',
        etag: '"raw-meta-view-save-1"',
        headers: { etag: '"raw-meta-view-save-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    mockUseStructuredViewMetadata.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        metaUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl.meta',
        state: 'exists',
        etag: '"meta-view-save-1"',
        metadata: {
          documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
          viewMode: 'table',
          classScope: 'udfs:Workspace',
          searchText: '',
          sortKey: null,
          sortDirection: 'asc',
          hiddenPredicates: [],
          kanbanGroupPredicate: null,
          columnSizing: {},
          whiteboard: {
            selectedSubjects: [],
            positions: {},
          },
          writesCanonicalData: false,
        },
      },
      isLoading: false,
      error: null,
    })
    mockSaveStructuredViewMetadata.mockResolvedValue(undefined)

    render(<FileDetailPane />)

    await waitFor(() => {
      expect(useFilesStore.getState().structuredClassScope).toBe('udfs:Workspace')
    })
    expect(mockSaveStructuredViewMetadata).not.toHaveBeenCalled()

    vi.useFakeTimers()
    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kanban' }))

    expect(mockSaveStructuredViewMetadata).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(900)

    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledTimes(1)
    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledWith({
      file: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        kind: 'resource',
      },
      metadata: expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        viewMode: 'kanban',
        classScope: 'udfs:Workspace',
        writesCanonicalData: false,
      }),
    })
  })

  it('autosaves a view change made before an empty meta sidecar query resolves', async () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" .',
        mimeType: 'text/turtle',
        etag: '"raw-meta-view-late-1"',
        headers: { etag: '"raw-meta-view-late-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    mockUseStructuredViewMetadata.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    })
    mockSaveStructuredViewMetadata.mockResolvedValue(undefined)

    vi.useFakeTimers()
    const { rerender } = render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kanban' }))

    mockUseStructuredViewMetadata.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        metaUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl.meta',
        state: 'exists',
        content: '<state.ttl> a <http://www.w3.org/ns/ldp#Resource> .',
        mimeType: 'text/turtle',
        etag: null,
        size: 56,
        metadata: null,
      },
      isLoading: false,
      error: null,
    })
    rerender(<FileDetailPane />)

    await vi.advanceTimersByTimeAsync(900)

    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledTimes(1)
    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledWith({
      file: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        kind: 'resource',
      },
      metadata: expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        viewMode: 'kanban',
        classScope: 'udfs:Workspace',
        writesCanonicalData: false,
      }),
    })
  })

  it('preserves a user view change made before existing meta sidecar hydration resolves', async () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" .',
        mimeType: 'text/turtle',
        etag: '"raw-meta-view-existing-late-1"',
        headers: { etag: '"raw-meta-view-existing-late-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    mockUseStructuredViewMetadata.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    })
    mockSaveStructuredViewMetadata.mockResolvedValue(undefined)

    vi.useFakeTimers()
    const { rerender } = render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kanban' }))

    mockUseStructuredViewMetadata.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        metaUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl.meta',
        state: 'exists',
        content: '<state.ttl> a <http://www.w3.org/ns/ldp#Resource> .',
        mimeType: 'text/turtle',
        etag: '"meta-view-existing-late-1"',
        size: 56,
        metadata: {
          documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
          viewMode: 'table',
          classScope: 'udfs:Workspace',
          searchText: '',
          sortKey: null,
          sortDirection: 'asc',
          hiddenPredicates: [],
          kanbanGroupPredicate: null,
          columnSizing: {},
          whiteboard: {
            selectedSubjects: [],
            positions: {},
          },
          writesCanonicalData: false,
        },
      },
      isLoading: false,
      error: null,
    })
    rerender(<FileDetailPane />)

    await vi.advanceTimersByTimeAsync(900)

    expect(useFilesStore.getState().structuredViewMode).toBe('kanban')
    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledTimes(1)
    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledWith({
      file: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        kind: 'resource',
      },
      metadata: expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        viewMode: 'kanban',
        classScope: 'udfs:Workspace',
        writesCanonicalData: false,
      }),
    })
  })

  it('preserves a user class scope change made before existing meta sidecar hydration resolves', async () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '<#Workspace> a udfs:Workspace ; title "Files" .',
          '<#Project> a udfs:Project ; title "LinX" .',
        ].join('\n'),
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '<#Workspace> a udfs:Workspace ; title "Files" .',
          '<#Project> a udfs:Project ; title "LinX" .',
        ].join('\n'),
        mimeType: 'text/turtle',
        etag: '"raw-meta-class-existing-late-1"',
        headers: { etag: '"raw-meta-class-existing-late-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    mockUseStructuredViewMetadata.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    })
    mockSaveStructuredViewMetadata.mockResolvedValue(undefined)

    vi.useFakeTimers()
    const { rerender } = render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Project' }))

    mockUseStructuredViewMetadata.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        metaUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl.meta',
        state: 'exists',
        content: '<state.ttl> a <http://www.w3.org/ns/ldp#Resource> .',
        mimeType: 'text/turtle',
        etag: '"meta-class-existing-late-1"',
        size: 56,
        metadata: {
          documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
          viewMode: 'table',
          classScope: 'udfs:Workspace',
          searchText: '',
          sortKey: null,
          sortDirection: 'asc',
          hiddenPredicates: [],
          kanbanGroupPredicate: null,
          columnSizing: {},
          whiteboard: {
            selectedSubjects: [],
            positions: {},
          },
          writesCanonicalData: false,
        },
      },
      isLoading: false,
      error: null,
    })
    rerender(<FileDetailPane />)

    await vi.advanceTimersByTimeAsync(900)

    expect(useFilesStore.getState().structuredClassScope).toBe('udfs:Project')
    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledTimes(1)
    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledWith({
      file: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        kind: 'resource',
      },
      metadata: expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        viewMode: 'table',
        classScope: 'udfs:Project',
        writesCanonicalData: false,
      }),
    })
  })

  it('persists structured table column resizing through view metadata without writing canonical data', async () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .',
        mimeType: 'text/turtle',
        etag: '"raw-column-resize-1"',
        headers: { etag: '"raw-column-resize-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    mockUseStructuredViewMetadata.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        metaUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl.meta',
        state: 'exists',
        etag: '"meta-column-resize-1"',
        metadata: {
          documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
          viewMode: 'table',
          classScope: 'udfs:Workspace',
          searchText: '',
          sortKey: null,
          sortDirection: 'asc',
          hiddenPredicates: [],
          kanbanGroupPredicate: null,
          columnSizing: {},
          whiteboard: {
            selectedSubjects: [],
            positions: {},
          },
          writesCanonicalData: false,
        },
      },
      isLoading: false,
      error: null,
    })
    mockSaveStructuredViewMetadata.mockResolvedValue(undefined)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      render(<FileDetailPane />)

      await waitFor(() => {
        expect(useFilesStore.getState().structuredClassScope).toBe('udfs:Workspace')
      })

      vi.useFakeTimers()
      const titleHeader = screen.getByRole('columnheader', { name: /title/ })
      const titleStartWidth = Number.parseFloat(titleHeader.style.width)
      fireEvent.mouseDown(screen.getByRole('separator', { name: '调整 title 列宽' }), { clientX: 200 })
      fireEvent.mouseMove(document, { clientX: 260 })
      fireEvent.mouseUp(document)

      const resizedWidth = Number.parseFloat(screen.getByRole('columnheader', { name: /title/ }).style.width)
      expect(resizedWidth).toBe(titleStartWidth + 60)
      expect(useFilesStore.getState().structuredColumnSizingByDocument['https://pod.example/.data/workspaces/ws-1/state.ttl']?.title)
        .toBe(resizedWidth)
      expect(mockMutateRaw).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(900)

      expect(mockSaveStructuredViewMetadata).toHaveBeenCalledWith({
        file: {
          uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
          kind: 'resource',
        },
        metadata: expect.objectContaining({
          documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
          viewMode: 'table',
          classScope: 'udfs:Workspace',
          columnSizing: { title: resizedWidth },
          writesCanonicalData: false,
        }),
      })
      expect(consoleErrorSpy.mock.calls.flat().some((arg) => (
        typeof arg === 'string' && arg.includes('Cannot update a component')
      ))).toBe(false)
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('projects structured table rows from complete raw content instead of truncated preview', () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 32000,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#PreviewOnly> a udfs:Workspace ; title "Preview only" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#PreviewOnly> a udfs:Workspace ; title "Preview only" .\n<#RawOnly> a udfs:Workspace ; title "Raw only" .',
        mimeType: 'text/turtle',
        etag: '"raw-structured-1"',
        headers: { etag: '"raw-structured-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByText('#RawOnly')).toBeInTheDocument()
    expect(screen.getByText('"Raw only"')).toBeInTheDocument()
  })

  it('does not project structured rows from truncated preview when full raw content fails', () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 32000,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#PreviewOnly> a udfs:Workspace ; title "Preview only" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Forbidden'),
    })

    render(<FileDetailPane />)

    expect(screen.getByText('完整原始内容暂时不可用，不能解析结构化表。')).toBeInTheDocument()
    expect(screen.queryByText('#PreviewOnly')).not.toBeInTheDocument()
    expect(screen.queryByText('"Preview only"')).not.toBeInTheDocument()
  })

  it('opens fragment subjects as term definitions before navigating to the resource file', () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<https://pod.example/.vocab/terms.ttl#tags> a udfs:Predicate ; rdfs:label "tags" ; rdfs:comment "Topic labels" .',
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: 'https://pod.example/.vocab/terms.ttl#tags' }))

    const termSidecar = screen.getByLabelText('Structured term peek')
    expect(screen.queryByRole('dialog', { name: 'term definition' })).not.toBeInTheDocument()
    expect(within(termSidecar).queryByText('https://pod.example/.vocab/terms.ttl#tags')).not.toBeInTheDocument()
    fireEvent.click(within(termSidecar).getByRole('button', { name: '查看 URI 详情' }))
    expect(within(termSidecar).getByText('https://pod.example/.vocab/terms.ttl#tags')).toBeInTheDocument()
    expect(within(termSidecar).getByText('https://pod.example/.vocab/terms.ttl')).toBeInTheDocument()
    expect(within(termSidecar).getByText('rdfs:label')).toBeInTheDocument()
    expect(within(termSidecar).getByText('"tags"')).toBeInTheDocument()
    expect(within(termSidecar).getByText('rdfs:comment')).toBeInTheDocument()
    expect(within(termSidecar).getByText('"Topic labels"')).toBeInTheDocument()

    fireEvent.click(within(termSidecar).getByRole('button', { name: '打开承载文件' }))

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.vocab/terms.ttl')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toEqual({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: 'https://pod.example/.vocab/terms.ttl#tags',
      scrollTop: 0,
      rowIndex: 0,
      viewMode: 'table',
      classScope: null,
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: null,
    })
  })

  it('opens fragment subjects as term definitions with Enter instead of direct resource navigation', () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<https://pod.example/.vocab/terms.ttl#tags> a udfs:Predicate ; rdfs:label "tags" ; rdfs:comment "Topic labels" .',
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const subjectButton = screen.getByRole('button', { name: 'https://pod.example/.vocab/terms.ttl#tags' })
    fireEvent.keyDown(subjectButton, { key: 'Enter' })

    const termSidecar = screen.getByLabelText('Structured term peek')
    expect(screen.queryByRole('dialog', { name: 'term definition' })).not.toBeInTheDocument()
    expect(within(termSidecar).queryByText('https://pod.example/.vocab/terms.ttl#tags')).not.toBeInTheDocument()
    fireEvent.click(within(termSidecar).getByRole('button', { name: '查看 URI 详情' }))
    expect(within(termSidecar).getByText('https://pod.example/.vocab/terms.ttl#tags')).toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/workspaces/ws-1/state.ttl')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toBeNull()
  })

  it('clears structured table pending write proposals when the document resource changes', () => {
    const firstDetail = {
      id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      name: 'state.ttl',
      kind: 'resource' as const,
      semanticKind: 'structured-data' as const,
      parentUri: 'https://pod.example/.data/workspaces/ws-1/',
      mimeType: 'text/turtle',
      size: 2048,
      modifiedAt: '2026-03-01T10:00:00Z',
      headers: {},
      previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" .',
    }
    const secondDetail = {
      ...firstDetail,
      id: 'https://pod.example/.data/workspaces/ws-2/state.ttl',
      uri: 'https://pod.example/.data/workspaces/ws-2/state.ttl',
      parentUri: 'https://pod.example/.data/workspaces/ws-2/',
      previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Second Files" .',
    }
    mockUseFileDetail.mockReturnValue({
      data: firstDetail,
      isLoading: false,
      error: null,
    })

    const { rerender } = render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Workspace' }))
    fireEvent.click(screen.getByRole('cell', { name: '"Files"' }))
    const titleInput = screen.getByRole('textbox', { name: '编辑 #Workspace 的 title' })
    fireEvent.change(titleInput, { target: { value: 'Edited first document' } })
    fireEvent.blur(titleInput)
    expect(screen.getByRole('cell', { name: 'Edited first document' })).toBeInTheDocument()

    mockUseFileDetail.mockReturnValue({
      data: secondDetail,
      isLoading: false,
      error: null,
    })
    act(() => {
      useFilesStore.setState({ selectedFileId: secondDetail.uri })
    })
    rerender(<FileDetailPane />)

    expect(screen.queryByRole('cell', { name: 'Edited first document' })).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '"Second Files"' })).toBeInTheDocument()
  })

  it('hydrates pending structured cell proposals from Inbox when the table opens', () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '<#Workspace> a udfs:Workspace ; title "Files" .',
          '<#Other> a udfs:Workspace ; title "Other" .',
        ].join('\n'),
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: [
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '<#Workspace> a udfs:Workspace ; title "Files" .',
          '<#Other> a udfs:Workspace ; title "Other" .',
        ].join('\n'),
        mimeType: 'text/turtle',
        etag: '"raw-pending-1"',
        headers: { etag: '"raw-pending-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    mockUsePendingStructuredCellChangeProposals.mockReturnValue({
      data: [
        {
          id: 'https://pod.example/.data/proposals/cell/ws-1-title.ttl#proposal',
          proposalResourceUri: 'https://pod.example/.data/proposals/cell/ws-1-title.ttl',
          documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
          subject: '#Workspace',
          predicate: 'title',
          previousValues: ['"Files"'],
          nextValues: ['"Draft title"'],
          reason: 'Existing pending proposal',
          createdAt: '2026-06-18T00:00:00.000Z',
          writesCanonicalResource: false,
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Workspace' }))

    expect(mockUsePendingStructuredCellChangeProposals).toHaveBeenCalledWith(
      'https://pod.example/.data/workspaces/ws-1/state.ttl',
      true,
    )
    expect(screen.getByRole('cell', { name: /Draft title/ })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Pending approval for title on #Workspace' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Discard pending write for title on #Workspace' })).not.toBeInTheDocument()
    expect(mockCreateCellProposal).not.toHaveBeenCalled()
    expect(mockMutateRaw).not.toHaveBeenCalled()

    fireEvent.pointerDown(screen.getByRole('button', { name: '筛选' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '有待确认更改的 subject' }))

    expect(screen.getByRole('button', { name: '#Workspace' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '#Other' })).not.toBeInTheDocument()
  })

  it('hydrates pending vocab term proposals from Inbox when the table opens', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const pendingCellProposal = createStructuredCellChangeProposal({
      documentUri,
      subject: '#Workspace',
      predicate: 'tags',
      previousValues: ['"core"'],
      nextValues: ['"core"', '"solid-modeling"'],
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const pendingVocabProposal = createVocabTermProposal({
      documentUri,
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#solid-modeling',
      termKind: 'enum-option',
      predicate: '#tags',
      label: 'solid-modeling',
      valueType: 'enum-option',
      description: 'Solid modeling topic.',
      shape: 'predicate #tags',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '<#Workspace> a udfs:Workspace ; tags "core" .',
      },
      isLoading: false,
      error: null,
    })
    const rawByUri = new Map([
      [documentUri, [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '<#Workspace> a udfs:Workspace ; tags "core" .',
      ].join('\n')],
      ['https://pod.example/.vocab/terms.ttl', [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        '<#tags> a udfs:PredicateTerm ;',
        '  rdfs:label "tags" ;',
        '  udfs:valueType "enum" .',
        '<#core> a udfs:EnumOptionTerm ;',
        '  rdfs:label "core" ;',
        '  udfs:predicate <#tags> .',
      ].join('\n')],
      ['https://pod.example/.vocab/shapes.ttl', '@prefix udfs: <https://undefineds.co/vocab/> .'],
      ['https://pod.example/.vocab/namespaces.ttl', '@prefix udfs: <https://undefineds.co/vocab/> .'],
    ])
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: rawByUri.has(uri)
        ? {
            uri,
            content: rawByUri.get(uri),
            mimeType: 'text/turtle',
            etag: '"raw-vocab-hydrated"',
            headers: { etag: '"raw-vocab-hydrated"', 'content-type': 'text/turtle' },
          }
        : null,
      isLoading: false,
      error: null,
    }))
    mockUsePendingStructuredCellChangeProposals.mockReturnValue({
      data: [pendingCellProposal],
      isLoading: false,
      error: null,
    })
    mockUsePendingVocabTermProposals.mockReturnValue({
      data: [pendingVocabProposal],
      isLoading: false,
      error: null,
    })
    useFilesStore.setState({ selectedFileId: documentUri })

    render(<FileDetailPane />)

    expect(await screen.findByRole('cell', { name: 'core solid-modeling*' })).toBeInTheDocument()
    expect(screen.queryByText('待确认词表变更')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查看词表变更 solid-modeling' })).not.toBeInTheDocument()
    expect(mockUsePendingVocabTermProposals).toHaveBeenCalledWith(documentUri, true)
  })

  it('shows hydrated pending enum option proposals in the selector before any cell uses them', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const pendingVocabProposal = createVocabTermProposal({
      documentUri,
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#solid-modeling',
      termKind: 'enum-option',
      predicate: '#tags',
      label: 'solid-modeling',
      valueType: 'enum-option',
      description: 'Solid modeling topic.',
      shape: 'predicate #tags',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '<#Workspace> a udfs:Workspace ; tags "core" .',
      },
      isLoading: false,
      error: null,
    })
    const rawByUri = new Map([
      [documentUri, [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '<#Workspace> a udfs:Workspace ; tags "core" .',
      ].join('\n')],
      ['https://pod.example/.vocab/terms.ttl', [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        '<#tags> a udfs:PredicateTerm ;',
        '  rdfs:label "tags" ;',
        '  udfs:valueType "enum" .',
        '<#core> a udfs:EnumOptionTerm ;',
        '  rdfs:label "core" ;',
        '  udfs:predicate <#tags> .',
      ].join('\n')],
      ['https://pod.example/.vocab/shapes.ttl', '@prefix udfs: <https://undefineds.co/vocab/> .'],
      ['https://pod.example/.vocab/namespaces.ttl', '@prefix udfs: <https://undefineds.co/vocab/> .'],
    ])
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: rawByUri.has(uri)
        ? {
            uri,
            content: rawByUri.get(uri),
            mimeType: 'text/turtle',
            etag: '"raw-vocab-hydrated-enum"',
            headers: { etag: '"raw-vocab-hydrated-enum"', 'content-type': 'text/turtle' },
          }
        : null,
      isLoading: false,
      error: null,
    }))
    mockUsePendingVocabTermProposals.mockReturnValue({
      data: [pendingVocabProposal],
      isLoading: false,
      error: null,
    })
    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredClassScope: 'udfs:Workspace',
    })

    render(<FileDetailPane />)

    fireEvent.click(await screen.findByRole('cell', { name: 'core' }))

    expect(await screen.findByRole('listbox', { name: '#Workspace 的 tags 选项' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'core' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'solid-modeling*' })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: '选项定义 solid-modeling' }))
    expect(await screen.findByText('词表变更待确认')).toBeInTheDocument()
    expect(screen.getByText('审批记录已准备')).toBeInTheDocument()
    expect(screen.queryByText(pendingVocabProposal.proposalResourceUri)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: '打开审批记录' }))
    expect(window.open).toHaveBeenCalledWith(
      pendingVocabProposal.proposalResourceUri,
      '_blank',
      'noopener,noreferrer',
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: '选项定义 solid-modeling' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '忽略词表变更' }))

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'solid-modeling*' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '查看词表变更 solid-modeling' })).not.toBeInTheDocument()
    })
    expect(mockCreateRaw).not.toHaveBeenCalled()
    expect(mockApproveVocab).not.toHaveBeenCalled()
  })

  it('does not expose a local vocab proposal when Inbox approval creation fails', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    mockCreateInboxApproval.mockRejectedValueOnce(new Error('approval service unavailable'))
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '<#Workspace> a udfs:Workspace ; tags "core" .',
      },
      isLoading: false,
      error: null,
    })
    const rawByUri = new Map([
      [documentUri, [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '<#Workspace> a udfs:Workspace ; tags "core" .',
      ].join('\n')],
      ['https://pod.example/.vocab/terms.ttl', [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        '<#tags> a udfs:PredicateTerm ;',
        '  rdfs:label "tags" ;',
        '  udfs:valueType "enum" .',
        '<#core> a udfs:EnumOptionTerm ;',
        '  rdfs:label "core" ;',
        '  udfs:predicate <#tags> .',
      ].join('\n')],
      ['https://pod.example/.vocab/shapes.ttl', '@prefix udfs: <https://undefineds.co/vocab/> .'],
      ['https://pod.example/.vocab/namespaces.ttl', '@prefix udfs: <https://undefineds.co/vocab/> .'],
    ])
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: rawByUri.has(uri)
        ? {
            uri,
            content: rawByUri.get(uri),
            mimeType: 'text/turtle',
            etag: '"raw-vocab-inbox-fail"',
            headers: { etag: '"raw-vocab-inbox-fail"', 'content-type': 'text/turtle' },
          }
        : null,
      isLoading: false,
      error: null,
    }))
    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredClassScope: 'udfs:Workspace',
    })

    render(<FileDetailPane />)

    fireEvent.click(await screen.findByRole('cell', { name: 'core' }))
    const tagSearch = screen.getByRole('combobox', { name: '编辑 #Workspace 的 tags' })
    fireEvent.change(tagSearch, { target: { value: 'solid-modeling' } })
    expect(screen.getByText('新增 solid-modeling*')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: '新增选项 solid-modeling' }))

    await waitFor(() => {
      expect(mockCreateInboxApproval).toHaveBeenCalledWith(expect.objectContaining({
        label: 'solid-modeling',
        id: expect.stringMatching(/^https:\/\/pod\.example\/\.data\/proposals\/vocab\/solid-modeling-[a-z0-9]{7}\.ttl#proposal$/),
        proposalResourceUri: expect.stringMatching(/^https:\/\/pod\.example\/\.data\/proposals\/vocab\/solid-modeling-[a-z0-9]{7}\.ttl$/),
        termKind: 'enum-option',
        writesCanonicalVocab: false,
      }))
    })
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        description: 'approval service unavailable',
        variant: 'destructive',
      })
    })
    expect(screen.queryByRole('button', { name: '查看词表变更 solid-modeling' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '忽略词表变更 solid-modeling' })).not.toBeInTheDocument()
    expect(screen.queryByText('待确认词表变更')).not.toBeInTheDocument()
    expect(mockCreateCellProposal).not.toHaveBeenCalled()
    expect(screen.getByRole('cell', { name: 'core' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Pending approval for tags on #Workspace' })).not.toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: 'solid-modeling' })).not.toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: 'solid-modeling*' })).not.toBeInTheDocument()
  })

  it('projects hydrated pending vocab class and predicate proposals into structured table controls', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const pendingClassProposal = createVocabTermProposal({
      documentUri,
      classScope: null,
      termUri: 'https://pod.example/.vocab/terms.ttl#Note',
      termKind: 'class',
      label: 'Note',
      valueType: 'class',
      description: 'Draft note class.',
      shape: 'rdf:type scope',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const pendingPredicateProposal = createVocabTermProposal({
      documentUri,
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'Summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: 'class udfs:Workspace · minCount 0 · maxCount 1',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '<#Workspace> a udfs:Workspace ; title "Files" ; summary "Existing" .',
      },
      isLoading: false,
      error: null,
    })
    const rawByUri = new Map([
      [documentUri, [
        '@prefix udfs: <https://undefineds.co/vocab/> .',
        '<#Workspace> a udfs:Workspace ; title "Files" ; summary "Existing" .',
      ].join('\n')],
      ['https://pod.example/.vocab/terms.ttl', '@prefix udfs: <https://undefineds.co/vocab/> .'],
      ['https://pod.example/.vocab/shapes.ttl', '@prefix udfs: <https://undefineds.co/vocab/> .'],
      ['https://pod.example/.vocab/namespaces.ttl', '@prefix udfs: <https://undefineds.co/vocab/> .'],
    ])
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: rawByUri.has(uri)
        ? {
            uri,
            content: rawByUri.get(uri),
            mimeType: 'text/turtle',
            etag: '"raw-vocab-projections"',
            headers: { etag: '"raw-vocab-projections"', 'content-type': 'text/turtle' },
          }
        : null,
      isLoading: false,
      error: null,
    }))
    mockUsePendingVocabTermProposals.mockReturnValue({
      data: [pendingClassProposal, pendingPredicateProposal],
      isLoading: false,
      error: null,
    })
    useFilesStore.setState({
      selectedFileId: documentUri,
      structuredClassScope: 'udfs:Workspace',
    })

    render(<FileDetailPane />)

    expect(await screen.findByRole('columnheader', { name: /Summary\*/ })).toBeInTheDocument()
    const summaryHeaders = screen.getAllByRole('columnheader').filter((header) => /summary/i.test(header.textContent ?? ''))
    expect(summaryHeaders).toHaveLength(1)
    expect(summaryHeaders[0]).toHaveTextContent('Summary*')
    expect(screen.getByRole('cell', { name: '"Existing"' })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ }))
    expect(screen.getByText('Note*')).toBeInTheDocument()
    expect(screen.getByText('审批记录已准备')).toBeInTheDocument()
    expect(screen.queryByText('待确认词表变更')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '打开 class 审批记录 Note' }))
    expect(window.open).toHaveBeenCalledWith(
      pendingClassProposal.proposalResourceUri,
      '_blank',
      'noopener,noreferrer',
    )

    fireEvent.keyDown(document.body, { key: 'Escape' })
    fireEvent.pointerDown(screen.getByRole('button', { name: '待确认 predicate Summary' }))
    expect(screen.getByText('已提交审批记录；词表未变更。')).toBeInTheDocument()
    expect(screen.getByText('审批记录')).toBeInTheDocument()
    expect(screen.getByText(pendingPredicateProposal.proposalResourceUri)).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '提交到 Inbox 审批' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: '打开审批记录' }))
    expect(window.open).toHaveBeenCalledWith(
      pendingPredicateProposal.proposalResourceUri,
      '_blank',
      'noopener,noreferrer',
    )
    fireEvent.keyDown(document.body, { key: 'Escape' })

    fireEvent.click(screen.getByRole('cell', { name: '"Existing"' }))
    const summaryInput = screen.getByRole('textbox', { name: '编辑 #Workspace 的 Summary' })
    fireEvent.change(summaryInput, { target: { value: 'Updated summary' } })
    fireEvent.focus(summaryInput)
    fireEvent.blur(summaryInput)

    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri,
        subject: '#Workspace',
        predicate: 'summary',
        previousValues: ['"Existing"'],
        nextValues: ['"Updated summary"'],
        vocabTermProposalResourceUri: pendingPredicateProposal.proposalResourceUri,
        writesCanonicalResource: false,
      }))
    })
  })

  it('shows class scope controls when only hydrated pending class proposals exist', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const pendingClassProposal = createVocabTermProposal({
      documentUri,
      classScope: null,
      termUri: 'https://pod.example/.vocab/terms.ttl#Note',
      termKind: 'class',
      label: 'Note',
      valueType: 'class',
      description: 'Draft note class.',
      shape: 'rdf:type scope',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '<#Draft> title "No class yet" .',
      },
      isLoading: false,
      error: null,
    })
    const rawByUri = new Map([
      [documentUri, '<#Draft> title "No class yet" .'],
      ['https://pod.example/.vocab/terms.ttl', '@prefix udfs: <https://undefineds.co/vocab/> .'],
      ['https://pod.example/.vocab/shapes.ttl', '@prefix udfs: <https://undefineds.co/vocab/> .'],
      ['https://pod.example/.vocab/namespaces.ttl', '@prefix udfs: <https://undefineds.co/vocab/> .'],
    ])
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: rawByUri.has(uri)
        ? {
            uri,
            content: rawByUri.get(uri),
            mimeType: 'text/turtle',
            etag: '"raw-class-only"',
            headers: { etag: '"raw-class-only"', 'content-type': 'text/turtle' },
          }
        : null,
      isLoading: false,
      error: null,
    }))
    mockUsePendingVocabTermProposals.mockReturnValue({
      data: [pendingClassProposal],
      isLoading: false,
      error: null,
    })
    useFilesStore.setState({ selectedFileId: documentUri })

    render(<FileDetailPane />)

    fireEvent.pointerDown(await screen.findByRole('button', { name: /(?:当前 class|选择 class)/ }))
    expect(screen.getByText('Note*')).toBeInTheDocument()
  })

  it('deduplicates new class proposals by the current Pod vocab term identity', async () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '<#Draft> title "No class yet" .',
      },
      isLoading: false,
      error: null,
    })
    const rawByUri = new Map([
      [documentUri, '<#Draft> title "No class yet" .'],
      ['https://pod.example/.vocab/terms.ttl', '@prefix udfs: <https://undefineds.co/vocab/> .'],
      ['https://pod.example/.vocab/shapes.ttl', '@prefix udfs: <https://undefineds.co/vocab/> .'],
      ['https://pod.example/.vocab/namespaces.ttl', '@prefix udfs: <https://undefineds.co/vocab/> .'],
    ])
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: rawByUri.has(uri)
        ? {
            uri,
            content: rawByUri.get(uri),
            mimeType: 'text/turtle',
            etag: '"raw-class-dedupe"',
            headers: { etag: '"raw-class-dedupe"', 'content-type': 'text/turtle' },
          }
        : null,
      isLoading: false,
      error: null,
    }))
    useFilesStore.setState({ selectedFileId: documentUri })

    render(<FileDetailPane />)

    fireEvent.pointerDown(await screen.findByRole('button', { name: /(?:当前 class|选择 class)/ }))
    fireEvent.click(screen.getByRole('button', { name: '创建 class' }))
    fireEvent.change(screen.getByLabelText('新 class URI'), { target: { value: 'udfs:Note' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    fireEvent.change(screen.getByLabelText('新 class URI'), { target: { value: 'https://schema.example/terms#Note' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    expect(screen.getAllByText('note*')).toHaveLength(1)
    expect(screen.queryByText('udfs:Note*')).not.toBeInTheDocument()
    expect(screen.queryByText('https://schema.example/terms#Note*')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '提交待确认 class *' }))
    await waitFor(() => {
      expect(mockCreateInboxApproval).toHaveBeenCalledTimes(1)
    })
    expect(mockCreateInboxApproval).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.stringMatching(/^https:\/\/pod\.example\/\.data\/proposals\/vocab\/note-[a-z0-9]{7}\.ttl#proposal$/),
      proposalResourceUri: expect.stringMatching(/^https:\/\/pod\.example\/\.data\/proposals\/vocab\/note-[a-z0-9]{7}\.ttl$/),
      targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
      targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
      termUri: 'https://pod.example/.vocab/terms.ttl#note',
      termKind: 'class',
      label: 'note',
      valueType: 'class',
      writesCanonicalVocab: false,
    }))
  })

  it('rolls back failed structured table cell proposal attempts', async () => {
    mockCreateCellProposal.mockRejectedValueOnce(new Error('offline'))
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" .',
        mimeType: 'text/turtle',
        etag: '"raw-fail-1"',
        headers: { etag: '"raw-fail-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Workspace' }))
    fireEvent.click(screen.getByRole('cell', { name: '"Files"' }))
    const titleInput = screen.getByRole('textbox', { name: '编辑 #Workspace 的 title' })
    fireEvent.change(titleInput, { target: { value: 'Draft title' } })
    fireEvent.focus(titleInput)
    fireEvent.blur(titleInput)

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        description: 'offline',
        variant: 'destructive',
      })
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Discard pending write for title on #Workspace' })).not.toBeInTheDocument()
      expect(screen.queryByRole('cell', { name: /Draft title/ })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('cell', { name: '"Files"' })).toBeInTheDocument()
  })

  it('stages existing .data predicate cell edits through structured cell approvals', async () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; status "active" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; status "active" .',
        mimeType: 'text/turtle',
        etag: '"raw-structured-1"',
        headers: { etag: '"raw-structured-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Workspace' }))
    fireEvent.click(screen.getByRole('cell', { name: '"Files"' }))
    const titleInput = screen.getByRole('textbox', { name: '编辑 #Workspace 的 title' })
    fireEvent.change(titleInput, { target: { value: 'Draft title' } })
    fireEvent.focus(titleInput)
    fireEvent.blur(titleInput)

    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Workspace',
        predicate: 'title',
        previousValues: ['"Files"'],
        nextValues: ['"Draft title"'],
        writesCanonicalResource: false,
      }))
    })
    expect(mockMutateRaw).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Discard pending write for title on #Workspace' })).not.toBeInTheDocument()
    })
    expect(screen.getByText('"Draft title"')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Pending approval for title on #Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Pending approval for title on #Workspace' }))
      .toHaveAttribute('title', '单元格变更已提交；等待 Inbox 审批，canonical 数据未变更')
  })

  it('renders raw structured view from effective visible table state', async () => {
    const source = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; status "active" .'
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: source,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: source,
        mimeType: 'text/turtle',
        etag: '"raw-effective-view-1"',
        headers: { etag: '"raw-effective-view-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Workspace' }))
    fireEvent.click(screen.getByRole('cell', { name: '"Files"' }))
    const titleInput = screen.getByRole('textbox', { name: '编辑 #Workspace 的 title' })
    fireEvent.change(titleInput, { target: { value: 'Draft title' } })
    fireEvent.blur(titleInput)

    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Workspace',
        predicate: 'title',
        nextValues: ['"Draft title"'],
      }))
    })

    act(() => {
      useFilesStore.setState({ structuredHiddenPredicates: new Set(['status']) })
    })
    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Raw' }))

    expect(screen.getByRole('heading', { name: '当前视图文本' })).toBeInTheDocument()
    expect(screen.getByText('当前筛选、predicate 可见性和待确认更改后的投影视图。')).toBeInTheDocument()
    expect(screen.getByText(/Draft title/)).toBeInTheDocument()
    expect(screen.queryByText(/status "active"/)).not.toBeInTheDocument()
    expect(screen.queryByText(/title "Files"/)).not.toBeInTheDocument()
  })

  it('offers an explicit structured sort tool in the table head', async () => {
    const source = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '<#Workspace> a udfs:Workspace ; title "Zeta" ; status "active" .',
      '<#Other> a udfs:Workspace ; title "Alpha" ; status "draft" .',
    ].join('\n')
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: source,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: source,
        mimeType: 'text/turtle',
        etag: '"raw-structured-sort-1"',
        headers: { etag: '"raw-structured-sort-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    useFilesStore.setState({ structuredClassScope: 'udfs:Workspace' })

    render(<FileDetailPane />)

    const sortButton = await screen.findByRole('button', { name: '排序' })
    fireEvent.pointerDown(sortButton)
    fireEvent.click(screen.getByRole('menuitem', { name: 'title 升序' }))

    await waitFor(() => {
      expect(useFilesStore.getState().structuredSortKey).toBe('title')
      expect(useFilesStore.getState().structuredSortDirection).toBe('asc')
      expect(screen.getByRole('button', { name: '排序' })).toHaveAttribute('title', 'title 升序')
    })
  })

  it('stages Kanban moves for writable .data grouping predicates through structured cell approvals', async () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
        mimeType: 'text/turtle',
        etag: '"raw-kanban-1"',
        headers: { etag: '"raw-kanban-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kanban' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: /Kanban 分组 predicate/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'mode' }))
    mockMutateRaw.mockClear()
    mockCreateCellProposal.mockClear()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move #Other' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '移动到 read/write' }))

    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Other',
        predicate: 'mode',
        previousValues: ['"read"'],
        nextValues: ['"read/write"'],
        writesCanonicalResource: false,
      }))
    })
    expect(mockMutateRaw).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByText('待审批：mode -> read/write')).toBeInTheDocument()
    })
  })

  it('carries Kanban move proposals into the raw structured view', async () => {
    const source = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .'
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: source,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: source,
        mimeType: 'text/turtle',
        etag: '"raw-kanban-effective-1"',
        headers: { etag: '"raw-kanban-effective-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kanban' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: /Kanban 分组 predicate/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'mode' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move #Other' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '移动到 read/write' }))

    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        subject: '#Other',
        predicate: 'mode',
        previousValues: ['"read"'],
        nextValues: ['"read/write"'],
      }))
    })

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Raw' }))

    const rawBlock = document.querySelector('pre')
    expect(rawBlock?.textContent).toContain('#Other')
    expect(rawBlock?.textContent).toContain('mode "read/write"')
    expect(rawBlock?.textContent).not.toContain('mode "read"')
    expect(mockMutateRaw).not.toHaveBeenCalled()
  })

  it('stages Kanban moves with the canonical grouping value instead of the display label', async () => {
    const source = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '<#Workspace> a udfs:Workspace ; title "Files" ; status <https://example.com/status/todo> .',
      '<#Other> a udfs:Workspace ; title "Other" ; status <https://example.com/status/done> .',
    ].join('\n')
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: source,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: source,
        mimeType: 'text/turtle',
        etag: '"raw-kanban-iri-1"',
        headers: { etag: '"raw-kanban-iri-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kanban' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: /Kanban 分组 predicate/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'status' }))
    mockMutateRaw.mockClear()
    mockCreateCellProposal.mockClear()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move #Other' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '移动到 todo' }))

    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Other',
        predicate: 'status',
        previousValues: ['https://example.com/status/done'],
        nextValues: ['https://example.com/status/todo'],
        writesCanonicalResource: false,
      }))
    })
    expect(mockMutateRaw).not.toHaveBeenCalled()
    expect(screen.getByText('待审批：status -> todo')).toBeInTheDocument()
  })

  it('stages keyboard Kanban moves through the structured cell proposal path', async () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
        mimeType: 'text/turtle',
        etag: '"raw-kanban-drag-1"',
        headers: { etag: '"raw-kanban-drag-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kanban' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: /Kanban 分组 predicate/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'mode' }))
    mockMutateRaw.mockClear()
    mockCreateCellProposal.mockClear()

    const otherCard = document.querySelector('[data-kanban-card-subject="#Other"]') as HTMLElement
    const readWriteColumn = screen.getByLabelText('Kanban column read/write')
    expect(otherCard).toHaveAttribute('data-dnd-kit-sortable', 'true')
    expect(readWriteColumn).toHaveAttribute('data-dnd-kit-droppable', 'true')

    const lanes = screen.getAllByLabelText(/^Kanban column /)
    const sourceLaneIndex = lanes.findIndex((lane) => lane.contains(otherCard))
    const targetLaneIndex = lanes.indexOf(readWriteColumn)
    const direction = targetLaneIndex < sourceLaneIndex ? 'ArrowLeft' : 'ArrowRight'
    fireEvent.keyDown(otherCard, { key: direction, code: direction, altKey: true })

    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Other',
        predicate: 'mode',
        previousValues: ['"read"'],
        nextValues: ['"read/write"'],
        writesCanonicalResource: false,
      }))
    })
    expect(mockMutateRaw).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByText('待审批：mode -> read/write')).toBeInTheDocument()
    })
  })

  it('autosaves Kanban column order through view metadata without staging cell approvals', async () => {
    vi.useFakeTimers()
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'
    const source = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#A> a udfs:Workspace ; title "Alpha" ; mode "read" .\n<#B> a udfs:Workspace ; title "Beta" ; mode "read" .\n<#C> a udfs:Workspace ; title "Gamma" ; mode "read" .'
    useFilesStore.setState({
      selectedFileId: documentUri,
      editableFileSheetOpenRequestUri: null,
      structuredViewMode: 'kanban',
      structuredKanbanGroupPredicate: 'mode',
      structuredSubjectReturnContext: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: documentUri,
        uri: documentUri,
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: source,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: documentUri,
        content: source,
        mimeType: 'text/turtle',
        etag: '"raw-kanban-order-1"',
        headers: { etag: '"raw-kanban-order-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    mockUseStructuredViewMetadata.mockReturnValue({
      data: {
        ownerUri: documentUri,
        metaUri: `${documentUri}.meta`,
        state: 'exists',
        etag: '"meta-kanban-order-1"',
        metadata: {
          documentUri,
          viewMode: 'kanban',
          classScope: null,
          searchText: '',
          sortKey: null,
          sortDirection: 'asc',
          hiddenPredicates: [],
          kanbanGroupPredicate: 'mode',
          kanbanOrder: {},
          columnSizing: {},
          whiteboard: {
            selectedSubjects: [],
            positions: {},
          },
          writesCanonicalData: false,
        },
      },
      isLoading: false,
      error: null,
    })
    mockSaveStructuredViewMetadata.mockResolvedValue(undefined)

    render(<FileDetailPane />)
    await vi.advanceTimersByTimeAsync(0)
    mockSaveStructuredViewMetadata.mockClear()
    mockCreateCellProposal.mockClear()
    mockMutateRaw.mockClear()

    const readColumn = screen.getByLabelText('Kanban column read')
    const subjectsInReadColumn = () => Array.from(readColumn.querySelectorAll('[data-kanban-card-subject]'))
      .map((element) => element.getAttribute('data-kanban-card-subject'))
    expect(subjectsInReadColumn()).toEqual(['#A', '#B', '#C'])

    const sourceCard = document.querySelector('[data-kanban-card-subject="#C"]') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(sourceCard, { key: 'ArrowUp', code: 'ArrowUp', altKey: true })
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(subjectsInReadColumn()).toEqual(['#A', '#C', '#B'])
    const movedSourceCard = document.querySelector('[data-kanban-card-subject="#C"]') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(movedSourceCard, { key: 'ArrowUp', code: 'ArrowUp', altKey: true })
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(subjectsInReadColumn()).toEqual(['#C', '#A', '#B'])
    expect(mockCreateCellProposal).not.toHaveBeenCalled()
    expect(mockMutateRaw).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900)
    })

    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledTimes(1)
    expect(mockSaveStructuredViewMetadata).toHaveBeenCalledWith({
      file: {
        uri: documentUri,
        kind: 'resource',
      },
      metadata: expect.objectContaining({
        documentUri,
        viewMode: 'kanban',
        kanbanGroupPredicate: 'mode',
        kanbanOrder: {
          read: ['#C', '#A', '#B'],
        },
        writesCanonicalData: false,
      }),
    })
    expect(screen.queryByText(/待审批：mode/)).not.toBeInTheDocument()
  })

  it('rolls back Kanban moves when structured cell approval staging fails', async () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .',
        mimeType: 'text/turtle',
        etag: '"raw-kanban-failed-1"',
        headers: { etag: '"raw-kanban-failed-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })
    mockCreateCellProposal.mockRejectedValueOnce(new Error('offline'))

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kanban' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: /Kanban 分组 predicate/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'mode' }))
    mockMutateRaw.mockClear()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move #Other' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '移动到 read/write' }))

    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Other',
        predicate: 'mode',
        previousValues: ['"read"'],
        nextValues: ['"read/write"'],
        writesCanonicalResource: false,
      }))
    })
    await waitFor(() => {
      expect(screen.queryByText('待审批：mode -> read/write')).not.toBeInTheDocument()
    })
    expect(within(screen.getByLabelText('Kanban column read')).getByText('Other')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Kanban column read/write')).queryByText('Other')).not.toBeInTheDocument()
    expect(mockMutateRaw).not.toHaveBeenCalled()
  })

  it('opens relation and URL cells with type-specific cell operations', () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<#Workspace> a udfs:Workspace ; title "Files" ; related <#Other> ; term <https://pod.example/.vocab/terms.ttl#tags> ; source <https://source.example/report.pdf> .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .\n<https://pod.example/.vocab/terms.ttl#tags> a udfs:PredicateTerm ; rdfs:label "tags" ; rdfs:comment "Topic labels" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n<#Workspace> a udfs:Workspace ; title "Files" ; related <#Other> ; term <https://pod.example/.vocab/terms.ttl#tags> ; source <https://source.example/report.pdf> .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .\n<https://pod.example/.vocab/terms.ttl#tags> a udfs:PredicateTerm ; rdfs:label "tags" ; rdfs:comment "Topic labels" .',
        mimeType: 'text/turtle',
        etag: '"raw-relation-1"',
        headers: { etag: '"raw-relation-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Workspace' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open predicate #Other' }))

    const relationSidecar = screen.getByLabelText('Structured subject peek')
    expect(screen.queryByRole('dialog', { name: 'Subject preview' })).not.toBeInTheDocument()
    expect(within(relationSidecar).queryByText('#Other')).not.toBeInTheDocument()
    fireEvent.click(within(relationSidecar).getByRole('button', { name: '查看 URI 详情' }))
    expect(within(relationSidecar).getByText('#Other')).toBeInTheDocument()
    expect(within(relationSidecar).getByText('属性')).toBeInTheDocument()
    expect(within(relationSidecar).queryByText('properties')).not.toBeInTheDocument()
    expect(within(relationSidecar).queryByText('relations')).not.toBeInTheDocument()
    expect(within(relationSidecar).getByText('related')).toBeInTheDocument()
    expect(within(relationSidecar).getByText('#Workspace')).toBeInTheDocument()
    fireEvent.click(within(relationSidecar).getByRole('button', { name: '取消' }))

    fireEvent.click(screen.getByRole('button', { name: 'Open predicate https://pod.example/.vocab/terms.ttl#tags' }))
    const termRelationSidecar = screen.getByLabelText('Structured term peek')
    expect(screen.queryByRole('dialog', { name: 'term definition' })).not.toBeInTheDocument()
    expect(within(termRelationSidecar).queryByText('https://pod.example/.vocab/terms.ttl#tags')).not.toBeInTheDocument()
    fireEvent.click(within(termRelationSidecar).getByRole('button', { name: '查看 URI 详情' }))
    expect(within(termRelationSidecar).getByText('https://pod.example/.vocab/terms.ttl#tags')).toBeInTheDocument()
    expect(within(termRelationSidecar).getByText('https://pod.example/.vocab/terms.ttl')).toBeInTheDocument()
    expect(within(termRelationSidecar).getByText('rdfs:label')).toBeInTheDocument()
    expect(within(termRelationSidecar).getByText('"tags"')).toBeInTheDocument()
    expect(within(termRelationSidecar).getByText('rdfs:comment')).toBeInTheDocument()
    expect(within(termRelationSidecar).getByText('"Topic labels"')).toBeInTheDocument()
    fireEvent.click(within(termRelationSidecar).getByRole('button', { name: '取消' }))

    fireEvent.click(screen.getByRole('button', { name: 'Open URL https://source.example/report.pdf' }))

    expect(window.open).toHaveBeenCalledWith('https://source.example/report.pdf', '_blank', 'noopener,noreferrer')
  })

  it('stages relation cell replacement through the cell operation editor', async () => {
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; related <#Other> .\n<#Other> a udfs:Workspace ; title "Other" .\n<#Replacement> a udfs:Workspace ; title "Replacement" .'
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: structuredSource,
        mimeType: 'text/turtle',
        etag: '"raw-relation-replace-1"',
        headers: { etag: '"raw-relation-replace-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Workspace' }))
    const workspaceRow = screen.getAllByRole('row').find((candidate) => within(candidate).queryByRole('cell', { name: '#Workspace' }))
    expect(workspaceRow).toBeDefined()
    fireEvent.click(within(workspaceRow as HTMLElement).getByRole('cell', { name: 'Other' }))
    const relationInput = screen.getByRole('textbox', { name: '编辑 #Workspace 的 related' })
    fireEvent.change(relationInput, { target: { value: '#Replacement' } })
    fireEvent.focus(relationInput)
    fireEvent.blur(relationInput)

    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Workspace',
        predicate: 'related',
        previousValues: ['#Other'],
        nextValues: ['<#Replacement>'],
        writesCanonicalResource: false,
      }))
    })
    expect(mockMutateRaw).not.toHaveBeenCalled()
  })

  it('stages URL cell clearing through the cell operation editor', async () => {
    const structuredSource = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; source <https://source.example/report.pdf> .'
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: structuredSource,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: structuredSource,
        mimeType: 'text/turtle',
        etag: '"raw-url-clear-1"',
        headers: { etag: '"raw-url-clear-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Workspace' }))
    fireEvent.click(screen.getByRole('cell', { name: 'report.pdf' }))
    fireEvent.click(screen.getByRole('button', { name: '清空 #Workspace 的 source' }))

    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Workspace',
        predicate: 'source',
        previousValues: ['https://source.example/report.pdf'],
        nextValues: [],
        writesCanonicalResource: false,
      }))
    })
    expect(mockMutateRaw).not.toHaveBeenCalled()
  })

  it('adds a value from an empty structured table cell through a structured cell proposal', async () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; summary "Primary" .\n<#Other> a udfs:Workspace ; title "Other" .',
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        content: '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; summary "Primary" .\n<#Other> a udfs:Workspace ; title "Other" .',
        mimeType: 'text/turtle',
        etag: '"raw-empty-cell-1"',
        headers: { etag: '"raw-empty-cell-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /(?:当前 class|选择 class)/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Workspace' }))
    const otherRow = screen.getAllByRole('row').find((candidate) => within(candidate).queryByRole('cell', { name: '#Other' }))
    expect(otherRow).toBeDefined()

    fireEvent.click(within(otherRow as HTMLElement).getAllByRole('cell', { name: '—' })[0])
    const summaryInput = within(otherRow as HTMLElement).getByRole('textbox', { name: '编辑 #Other 的 summary' })
    fireEvent.change(summaryInput, { target: { value: 'Needs review' } })
    fireEvent.focus(summaryInput)
    fireEvent.blur(summaryInput)

    await waitFor(() => {
      expect(mockCreateCellProposal).toHaveBeenCalledWith(expect.objectContaining({
        documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        subject: '#Other',
        predicate: 'summary',
        previousValues: [],
        nextValues: ['"Needs review"'],
        writesCanonicalResource: false,
      }))
    })
    expect(mockMutateRaw).not.toHaveBeenCalled()
  })

  it('opens JSON-LD structured resources as a read-only table until format-aware writes exist', () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/workspaces/ws-1/state.jsonld',
        uri: 'https://pod.example/.data/workspaces/ws-1/state.jsonld',
        name: 'state.jsonld',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/',
        mimeType: 'application/ld+json',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: JSON.stringify({
          '@context': { udfs: 'https://undefineds.co/vocab/' },
          '@id': '#Workspace',
          '@type': 'udfs:Workspace',
          title: 'Files',
        }),
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: {
        uri,
        content: uri.endsWith('/.vocab/terms.ttl') || uri.endsWith('/.vocab/shapes.ttl')
          ? ''
          : JSON.stringify({
              '@context': { udfs: 'https://undefineds.co/vocab/' },
              '@id': '#Workspace',
              '@type': 'udfs:Workspace',
              title: 'Files',
            }),
        mimeType: uri.endsWith('.jsonld') ? 'application/ld+json' : 'text/turtle',
        etag: '"raw-jsonld-1"',
        headers: { etag: '"raw-jsonld-1"', 'content-type': uri.endsWith('.jsonld') ? 'application/ld+json' : 'text/turtle' },
      },
      isLoading: false,
      error: null,
    }))

    render(<FileDetailPane />)

    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '"Files"' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Subject' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ predicate' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('cell', { name: '"Files"' }))

    expect(screen.queryByRole('textbox', { name: '编辑 #Workspace 的 title' })).not.toBeInTheDocument()
    expect(mockCreateCellProposal).not.toHaveBeenCalled()
    expect(mockMutateRaw).not.toHaveBeenCalled()
  })

  it('opens Turtle resources outside .data as read-only tables until a write policy exists', () => {
    const source = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" .'
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/state.ttl',
        uri: 'https://pod.example/public/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: source,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: {
        uri,
        content: uri.includes('/.vocab/') ? '@prefix udfs: <https://undefineds.co/vocab/> .' : source,
        mimeType: 'text/turtle',
        etag: '"raw-public-ttl-1"',
        headers: { etag: '"raw-public-ttl-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    }))

    render(<FileDetailPane />)

    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '"Files"' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Subject' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ predicate' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('cell', { name: '"Files"' }))

    expect(screen.queryByRole('textbox', { name: '编辑 #Workspace 的 title' })).not.toBeInTheDocument()
    expect(mockCreateCellProposal).not.toHaveBeenCalled()
    expect(mockMutateRaw).not.toHaveBeenCalled()
  })

  it('does not use detail preview Turtle as structured data when the full raw resource query is unavailable', () => {
    const source = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '<#Repository> a udfs:Repository ;',
      '  rdfs:label "LinX Repository Smoke" ;',
      '  udfs:defaultBranch "main" .',
    ].join('\n')
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/.data/repositories/repository.ttl',
        uri: 'https://pod.example/.data/repositories/repository.ttl',
        name: 'repository.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/.data/repositories/',
        mimeType: 'text/turtle',
        size: 553,
        modifiedAt: '2026-06-22T12:00:00Z',
        headers: {},
        previewText: source,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('raw query unavailable'),
    })

    render(<FileDetailPane />)

    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument()
    expect(screen.getByText('完整原始内容暂时不可用，不能解析结构化表。')).toBeInTheDocument()
    expect(screen.queryByText(/udfs:Repository · 1 行 · 2 Predicates/)).not.toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: '#Repository' })).not.toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: '"LinX Repository Smoke"' })).not.toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: '"main"' })).not.toBeInTheDocument()
  })

  it('keeps Kanban moves read-only for Turtle resources outside .data', () => {
    const source = '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" ; mode "read/write" .\n<#Other> a udfs:Workspace ; title "Other" ; mode "read" .'
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/state.ttl',
        uri: 'https://pod.example/public/state.ttl',
        name: 'state.ttl',
        kind: 'resource',
        semanticKind: 'structured-data',
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/turtle',
        size: 2048,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: source,
      },
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: {
        uri,
        content: uri.includes('/.vocab/') ? '@prefix udfs: <https://undefineds.co/vocab/> .' : source,
        mimeType: 'text/turtle',
        etag: '"raw-public-kanban-1"',
        headers: { etag: '"raw-public-kanban-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    }))

    render(<FileDetailPane />)

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ 视图' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Kanban' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: /Kanban 分组 predicate/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'mode' }))

    expect(screen.getByLabelText('Kanban column read')).toBeInTheDocument()
    expect(screen.getByLabelText('Kanban column read/write')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move #Other' })).not.toBeInTheDocument()
    expect(mockCreateCellProposal).not.toHaveBeenCalled()
    expect(mockMutateRaw).not.toHaveBeenCalled()
  })

  it('renders folder detail as an expandable tree without a side preview', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [{
          id: 'https://pod.example/public/docs/',
          uri: 'https://pod.example/public/docs/',
          name: 'docs',
          kind: 'container',
          semanticKind: 'container',
          parentUri: 'https://pod.example/public/',
          mimeType: 'inode/container',
          size: null,
          modifiedAt: null,
        }],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByRole('tree', { name: 'Folder list view' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开 docs' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Folder child preview')).not.toBeInTheDocument()
    expect(screen.queryByText('文件夹预览')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '预览' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '来源' })).not.toBeInTheDocument()
  })

  it('renders folder detail with child resources', async () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFilesAccessBasics.mockImplementation((file) => ({
      data: {
        ownerUri: file?.uri ?? 'https://pod.example/public/',
        activeSource: {
          provider: 'acr',
          uri: 'https://pod.example/public/.acr',
          confidence: 'linked',
          inheritance: 'direct',
        },
        effectiveAccess: {
          user: { read: true, append: true, write: true, control: true },
          public: { read: true, append: false, write: false, control: false },
        },
        candidates: [
          {
            provider: 'acr',
            uri: 'https://pod.example/public/.acr',
            existence: { uri: 'https://pod.example/public/.acr', state: 'exists', status: 200 },
          },
          {
            provider: 'acl',
            uri: 'https://pod.example/public/.acl',
            existence: { uri: 'https://pod.example/public/.acl', state: 'missing', status: 404 },
          },
        ],
      },
      isLoading: false,
      error: null,
    }))
    mockUseFilesMetaSidecar.mockImplementation((file) => ({
      data: {
        ownerUri: file?.uri ?? 'https://pod.example/public/',
        metaUri: 'https://pod.example/public/.meta',
        state: 'exists',
        status: 200,
        content: '<#container> <#summary> "Folder metadata" .',
        mimeType: 'text/turtle',
        etag: '"folder-meta-1"',
        size: 42,
      },
      isLoading: false,
      error: null,
    }))
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        previewUnavailableReason: '容器不提供文本预览，可双击进入继续浏览。',
        childEntries: [
          {
            id: 'https://pod.example/public/docs/',
            uri: 'https://pod.example/public/docs/',
            name: 'docs',
            kind: 'container',
            semanticKind: 'container',
            parentUri: 'https://pod.example/public/',
            mimeType: 'inode/container',
            size: null,
            modifiedAt: null,
          },
          {
            id: 'https://pod.example/public/diagram.png',
            uri: 'https://pod.example/public/diagram.png',
            name: 'diagram.png',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'image/png',
            size: 1024,
            modifiedAt: '2026-03-01T10:00:00Z',
            summary: 'Architecture diagram preview.',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByLabelText('Folder detail surface')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '预览' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '来源' })).not.toBeInTheDocument()
    expect(screen.queryByText('浏览 public')).not.toBeInTheDocument()
    expect(screen.queryByText(/生产路径|Finder-like/)).not.toBeInTheDocument()
    const listViewButton = screen.getByRole('button', { name: '列表' })
    const iconViewButton = screen.getByRole('button', { name: '网格' })
    expect(listViewButton).toHaveTextContent('列表')
    expect(iconViewButton).toHaveTextContent('网格')
    expect(screen.queryByRole('button', { name: '分栏视图' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '图标预览' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建文件夹' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Folder container actions')).not.toBeInTheDocument()
    const detailHead = screen.getByLabelText('文件详情 head')
    expect(within(detailHead).queryByRole('button', { name: '查看 .meta' })).not.toBeInTheDocument()
    expect(within(detailHead).queryByRole('button', { name: '查看 Access 来源' })).not.toBeInTheDocument()
    openResourceActionsMenu()
    expect(screen.getByRole('menuitem', { name: '查看 .meta' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '查看 Access 来源' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByLabelText('Folder list view')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '按名称排序' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '按修改排序' })).toBeInTheDocument()
    expect(screen.getByText('docs')).toBeInTheDocument()
    expect(screen.getByText('diagram.png')).toBeInTheDocument()
    expect(screen.queryByText('文件夹预览')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Folder child preview')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '网格' }))
    const iconView = screen.getByLabelText('Folder icon view')
    expect(iconView).toBeInTheDocument()
    const diagramTile = within(iconView).getByRole('button', { name: 'diagram.png' })
    expect(within(diagramTile).queryByText('Architecture diagram preview.')).not.toBeInTheDocument()
    expect(within(diagramTile).queryByText('image/png')).not.toBeInTheDocument()
    expect(within(diagramTile).queryByText('1.0 KB')).not.toBeInTheDocument()
    expect(within(diagramTile).queryByText('2026/3/1 18:00:00')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('diagram.png'), { metaKey: true })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
    expect(diagramTile).toHaveClass('bg-primary/10')

    fireEvent.contextMenu(screen.getByRole('button', { name: 'diagram.png' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '复制到...' }))
    const copyPathInput = await screen.findByLabelText('目标路径')
    expect(copyPathInput).toHaveValue('diagram copy.png')
    fireEvent.change(copyPathInput, { target: { value: 'diagram.png' } })
    expect(screen.getByText('目标和原文件相同')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制' })).toBeDisabled()
    fireEvent.change(copyPathInput, { target: { value: 'diagram copy.png' } })
    fireEvent.click(screen.getByRole('button', { name: '复制' }))
    await waitFor(() => {
      expect(mockCopyFileResource).toHaveBeenCalledWith({
        sourceUri: 'https://pod.example/public/diagram.png',
        destinationUri: 'https://pod.example/public/diagram%20copy.png',
      })
    })
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({ description: '文件复制已开始' })
    })

    fireEvent.contextMenu(screen.getByRole('button', { name: 'diagram.png' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '移动到...' }))
    await fillOperationSheet('目标路径', 'archive/', '移动')
    await waitFor(() => {
      expect(mockMoveFileResource).toHaveBeenCalledWith({
        sourceUri: 'https://pod.example/public/diagram.png',
        destinationUri: 'https://pod.example/public/archive/diagram.png',
      })
    })
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({ description: '文件移动已开始' })
    })

    fireEvent.contextMenu(screen.getByRole('button', { name: 'diagram.png' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '重命名' }))
    await fillOperationSheet('新名称', 'diagram-renamed.png', '重命名')
    await waitFor(() => {
      expect(mockMoveFileResource).toHaveBeenCalledWith({
        sourceUri: 'https://pod.example/public/diagram.png',
        destinationUri: 'https://pod.example/public/diagram-renamed.png',
      })
    })
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({ description: '重命名已开始' })
    })

    fireEvent.contextMenu(screen.getByRole('button', { name: 'diagram.png' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '重命名' }))
    const blankRenameInput = await screen.findByLabelText('新名称')
    fireEvent.change(blankRenameInput, { target: { value: '' } })
    expect(screen.getByRole('button', { name: '重命名' })).toBeDisabled()
    fireEvent.change(blankRenameInput, { target: { value: 'docs' } })
    expect(screen.getByText('同名项目已存在')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重命名' })).toBeDisabled()
    fireEvent.change(blankRenameInput, { target: { value: '../escape.png' } })
    expect(screen.getByText('名称不能包含路径')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重命名' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(mockMoveFileResource).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: '新建文件夹' }))
    const blankFolderInput = await screen.findByLabelText('名称')
    fireEvent.change(blankFolderInput, { target: { value: '' } })
    expect(screen.getByRole('button', { name: '创建' })).toBeDisabled()
    fireEvent.change(blankFolderInput, { target: { value: 'docs' } })
    expect(screen.getByText('同名项目已存在')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建' })).toBeDisabled()
    fireEvent.change(blankFolderInput, { target: { value: '../escape' } })
    expect(screen.getByText('名称不能包含路径')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(mockCreateFolderResource).not.toHaveBeenCalled()

    const metaCallStart = mockUseFilesMetaSidecar.mock.calls.length
    openHeaderMetaDrawer()

    const drawer = screen.getByLabelText('Resource .meta inspector')
    const openedMetaTargets = mockUseFilesMetaSidecar.mock.calls
      .slice(metaCallStart)
      .filter(([, enabled]) => enabled === true)
      .map(([target]) => (target as { uri?: string } | null)?.uri)
    expect(openedMetaTargets).toContain('https://pod.example/public/')
    expect(openedMetaTargets).not.toContain('https://pod.example/public/diagram.png')
    expect(drawer).toBeInTheDocument()
    expect(within(drawer).getByText('文件夹摘要')).toBeInTheDocument()
    expect(within(drawer).getByText('包含')).toBeInTheDocument()
    expect(within(drawer).getByText('2 项')).toBeInTheDocument()
    expect(within(drawer).getAllByText('资源').length).toBeGreaterThan(0)
    expect(within(drawer).getAllByText('https://pod.example/public/').length).toBeGreaterThan(0)
    expect(within(drawer).getByText('同步状态')).toBeInTheDocument()
    expect(within(drawer).getByText('已连接 · 200')).toBeInTheDocument()
    expect(within(drawer).getByText('类型')).toBeInTheDocument()
    expect(within(drawer).getByText('inode/container')).toBeInTheDocument()
    expect(within(drawer).getAllByText('https://pod.example/public/').length).toBeGreaterThan(0)
    expect(within(drawer).getByText('https://pod.example/public/.meta')).toBeInTheDocument()
    expect(within(drawer).getByText('<#container> <#summary> "Folder metadata" .')).toBeInTheDocument()
    expect(within(drawer).queryByText('image/png')).not.toBeInTheDocument()

    expect(within(drawer).queryByText('https://pod.example/public/diagram.png')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '关闭 .meta inspector' }))
    openResourceActionsMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '查看 Access 来源' }))

    const accessDialog = screen.getByRole('dialog', { name: '权限' })
    expect(within(accessDialog).getAllByText('https://pod.example/public/').length).toBeGreaterThan(0)
    expect(within(accessDialog).getAllByText('https://pod.example/public/.acr').length).toBeGreaterThan(0)
    expect(within(accessDialog).getByText('https://pod.example/public/.acl')).toBeInTheDocument()
    expect(within(accessDialog).getByText('当前会话')).toBeInTheDocument()
    expect(within(accessDialog).getByText('可查看、可追加、可编辑、可管理权限')).toBeInTheDocument()
    expect(mockUseFilesAccessBasics).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'https://pod.example/public/',
      kind: 'container',
    }), true)

  })

  it('routes a plain folder child click to the global read-only preview', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [{
          id: 'https://pod.example/public/readme.md',
          uri: 'https://pod.example/public/readme.md',
          name: 'readme.md',
          kind: 'resource',
          semanticKind: 'file',
          parentUri: 'https://pod.example/public/',
          mimeType: 'text/markdown',
          size: 12,
          modifiedAt: null,
        }],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: /readme\.md/ }))

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/readme.md')
    expect(useFilesStore.getState().detailTab).toBe('preview')
  })

  it('hides file-level sidecars from folder detail children and counts', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/README.md',
            uri: 'https://pod.example/public/README.md',
            name: 'README.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 100,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
          {
            id: 'https://pod.example/public/README.md.meta',
            uri: 'https://pod.example/public/README.md.meta',
            name: 'README.md.meta',
            kind: 'resource',
            semanticKind: 'metadata-sidecar',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/turtle',
            size: 42,
            modifiedAt: '2026-03-01T10:01:00Z',
          },
          {
            id: 'https://pod.example/public/README.md.acl',
            uri: 'https://pod.example/public/README.md.acl',
            name: 'README.md.acl',
            kind: 'resource',
            semanticKind: 'access-policy-sidecar',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/turtle',
            size: 64,
            modifiedAt: '2026-03-01T10:02:00Z',
          },
          {
            id: 'https://pod.example/public/README.md.acr',
            uri: 'https://pod.example/public/README.md.acr',
            name: 'README.md.acr',
            kind: 'resource',
            semanticKind: 'access-policy-sidecar',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/turtle',
            size: 64,
            modifiedAt: '2026-03-01T10:03:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const listView = screen.getByLabelText('Folder list view')
    expect(within(listView).getByRole('button', { name: /README\.md/ })).toBeInTheDocument()
    expect(within(listView).queryByText('README.md.meta')).not.toBeInTheDocument()
    expect(within(listView).queryByText('README.md.acl')).not.toBeInTheDocument()
    expect(within(listView).queryByText('README.md.acr')).not.toBeInTheDocument()
    expect(within(listView).getAllByRole('treeitem')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: '网格' }))
    const iconView = screen.getByLabelText('Folder icon view')
    expect(within(iconView).getByRole('button', { name: 'README.md' })).toBeInTheDocument()
    expect(within(iconView).queryByText('README.md.meta')).not.toBeInTheDocument()
    expect(within(iconView).queryByText('README.md.acl')).not.toBeInTheDocument()
    expect(within(iconView).queryByText('README.md.acr')).not.toBeInTheDocument()

  })

  it('creates a child folder from folder detail actions', async () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: '新建文件夹' }))
    await fillOperationSheet('名称', 'Project Notes', '创建')

    await waitFor(() => {
      expect(mockCreateFolderResource).toHaveBeenCalledWith({
        containerUri: 'https://pod.example/public/',
        name: 'Project Notes',
      })
    })
    expect(useFilesStore.getState().selectedTreeNodeId).toBe('container:https://pod.example/public/Project%20Notes/')
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/Project%20Notes/')
    expect(mockToast).toHaveBeenCalledWith({ description: '文件夹已创建' })
  })

  it('creates a markdown file from folder detail actions', async () => {
    mockCreateRaw.mockResolvedValueOnce({
      uri: 'https://pod.example/public/Meeting%20Notes.md',
      content: '# Meeting Notes\n',
      mimeType: 'text/markdown',
      etag: '"notes-1"',
      headers: { etag: '"notes-1"', 'content-type': 'text/markdown' },
    })
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: '新建 Markdown 文件' }))
    const blankMarkdownInput = await screen.findByLabelText('文件名')
    fireEvent.change(blankMarkdownInput, { target: { value: '' } })
    expect(screen.getByRole('button', { name: '创建' })).toBeDisabled()
    fireEvent.change(blankMarkdownInput, { target: { value: 'nested/Meeting Notes.md' } })
    expect(screen.getByText('名称不能包含路径')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(mockCreateRaw).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '新建 Markdown 文件' }))
    await fillOperationSheet('文件名', 'Meeting Notes.md', '创建')

    await waitFor(() => {
      expect(mockCreateRaw).toHaveBeenCalledWith({
        resource: {
          uri: 'https://pod.example/public/Meeting%20Notes.md',
          mimeType: 'text/markdown',
        },
        content: '# Meeting Notes\n',
      })
    })
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/Meeting%20Notes.md')
    expect(mockToast).toHaveBeenCalledWith({ description: '文件已创建' })
  })

  it('blocks markdown creation when the normalized .md filename already exists', async () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/Meeting%20Notes.md',
            uri: 'https://pod.example/public/Meeting%20Notes.md',
            name: 'Meeting Notes.md',
            kind: 'resource',
            semanticKind: 'markdown',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 16,
            modifiedAt: '2026-06-19T00:00:00.000Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: '新建 Markdown 文件' }))
    const markdownInput = await screen.findByLabelText('文件名')
    fireEvent.change(markdownInput, { target: { value: 'Meeting Notes' } })

    expect(screen.getByText('同名项目已存在')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建' })).toBeDisabled()
    expect(mockCreateRaw).not.toHaveBeenCalled()
  })

  it('uploads a local text file into the current folder detail', async () => {
    mockCreateRaw.mockResolvedValueOnce({
      uri: 'https://pod.example/public/Imported%20Notes.md',
      content: '# Imported\nfrom disk',
      mimeType: 'text/markdown',
      etag: '"imported-1"',
      headers: { etag: '"imported-1"', 'content-type': 'text/markdown' },
    })
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const file = new File(['# Imported\nfrom disk'], 'Imported Notes.md', { type: 'text/markdown' })
    fireEvent.change(screen.getByLabelText('选择上传文件'), { target: { files: [file] } })

    await waitFor(() => {
      expect(mockCreateRaw).toHaveBeenCalledWith({
        resource: {
          uri: 'https://pod.example/public/Imported%20Notes.md',
          mimeType: 'text/markdown',
        },
        content: '# Imported\nfrom disk',
      })
    })
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/Imported%20Notes.md')
    expect(mockToast).toHaveBeenCalledWith({ description: '文件已上传' })
  })

  it('uploads a local binary file into the current folder detail', async () => {
    mockCreateBlob.mockResolvedValueOnce({
      uri: 'https://pod.example/public/diagram.png',
      id: 'https://pod.example/public/diagram.png',
      name: 'diagram.png',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/',
      mimeType: 'image/png',
      size: 4,
      modifiedAt: '2026-06-17T00:00:00.000Z',
      headers: {},
      previewText: null,
    })
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'diagram.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('选择上传文件'), { target: { files: [file] } })

    await waitFor(() => {
      expect(mockCreateBlob).toHaveBeenCalledWith({
        resource: {
          uri: 'https://pod.example/public/diagram.png',
          mimeType: 'image/png',
        },
        content: file,
      })
    })
    expect(mockCreateRaw).not.toHaveBeenCalled()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/diagram.png')
    expect(mockToast).toHaveBeenCalledWith({ description: '文件已上传' })
  })

  it('shows per-file progress while a folder upload is still in flight', async () => {
    let resolveUpload: ((value: { uri: string }) => void) | undefined
    mockCreateBlob.mockImplementationOnce(() => new Promise((resolve) => {
      resolveUpload = resolve
    }))
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'in-flight.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('选择上传文件'), { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByRole('status', { name: '文件上传进度' })).toHaveTextContent('0/1 上传中 · in-flight.png')
    })

    resolveUpload?.({ uri: 'https://pod.example/public/in-flight.png' })
    await waitFor(() => {
      expect(screen.queryByRole('status', { name: '文件上传进度' })).not.toBeInTheDocument()
    })
  })

  it('uploads dropped files into the current folder detail', async () => {
    mockCreateBlob.mockResolvedValueOnce({
      uri: 'https://pod.example/public/scan.pdf',
      id: 'https://pod.example/public/scan.pdf',
      name: 'scan.pdf',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/',
      mimeType: 'application/pdf',
      size: 4,
      modifiedAt: '2026-06-17T00:00:00.000Z',
      headers: {},
      previewText: null,
    })
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const file = new File([new Uint8Array([1, 2, 3, 4])], 'scan.pdf', { type: 'application/pdf' })
    const folderPane = screen.getByLabelText('Folder detail surface')
    expect(folderPane).not.toBeNull()
    fireEvent.dragOver(folderPane!, {
      dataTransfer: {
        types: ['Files'],
        files: [file],
        dropEffect: 'copy',
      },
    })
    fireEvent.drop(folderPane!, {
      dataTransfer: {
        types: ['Files'],
        files: [file],
      },
    })

    await waitFor(() => {
      expect(mockCreateBlob).toHaveBeenCalledWith({
        resource: {
          uri: 'https://pod.example/public/scan.pdf',
          mimeType: 'application/pdf',
        },
        content: file,
      })
    })
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/scan.pdf')
  })

  it('shows an error toast when text upload fails', async () => {
    mockCreateRaw.mockRejectedValueOnce(new Error('HTTP 409'))
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const file = new File(['conflict'], 'conflict.md', { type: 'text/markdown' })
    fireEvent.change(screen.getByLabelText('选择上传文件'), { target: { files: [file] } })

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        description: '上传失败：HTTP 409',
        variant: 'destructive',
      })
    })
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
  })

  it('sorts folder child rows from clickable Finder-style headers', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/zeta.md',
            uri: 'https://pod.example/public/zeta.md',
            name: 'zeta.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 200,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
          {
            id: 'https://pod.example/public/alpha.md',
            uri: 'https://pod.example/public/alpha.md',
            name: 'alpha.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 100,
            modifiedAt: '2026-03-03T10:00:00Z',
          },
          {
            id: 'https://pod.example/public/memo.md',
            uri: 'https://pod.example/public/memo.md',
            name: 'memo.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 300,
            modifiedAt: '2026-03-02T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const folderList = screen.getByLabelText('Folder list view')
    const rowNames = () => within(folderList)
      .getAllByRole('button', { name: /alpha\.md|memo\.md|zeta\.md/ })
      .map((button) => button.textContent ?? '')

    expect(rowNames()[0]).toContain('alpha.md')
    expect(rowNames()[1]).toContain('memo.md')
    expect(rowNames()[2]).toContain('zeta.md')

    fireEvent.click(within(folderList).getByRole('button', { name: '按修改排序' }))

    expect(rowNames()[0]).toContain('zeta.md')
    expect(rowNames()[1]).toContain('memo.md')
    expect(rowNames()[2]).toContain('alpha.md')

    fireEvent.click(within(folderList).getByRole('button', { name: '按修改排序' }))

    expect(rowNames()[0]).toContain('alpha.md')
    expect(rowNames()[1]).toContain('memo.md')
    expect(rowNames()[2]).toContain('zeta.md')
  })

  it('moves folder child selection with arrow keys and Home/End', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/alpha.md',
            uri: 'https://pod.example/public/alpha.md',
            name: 'alpha.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 100,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
          {
            id: 'https://pod.example/public/memo.md',
            uri: 'https://pod.example/public/memo.md',
            name: 'memo.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 200,
            modifiedAt: '2026-03-02T10:00:00Z',
          },
          {
            id: 'https://pod.example/public/zeta.md',
            uri: 'https://pod.example/public/zeta.md',
            name: 'zeta.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 300,
            modifiedAt: '2026-03-03T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const alpha = screen.getByRole('button', { name: /alpha\.md/ })
    alpha.focus()
    fireEvent.keyDown(alpha, { key: 'ArrowDown' })

    expect(getFolderTreeItem(/memo\.md/)).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /memo\.md/ }))

    fireEvent.keyDown(screen.getByRole('button', { name: /memo\.md/ }), { key: 'End' })
    expect(getFolderTreeItem(/zeta\.md/)).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /zeta\.md/ }))

    fireEvent.keyDown(screen.getByRole('button', { name: /zeta\.md/ }), { key: 'Home' })
    expect(getFolderTreeItem(/alpha\.md/)).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(alpha)
  })

  it('keeps keyboard-navigated folder child selection in the Finder-style selected set', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/alpha.md',
            uri: 'https://pod.example/public/alpha.md',
            name: 'alpha.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 100,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
          {
            id: 'https://pod.example/public/memo.md',
            uri: 'https://pod.example/public/memo.md',
            name: 'memo.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 200,
            modifiedAt: '2026-03-02T10:00:00Z',
          },
          {
            id: 'https://pod.example/public/zeta.md',
            uri: 'https://pod.example/public/zeta.md',
            name: 'zeta.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 300,
            modifiedAt: '2026-03-03T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const alpha = screen.getByRole('button', { name: /alpha\.md/ })
    alpha.focus()
    fireEvent.keyDown(alpha, { key: 'ArrowDown' })

    expect(getFolderTreeItem(/memo\.md/)).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('button', { name: /zeta\.md/ }), { metaKey: true })

    expect(screen.getByText('已选择 2 项')).toBeInTheDocument()
  })

  it('opens folder child actions from a context menu', async () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/diagram.png',
            uri: 'https://pod.example/public/diagram.png',
            name: 'diagram.png',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'image/png',
            size: 1024,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const childRow = () => within(screen.getByLabelText('Folder list view')).getByRole('button', { name: /diagram\.png/ })

    fireEvent.contextMenu(childRow())

    fireEvent.click(await screen.findByRole('menuitem', { name: '复制 URI' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://pod.example/public/diagram.png')

    fireEvent.contextMenu(childRow())
    fireEvent.click(await screen.findByRole('menuitem', { name: '重命名' }))
    await fillOperationSheet('新名称', 'diagram-renamed.png', '重命名')
    await waitFor(() => {
      expect(mockMoveFileResource).toHaveBeenCalledWith({
        sourceUri: 'https://pod.example/public/diagram.png',
        destinationUri: 'https://pod.example/public/diagram-renamed.png',
      })
    })

    fireEvent.contextMenu(childRow())
    fireEvent.click(await screen.findByRole('menuitem', { name: '移动到...' }))
    await fillOperationSheet('目标路径', 'archive/', '移动')
    await waitFor(() => {
      expect(mockMoveFileResource).toHaveBeenCalledWith({
        sourceUri: 'https://pod.example/public/diagram.png',
        destinationUri: 'https://pod.example/public/archive/diagram.png',
      })
    })

    fireEvent.contextMenu(childRow())
    fireEvent.click(await screen.findByRole('menuitem', { name: '打开' }))
    await waitFor(() => {
      expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/diagram.png')
    })
  })

  it('defers folder child context-menu selection until after Radix handles the menu event', async () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/alpha.md',
            uri: 'https://pod.example/public/alpha.md',
            name: 'alpha.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 100,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
          {
            id: 'https://pod.example/public/beta.md',
            uri: 'https://pod.example/public/beta.md',
            name: 'beta.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 200,
            modifiedAt: '2026-03-02T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const folderList = screen.getByLabelText('Folder list view')
    const alphaTreeItem = getFolderTreeItem(/alpha\.md/)
    const betaTreeItem = getFolderTreeItem(/beta\.md/)
    fireEvent.click(within(folderList).getByRole('button', { name: /alpha\.md/ }), { metaKey: true })
    expect(alphaTreeItem).toHaveAttribute('aria-selected', 'true')

    fireEvent.contextMenu(within(folderList).getByRole('button', { name: /beta\.md/ }))

    expect(alphaTreeItem).toHaveAttribute('aria-selected', 'true')
    expect(betaTreeItem).toHaveAttribute('aria-selected', 'false')
    fireEvent.click(await screen.findByRole('menuitem', { name: '复制 URI' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://pod.example/public/beta.md')
    await waitFor(() => {
      expect(betaTreeItem).toHaveAttribute('aria-selected', 'true')
    })

  })

  it('deletes a folder child from the context menu after confirmation', async () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/diagram.png',
            uri: 'https://pod.example/public/diagram.png',
            name: 'diagram.png',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'image/png',
            size: 1024,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.contextMenu(within(screen.getByLabelText('Folder list view')).getByRole('button', { name: /diagram\.png/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '删除' }))
    expect(await screen.findByText('删除“diagram.png”？')).toBeInTheDocument()
    await confirmOperationSheet('删除')

    await waitFor(() => {
      expect(mockDeleteFileResource).toHaveBeenCalledWith('https://pod.example/public/diagram.png')
    })
    expect(mockToast).toHaveBeenCalledWith({ description: '文件已删除' })
  })

  it('keeps a folder child when delete confirmation is cancelled', async () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/diagram.png',
            uri: 'https://pod.example/public/diagram.png',
            name: 'diagram.png',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'image/png',
            size: 1024,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.contextMenu(within(screen.getByLabelText('Folder list view')).getByRole('button', { name: /diagram\.png/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '删除' }))
    expect(await screen.findByText('删除“diagram.png”？')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(mockDeleteFileResource).not.toHaveBeenCalled()
  })

  it('supports multi-select batch actions in folder detail', async () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/alpha.md',
            uri: 'https://pod.example/public/alpha.md',
            name: 'alpha.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 100,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
          {
            id: 'https://pod.example/public/beta.md',
            uri: 'https://pod.example/public/beta.md',
            name: 'beta.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 200,
            modifiedAt: '2026-03-02T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: /alpha\.md/ }), { metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: /beta\.md/ }), { metaKey: true })

    expect(screen.getByText('已选择 2 项')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '复制所选 URI' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith([
      'https://pod.example/public/alpha.md',
      'https://pod.example/public/beta.md',
    ].join('\n'))

    fireEvent.click(screen.getByRole('button', { name: '删除所选项' }))
    expect(await screen.findByText('删除 2 项')).toBeInTheDocument()
    await confirmOperationSheet('删除')

    await waitFor(() => {
      expect(mockDeleteFileResource).toHaveBeenCalledTimes(2)
    })
    expect(mockDeleteFileResource).toHaveBeenNthCalledWith(1, 'https://pod.example/public/alpha.md')
    expect(mockDeleteFileResource).toHaveBeenNthCalledWith(2, 'https://pod.example/public/beta.md')
    expect(mockToast).toHaveBeenCalledWith({ description: '已删除 2 项' })
  })

  it('selects a contiguous folder child range with shift click', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/alpha.md',
            uri: 'https://pod.example/public/alpha.md',
            name: 'alpha.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 100,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
          {
            id: 'https://pod.example/public/beta.md',
            uri: 'https://pod.example/public/beta.md',
            name: 'beta.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 200,
            modifiedAt: '2026-03-02T10:00:00Z',
          },
          {
            id: 'https://pod.example/public/gamma.md',
            uri: 'https://pod.example/public/gamma.md',
            name: 'gamma.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 300,
            modifiedAt: '2026-03-03T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: /alpha\.md/ }), { metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: /gamma\.md/ }), { shiftKey: true })

    expect(screen.getByText('已选择 3 项')).toBeInTheDocument()
  })

  it('clears stale folder child selection when refreshed children no longer contain the selected uri', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    const alpha = {
      id: 'https://pod.example/public/alpha.md',
      uri: 'https://pod.example/public/alpha.md',
      name: 'alpha.md',
      kind: 'resource' as const,
      semanticKind: 'file' as const,
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 100,
      modifiedAt: '2026-03-01T10:00:00Z',
    }
    const beta = {
      id: 'https://pod.example/public/beta.md',
      uri: 'https://pod.example/public/beta.md',
      name: 'beta.md',
      kind: 'resource' as const,
      semanticKind: 'file' as const,
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 200,
      modifiedAt: '2026-03-02T10:00:00Z',
    }
    const mockFolder = (childEntries: typeof alpha[]) => {
      mockUseFileDetail.mockReturnValue({
        data: {
          id: 'https://pod.example/public/',
          uri: 'https://pod.example/public/',
          name: 'public',
          kind: 'container',
          semanticKind: 'container',
          parentUri: 'https://pod.example/',
          mimeType: 'inode/container',
          size: null,
          modifiedAt: null,
          headers: {},
          previewText: null,
          childEntries,
        },
        isLoading: false,
        error: null,
      })
    }
    mockFolder([alpha, beta])

    const { rerender } = render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: /alpha\.md/ }), { metaKey: true })
    expect(getFolderTreeItem(/alpha\.md/)).toHaveAttribute('aria-selected', 'true')

    mockFolder([beta])
    rerender(<FileDetailPane />)

    expect(screen.queryByRole('button', { name: /alpha\.md/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Folder child preview')).not.toBeInTheDocument()

    mockFolder([alpha, beta])
    rerender(<FileDetailPane />)

    expect(getFolderTreeItem(/alpha\.md/)).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByLabelText('Folder child preview')).not.toBeInTheDocument()
  })

  it('previews an editable child file and opens its sheet on explicit open', async () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/public/',
      editableFileSheetOpenRequestUri: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/README.md',
            uri: 'https://pod.example/public/README.md',
            name: 'README.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 1024,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)
    mockUseRawTextResource.mockClear()

    const readmeChild = screen.getByText('README.md').closest('button')!
    fireEvent.click(readmeChild, { metaKey: true })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
    expect(getFolderTreeItem(/README\.md/)).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('dialog', { name: 'Hello' })).not.toBeInTheDocument()

    expect(screen.queryByText('LinX full raw', { exact: false })).not.toBeInTheDocument()
    expect(mockUseRawTextResource.mock.calls).not.toContainEqual(['https://pod.example/public/README.md', true])
    fireEvent.contextMenu(readmeChild)
    expect(screen.getByRole('menuitem', { name: '打开' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '复制 URI' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: '打开' }))
    expect(await screen.findByRole('dialog', { name: 'Hello' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.doubleClick(readmeChild)

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeInTheDocument()
    expect(screen.getByTestId('rich-text-file-editor')).toBeInTheDocument()
    expect(screen.getByLabelText('文件 meta')).toBeInTheDocument()
  })

  it('opens an editable child file sheet with Enter after preview selection', () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/public/',
      editableFileSheetOpenRequestUri: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/README.md',
            uri: 'https://pod.example/public/README.md',
            name: 'README.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 1024,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)
    const readmeChild = within(screen.getByLabelText('Folder list view')).getByRole('button', { name: /README\.md/ })

    fireEvent.click(readmeChild, { metaKey: true })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
    expect(getFolderTreeItem(/README\.md/)).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('dialog', { name: 'Hello' })).not.toBeInTheDocument()

    fireEvent.keyDown(readmeChild, { key: 'Enter' })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
    expect(screen.getByRole('dialog', { name: 'Hello' })).toHaveAttribute('data-document-editor-modal', 'true')
    expect(screen.getByTestId('rich-text-file-editor')).toBeInTheDocument()
  })

  it('keeps ordinary editable file meta tail from duplicating Access ACL and ACR permission summaries', () => {
    requestDefaultEditableFileSheetOpen()
    mockUseFilesMetaSidecar.mockReturnValue({
      data: {
        ownerUri: 'https://pod.example/public/README.md',
        metaUri: 'https://pod.example/public/README.md.meta',
        state: 'exists',
        status: 200,
        content: [
          '@prefix acl: <http://www.w3.org/ns/auth/acl#> .',
          '@prefix acr: <https://w3id.org/solid/acp#> .',
          '<#meta> acl:accessTo <README.md> ; acl:mode acl:Read, acl:Write ; acr:accessControl <README.md.acr> .',
          '<#public> acl:agentClass acl:AuthenticatedAgent ; acl:mode acl:Read .',
        ].join('\n'),
        mimeType: 'text/turtle',
        etag: '"meta-access-1"',
        size: 256,
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const editorSheet = screen.getByRole('dialog', { name: 'Hello' })
    const metaTail = within(editorSheet).getByLabelText('文件 meta')
    expect(within(metaTail).queryByText('访问权限')).not.toBeInTheDocument()
    expect(within(metaTail).queryByText('你：可查看、可追加、可管理权限')).not.toBeInTheDocument()
    expect(within(metaTail).queryByText('公开访问：可查看')).not.toBeInTheDocument()
    expect(within(metaTail).queryByText(/acl:mode acl:Read/)).not.toBeInTheDocument()
    expect(within(metaTail).queryByText(/acr:accessControl/)).not.toBeInTheDocument()
    fireEvent.pointerDown(within(editorSheet).getByRole('button', { name: '更多文件操作' }))
    expect(screen.getByRole('menuitem', { name: '查看 Access 来源' })).toBeInTheDocument()
  })

  it('previews structured child resources from folder rows and opens them on explicit open', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/state.ttl',
            uri: 'https://pod.example/public/state.ttl',
            name: 'state.ttl',
            kind: 'resource',
            semanticKind: 'structured-data',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/turtle',
            size: 1024,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const stateChild = screen.getByText('state.ttl').closest('button')!
    fireEvent.click(stateChild, { metaKey: true })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
    expect(getFolderTreeItem(/state\.ttl/)).toHaveAttribute('aria-selected', 'true')

    fireEvent.doubleClick(stateChild)

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/state.ttl')
    expect(useFilesStore.getState().detailTab).toBe('preview')
  })

  it('keeps folder icon view tiles Finder-like while previewing children', () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/public/',
      editableFileSheetOpenRequestUri: null,
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/state.ttl',
            uri: 'https://pod.example/public/state.ttl',
            name: 'state.ttl',
            kind: 'resource',
            semanticKind: 'structured-data',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/turtle',
            size: 1024,
            modifiedAt: '2026-03-01T10:00:00Z',
            summary: 'Structured state graph.',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: '网格' }))
    const iconView = screen.getByLabelText('Folder icon view')
    const stateTile = within(iconView).getByRole('button', { name: 'state.ttl' })

    expect(within(stateTile).getByText('state.ttl')).toBeInTheDocument()
    expect(within(stateTile).queryByText('Structured state graph.')).not.toBeInTheDocument()
    expect(within(stateTile).queryByText('text/turtle')).not.toBeInTheDocument()
    expect(within(stateTile).queryByText('结构化数据')).not.toBeInTheDocument()
    expect(within(stateTile).queryByText('1.0 KB')).not.toBeInTheDocument()
    expect(within(stateTile).queryByText('2026/3/1 18:00:00')).not.toBeInTheDocument()
    expect(within(stateTile).queryByRole('button')).not.toBeInTheDocument()

    fireEvent.click(stateTile, { metaKey: true })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
    expect(stateTile).toHaveClass('bg-primary/10')

    fireEvent.doubleClick(stateTile)

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/state.ttl')
    expect(useFilesStore.getState().detailTab).toBe('preview')

    act(() => {
      useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    })
    fireEvent.click(screen.getByRole('button', { name: '网格' }))
    const resetIconView = screen.getByLabelText('Folder icon view')
    const resetStateTile = within(resetIconView).getByRole('button', { name: 'state.ttl' })
    fireEvent.keyDown(resetStateTile, { key: 'Enter' })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/state.ttl')
    expect(useFilesStore.getState().detailTab).toBe('preview')
  })

  it('keeps Space selection and opens folder children with Enter', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/README.md',
            uri: 'https://pod.example/public/README.md',
            name: 'README.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 1024,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const child = screen.getByText('README.md').closest('button')!
    fireEvent.click(child, { metaKey: true })
    expect(screen.queryByRole('dialog', { name: 'Hello' })).not.toBeInTheDocument()

    fireEvent.keyDown(child, { key: ' ' })

    expect(screen.queryByRole('dialog', { name: 'Hello' })).not.toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
    expect(getFolderTreeItem(/README\.md/)).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(child, { key: 'Enter' })

    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
  })

  it('opens child containers from the folder tree row', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/docs/',
            uri: 'https://pod.example/public/docs/',
            name: 'docs',
            kind: 'container',
            semanticKind: 'container',
            parentUri: 'https://pod.example/public/',
            mimeType: 'inode/container',
            size: null,
            modifiedAt: null,
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    const child = screen.getByText('docs').closest('button')!
    fireEvent.doubleClick(child)

    expect(useFilesStore.getState().selectedTreeNodeId).toBe('container:https://pod.example/public/docs/')
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/docs/')
  })

  it('opens readonly child resources from the folder tree row', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/diagram.png',
            uri: 'https://pod.example/public/diagram.png',
            name: 'diagram.png',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'image/png',
            size: 1024,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.doubleClick(screen.getByText('diagram.png').closest('button')!)

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/diagram.png')
    expect(useFilesStore.getState().detailTab).toBe('preview')
  })

  it('copies the selected folder child uri from the row context menu', async () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/README.md',
            uri: 'https://pod.example/public/README.md',
            name: 'README.md',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'text/markdown',
            size: 1024,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    fireEvent.contextMenu(screen.getByText('README.md').closest('button')!)
    fireEvent.click(await screen.findByRole('menuitem', { name: '复制 URI' }))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://pod.example/public/README.md')
    expect(screen.queryByRole('dialog', { name: 'Hello' })).not.toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/')
  })

  it('opens .meta for the selected folder child without changing folder selection or Access target', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFilesMetaSidecar.mockImplementation((target) => {
      const uri = (target as { uri?: string } | null)?.uri ?? 'https://pod.example/public/'
      const isChild = uri === 'https://pod.example/public/diagram.png'
      return {
        data: {
          ownerUri: uri,
          metaUri: isChild
            ? 'https://pod.example/public/diagram.png.meta'
            : 'https://pod.example/public/.meta',
          state: 'exists',
          status: 200,
          content: isChild
            ? '<#meta> <#summary> "Diagram metadata" .'
            : '<#container> <#summary> "Folder metadata" .',
          mimeType: 'text/turtle',
          etag: isChild ? '"diagram-meta-1"' : '"folder-meta-1"',
          size: isChild ? 58 : 42,
        },
        isLoading: false,
        error: null,
      }
    })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/diagram.png',
            uri: 'https://pod.example/public/diagram.png',
            name: 'diagram.png',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'image/png',
            size: 1024,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })
    const folderQuery = mockUseFileDetail()
    const diagram = folderQuery.data.childEntries[0]
    mockUseFileDetail.mockImplementation((uri: string | null) => uri === diagram.uri
      ? { data: { ...diagram, headers: {}, previewText: null }, isLoading: false, error: null }
      : folderQuery)

    render(<FileDetailPane />)

    fireEvent.doubleClick(screen.getByText('diagram.png').closest('button')!)
    const detailHead = screen.getByLabelText('文件详情 head')
    expect(within(detailHead).queryByRole('button', { name: '查看 .meta' })).not.toBeInTheDocument()

    const metaCallStart = mockUseFilesMetaSidecar.mock.calls.length
    openHeaderMetaDrawer()

    const drawer = screen.getByLabelText('Resource .meta inspector')
    const openedMetaTargets = mockUseFilesMetaSidecar.mock.calls
      .slice(metaCallStart)
      .filter(([, enabled]) => enabled === true)
      .map(([target]) => (target as { uri?: string } | null)?.uri)
    expect(openedMetaTargets).toContain('https://pod.example/public/diagram.png')
    expect(openedMetaTargets).not.toContain('https://pod.example/public/')
    expect(within(drawer).getByText('https://pod.example/public/diagram.png.meta')).toBeInTheDocument()
    expect(within(drawer).getByText('<#meta> <#summary> "Diagram metadata" .')).toBeInTheDocument()
    expect(within(drawer).queryByText('https://pod.example/public/.meta')).not.toBeInTheDocument()
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/diagram.png')

    fireEvent.click(screen.getByRole('button', { name: '关闭 .meta inspector' }))
    openHeaderAccessDialog()

    expect(mockUseFilesAccessBasics).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'https://pod.example/public/diagram.png',
      kind: 'resource',
    }), true)
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/diagram.png')
  })

  it('opens Access for the selected folder child without changing folder selection', () => {
    useFilesStore.setState({ selectedFileId: 'https://pod.example/public/' })
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/',
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        parentUri: 'https://pod.example/',
        mimeType: 'inode/container',
        size: null,
        modifiedAt: null,
        headers: {},
        previewText: null,
        childEntries: [
          {
            id: 'https://pod.example/public/diagram.png',
            uri: 'https://pod.example/public/diagram.png',
            name: 'diagram.png',
            kind: 'resource',
            semanticKind: 'file',
            parentUri: 'https://pod.example/public/',
            mimeType: 'image/png',
            size: 1024,
            modifiedAt: '2026-03-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    })
    const folderQuery = mockUseFileDetail()
    const diagram = folderQuery.data.childEntries[0]
    mockUseFileDetail.mockImplementation((uri: string | null) => uri === diagram.uri
      ? { data: { ...diagram, headers: {}, previewText: null }, isLoading: false, error: null }
      : folderQuery)

    render(<FileDetailPane />)

    fireEvent.doubleClick(screen.getByText('diagram.png').closest('button')!)
    const detailHead = screen.getByLabelText('文件详情 head')
    expect(within(detailHead).queryByRole('button', { name: '查看 Access 来源' })).not.toBeInTheDocument()
    expect(within(detailHead).queryByRole('button', { name: '查看 .meta' })).not.toBeInTheDocument()
    openHeaderAccessDialog()

    const accessDialog = screen.getByRole('dialog', { name: '权限' })
    expect(within(accessDialog).getByText('https://pod.example/public/diagram.png')).toBeInTheDocument()
    expect(within(accessDialog).getByText('https://pod.example/public/diagram.png.acr')).toBeInTheDocument()
    expect(within(accessDialog).getByText('https://pod.example/public/diagram.png.acl')).toBeInTheDocument()
    expect(mockUseFilesAccessBasics).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'https://pod.example/public/diagram.png',
      kind: 'resource',
    }), true)
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/diagram.png')
  })

  it('renders sidecar ownership detail', () => {
    mockUseFileDetail.mockReturnValue({
      data: {
        id: 'https://pod.example/public/.acr',
        uri: 'https://pod.example/public/.acr',
        name: '.acr',
        kind: 'resource',
        semanticKind: 'access-policy-sidecar',
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/turtle',
        size: 512,
        modifiedAt: '2026-03-01T10:00:00Z',
        headers: {},
        previewText: '<#owner> <#mode> "Read" .',
      },
      isLoading: false,
      error: null,
    })

    render(<FileDetailPane />)

    expect(screen.getByText('ACL/ACR sidecar')).toBeInTheDocument()
    expect(screen.queryByText(/生产路径|普通业务文件编辑/)).not.toBeInTheDocument()
    expect(screen.getByText('owner')).toBeInTheDocument()
    expect(screen.getAllByText('https://pod.example/public/').length).toBeGreaterThan(0)
    expect(screen.getByText('acr')).toBeInTheDocument()
    expect(screen.getByText('权限策略通过 Access 查看。')).toBeInTheDocument()
    expect(within(screen.getByLabelText('文件详情 head')).queryByRole('button', { name: '查看 Access 来源' })).not.toBeInTheDocument()
    openResourceActionsMenu()
    expect(screen.getByRole('menuitem', { name: '查看 Access 来源' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('<#owner> <#mode> "Read" .')).not.toBeInTheDocument()

    openHeaderMetaDrawer()

    expect(mockUseFilesMetaSidecar).toHaveBeenCalledWith({
      uri: 'https://pod.example/public/',
      kind: 'container',
    }, true)

    fireEvent.click(screen.getByRole('button', { name: '关闭 .meta inspector' }))
    openHeaderAccessDialog()

    const accessDialog = screen.getByRole('dialog', { name: '权限' })
    expect(within(accessDialog).getByText('https://pod.example/public/')).toBeInTheDocument()
    expect(mockUseFilesAccessBasics).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'https://pod.example/public/',
      kind: 'container',
    }), true)
  })
})
