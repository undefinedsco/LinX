import { useCallback, useState } from 'react'

import type { FilesDetail } from '../../domain/resource/resource-model'
import {
  createSourceLinkedCardPreviewState,
  createSourceLinkedCardActionErrorId,
  projectSourceLinkedCardPreviewSheetOpen,
  projectSourceLinkedCardPreviewSourceDetailsToggled,
  projectSourceLinkedCardActionError,
  projectSourceLinkedCardDetailRows,
  projectSourceLinkedCardDetailsPanel,
  projectSourceLinkedCardEditorSheet,
  projectSourceLinkedCardIngestRangeActions,
  projectSourceLinkedCardPendingIngestRangeAvailability,
  projectSourceLinkedCardStagedIngestContent,
  projectSourceLinkedCardPreviewContent,
  projectSourceLinkedCardPrimaryActions,
  type SourceLinkedCardIngestRangeActionId,
  type SourceLinkedCardPrimaryActionIcon,
  type SourceLinkedCardPrimaryActionId,
} from './source-linked-card-preview-model'
import {
  projectFileEditorRichEditorContent,
  projectFileEditorRichTextSourceInput,
} from '../editor/file-editor-sheet-model'
import { useSourceLinkedCardWorkflowController } from './useSourceLinkedCardWorkflowController'

type SourceLinkedCardPrimaryAction = {
  id: SourceLinkedCardPrimaryActionId
  label: string
  icon: SourceLinkedCardPrimaryActionIcon
  disabled: boolean
  describedByError: boolean
  onSelect: () => void | Promise<void>
}
type SourceLinkedCardIngestRangeAction = {
  id: SourceLinkedCardIngestRangeActionId
  label: string
  disabled: boolean
  onSelect: () => void | Promise<void>
}

export function useSourceLinkedCardPreviewController(file: FilesDetail) {
  const [previewState, setPreviewState] = useState(createSourceLinkedCardPreviewState)
  const { sheetOpen, sourceDetailsOpen } = previewState
  const source = useSourceLinkedCardWorkflowController(file)
  const bodyRichTextInput = projectFileEditorRichTextSourceInput(source.bodyPreviewText)
  const bodyRichEditorContent = projectFileEditorRichEditorContent({
    mimeType: source.bodyFile?.mimeType ?? 'text/markdown',
    previewText: source.bodyPreviewText,
    sourceText: bodyRichTextInput.sourceText,
  })
  const sourceActionErrorId = createSourceLinkedCardActionErrorId(file.uri)
  const hasPendingIngestRanges = projectSourceLinkedCardPendingIngestRangeAvailability(source.sourceIngestManifest)
  const stagedIngestContent = projectSourceLinkedCardStagedIngestContent(source.sourceProposal)
  const sourceDetailRows = projectSourceLinkedCardDetailRows({
    approval: source.sourceApproval,
    bodyUri: source.bodyUri,
    descriptor: source.descriptor,
    displayIngestVersion: source.displayIngestVersion,
    sourceIngestManifest: source.sourceIngestManifest,
    sourceProposal: source.sourceProposal,
  })
  const content = projectSourceLinkedCardPreviewContent({
    bodyFile: source.bodyFile,
    bodyRichEditorContent,
    bodyPreviewText: source.bodyPreviewText,
    bodyRichTextWarning: bodyRichTextInput.warning,
    bodyUri: source.bodyUri,
    descriptor: source.descriptor,
    fallbackRawText: file.previewText,
  })
  const actionError = projectSourceLinkedCardActionError({
    id: sourceActionErrorId,
    message: source.sourceActionError,
  })
  const detailsPanel = projectSourceLinkedCardDetailsPanel({
    open: sourceDetailsOpen,
    rawText: file.previewText,
    rows: sourceDetailRows,
    sourceIngestManifest: source.sourceIngestManifest,
    sourceProposal: source.sourceProposal,
  })
  const sourceActionHandlers: Record<SourceLinkedCardPrimaryActionId, () => void | Promise<void>> = {
    'keep-local-edits': source.keepLocalEdits,
    'open-body-resource': source.openBodyResource,
    'open-source': source.openSource,
    'refresh-source': source.refreshSourceLinkedCard,
    'review-ingest': source.reviewSourceUpdate,
  }
  const primaryActions: SourceLinkedCardPrimaryAction[] = projectSourceLinkedCardPrimaryActions({
    expectedSourceProposal: Boolean(source.expectedSourceProposal),
    hasActionError: Boolean(source.sourceActionError),
    pendingSourceProposalsLoading: source.pendingSourceProposalsLoading,
    refreshPending: source.refreshPending,
    resolveSourceApprovalPending: source.resolveSourceApprovalPending,
    sourceCreatePending: source.sourceCreatePending,
  }).map((action) => ({
    ...action,
    onSelect: sourceActionHandlers[action.id],
  }))
  const ingestRangeActionHandlers: Record<SourceLinkedCardIngestRangeActionId, () => void | Promise<void>> = {
    'request-all-ingest-ranges': source.requestAllSourceIngestRanges,
    'request-next-ingest-range': source.requestNextSourceIngestRange,
  }
  const ingestRangeActions: SourceLinkedCardIngestRangeAction[] = projectSourceLinkedCardIngestRangeActions({
    requestPending: source.requestSourceIngestRangePending,
  }).map((action) => ({
    ...action,
    onSelect: ingestRangeActionHandlers[action.id],
  }))
  const setSheetOpen = useCallback((open: boolean) => {
    setPreviewState((current) => projectSourceLinkedCardPreviewSheetOpen({
      current,
      open,
    }))
  }, [])
  const openSheet = useCallback(() => {
    setSheetOpen(true)
  }, [setSheetOpen])
  const toggleSourceDetails = useCallback(() => {
    setPreviewState((current) => projectSourceLinkedCardPreviewSourceDetailsToggled(current))
  }, [])

  return {
    source,
    actionError,
    bodyRichTextWarning: bodyRichTextInput.warning,
    content,
    detailsPanel,
    editorSheet: projectSourceLinkedCardEditorSheet({
      content,
      descriptor: source.descriptor,
      descriptorUri: file.uri,
      open: sheetOpen,
      sourceProposal: source.sourceProposal,
    }),
    hasPendingIngestRanges,
    ingestRangeActions,
    primaryActions,
    sheetOpen,
    setSheetOpen,
    openSheet,
    sourceDetailsOpen,
    toggleSourceDetails,
    sourceActionErrorId,
    sourceDetailRows,
    stagedIngestContent,
  }
}
