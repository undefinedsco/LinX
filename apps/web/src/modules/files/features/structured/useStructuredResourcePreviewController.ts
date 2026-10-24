import { useCallback, useMemo } from 'react'

import { useRawTextResource } from '../../data/queries'
import type { FilesDetail } from '../../domain/resource/resource-model'
import {
  projectStructuredResourceTable,
} from '../../domain/structured/structured-table'
import { supportsStructuredWriteProposals } from '../../domain/structured/structured-write-capability'
import { projectStructuredResourcePreviewSource } from './structured-resource-preview-model'
import { useStructuredVocabContext } from './useStructuredVocabContext'

export function useStructuredResourcePreviewController(file: FilesDetail) {
  const rawQuery = useRawTextResource(file.uri)
  const structuredSource = projectStructuredResourcePreviewSource({ file, rawResource: rawQuery })
  const enrichmentEnabled = structuredSource !== null && structuredSource !== undefined
  const {
    currentPodRootUri,
    vocabDefinitionIndex,
    vocabShapesUri,
    vocabTermsUri,
  } = useStructuredVocabContext({ documentUri: file.uri, enabled: enrichmentEnabled })
  const projection = useMemo(() => projectStructuredResourceTable({
    uri: file.uri,
    mimeType: file.mimeType,
    source: structuredSource,
  }), [file.mimeType, file.uri, structuredSource])

  const { refetch: refetchRaw } = rawQuery
  /** Reads the document again, ahead of the table's own refresh: its rows and the version they came from. */
  const readLatestProjection = useCallback(async () => {
    const latest = (await refetchRaw()).data
    if (!latest || latest.uri !== file.uri) return null
    return {
      etag: latest.etag ?? null,
      projection: projectStructuredResourceTable({ uri: file.uri, mimeType: file.mimeType, source: latest.content }),
    }
  }, [file.mimeType, file.uri, refetchRaw])

  return {
    currentPodRootUri,
    projection,
    readLatestProjection,
    structuredWritesSupported: supportsStructuredWriteProposals(file),
    // The version the table shows; direct writes are refused if the document moved on.
    structuredSourceEtag: rawQuery.data?.etag ?? null,
    structuredSourceLoading: rawQuery.isLoading,
    structuredSourceUnavailable: !!rawQuery.error && !rawQuery.data,
    vocabDefinitionIndex,
    vocabShapesUri,
    vocabTermsUri,
  }
}
