import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FilesDetail, FilesStructuredViewMetadataSidecar } from '../../domain/resource/resource-model'
import type { StructuredViewMetadata } from '../../domain/structured/structured-view-metadata'
import {
  isSameStructuredDocumentUri,
  projectStructuredViewMetadataHydration,
  structuredViewMetadataSignature,
} from './structured-view-metadata-workflow-model'
import {
  loadLocalStructuredViewMetadata,
  saveLocalStructuredViewMetadata,
} from './local-structured-view-metadata-store'

export function useStructuredViewMetadataController({
  currentViewMetadata,
  file,
  hydrateStructuredViewMetadata,
  localViewMetadataDirty,
  markStructuredViewMetadataDirty,
  clearStructuredViewMetadataDirty,
  whiteboardLayoutKey,
}: {
  currentViewMetadata: StructuredViewMetadata
  file: Pick<FilesDetail, 'uri' | 'kind'>
  hydrateStructuredViewMetadata: (metadata: Required<StructuredViewMetadata>, whiteboardLayoutKey: string) => void
  localViewMetadataDirty: boolean
  markStructuredViewMetadataDirty: (documentUri: string) => void
  clearStructuredViewMetadataDirty: (documentUri: string) => void
  whiteboardLayoutKey: string
}) {
  // View configuration is renderer UI state, so it lives in local storage
  // keyed by document URI instead of the Pod .meta sidecar.
  const [localStoreRevision, setLocalStoreRevision] = useState(0)
  const structuredViewMetadataSidecar = useMemo<FilesStructuredViewMetadataSidecar>(() => {
    const metadata = loadLocalStructuredViewMetadata(file.uri)
    return {
      ownerUri: file.uri,
      metaUri: `local://structured-view/${encodeURIComponent(file.uri)}`,
      state: metadata ? 'exists' : 'missing',
      status: 200,
      content: null,
      mimeType: null,
      etag: metadata ? structuredViewMetadataSignature(metadata) : null,
      size: null,
      metadata,
    }
    // localStoreRevision re-reads local storage after each save.
  }, [file.uri, localStoreRevision])
  const hydratedViewMetadataKeyRef = useRef<string | null>(null)
  const syncedViewMetadataSignatureRef = useRef<string | null>(null)
  const autosaveReadyRef = useRef(false)
  const skipNextStructuredViewAutosaveRef = useRef(false)
  const localViewMetadataChangeBeforeHydrationRef = useRef(false)
  const failedViewMetadataSignatureRef = useRef<string | null>(null)
  const [viewMetadataSaveStatus, setViewMetadataSaveStatus] = useState<'synced' | 'dirty' | 'saving' | 'error'>('synced')
  const [viewMetadataSaveError, setViewMetadataSaveError] = useState<string | null>(null)
  const [retryToken, setRetryToken] = useState(0)

  const markLocalViewMetadataChange = useCallback(() => {
    markStructuredViewMetadataDirty(file.uri)
    setViewMetadataSaveStatus('dirty')
    setViewMetadataSaveError(null)
    if (!hydratedViewMetadataKeyRef.current) {
      localViewMetadataChangeBeforeHydrationRef.current = true
    }
  }, [file.uri, markStructuredViewMetadataDirty])

  useEffect(() => {
    hydratedViewMetadataKeyRef.current = null
    syncedViewMetadataSignatureRef.current = null
    autosaveReadyRef.current = false
    skipNextStructuredViewAutosaveRef.current = false
    localViewMetadataChangeBeforeHydrationRef.current = false
    failedViewMetadataSignatureRef.current = null
    setViewMetadataSaveStatus('synced')
    setViewMetadataSaveError(null)
  }, [file.uri])

  useEffect(() => {
    const hydrationPlan = projectStructuredViewMetadataHydration({
      currentHydrationKey: hydratedViewMetadataKeyRef.current,
      fileUri: file.uri,
      localViewMetadataChangeBeforeHydration: localViewMetadataChangeBeforeHydrationRef.current || localViewMetadataDirty,
      metadataSidecar: structuredViewMetadataSidecar,
      whiteboardLayoutKey,
    })
    if (hydrationPlan.action === 'none') return
    if (hydrationPlan.action === 'sync-default') {
      syncedViewMetadataSignatureRef.current = hydrationPlan.signature
      return
    }

    hydratedViewMetadataKeyRef.current = hydrationPlan.hydrationKey
    syncedViewMetadataSignatureRef.current = hydrationPlan.signature
    autosaveReadyRef.current = true
    if (!hydrationPlan.shouldHydrate) {
      skipNextStructuredViewAutosaveRef.current = false
      return
    }
    skipNextStructuredViewAutosaveRef.current = true
    hydrateStructuredViewMetadata(hydrationPlan.metadata, whiteboardLayoutKey)
  }, [
    file.uri,
    hydrateStructuredViewMetadata,
    localViewMetadataDirty,
    structuredViewMetadataSidecar,
    whiteboardLayoutKey,
  ])

  useEffect(() => {
    if (!isSameStructuredDocumentUri(currentViewMetadata.documentUri, file.uri)) return

    const currentSignature = structuredViewMetadataSignature(currentViewMetadata)
    if (skipNextStructuredViewAutosaveRef.current) {
      skipNextStructuredViewAutosaveRef.current = false
      return
    }
    if (!autosaveReadyRef.current) {
      syncedViewMetadataSignatureRef.current ??= currentSignature
      autosaveReadyRef.current = true
    }
    if (currentSignature === syncedViewMetadataSignatureRef.current) return
    if (currentSignature === failedViewMetadataSignatureRef.current) return
    setViewMetadataSaveStatus('dirty')

    const timeoutId = window.setTimeout(() => {
      setViewMetadataSaveStatus('saving')
      setViewMetadataSaveError(null)
      try {
        saveLocalStructuredViewMetadata(file.uri, currentViewMetadata)
        syncedViewMetadataSignatureRef.current = currentSignature
        failedViewMetadataSignatureRef.current = null
        localViewMetadataChangeBeforeHydrationRef.current = false
        clearStructuredViewMetadataDirty(file.uri)
        setViewMetadataSaveStatus('synced')
        setViewMetadataSaveError(null)
        setLocalStoreRevision((current) => current + 1)
      } catch (error) {
        const description = error instanceof Error ? error.message : '保存视图配置失败'
        setViewMetadataSaveStatus('error')
        setViewMetadataSaveError(description)
        failedViewMetadataSignatureRef.current = currentSignature
      }
    }, 800)

    return () => window.clearTimeout(timeoutId)
  }, [
    currentViewMetadata,
    clearStructuredViewMetadataDirty,
    file.uri,
    retryToken,
  ])

  const retryViewMetadataSave = useCallback(() => {
    failedViewMetadataSignatureRef.current = null
    setViewMetadataSaveStatus('dirty')
    setViewMetadataSaveError(null)
    setRetryToken((current) => current + 1)
  }, [])

  return {
    markLocalViewMetadataChange,
    retryViewMetadataSave,
    viewMetadataSaveError,
    viewMetadataSaveStatus,
  }
}
