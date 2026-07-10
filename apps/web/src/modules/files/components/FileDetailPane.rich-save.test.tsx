import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useFilesStore } from '../app/store'
import { createSourceUpdateProposal, renderSourceUpdateProposalTurtle } from '../source-approval'

const mockUseFileDetail = vi.fn()
const mockUseFilesAccessBasics = vi.fn()
const mockUseFilesMetaSidecar = vi.fn()
const mockUseRawTextResource = vi.fn()
const mockUseSaveRawTextResource = vi.fn()
const mockUseCreateAiChangeProposal = vi.fn()
const mockUseCreateAccessPolicyProposal = vi.fn()
const mockUseCreateSourceUpdateProposal = vi.fn()
const mockUseRefreshSourceLinkedCard = vi.fn()
const mockUseRequestSourceIngestRange = vi.fn()
const mockUseCreateStructuredCellChangeProposal = vi.fn()
const mockUsePendingStructuredCellChangeProposals = vi.fn()
const mockUsePendingSourceUpdateProposals = vi.fn()
const mockUsePendingAccessPolicyProposals = vi.fn()
const mockUseFilesVocabRegistryDiscovery = vi.fn()
const mockUseFilesCurrentPodRootUri = vi.fn()
const mockUseApprovalByTarget = vi.fn()
const mockUseResolveInboxApproval = vi.fn()
const mockUseFavoriteList = vi.fn()
const mockOnStarredChange = vi.fn()
const mockMutateRaw = vi.fn()
const mockMutateAiChange = vi.fn()
const mockMutateSourceUpdate = vi.fn()
const mockResolveInboxApproval = vi.fn()
const mockToast = vi.fn()

