import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { FilesDetail } from '../../domain/resource/resource-model'
import type { SourceLinkedCardDescriptor } from '../../domain/source/source-ingest'
import {
  createSourceLinkedCardPreviewState,
  createSourceLinkedCardActionErrorId,
  formatSourceLinkedCardIngestChunkProgress,
  projectSourceLinkedCardPreviewSheetOpen,
  projectSourceLinkedCardPreviewSourceDetailsToggled,
  projectSourceLinkedCardActionError,
  projectSourceLinkedCardDetailRows,
  projectSourceLinkedCardDetailsPanel,
  projectSourceLinkedCardEditorSheet,
  projectSourceLinkedCardPreviewContent,
  projectSourceLinkedCardIngestRangeActions,
  projectSourceLinkedCardPrimaryActions,
} from './source-linked-card-preview-model'

const modelPath = 'src/modules/files/features/detail/source-linked-card-preview-model.ts'

const bodyFile: FilesDetail = {
  id: 'https://pod.example/.data/cards/report.md',
  uri: 'https://pod.example/.data/cards/report.md',
  name: 'report.md',
  kind: 'resource',
  semanticKind: 'file',
  parentUri: 'https://pod.example/.data/cards/',
  mimeType: 'text/markdown',
  size: 512,
  modifiedAt: '2026-06-29T00:00:00.000Z',
  headers: {},
  previewText: '# Quarterly report',
}

const descriptor: SourceLinkedCardDescriptor = {
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
  bodyResourceUri: bodyFile.uri,
  createdAt: '2026-06-29T09:30:00.000Z',
  writesCanonicalContent: false,
}

const bodyRichEditorContent = {
  inputFormat: 'markdownish' as const,
  saveFormat: 'markdown' as const,
  text: '# Quarterly report',
}

