import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { approvalResource } from '@undefineds.co/models'
import {
  FILES_COLLECTION_QUERY_KEYS,
  accessPolicyProposalCollection,
  aiChangeProposalCollection,
  filesOps,
  filesResourceCollection,
  filesResourceMutationCollection,
  filesResourceQueryCollection,
  filesSidecarQueryCollection,
  filesVocabDiscoveryQueryCollection,
  filesVocabDiscoveryCollection,
  initializeFilesCollections,
  sourceIngestCollection,
  sourceUpdateProposalCollection,
  structuredCellProposalCollection,
  vocabTermProposalCollection,
} from './collections'
import {
  createAccessPolicyProposal,
  renderAccessPolicyProposalTurtle,
} from './access-approval'
import {
  createAiChangeProposal,
  renderAiChangeProposalTurtle,
} from './ai-change-approval'
import {
  createSourceUpdateProposal,
  renderSourceUpdateProposalTurtle,
} from './source-approval'
import {
  createSourceIngestPlan,
  createSourceRefreshPlan,
} from './domain/source/source-ingest'
import {
  createSourceIngestManifest,
  renderSourceIngestManifestTurtle,
} from './domain/source/source-ingest-manifest'
import {
  createStructuredCellChangeProposal,
  renderStructuredCellChangeProposalTurtle,
} from './structured-cell-approval'
import { createVocabTermProposal, renderVocabTermProposalTurtle } from './structured-table'

const mocks = vi.hoisted(() => ({
  buildRootNodes: vi.fn(),
  listContainerChildNodes: vi.fn(),
  listAllBrowsableEntries: vi.fn(),
  listContainerEntries: vi.fn(),
  readFileDetail: vi.fn(),
  readBlobResource: vi.fn(),
  readFilesAccessBasics: vi.fn(),
  readFilesMetaSidecar: vi.fn(),
  readStructuredViewMetadata: vi.fn(),
  saveStructuredViewMetadata: vi.fn(),
  saveRawTextResource: vi.fn(),
  createRawTextResource: vi.fn(),
  createBlobResource: vi.fn(),
  copyFileResource: vi.fn(),
  moveFileResource: vi.fn(),
  deleteFileResource: vi.fn(),
  createFolderResource: vi.fn(),
  getParentContainerUri: vi.fn(),
  readRawTextResource: vi.fn(),
  fetchApprovals: vi.fn(),
  invalidateQueries: vi.fn(),
  approveVocabTermProposalCanonical: vi.fn(),
  createAccessPolicyProposalInboxApproval: vi.fn(),
  createAiChangeProposalInboxApproval: vi.fn(),
  createSourceUpdateProposalInboxApproval: vi.fn(),
  createStructuredCellChangeProposalInboxApproval: vi.fn(),
  createVocabTermProposalInboxApproval: vi.fn(),
  ensureSourceIngestManifestResource: vi.fn(),
  markSourceIngestRangeIngestedResource: vi.fn(),
}))

vi.mock('./data/pod-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/pod-adapter')>()
  return {
    ...actual,
    buildRootNodes: mocks.buildRootNodes,
    listContainerChildNodes: mocks.listContainerChildNodes,
    listAllBrowsableEntries: mocks.listAllBrowsableEntries,
    listContainerEntries: mocks.listContainerEntries,
    readFileDetail: mocks.readFileDetail,
    readBlobResource: mocks.readBlobResource,
    readFilesAccessBasics: mocks.readFilesAccessBasics,
    readFilesMetaSidecar: mocks.readFilesMetaSidecar,
    readStructuredViewMetadata: mocks.readStructuredViewMetadata,
    saveStructuredViewMetadata: mocks.saveStructuredViewMetadata,
    saveRawTextResource: mocks.saveRawTextResource,
    createRawTextResource: mocks.createRawTextResource,
    createBlobResource: mocks.createBlobResource,
    copyFileResource: mocks.copyFileResource,
    moveFileResource: mocks.moveFileResource,
    deleteFileResource: mocks.deleteFileResource,
    createFolderResource: mocks.createFolderResource,
    getParentContainerUri: mocks.getParentContainerUri,
    readRawTextResource: mocks.readRawTextResource,
  }
})

vi.mock('@/providers/query-provider', () => ({
  queryClient: {
    invalidateQueries: mocks.invalidateQueries,
  },
}))

vi.mock('@/modules/inbox/collections', () => ({
  inboxOps: {
    fetchApprovals: mocks.fetchApprovals,
  },
}))

vi.mock('./data/proposal/structured-cell-approval-commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/proposal/structured-cell-approval-commands')>()
  return {
    ...actual,
    createStructuredCellChangeProposalInboxApproval: mocks.createStructuredCellChangeProposalInboxApproval,
  }
})

vi.mock('./data/proposal/access-approval-commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/proposal/access-approval-commands')>()
  return {
    ...actual,
    createAccessPolicyProposalInboxApproval: mocks.createAccessPolicyProposalInboxApproval,
  }
})

vi.mock('./data/proposal/ai-change-approval-commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/proposal/ai-change-approval-commands')>()
  return {
    ...actual,
    createAiChangeProposalInboxApproval: mocks.createAiChangeProposalInboxApproval,
  }
})

vi.mock('./data/proposal/source-approval-commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/proposal/source-approval-commands')>()
  return {
    ...actual,
    createSourceUpdateProposalInboxApproval: mocks.createSourceUpdateProposalInboxApproval,
  }
})

vi.mock('./data/ingest/source-ingest-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/ingest/source-ingest-service')>()
  return {
    ...actual,
    ensureSourceIngestManifestResource: mocks.ensureSourceIngestManifestResource,
    markSourceIngestRangeIngestedResource: mocks.markSourceIngestRangeIngestedResource,
  }
})

vi.mock('./data/proposal/vocab-approval-commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/proposal/vocab-approval-commands')>()
  return {
    ...actual,
    approveVocabTermProposalCanonical: mocks.approveVocabTermProposalCanonical,
    createVocabTermProposalInboxApproval: mocks.createVocabTermProposalInboxApproval,
  }
})