vi.mock('../data/queries', () => ({
  useFileDetail: () => mockUseFileDetail(),
  useFilesFavoriteList: () => mockUseFavoriteList(),
  filesFavoriteHooks: {
    onStarredChange: (...args: unknown[]) => mockOnStarredChange(...args),
  },
  useFilesAccessBasics: (...args: unknown[]) => mockUseFilesAccessBasics(...args),
  useFilesMetaSidecar: (...args: unknown[]) => mockUseFilesMetaSidecar(...args),
  useRawTextResource: (...args: unknown[]) => mockUseRawTextResource(...args),
  useSaveRawTextResource: () => mockUseSaveRawTextResource(),
  useCreateAiChangeProposal: () => mockUseCreateAiChangeProposal(),
  useCreateAccessPolicyProposal: () => mockUseCreateAccessPolicyProposal(),
  useCreateSourceUpdateProposal: () => mockUseCreateSourceUpdateProposal(),
  useRefreshSourceLinkedCard: () => mockUseRefreshSourceLinkedCard(),
  useRequestSourceIngestRange: () => mockUseRequestSourceIngestRange(),
  useCreateStructuredCellChangeProposal: () => mockUseCreateStructuredCellChangeProposal(),
  usePendingStructuredCellChangeProposals: (...args: unknown[]) => mockUsePendingStructuredCellChangeProposals(...args),
  usePendingSourceUpdateProposals: (...args: unknown[]) => mockUsePendingSourceUpdateProposals(...args),
  usePendingAccessPolicyProposals: (...args: unknown[]) => mockUsePendingAccessPolicyProposals(...args),
  useFilesApprovalByTarget: (...args: unknown[]) => mockUseApprovalByTarget(...args),
  useResolveFilesInboxApproval: () => mockUseResolveInboxApproval(),
  useFilesCurrentPodRootUri: () => mockUseFilesCurrentPodRootUri(),
  useFilesVocabRegistryDiscovery: (...args: unknown[]) => mockUseFilesVocabRegistryDiscovery(...args),
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

vi.mock('../ui/RichTextFileEditor', () => ({
  RichTextFileEditor: ({
    content,
    onSaveText,
    onSubmitProposal,
    editable = false,
    proposalLabel = 'AI 修改审批',
  }: {
    content: { text?: string | null }
    onSaveText?: (content: string) => void
    onSubmitProposal?: (content: string, documentSummary: { title: string | null; links: string[] }) => void
    editable?: boolean
    proposalLabel?: string
  }) => {
    const visibleText = (content.text ?? '')
      .split('\n')
      .filter((line) => !/^\s*<!--\s*\/?linx-source-(?:block|conflict)\b[^>]*-->\s*$/.test(line))
      .join('\n')
      .trim()
    const heading = visibleText.match(/^#\s+(.+)$/m)?.[1] ?? null
    const body = visibleText
      .replace(/^#\s+.+$/m, '')
      .trim()

    return (
      <div data-testid="rich-text-file-editor">
        {heading ? <h1>{heading}</h1> : null}
        {body ? <p>{body}</p> : null}
        {editable ? (
          <>
            <button type="button" onClick={() => onSaveText?.('# Project note\n\n- first\n- second')}>
              保存富文本 Markdown
            </button>
            <button
              type="button"
              onClick={() => onSubmitProposal?.('# AI candidate\n\n- serialized rich draft', {
                title: 'AI candidate',
                links: ['https://source.example/report.pdf'],
              })}
            >
              提交富文本 {proposalLabel}
            </button>
            <span>{onSaveText ? 'rich-save-enabled' : 'rich-save-disabled'}</span>
          </>
        ) : null}
      </div>
    )
  },
}))

const { FileDetailPane } = await import('./FileDetailPane')

function switchEditorToRawSource(scope: typeof screen | ReturnType<typeof within> = screen) {
  fireEvent.pointerDown(scope.getByRole('button', { name: '更多文件操作' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '源码' }))
}

function mockFileDetail(mimeType = 'text/markdown') {
  mockUseFileDetail.mockReturnValue({
    data: {
      id: 'https://pod.example/public/README.md',
      uri: 'https://pod.example/public/README.md',
      name: 'README.md',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/',
      mimeType,
      size: 1024,
      modifiedAt: '2026-03-01T10:00:00Z',
      headers: {},
      previewText: '# Hello\nLinX',
    },
    isLoading: false,
    error: null,
  })
  mockUseRawTextResource.mockReturnValue({
    data: {
      uri: 'https://pod.example/public/README.md',
      content: '# Hello\nLinX full raw',
      mimeType,
      etag: '"raw-1"',
      headers: { etag: '"raw-1"', 'content-type': mimeType },
    },
    isLoading: false,
    error: null,
  })
}

function mockSourceLinkedCardDetail() {
  const proposal = createSourceUpdateProposal({
    documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
    subject: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl#card',
    targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report-body.md',
    sourceUri: 'https://source.example/report.pdf',
    parserManifestUri: 'https://pod.example/.data/index/sources/report/manifest.ttl',
    parserVersion: 'pdf-parser-v1',
    sourceHash: 'sha256-report',
    proposedContent: '# Quarterly report\n\nIngest staged body.',
    createdAt: '2026-03-01T10:00:00.000Z',
  })
  const source = [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '',
    '<#card> a udfs:SourceLinkedCard ;',
    '  rdfs:label "Quarterly report" ;',
    '  dcterms:source <https://source.example/report.pdf> ;',
    '  dcterms:format "application/pdf" ;',
    '  udfs:sourceKind "pdf" ;',
    '  udfs:sourceHash "sha256-report" ;',
    '  udfs:parserVersion "pdf-parser-v1" ;',
    '  udfs:parserManifest <https://pod.example/.data/index/sources/report/manifest.ttl> ;',
    '  udfs:bodyResource <https://pod.example/.data/workspaces/ws-1/cards/quarterly-report-body.md> ;',
    '  dcterms:created "2026-03-01T10:00:00Z" ;',
    '  udfs:writesCanonicalContent false .',
  ].join('\n')

  mockUseFileDetail.mockReturnValue({
    data: {
      id: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      uri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      name: 'quarterly-report.card.ttl',
      kind: 'resource',
      semanticKind: 'source-linked-card',
      parentUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
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
    data: null,
    isLoading: false,
    error: null,
  })
  mockUsePendingSourceUpdateProposals.mockReturnValue({
    data: [proposal],
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
          etag: '"proposal-1"',
          headers: { etag: '"proposal-1"', 'content-type': 'text/turtle' },
        },
        isLoading: false,
        error: null,
      }
    }
    if (uri === 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report-body.md') {
      return {
        data: {
          uri,
          content: '# Quarterly report\n\nIngest draft body.',
          mimeType: 'text/markdown',
          etag: '"body-1"',
          headers: { etag: '"body-1"', 'content-type': 'text/markdown' },
        },
        isLoading: false,
        error: null,
      }
    }
    return {
      data: {
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
        content: source,
        mimeType: 'text/turtle',
        etag: '"card-1"',
        headers: { etag: '"card-1"', 'content-type': 'text/turtle' },
      },
      isLoading: false,
      error: null,
    }
  })
  mockUseFilesMetaSidecar.mockReturnValue({
    data: {
      ownerUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      metaUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl.meta',
      state: 'exists',
      status: 200,
      content: '<#meta> <#summary> "Ingest review metadata" .',
      mimeType: 'text/turtle',
      etag: '"card-meta-1"',
      size: 42,
    },
    isLoading: false,
    error: null,
  })
}

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
    editableFileSheetOpenRequestUri: 'https://pod.example/public/README.md',
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
  mockFileDetail()
  mockUseFavoriteList.mockReturnValue({ data: [] })
  mockUseFilesAccessBasics.mockReturnValue({ data: null, isLoading: false, error: null })
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
  mockMutateRaw.mockResolvedValue({
    uri: 'https://pod.example/public/README.md',
    content: '# Project note\n\n- first\n- second',
    mimeType: 'text/markdown',
    etag: '"raw-2"',
    headers: { etag: '"raw-2"', 'content-type': 'text/markdown' },
  })
  mockUseSaveRawTextResource.mockReturnValue({
    mutateAsync: mockMutateRaw,
    isPending: false,
  })
  mockMutateAiChange.mockResolvedValue('https://pod.example/.data/approvals/ai-change.ttl#approval')
  mockUseCreateAiChangeProposal.mockReturnValue({
    mutateAsync: mockMutateAiChange,
    isPending: false,
  })
  mockUseApprovalByTarget.mockReturnValue({ data: null, isLoading: false, error: null })
  mockResolveInboxApproval.mockResolvedValue(undefined)
  mockUseResolveInboxApproval.mockReturnValue({
    mutateAsync: mockResolveInboxApproval,
    isPending: false,
  })
  mockUseCreateAccessPolicyProposal.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  })
  mockUseCreateSourceUpdateProposal.mockReturnValue({
    mutateAsync: mockMutateSourceUpdate,
    isPending: false,
  })
  mockUseRefreshSourceLinkedCard.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  })
  mockUseRequestSourceIngestRange.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  })
  mockUseCreateStructuredCellChangeProposal.mockReturnValue({
    mutateAsync: vi.fn(),
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
  mockMutateRaw.mockClear()
  mockMutateAiChange.mockClear()
  mockMutateSourceUpdate.mockResolvedValue('https://pod.example/.data/approvals/source-update.ttl#approval')
  mockMutateSourceUpdate.mockClear()
  mockToast.mockClear()
})

