import { useMemo } from 'react'

import { useFilesCurrentPodRootUri, useFilesVocabRegistryDiscovery, useRawTextResource } from '../../data/queries'
import type { FilesDetail } from '../../domain/resource/resource-model'
import {
  projectStructuredResourceTable,
} from '../../domain/structured/structured-table'
import { supportsStructuredWriteProposals } from '../../domain/structured/structured-write-capability'
import {
  projectStructuredResourcePreviewSource,
  projectStructuredResourcePreviewVocabDefinitionIndex,
  projectStructuredResourcePreviewVocabUris,
} from './structured-resource-preview-model'

export function useStructuredResourcePreviewController(file: FilesDetail) {
  const currentPodRootUri = useFilesCurrentPodRootUri()
  const rawQuery = useRawTextResource(file.uri)
  const fallbackVocabUris = projectStructuredResourcePreviewVocabUris({
    currentPodRootUri,
    documentUri: file.uri,
    vocabDiscovery: null,
  })
  const vocabDiscoveryQuery = useFilesVocabRegistryDiscovery({ localVocabUri: fallbackVocabUris.localVocabUri })
  const {
    vocabNamespacesUri,
    vocabShapesUri,
    vocabTermsUri,
  } = projectStructuredResourcePreviewVocabUris({
    currentPodRootUri,
    documentUri: file.uri,
    vocabDiscovery: vocabDiscoveryQuery.data,
  })
  const structuredSource = projectStructuredResourcePreviewSource({ file, rawResource: rawQuery })
  const vocabTermsQuery = useRawTextResource(vocabTermsUri)
  const vocabShapesQuery = useRawTextResource(vocabShapesUri)
  const vocabNamespacesQuery = useRawTextResource(vocabNamespacesUri)
  const vocabDefinitionIndex = useMemo(() => (
    projectStructuredResourcePreviewVocabDefinitionIndex({
      terms: {
        uri: vocabTermsUri,
        mimeType: vocabTermsQuery.data?.mimeType,
        content: vocabTermsQuery.data?.content,
      },
      shapes: {
        uri: vocabShapesUri,
        mimeType: vocabShapesQuery.data?.mimeType,
        content: vocabShapesQuery.data?.content,
      },
      namespaces: {
        uri: vocabNamespacesUri,
        mimeType: vocabNamespacesQuery.data?.mimeType,
        content: vocabNamespacesQuery.data?.content,
      },
    })
  ), [vocabNamespacesQuery.data?.content, vocabNamespacesQuery.data?.mimeType, vocabNamespacesUri, vocabShapesQuery.data?.content, vocabShapesQuery.data?.mimeType, vocabShapesUri, vocabTermsQuery.data?.content, vocabTermsQuery.data?.mimeType, vocabTermsUri])
  const projection = useMemo(() => projectStructuredResourceTable({
    uri: file.uri,
    mimeType: file.mimeType,
    source: structuredSource,
  }), [file.mimeType, file.uri, structuredSource])

  return {
    currentPodRootUri,
    projection,
    structuredWritesSupported: supportsStructuredWriteProposals(file),
    structuredSourceUnavailable: !!rawQuery.error && !rawQuery.data,
    vocabDefinitionIndex,
    vocabShapesUri,
    vocabTermsUri,
  }
}
