import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { FilesDetail } from '../../domain/resource/resource-model'
import { createSourceUpdateProposal } from '../../domain/source/source-approval-model'
import type { SourceLinkedCardDescriptor } from '../../domain/source/source-ingest'
import {
  getSourceLinkedCardSubject,
  projectExpectedSourceUpdateProposal,
  projectSourceLinkedCardBodyFile,
  projectSourceLinkedCardBodyPreviewText,
  selectCurrentSourceUpdateProposal,
} from './source-linked-card-workflow-model'

const sourceWorkflowModelPath = 'src/modules/files/features/detail/source-linked-card-workflow-model.ts'
const sourceWorkflowControllerPath = 'src/modules/files/features/detail/useSourceLinkedCardWorkflowController.ts'

function file(overrides: Partial<FilesDetail> = {}): FilesDetail {
  return {
    id: overrides.uri ?? 'https://pod.example/files/report.card.ttl',
    uri: overrides.uri ?? 'https://pod.example/files/report.card.ttl',
    name: overrides.name ?? 'report.card.ttl',
    kind: overrides.kind ?? 'resource',
    semanticKind: overrides.semanticKind ?? 'structured',
    parentUri: overrides.parentUri ?? 'https://pod.example/files/',
    mimeType: overrides.mimeType ?? 'text/turtle',
    size: overrides.size ?? 220,
    modifiedAt: overrides.modifiedAt ?? null,
    headers: overrides.headers ?? {},
    previewText: overrides.previewText ?? null,
  }
}

function descriptor(overrides: Partial<SourceLinkedCardDescriptor> = {}): SourceLinkedCardDescriptor {
  return {
    title: overrides.title ?? 'Imported report',
    tags: overrides.tags ?? [],
    tagsPreviousValues: overrides.tagsPreviousValues ?? [],
    reviewStatus: overrides.reviewStatus ?? 'pending',
    reviewStatusPreviousValues: overrides.reviewStatusPreviousValues ?? [],
    sourceUri: overrides.sourceUri ?? 'https://source.example/report',
    mimeType: overrides.mimeType ?? 'text/html',
    sourceKind: overrides.sourceKind ?? 'url',
    sourceHash: overrides.sourceHash ?? 'sha256:old',
    ingestVersion: overrides.ingestVersion ?? 'parser-v2',
    sourceIngestManifestUri: overrides.sourceIngestManifestUri ?? 'https://pod.example/.index/ingest/report.ttl',
    bodyResourceUri: overrides.bodyResourceUri,
    createdAt: overrides.createdAt ?? '2026-06-01T00:00:00.000Z',
    writesCanonicalContent: overrides.writesCanonicalContent ?? false,
  }
}

