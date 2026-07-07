import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { FilesDetail } from '../../domain/resource/resource-model'
import type { SourceLinkedCardDescriptor } from '../../domain/source/source-ingest'
import type { useSourceLinkedCardWorkflowController } from './useSourceLinkedCardWorkflowController'
import { useSourceLinkedCardPreviewController } from './useSourceLinkedCardPreviewController'

const { mockUseSourceLinkedCardWorkflowController } = vi.hoisted(() => ({
  mockUseSourceLinkedCardWorkflowController: vi.fn(),
}))

vi.mock('./useSourceLinkedCardWorkflowController', () => ({
  useSourceLinkedCardWorkflowController: (...args: unknown[]) => mockUseSourceLinkedCardWorkflowController(...args),
}))

type SourceLinkedCardWorkflow = ReturnType<typeof useSourceLinkedCardWorkflowController>

const cardFile: FilesDetail = {
  id: 'https://pod.example/.data/cards/report.card.ttl',
  uri: 'https://pod.example/.data/cards/report.card.ttl',
  name: 'report.card.ttl',
  kind: 'resource',
  semanticKind: 'source-linked-card',
  parentUri: 'https://pod.example/.data/cards/',
  mimeType: 'text/turtle',
  size: 128,
  modifiedAt: '2026-06-29T00:00:00.000Z',
  headers: {},
  previewText: '<#card> a udfs:SourceLinkedCard .',
}

function descriptor(overrides: Partial<SourceLinkedCardDescriptor> = {}): SourceLinkedCardDescriptor {
  return {
    title: 'Quarterly report',
    tags: [],
    tagsPreviousValues: [],
    reviewStatus: '',
    reviewStatusPreviousValues: [],
    sourceUri: 'https://example.com/report.pdf',
    mimeType: 'application/pdf',
    sourceKind: 'pdf',
    sourceHash: 'sha256-report',
    ingestVersion: '3',
    sourceIngestManifestUri: 'https://pod.example/.parser/report/manifest.ttl',
    bodyResourceUri: 'https://pod.example/.data/cards/report.md',
    createdAt: '2026-06-29T09:30:00.000Z',
    writesCanonicalContent: false,
    ...overrides,
  }
}

function workflow(overrides: Partial<SourceLinkedCardWorkflow> = {}): SourceLinkedCardWorkflow {
  const sourceDescriptor = descriptor()
  const bodyFile: FilesDetail = {
    ...cardFile,
    id: sourceDescriptor.bodyResourceUri ?? '',
    uri: sourceDescriptor.bodyResourceUri ?? '',
    name: 'report.md',
    semanticKind: 'file',
    mimeType: 'text/markdown',
    previewText: '# Quarterly report',
  }

  return {
    bodyFile,
    bodyPreviewText: '# Quarterly report',
    bodyUri: bodyFile.uri,
    descriptor: sourceDescriptor,
    displayIngestVersion: 'v3',
    expectedSourceProposal: {
      documentUri: cardFile.uri,
      sourceIngestManifestUri: sourceDescriptor.sourceIngestManifestUri,
      sourceUri: sourceDescriptor.sourceUri,
      subject: `${cardFile.uri}#card`,
      targetResourceUri: bodyFile.uri,
    } as SourceLinkedCardWorkflow['expectedSourceProposal'],
    keepLocalEdits: vi.fn(),
    openBodyResource: vi.fn(),
    openSource: vi.fn(),
    pendingSourceProposalsLoading: false,
    refreshPending: false,
    refreshSourceLinkedCard: vi.fn(),
    requestAllSourceIngestRanges: vi.fn(),
    requestNextSourceIngestRange: vi.fn(),
    requestSourceIngestRangePending: false,
    resolveSourceApprovalPending: false,
    reviewSourceUpdate: vi.fn(),
    sourceActionError: null,
    sourceApproval: { id: 'approval-1', status: 'pending' } as SourceLinkedCardWorkflow['sourceApproval'],
    sourceCreatePending: false,
    sourceIngestManifest: {
      status: 'partial',
      readChunks: 2,
      totalChunks: 4,
      pendingRanges: [{ start: 4, end: 8 }],
      lastIngestedAt: '2026-06-29T10:00:00.000Z',
    } as SourceLinkedCardWorkflow['sourceIngestManifest'],
    sourceProposal: {
      id: 'proposal-1',
      status: 'pending',
      summary: 'Refresh parsed report',
      diff: '+ updated section',
      targetResourceUri: bodyFile.uri,
      proposedContent: '# Staged report',
    } as SourceLinkedCardWorkflow['sourceProposal'],
    ...overrides,
  }
}

