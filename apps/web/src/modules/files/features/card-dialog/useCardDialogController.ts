import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'

import { ask as askLinxInChat } from '@/lib/ask-linx'
import { useCardDialog, type CardDialogRequest } from '@/lib/card-dialog'
import { useToast } from '@/components/ui/use-toast'

import { copyFilesText } from '../../app/platform-actions'
import { useFilesStore } from '../../app/store'
import {
  useActOnAiDraft,
  useAiDraft,
  useBlobResource,
  useCreateRawTextResource,
  useFileDetail,
  useFilesCurrentPodRootUri,
  useFilesMetaSidecar,
  useRawTextResource,
  useSaveRawTextResource,
  useCardHistoryAccess,
  useFilesSelectChat,
  useWriteOwnStructuredCellChange,
  useConfirmVocabTerm,
} from '../../data/queries'
import {
  CARD_PREVIEW_MAX_BYTES,
  isCardPlainTextMime,
  parseCardTarget,
  projectCardExcerptNote,
  projectCardLocatorLabel,
  projectCardLocatorLink,
  projectCardQuotedPrompt,
  planCardBodyWrite,
  planCardValueWrite,
  planCardColumnWrite,
  projectCardColumns,
  projectCardRowClass,
  type CardColumnModel,
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
import {
  cardSnapshotsEqual,
  projectCardVersionRows,
  type CardHistory,
  type CardSnapshot,
} from '../../domain/history/card-history'
import type { CardBacklink } from '../../domain/card/card-backlinks'
import { displayResourceName, getEntryName } from '../../domain/resource/resource-semantics'
import { projectStructuredResourceTable } from '../../domain/structured/structured-table'
import { useCardBacklinks, type CardWorkUseRow } from './useCardBacklinks'
import { supportsStructuredWriteProposals } from '../../domain/structured/structured-write-capability'
import { planCardNewProperty } from './card-new-property-model'
import { useStructuredVocabContext } from '../structured/useStructuredVocabContext'

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
  const createRawText = useCreateRawTextResource()
  const aiDraftQuery = useAiDraft(target.documentUri, kind === 'document')
  const aiDraft = aiDraftQuery.data ?? null
  const actOnAiDraft = useActOnAiDraft()
  const writeOwnCell = useWriteOwnStructuredCellChange()
  const confirmVocabTerm = useConfirmVocabTerm()
  const [addedColumns, setAddedColumns] = useState<CardColumnModel[]>([])
  const [saveStatus, setSaveStatus] = useState<CardSaveStatus>('idle')
  const [accessOpen, setAccessOpen] = useState(false)
  const historyAccess = useCardHistoryAccess()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<CardHistory | null>(null)
  const [historyError, setHistoryError] = useState(false)

  useEffect(() => { setSaveStatus('idle') }, [request.uri])
  useEffect(() => { setAddedColumns([]) }, [target.documentUri])

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

  // The table's columns, with the vocabulary that names and types them (read only for a table row).
  const vocab = useStructuredVocabContext({ documentUri: target.documentUri, enabled: kind === 'subject' || kind === 'table' })
  const tableColumns = useMemo(() => (
    projection && subject
      ? projectCardColumns({ projection, documentUri: target.documentUri, subject, vocabDefinitionIndex: vocab.vocabDefinitionIndex })
      : []
  ), [projection, subject, target.documentUri, vocab.vocabDefinitionIndex])
  /** Columns added from this card show at once, until the table's own list has caught up. */
  const columns = useMemo(
    () => [...tableColumns, ...addedColumns.filter((added) => !tableColumns.some((column) => column.predicate === added.predicate))],
    [addedColumns, tableColumns],
  )

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

  const title = subject?.title ?? displayResourceName(detail ? getEntryName(detail.uri) : getEntryName(target.documentUri))
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

  // R6 K2 bottom sections: filled lazily once the card itself is on screen.
  const { backlinks, workUses } = useCardBacklinks({
    uri: request.uri,
    documentUri: target.documentUri,
    projection,
    subjectIri: subject?.subjectIri ?? null,
    enabled: !loading && !blocking && (kind !== 'other' && kind !== 'folder'),
  })
  const selectChat = useFilesSelectChat()
  const openBacklink = useCallback((link: CardBacklink) => {
    openCard({ uri: link.uri, locator: link.line ? { line: link.line } : undefined, from: request.from })
  }, [openCard, request.from])
  const openWorkUse = useCallback((use: CardWorkUseRow) => {
    selectChat(use.chatId)
    closeDialog()
    void navigate({ to: '/$microAppId', params: { microAppId: 'chat' } })
  }, [closeDialog, navigate, selectChat])

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

  /** Version history is best effort: a failure here never fails the save. */
  const recordVersion = useCallback((after: CardSnapshot | null, before: CardSnapshot | null) => {
    if (!after) return
    void historyAccess.record({ cardUri: request.uri, before, after }).then(
      () => setHistory(null),
      () => undefined,
    )
  }, [historyAccess, request.uri])

  const subjectSnapshot = useCallback((overrides?: { body?: string; predicate?: string; tokens?: string[] }): CardSnapshot | null => {
    if (!subject) return null
    const properties: Record<string, string[]> = {}
    for (const property of subject.properties) properties[property.predicate] = [...property.valueTokens]
    if (overrides?.predicate && overrides.tokens) properties[overrides.predicate] = overrides.tokens
    return { body: overrides?.body ?? subject.bodyText, properties }
  }, [subject])

  const saveDocumentText = useCallback(async (text: string) => {
    if (!rawQuery.data) return
    const before = rawQuery.data.content
    await track(() => saveRawText.mutateAsync({ resource: rawQuery.data, content: text }))
    recordVersion({ body: text }, { body: before })
  }, [rawQuery.data, recordVersion, saveRawText, track])

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
    recordVersion(subjectSnapshot({ body: text.replace(/\s+$/, '') }), subjectSnapshot())
  }, [rawQuery.data?.etag, recordVersion, subject, subjectSnapshot, target.documentUri, track, writeOwnCell])

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
    recordVersion(subjectSnapshot({ predicate: property.predicate, tokens: plan.nextValues }), subjectSnapshot())
  }, [rawQuery.data?.etag, recordVersion, subject, subjectSnapshot, target.documentUri, track, writeOwnCell])

  /** Edits a column's value with the table's editor: written straight into the row. */
  const saveSubjectColumn = useCallback(async (column: CardColumnModel, nextTokens: string[]) => {
    if (!subject || !projection) return
    const plan = planCardColumnWrite({ column, nextTokens, documentUri: target.documentUri, prefixes: projection.prefixes })
    if (!plan) return
    await track(() => writeOwnCell.mutateAsync({
      documentUri: target.documentUri,
      subject: subject.subjectIri,
      predicate: column.predicate,
      previousValues: plan.previousValues,
      nextValues: plan.nextValues,
      expectedEtag: rawQuery.data?.etag ?? null,
    }))
    recordVersion(subjectSnapshot({ predicate: column.predicate, tokens: plan.nextValues }), subjectSnapshot())
  }, [projection, rawQuery.data?.etag, recordVersion, subject, subjectSnapshot, target.documentUri, track, writeOwnCell])

  /** "+ 属性": adds a column to the table through the vocabulary; resolves true when it is usable. */
  const addColumn = useCallback(async (label: string, type: string): Promise<boolean> => {
    if (!subject || !projection) return false
    const plan = planCardNewProperty({
      label,
      type,
      documentUri: target.documentUri,
      classScope: projectCardRowClass(projection, target.documentUri, subject.subjectIri),
      existingPredicates: columns.map((column) => column.predicate),
      currentPodRootUri: vocab.currentPodRootUri,
      targetVocabUri: vocab.vocabTermsUri,
      targetShapesUri: vocab.vocabShapesUri,
      vocabNamespaces: vocab.vocabDefinitionIndex.namespaces,
    })
    if (!plan.ok) {
      toast({ title: plan.reason === 'duplicate' ? '已经有这个属性了' : '先给属性起个名字', variant: 'destructive' })
      return false
    }
    // Optimistic: usable at once; taken back if the vocabulary refuses it.
    setAddedColumns((current) => [...current, plan.column])
    try {
      await confirmVocabTerm.mutateAsync({ proposal: plan.proposal })
      return true
    } catch {
      setAddedColumns((current) => current.filter((column) => column.predicate !== plan.column.predicate))
      toast({ title: '没能加上这个属性，稍后再试', variant: 'destructive' })
      return false
    }
  }, [columns, confirmVocabTerm, projection, subject, target.documentUri, toast, vocab])

  const openHistory = useCallback(async () => {
    setHistoryOpen(true)
    setHistoryError(false)
    try {
      setHistory(await historyAccess.read(request.uri))
    } catch {
      setHistoryError(true)
    }
  }, [historyAccess, request.uri])

  const currentSnapshot: CardSnapshot | null = subject
    ? subjectSnapshot()
    : kind === 'document' && rawQuery.data ? { body: rawQuery.data.content } : null

  /** 恢复到这个版本: written back through the normal save paths, so it becomes a new version. */
  const restoreVersion = useCallback(async (snapshot: CardSnapshot) => {
    if (subject) {
      if (snapshot.body.replace(/\s+$/, '') !== subject.bodyText.replace(/\s+$/, '')) await saveSubjectBody(snapshot.body)
      for (const [predicate, tokens] of Object.entries(snapshot.properties ?? {})) {
        const current = subject.properties.find((property) => property.predicate === predicate)
        const previous = current?.valueTokens ?? []
        if (previous.length === tokens.length && previous.every((token, index) => token === tokens[index])) continue
        await track(() => writeOwnCell.mutateAsync({
          documentUri: target.documentUri,
          subject: subject.subjectIri,
          predicate,
          previousValues: [...previous],
          nextValues: tokens,
          expectedEtag: null,
        }))
      }
      recordVersion(snapshot, subjectSnapshot())
    } else {
      await saveDocumentText(snapshot.body)
    }
    await historyAccess.read(request.uri).then(setHistory, () => undefined)
    toast({ title: '已恢复到这个版本' })
  }, [historyAccess, recordVersion, request.uri, saveDocumentText, saveSubjectBody, subject, subjectSnapshot, target.documentUri, toast, track, writeOwnCell])

  /** Editing LinX's unconfirmed draft means keeping it (K10). */
  const keepAiDraftAndEdit = useCallback(() => {
    if (aiDraft?.state === 'draft') void actOnAiDraft.mutateAsync({ draft: aiDraft, action: 'keep' })
  }, [actOnAiDraft, aiDraft])

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

  /**
   * 问 LinX: the chat opens with the quoted passage in its composer (not sent).
   * Only when nothing in the app listens do we fall back to the clipboard.
   */
  const askLinx = useCallback(async (quote: string) => {
    const text = projectCardQuotedPrompt({
      title: title,
      quote,
      locatorLabel: projectCardLocatorLabel(request.locator),
    })
    if (askLinxInChat({ text, sourceUri: request.uri, locator: request.locator, title })) {
      closeDialog()
      void navigate({ to: '/$microAppId', params: { microAppId: 'chat' } })
      return
    }
    try {
      await copyFilesText(text)
      toast({ title: '已复制这段话', description: '到和 LinX 的聊天里粘贴就能问。' })
    } catch (_error) {
      toast({ title: '没复制成功', variant: 'destructive' })
    }
  }, [closeDialog, navigate, request.locator, request.uri, title, toast])

  const makeCardFromQuote = useCallback(async (quote: string) => {
    if (!podRootUri) return
    const note = projectCardExcerptNote({
      title,
      quote,
      sourceUri: projectCardLocatorLink(request.uri, request.locator),
      locatorLabel: projectCardLocatorLabel(request.locator),
    })
    const root = podRootUri.endsWith('/') ? podRootUri : `${podRootUri}/`
    try {
      await createRawText.mutateAsync({
        resource: { uri: `${root}${encodeURIComponent('摘录')}/${encodeURIComponent(note.fileName)}`, mimeType: 'text/markdown' },
        content: note.content,
      })
      toast({ title: '已做成卡片', description: `放在“我的空间 / 摘录”里：${displayResourceName(note.fileName)}` })
    } catch (_error) {
      toast({ title: '没做成卡片', variant: 'destructive' })
    }
  }, [createRawText, podRootUri, request.locator, request.uri, title, toast])

  const copyQuoteLink = useCallback(async () => {
    try {
      await copyFilesText(projectCardLocatorLink(request.uri, request.locator))
      toast({ title: '链接已复制' })
    } catch (_error) {
      toast({ title: '没复制成功', variant: 'destructive' })
    }
  }, [request.locator, request.uri, toast])

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
    aiDraft,
    keepAiDraftAndEdit,
    documentEditable: kind === 'document' && (rawQuery.data?.mimeType ?? detail?.mimeType) === 'text/markdown',
    subject,
    subjectList,
    openSubject,
    fileProperties,
    siblings,
    backlinks,
    workUses,
    openBacklink,
    openWorkUse,
    saveStatus,
    setSaveStatus,
    saveDocumentText,
    saveSubjectBody,
    saveSubjectProperty,
    columns,
    canAddColumn: Boolean(subject) && supportsStructuredWriteProposals({ uri: target.documentUri, mimeType: rawQuery.data?.mimeType }),
    saveSubjectColumn,
    addColumn,
    goTo,
    expand,
    close: closeDialog,
    copyLink,
    askLinx,
    makeCardFromQuote,
    copyQuoteLink,
    documentPlainText: kind === 'document' && isCardPlainTextMime(rawQuery.data?.mimeType ?? detail?.mimeType),
    accessOpen,
    setAccessOpen,
    historyOpen,
    setHistoryOpen,
    openHistory,
    historyError,
    versionRows: history ? projectCardVersionRows(history) : null,
    currentSnapshot,
    restoreVersion,
    canRestore: (snapshot: CardSnapshot) => !currentSnapshot || !cardSnapshotsEqual(currentSnapshot, snapshot),
    historySupported: kind === 'document' ? Boolean(rawQuery.data) && (rawQuery.data?.mimeType ?? detail?.mimeType) === 'text/markdown' : Boolean(subject),
  }
}
