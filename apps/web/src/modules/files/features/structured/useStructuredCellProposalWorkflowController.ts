import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useToast } from '@/components/ui/use-toast'

import {
  useCreateStructuredCellChangeProposal,
  useWriteOwnStructuredCellChange,
  usePendingStructuredCellChangeProposals,
} from '../../data/queries'
import { createStructuredCellChangeProposal } from '../../domain/proposal/structured-cell-approval-model'
import { FilesSaveConflictError } from '../../domain/resource/resource-model'
import {
  type StructuredCellCommitResult,
  type StructuredCellWriteProposal,
} from '../../domain/structured/structured-table'
import {
  createStructuredCellProposalWorkflowState,
  projectAllStructuredPendingWriteSubjects,
  projectEffectiveStructuredCellWriteProposals,
  projectPersistedStructuredCellWriteProposals,
  projectPersistedStructuredPendingWriteSubjects,
  projectStructuredCellProposalWorkflowStateReset,
  projectStructuredCellProposalWorkflowStateTableProposals,
  projectStructuredCellProposalWorkflowStateTableSubjects,
  projectStructuredCellProposalWorkflowStateViewProposal,
} from './structured-cell-proposal-workflow-model'
import { formatFilesErrorForUser } from '@/lib/user-facing-errors'
import {
  useStructuredEditHistoryController,
  type StructuredEditLatestDocument,
  type StructuredEditWriteOptions,
} from './useStructuredEditHistoryController'
import type { StructuredEditChange, StructuredEditValueCanonicalizer } from './structured-edit-history-model'