describe('FileDetailPane rich text save wiring', () => {
  it('saves serialized markdown from the rich editor through the raw resource mutation', () => {
    render(<FileDetailPane />)

    expect(screen.getByText('rich-save-enabled')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存富文本 Markdown' }))

    expect(mockMutateRaw).toHaveBeenCalledWith({
      resource: expect.objectContaining({
        uri: 'https://pod.example/public/README.md',
        mimeType: 'text/markdown',
        etag: '"raw-1"',
      }),
      content: '# Project note\n\n- first\n- second',
    })
  })

  it('does not enable rich save for non-markdown raw resources', () => {
    mockFileDetail('application/json')

    render(<FileDetailPane />)

    expect(screen.queryByTestId('rich-text-file-editor')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '富文本' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('原始内容')).toBeInTheDocument()

    expect(mockMutateRaw).not.toHaveBeenCalled()
  })

  it('submits a dirty raw draft as an AI change proposal without saving canonical content', async () => {
    render(<FileDetailPane />)

    switchEditorToRawSource()
    fireEvent.change(screen.getByLabelText('原始内容'), {
      target: { value: '# AI candidate\n\nReview before writing.' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交 AI 修改审批' }))

    await vi.waitFor(() => expect(mockMutateAiChange).toHaveBeenCalledTimes(1))
    expect(mockMutateAiChange).toHaveBeenCalledWith(expect.objectContaining({
      targetResourceUri: 'https://pod.example/public/README.md',
      documentUri: null,
      subject: 'https://pod.example/public/README.md',
      operation: 'replace-content',
      proposedContent: '# AI candidate\n\nReview before writing.',
      writesCanonicalContent: false,
    }))
    expect(mockMutateRaw).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith({ description: 'AI 修改审批已提交' })
  })

  it('submits a dirty rich text draft as an AI change proposal without saving canonical content', async () => {
    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: '提交富文本 AI 修改审批' }))

    await vi.waitFor(() => expect(mockMutateAiChange).toHaveBeenCalledTimes(1))
    expect(mockMutateAiChange).toHaveBeenCalledWith(expect.objectContaining({
      targetResourceUri: 'https://pod.example/public/README.md',
      documentUri: null,
      subject: 'https://pod.example/public/README.md',
      operation: 'replace-content',
      proposedContent: '# AI candidate\n\n- serialized rich draft',
      writesCanonicalContent: false,
    }))
    expect(mockMutateRaw).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith({ description: 'AI 修改审批已提交' })
  })

  it('renders source-linked cards as body-first previews and submits rich drafts through proposals only', async () => {
    mockSourceLinkedCardDetail()

    render(<FileDetailPane />)

    expect(screen.queryByRole('dialog', { name: 'Quarterly report' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Quarterly report' })).toBeInTheDocument()
    expect(screen.getByText(/Ingest draft body/)).toBeInTheDocument()
    expect(screen.queryByText(/Ingest staged body/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('文件 meta')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '编辑正文' }))
    const editorDialog = screen.getByRole('dialog', { name: 'Quarterly report' })
    expect(editorDialog).toBeInTheDocument()
    expect(within(editorDialog).getByTestId('rich-text-file-editor')).toBeInTheDocument()
    expect(screen.getByText('rich-save-disabled')).toBeInTheDocument()
    expect(screen.getAllByText('Source').length).toBeGreaterThan(0)
    expect(screen.getAllByText('https://source.example/report.pdf').length).toBeGreaterThan(0)
    const metaTails = screen.getAllByLabelText('文件 meta')
    expect(metaTails).toHaveLength(1)
    expect(within(editorDialog).getByLabelText('文件 meta')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '提交富文本 Ingest 审批' }))

    await vi.waitFor(() => expect(mockMutateSourceUpdate).toHaveBeenCalledTimes(1))
    expect(mockMutateSourceUpdate).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'source-update-proposal',
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      subject: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report-body.md',
      sourceUri: 'https://source.example/report.pdf',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/report/manifest.ttl',
      ingestVersion: 'pdf-parser-v1',
      sourceHash: 'sha256-report',
      operation: 'replace-blocks',
      proposedContent: '# AI candidate\n\n- serialized rich draft',
      summary: '审阅 Quarterly report 的本地编辑。',
      diff: '本地富文本草稿与 https://source.example/report.pdf 不一致。',
      cardMetadata: {
        title: 'AI candidate',
        links: ['https://source.example/report.pdf'],
      },
      writesCanonicalContent: false,
    }))
    expect(mockMutateAiChange).not.toHaveBeenCalled()
    expect(mockMutateRaw).not.toHaveBeenCalled()
  })

  it('uses staged source proposal content when the source-linked card body resource is missing', async () => {
    mockSourceLinkedCardDetail()
    const sourceProposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      subject: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report-body.md',
      sourceUri: 'https://source.example/report.pdf',
      parserManifestUri: 'https://pod.example/.data/index/sources/report/manifest.ttl',
      parserVersion: 'pdf-parser-v1',
      sourceHash: 'sha256-report',
      proposedContent: '# Quarterly report\n\nIngest staged body.',
    })
    mockUsePendingSourceUpdateProposals.mockReturnValue({
      data: [sourceProposal],
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri === 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report-body.md') {
        return { data: null, isLoading: false, error: new Error('HTTP 404') }
      }
      return {
        data: {
          uri,
          content: '@prefix udfs: <https://undefineds.co/vocab/> .',
          mimeType: uri.endsWith('.ttl') ? 'text/turtle' : 'text/markdown',
          etag: '"fallback-1"',
          headers: { etag: '"fallback-1"' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    expect(screen.queryByRole('dialog', { name: 'Quarterly report' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Quarterly report' })).toBeInTheDocument()
    expect(screen.getByText(/Ingest staged body/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '编辑正文' }))
    const editorDialog = screen.getByRole('dialog', { name: 'Quarterly report' })
    expect(editorDialog).toBeInTheDocument()
    expect(within(editorDialog).getByTestId('rich-text-file-editor')).toBeInTheDocument()
    expect(screen.queryByText('完整内容暂时不可用，不能进入编辑。')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '提交富文本 Ingest 审批' }))

    await vi.waitFor(() => expect(mockMutateSourceUpdate).toHaveBeenCalledTimes(1))
    expect(mockMutateSourceUpdate).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'source-update-proposal',
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      subject: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report-body.md',
      sourceUri: 'https://source.example/report.pdf',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/report/manifest.ttl',
      ingestVersion: 'pdf-parser-v1',
      sourceHash: 'sha256-report',
      operation: 'replace-blocks',
      proposedContent: '# AI candidate\n\n- serialized rich draft',
      summary: '审阅 Quarterly report 的本地编辑。',
      diff: '本地富文本草稿与 https://source.example/report.pdf 不一致。',
      writesCanonicalContent: false,
    }))
    expect(mockMutateAiChange).not.toHaveBeenCalled()
    expect(mockMutateRaw).not.toHaveBeenCalled()
  })

  it('submits raw source edits from staged Ingest content when the source-linked body is missing', async () => {
    mockSourceLinkedCardDetail()
    const sourceProposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      subject: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report-body.md',
      sourceUri: 'https://source.example/report.pdf',
      parserManifestUri: 'https://pod.example/.data/index/sources/report/manifest.ttl',
      parserVersion: 'pdf-parser-v1',
      sourceHash: 'sha256-report',
      proposedContent: '# Quarterly report\n\nIngest staged body.',
    })
    mockUsePendingSourceUpdateProposals.mockReturnValue({
      data: [sourceProposal],
      isLoading: false,
      error: null,
    })
    mockUseRawTextResource.mockImplementation((uri: string) => {
      if (uri === 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report-body.md') {
        return { data: null, isLoading: false, error: new Error('HTTP 404') }
      }
      return {
        data: {
          uri,
          content: '@prefix udfs: <https://undefineds.co/vocab/> .',
          mimeType: uri.endsWith('.ttl') ? 'text/turtle' : 'text/markdown',
          etag: '"fallback-1"',
          headers: { etag: '"fallback-1"' },
        },
        isLoading: false,
        error: null,
      }
    })

    render(<FileDetailPane />)

    fireEvent.click(screen.getByRole('button', { name: '编辑正文' }))
    const editorDialog = screen.getByRole('dialog', { name: 'Quarterly report' })
    switchEditorToRawSource(within(editorDialog))
    const rawEditor = within(editorDialog).getByLabelText('原始内容')
    expect(rawEditor).toHaveValue('# Quarterly report\n\nIngest staged body.')
    fireEvent.change(rawEditor, {
      target: { value: '# Quarterly report\n\nReviewed staged body.' },
    })
    fireEvent.click(within(editorDialog).getByRole('button', { name: '提交 Ingest 审批' }))

    await vi.waitFor(() => expect(mockMutateSourceUpdate).toHaveBeenCalledTimes(1))
    expect(mockMutateSourceUpdate).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'source-update-proposal',
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl',
      subject: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report.card.ttl#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/quarterly-report-body.md',
      sourceUri: 'https://source.example/report.pdf',
      sourceIngestManifestUri: 'https://pod.example/.data/index/sources/report/manifest.ttl',
      ingestVersion: 'pdf-parser-v1',
      sourceHash: 'sha256-report',
      operation: 'replace-blocks',
      proposedContent: '# Quarterly report\n\nReviewed staged body.',
      summary: '审阅 Quarterly report 的本地编辑。',
      diff: '本地富文本草稿与 https://source.example/report.pdf 不一致。',
      writesCanonicalContent: false,
    }))
    expect(mockMutateAiChange).not.toHaveBeenCalled()
    expect(mockMutateRaw).not.toHaveBeenCalled()
  })
})
