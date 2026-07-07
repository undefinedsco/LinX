import {
  createSourceIngestSnapshot,
  createSourceIngestUrlSnapshot,
  type SourceIngestAdapter,
  type SourceIngestSnapshotInput,
} from './source-ingest-snapshot'

export * from './source-ingest-snapshot'

interface ExtractedSourceSnapshotCompatibilityInput extends SourceIngestSnapshotInput {
  /** @deprecated Use ingestAdapter. */
  extractDocument?: SourceIngestAdapter
}

export function createExtractedSourceSnapshot(input: ExtractedSourceSnapshotCompatibilityInput) {
  return createSourceIngestSnapshot({
    ...input,
    ingestAdapter: input.ingestAdapter ?? input.extractDocument,
  })
}

export { createSourceIngestUrlSnapshot as createExtractedUrlSnapshot }

export type {
  SourceIngestAdapter as SourceDocumentExtractor,
  SourceIngestAdapterInput as SourceDocumentExtractionInput,
  SourceIngestAdapterResult as SourceDocumentExtractionResult,
} from './source-ingest-snapshot'
