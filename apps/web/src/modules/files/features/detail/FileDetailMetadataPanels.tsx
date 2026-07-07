import type { ReactNode } from 'react'


import type { FilesDetail, FilesMetaSidecar } from '../../domain/resource/resource-model'
import type { SourceLinkedCardDescriptor } from '../../domain/source/source-ingest'
import {
  type DetailMetaPredicateProposalStatus,
} from './file-detail-metadata-panels-model'
import { StructuredPredicateValueEditor } from '../structured/StructuredTableCellPrimitives'
import {
  projectDetailMetaPredicateStatusChrome,
  projectFileRdfMetadataPanelModel,
  projectSourceLinkedCardDrawerMetadataPanelModel,
  projectSourceLinkedCardMetadataPanelModel,
  type DetailMetaPredicateRelation,
} from './file-detail-metadata-panels-model'
import {
  useDetailMetaPredicateController,
} from './useDetailMetaPredicateController'

function DetailPredicateLabel({
  children,
  status,
  statusLabel,
}: {
  children: ReactNode
  status?: DetailMetaPredicateProposalStatus
  statusLabel: string
}) {
  const statusChrome = projectDetailMetaPredicateStatusChrome({ status, statusLabel })

  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <span>{children}</span>
      {statusChrome ? (
        <span
          aria-label={statusChrome.ariaLabel}
          className={statusChrome.className}
          title={statusChrome.title}
        >
          {statusChrome.marker}
        </span>
      ) : null}
    </span>
  )
}

function DetailRdfMetadataPanel({
  labelPrefix,
  documentUri,
  subject,
  titleValue,
  titlePreviousValues,
  tagsValue = '',
  tagsPreviousValues,
  reviewStatusValue = '',
  reviewStatusPreviousValues,
  relation,
}: {
  labelPrefix: 'Card' | 'File'
  documentUri: string
  subject: string
  titleValue: string
  titlePreviousValues: string[]
  tagsValue?: string
  tagsPreviousValues: string[]
  reviewStatusValue?: string
  reviewStatusPreviousValues: string[]
  relation?: DetailMetaPredicateRelation
}) {
  const metaPredicates = useDetailMetaPredicateController({
    labelPrefix,
    documentUri,
    subject,
    titleValue,
    titlePreviousValues,
    tagsValue,
    tagsPreviousValues,
    reviewStatusValue,
    reviewStatusPreviousValues,
    relation,
  })

  return (
    <div className="mt-3 rounded-md border border-border/40 bg-background/80 px-3 py-2" aria-label="RDF metadata">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-foreground/80">RDF metadata</p>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">approval</span>
      </div>
      <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)]">
        <label className="grid gap-1">
          <DetailPredicateLabel
            status={metaPredicates.title.status}
            statusLabel={metaPredicates.title.statusLabel}
          >
            title
          </DetailPredicateLabel>
          <StructuredPredicateValueEditor
            kind="text"
            ariaLabel={metaPredicates.title.statusLabel}
            values={metaPredicates.title.values}
            status={metaPredicates.title.status}
            onCommit={metaPredicates.title.commit}
          />
        </label>
        <label className="grid gap-1">
          <DetailPredicateLabel
            status={metaPredicates.reviewStatus.status}
            statusLabel={metaPredicates.reviewStatus.statusLabel}
          >
            reviewStatus
          </DetailPredicateLabel>
          <StructuredPredicateValueEditor
            kind="enum"
            ariaLabel={metaPredicates.reviewStatus.statusLabel}
            values={metaPredicates.reviewStatus.values}
            options={metaPredicates.reviewStatus.options}
            status={metaPredicates.reviewStatus.status}
            onCommit={metaPredicates.reviewStatus.commitStructured}
          />
        </label>
        <label className="grid gap-1">
          <DetailPredicateLabel
            status={metaPredicates.tags.status}
            statusLabel={metaPredicates.tags.statusLabel}
          >
            tags
          </DetailPredicateLabel>
          <StructuredPredicateValueEditor
            kind="multi-select"
            ariaLabel={metaPredicates.tags.statusLabel}
            values={metaPredicates.tags.values}
            options={metaPredicates.tags.options}
            status={metaPredicates.tags.status}
            onCommit={metaPredicates.tags.commitStructured}
          />
        </label>
      </div>
      {metaPredicates.relation ? (
        <label className="mt-2 grid gap-1 text-[11px]">
          <DetailPredicateLabel
            status={metaPredicates.relation.status}
            statusLabel={metaPredicates.relation.ariaLabel}
          >
            {metaPredicates.relation.label}
          </DetailPredicateLabel>
          <StructuredPredicateValueEditor
            kind="relation"
            ariaLabel={metaPredicates.relation.ariaLabel}
            values={metaPredicates.relation.values}
            status={metaPredicates.relation.status}
            onCommit={metaPredicates.relation.commitStructured}
          />
        </label>
      ) : null}
    </div>
  )
}

export function FileRdfMetadataPanel({
  file,
  title,
  meta,
}: {
  file: FilesDetail
  title: string
  meta: FilesMetaSidecar | undefined
}) {
  const model = projectFileRdfMetadataPanelModel({ file, meta, title })

  return (
    <DetailRdfMetadataPanel {...model} />
  )
}

export function SourceLinkedCardMetadataPanel({
  documentUri,
  descriptor,
  fallbackBodyResourceUri,
}: {
  documentUri: string
  descriptor: SourceLinkedCardDescriptor
  fallbackBodyResourceUri: string
}) {
  const model = projectSourceLinkedCardMetadataPanelModel({
    descriptor,
    documentUri,
    fallbackBodyResourceUri,
  })

  return (
    <DetailRdfMetadataPanel {...model} />
  )
}

export function SourceLinkedCardDrawerMetadata({ file }: { file: FilesDetail }) {
  const model = projectSourceLinkedCardDrawerMetadataPanelModel(file)
  if (!model) return null

  return (
    <DetailRdfMetadataPanel {...model} />
  )
}