export function useStructuredCellProposalWorkflowController({
  canonicalizeValue,
  currentPodRootUri,
  documentEtag = null,
  documentUri,
  predicateLabel,
  readLatest,
  structuredWritesSupported,
}: {
  canonicalizeValue?: StructuredEditValueCanonicalizer
  currentPodRootUri?: string | null
  documentEtag?: string | null
  documentUri: string
  predicateLabel?: (predicate: string) => string
  /** Reads the document again; 撤销 / 重做 compare with it before writing. */
  readLatest?: () => Promise<StructuredEditLatestDocument | null>
  structuredWritesSupported: boolean
}) {
  const createCellProposal = useCreateStructuredCellChangeProposal()
  const writeOwnCellChange = useWriteOwnStructuredCellChange()
  const pendingStructuredCellProposalsQuery = usePendingStructuredCellChangeProposals(documentUri, structuredWritesSupported)
  const { toast } = useToast()
  // Our own write moves the document on, so a second write against the same loaded version
  // (a multi-card move, quick edits) must not be refused as "changed elsewhere".
  const etagWrittenAgainstRef = useRef<string | null>(null)
  const [cellProposalWorkflowState, setCellProposalWorkflowState] = useState(createStructuredCellProposalWorkflowState)
  const {
    localCellWriteProposals,
    localPendingWriteSubjects,
    localViewCellWriteProposals,
  } = cellProposalWorkflowState
  const persistedCellWriteProposals = useMemo(
    () => projectPersistedStructuredCellWriteProposals(pendingStructuredCellProposalsQuery.data),
    [pendingStructuredCellProposalsQuery.data],
  )
  const effectiveCellWriteProposals = useMemo(() => (
    projectEffectiveStructuredCellWriteProposals({
      localCellWriteProposals,
      localViewCellWriteProposals,
      persistedCellWriteProposals,
    })
  ), [localCellWriteProposals, localViewCellWriteProposals, persistedCellWriteProposals])
  const persistedPendingWriteSubjects = useMemo(() => (
    projectPersistedStructuredPendingWriteSubjects(persistedCellWriteProposals)
  ), [persistedCellWriteProposals])
  const allPendingWriteSubjects = useMemo(() => (
    projectAllStructuredPendingWriteSubjects({
      localPendingWriteSubjects,
      persistedPendingWriteSubjects,
    })
  ), [localPendingWriteSubjects, persistedPendingWriteSubjects])

  useEffect(() => {
    setCellProposalWorkflowState((current) => projectStructuredCellProposalWorkflowStateReset(current))
    etagWrittenAgainstRef.current = null
  }, [documentUri])

  const setLocalPendingWriteSubjectsFromTable = useCallback((subjects: string[]) => {
    setCellProposalWorkflowState((current) => projectStructuredCellProposalWorkflowStateTableSubjects({
      current,
      subjects,
    }))
  }, [])

  const syncLocalCellWriteProposalsFromTable = useCallback((proposals: StructuredCellWriteProposal[]) => {
    setCellProposalWorkflowState((current) => projectStructuredCellProposalWorkflowStateTableProposals({
      current,
      proposals,
    }))
  }, [])

  const writeOwnChange = useCallback(async (change: StructuredEditChange, options?: StructuredEditWriteOptions) => {
    await writeOwnCellChange.mutateAsync({
      documentUri,
      subject: change.subject,
      predicate: change.predicate,
      previousValues: change.previousValues,
      nextValues: change.nextValues,
      expectedEtag: options && 'expectedEtag' in options
        ? options.expectedEtag
        : documentEtag && etagWrittenAgainstRef.current === documentEtag ? null : documentEtag,
    })
    etagWrittenAgainstRef.current = documentEtag
  }, [documentEtag, documentUri, writeOwnCellChange])

  const notifyEditHistory = useCallback((description: string, options?: { destructive?: boolean }) => {
    toast({ description, ...(options?.destructive ? { variant: 'destructive' as const } : {}) })
  }, [toast])
  const editHistory = useStructuredEditHistoryController({
    canonicalizeValue,
    documentUri,
    notify: notifyEditHistory,
    predicateLabel,
    readLatest,
    writeChange: writeOwnChange,
  })
  const { recordChange } = editHistory

  const commitCellWriteProposal = useCallback(async (
    proposal: StructuredCellWriteProposal,
    options: { recordHistory?: boolean } = {},
  ): Promise<StructuredCellCommitResult> => {
    // The person's own edit is written directly. A new vocabulary term still needs
    // its own approval, so that case keeps the proposal path.
    if (!proposal.vocabTermProposalResourceUri) {
      try {
        const change = {
          subject: proposal.subject,
          predicate: proposal.predicate,
          previousValues: proposal.previousValues,
          nextValues: proposal.nextValues,
        }
        await writeOwnChange({ ...change })
        if (options.recordHistory !== false) recordChange(change)
        return 'written' as const
      } catch (error) {
        toast({ description: formatFilesErrorForUser(error, '保存失败，请重试。'), variant: 'destructive' })
        return false
      }
    }
    try {
      await createCellProposal.mutateAsync(createStructuredCellChangeProposal({
        documentUri: proposal.documentUri,
        subject: proposal.subject,
        predicate: proposal.predicate,
        vocabTermProposalResourceUri: proposal.vocabTermProposalResourceUri,
        previousValues: proposal.previousValues,
        nextValues: proposal.nextValues,
        reason: 'Structured cell change staged from Files table.',
        podRootUri: currentPodRootUri,
      }))
      toast({ description: '单元格变更已提交审批' })
      return true
    } catch (error) {
      const description = error instanceof FilesSaveConflictError
        ? '审批记录已存在：请打开现有审批记录继续审阅。'
        : formatFilesErrorForUser(error, '创建单元格变更审批失败')
      toast({ description, variant: 'destructive' })
      return false
    }
  }, [createCellProposal, currentPodRootUri, recordChange, toast, writeOwnChange])

  const commitViewCellWriteProposal = useCallback(async (
    proposal: StructuredCellWriteProposal,
    options?: { recordHistory?: boolean },
  ) => {
    const saved = await commitCellWriteProposal(proposal, options)
    // Only changes waiting for approval are tracked as pending.
    if (saved === true) {
      setCellProposalWorkflowState((current) => projectStructuredCellProposalWorkflowStateViewProposal({
        current,
        proposal,
      }))
    }
    return saved
  }, [commitCellWriteProposal])

  return {
    allPendingWriteSubjects,
    commitCellWriteProposal,
    commitViewCellWriteProposal,
    editHistory,
    effectiveCellWriteProposals,
    persistedCellWriteProposals,
    setLocalPendingWriteSubjectsFromTable,
    syncLocalCellWriteProposalsFromTable,
  }
}
