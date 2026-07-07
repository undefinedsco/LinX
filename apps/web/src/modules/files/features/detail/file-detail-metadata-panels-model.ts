import type { FilesDetail, FilesMetaSidecar } from '../../domain/resource/resource-model'
import { resolveFilesResourceSidecars } from '../../domain/resource/resource-semantics'
import { extractFileMetaPredicateValues } from '../../domain/sidecar/meta-sidecar'
import {
  iriDetailCellValue,
  literalDetailCellValue,
  sourceLinkedCardBodyUri,
  type DetailMetaPredicateProposalStatus,
} from '../../domain/detail/detail-metadata-editor-model'
import {
  parseSourceLinkedCardTurtle,
  type SourceLinkedCardDescriptor,
} from '../../domain/source/source-ingest'

export type DetailMetaPredicateRelation = {
  label: string
  ariaLabel: string
  predicate: string
  value: string
  previousValues: string[]
}

export type DetailMetaPredicateStatusChrome = {
  ariaLabel: string
  className: string
  marker: '*' | '!'
  title: string
}

export type DetailRdfMetadataPanelModel = {
  labelPrefix: 'Card' | 'File'
  documentUri: string
  subject: string
  titleValue: string
  titlePreviousValues: string[]
  tagsValue: string
  tagsPreviousValues: string[]
  reviewStatusValue: string
  reviewStatusPreviousValues: string[]
  relation?: DetailMetaPredicateRelation
}

export type {
  DetailMetaPredicateProposalStatus,
}

export function projectDetailMetaPredicateStatusChrome({
  status,
  statusLabel,
}: {
  status?: DetailMetaPredicateProposalStatus
  statusLabel: string
}): DetailMetaPredicateStatusChrome | null {
  if (status === 'pending') {
    return {
      ariaLabel: `待审核更改：${statusLabel}`,
      className: 'text-[13px] font-semibold leading-none text-primary',
      marker: '*',
      title: '待审核更改',
    }
  }

  if (status === 'error') {
    return {
      ariaLabel: `meta predicate 更改提交失败：${statusLabel}`,
      className: 'text-[12px] font-semibold leading-none text-destructive',
      marker: '!',
      title: 'meta predicate 更改提交失败',
    }
  }

  return null
}

export function projectFileRdfMetadataPanelModel({
  file,
  meta,
  title,
}: {
  file: FilesDetail
  meta?: FilesMetaSidecar | null
  title: string
}): DetailRdfMetadataPanelModel {
  const metaUri = meta?.state === 'exists'
    ? meta.metaUri
    : resolveFilesResourceSidecars(file).metaUri
  const metaPredicates = meta?.state === 'exists'
    ? extractFileMetaPredicateValues(meta.metaUri, meta.mimeType, meta.content)
    : null
  const sourceValue = metaPredicates?.source ?? ''

  return {
    documentUri: metaUri,
    labelPrefix: 'File',
    relation: {
      ariaLabel: 'File source meta predicate',
      label: 'source',
      predicate: 'dcterms:source',
      previousValues: metaPredicates?.sourcePreviousValues ?? [],
      value: sourceValue,
    },
    reviewStatusPreviousValues: metaPredicates?.reviewStatusPreviousValues ?? [],
    reviewStatusValue: metaPredicates?.reviewStatus ?? '',
    subject: metaPredicates?.subject ?? '#meta',
    tagsPreviousValues: metaPredicates?.tagsPreviousValues ?? [],
    tagsValue: metaPredicates?.tags.join(', ') ?? '',
    titlePreviousValues: metaPredicates?.titlePreviousValues ?? [],
    titleValue: metaPredicates?.title || title,
  }
}

export function projectSourceLinkedCardMetadataPanelModel({
  descriptor,
  documentUri,
  fallbackBodyResourceUri,
}: {
  descriptor: SourceLinkedCardDescriptor
  documentUri: string
  fallbackBodyResourceUri: string
}): DetailRdfMetadataPanelModel {
  const bodyResourceUri = descriptor.bodyResourceUri ?? fallbackBodyResourceUri

  return {
    documentUri,
    labelPrefix: 'Card',
    relation: {
      ariaLabel: 'Card relation meta predicate',
      label: 'relation',
      predicate: 'udfs:bodyResource',
      previousValues: iriDetailCellValue(bodyResourceUri),
      value: bodyResourceUri,
    },
    reviewStatusPreviousValues: descriptor.reviewStatusPreviousValues,
    reviewStatusValue: descriptor.reviewStatus,
    subject: '#card',
    tagsPreviousValues: descriptor.tagsPreviousValues,
    tagsValue: descriptor.tags.join(', '),
    titlePreviousValues: [literalDetailCellValue(descriptor.title)],
    titleValue: descriptor.title,
  }
}

export function projectSourceLinkedCardDrawerMetadataPanelModel(file: FilesDetail) {
  const descriptor = file.previewText ? parseSourceLinkedCardTurtle(file.previewText) : null
  if (!descriptor) return null

  return projectSourceLinkedCardMetadataPanelModel({
    descriptor,
    documentUri: file.uri,
    fallbackBodyResourceUri: sourceLinkedCardBodyUri(file.uri),
  })
}
