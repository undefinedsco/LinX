import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'

import { useCardDialog, type CardDialogRequest } from '@/lib/card-dialog'
import { useToast } from '@/components/ui/use-toast'

import { copyFilesText } from '../../app/platform-actions'
import { useFilesStore } from '../../app/store'
import {
  useBlobResource,
  useFileDetail,
  useFilesCurrentPodRootUri,
  useFilesMetaSidecar,
  useRawTextResource,
  useSaveRawTextResource,
  useWriteOwnStructuredCellChange,
} from '../../data/queries'
import {
  CARD_PREVIEW_MAX_BYTES,
  parseCardTarget,
  planCardBodyWrite,
  planCardValueWrite,
  projectCardDocumentOverview,
  projectCardFileProperties,
  projectCardKind,
  projectCardMediaKind,
  projectCardMediaSource,
  projectCardPathLabel,
  projectCardReadErrorState,
  projectCardSiblingNavigation,
  projectCardSubjectModel,
  projectCardUnpreviewableState,
  type CardPropertyModel,
  type CardSaveStatus,
} from '../../domain/card/card-dialog-model'
import { getEntryName } from '../../domain/resource/resource-semantics'
import { projectStructuredResourceTable } from '../../domain/structured/structured-table'

export function useCardDialogController(request: CardDialogRequest) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const closeDialog = useCardDialog((state) => state.close)
  const openCard = useCardDialog((state) => state.open)
  const podRootUri = useFilesCurrentPodRootUri()
  const target = useMemo(() => parseCardTarget(request.uri), [request.uri])
  const detailQuery = useFileDetail(target.documentUri)
  const detail = detailQuery.data ?? null
  const kind = projectCardKind({ target, entry: detail })
  const mediaKind = kind === 'media' ? projectCardMediaKind(detail?.mimeType, detail?.uri) : null
  const tooLarge = typeof detail?.size === 'number' && detail.size > CARD_PREVIEW_MAX_BYTES
  const readsText = kind === 'document' || kind === 'subject' || kind === 'table'
  const rawQuery = useRawTextResource(target.documentUri, readsText && !tooLarge)
  const blobQuery = useBlobResource(target.documentUri, !!mediaKind && !tooLarge)
  const metaQuery = useFilesMetaSidecar(kind === 'document' || kind === 'media' ? detail : null, kind === 'document' || kind === 'media')
  const saveRawText = useSaveRawTextResource()
  const writeOwnCell = useWriteOwnStructuredCellChange()
  const [saveStatus, setSaveStatus] = useState<CardSaveStatus>('idle')
  const [accessOpen, setAccessOpen] = useState(false)

  useEffect(() => { setSaveStatus('idle') }, [request.uri])

  const projection = useMemo(() => {
    if ((kind !== 'subject' && kind !== 'table') || !rawQuery.data) return null
    return projectStructuredResourceTable({
      uri: target.documentUri,
      mimeType: rawQuery.data.mimeType,
      source: rawQuery.data.content,
    })
  }, [kind, rawQuery.data, target.documentUri])

  const overview = useMemo(() => (
    kind === 'table' && projection ? projectCardDocumentOverview({ projection, documentUri: target.documentUri }) : null
  ), [kind, projection, target.documentUri])
  const subjectIri = kind === 'table' ? overview?.mainSubjectIri ?? null : request.uri
  const subject = useMemo(() => (
    projection && subjectIri ? projectCardSubjectModel({ projection, documentUri: target.documentUri, subjectIri }) : null
  ), [projection, subjectIri, target.documentUri])
  /** Several subjects in a data document: shown as a list, each opening in this popup. */
  const subjectList = kind === 'table' && !subject && overview && overview.rows.length > 0 ? overview.rows : null
  const listedUris = useMemo(
    () => (subjectList ?? []).filter((row) => row.openable).map((row) => row.subjectIri),
    [subjectList],
  )
  const openSubject = useCallback((uri: string) => {
    openCard({ ...request, uri, locator: undefined, siblings: listedUris })
  }, [listedUris, openCard, request])

  const fileProperties = useMemo(() => {
    if (!metaQuery.data?.content || !detail) return null
    const metaProjection = projectStructuredResourceTable({
      uri: metaQuery.data.metaUri,
      mimeType: metaQuery.data.mimeType ?? 'text/turtle',
      source: metaQuery.data.content,
    })
    return projectCardFileProperties({ projection: metaProjection, metaUri: metaQuery.data.metaUri, ownerUri: detail.uri })
  }, [detail, metaQuery.data])

  const objectUrl = useMemo(() => (
    blobQuery.data?.blob && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blobQuery.data.blob) : null
  ), [blobQuery.data?.blob])
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }, [objectUrl])
  const mediaSource = objectUrl && mediaKind ? projectCardMediaSource(objectUrl, mediaKind, request.locator) : null

  const siblings = useMemo(
    () => projectCardSiblingNavigation(request.uri, request.siblings),
    [request.siblings, request.uri],
  )
  const goTo = useCallback((uri: string | null) => {
    if (uri) openCard({ ...request, uri, locator: undefined })
  }, [openCard, request])

  const title = subject?.title ?? (detail ? getEntryName(detail.uri) : getEntryName(target.documentUri))
  const pathLabel = projectCardPathLabel({ uri: request.uri, podRootUri, title: subject?.title })

  const blocking = (() => {
    if (detailQuery.isError || rawQuery.isError && !rawQuery.data) return projectCardReadErrorState(detailQuery.error ?? rawQuery.error)
    if (detail && (kind === 'other' || kind === 'folder' || kind === 'source-card' || tooLarge)) {
      return projectCardUnpreviewableState({ name: getEntryName(detail.uri), size: detail.size, hasSystemOpen: false })
    }
    if (kind === 'table' && rawQuery.data && !subject && !subjectList) {
      return { title: '这个文件里还没有内容', description: getEntryName(target.documentUri), action: 'back-to-folder' as const }
    }
    return null
  })()
  const loading = !blocking && (detailQuery.isLoading || (readsText && rawQuery.isLoading) || (!!mediaKind && blobQuery.isLoading))

  const track = useCallback(async (job: () => Promise<unknown>) => {
    setSaveStatus('saving')
    try {
      await job()
      setSaveStatus('saved')
    } catch (error) {
      const conflict = error instanceof Error && error.name === 'FilesSaveConflictError'
      setSaveStatus(conflict ? 'conflict' : 'error')
      throw error
    }
  }, [])

  const saveDocumentText = useCallback(async (text: string) => {
    if (!rawQuery.data) return
    await track(() => saveRawText.mutateAsync({ resource: rawQuery.data, content: text }))
  }, [rawQuery.data, saveRawText, track])

  const saveSubjectBody = useCallback(async (text: string) => {
    if (!subject) return
    const plan = planCardBodyWrite({ previousValueTokens: subject.bodyValueTokens, nextText: text })
    if (!plan) return
    await track(() => writeOwnCell.mutateAsync({
      documentUri: target.documentUri,
      subject: subject.subjectIri,
      predicate: subject.bodyPredicate,
      previousValues: plan.previousValues,
      nextValues: plan.nextValues,
      expectedEtag: rawQuery.data?.etag ?? null,
    }))
  }, [rawQuery.data?.etag, subject, target.documentUri, track, writeOwnCell])

  const saveSubjectProperty = useCallback(async (property: CardPropertyModel, nextText: string) => {
    if (!subject) return
    const plan = planCardValueWrite({
      previousValueTokens: property.valueTokens,
      nextText,
      wasResource: property.isResource,
    })
    if (!plan) return
    await track(() => writeOwnCell.mutateAsync({
      documentUri: target.documentUri,
      subject: subject.subjectIri,
      predicate: property.predicate,
      previousValues: plan.previousValues,
      nextValues: plan.nextValues,
      expectedEtag: rawQuery.data?.etag ?? null,
    }))
  }, [rawQuery.data?.etag, subject, target.documentUri, track, writeOwnCell])

  const expand = useCallback(() => {
    const store = useFilesStore.getState()
    if (target.fragment) {
      store.openStructuredSubjectResource({ documentUri: target.documentUri, subject: target.uri, targetUri: target.uri })
    } else {
      store.openFilePreview(target.documentUri)
    }
    closeDialog()
    void navigate({ to: '/$microAppId', params: { microAppId: 'files' } })
  }, [closeDialog, navigate, target])

  const copyLink = useCallback(async () => {
    try {
      await copyFilesText(request.uri)
      toast({ title: '链接已复制' })
    } catch (_error) {
      toast({ title: '没复制成功', variant: 'destructive' })
    }
  }, [request.uri, toast])

  return {
    target,
    kind,
    mediaKind,
    mediaSource,
    detail,
    title,
    pathLabel,
    loading,
    blocking,
    retry: () => { void detailQuery.refetch(); void rawQuery.refetch() },
    documentText: rawQuery.data?.content ?? detail?.previewText ?? '',
    documentMimeType: rawQuery.data?.mimeType ?? detail?.mimeType ?? null,
    documentEditable: kind === 'document' && (rawQuery.data?.mimeType ?? detail?.mimeType) === 'text/markdown',
    subject,
    subjectList,
    openSubject,
    fileProperties,
    siblings,
    saveStatus,
    setSaveStatus,
    saveDocumentText,
    saveSubjectBody,
    saveSubjectProperty,
    goTo,
    expand,
    close: closeDialog,
    copyLink,
    accessOpen,
    setAccessOpen,
  }
}