describe('source-linked card preview model', () => {
  it('projects preview interaction state transitions as one state container', () => {
    const initial = createSourceLinkedCardPreviewState()

    expect(initial).toEqual({
      sheetOpen: false,
      sourceDetailsOpen: false,
    })

    const sheetOpen = projectSourceLinkedCardPreviewSheetOpen({
      current: initial,
      open: true,
    })
    expect(sheetOpen).toEqual({
      sheetOpen: true,
      sourceDetailsOpen: false,
    })

    const detailsOpen = projectSourceLinkedCardPreviewSourceDetailsToggled(sheetOpen)
    expect(detailsOpen).toEqual({
      sheetOpen: true,
      sourceDetailsOpen: true,
    })

    expect(projectSourceLinkedCardPreviewSheetOpen({
      current: detailsOpen,
      open: false,
    })).toEqual({
      sheetOpen: false,
      sourceDetailsOpen: true,
    })

    expect(projectSourceLinkedCardPreviewSourceDetailsToggled(detailsOpen)).toEqual(sheetOpen)
  })

  it('projects stable preview ids and ingest chunk progress outside UI primitives', () => {
    expect(createSourceLinkedCardActionErrorId('https://pod.example/.data/cards/report.card.ttl'))
      .toMatch(/^files-source-linked-card-action-error-[a-z0-9]+$/)

    expect(formatSourceLinkedCardIngestChunkProgress(2, 4)).toBe('2 / 4')
    expect(formatSourceLinkedCardIngestChunkProgress(2, 0)).toBe('2 / 未知')
    expect(formatSourceLinkedCardIngestChunkProgress(4, 2)).toBe('4 / 未知')
  })

  it('stays a pure projection model without React or component dependencies', () => {
    const modelSource = readFileSync(modelPath, 'utf8')

    expect(modelSource).not.toContain('useState')
    expect(modelSource).not.toContain('useMemo')
    expect(modelSource).not.toContain('FileEditorSheet')
    expect(modelSource).not.toContain('RichTextFileEditor')
  })

  it('projects primary action availability from workflow state', () => {
    const readyActions = projectSourceLinkedCardPrimaryActions({
      expectedSourceProposal: true,
      hasActionError: true,
      pendingSourceProposalsLoading: false,
      refreshPending: false,
      resolveSourceApprovalPending: false,
      sourceCreatePending: false,
    })

    expect(readyActions.map((action) => [action.id, action.disabled, action.describedByError])).toEqual([
      ['open-source', false, false],
      ['open-body-resource', false, false],
      ['refresh-source', false, true],
      ['keep-local-edits', false, true],
      ['review-ingest', false, true],
    ])

    const busyActions = projectSourceLinkedCardPrimaryActions({
      expectedSourceProposal: false,
      hasActionError: false,
      pendingSourceProposalsLoading: true,
      refreshPending: true,
      resolveSourceApprovalPending: true,
      sourceCreatePending: true,
    })

    expect(busyActions.map((action) => [action.id, action.disabled, action.describedByError])).toEqual([
      ['open-source', false, false],
      ['open-body-resource', false, false],
      ['refresh-source', true, false],
      ['keep-local-edits', true, false],
      ['review-ingest', true, false],
    ])
  })

  it('projects ingest range action labels and busy state', () => {
    expect(projectSourceLinkedCardIngestRangeActions({ requestPending: false }))
      .toEqual([
        { disabled: false, id: 'request-next-ingest-range', label: 'Ingest 下一段' },
        { disabled: false, id: 'request-all-ingest-ranges', label: 'Ingest 全部' },
      ])

    expect(projectSourceLinkedCardIngestRangeActions({ requestPending: true }))
      .toEqual([
        { disabled: true, id: 'request-next-ingest-range', label: '排队中' },
        { disabled: true, id: 'request-all-ingest-ranges', label: 'Ingest 全部' },
      ])
  })

  it('projects source-linked card main content states for the renderer', () => {
    expect(projectSourceLinkedCardPreviewContent({
      bodyFile: null,
      bodyPreviewText: null,
      bodyRichEditorContent,
      bodyRichTextWarning: null,
      bodyUri: null,
      descriptor: null,
      fallbackRawText: '<#card> a udfs:SourceLinkedCard .',
    })).toEqual({
      kind: 'unavailable',
      title: 'Source-linked card',
      description: 'Source-linked card metadata 暂不可用或不完整。',
      rawText: '<#card> a udfs:SourceLinkedCard .',
    })

    expect(projectSourceLinkedCardPreviewContent({
      bodyFile: null,
      bodyPreviewText: null,
      bodyRichEditorContent,
      bodyRichTextWarning: null,
      bodyUri: bodyFile.uri,
      descriptor,
      fallbackRawText: '<#card> a udfs:SourceLinkedCard .',
    })).toEqual({
      kind: 'unavailable',
      title: 'Source-linked card',
      description: '未找到这个 source-linked card 的正文资源。',
      rawText: '<#card> a udfs:SourceLinkedCard .',
    })

    expect(projectSourceLinkedCardPreviewContent({
      bodyFile,
      bodyPreviewText: '# Quarterly report',
      bodyRichEditorContent,
      bodyRichTextWarning: { title: '来源内容有冲突', description: '请先确认 Ingest 更新。' },
      bodyUri: bodyFile.uri,
      descriptor,
      fallbackRawText: '<#card> a udfs:SourceLinkedCard .',
    })).toEqual({
      kind: 'ready',
      title: 'Quarterly report',
      description: 'https://example.com/report.pdf',
      bodyFile,
      bodyRichEditorContent,
      bodyRichTextWarning: { title: '来源内容有冲突', description: '请先确认 Ingest 更新。' },
    })
  })

  it('projects editor sheet readiness from preview content instead of the controller branching on content kind', () => {
    const unavailableContent = projectSourceLinkedCardPreviewContent({
      bodyFile: null,
      bodyPreviewText: null,
      bodyRichEditorContent,
      bodyRichTextWarning: null,
      bodyUri: null,
      descriptor: null,
      fallbackRawText: '<#card> a udfs:SourceLinkedCard .',
    })
    const readyContent = projectSourceLinkedCardPreviewContent({
      bodyFile,
      bodyPreviewText: '# Quarterly report',
      bodyRichEditorContent,
      bodyRichTextWarning: null,
      bodyUri: bodyFile.uri,
      descriptor,
      fallbackRawText: '<#card> a udfs:SourceLinkedCard .',
    })

    expect(projectSourceLinkedCardEditorSheet({
      content: unavailableContent,
      descriptor,
      descriptorUri: 'https://pod.example/.data/cards/report.card.ttl',
      open: true,
      sourceProposal: {
        status: 'pending',
        summary: 'Refresh parsed report',
        diff: '+ updated section',
        targetResourceUri: bodyFile.uri,
        proposedContent: '# Staged report',
      },
    })).toBeNull()

    expect(projectSourceLinkedCardEditorSheet({
      content: readyContent,
      descriptor: null,
      descriptorUri: 'https://pod.example/.data/cards/report.card.ttl',
      open: true,
      sourceProposal: {
        status: 'pending',
        summary: 'Refresh parsed report',
        diff: '+ updated section',
        targetResourceUri: bodyFile.uri,
        proposedContent: '# Staged report',
      },
    })).toBeNull()

    expect(projectSourceLinkedCardEditorSheet({
      content: readyContent,
      descriptor,
      descriptorUri: 'https://pod.example/.data/cards/report.card.ttl',
      open: true,
      sourceProposal: {
        status: 'pending',
        summary: 'Refresh parsed report',
        diff: '+ updated section',
        targetResourceUri: bodyFile.uri,
        proposedContent: '# Staged report',
      },
    })).toEqual({
      descriptor,
      descriptorUri: 'https://pod.example/.data/cards/report.card.ttl',
      file: bodyFile,
      open: true,
      stagedSourceText: '# Staged report',
    })
  })

  it('projects source-linked card detail rows outside the preview controller', () => {
    expect(projectSourceLinkedCardDetailRows({
      approval: null,
      bodyUri: null,
      descriptor: null,
      displayIngestVersion: '',
      sourceIngestManifest: null,
      sourceProposal: null,
    })).toEqual([])

    expect(projectSourceLinkedCardDetailRows({
      approval: { id: 'approval-1', status: 'pending' },
      bodyUri: bodyFile.uri,
      descriptor,
      displayIngestVersion: 'v3',
      sourceIngestManifest: {
        status: 'partial',
        readChunks: 2,
        totalChunks: 4,
        pendingRanges: [{ start: 4, end: 8 }],
        lastIngestedAt: '2026-06-29T10:00:00.000Z',
      },
      sourceProposal: {
        id: 'proposal-1',
        status: 'pending',
        summary: 'Refresh parsed report',
        diff: '+ updated section',
        targetResourceUri: bodyFile.uri,
        proposedContent: '# Staged report',
      },
    })).toEqual([
      ['标题', 'Quarterly report'],
      ['来源', 'https://example.com/report.pdf'],
      ['类型', 'PDF'],
      ['格式', 'application/pdf'],
      ['Ingest', 'v3'],
      ['来源 hash', 'sha256-report'],
      ['Ingest 记录', 'https://pod.example/.parser/report/manifest.ttl'],
      ['Ingest 状态', 'partial'],
      ['已 Ingest chunk', '2 / 4'],
      ['待 Ingest', '4..8'],
      ['最近 Ingest', '2026/6/29 18:00:00'],
      ['Ingest 审批', 'pending'],
      ['审批摘要', 'Refresh parsed report'],
      ['审批 diff', '+ updated section'],
      ['审批目标', bodyFile.uri],
      ['待审批内容', '已准备'],
      ['审批状态', 'pending'],
      ['审批 ID', 'approval-1'],
      ['正文', bodyFile.uri],
      ['创建时间', '2026/6/29 17:30:00'],
      ['写入方式', 'canonical 内容需审批后更新'],
    ])
  })

  it('projects action error and source details panel availability outside the renderer', () => {
    expect(projectSourceLinkedCardActionError({
      id: 'files-source-linked-card-action-error-report',
      message: null,
    })).toBeNull()
    expect(projectSourceLinkedCardActionError({
      id: 'files-source-linked-card-action-error-report',
      message: 'Refresh failed',
    })).toEqual({
      id: 'files-source-linked-card-action-error-report',
      message: 'Refresh failed',
    })

    expect(projectSourceLinkedCardDetailsPanel({
      open: false,
      rawText: '<#card> a udfs:SourceLinkedCard .',
      rows: [['标题', 'Quarterly report']],
      sourceIngestManifest: {
        status: 'partial',
        readChunks: 2,
        totalChunks: 4,
        pendingRanges: [{ start: 4, end: 8 }],
        lastIngestedAt: '2026-06-29T10:00:00.000Z',
      },
      sourceProposal: {
        status: 'pending',
        summary: 'Refresh parsed report',
        diff: '+ updated section',
        targetResourceUri: bodyFile.uri,
        proposedContent: '# Staged report',
      },
    })).toBeNull()

    expect(projectSourceLinkedCardDetailsPanel({
      open: true,
      rawText: '<#card> a udfs:SourceLinkedCard .',
      rows: [['标题', 'Quarterly report']],
      sourceIngestManifest: {
        status: 'partial',
        readChunks: 2,
        totalChunks: 4,
        pendingRanges: [{ start: 4, end: 8 }],
        lastIngestedAt: '2026-06-29T10:00:00.000Z',
      },
      sourceProposal: {
        status: 'pending',
        summary: 'Refresh parsed report',
        diff: '+ updated section',
        targetResourceUri: bodyFile.uri,
        proposedContent: '# Staged report',
      },
    })).toEqual({
      badgeLabel: 'Source-linked card',
      description: 'Ingest 输出需审批后才更新 card 内容。',
      hasPendingIngestRangeActions: true,
      rawText: '<#card> a udfs:SourceLinkedCard .',
      rows: [['标题', 'Quarterly report']],
      stagedIngestContent: '# Staged report',
      title: 'Source-linked card',
    })

    expect(projectSourceLinkedCardDetailsPanel({
      open: true,
      rawText: '<#card> a udfs:SourceLinkedCard .',
      rows: [['标题', 'Quarterly report']],
      sourceIngestManifest: {
        status: 'complete',
        readChunks: 4,
        totalChunks: 4,
        pendingRanges: [],
        lastIngestedAt: '2026-06-29T10:00:00.000Z',
      },
      sourceProposal: {
        status: 'pending',
        summary: 'Refresh parsed report',
        diff: '+ updated section',
        targetResourceUri: bodyFile.uri,
        proposedContent: null,
      },
    })?.hasPendingIngestRangeActions).toBe(false)
  })
})
