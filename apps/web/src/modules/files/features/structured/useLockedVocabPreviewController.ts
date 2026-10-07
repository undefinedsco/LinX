import { useState } from 'react'

import { createFilesStructuredSubjectRouteState, pushStructuredSubjectRoute } from '../../app/route-state'
import { useFilesRouteBridge } from '../../app/FilesRouteContext'
import { useFilesStore } from '../../app/store'
import { useRawTextResource } from '../../data/queries'
import type { FilesDetail } from '../../domain/resource/resource-model'
import { resolveStructuredSubjectContainingResourceUri } from '../../domain/resource/structured-subject-uri'
import {
  projectLockedVocabRegistryRows,
  projectStructuredResourceTable,
  type LockedVocabRegistryKind,
  type LockedVocabRegistryRow,
} from '../../domain/structured/structured-table'
import { deriveStructuredSubjectPeekFacts, type StructuredSubjectPeek } from '../../domain/structured/structured-subject-peek'
import { projectLockedVocabPreviewChrome } from './locked-vocab-preview-model'

function structuredSourceForLockedVocabFile(file: FilesDetail, rawQuery: ReturnType<typeof useRawTextResource>) {
  if (rawQuery.data?.uri === file.uri) return rawQuery.data.content
  if (rawQuery.error && !rawQuery.data) return null
  return file.previewText
}

function lockedVocabRegistryKindForFile(file: FilesDetail): LockedVocabRegistryKind {
  if (file.semanticKind === 'vocab-shapes') return 'shapes'
  if (file.semanticKind === 'vocab-namespaces') return 'namespaces'
  return 'terms'
}

export function useLockedVocabPreviewController(file: FilesDetail) {
  const filesRouteBridge = useFilesRouteBridge()
  const [termPeek, setTermPeek] = useState<StructuredSubjectPeek>(null)
  const rawQuery = useRawTextResource(file.uri)
  const structuredSource = structuredSourceForLockedVocabFile(file, rawQuery)
  const registryKind = lockedVocabRegistryKindForFile(file)
  const projection = projectStructuredResourceTable({ uri: file.uri, mimeType: file.mimeType, source: structuredSource })
  const registryRows = projectLockedVocabRegistryRows({ uri: file.uri, mimeType: file.mimeType, source: structuredSource, registryKind })
  const chrome = projectLockedVocabPreviewChrome({ registryKind, registryRowCount: registryRows.length })
  const primaryProjectionWarning = projection.warnings[0] ?? null
  const openStructuredSubjectResource = useFilesStore((state) => state.openStructuredSubjectResource)
  const termPeekTargetsCurrentFile = !!termPeek && termPeek.targetUri === file.uri

  function pushLockedVocabTermRoute(subject: string, targetUri: string) {
    const route = createFilesStructuredSubjectRouteState({
      documentUri: file.uri,
      subject,
      targetUri,
      scrollTop: 0,
      viewMode: 'table',
      classScope: null,
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: null,
    })
    if (filesRouteBridge) filesRouteBridge.pushStructuredSubjectRoute(route)
    else pushStructuredSubjectRoute(route)
  }

  function openTerm(row: LockedVocabRegistryRow) {
    const targetUri = resolveStructuredSubjectContainingResourceUri(file.uri, row.uri) ?? file.uri
    const facts = deriveStructuredSubjectPeekFacts({
      projection,
      visibleProjection: projection,
      subject: row.uri,
    })
    setTermPeek({
      subject: row.uri,
      targetUri,
      kind: 'term',
      rowIndex: null,
      scrollTop: 0,
      ...facts,
      title: row.label || facts.title,
    })
  }

  function closeTermPeek() {
    setTermPeek(null)
  }

  function openPeekedTermResource() {
    if (!termPeek) return
    pushLockedVocabTermRoute(termPeek.subject, termPeek.targetUri)
    openStructuredSubjectResource({
      documentUri: file.uri,
      subject: termPeek.subject,
      targetUri: termPeek.targetUri,
    })
    setTermPeek(null)
  }

  return {
    chrome,
    registryKind,
    registryRows,
    projectionWarnings: projection.warnings,
    primaryProjectionWarning,
    termPeek,
    termPeekTargetsCurrentFile,
    openTerm,
    closeTermPeek,
    openPeekedTermResource,
  }
}