describe('files collections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initializeFilesCollections({ id: 'db' } as never)
    mocks.invalidateQueries.mockResolvedValue(undefined)
    mocks.fetchApprovals.mockResolvedValue([])
    mocks.approveVocabTermProposalCanonical.mockResolvedValue({ termUri: 'https://pod.example/.vocab/terms.ttl#core', shapesUri: 'https://pod.example/.vocab/shapes.ttl' })
    mocks.createAccessPolicyProposalInboxApproval.mockResolvedValue('https://pod.example/.data/approvals/access.ttl#approval')
    mocks.createAiChangeProposalInboxApproval.mockResolvedValue('https://pod.example/.data/approvals/ai.ttl#approval')
    mocks.createSourceUpdateProposalInboxApproval.mockResolvedValue('https://pod.example/.data/approvals/source.ttl#approval')
    mocks.createStructuredCellChangeProposalInboxApproval.mockResolvedValue('https://pod.example/.data/approvals/cell.ttl#approval')
    mocks.createVocabTermProposalInboxApproval.mockResolvedValue('https://pod.example/.data/approvals/vocab.ttl#approval')
    mocks.ensureSourceIngestManifestResource.mockResolvedValue({ action: 'created', manifest: {} })
    mocks.markSourceIngestRangeIngestedResource.mockResolvedValue({ action: 'marked-ingested', manifest: {} })
    mocks.buildRootNodes.mockResolvedValue({ nodes: [], podRootUri: 'https://pod.example/' })
    mocks.listContainerChildNodes.mockResolvedValue([])
    mocks.listAllBrowsableEntries.mockResolvedValue([])
    mocks.listContainerEntries.mockResolvedValue([])
    mocks.readFileDetail.mockResolvedValue({
      id: 'https://pod.example/public/report.md',
      uri: 'https://pod.example/public/report.md',
      name: 'report.md',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 12,
      modifiedAt: null,
      headers: {},
      previewText: '# Report',
    })
    mocks.readBlobResource.mockResolvedValue({
      uri: 'https://pod.example/public/image.png',
      blob: new Blob(['image'], { type: 'image/png' }),
      mimeType: 'image/png',
      headers: {},
    })
    mocks.readFilesAccessBasics.mockResolvedValue({
      ownerUri: 'https://pod.example/public/report.md',
      activeSource: null,
      effectiveAccess: null,
      policySummary: null,
      candidates: [],
    })
    mocks.readFilesMetaSidecar.mockResolvedValue({
      ownerUri: 'https://pod.example/public/report.md',
      metaUri: 'https://pod.example/public/report.md.meta',
      state: 'missing',
      content: null,
      mimeType: null,
      etag: null,
      size: null,
    })
    mocks.readStructuredViewMetadata.mockResolvedValue({
      ownerUri: 'https://pod.example/.data/files/files.ttl',
      metaUri: 'https://pod.example/.data/files/files.ttl.meta',
      state: 'exists',
      content: '',
      mimeType: 'text/turtle',
      etag: null,
      size: 0,
      metadata: { documentUri: 'https://pod.example/.data/files/files.ttl', viewMode: 'table' },
    })
    mocks.saveStructuredViewMetadata.mockResolvedValue({
      ownerUri: 'https://pod.example/.data/files/files.ttl',
      metaUri: 'https://pod.example/.data/files/files.ttl.meta',
      state: 'exists',
      content: '',
      mimeType: 'text/turtle',
      etag: null,
      size: 0,
      metadata: { documentUri: 'https://pod.example/.data/files/files.ttl', viewMode: 'whiteboard' },
    })
    mocks.saveRawTextResource.mockResolvedValue({
      uri: 'https://pod.example/public/report.md',
      content: '# Report',
      mimeType: 'text/markdown',
      etag: '"2"',
      headers: {},
    })
    mocks.readRawTextResource.mockResolvedValue({
      uri: 'https://pod.example/public/report.md',
      content: '# Report',
      mimeType: 'text/markdown',
      etag: '"1"',
      headers: {},
    })
    mocks.createRawTextResource.mockResolvedValue({
      uri: 'https://pod.example/public/notes.md',
      content: '# Notes',
      mimeType: 'text/markdown',
      etag: '"1"',
      headers: {},
    })
    mocks.createBlobResource.mockResolvedValue({
      id: 'https://pod.example/public/image.png',
      uri: 'https://pod.example/public/image.png',
      name: 'image.png',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/',
      mimeType: 'image/png',
      size: 5,
      modifiedAt: null,
      headers: {},
      previewText: null,
    })
    mocks.copyFileResource.mockResolvedValue({
      id: 'https://pod.example/public/report-copy.md',
      uri: 'https://pod.example/public/report-copy.md',
      name: 'report-copy.md',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 12,
      modifiedAt: null,
      headers: {},
      previewText: '# Report',
    })
    mocks.moveFileResource.mockResolvedValue({
      id: 'https://pod.example/public/archive/report.md',
      uri: 'https://pod.example/public/archive/report.md',
      name: 'report.md',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/archive/',
      mimeType: 'text/markdown',
      size: 12,
      modifiedAt: null,
      headers: {},
      previewText: '# Report',
    })
    mocks.deleteFileResource.mockResolvedValue(undefined)
    mocks.createFolderResource.mockResolvedValue({
      id: 'https://pod.example/public/Notes/',
      uri: 'https://pod.example/public/Notes/',
      name: 'Notes',
      kind: 'container',
      semanticKind: 'container',
      parentUri: 'https://pod.example/public/',
      mimeType: 'inode/container',
      size: null,
      modifiedAt: null,
      headers: {},
      previewText: null,
      childEntries: [],
    })
    mocks.getParentContainerUri.mockReturnValue('https://pod.example/public/')
  })

  it('owns optimistic file entry cache updates and rollback snapshots', async () => {
    const { filesEntryCacheCollection } = await import('./collections') as any
    expect(filesEntryCacheCollection).toBeDefined()

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const entriesKey = ['files', 'entries', 'all', 'https://pod.example/public/']
    const entry = {
      id: 'https://pod.example/public/report.md',
      uri: 'https://pod.example/public/report.md',
      name: 'report.md',
      kind: 'resource' as const,
      semanticKind: 'file' as const,
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 8,
      modifiedAt: null,
    }
    queryClient.setQueryData(entriesKey, [entry])

    const snapshot = filesEntryCacheCollection.snapshot(queryClient)
    filesEntryCacheCollection.updateRawText(queryClient, {
      uri: entry.uri,
      mimeType: 'text/markdown',
      size: '# Updated report'.length,
      modifiedAt: 'Tue, 23 Jun 2026 10:00:00 GMT',
    })

    expect(queryClient.getQueryData(entriesKey)).toEqual([
      expect.objectContaining({
        uri: entry.uri,
        semanticKind: 'file',
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/markdown',
        size: '# Updated report'.length,
        modifiedAt: 'Tue, 23 Jun 2026 10:00:00 GMT',
      }),
    ])

    filesEntryCacheCollection.restore(queryClient, snapshot)
    expect(queryClient.getQueryData(entriesKey)).toEqual([entry])
  })

  it('wraps raw text save cache lifecycle in the Files entry collection', async () => {
    const { filesEntryCacheCollection } = await import('./collections') as any
    expect(filesEntryCacheCollection).toBeDefined()

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const cancelSpy = vi.spyOn(queryClient, 'cancelQueries')
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const entriesKey = ['files', 'entries', 'all', 'https://pod.example/public/']
    const entry = {
      id: 'https://pod.example/public/report.md',
      uri: 'https://pod.example/public/report.md',
      name: 'report.md',
      kind: 'resource' as const,
      semanticKind: 'file' as const,
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 8,
      modifiedAt: null,
    }
    queryClient.setQueryData(entriesKey, [entry])

    const snapshot = await filesEntryCacheCollection.stageRawTextSave(queryClient, {
      resource: {
        uri: entry.uri,
        mimeType: 'text/markdown',
      },
      content: '# Updated report',
    })

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: FILES_COLLECTION_QUERY_KEYS.entries })
    expect(queryClient.getQueryData(entriesKey)).toEqual([
      expect.objectContaining({
        uri: entry.uri,
        mimeType: 'text/markdown',
        size: '# Updated report'.length,
      }),
    ])

    filesEntryCacheCollection.restore(queryClient, snapshot)
    expect(queryClient.getQueryData(entriesKey)).toEqual([entry])

    filesEntryCacheCollection.commitRawTextSave(queryClient, {
      uri: entry.uri,
      content: '# Updated report',
      mimeType: 'text/markdown',
      headers: { 'last-modified': 'Tue, 23 Jun 2026 10:00:00 GMT' },
    })

    expect(queryClient.getQueryData(entriesKey)).toEqual([
      expect.objectContaining({
        uri: entry.uri,
        mimeType: 'text/markdown',
        size: '# Updated report'.length,
        modifiedAt: 'Tue, 23 Jun 2026 10:00:00 GMT',
      }),
    ])

    await filesEntryCacheCollection.invalidateRawTextResource(queryClient, entry.uri)

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: FILES_COLLECTION_QUERY_KEYS.entries })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: FILES_COLLECTION_QUERY_KEYS.children })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.rawText, entry.uri] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.detail, entry.uri] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.detail, 'https://pod.example/public/'] })
  })

  it('wraps resource create cache lifecycle in the Files entry collection', async () => {
    const { filesEntryCacheCollection } = await import('./collections') as any
    expect(filesEntryCacheCollection).toBeDefined()

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const cancelSpy = vi.spyOn(queryClient, 'cancelQueries')
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const entriesKey = ['files', 'entries', 'all', 'https://pod.example/public/']
    const containerEntriesKey = [...FILES_COLLECTION_QUERY_KEYS.containerEntries, 'https://pod.example/public/']
    queryClient.setQueryData(entriesKey, [])
    queryClient.setQueryData(containerEntriesKey, [])

    const snapshot = await filesEntryCacheCollection.stageResourceCreate(queryClient, {
      uri: 'https://pod.example/public/notes.md',
      kind: 'resource',
      mimeType: 'text/markdown',
      size: '# Notes'.length,
    })

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: FILES_COLLECTION_QUERY_KEYS.entries })
    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: FILES_COLLECTION_QUERY_KEYS.containerEntries })
    expect(queryClient.getQueryData(entriesKey)).toEqual([
      expect.objectContaining({
        uri: 'https://pod.example/public/notes.md',
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/markdown',
        size: '# Notes'.length,
      }),
    ])
    expect(queryClient.getQueryData(containerEntriesKey)).toEqual([
      expect.objectContaining({ uri: 'https://pod.example/public/notes.md' }),
    ])

    filesEntryCacheCollection.restore(queryClient, snapshot)
    expect(queryClient.getQueryData(entriesKey)).toEqual([])
    expect(queryClient.getQueryData(containerEntriesKey)).toEqual([])

    filesEntryCacheCollection.commitResourceCreate(queryClient, {
      uri: 'https://pod.example/public/notes.md',
      kind: 'resource',
      mimeType: 'text/markdown',
      size: '# Notes from Pod'.length,
    })

    expect(queryClient.getQueryData(entriesKey)).toEqual([
      expect.objectContaining({
        uri: 'https://pod.example/public/notes.md',
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/markdown',
        size: '# Notes from Pod'.length,
      }),
    ])

    await filesEntryCacheCollection.invalidateResourceCreate(queryClient, 'https://pod.example/public/notes.md', {
      includeRawText: true,
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: FILES_COLLECTION_QUERY_KEYS.entries })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: FILES_COLLECTION_QUERY_KEYS.containerEntries })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: FILES_COLLECTION_QUERY_KEYS.children })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.rawText, 'https://pod.example/public/notes.md'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.detail, 'https://pod.example/public/notes.md'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.detail, 'https://pod.example/public/'] })
  })

  it('wraps transfer, delete, and folder cache lifecycles in the Files entry collection', async () => {
    const { filesEntryCacheCollection } = await import('./collections') as any
    expect(filesEntryCacheCollection).toBeDefined()
    mocks.getParentContainerUri.mockImplementation((uri: string) => {
      if (uri === 'https://pod.example/public/archive/report.md') return 'https://pod.example/public/archive/'
      if (uri === 'https://pod.example/public/report.md') return 'https://pod.example/public/'
      if (uri === 'https://pod.example/public/Notes/') return 'https://pod.example/public/'
      return 'https://pod.example/public/'
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const entriesKey = ['files', 'entries', 'all', 'https://pod.example/public/']
    const entry = {
      id: 'https://pod.example/public/report.md',
      uri: 'https://pod.example/public/report.md',
      name: 'report.md',
      kind: 'resource' as const,
      semanticKind: 'file' as const,
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 8,
      modifiedAt: null,
    }
    queryClient.setQueryData(entriesKey, [entry])

    const transfer = {
      sourceUri: 'https://pod.example/public/report.md',
      destinationUri: 'https://pod.example/public/archive/report.md',
    }
    const transferSnapshot = await filesEntryCacheCollection.stageTransfer(queryClient, transfer, 'move')

    expect(queryClient.getQueryData(entriesKey)).toEqual([
      expect.objectContaining({
        uri: transfer.destinationUri,
        parentUri: 'https://pod.example/public/archive/',
      }),
    ])

    filesEntryCacheCollection.restore(queryClient, transferSnapshot)
    expect(queryClient.getQueryData(entriesKey)).toEqual([entry])

    filesEntryCacheCollection.commitTransfer(queryClient, {
      ...entry,
      id: transfer.destinationUri,
      uri: transfer.destinationUri,
      parentUri: 'https://pod.example/public/archive/',
    }, transfer, 'move')
    await filesEntryCacheCollection.invalidateTransfer(queryClient, transfer)

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: FILES_COLLECTION_QUERY_KEYS.entries,
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: FILES_COLLECTION_QUERY_KEYS.children })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.rawText, transfer.destinationUri] })

    const deleteSnapshot = await filesEntryCacheCollection.stageDelete(queryClient, transfer.destinationUri)
    expect(queryClient.getQueryData(entriesKey)).toEqual([])
    filesEntryCacheCollection.restore(queryClient, deleteSnapshot)
    expect(queryClient.getQueryData(entriesKey)).toEqual([
      expect.objectContaining({ uri: transfer.destinationUri }),
    ])

    await filesEntryCacheCollection.invalidateDelete(queryClient, transfer.destinationUri)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.metaSidecar, transfer.destinationUri, 'resource'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.structuredViewMetadata, transfer.destinationUri, 'resource'] })

    const folderSnapshot = await filesEntryCacheCollection.stageFolderCreate(queryClient, {
      containerUri: 'https://pod.example/public/',
      name: 'Notes',
    })

    expect(queryClient.getQueryData(entriesKey)).toEqual([
      expect.objectContaining({ uri: transfer.destinationUri }),
      expect.objectContaining({
        uri: 'https://pod.example/public/Notes/',
        kind: 'container',
        parentUri: 'https://pod.example/public/',
      }),
    ])

    filesEntryCacheCollection.restore(queryClient, folderSnapshot)
    expect(queryClient.getQueryData(entriesKey)).toEqual([
      expect.objectContaining({ uri: transfer.destinationUri }),
    ])

    const folder = {
      id: 'https://pod.example/public/Notes/',
      uri: 'https://pod.example/public/Notes/',
      name: 'Notes',
      kind: 'container' as const,
      semanticKind: 'container' as const,
      parentUri: 'https://pod.example/public/',
      mimeType: 'inode/container',
      size: null,
      modifiedAt: null,
    }
    filesEntryCacheCollection.commitFolderCreate(queryClient, folder)
    await filesEntryCacheCollection.invalidateFolderCreate(queryClient, {
      containerUri: 'https://pod.example/public/',
      name: 'Notes',
    }, folder)

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: FILES_COLLECTION_QUERY_KEYS.detail })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.detail, 'https://pod.example/public/Notes/'] })
  })

  it('keeps a confirmed transfer visible when active entry refetch data is stale', async () => {
    const {
      filesEntryCacheCollection,
      filesResourceQueryCollection,
    } = await import('./collections') as any
    mocks.getParentContainerUri.mockImplementation((uri: string) => {
      if (uri === 'https://pod.example/public/report-renamed.md') return 'https://pod.example/public/'
      if (uri === 'https://pod.example/public/report.md') return 'https://pod.example/public/'
      return 'https://pod.example/public/'
    })

    const staleSourceEntry = {
      id: 'https://pod.example/public/report.md',
      uri: 'https://pod.example/public/report.md',
      name: 'report.md',
      kind: 'resource' as const,
      semanticKind: 'file' as const,
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 8,
      modifiedAt: null,
    }
    const renamedEntry = {
      ...staleSourceEntry,
      id: 'https://pod.example/public/report-renamed.md',
      uri: 'https://pod.example/public/report-renamed.md',
      name: 'report-renamed.md',
    }
    mocks.listAllBrowsableEntries
      .mockResolvedValueOnce([staleSourceEntry])
      .mockResolvedValueOnce([staleSourceEntry])

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
    })
    const options = filesResourceQueryCollection.entries({
      entryScope: 'all',
      selectedTreeNodeId: 'all',
      selection: { kind: 'all' },
      workspaceUri: null,
      threadId: null,
      chatPodRootUri: null,
      messages: [],
      db: { id: 'db' },
    })
    const observer = new QueryObserver(queryClient, options)
    const unsubscribe = observer.subscribe(() => undefined)

    try {
      await observer.refetch()
      const transfer = {
        sourceUri: staleSourceEntry.uri,
        destinationUri: renamedEntry.uri,
      }
      await filesEntryCacheCollection.stageTransfer(queryClient, transfer, 'move')
      filesEntryCacheCollection.commitTransfer(queryClient, renamedEntry, transfer, 'move')
      await filesEntryCacheCollection.invalidateTransfer(queryClient, transfer)

      expect(mocks.listAllBrowsableEntries).toHaveBeenCalledTimes(2)
      expect(queryClient.getQueryData(options.queryKey)).toEqual([
        expect.objectContaining({
          uri: renamedEntry.uri,
          name: renamedEntry.name,
        }),
      ])
    } finally {
      unsubscribe()
      queryClient.clear()
    }
  })

  it('keeps a confirmed transfer visible when global resource invalidation refetches stale active entries', async () => {
    const { filesEntryCacheCollection, filesResourceCacheInvalidationCollection } = await import('./collections') as any
    mocks.getParentContainerUri.mockImplementation((uri: string) => {
      if (uri === 'https://pod.example/public/report-renamed.md') return 'https://pod.example/public/'
      if (uri === 'https://pod.example/public/report.md') return 'https://pod.example/public/'
      return 'https://pod.example/public/'
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const entriesKey = ['files', 'entries', 'all', 'all', '', '', '', '', '']
    const staleSourceEntry = {
      id: 'https://pod.example/public/report.md',
      uri: 'https://pod.example/public/report.md',
      name: 'report.md',
      kind: 'resource' as const,
      semanticKind: 'file' as const,
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 8,
      modifiedAt: null,
    }
    const renamedEntry = {
      ...staleSourceEntry,
      id: 'https://pod.example/public/report-renamed.md',
      uri: 'https://pod.example/public/report-renamed.md',
      name: 'report-renamed.md',
    }
    queryClient.setQueryData(entriesKey, [staleSourceEntry])
    const observer = new QueryObserver(queryClient, {
      queryKey: entriesKey,
      queryFn: async () => [staleSourceEntry],
    })
    const unsubscribe = observer.subscribe(() => undefined)

    try {
      await observer.refetch()
      const transfer = {
        sourceUri: staleSourceEntry.uri,
        destinationUri: renamedEntry.uri,
      }
      await filesEntryCacheCollection.stageTransfer(queryClient, transfer, 'move')
      filesEntryCacheCollection.commitTransfer(queryClient, renamedEntry, transfer, 'move')
      await filesResourceCacheInvalidationCollection.invalidateAllResourceRoots(queryClient)

      expect(queryClient.getQueryData(entriesKey)).toEqual([
        expect.objectContaining({
          uri: renamedEntry.uri,
          name: renamedEntry.name,
        }),
      ])
    } finally {
      unsubscribe()
      queryClient.clear()
    }
  })

  it('merges confirmed transfers into stale all-entries query results', async () => {
    const {
      filesEntryCacheCollection,
      filesResourceQueryCollection,
    } = await import('./collections') as any
    mocks.getParentContainerUri.mockImplementation((uri: string) => {
      if (uri === 'https://pod.example/public/report-renamed.md') return 'https://pod.example/public/'
      if (uri === 'https://pod.example/public/report.md') return 'https://pod.example/public/'
      return 'https://pod.example/public/'
    })

    const staleSourceEntry = {
      id: 'https://pod.example/public/report.md',
      uri: 'https://pod.example/public/report.md',
      name: 'report.md',
      kind: 'resource' as const,
      semanticKind: 'file' as const,
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 8,
      modifiedAt: null,
    }
    const renamedEntry = {
      ...staleSourceEntry,
      id: 'https://pod.example/public/report-renamed.md',
      uri: 'https://pod.example/public/report-renamed.md',
      name: 'report-renamed.md',
    }
    mocks.listAllBrowsableEntries.mockResolvedValueOnce([staleSourceEntry])

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const entriesKey = ['files', 'entries', 'all', 'all', '', '', '', '', '']
    queryClient.setQueryData(entriesKey, [staleSourceEntry])
    const transfer = {
      sourceUri: staleSourceEntry.uri,
      destinationUri: renamedEntry.uri,
    }
    await filesEntryCacheCollection.stageTransfer(queryClient, transfer, 'move')
    filesEntryCacheCollection.commitTransfer(queryClient, renamedEntry, transfer, 'move')

    const options = filesResourceQueryCollection.entries({
      entryScope: 'all',
      selectedTreeNodeId: 'all',
      selection: { kind: 'all' },
      workspaceUri: null,
      threadId: null,
      chatPodRootUri: null,
      messages: [],
      db: { id: 'db' },
    })
    const entries = await options.queryFn()

    expect(entries).toEqual([
      expect.objectContaining({
        uri: renamedEntry.uri,
        name: renamedEntry.name,
      }),
    ])
  })

  it('injects a confirmed transfer destination into stale all-entries results when the stale source is already gone', async () => {
    const {
      filesEntryCacheCollection,
      filesResourceQueryCollection,
    } = await import('./collections') as any
    mocks.getParentContainerUri.mockImplementation((uri: string) => {
      if (uri === 'https://pod.example/public/report-renamed.md') return 'https://pod.example/public/'
      if (uri === 'https://pod.example/public/report.md') return 'https://pod.example/public/'
      return 'https://pod.example/public/'
    })

    const staleSourceEntry = {
      id: 'https://pod.example/public/report.md',
      uri: 'https://pod.example/public/report.md',
      name: 'report.md',
      kind: 'resource' as const,
      semanticKind: 'file' as const,
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 8,
      modifiedAt: null,
    }
    const renamedEntry = {
      ...staleSourceEntry,
      id: 'https://pod.example/public/report-renamed.md',
      uri: 'https://pod.example/public/report-renamed.md',
      name: 'report-renamed.md',
    }
    const unrelatedEntry = {
      ...staleSourceEntry,
      id: 'https://pod.example/public/other.md',
      uri: 'https://pod.example/public/other.md',
      name: 'other.md',
    }
    mocks.listAllBrowsableEntries.mockResolvedValueOnce([unrelatedEntry])

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const entriesKey = ['files', 'entries', 'all', 'all', '', '', '', '', '']
    queryClient.setQueryData(entriesKey, [staleSourceEntry])
    const transfer = {
      sourceUri: staleSourceEntry.uri,
      destinationUri: renamedEntry.uri,
    }
    await filesEntryCacheCollection.stageTransfer(queryClient, transfer, 'move')
    filesEntryCacheCollection.commitTransfer(queryClient, renamedEntry, transfer, 'move')

    const options = filesResourceQueryCollection.entries({
      entryScope: 'all',
      selectedTreeNodeId: 'all',
      selection: { kind: 'all' },
      workspaceUri: null,
      threadId: null,
      chatPodRootUri: null,
      messages: [],
      db: { id: 'db' },
    })
    const entries = await options.queryFn()

    expect(entries).toEqual([
      unrelatedEntry,
      expect.objectContaining({
        uri: renamedEntry.uri,
        name: renamedEntry.name,
      }),
    ])
  })

  it('keeps a confirmed transfer visible when active all-entries refetches without source or destination', async () => {
    const {
      filesEntryCacheCollection,
      filesResourceQueryCollection,
    } = await import('./collections') as any
    mocks.getParentContainerUri.mockImplementation((uri: string) => {
      if (uri === 'https://pod.example/public/report-renamed.md') return 'https://pod.example/public/'
      if (uri === 'https://pod.example/public/report.md') return 'https://pod.example/public/'
      return 'https://pod.example/public/'
    })

    const staleSourceEntry = {
      id: 'https://pod.example/public/report.md',
      uri: 'https://pod.example/public/report.md',
      name: 'report.md',
      kind: 'resource' as const,
      semanticKind: 'file' as const,
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 8,
      modifiedAt: null,
    }
    const renamedEntry = {
      ...staleSourceEntry,
      id: 'https://pod.example/public/report-renamed.md',
      uri: 'https://pod.example/public/report-renamed.md',
      name: 'report-renamed.md',
    }
    const unrelatedEntry = {
      ...staleSourceEntry,
      id: 'https://pod.example/public/other.md',
      uri: 'https://pod.example/public/other.md',
      name: 'other.md',
    }
    mocks.listAllBrowsableEntries
      .mockResolvedValueOnce([staleSourceEntry])
      .mockResolvedValueOnce([unrelatedEntry])

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
    })
    const options = filesResourceQueryCollection.entries({
      entryScope: 'all',
      selectedTreeNodeId: 'all',
      selection: { kind: 'all' },
      workspaceUri: null,
      threadId: null,
      chatPodRootUri: null,
      messages: [],
      db: { id: 'db' },
    })
    const observer = new QueryObserver(queryClient, options)
    const unsubscribe = observer.subscribe(() => undefined)

    try {
      await observer.refetch()
      const transfer = {
        sourceUri: staleSourceEntry.uri,
        destinationUri: renamedEntry.uri,
      }
      await filesEntryCacheCollection.stageTransfer(queryClient, transfer, 'move')
      filesEntryCacheCollection.commitTransfer(queryClient, renamedEntry, transfer, 'move')
      await filesEntryCacheCollection.invalidateTransfer(queryClient, transfer)

      expect(mocks.listAllBrowsableEntries).toHaveBeenCalledTimes(2)
      expect(queryClient.getQueryData(options.queryKey)).toEqual([
        unrelatedEntry,
        expect.objectContaining({
          uri: renamedEntry.uri,
          name: renamedEntry.name,
        }),
      ])
    } finally {
      unsubscribe()
      queryClient.clear()
    }
  })

  it('owns structured view metadata cache updates and rollback snapshots', async () => {
    const { filesStructuredViewMetadataCacheCollection } = await import('./collections') as any
    expect(filesStructuredViewMetadataCacheCollection).toBeDefined()

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const file = { uri: 'https://pod.example/.data/files/files.ttl', kind: 'resource' as const }
    const queryKey = ['files', 'structured-view-metadata', file.uri, file.kind]
    const previousSidecar = {
      ownerUri: file.uri,
      metaUri: `${file.uri}.meta`,
      state: 'exists' as const,
      content: '',
      mimeType: 'text/turtle',
      etag: '"1"',
      size: 12,
      metadata: {
        documentUri: file.uri,
        viewMode: 'table' as const,
        classScope: null,
        searchText: '',
        sortKey: null,
        sortDirection: 'asc' as const,
        hiddenPredicates: [],
        kanbanGroupPredicate: null,
        kanbanOrder: {},
        columnSizing: {},
        whiteboard: {
          selectedSubjects: [],
          positions: {},
          visualRelations: [],
        },
        writesCanonicalData: false as const,
      },
    }
    const nextSidecar = {
      ...previousSidecar,
      etag: '"2"',
      metadata: {
        ...previousSidecar.metadata,
        viewMode: 'whiteboard' as const,
        whiteboard: {
          selectedSubjects: ['#FileResource'],
          positions: {},
          visualRelations: [],
        },
      },
    }
    queryClient.setQueryData(queryKey, previousSidecar)

    const snapshot = filesStructuredViewMetadataCacheCollection.snapshot(queryClient, file)
    filesStructuredViewMetadataCacheCollection.setSidecar(queryClient, nextSidecar)

    expect(queryClient.getQueryData(queryKey)).toEqual(nextSidecar)

    filesStructuredViewMetadataCacheCollection.restore(queryClient, snapshot)
    expect(queryClient.getQueryData(queryKey)).toEqual(previousSidecar)
  })

  it('owns structured cell proposal cache staging and rollback snapshots', async () => {
    const { structuredCellProposalCacheCollection } = await import('./collections') as any
    expect(structuredCellProposalCacheCollection).toBeDefined()

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const existingProposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Other',
      predicate: 'title',
      previousValues: ['"Other"'],
      nextValues: ['"Other draft"'],
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Draft title"'],
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const queryKey = ['files', 'structured-cell-proposals', proposal.documentUri]
    queryClient.setQueryData(queryKey, [existingProposal])

    const snapshot = structuredCellProposalCacheCollection.stage(queryClient, proposal)

    expect(queryClient.getQueryData(queryKey)).toEqual([existingProposal, proposal])

    structuredCellProposalCacheCollection.stage(queryClient, proposal)
    expect(queryClient.getQueryData(queryKey)).toEqual([existingProposal, proposal])

    structuredCellProposalCacheCollection.restore(queryClient, snapshot)
    expect(queryClient.getQueryData(queryKey)).toEqual([existingProposal])
  })

  it('runs raw text save as a Files collection cache transaction', async () => {
    mocks.getParentContainerUri.mockReturnValue('https://pod.example/public/')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const entriesKey = ['files', 'entries', 'all', 'https://pod.example/public/']
    const entry = {
      id: 'https://pod.example/public/report.md',
      uri: 'https://pod.example/public/report.md',
      name: 'report.md',
      kind: 'resource' as const,
      semanticKind: 'file' as const,
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 8,
      modifiedAt: null,
    }
    queryClient.setQueryData(entriesKey, [entry])
    mocks.saveRawTextResource.mockResolvedValueOnce({
      uri: entry.uri,
      content: '# Updated report',
      mimeType: 'text/markdown',
      etag: '"2"',
      headers: { 'last-modified': 'Tue, 23 Jun 2026 10:00:00 GMT' },
    })

    await expect(filesResourceMutationCollection.saveRawText({
      cacheClient: queryClient,
      db: { id: 'db' } as never,
      resource: { uri: entry.uri, mimeType: 'text/markdown', etag: '"1"' },
      content: '# Updated report',
    })).resolves.toMatchObject({
      uri: entry.uri,
      content: '# Updated report',
    })

    expect(mocks.saveRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      { uri: entry.uri, mimeType: 'text/markdown', etag: '"1"' },
      '# Updated report',
    )
    expect(queryClient.getQueryData(entriesKey)).toEqual([
      expect.objectContaining({
        uri: entry.uri,
        size: '# Updated report'.length,
        modifiedAt: 'Tue, 23 Jun 2026 10:00:00 GMT',
      }),
    ])
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: FILES_COLLECTION_QUERY_KEYS.entries })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: FILES_COLLECTION_QUERY_KEYS.children })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.rawText, entry.uri] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.detail, 'https://pod.example/public/'] })
  })

  it('rolls back raw text save cache changes when the resource write fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const entriesKey = ['files', 'entries', 'all', 'https://pod.example/public/']
    const entry = {
      id: 'https://pod.example/public/report.md',
      uri: 'https://pod.example/public/report.md',
      name: 'report.md',
      kind: 'resource' as const,
      semanticKind: 'file' as const,
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 8,
      modifiedAt: null,
    }
    queryClient.setQueryData(entriesKey, [entry])
    mocks.saveRawTextResource.mockRejectedValueOnce(new Error('HTTP 412'))

    await expect(filesResourceMutationCollection.saveRawText({
      cacheClient: queryClient,
      db: { id: 'db' } as never,
      resource: { uri: entry.uri, mimeType: 'text/markdown', etag: '"1"' },
      content: '# Updated report',
    })).rejects.toThrow('HTTP 412')

    expect(queryClient.getQueryData(entriesKey)).toEqual([entry])
  })

  it('optimistically seeds and rolls back raw text cache while creating a text file', async () => {
    mocks.getParentContainerUri.mockReturnValue('https://pod.example/public/')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const entriesKey = ['files', 'entries', 'all', 'https://pod.example/public/']
    const rawTextKey = ['files', 'raw-text', 'https://pod.example/public/notes.md']
    const existingEntry = {
      id: 'https://pod.example/public/report.md',
      uri: 'https://pod.example/public/report.md',
      name: 'report.md',
      kind: 'resource' as const,
      semanticKind: 'file' as const,
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 8,
      modifiedAt: null,
    }
    queryClient.setQueryData(entriesKey, [existingEntry])
    queryClient.setQueryData(rawTextKey, undefined)

    let rejectCreate!: (error: Error) => void
    mocks.createRawTextResource.mockReturnValueOnce(new Promise((_resolve, reject) => {
      rejectCreate = reject
    }))

    const createPromise = filesResourceMutationCollection.createRawText({
      cacheClient: queryClient,
      db: { id: 'db' } as never,
      resource: {
        uri: 'https://pod.example/public/notes.md',
        mimeType: 'text/markdown',
      },
      content: '# Notes',
    })

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(entriesKey)).toEqual([
        existingEntry,
        expect.objectContaining({
          uri: 'https://pod.example/public/notes.md',
          size: '# Notes'.length,
        }),
      ])
    })
    expect(queryClient.getQueryData(rawTextKey)).toEqual(expect.objectContaining({
      uri: 'https://pod.example/public/notes.md',
      content: '# Notes',
      mimeType: 'text/markdown',
    }))

    rejectCreate(new Error('HTTP 409'))

    await expect(createPromise).rejects.toThrow('HTTP 409')

    expect(queryClient.getQueryData(entriesKey)).toEqual([existingEntry])
    expect(queryClient.getQueryData(rawTextKey)).toBeUndefined()
  })

  it('runs structured cell proposal create as a Files collection cache transaction', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const existingProposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Other',
      predicate: 'title',
      previousValues: ['"Other"'],
      nextValues: ['"Other draft"'],
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Draft title"'],
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const queryKey = structuredCellProposalCollection.queryKey(proposal.documentUri)
    queryClient.setQueryData(queryKey, [existingProposal])
    mocks.createRawTextResource.mockResolvedValueOnce({
      uri: proposal.proposalResourceUri,
      content: renderStructuredCellChangeProposalTurtle(proposal),
      mimeType: 'text/turtle',
      headers: {},
    })

    await expect(structuredCellProposalCollection.createWithCache({
      cacheClient: queryClient,
      db: { id: 'db' } as never,
      actorWebId: 'https://pod.example/profile#me',
      proposal,
    })).resolves.toBe('https://pod.example/.data/approvals/cell.ttl#approval')

    expect(queryClient.getQueryData(queryKey)).toEqual([existingProposal, proposal])
    expect(mocks.createRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: proposal.proposalResourceUri,
        mimeType: 'text/turtle',
      },
      renderStructuredCellChangeProposalTurtle(proposal),
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: structuredCellProposalCollection.queryKey(proposal.documentUri) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inbox', 'approvals'] })
  })

  it('rolls back structured cell proposal cache changes when create fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const existingProposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Other',
      predicate: 'title',
      previousValues: ['"Other"'],
      nextValues: ['"Other draft"'],
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Draft title"'],
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const queryKey = structuredCellProposalCollection.queryKey(proposal.documentUri)
    queryClient.setQueryData(queryKey, [existingProposal])
    mocks.createRawTextResource.mockRejectedValueOnce(new Error('HTTP 409'))

    await expect(structuredCellProposalCollection.createWithCache({
      cacheClient: queryClient,
      db: { id: 'db' } as never,
      actorWebId: 'https://pod.example/profile#me',
      proposal,
    })).rejects.toThrow('HTTP 409')

    expect(queryClient.getQueryData(queryKey)).toEqual([existingProposal])
  })

  it('optimistically stages vocab, access, source, and AI proposal caches at the collection boundary', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const vocabProposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short summary.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const existingVocabProposal = createVocabTermProposal({
      documentUri: vocabProposal.documentUri,
      termUri: 'https://pod.example/.vocab/terms.ttl#status',
      termKind: 'predicate',
      label: 'status',
      valueType: 'enum',
      description: 'Review status.',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const accessProposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/report.md',
      activePolicyUri: 'https://pod.example/public/report.md.acl',
      targetPolicyUri: 'https://pod.example/public/report.md.acl',
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Allow agent edits.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const sourceProposal = createSourceUpdateProposal({
      documentUri: vocabProposal.documentUri,
      subject: '#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/sources/report/manifest.ttl',
      sourceHash: 'sha256-new',
      ingestVersion: 'pdf-ingest-v1',
      snapshotAt: '2026-06-18T00:00:00.000Z',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const aiProposal = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/public/report.md',
      documentUri: vocabProposal.documentUri,
      proposedContent: '# AI replacement',
      summary: 'AI replacement pending review.',
      diff: '+ AI replacement',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const vocabKey = vocabTermProposalCollection.queryKey(vocabProposal.documentUri)
    const accessKey = accessPolicyProposalCollection.queryKey(accessProposal.ownerUri)
    const sourceKey = sourceUpdateProposalCollection.queryKey(sourceProposal.documentUri)
    const aiKey = aiChangeProposalCollection.queryKey(aiProposal.targetResourceUri)
    queryClient.setQueryData(vocabKey, [existingVocabProposal])
    queryClient.setQueryData(accessKey, [])
    queryClient.setQueryData(sourceKey, [])
    queryClient.setQueryData(aiKey, [])

    await expect(vocabTermProposalCollection.createWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      proposal: vocabProposal,
    })).resolves.toBe('https://pod.example/.data/approvals/vocab.ttl#approval')
    await expect(accessPolicyProposalCollection.createWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      proposal: accessProposal,
    })).resolves.toBe('https://pod.example/.data/approvals/access.ttl#approval')
    await expect(sourceUpdateProposalCollection.createWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      proposal: sourceProposal,
    })).resolves.toBe('https://pod.example/.data/approvals/source.ttl#approval')
    await expect(aiChangeProposalCollection.createWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      proposal: aiProposal,
    })).resolves.toBe('https://pod.example/.data/approvals/ai.ttl#approval')

    expect(queryClient.getQueryData(vocabKey)).toEqual([existingVocabProposal, vocabProposal])
    expect(queryClient.getQueryData(accessKey)).toEqual([accessProposal])
    expect(queryClient.getQueryData(sourceKey)).toEqual([sourceProposal])
    expect(queryClient.getQueryData(aiKey)).toEqual([aiProposal])
  })

  it('rolls back non-cell proposal cache staging when proposal creation fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const vocabProposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short summary.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const accessProposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/report.md',
      activePolicyUri: 'https://pod.example/public/report.md.acl',
      targetPolicyUri: 'https://pod.example/public/report.md.acl',
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Allow agent edits.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const sourceProposal = createSourceUpdateProposal({
      documentUri: vocabProposal.documentUri,
      subject: '#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/sources/report/manifest.ttl',
      sourceHash: 'sha256-new',
      ingestVersion: 'pdf-ingest-v1',
      snapshotAt: '2026-06-18T00:00:00.000Z',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const aiProposal = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/public/report.md',
      documentUri: vocabProposal.documentUri,
      proposedContent: '# AI replacement',
      summary: 'AI replacement pending review.',
      diff: '+ AI replacement',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const vocabKey = vocabTermProposalCollection.queryKey(vocabProposal.documentUri)
    const accessKey = accessPolicyProposalCollection.queryKey(accessProposal.ownerUri)
    const sourceKey = sourceUpdateProposalCollection.queryKey(sourceProposal.documentUri)
    const aiKey = aiChangeProposalCollection.queryKey(aiProposal.targetResourceUri)
    const existingVocab = [vocabProposal]
    queryClient.setQueryData(vocabKey, existingVocab)
    queryClient.setQueryData(accessKey, [])
    queryClient.setQueryData(sourceKey, [])
    queryClient.setQueryData(aiKey, [])

    mocks.createRawTextResource.mockRejectedValue(new Error('HTTP 409'))

    await expect(vocabTermProposalCollection.createWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      proposal: vocabProposal,
    })).rejects.toThrow('HTTP 409')
    await expect(accessPolicyProposalCollection.createWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      proposal: accessProposal,
    })).rejects.toThrow('HTTP 409')
    await expect(sourceUpdateProposalCollection.createWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      proposal: sourceProposal,
    })).rejects.toThrow('HTTP 409')
    await expect(aiChangeProposalCollection.createWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      proposal: aiProposal,
    })).rejects.toThrow('HTTP 409')

    expect(queryClient.getQueryData(vocabKey)).toEqual(existingVocab)
    expect(queryClient.getQueryData(accessKey)).toEqual([])
    expect(queryClient.getQueryData(sourceKey)).toEqual([])
    expect(queryClient.getQueryData(aiKey)).toEqual([])
  })

  it('wraps low-level browser resource calls behind the Files resource collection', async () => {
    const db = { id: 'override-db' } as never
    const file = { uri: 'https://pod.example/.data/files/files.ttl', kind: 'resource' as const }
    const rawResource = { uri: 'https://pod.example/public/report.md', mimeType: 'text/markdown', etag: '"1"' }
    const newResource = { uri: 'https://pod.example/public/notes.md', mimeType: 'text/markdown' }
    const transfer = {
      sourceUri: 'https://pod.example/public/report.md',
      destinationUri: 'https://pod.example/public/report-copy.md',
    }

    await filesResourceCollection.buildRoots('https://pod.example/public/', db)
    await filesResourceCollection.listChildTreeNodes('https://pod.example/public/', 'container:https://pod.example/public/', 'https://pod.example/', db)
    await filesResourceCollection.listAllEntries('https://pod.example/public/', { recursive: true }, db)
    await filesResourceCollection.listContainerEntries('https://pod.example/public/', 'Workspace', db)
    await filesResourceCollection.readDetail('https://pod.example/public/report.md', db)
    await filesResourceCollection.readRawText('https://pod.example/public/report.md', db)
    await filesResourceCollection.readBlob('https://pod.example/public/image.png', db)
    await filesResourceCollection.readAccessBasics(file, db)
    await filesResourceCollection.readMetaSidecar(file, db)
    await filesResourceCollection.readStructuredViewMetadata(file, db)
    await filesResourceCollection.saveStructuredViewMetadata(file, { documentUri: file.uri, viewMode: 'whiteboard' }, db)
    await filesResourceCollection.saveRawText(rawResource, '# Report', db)
    await filesResourceCollection.createRawText(newResource, '# Notes', db)
    await filesResourceCollection.createBlob({ uri: 'https://pod.example/public/image.png', mimeType: 'image/png' }, new Blob(['image']), db)
    await filesResourceCollection.copy(transfer, db)
    await filesResourceCollection.move(transfer, db)
    await filesResourceCollection.delete('https://pod.example/public/report.md', db)
    await filesResourceCollection.createFolder({ containerUri: 'https://pod.example/public/', name: 'Notes' }, db)

    expect(mocks.buildRootNodes).toHaveBeenCalledWith(db, 'https://pod.example/public/')
    expect(mocks.listContainerChildNodes).toHaveBeenCalledWith(db, 'https://pod.example/public/', 'container:https://pod.example/public/', 'https://pod.example/')
    expect(mocks.listAllBrowsableEntries).toHaveBeenCalledWith(db, 'https://pod.example/public/', { recursive: true })
    expect(mocks.listContainerEntries).toHaveBeenCalledWith(db, 'https://pod.example/public/', 'Workspace')
    expect(mocks.readFileDetail).toHaveBeenCalledWith(db, 'https://pod.example/public/report.md', {
      includeContainerEntries: false,
    })
    expect(mocks.readRawTextResource).toHaveBeenCalledWith(db, 'https://pod.example/public/report.md')
    expect(mocks.readBlobResource).toHaveBeenCalledWith(db, 'https://pod.example/public/image.png')
    expect(mocks.readFilesAccessBasics).toHaveBeenCalledWith(db, file)
    expect(mocks.readFilesMetaSidecar).toHaveBeenCalledWith(db, file)
    expect(mocks.readStructuredViewMetadata).toHaveBeenCalledWith(db, file)
    expect(mocks.saveStructuredViewMetadata).toHaveBeenCalledWith(db, file, expect.objectContaining({ viewMode: 'whiteboard' }))
    expect(mocks.saveRawTextResource).toHaveBeenCalledWith(db, rawResource, '# Report')
    expect(mocks.createRawTextResource).toHaveBeenCalledWith(db, newResource, '# Notes')
    expect(mocks.createBlobResource).toHaveBeenCalledWith(db, { uri: 'https://pod.example/public/image.png', mimeType: 'image/png' }, expect.any(Blob))
    expect(mocks.copyFileResource).toHaveBeenCalledWith(db, transfer)
    expect(mocks.moveFileResource).toHaveBeenCalledWith(db, transfer)
    expect(mocks.deleteFileResource).toHaveBeenCalledWith(db, 'https://pod.example/public/report.md')
    expect(mocks.createFolderResource).toHaveBeenCalledWith(db, { containerUri: 'https://pod.example/public/', name: 'Notes' })
  })

  it('wraps Files read query options behind the resource query collection', async () => {
    const db = { id: 'override-db' } as never
    const file = { uri: 'https://pod.example/.data/files/files.ttl', kind: 'resource' as const }

    const roots = filesResourceQueryCollection.roots({
      workspaceUri: 'https://pod.example/public/',
      db,
    })
    expect(roots.queryKey).toEqual(['files', 'roots', 'https://pod.example/public/'])
    expect(roots.enabled).toBe(true)
    expect(roots.staleTime).toBe(30_000)
    await expect(roots.queryFn()).resolves.toEqual({ nodes: [], podRootUri: 'https://pod.example/' })
    expect(mocks.buildRootNodes).toHaveBeenCalledWith(db, 'https://pod.example/public/')

    const children = filesResourceQueryCollection.children({
      parentNode: { id: 'container:https://pod.example/public/', type: 'container', uri: 'https://pod.example/public/' },
      podRootUri: 'https://pod.example/',
      db,
    })
    expect(children.queryKey).toEqual(['files', 'children', 'container:https://pod.example/public/', 'https://pod.example/public/'])
    expect(children.enabled).toBe(true)
    expect(children.staleTime).toBe(30_000)
    await expect(children.queryFn()).resolves.toEqual([])
    expect(mocks.listContainerChildNodes).toHaveBeenCalledWith(db, 'https://pod.example/public/', 'container:https://pod.example/public/', 'https://pod.example/')

    const entries = filesResourceQueryCollection.entries({
      entryScope: 'all',
      selectedTreeNodeId: 'all',
      selection: { kind: 'container', containerUri: 'https://pod.example/public/' },
      workspaceUri: 'https://pod.example/public/',
      chatPodRootUri: 'https://pod.example/',
      chatFileFingerprint: 'messages-v1',
      db,
    })
    expect(entries.queryKey).toEqual([
      'files',
      'entries',
      'all',
      'all',
      'https://pod.example/public/',
      'https://pod.example/public/',
      '',
      'https://pod.example/',
      'messages-v1',
    ])
    expect(entries.enabled).toBe(true)
    expect(entries.staleTime).toBe(30_000)
    await expect(entries.queryFn()).resolves.toEqual([])

    const detail = filesResourceQueryCollection.detail({
      fileUri: 'https://pod.example/public/report.md',
      db,
    })
    expect(detail.staleTime).toBe(30_000)
    await expect(detail.queryFn()).resolves.toEqual(expect.objectContaining({ uri: 'https://pod.example/public/report.md' }))
    await expect(filesResourceQueryCollection.rawText({
      fileUri: 'https://pod.example/public/report.md',
      db,
    }).queryFn()).resolves.toEqual(expect.objectContaining({ uri: 'https://pod.example/public/report.md' }))
    await expect(filesResourceQueryCollection.blob({
      fileUri: 'https://pod.example/public/image.png',
      db,
    }).queryFn()).resolves.toEqual(expect.objectContaining({ uri: 'https://pod.example/public/image.png' }))
    await expect(filesSidecarQueryCollection.accessBasics({ file, db }).queryFn()).resolves.toEqual(expect.objectContaining({
      ownerUri: 'https://pod.example/public/report.md',
    }))
    await expect(filesSidecarQueryCollection.metaSidecar({ file, db }).queryFn()).resolves.toEqual(expect.objectContaining({
      metaUri: 'https://pod.example/public/report.md.meta',
    }))
    await expect(filesSidecarQueryCollection.structuredViewMetadata({ file, db }).queryFn()).resolves.toEqual(expect.objectContaining({
      ownerUri: 'https://pod.example/.data/files/files.ttl',
    }))

    expect(filesResourceQueryCollection.roots({ workspaceUri: null, db: null }).enabled).toBe(false)
    expect(filesResourceQueryCollection.children({ parentNode: null, db }).enabled).toBe(false)
    expect(filesResourceQueryCollection.entries({
      entryScope: 'chat-files',
      selectedTreeNodeId: 'all',
      selection: { kind: 'all' },
      db,
    }).enabled).toBe(false)
    expect(filesResourceQueryCollection.rawText({
      fileUri: 'https://pod.example/public/report.md',
      enabled: false,
      db,
    }).enabled).toBe(false)
  })

  it('uses one canonical query identity for every projection of a container', async () => {
    const db = { id: 'override-db' } as never
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const containerUri = 'https://pod.example/public/'

    const treeProjection = filesResourceQueryCollection.containerEntries({ containerUri, db })
    const listProjection = filesResourceQueryCollection.containerEntries({ containerUri, db })

    expect(treeProjection.queryKey).toEqual(['files', 'container-entries', containerUri])
    expect(listProjection.queryKey).toEqual(treeProjection.queryKey)

    await Promise.all([
      queryClient.fetchQuery(treeProjection),
      queryClient.fetchQuery(listProjection),
    ])

    expect(mocks.listContainerEntries).toHaveBeenCalledTimes(1)
    expect(mocks.listContainerEntries).toHaveBeenCalledWith(db, containerUri, undefined)
  })

  it('centralizes Files entry listing strategy in the resource collection', async () => {
    const db = { id: 'override-db' } as never
    mocks.listAllBrowsableEntries.mockResolvedValueOnce([{ uri: 'all-entry' }])
    await expect(filesResourceCollection.listEntries({
      entryScope: 'all',
      selection: { kind: 'all' },
      workspaceUri: 'https://pod.example/public/',
    }, db)).resolves.toEqual([{ uri: 'all-entry' }])
    expect(mocks.listAllBrowsableEntries).toHaveBeenLastCalledWith(db, 'https://pod.example/public/', {})

    mocks.listAllBrowsableEntries.mockResolvedValueOnce([{ uri: 'recent-entry' }])
    await expect(filesResourceCollection.listEntries({
      entryScope: 'all',
      selection: { kind: 'recent' },
      workspaceUri: 'https://pod.example/public/',
    }, db)).resolves.toEqual([{ uri: 'recent-entry' }])
    expect(mocks.listAllBrowsableEntries).toHaveBeenLastCalledWith(db, 'https://pod.example/public/', { recursive: true })

    mocks.listContainerEntries.mockResolvedValueOnce([{ uri: 'container-entry' }])
    await expect(filesResourceCollection.listEntries({
      entryScope: 'all',
      selection: { kind: 'container', containerUri: 'https://pod.example/public/' },
      workspaceUri: 'https://pod.example/public/',
    }, db)).resolves.toEqual([{ uri: 'container-entry' }])
    expect(mocks.listContainerEntries).toHaveBeenLastCalledWith(db, 'https://pod.example/public/', '当前话题')

    await expect(filesResourceCollection.listEntries({
      entryScope: 'all',
      selection: { kind: 'local-workspace', localPath: '/Users/ganlu/develop/linx-files' },
      workspaceUri: 'https://pod.example/public/',
    }, db)).resolves.toEqual([])
  })

  it('merges chat file projections with workspace entries through the resource collection', async () => {
    const db = { id: 'override-db' } as never
    mocks.listAllBrowsableEntries.mockResolvedValueOnce([
      {
        id: 'https://pod.example/public/workspace-note.md',
        uri: 'https://pod.example/public/workspace-note.md',
        name: 'workspace-note.md',
        kind: 'resource',
        semanticKind: 'file',
        parentUri: 'https://pod.example/public/',
        mimeType: 'text/markdown',
        size: 100,
        modifiedAt: '2026-06-18T09:00:00.000Z',
      },
    ])

    const entries = await filesResourceCollection.listEntries({
      entryScope: 'chat-files',
      selection: { kind: 'all' },
      workspaceUri: 'https://pod.example/public/',
      threadId: 'thread-1',
      chatPodRootUri: 'https://pod.example/',
      messages: [{
        id: 'message-1',
        createdAt: '2026-06-18T08:00:00.000Z',
        richContent: JSON.stringify({
          items: [{
            type: 'file',
            fileName: 'chat-report.md',
            fileUrl: 'https://pod.example/public/chat-report.md',
            fileSize: 32,
            mimeType: 'text/markdown',
          }],
        }),
      }],
    }, db)

    expect(mocks.listAllBrowsableEntries).toHaveBeenLastCalledWith(db, 'https://pod.example/public/', { recursive: true })
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uri: 'https://pod.example/public/chat-report.md',
        name: 'chat-report.md',
        sourceLabel: '聊天引用',
      }),
      expect.objectContaining({
        uri: 'https://pod.example/public/workspace-note.md',
      }),
    ]))
  })

  it('wraps vocab Type Index discovery behind the Files vocab discovery collection', async () => {
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
      }),
    } as never
    const documents = new Map([
      ['https://id.example/alice', [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '@prefix pim: <http://www.w3.org/ns/pim/space#> .',
        '<https://id.example/alice#me> solid:publicTypeIndex <https://pod.example/settings/publicTypeIndex.ttl> ;',
        '  pim:preferencesFile <https://pod.example/settings/preferences.ttl> .',
      ].join('\n')],
      ['https://pod.example/settings/publicTypeIndex.ttl', [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '<#vocab> a solid:TypeRegistration ;',
        '  solid:forClass <https://undefineds.co/vocab/VocabRegistry> ;',
        '  solid:instance <https://pod.example/.vocab/terms.ttl> .',
      ].join('\n')],
      ['https://pod.example/settings/preferences.ttl', [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '<https://id.example/alice#me> solid:privateTypeIndex <https://pod.example/settings/privateTypeIndex.ttl> .',
      ].join('\n')],
      ['https://pod.example/settings/privateTypeIndex.ttl', [
        '@prefix solid: <http://www.w3.org/ns/solid/terms#> .',
        '<#private-vocab> a solid:TypeRegistration ;',
        '  solid:forClass <https://undefineds.co/vocab/VocabRegistry> ;',
        '  solid:instance <https://pod.example/private/.vocab/terms.ttl> .',
      ].join('\n')],
    ])
    const authFetch = vi.fn(async (uri: RequestInfo | URL, init?: RequestInit) => {
      expect(init).toMatchObject({ method: 'GET' })
      const document = documents.get(String(uri))
      return document
        ? new Response(document, { status: 200, headers: { 'Content-Type': 'text/turtle' } })
        : new Response('missing', { status: 404 })
    })

    expect(filesVocabDiscoveryCollection.resolveLocalVocabUri({ db })).toBe('https://pod.example/.vocab/terms.ttl')
    expect(filesVocabDiscoveryCollection.queryKey({
      webId: 'https://id.example/alice#me',
      localVocabUri: 'https://pod.example/.vocab/terms.ttl',
    })).toEqual([
      ...FILES_COLLECTION_QUERY_KEYS.vocabDiscovery,
      'https://id.example/alice#me',
      'https://undefineds.co/vocab/VocabRegistry',
      'https://pod.example/.vocab/terms.ttl',
    ])

    await expect(filesVocabDiscoveryCollection.discover({
      webId: 'https://id.example/alice#me',
      localVocabUri: 'https://pod.example/.vocab/terms.ttl',
      authFetch,
    })).resolves.toEqual({
      publicTypeIndexUri: 'https://pod.example/settings/publicTypeIndex.ttl',
      privateTypeIndexUri: 'https://pod.example/settings/privateTypeIndex.ttl',
      public: [{
        source: 'public',
        registrationUri: 'https://pod.example/settings/publicTypeIndex.ttl#vocab',
        forClass: 'https://undefineds.co/vocab/VocabRegistry',
        instance: 'https://pod.example/.vocab/terms.ttl',
        instanceContainer: null,
      }],
      private: [{
        source: 'private',
        registrationUri: 'https://pod.example/settings/privateTypeIndex.ttl#private-vocab',
        forClass: 'https://undefineds.co/vocab/VocabRegistry',
        instance: 'https://pod.example/private/.vocab/terms.ttl',
        instanceContainer: null,
      }],
    })
    expect(authFetch).toHaveBeenCalledWith('https://id.example/alice', expect.objectContaining({
      headers: expect.objectContaining({
        Accept: expect.stringContaining('text/turtle'),
      }),
    }))
  })

  it('wraps vocab discovery query options behind the vocab discovery query collection', async () => {
    const db = {
      getDialect: () => ({
        getPodUrl: () => 'https://pod.example/',
      }),
    } as never
    const authFetch = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch

    expect(filesVocabDiscoveryQueryCollection.resolveLocalVocabUri({ db })).toBe('https://pod.example/.vocab/terms.ttl')

    const discovery = filesVocabDiscoveryQueryCollection.discovery({
      webId: 'https://id.example/alice#me',
      localVocabUri: 'https://pod.example/.vocab/terms.ttl',
      authFetch,
    })

    expect(discovery.queryKey).toEqual([
      ...FILES_COLLECTION_QUERY_KEYS.vocabDiscovery,
      'https://id.example/alice#me',
      'https://undefineds.co/vocab/VocabRegistry',
      'https://pod.example/.vocab/terms.ttl',
    ])
    expect(discovery.enabled).toBe(true)
    await expect(discovery.queryFn()).resolves.toMatchObject({
      publicTypeIndexUri: null,
      privateTypeIndexUri: null,
      public: [],
      private: [],
    })

    expect(filesVocabDiscoveryQueryCollection.discovery({
      webId: null,
      authFetch,
      localVocabUri: 'https://pod.example/.vocab/terms.ttl',
    }).enabled).toBe(false)
    expect(filesVocabDiscoveryQueryCollection.discovery({
      webId: 'https://id.example/alice#me',
      authFetch: null,
      localVocabUri: 'https://pod.example/.vocab/terms.ttl',
    }).enabled).toBe(false)
  })

  it('subscribes to approval changes and invalidates Files resource and proposal query roots', async () => {
    const unsubscribe = vi.fn()
    const db = {
      subscribe: vi.fn(async () => ({ unsubscribe })),
    }
    initializeFilesCollections(db as never)

    const dispose = await filesOps.subscribeToPod()
    const callbacks = db.subscribe.mock.calls[0]?.[1]

    expect(db.subscribe).toHaveBeenCalledWith(approvalResource, expect.objectContaining({
      onCreate: expect.any(Function),
      onUpdate: expect.any(Function),
      onDelete: expect.any(Function),
    }))

    callbacks.onCreate()
    callbacks.onUpdate()
    callbacks.onDelete()
    dispose()

    for (const queryKey of [
      FILES_COLLECTION_QUERY_KEYS.roots,
      FILES_COLLECTION_QUERY_KEYS.children,
      FILES_COLLECTION_QUERY_KEYS.detail,
      FILES_COLLECTION_QUERY_KEYS.rawText,
      FILES_COLLECTION_QUERY_KEYS.blob,
      FILES_COLLECTION_QUERY_KEYS.accessBasics,
      FILES_COLLECTION_QUERY_KEYS.metaSidecar,
      FILES_COLLECTION_QUERY_KEYS.structuredViewMetadata,
      FILES_COLLECTION_QUERY_KEYS.structuredCellProposals,
      FILES_COLLECTION_QUERY_KEYS.sourceUpdateProposals,
      FILES_COLLECTION_QUERY_KEYS.accessPolicyProposals,
      FILES_COLLECTION_QUERY_KEYS.vocabTermProposals,
      FILES_COLLECTION_QUERY_KEYS.aiChangeProposals,
      FILES_COLLECTION_QUERY_KEYS.vocabDiscovery,
    ]) {
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey })
    }
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: FILES_COLLECTION_QUERY_KEYS.entries,
      refetchType: 'inactive',
    })
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('derives pending structured cell proposals from Inbox approval targets', async () => {
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Draft title"'],
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const otherProposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-2/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Other"'],
      nextValues: ['"Other draft"'],
      createdAt: '2026-06-18T00:00:00.000Z',
    })

    mocks.fetchApprovals.mockResolvedValue([
      {
        id: 'approval-1',
        status: 'pending',
        toolName: 'files.structured-cell.proposal',
        action: 'https://undefineds.co/vocab/approveStructuredCellChangeProposal',
        target: proposal.id,
      },
      {
        id: 'approval-2',
        status: 'pending',
        toolName: 'files.structured-cell.proposal',
        action: 'https://undefineds.co/vocab/approveStructuredCellChangeProposal',
        target: otherProposal.id,
      },
      {
        id: 'approval-approved',
        status: 'approved',
        toolName: 'files.structured-cell.proposal',
        action: 'https://undefineds.co/vocab/approveStructuredCellChangeProposal',
        target: 'https://pod.example/.data/proposals/cell/approved.ttl#proposal',
      },
    ])
    mocks.readRawTextResource
      .mockResolvedValueOnce({
        uri: proposal.proposalResourceUri,
        content: renderStructuredCellChangeProposalTurtle(proposal),
        mimeType: 'text/turtle',
        headers: {},
      })
      .mockResolvedValueOnce({
        uri: otherProposal.proposalResourceUri,
        content: renderStructuredCellChangeProposalTurtle(otherProposal),
        mimeType: 'text/turtle',
        headers: {},
      })

    const proposals = await structuredCellProposalCollection.fetchByDocument(
      'https://pod.example/.data/workspaces/ws-1/state.ttl',
    )

    expect(mocks.fetchApprovals).toHaveBeenCalledTimes(1)
    expect(mocks.readRawTextResource).toHaveBeenCalledTimes(2)
    expect(mocks.readRawTextResource).toHaveBeenCalledWith({ id: 'db' }, proposal.proposalResourceUri)
    expect(proposals).toEqual([proposal])
  })

  it('surfaces pending proposal read failures instead of hiding broken approvals', async () => {
    mocks.fetchApprovals.mockResolvedValue([
      {
        id: 'approval-stale',
        status: 'pending',
        toolName: 'files.structured-cell.proposal',
        action: 'https://undefineds.co/vocab/approveStructuredCellChangeProposal',
        target: 'https://pod.example/.data/proposals/cell/stale.ttl#proposal',
      },
    ])
    mocks.readRawTextResource.mockRejectedValueOnce(new Error('HTTP 404'))

    await expect(structuredCellProposalCollection.fetchByDocument(
      'https://pod.example/.data/workspaces/ws-1/state.ttl',
    )).rejects.toThrow(
      'Failed to read pending proposal target https://pod.example/.data/proposals/cell/stale.ttl#proposal',
    )
    expect(mocks.readRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      'https://pod.example/.data/proposals/cell/stale.ttl',
    )
  })

  it('creates a structured cell proposal resource and matching Inbox approval', async () => {
    const proposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Draft title"'],
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    mocks.createRawTextResource.mockResolvedValue({
      uri: proposal.proposalResourceUri,
      content: renderStructuredCellChangeProposalTurtle(proposal),
      mimeType: 'text/turtle',
      headers: {},
    })

    await expect(structuredCellProposalCollection.create({
      actorWebId: 'https://pod.example/profile#me',
      proposal,
    })).resolves.toBe('https://pod.example/.data/approvals/cell.ttl#approval')

    expect(mocks.createRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      {
        uri: proposal.proposalResourceUri,
        mimeType: 'text/turtle',
      },
      renderStructuredCellChangeProposalTurtle(proposal),
    )
    expect(mocks.createStructuredCellChangeProposalInboxApproval).toHaveBeenCalledWith(
      { id: 'db' },
      {
        actorWebId: 'https://pod.example/profile#me',
        proposal,
      },
    )
  })

  it('derives pending vocab term proposals from Inbox approval targets', async () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#core',
      termKind: 'enum-option',
      predicate: '#tags',
      label: 'core',
      valueType: 'enum-option',
      description: 'Core topic.',
      shape: 'predicate #tags',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const otherProposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-2/state.ttl',
      termUri: 'https://pod.example/.vocab/terms.ttl#other',
      termKind: 'predicate',
      label: 'other',
      valueType: 'text',
      description: 'Other term.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })

    mocks.fetchApprovals.mockResolvedValue([
      {
        id: 'approval-vocab-1',
        status: 'pending',
        toolName: 'files.vocab.proposal',
        action: 'https://undefineds.co/vocab/approveVocabTermProposal',
        target: proposal.id,
      },
      {
        id: 'approval-vocab-2',
        status: 'pending',
        toolName: 'files.vocab.proposal',
        action: 'https://undefineds.co/vocab/approveVocabTermProposal',
        target: otherProposal.id,
      },
      {
        id: 'approval-vocab-approved',
        status: 'approved',
        toolName: 'files.vocab.proposal',
        action: 'https://undefineds.co/vocab/approveVocabTermProposal',
        target: 'https://pod.example/.data/proposals/vocab/approved.ttl#proposal',
      },
    ])
    mocks.readRawTextResource
      .mockResolvedValueOnce({
        uri: proposal.proposalResourceUri,
        content: renderVocabTermProposalTurtle(proposal),
        mimeType: 'text/turtle',
        headers: {},
      })
      .mockResolvedValueOnce({
        uri: otherProposal.proposalResourceUri,
        content: renderVocabTermProposalTurtle(otherProposal),
        mimeType: 'text/turtle',
        headers: {},
      })

    const proposals = await vocabTermProposalCollection.fetchByDocument(
      'https://pod.example/.data/workspaces/ws-1/state.ttl',
    )

    expect(mocks.fetchApprovals).toHaveBeenCalledTimes(1)
    expect(mocks.readRawTextResource).toHaveBeenCalledTimes(2)
    expect(mocks.readRawTextResource).toHaveBeenCalledWith({ id: 'db' }, proposal.proposalResourceUri)
    expect(proposals).toEqual([proposal])
  })

  it('derives pending access policy proposals from Inbox approval targets', async () => {
    const proposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/report.md',
      activePolicyUri: 'https://pod.example/public/report.md.acl',
      targetPolicyUri: 'https://pod.example/public/report.md.acl',
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Allow agent edits.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const otherProposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/other.md',
      activePolicyUri: 'https://pod.example/public/other.md.acl',
      targetPolicyUri: 'https://pod.example/public/other.md.acl',
      provider: 'acl',
      audience: 'public',
      audienceRef: 'http://xmlns.com/foaf/0.1/Agent',
      role: 'viewer',
      modes: ['read'],
      reason: 'Publish other file.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })

    mocks.fetchApprovals.mockResolvedValue([
      {
        id: 'approval-access-1',
        status: 'pending',
        toolName: 'files.access.proposal',
        action: 'https://undefineds.co/vocab/reviewAccessPolicyProposal',
        target: proposal.id,
      },
      {
        id: 'approval-access-2',
        status: 'pending',
        toolName: 'files.access.proposal',
        action: 'https://undefineds.co/vocab/reviewAccessPolicyProposal',
        target: otherProposal.id,
      },
    ])
    mocks.readRawTextResource
      .mockResolvedValueOnce({
        uri: proposal.proposalResourceUri,
        content: renderAccessPolicyProposalTurtle(proposal),
        mimeType: 'text/turtle',
        headers: {},
      })
      .mockResolvedValueOnce({
        uri: otherProposal.proposalResourceUri,
        content: renderAccessPolicyProposalTurtle(otherProposal),
        mimeType: 'text/turtle',
        headers: {},
      })

    const proposals = await accessPolicyProposalCollection.fetchByOwner('https://pod.example/public/report.md')

    expect(mocks.fetchApprovals).toHaveBeenCalledTimes(1)
    expect(mocks.readRawTextResource).toHaveBeenCalledTimes(2)
    expect(proposals).toEqual([proposal])
  })

  it('derives pending source update proposals from Inbox approval targets', async () => {
    const proposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/sources/report/manifest.ttl',
      sourceHash: 'sha256-new',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const otherProposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-2/state.ttl',
      subject: '#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-2/cards/report.md',
      sourceUri: 'https://pod.example/public/other.pdf',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/sources/other/manifest.ttl',
      sourceHash: 'sha256-other',
      createdAt: '2026-06-18T00:00:00.000Z',
    })

    mocks.fetchApprovals.mockResolvedValue([
      {
        id: 'approval-source-1',
        status: 'pending',
        toolName: 'files.source.proposal',
        action: 'https://undefineds.co/vocab/reviewSourceUpdateProposal',
        target: proposal.id,
      },
      {
        id: 'approval-source-2',
        status: 'pending',
        toolName: 'files.source.proposal',
        action: 'https://undefineds.co/vocab/reviewSourceUpdateProposal',
        target: otherProposal.id,
      },
    ])
    mocks.readRawTextResource
      .mockResolvedValueOnce({
        uri: proposal.proposalResourceUri,
        content: renderSourceUpdateProposalTurtle(proposal),
        mimeType: 'text/turtle',
        headers: {},
      })
      .mockResolvedValueOnce({
        uri: otherProposal.proposalResourceUri,
        content: renderSourceUpdateProposalTurtle(otherProposal),
        mimeType: 'text/turtle',
        headers: {},
      })

    const proposals = await sourceUpdateProposalCollection.fetchByDocument(
      'https://pod.example/.data/workspaces/ws-1/state.ttl',
    )

    expect(mocks.fetchApprovals).toHaveBeenCalledTimes(1)
    expect(mocks.readRawTextResource).toHaveBeenCalledTimes(2)
    expect(proposals).toEqual([proposal])
  })

  it('creates vocab, access, source, and AI proposal resources through collection facades', async () => {
    const vocabProposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short summary.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const accessProposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/report.md',
      activePolicyUri: 'https://pod.example/public/report.md.acl',
      targetPolicyUri: 'https://pod.example/public/report.md.acl',
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Allow agent edits.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const sourceProposal = createSourceUpdateProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/sources/report/manifest.ttl',
      sourceHash: 'sha256-new',
      ingestVersion: 'pdf-ingest-v1',
      snapshotAt: '2026-06-18T00:00:00.000Z',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const aiProposal = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/public/report.md',
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      proposedContent: '# AI replacement',
      summary: 'AI replacement pending review.',
      diff: '+ AI replacement',
      createdAt: '2026-06-18T00:00:00.000Z',
    })

    await expect(vocabTermProposalCollection.create({
      actorWebId: 'https://pod.example/profile#me',
      proposal: vocabProposal,
    })).resolves.toBe('https://pod.example/.data/approvals/vocab.ttl#approval')
    await expect(accessPolicyProposalCollection.create({
      actorWebId: 'https://pod.example/profile#me',
      proposal: accessProposal,
    })).resolves.toBe('https://pod.example/.data/approvals/access.ttl#approval')
    await expect(sourceUpdateProposalCollection.create({
      actorWebId: 'https://pod.example/profile#me',
      proposal: sourceProposal,
    })).resolves.toBe('https://pod.example/.data/approvals/source.ttl#approval')
    await expect(aiChangeProposalCollection.create({
      actorWebId: 'https://pod.example/profile#me',
      proposal: aiProposal,
    })).resolves.toBe('https://pod.example/.data/approvals/ai.ttl#approval')

    expect(mocks.createRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      { uri: vocabProposal.proposalResourceUri, mimeType: 'text/turtle' },
      renderVocabTermProposalTurtle(vocabProposal),
    )
    expect(mocks.createVocabTermProposalInboxApproval).toHaveBeenCalledWith(
      { id: 'db' },
      { actorWebId: 'https://pod.example/profile#me', proposal: vocabProposal },
    )
    expect(mocks.createRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      { uri: accessProposal.proposalResourceUri, mimeType: 'text/turtle' },
      renderAccessPolicyProposalTurtle(accessProposal),
    )
    expect(mocks.createAccessPolicyProposalInboxApproval).toHaveBeenCalledWith(
      { id: 'db' },
      { actorWebId: 'https://pod.example/profile#me', proposal: accessProposal },
    )
    expect(mocks.ensureSourceIngestManifestResource).toHaveBeenCalledWith(
      { id: 'db' },
      expect.objectContaining({
        manifestUri: sourceProposal.sourceIngestManifestUri,
        sourceUri: sourceProposal.sourceUri,
        sourceHash: sourceProposal.sourceHash,
        ingestVersion: sourceProposal.ingestVersion,
        status: 'partial',
        lastIngestedAt: sourceProposal.snapshotAt,
        writesCanonicalContent: false,
      }),
    )
    expect(mocks.createRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      { uri: sourceProposal.proposalResourceUri, mimeType: 'text/turtle' },
      renderSourceUpdateProposalTurtle(sourceProposal),
    )
    expect(mocks.createSourceUpdateProposalInboxApproval).toHaveBeenCalledWith(
      { id: 'db' },
      { actorWebId: 'https://pod.example/profile#me', proposal: sourceProposal },
    )
    expect(mocks.createRawTextResource).toHaveBeenCalledWith(
      { id: 'db' },
      { uri: aiProposal.proposalResourceUri, mimeType: 'text/turtle' },
      renderAiChangeProposalTurtle(aiProposal),
    )
    expect(mocks.createAiChangeProposalInboxApproval).toHaveBeenCalledWith(
      { id: 'db' },
      { actorWebId: 'https://pod.example/profile#me', proposal: aiProposal },
    )
  })

  it('approves vocab proposals through the collection and returns the refreshed terms registry', async () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short summary.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const termsResource = {
      uri: proposal.targetVocabUri,
      content: '@prefix udfs: <https://undefineds.co/vocab/> .',
      mimeType: 'text/turtle',
      headers: {},
    }
    mocks.readRawTextResource.mockResolvedValueOnce(termsResource)

    await expect(vocabTermProposalCollection.approve(proposal)).resolves.toBe(termsResource)

    expect(mocks.approveVocabTermProposalCanonical).toHaveBeenCalledWith({ id: 'db' }, proposal)
    expect(mocks.readRawTextResource).toHaveBeenCalledWith({ id: 'db' }, proposal.targetVocabUri)
  })

  it('wraps proposal mutations with collection-owned cache invalidation', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const vocabProposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short summary.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const accessProposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/report.md',
      activePolicyUri: 'https://pod.example/public/report.md.acl',
      targetPolicyUri: 'https://pod.example/public/report.md.acl',
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Allow agent edits.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const sourceProposal = createSourceUpdateProposal({
      documentUri: vocabProposal.documentUri,
      subject: '#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/sources/report/manifest.ttl',
      sourceHash: 'sha256-new',
      ingestVersion: 'pdf-ingest-v1',
      snapshotAt: '2026-06-18T00:00:00.000Z',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const aiProposal = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/public/report.md',
      documentUri: vocabProposal.documentUri,
      proposedContent: '# AI replacement',
      summary: 'AI replacement pending review.',
      diff: '+ AI replacement',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const termsResource = {
      uri: vocabProposal.targetVocabUri,
      content: '@prefix udfs: <https://undefineds.co/vocab/> .',
      mimeType: 'text/turtle',
      headers: {},
    }
    mocks.readRawTextResource.mockResolvedValueOnce(termsResource)

    await expect(vocabTermProposalCollection.approveWithCache({
      cacheClient: queryClient,
      proposal: vocabProposal,
    })).resolves.toBe(termsResource)
    await expect(vocabTermProposalCollection.createWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      proposal: vocabProposal,
    })).resolves.toBe('https://pod.example/.data/approvals/vocab.ttl#approval')
    await expect(accessPolicyProposalCollection.createWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      proposal: accessProposal,
    })).resolves.toBe('https://pod.example/.data/approvals/access.ttl#approval')
    await expect(sourceUpdateProposalCollection.createWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      proposal: sourceProposal,
    })).resolves.toBe('https://pod.example/.data/approvals/source.ttl#approval')
    await expect(aiChangeProposalCollection.createWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      proposal: aiProposal,
    })).resolves.toBe('https://pod.example/.data/approvals/ai.ttl#approval')

    expect(mocks.createVocabTermProposalInboxApproval).toHaveBeenCalledWith(
      { id: 'db' },
      { actorWebId: 'https://pod.example/profile#me', proposal: vocabProposal },
    )
    expect(mocks.createAccessPolicyProposalInboxApproval).toHaveBeenCalledWith(
      { id: 'db' },
      { actorWebId: 'https://pod.example/profile#me', proposal: accessProposal },
    )
    expect(mocks.createSourceUpdateProposalInboxApproval).toHaveBeenCalledWith(
      { id: 'db' },
      { actorWebId: 'https://pod.example/profile#me', proposal: sourceProposal },
    )
    expect(mocks.createAiChangeProposalInboxApproval).toHaveBeenCalledWith(
      { id: 'db' },
      { actorWebId: 'https://pod.example/profile#me', proposal: aiProposal },
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.rawText, vocabProposal.targetVocabUri] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: vocabTermProposalCollection.queryKey(vocabProposal.documentUri) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: accessPolicyProposalCollection.queryKey(accessProposal.ownerUri) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sourceUpdateProposalCollection.queryKey(sourceProposal.documentUri) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.detail, aiProposal.targetResourceUri] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['inbox', 'approvals'] })
  })

  it('wraps Ingest mutations with collection-owned cache invalidation', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const fetchSource = vi.fn().mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))
    const ingestAdapter = vi.fn().mockResolvedValue({
      markdown: '# Report\n\nIngested body.',
      sourceHash: 'sha256-report',
      mimeType: 'application/pdf',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })

    const createPlan = await sourceIngestCollection.createWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      fetchSource,
      input: {
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri: 'https://pod.example/public/report.pdf',
        title: 'Report',
        sourceKind: 'pdf',
        ingestAdapter,
      },
    })
    expect(fetchSource).toHaveBeenCalledWith('https://pod.example/public/report.pdf')
    expect(ingestAdapter).toHaveBeenCalledWith(expect.objectContaining({
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceKind: 'pdf',
    }))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: FILES_COLLECTION_QUERY_KEYS.entries })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.detail, createPlan.targetResourceUri] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.rawText, createPlan.sourceIngestManifestUri] })
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: [...FILES_COLLECTION_QUERY_KEYS.entries, 'https://pod.example/.data/workspaces/ws-1/cards/'],
    })

    const refreshFetchSource = vi.fn().mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70, 45, 50]), {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))
    const refreshAdapter = vi.fn().mockResolvedValue({
      markdown: '# Report\n\nRefreshed body.',
      sourceHash: 'sha256-report-v2',
      mimeType: 'application/pdf',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })
    const refreshPlan = await sourceIngestCollection.refreshWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      fetchSource: refreshFetchSource,
      input: {
        documentUri: createPlan.targetResourceUri,
        subject: createPlan.subject,
        targetResourceUri: createPlan.bodyResourceUri,
        sourceUri: createPlan.sourceUri,
        sourceKind: 'pdf',
        title: createPlan.title,
        mimeType: 'application/pdf',
        currentSourceHash: 'sha256-report',
        sourceIngestManifestUri: createPlan.sourceIngestManifestUri,
        ingestAdapter: refreshAdapter,
      },
    })
    expect(refreshPlan.action).toBe('changed')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.rawText, refreshPlan.sourceIngestManifestUri] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.detail, refreshPlan.targetResourceUri] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sourceUpdateProposalCollection.queryKey(refreshPlan.sourceProposal!.documentUri) })

    const range = { start: 'chunk:2', end: 'chunk:*' }
    mocks.ensureSourceIngestManifestResource.mockResolvedValueOnce({
      action: 'queued',
      manifest: createPlan.sourceIngestManifest,
    })
    await expect(sourceIngestCollection.requestRangeWithCache({
      cacheClient: queryClient,
      manifest: createPlan.sourceIngestManifest,
      range,
      requestedAt: '2026-06-18T00:00:00.000Z',
    })).resolves.toEqual({
      action: 'queued',
      manifest: createPlan.sourceIngestManifest,
    })
    expect(mocks.ensureSourceIngestManifestResource).toHaveBeenLastCalledWith(
      { id: 'db' },
      createPlan.sourceIngestManifest,
      {
        requestedRange: range,
        requestedRanges: undefined,
        requestedAt: '2026-06-18T00:00:00.000Z',
      },
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.rawText, createPlan.sourceIngestManifestUri] })

    mocks.markSourceIngestRangeIngestedResource.mockResolvedValueOnce({
      action: 'marked-ingested',
      manifest: createPlan.sourceIngestManifest,
    })
    await expect(sourceIngestCollection.markRangeIngestedWithCache({
      cacheClient: queryClient,
      manifest: createPlan.sourceIngestManifest,
      range,
      ingestedAt: '2026-06-18T01:00:00.000Z',
    })).resolves.toEqual({
      action: 'marked-ingested',
      manifest: createPlan.sourceIngestManifest,
    })
    expect(mocks.markSourceIngestRangeIngestedResource).toHaveBeenCalledWith(
      { id: 'db' },
      createPlan.sourceIngestManifest,
      {
        range,
        ingestedAt: '2026-06-18T01:00:00.000Z',
      },
    )
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...FILES_COLLECTION_QUERY_KEYS.rawText, createPlan.sourceIngestManifestUri] })
  })

  it('passes injected URL fetches through source Ingest create and refresh plans', async () => {
    const createFetchSource = vi.fn().mockResolvedValue(new Response('<html><body><main><p>Created runtime URL body.</p></main></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }))
    const createPlan = await sourceIngestCollection.buildCreatePlan({
      db: { id: 'db' } as never,
      fetchSource: createFetchSource,
      input: {
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri: 'https://example.com/runtime',
        title: 'Runtime URL',
        sourceKind: 'url',
      },
    })

    expect(createFetchSource).toHaveBeenCalledWith('https://example.com/runtime')
    expect(createPlan.bodyResource.content).toContain('Created runtime URL body.')
    expect(createPlan.sourceKind).toBe('url')

    const refreshFetchSource = vi.fn().mockResolvedValue(new Response('<html><body><main><p>Refreshed runtime URL body.</p></main></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }))
    const refreshPlan = await sourceIngestCollection.buildRefreshPlan({
      db: { id: 'db' } as never,
      fetchSource: refreshFetchSource,
      input: {
        documentUri: createPlan.targetResourceUri,
        subject: createPlan.subject,
        targetResourceUri: createPlan.bodyResourceUri,
        sourceUri: createPlan.sourceUri,
        sourceKind: 'url',
        title: createPlan.title,
        mimeType: 'text/html',
        currentSourceHash: createPlan.sourceIngestManifest.sourceHash,
        sourceIngestManifestUri: createPlan.sourceIngestManifestUri,
      },
    })

    expect(refreshFetchSource).toHaveBeenCalledWith('https://example.com/runtime')
    expect(refreshPlan.action).toBe('changed')
    expect(refreshPlan.sourceProposal?.proposedContent).toContain('Refreshed runtime URL body.')
  })

  it('optimistically stages source Ingest card, proposal, and manifest caches through the collection boundary', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const entriesKey = [
      ...FILES_COLLECTION_QUERY_KEYS.entries,
      'all',
      'container:https://pod.example/.data/workspaces/ws-1/cards/',
      '',
      'https://pod.example/.data/workspaces/ws-1/cards/',
      '',
      '',
      '',
    ] as const
    queryClient.setQueryData(entriesKey, [])

    let resolveManifest!: () => void
    mocks.ensureSourceIngestManifestResource.mockImplementationOnce((_db, manifest) => new Promise((resolve) => {
      resolveManifest = () => resolve({ action: 'created', manifest })
    }))
    const fetchSource = vi.fn().mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))
    const ingestAdapter = vi.fn().mockResolvedValue({
      markdown: '# Report\n\nIngested body.',
      sourceHash: 'sha256-report',
      mimeType: 'application/pdf',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })

    const request = sourceIngestCollection.createWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      fetchSource,
      input: {
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri: 'https://pod.example/public/report.pdf',
        title: 'Report',
        sourceKind: 'pdf',
        ingestAdapter,
      },
    })

    await vi.waitFor(() => {
      expect(ingestAdapter).toHaveBeenCalledTimes(1)
    })

    const stagedEntry = queryClient.getQueryData(entriesKey) as unknown[]
    expect(stagedEntry).toEqual([
      expect.objectContaining({
        uri: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl',
        kind: 'resource',
        semanticKind: 'source-linked-card',
        parentUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        mimeType: 'text/turtle',
      }),
    ])

    const plan = createSourceIngestPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/index.ttl',
      containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceKind: 'pdf',
      title: 'Report',
      ingestSnapshot: {
        content: '# Report\n\nIngested body.',
        sourceHash: 'sha256-report',
        mimeType: 'application/pdf',
        totalChunks: 1,
        pendingRanges: [],
        priorityQueue: [],
      },
      podRootUri: 'https://pod.example/',
    })
    expect(queryClient.getQueryData(sourceUpdateProposalCollection.queryKey(plan.sourceProposal.documentUri))).toEqual([
      expect.objectContaining({
        documentUri: plan.sourceProposal.documentUri,
        subject: plan.sourceProposal.subject,
        targetResourceUri: plan.sourceProposal.targetResourceUri,
        sourceUri: plan.sourceProposal.sourceUri,
        sourceIngestManifestUri: plan.sourceProposal.sourceIngestManifestUri,
        sourceHash: plan.sourceProposal.sourceHash,
        status: 'pending',
        writesCanonicalContent: false,
      }),
    ])
    expect(queryClient.getQueryData<{ content: string }>([
      ...FILES_COLLECTION_QUERY_KEYS.rawText,
      plan.sourceIngestManifestUri,
    ])?.content).toContain('udfs:SourceIngestManifest')
    const stagedCard = queryClient.getQueryData<{ content: string }>([
      ...FILES_COLLECTION_QUERY_KEYS.rawText,
      plan.targetResourceUri,
    ])?.content
    expect(stagedCard).toContain('udfs:SourceLinkedCard')
    expect(stagedCard).toContain(`udfs:bodyResource <${plan.bodyResourceUri}>`)

    resolveManifest()
    await expect(request).resolves.toMatchObject({
      targetResourceUri: plan.targetResourceUri,
      sourceProposal: expect.objectContaining({
        targetResourceUri: plan.sourceProposal.targetResourceUri,
        sourceUri: plan.sourceProposal.sourceUri,
        sourceHash: plan.sourceProposal.sourceHash,
      }),
    })
  })

  it('rolls back optimistic source Ingest caches when remote creation fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const entriesKey = [
      ...FILES_COLLECTION_QUERY_KEYS.entries,
      'all',
      'container:https://pod.example/.data/workspaces/ws-1/cards/',
      '',
      'https://pod.example/.data/workspaces/ws-1/cards/',
      '',
      '',
      '',
    ] as const
    queryClient.setQueryData(entriesKey, [])

    let rejectManifest!: () => void
    mocks.ensureSourceIngestManifestResource.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectManifest = () => reject(new Error('manifest write failed'))
    }))
    const fetchSource = vi.fn().mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))
    const ingestAdapter = vi.fn().mockResolvedValue({
      markdown: '# Report\n\nIngested body.',
      sourceHash: 'sha256-report',
      mimeType: 'application/pdf',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })
    const plan = createSourceIngestPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/index.ttl',
      containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceKind: 'pdf',
      title: 'Report',
      ingestSnapshot: {
        content: '# Report\n\nIngested body.',
        sourceHash: 'sha256-report',
        mimeType: 'application/pdf',
        totalChunks: 1,
        pendingRanges: [],
        priorityQueue: [],
      },
      podRootUri: 'https://pod.example/',
    })

    const request = sourceIngestCollection.createWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      fetchSource,
      input: {
        containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
        sourceUri: 'https://pod.example/public/report.pdf',
        title: 'Report',
        sourceKind: 'pdf',
        ingestAdapter,
      },
    })

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(entriesKey)).toEqual([
        expect.objectContaining({ uri: plan.targetResourceUri }),
      ])
    })
    expect(queryClient.getQueryData(sourceUpdateProposalCollection.queryKey(plan.sourceProposal.documentUri))).toEqual([
      expect.objectContaining({ targetResourceUri: plan.sourceProposal.targetResourceUri }),
    ])
    expect(queryClient.getQueryData<{ content: string }>([
      ...FILES_COLLECTION_QUERY_KEYS.rawText,
      plan.sourceIngestManifestUri,
    ])?.content).toContain('udfs:SourceIngestManifest')

    rejectManifest()
    await expect(request).rejects.toThrow('manifest write failed')

    expect(queryClient.getQueryData(entriesKey)).toEqual([])
    expect(queryClient.getQueryData(sourceUpdateProposalCollection.queryKey(plan.sourceProposal.documentUri))).toBeUndefined()
    expect(queryClient.getQueryData([
      ...FILES_COLLECTION_QUERY_KEYS.rawText,
      plan.sourceIngestManifestUri,
    ])).toBeUndefined()
    expect(queryClient.getQueryData([
      ...FILES_COLLECTION_QUERY_KEYS.rawText,
      plan.sourceProposal.proposalResourceUri,
    ])).toBeUndefined()
    expect(queryClient.getQueryData([
      ...FILES_COLLECTION_QUERY_KEYS.rawText,
      plan.targetResourceUri,
    ])).toBeUndefined()
  })

  it('optimistically stages refresh Ingest manifest and proposal caches through the collection boundary', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl'
    const subject = `${documentUri}#card`
    const bodyResourceUri = 'https://pod.example/.data/workspaces/ws-1/cards/report.md'
    const manifestUri = 'https://pod.example/.data/ingest/sources/report/manifest.ttl'
    const oldManifest = createSourceIngestManifest({
      documentUri,
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceHash: 'sha256-old',
      ingestVersion: 'pdf-ingest-v1',
      manifestUri,
      status: 'complete',
      ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [],
      priorityQueue: [],
      readChunks: 1,
      totalChunks: 1,
      lastIngestedAt: '2026-06-17T00:00:00.000Z',
    })
    const manifestQueryKey = [...FILES_COLLECTION_QUERY_KEYS.rawText, manifestUri] as const
    const proposalQueryKey = sourceUpdateProposalCollection.queryKey(documentUri)
    queryClient.setQueryData(manifestQueryKey, {
      uri: manifestUri,
      content: renderSourceIngestManifestTurtle(oldManifest),
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: { etag: '"manifest-1"' },
    })
    queryClient.setQueryData(proposalQueryKey, [])

    let resolveManifest!: () => void
    mocks.ensureSourceIngestManifestResource.mockImplementationOnce((_db, manifest) => new Promise((resolve) => {
      resolveManifest = () => resolve({ action: 'updated', manifest })
    }))
    const fetchSource = vi.fn().mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70, 45, 50]), {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))
    const ingestAdapter = vi.fn().mockResolvedValue({
      markdown: '# Report\n\nRefreshed body.',
      sourceHash: 'sha256-new',
      mimeType: 'application/pdf',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })

    const request = sourceIngestCollection.refreshWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      fetchSource,
      input: {
        documentUri,
        subject,
        targetResourceUri: bodyResourceUri,
        sourceUri: 'https://pod.example/public/report.pdf',
        sourceKind: 'pdf',
        title: 'Report',
        mimeType: 'application/pdf',
        currentSourceHash: 'sha256-old',
        sourceIngestManifestUri: manifestUri,
        ingestAdapter,
      },
    })

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(proposalQueryKey)).toEqual([
        expect.objectContaining({
          documentUri,
          subject,
          targetResourceUri: bodyResourceUri,
          sourceHash: 'sha256-new',
          proposedContent: expect.stringContaining('Refreshed body.'),
          status: 'pending',
          writesCanonicalContent: false,
        }),
      ])
    })
    expect(queryClient.getQueryData<{ content: string }>(manifestQueryKey)?.content).toContain('udfs:sourceHash "sha256-new"')
    const stagedProposal = queryClient.getQueryData<ReturnType<typeof createSourceUpdateProposal>[]>(proposalQueryKey)?.[0]
    expect(stagedProposal).toBeDefined()
    expect(queryClient.getQueryData<{ content: string }>([
      ...FILES_COLLECTION_QUERY_KEYS.rawText,
      stagedProposal!.proposalResourceUri,
    ])?.content).toContain('udfs:SourceUpdateProposal')

    resolveManifest()
    await expect(request).resolves.toMatchObject({
      action: 'changed',
      sourceProposal: expect.objectContaining({
        documentUri,
        targetResourceUri: bodyResourceUri,
        sourceHash: 'sha256-new',
      }),
    })
  })

  it('rolls back optimistic refresh Ingest caches when remote refresh fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl'
    const subject = `${documentUri}#card`
    const bodyResourceUri = 'https://pod.example/.data/workspaces/ws-1/cards/report.md'
    const manifestUri = 'https://pod.example/.data/ingest/sources/report/manifest.ttl'
    const oldManifest = createSourceIngestManifest({
      documentUri,
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceHash: 'sha256-old',
      ingestVersion: 'pdf-ingest-v1',
      manifestUri,
      status: 'complete',
      ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [],
      priorityQueue: [],
      readChunks: 1,
      totalChunks: 1,
      lastIngestedAt: '2026-06-17T00:00:00.000Z',
    })
    const existingProposal = createSourceUpdateProposal({
      documentUri,
      subject,
      targetResourceUri: bodyResourceUri,
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceIngestManifestUri: manifestUri,
      sourceHash: 'sha256-existing',
      ingestVersion: 'pdf-ingest-v1',
      snapshotAt: '2026-06-17T01:00:00.000Z',
      createdAt: '2026-06-17T01:00:00.000Z',
      podRootUri: 'https://pod.example/',
    })
    const manifestQueryKey = [...FILES_COLLECTION_QUERY_KEYS.rawText, manifestUri] as const
    const proposalQueryKey = sourceUpdateProposalCollection.queryKey(documentUri)
    const originalManifestContent = renderSourceIngestManifestTurtle(oldManifest)
    queryClient.setQueryData(manifestQueryKey, {
      uri: manifestUri,
      content: originalManifestContent,
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: { etag: '"manifest-1"' },
    })
    queryClient.setQueryData(proposalQueryKey, [existingProposal])

    let rejectManifest!: () => void
    mocks.ensureSourceIngestManifestResource.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectManifest = () => reject(new Error('refresh manifest write failed'))
    }))
    const fetchSource = vi.fn().mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70, 45, 50]), {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }))
    const ingestAdapter = vi.fn().mockResolvedValue({
      markdown: '# Report\n\nRefreshed body.',
      sourceHash: 'sha256-new',
      mimeType: 'application/pdf',
      totalChunks: 1,
      pendingRanges: [],
      priorityQueue: [],
    })

    const request = sourceIngestCollection.refreshWithCache({
      cacheClient: queryClient,
      actorWebId: 'https://pod.example/profile#me',
      fetchSource,
      input: {
        documentUri,
        subject,
        targetResourceUri: bodyResourceUri,
        sourceUri: 'https://pod.example/public/report.pdf',
        sourceKind: 'pdf',
        title: 'Report',
        mimeType: 'application/pdf',
        currentSourceHash: 'sha256-old',
        sourceIngestManifestUri: manifestUri,
        ingestAdapter,
      },
    })

    let stagedProposalResourceUri = ''
    await vi.waitFor(() => {
      const proposals = queryClient.getQueryData<ReturnType<typeof createSourceUpdateProposal>[]>(proposalQueryKey)
      expect(proposals).toHaveLength(2)
      stagedProposalResourceUri = proposals!.find((proposal) => proposal.sourceHash === 'sha256-new')!.proposalResourceUri
    })
    expect(queryClient.getQueryData<{ content: string }>(manifestQueryKey)?.content).toContain('udfs:sourceHash "sha256-new"')

    rejectManifest()
    await expect(request).rejects.toThrow('refresh manifest write failed')
    expect(queryClient.getQueryData(proposalQueryKey)).toEqual([existingProposal])
    expect(queryClient.getQueryData<{ content: string }>(manifestQueryKey)?.content).toBe(originalManifestContent)
    expect(queryClient.getQueryData([
      ...FILES_COLLECTION_QUERY_KEYS.rawText,
      stagedProposalResourceUri,
    ])).toBeUndefined()
  })

  it('optimistically updates Ingest manifest raw text cache while requesting a range', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceHash: 'sha256-report',
      ingestVersion: 'pdf-ingest-v1',
      status: 'partial',
      ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [],
      priorityQueue: [],
      readChunks: 1,
      totalChunks: 3,
      lastIngestedAt: '2026-06-17T00:00:00.000Z',
    })
    const range = { start: 'chunk:2', end: 'chunk:2' }
    const rawTextQueryKey = [...FILES_COLLECTION_QUERY_KEYS.rawText, manifest.manifestUri] as const
    queryClient.setQueryData(rawTextQueryKey, {
      uri: manifest.manifestUri,
      content: renderSourceIngestManifestTurtle(manifest),
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: { etag: '"manifest-1"' },
    })

    const queuedManifest = createSourceIngestManifest({
      documentUri: manifest.manifestUri,
      sourceUri: manifest.sourceUri,
      sourceHash: manifest.sourceHash,
      ingestVersion: manifest.ingestVersion,
      manifestUri: manifest.manifestUri,
      status: 'partial',
      ingestedRanges: manifest.ingestedRanges,
      pendingRanges: [range],
      priorityQueue: ['chunk:2..chunk:2'],
      readChunks: 1,
      totalChunks: 3,
      lastIngestedAt: '2026-06-18T00:00:00.000Z',
    })
    let resolveRemote!: () => void
    mocks.ensureSourceIngestManifestResource.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRemote = () => resolve({
        action: 'updated-priority',
        manifest: queuedManifest,
      })
    }))

    const request = sourceIngestCollection.requestRangeWithCache({
      cacheClient: queryClient,
      manifest,
      range,
      requestedAt: '2026-06-18T00:00:00.000Z',
    })

    await vi.waitFor(() => {
      expect(queryClient.getQueryData<{ content: string }>(rawTextQueryKey)?.content).toContain('udfs:pendingRange "chunk:2..chunk:2"')
    })
    expect(queryClient.getQueryData<{ content: string }>(rawTextQueryKey)?.content).toContain('udfs:priorityQueue "chunk:2..chunk:2"')

    resolveRemote()
    await expect(request).resolves.toEqual({
      action: 'updated-priority',
      manifest: queuedManifest,
    })
  })

  it('rolls back optimistic Ingest manifest raw text cache when range request fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const manifest = createSourceIngestManifest({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceHash: 'sha256-report',
      ingestVersion: 'pdf-ingest-v1',
      status: 'partial',
      ingestedRanges: [{ start: 'chunk:1', end: 'chunk:1' }],
      pendingRanges: [],
      priorityQueue: [],
      readChunks: 1,
      totalChunks: 3,
      lastIngestedAt: '2026-06-17T00:00:00.000Z',
    })
    const range = { start: 'chunk:2', end: 'chunk:2' }
    const rawTextQueryKey = [...FILES_COLLECTION_QUERY_KEYS.rawText, manifest.manifestUri] as const
    const originalContent = renderSourceIngestManifestTurtle(manifest)
    queryClient.setQueryData(rawTextQueryKey, {
      uri: manifest.manifestUri,
      content: originalContent,
      mimeType: 'text/turtle',
      etag: '"manifest-1"',
      headers: { etag: '"manifest-1"' },
    })
    let rejectRemote!: () => void
    mocks.ensureSourceIngestManifestResource.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectRemote = () => reject(new Error('remote write failed'))
    }))

    const request = sourceIngestCollection.requestRangeWithCache({
      cacheClient: queryClient,
      manifest,
      range,
      requestedAt: '2026-06-18T00:00:00.000Z',
    })

    await vi.waitFor(() => {
      expect(queryClient.getQueryData<{ content: string }>(rawTextQueryKey)?.content).toContain('udfs:pendingRange "chunk:2..chunk:2"')
    })

    rejectRemote()
    await expect(request).rejects.toThrow('remote write failed')
    expect(queryClient.getQueryData<{ content: string }>(rawTextQueryKey)?.content).toBe(originalContent)
  })

  it('owns proposal and Ingest invalidation query details at the collection boundary', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const structuredProposal = createStructuredCellChangeProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Draft title"'],
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const vocabProposal = createVocabTermProposal({
      documentUri: structuredProposal.documentUri,
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short summary.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const accessProposal = createAccessPolicyProposal({
      ownerUri: 'https://pod.example/public/report.md',
      activePolicyUri: 'https://pod.example/public/report.md.acl',
      targetPolicyUri: 'https://pod.example/public/report.md.acl',
      provider: 'acl',
      audience: 'agent',
      audienceRef: 'https://agent.example/profile#me',
      role: 'editor',
      modes: ['read', 'append', 'write'],
      reason: 'Allow agent edits.',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const sourceProposal = createSourceUpdateProposal({
      documentUri: structuredProposal.documentUri,
      subject: '#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/sources/report/manifest.ttl',
      sourceHash: 'sha256-new',
      ingestVersion: 'pdf-ingest-v1',
      snapshotAt: '2026-06-18T00:00:00.000Z',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const aiProposal = createAiChangeProposal({
      targetResourceUri: 'https://pod.example/public/report.md',
      documentUri: structuredProposal.documentUri,
      proposedContent: '# AI replacement',
      summary: 'AI replacement pending review.',
      diff: '+ AI replacement',
      createdAt: '2026-06-18T00:00:00.000Z',
    })
    const ingestPlan = createSourceIngestPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/index.ttl',
      containerUri: 'https://pod.example/.data/workspaces/ws-1/cards/',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceKind: 'pdf',
      title: 'Report',
      ingestSnapshot: {
        content: '# Report',
        sourceHash: 'sha256-report',
        mimeType: 'application/pdf',
        pendingRanges: [],
        priorityQueue: [],
      },
      podRootUri: 'https://pod.example/',
    })
    const refreshPlan = createSourceRefreshPlan({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl',
      subject: '#card',
      targetResourceUri: 'https://pod.example/.data/workspaces/ws-1/cards/report.md',
      sourceUri: 'https://pod.example/public/report.pdf',
      sourceKind: 'pdf',
      title: 'Report',
      currentSourceHash: 'sha256-old',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/sources/report/manifest.ttl',
      ingestSnapshot: {
        content: '# Refreshed report',
        sourceHash: 'sha256-new',
        mimeType: 'application/pdf',
        pendingRanges: [],
        priorityQueue: [],
      },
      podRootUri: 'https://pod.example/',
    })

    await structuredCellProposalCollection.invalidateCreate(queryClient, structuredProposal)
    await vocabTermProposalCollection.invalidateApproval(queryClient, { uri: vocabProposal.targetVocabUri })
    await vocabTermProposalCollection.invalidateCreate(queryClient, vocabProposal)
    await accessPolicyProposalCollection.invalidateCreate(queryClient, accessProposal)
    await sourceUpdateProposalCollection.invalidateCreate(queryClient, sourceProposal)
    await aiChangeProposalCollection.invalidateCreate(queryClient, aiProposal)
    await sourceIngestCollection.invalidateCreate(queryClient, ingestPlan)
    await sourceIngestCollection.invalidateRefresh(queryClient, refreshPlan)
    await sourceIngestCollection.invalidateManifest(queryClient, {
      manifest: { manifestUri: sourceProposal.sourceIngestManifestUri },
    })

    for (const queryKey of [
      [...FILES_COLLECTION_QUERY_KEYS.rawText, structuredProposal.proposalResourceUri],
      [...FILES_COLLECTION_QUERY_KEYS.detail, structuredProposal.documentUri],
      structuredCellProposalCollection.queryKey(structuredProposal.documentUri),
      FILES_COLLECTION_QUERY_KEYS.entries,
      FILES_COLLECTION_QUERY_KEYS.children,
      [...FILES_COLLECTION_QUERY_KEYS.rawText, vocabProposal.targetVocabUri],
      [...FILES_COLLECTION_QUERY_KEYS.detail, vocabProposal.targetVocabUri],
      [...FILES_COLLECTION_QUERY_KEYS.rawText, vocabProposal.targetShapesUri],
      [...FILES_COLLECTION_QUERY_KEYS.detail, vocabProposal.targetShapesUri],
      [...FILES_COLLECTION_QUERY_KEYS.rawText, 'https://pod.example/.vocab/namespaces.ttl'],
      [...FILES_COLLECTION_QUERY_KEYS.detail, 'https://pod.example/.vocab/namespaces.ttl'],
      vocabTermProposalCollection.queryKey(vocabProposal.documentUri),
      [...FILES_COLLECTION_QUERY_KEYS.accessBasics, accessProposal.ownerUri, 'resource'],
      accessPolicyProposalCollection.queryKey(accessProposal.ownerUri),
      sourceUpdateProposalCollection.queryKey(sourceProposal.documentUri),
      [...FILES_COLLECTION_QUERY_KEYS.rawText, sourceProposal.proposalResourceUri],
      [...FILES_COLLECTION_QUERY_KEYS.detail, aiProposal.targetResourceUri],
      [...FILES_COLLECTION_QUERY_KEYS.rawText, aiProposal.targetResourceUri],
      [...FILES_COLLECTION_QUERY_KEYS.detail, ingestPlan.targetResourceUri],
      [...FILES_COLLECTION_QUERY_KEYS.rawText, ingestPlan.targetResourceUri],
      [...FILES_COLLECTION_QUERY_KEYS.detail, ingestPlan.bodyResourceUri],
      [...FILES_COLLECTION_QUERY_KEYS.rawText, ingestPlan.bodyResourceUri],
      [...FILES_COLLECTION_QUERY_KEYS.rawText, ingestPlan.sourceIngestManifestUri],
      [...FILES_COLLECTION_QUERY_KEYS.rawText, ingestPlan.sourceProposal.proposalResourceUri],
      [...FILES_COLLECTION_QUERY_KEYS.rawText, refreshPlan.sourceIngestManifestUri],
      [...FILES_COLLECTION_QUERY_KEYS.rawText, refreshPlan.sourceProposal!.proposalResourceUri],
      ['inbox'],
      ['inbox', 'approvals'],
      ['inbox', 'audit'],
      ['inbox', 'notifications'],
      ['inbox', 'items'],
    ]) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey })
    }
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: [...FILES_COLLECTION_QUERY_KEYS.entries, 'https://pod.example/.data/workspaces/ws-1/cards/'],
    })
  })
})