describe('useSourceLinkedCardPreviewController', () => {
  it('owns preview sheet state, source detail expansion, action id, and detail row projection', () => {
    mockUseSourceLinkedCardWorkflowController.mockReturnValue(workflow())

    const { result } = renderHook(() => useSourceLinkedCardPreviewController(cardFile))

    expect(result.current.sheetOpen).toBe(false)
    expect(result.current.sourceDetailsOpen).toBe(false)
    expect(result.current.sourceActionErrorId).toMatch(/^files-source-linked-card-action-error-[a-z0-9]+$/)
    expect(result.current.hasPendingIngestRanges).toBe(true)
    expect(result.current.primaryActions.map((action) => [action.id, action.disabled])).toEqual([
      ['open-source', false],
      ['open-body-resource', false],
      ['refresh-source', false],
      ['keep-local-edits', false],
      ['review-ingest', false],
    ])
    expect(result.current.ingestRangeActions.map((action) => [action.id, action.label, action.disabled])).toEqual([
      ['request-next-ingest-range', 'Ingest 下一段', false],
      ['request-all-ingest-ranges', 'Ingest 全部', false],
    ])
    expect(result.current.stagedIngestContent).toBe('# Staged report')
    expect(result.current.sourceDetailRows).toEqual(expect.arrayContaining([
      ['标题', 'Quarterly report'],
      ['来源', 'https://example.com/report.pdf'],
      ['类型', 'PDF'],
      ['已 Ingest chunk', '2 / 4'],
      ['待 Ingest', '4..8'],
      ['Ingest 审批', 'pending'],
      ['审批目标', 'https://pod.example/.data/cards/report.md'],
      ['审批状态', 'pending'],
      ['正文', 'https://pod.example/.data/cards/report.md'],
      ['写入方式', 'canonical 内容需审批后更新'],
    ]))

    act(() => result.current.openSheet())
    expect(result.current.sheetOpen).toBe(true)

    act(() => result.current.setSheetOpen(false))
    expect(result.current.sheetOpen).toBe(false)

    act(() => result.current.toggleSourceDetails())
    expect(result.current.sourceDetailsOpen).toBe(true)
  })

  it('returns an empty detail row projection until a descriptor is available', () => {
    mockUseSourceLinkedCardWorkflowController.mockReturnValue(workflow({
      bodyFile: null,
      bodyPreviewText: null,
      bodyUri: null,
      descriptor: null,
      sourceApproval: null,
      sourceIngestManifest: null,
      sourceProposal: null,
    }))

    const { result } = renderHook(() => useSourceLinkedCardPreviewController(cardFile))

    expect(result.current.source).toMatchObject({ descriptor: null })
    expect(result.current.hasPendingIngestRanges).toBe(false)
    expect(result.current.stagedIngestContent).toBeNull()
    expect(result.current.sourceDetailRows).toEqual([])
  })

  it('projects pending ingest range availability for source details actions', () => {
    mockUseSourceLinkedCardWorkflowController.mockReturnValue(workflow({
      sourceIngestManifest: {
        status: 'complete',
        readChunks: 4,
        totalChunks: 4,
        pendingRanges: [],
        lastIngestedAt: '2026-06-29T10:00:00.000Z',
      } as SourceLinkedCardWorkflow['sourceIngestManifest'],
    }))

    const { result } = renderHook(() => useSourceLinkedCardPreviewController(cardFile))

    expect(result.current.hasPendingIngestRanges).toBe(false)
  })
})
