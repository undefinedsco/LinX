import { useMemo } from 'react'

import { useFilesCurrentPodRootUri, useFilesVocabRegistryDiscovery, useRawTextResource } from '../../data/queries'
import {
  projectStructuredResourcePreviewVocabDefinitionIndex,
  projectStructuredResourcePreviewVocabUris,
} from './structured-resource-preview-model'

/**
 * The vocabulary a data document is described by: where its terms, shapes and namespaces live and
 * what they define. Shared by the table and by the card dialog, which lists the table's columns.
 */
export function useStructuredVocabContext({ documentUri, enabled }: { documentUri: string; enabled: boolean }) {
  const currentPodRootUri = useFilesCurrentPodRootUri()
  const fallbackVocabUris = projectStructuredResourcePreviewVocabUris({
    currentPodRootUri,
    documentUri,
    vocabDiscovery: null,
  })
  const vocabDiscoveryQuery = useFilesVocabRegistryDiscovery({
    enabled,
    localVocabUri: fallbackVocabUris.localVocabUri,
  })
  const {
    vocabNamespacesUri,
    vocabShapesUri,
    vocabTermsUri,
  } = projectStructuredResourcePreviewVocabUris({
    currentPodRootUri,
    documentUri,
    vocabDiscovery: vocabDiscoveryQuery.data,
  })
  const vocabTermsQuery = useRawTextResource(vocabTermsUri, enabled)
  const vocabShapesQuery = useRawTextResource(vocabShapesUri, enabled)
  const vocabNamespacesQuery = useRawTextResource(vocabNamespacesUri, enabled)
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

  return { currentPodRootUri, vocabDefinitionIndex, vocabShapesUri, vocabTermsUri }
}