describe('source-linked card workflow model', () => {
  it('keeps source-linked body/proposal projection in a pure model', () => {
    expect(existsSync(sourceWorkflowModelPath)).toBe(true)
    expect(existsSync(sourceWorkflowControllerPath)).toBe(true)
    if (!existsSync(sourceWorkflowModelPath) || !existsSync(sourceWorkflowControllerPath)) return

    const modelSource = readFileSync(sourceWorkflowModelPath, 'utf8')
    const controllerSource = readFileSync(sourceWorkflowControllerPath, 'utf8')

    expect(modelSource).toContain('export function getSourceLinkedCardSubject')
    expect(modelSource).toContain('export function projectExpectedSourceUpdateProposal')
    expect(modelSource).toContain('export function selectCurrentSourceUpdateProposal')
    expect(modelSource).toContain('export function projectSourceLinkedCardBodyFile')
    expect(modelSource).toContain('export function projectSourceLinkedCardBodyPreviewText')
    expect(modelSource).not.toContain('useToast')
    expect(modelSource).not.toContain('useState')
    expect(modelSource).not.toContain('useMemo')
    expect(controllerSource).toContain("from './source-linked-card-workflow-model'")
    expect(controllerSource).not.toMatch(/\nfunction sourceLinkedCardBodyName\(/)
    expect(controllerSource).not.toMatch(/\nfunction sourceLinkedCardSubject\(/)
    expect(controllerSource).not.toContain('.filter((proposal)')
    expect(controllerSource).not.toContain('sort((left, right)')
  })

  it('projects expected source proposal and selects the newest matching pending proposal', () => {
    const card = file()
    const source = descriptor()
    const bodyUri = 'https://pod.example/files/report.md'
    const subject = getSourceLinkedCardSubject(card.uri)
    const expected = projectExpectedSourceUpdateProposal({
      fileUri: card.uri,
      descriptor: source,
      bodyUri,
    })

    expect(subject).toBe('https://pod.example/files/report.card.ttl#card')
    expect(expected).toEqual(expect.objectContaining({
      documentUri: card.uri,
      subject,
      targetResourceUri: bodyUri,
      sourceUri: source.sourceUri,
      sourceIngestManifestUri: source.sourceIngestManifestUri,
      ingestVersion: source.ingestVersion,
      sourceHash: source.sourceHash,
      writesCanonicalContent: false,
    }))

    const older = createSourceUpdateProposal({
      documentUri: card.uri,
      subject,
      targetResourceUri: bodyUri,
      sourceUri: source.sourceUri,
      createdAt: '2026-06-01T00:00:00.000Z',
    })
    const newer = createSourceUpdateProposal({
      documentUri: card.uri,
      subject,
      targetResourceUri: bodyUri,
      sourceUri: source.sourceUri,
      createdAt: '2026-06-02T00:00:00.000Z',
    })
    const other = createSourceUpdateProposal({
      documentUri: card.uri,
      subject,
      targetResourceUri: bodyUri,
      sourceUri: 'https://source.example/other',
      createdAt: '2026-06-03T00:00:00.000Z',
    })

    expect(selectCurrentSourceUpdateProposal({
      proposals: [older, other, newer],
      documentUri: card.uri,
      subject,
      targetResourceUri: bodyUri,
      sourceUri: source.sourceUri,
    })).toBe(newer)
    expect(selectCurrentSourceUpdateProposal({
      proposals: [other],
      documentUri: card.uri,
      subject,
      targetResourceUri: bodyUri,
      sourceUri: source.sourceUri,
    })).toBeNull()
  })

  it('projects source-linked body file and preview text without controller branching', () => {
    const card = file({ name: 'report.card.ttl' })
    const source = descriptor({ title: 'Imported report' })
    const bodyUri = 'https://pod.example/files/body%20resource.md'
    const bodyFile = projectSourceLinkedCardBodyFile({
      file: card,
      descriptor: source,
      bodyUri,
      displayIngestVersion: 'ingest-v2',
    })

    expect(bodyFile).toEqual(expect.objectContaining({
      id: bodyUri,
      uri: bodyUri,
      name: 'body resource.md',
      semanticKind: 'file',
      mimeType: 'text/markdown',
      previewText: [
        '# Imported report',
        '',
        'Source: https://source.example/report',
        'Ingest: ingest-v2',
        'Ingest 记录: https://pod.example/.index/ingest/report.ttl',
        '',
        '确认 Ingest 审批后才会写入正文资源。',
      ].join('\n'),
    }))
    expect(projectSourceLinkedCardBodyPreviewText({
      bodyFile,
      bodyContent: '# Canonical\n',
      sourceProposalContent: '# Pending\n',
    })).toBe('# Canonical\n')
    expect(projectSourceLinkedCardBodyPreviewText({
      bodyFile,
      bodyContent: null,
      sourceProposalContent: '# Pending\n',
    })).toBe('# Pending\n')
    expect(projectSourceLinkedCardBodyPreviewText({
      bodyFile: null,
      bodyContent: '# Canonical\n',
      sourceProposalContent: '# Pending\n',
    })).toBeNull()
  })
})
