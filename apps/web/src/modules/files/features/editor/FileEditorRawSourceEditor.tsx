import { Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

import type { FileEditorRawSourceState } from './file-editor-raw-source-model'
import { useFileEditorRawSourceController } from './useFileEditorRawSourceController'

export function FileEditorRawSourceEditor({
  sourceState,
  onDirtyChange,
  onSavePendingChange,
  onSubmitProposal,
  proposalPending = false,
  proposalLabel,
  allowCanonicalSave = true,
}: {
  sourceState: FileEditorRawSourceState
  onDirtyChange?: (dirty: boolean) => void
  onSavePendingChange?: (pending: boolean) => void
  onSubmitProposal?: (content: string) => Promise<void>
  proposalPending?: boolean
  proposalLabel?: string
  allowCanonicalSave?: boolean
}) {
  const rawSource = useFileEditorRawSourceController({
    onDirtyChange,
    onSavePendingChange,
    onSubmitProposal,
    proposalPending,
    proposalLabel,
    sourceState,
  })

  if (sourceState.kind === 'loading') {
    return (
      <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {rawSource.chrome.loadingMessage}
      </div>
    )
  }

  if (sourceState.kind === 'unavailable') {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        {rawSource.chrome.unavailableMessage}
      </div>
    )
  }
  const rawResourceSummary = rawSource.chrome.rawResourceSummary

  return (
    <div className="space-y-3">
      <Textarea
        aria-label={rawSource.chrome.contentAriaLabel}
        className="min-h-[360px] rounded-md font-mono text-xs leading-relaxed"
        value={rawSource.draft}
        onChange={(event) => rawSource.setDraft(event.target.value)}
        spellCheck={false}
      />
      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        {rawResourceSummary ? (
          <span className="truncate" title={rawResourceSummary.title}>
            {rawResourceSummary.label}
          </span>
        ) : null}
        <div className="flex items-center gap-1.5">
          {onSubmitProposal ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={rawSource.chrome.proposalSubmitLabel}
              title={rawSource.chrome.proposalSubmitLabel}
              disabled={!rawSource.dirty || proposalPending}
              onClick={rawSource.handleSubmitProposal}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : null}
          {allowCanonicalSave ? (
            <Button size="sm" className="h-7 text-xs" disabled={!rawSource.dirty || rawSource.savePending} onClick={rawSource.handleSave}>
              {rawSource.chrome.canonicalSaveLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
