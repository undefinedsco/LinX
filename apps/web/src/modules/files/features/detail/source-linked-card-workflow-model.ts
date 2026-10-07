import { sourceLinkedCardBodyUri } from '../../domain/detail/detail-metadata-editor-model'
import type { FilesDetail } from '../../domain/resource/resource-model'
import {
  createSourceUpdateProposal,
  type SourceUpdateProposal,
} from '../../domain/source/source-approval-model'
import type { SourceLinkedCardDescriptor } from '../../domain/source/source-ingest'

export function getSourceLinkedCardSubject(fileUri: string) {
  return `${fileUri}#card`
}

function getSourceLinkedCardBodyName({
  fileName,
  descriptorTitle,
  bodyUri,
}: {
  fileName: string
  descriptorTitle: string
  bodyUri: string
}) {
  const segments = bodyUri.split('/').filter(Boolean)
  const lastSegment = decodeURIComponent(segments[segments.length - 1] ?? '')
  if (lastSegment) return lastSegment
  if (fileName.endsWith('.card.ttl')) return `${fileName.slice(0, -'.card.ttl'.length)}.md`
  return `${descriptorTitle || fileName}.md`
}

export function resolveSourceLinkedCardBodyUri({
  fileUri,
  descriptor,
}: {
  fileUri: string
  descriptor: SourceLinkedCardDescriptor | null
}) {
  if (!descriptor) return null
  return descriptor.bodyResourceUri ?? sourceLinkedCardBodyUri(fileUri)
}

export function projectExpectedSourceUpdateProposal({
  fileUri,
  descriptor,
  bodyUri,
}: {
  fileUri: string
  descriptor: SourceLinkedCardDescriptor | null
  bodyUri: string | null
}): SourceUpdateProposal | null {
  if (!descriptor || !bodyUri) return null
  return createSourceUpdateProposal({
    documentUri: fileUri,
    subject: getSourceLinkedCardSubject(fileUri),
    targetResourceUri: bodyUri,
    sourceUri: descriptor.sourceUri,
    sourceIngestManifestUri: descriptor.sourceIngestManifestUri,
    ingestVersion: descriptor.ingestVersion,
    sourceHash: descriptor.sourceHash,
  })
}

export function selectCurrentSourceUpdateProposal({
  proposals,
  documentUri,
  subject,
  targetResourceUri,
  sourceUri,
}: {
  proposals: SourceUpdateProposal[]
  documentUri: string
  subject: string
  targetResourceUri: string
  sourceUri: string
}) {
  return proposals
    .filter((proposal) => (
      proposal.documentUri === documentUri
      && proposal.subject === subject
      && proposal.targetResourceUri === targetResourceUri
      && proposal.sourceUri === sourceUri
    ))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null
}

export function projectSourceLinkedCardBodyFile({
  file,
  descriptor,
  bodyUri,
  displayIngestVersion,
}: {
  file: FilesDetail
  descriptor: SourceLinkedCardDescriptor | null
  bodyUri: string | null
  displayIngestVersion: string
}): FilesDetail | null {
  if (!descriptor || !bodyUri) return null
  return {
    ...file,
    id: bodyUri,
    uri: bodyUri,
    name: getSourceLinkedCardBodyName({
      fileName: file.name,
      descriptorTitle: descriptor.title,
      bodyUri,
    }),
    semanticKind: 'file',
    mimeType: 'text/markdown',
    previewText: [
      `# ${descriptor.title}`,
      '',
      `Source: ${descriptor.sourceUri}`,
      `Ingest: ${displayIngestVersion}`,
      `Ingest 记录: ${descriptor.sourceIngestManifestUri}`,
      '',
      '确认 Ingest 审批后才会写入正文资源。',
    ].join('\n'),
  }
}

export function projectSourceLinkedCardBodyPreviewText({
  bodyFile,
  bodyContent,
  sourceProposalContent,
}: {
  bodyFile: FilesDetail | null
  bodyContent: string | null | undefined
  sourceProposalContent: string | null | undefined
}) {
  if (!bodyFile) return null
  return bodyContent ?? sourceProposalContent ?? bodyFile.previewText
}
