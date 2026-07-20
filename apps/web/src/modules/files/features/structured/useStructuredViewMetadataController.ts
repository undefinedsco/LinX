import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { FilesSaveConflictError, type FilesDetail } from '../../domain/resource/resource-model'
import { useSaveStructuredViewMetadata, useStructuredViewMetadata } from '../../data/queries'
import type { StructuredViewMetadata } from '../../domain/structured/structured-view-metadata'
import {
  isSameStructuredDocumentUri,
  projectStructuredViewMetadataHydration,
  structuredViewMetadataSignature,
} from './structured-view-metadata-workflow-model'

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
  const structuredViewMetadataQuery = useStructuredViewMetadata(file)
  const saveStructuredViewMetadata = useSaveStructuredViewMetadata()
  const { toast } = useToast()
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
      metadataSidecar: structuredViewMetadataQuery.data,
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
    structuredViewMetadataQuery.data,
    whiteboardLayoutKey,
  ])

  useEffect(() => {
    if (!structuredViewMetadataQuery.data) return
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
      void saveStructuredViewMetadata.mutateAsync({
        file: {
          uri: file.uri,
          kind: file.kind,
        },
        metadata: currentViewMetadata,
      }).then(() => {
        syncedViewMetadataSignatureRef.current = currentSignature
        failedViewMetadataSignatureRef.current = null
        localViewMetadataChangeBeforeHydrationRef.current = false
        clearStructuredViewMetadataDirty(file.uri)
        setViewMetadataSaveStatus('synced')
        setViewMetadataSaveError(null)
      }).catch((error) => {
        const description = error instanceof FilesSaveConflictError
          ? '视图配置保存冲突：远端 .meta 已变化，请重新打开后再调整视图。'
          : error instanceof Error
            ? error.message
            : '保存视图配置失败'
        setViewMetadataSaveStatus('error')
        setViewMetadataSaveError(description)
        failedViewMetadataSignatureRef.current = currentSignature
        toast({ description, variant: 'destructive' })
      })
    }, 800)

    return () => window.clearTimeout(timeoutId)
  }, [
    currentViewMetadata,
    clearStructuredViewMetadataDirty,
    file.kind,
    file.uri,
    saveStructuredViewMetadata,
    structuredViewMetadataQuery.data,
    toast,
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
