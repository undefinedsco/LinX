import { useCallback, useEffect, useMemo, useState } from 'react'

import { useToast } from '@/components/ui/use-toast'

import { openFilesExternalUri } from '../../app/platform-actions'
import { useFilesStore } from '../../app/store'
import {
  useCreateSourceUpdateProposal,
  useFilesApprovalByTarget,
  usePendingSourceUpdateProposals,
  useRawTextResource,
  useRefreshSourceLinkedCard,
  useRequestSourceIngestRange,
  useResolveFilesInboxApproval,
} from '../../data/queries'
import type { FilesDetail } from '../../domain/resource/resource-model'
import {
  displaySourceIngestVersion,
  parseSourceLinkedCardTurtle,
} from '../../domain/source/source-ingest'
import { parseSourceIngestManifestTurtle } from '../../domain/source/source-ingest-manifest'
import {
  getSourceLinkedCardSubject,
  projectExpectedSourceUpdateProposal,
  projectSourceLinkedCardBodyFile,
  projectSourceLinkedCardBodyPreviewText,
  resolveSourceLinkedCardBodyUri,
  selectCurrentSourceUpdateProposal,
} from './source-linked-card-workflow-model'

export function useSourceLinkedCardWorkflowController(file: FilesDetail) {
  const { toast } = useToast()
  const [sourceActionError, setSourceActionError] = useState<string | null>(null)
  const createSourceProposal = useCreateSourceUpdateProposal()
  const refreshSource = useRefreshSourceLinkedCard()
  const requestSourceIngestRange = useRequestSourceIngestRange()
  const resolveSourceApproval = useResolveFilesInboxApproval()
  const openFilePreview = useFilesStore((state) => state.openFilePreview)
  const descriptor = useMemo(
    () => file.previewText ? parseSourceLinkedCardTurtle(file.previewText) : null,
    [file.previewText],
  )
  const bodyUri = resolveSourceLinkedCardBodyUri({ fileUri: file.uri, descriptor })
  const cardSubject = descriptor ? getSourceLinkedCardSubject(file.uri) : null
  const expectedSourceProposal = projectExpectedSourceUpdateProposal({
    fileUri: file.uri,
    descriptor,
    bodyUri,
  })
  const pendingSourceProposalsQuery = usePendingSourceUpdateProposals(file.uri, !!descriptor && !!bodyUri)
  const manifestQuery = useRawTextResource(descriptor?.sourceIngestManifestUri ?? null, !!descriptor)
  const bodyQuery = useRawTextResource(bodyUri, !!bodyUri)
  const sourceProposal = useMemo(() => {
    if (!descriptor || !bodyUri || !cardSubject) return null
    return selectCurrentSourceUpdateProposal({
      proposals: pendingSourceProposalsQuery.data ?? [],
      documentUri: file.uri,
      subject: cardSubject,
      targetResourceUri: bodyUri,
      sourceUri: descriptor.sourceUri,
    })
  }, [bodyUri, cardSubject, descriptor, file.uri, pendingSourceProposalsQuery.data])
  const sourceProposalUri = sourceProposal?.proposalResourceUri ?? null
  const sourceApprovalQuery = useFilesApprovalByTarget(sourceProposal?.id ?? null, {
    enabled: !!sourceProposal,
  })

  useEffect(() => {
    setSourceActionError(null)
  }, [file.uri])

  const sourceIngestManifest = manifestQuery.data && descriptor
    ? parseSourceIngestManifestTurtle(manifestQuery.data.content, descriptor.sourceIngestManifestUri)
    : null
  const displayIngestVersion = descriptor ? displaySourceIngestVersion(descriptor.ingestVersion) : ''
  const bodyFile = projectSourceLinkedCardBodyFile({
    file,
    descriptor,
    bodyUri,
    displayIngestVersion,
  })
  const bodyPreviewText = projectSourceLinkedCardBodyPreviewText({
    bodyFile,
    bodyContent: bodyQuery.data?.content,
    sourceProposalContent: sourceProposal?.proposedContent,
  })

  const openSource = useCallback(() => {
    if (!descriptor) return
    try {
      const sourceUrl = new URL(descriptor.sourceUri)
      if (sourceUrl.origin === new URL(file.uri).origin) {
        openFilePreview(descriptor.sourceUri)
        return
      }
    } catch {
      // Fall through to external open for non-standard source identifiers.
    }
    openFilesExternalUri(descriptor.sourceUri)
  }, [descriptor, file.uri, openFilePreview])

  const openBodyResource = useCallback(() => {
    if (!bodyUri) return
    openFilePreview(bodyUri)
  }, [bodyUri, openFilePreview])

  const refreshSourceLinkedCard = useCallback(async () => {
    if (!descriptor || !bodyUri) return
    setSourceActionError(null)
    try {
      const plan = await refreshSource.mutateAsync({
        documentUri: file.uri,
        subject: getSourceLinkedCardSubject(file.uri),
        targetResourceUri: bodyUri,
        sourceUri: descriptor.sourceUri,
        sourceKind: descriptor.sourceKind,
        title: descriptor.title,
        mimeType: descriptor.mimeType,
        currentSourceHash: descriptor.sourceHash,
        ingestVersion: descriptor.ingestVersion,
        sourceIngestManifestUri: descriptor.sourceIngestManifestUri,
      })
      toast({
        description: plan.sourceProposal
          ? '来源已变化，Ingest 审批已创建'
          : '来源无变化',
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : '来源刷新失败'
      setSourceActionError(`刷新来源失败：${reason}`)
    }
  }, [bodyUri, descriptor, file, refreshSource, toast])

  const reviewSourceUpdate = useCallback(async () => {
    if (!expectedSourceProposal) return
    if (sourceProposal && sourceProposalUri) {
      setSourceActionError(null)
      openFilePreview(sourceProposalUri)
      return
    }
    await refreshSourceLinkedCard()
  }, [expectedSourceProposal, openFilePreview, refreshSourceLinkedCard, sourceProposal, sourceProposalUri])

  const keepLocalEdits = useCallback(async () => {
    if (!descriptor || !expectedSourceProposal) return
    setSourceActionError(null)
    try {
      if (sourceApprovalQuery.data?.status === 'pending') {
        await resolveSourceApproval.mutateAsync({
          approval: sourceApprovalQuery.data,
          decision: 'rejected',
          reason: `Keep local edits for ${descriptor.title}.`,
        })
        toast({ description: '本地编辑已保留' })
        return
      }
      await createSourceProposal.mutateAsync({
        ...expectedSourceProposal,
        operation: 'keep-local',
        summary: `Keep local edits for ${descriptor.title}.`,
        diff: `Local body content remains authoritative for ${descriptor.sourceUri}.`,
        proposedContent: null,
      })
      toast({ description: '本地编辑已保留，Ingest 审批已创建' })
    } catch (error) {
      const reason = error instanceof Error ? error.message : '审批状态更新失败'
      setSourceActionError(`保留本地编辑失败：${reason}`)
    }
  }, [createSourceProposal, descriptor, expectedSourceProposal, resolveSourceApproval, sourceApprovalQuery.data, toast])

  const requestNextSourceIngestRange = useCallback(async () => {
    const nextRange = sourceIngestManifest?.pendingRanges[0]
    if (!sourceIngestManifest || !nextRange) return
    setSourceActionError(null)
    try {
      const result = await requestSourceIngestRange.mutateAsync({
        manifest: sourceIngestManifest,
        range: nextRange,
      })
      toast({
        description: result.action === 'reused'
          ? `Ingest 队列已有：${nextRange.start}..${nextRange.end}`
          : `已加入 Ingest 队列：${nextRange.start}..${nextRange.end}`,
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : '队列更新失败'
      setSourceActionError(`Ingest 下一段失败：${reason}`)
    }
  }, [requestSourceIngestRange, sourceIngestManifest, toast])

  const requestAllSourceIngestRanges = useCallback(async () => {
    const ranges = sourceIngestManifest?.pendingRanges ?? []
    if (!sourceIngestManifest || ranges.length === 0) return
    setSourceActionError(null)
    try {
      await requestSourceIngestRange.mutateAsync({
        manifest: sourceIngestManifest,
        ranges,
      })
      toast({ description: `已加入 Ingest 队列：全部 ${ranges.length} 段` })
    } catch (error) {
      const reason = error instanceof Error ? error.message : '队列更新失败'
      setSourceActionError(`Ingest 全部失败：${reason}`)
    }
  }, [requestSourceIngestRange, sourceIngestManifest, toast])

  return {
    bodyFile,
    bodyPreviewText,
    bodyUri,
    descriptor,
    displayIngestVersion,
    expectedSourceProposal,
    keepLocalEdits,
    openBodyResource,
    openSource,
    pendingSourceProposalsLoading: pendingSourceProposalsQuery.isLoading,
    refreshPending: refreshSource.isPending,
    refreshSourceLinkedCard,
    requestAllSourceIngestRanges,
    requestNextSourceIngestRange,
    requestSourceIngestRangePending: requestSourceIngestRange.isPending,
    resolveSourceApprovalPending: resolveSourceApproval.isPending,
    reviewSourceUpdate,
    sourceActionError,
    sourceApproval: sourceApprovalQuery.data ?? null,
    sourceCreatePending: createSourceProposal.isPending,
    sourceIngestManifest,
    sourceProposal,
  }
}
