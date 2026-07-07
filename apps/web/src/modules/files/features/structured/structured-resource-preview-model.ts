import type { FilesDetail } from '../../domain/resource/resource-model'
import {
  buildStructuredVocabDefinitionIndex,
  projectLockedVocabRegistryRows,
} from '../../domain/structured/structured-table'
import {
  resolveDiscoveredVocabTermsUri,
  resolvePodVocabResourceUri,
  resolveSiblingVocabResourceUri,
  type VocabRegistryDiscovery,
} from '../../domain/structured/structured-table-vocab'

export type StructuredResourcePreviewRawResource = {
  data?: {
    uri: string
    content: string
  } | null
  error?: unknown
}

export type StructuredResourcePreviewVocabDocument = {
  uri: string
  mimeType?: string | null
  content?: string | null
}

export function projectStructuredResourcePreviewSource({
  file,
  rawResource,
}: {
  file: FilesDetail
  rawResource: StructuredResourcePreviewRawResource
}) {
  if (rawResource.data?.uri === file.uri) return rawResource.data.content
  if (rawResource.error && !rawResource.data) return null
  return file.previewText
}

export function projectStructuredResourcePreviewVocabUris({
  currentPodRootUri,
  documentUri,
  vocabDiscovery,
}: {
  documentUri: string
  currentPodRootUri?: string | null
  vocabDiscovery: VocabRegistryDiscovery | null | undefined
}) {
  const localVocabUri = resolvePodVocabResourceUri(documentUri, 'terms.ttl', currentPodRootUri)
  const fallbackVocabShapesUri = resolvePodVocabResourceUri(documentUri, 'shapes.ttl', currentPodRootUri)
  const fallbackVocabNamespacesUri = resolvePodVocabResourceUri(documentUri, 'namespaces.ttl', currentPodRootUri)
  const discoveredVocabTermsUri = resolveDiscoveredVocabTermsUri(vocabDiscovery)
  const vocabTermsUri = discoveredVocabTermsUri ?? localVocabUri
  return {
    localVocabUri,
    vocabTermsUri,
    vocabShapesUri: discoveredVocabTermsUri
      ? resolveSiblingVocabResourceUri(discoveredVocabTermsUri, 'shapes.ttl')
      : fallbackVocabShapesUri,
    vocabNamespacesUri: discoveredVocabTermsUri
      ? resolveSiblingVocabResourceUri(discoveredVocabTermsUri, 'namespaces.ttl')
      : fallbackVocabNamespacesUri,
  }
}

export function projectStructuredResourcePreviewVocabDefinitionIndex({
  namespaces,
  shapes,
  terms,
}: {
  terms: StructuredResourcePreviewVocabDocument
  shapes: StructuredResourcePreviewVocabDocument
  namespaces: StructuredResourcePreviewVocabDocument
}) {
  return buildStructuredVocabDefinitionIndex({
    terms: projectLockedVocabRegistryRows({
      uri: terms.uri,
      mimeType: terms.mimeType ?? 'text/turtle',
      source: terms.content ?? null,
      registryKind: 'terms',
    }),
    shapes: projectLockedVocabRegistryRows({
      uri: shapes.uri,
      mimeType: shapes.mimeType ?? 'text/turtle',
      source: shapes.content ?? null,
      registryKind: 'shapes',
    }),
    namespaces: projectLockedVocabRegistryRows({
      uri: namespaces.uri,
      mimeType: namespaces.mimeType ?? 'text/turtle',
      source: namespaces.content ?? null,
      registryKind: 'namespaces',
    }),
  })
}
