import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Check, FileText, InfoIcon, MoreHorizontal, Shield } from 'lucide-react'
import type { FilesDetail } from '../../domain/resource/resource-model'
import { AccessPolicyDialog } from '../sidecars/ResourceSidecars'
import { useResourceSidecarActionsController } from '../sidecars/useResourceSidecarActionsController'
import { RichTextFileEditor } from '../../ui/RichTextFileEditor'
import { FileEditorSheetMetaTail } from './FileEditorSheetMetaTail'
import { FileEditorRawSourceEditor } from './FileEditorRawSourceEditor'
import { useFileEditorSheetController, type FileEditorSourceLinkedDescriptor } from './useFileEditorSheetController'

export function FileEditorSheet({
  file,
  open,
  onOpenChange,
  sourceLinkedDescriptor,
  sourceLinkedDescriptorUri,
  stagedSourceText,
}: {
  file: FilesDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceLinkedDescriptor?: FileEditorSourceLinkedDescriptor | null
  sourceLinkedDescriptorUri?: string
  stagedSourceText?: string | null
}) {
  const editor = useFileEditorSheetController({
    file,
    open,
    sourceLinkedDescriptor,
    sourceLinkedDescriptorUri,
    stagedSourceText,
  })
  const sidecarActions = useResourceSidecarActionsController(file)
  const handleNoteTitleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    event.currentTarget.blur()
  }

  const handleOpenMetaTail = () => {
    const metaTail = document.getElementById(editor.metaTailId)
    const toggle = metaTail?.querySelector<HTMLButtonElement>('[data-resource-meta-tail-toggle="true"]')
    if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click()
    metaTail?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }

  const renderRichContent = () => {
    if (editor.richContentState.kind === 'loading') {
      return (
        <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {editor.richContentState.message}
        </div>
      )
    }

    if (editor.richContentState.kind === 'unavailable') {
      return (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {editor.richContentState.message}
        </div>
      )
    }

    return (
      <RichTextFileEditor
        content={editor.richEditorContent}
        editable
        warning={editor.richEditorWarning}
        onSaveText={editor.canSaveRichText ? editor.saveRichTextContent : undefined}
        onSubmitProposal={editor.canUseRichEditor ? editor.submitChangeProposal : undefined}
        proposalPending={editor.proposalPending}
        proposalLabel={editor.proposalLabel}
        className="min-h-[360px] border-0 px-0 py-0 shadow-none"
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-files-editor-sheet="true"
        className="max-h-[92vh] w-[min(1120px,calc(100vw-32px))] max-w-none gap-0 overflow-hidden rounded-xl border-border/40 p-0 shadow-2xl"
      >
        <DialogHeader className="h-12 border-b border-border/30 px-4 pr-14">
          <div className="flex h-12 items-center justify-between gap-3" aria-label={editor.sheetChrome.headerAriaLabel}>
            <DialogTitle className="sr-only">{editor.sheetChrome.dialogTitle}</DialogTitle>
            <DialogDescription className="sr-only">
              编辑文件内容并在下方查看文件 meta。
            </DialogDescription>
            <div className="inline-flex min-w-0 max-w-[min(420px,60vw)] items-center gap-2 rounded-lg border border-border/40 bg-background px-2.5 py-1.5 text-sm shadow-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate font-medium text-foreground/85">{file.name}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="显示 Info"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                onClick={handleOpenMetaTail}
              >
                <InfoIcon className="h-4 w-4" aria-hidden="true" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="更多文件操作"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={handleOpenMetaTail}>
                    <InfoIcon className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                    显示 Info
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={sidecarActions.openAccessDialog}>
                    <Shield className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                    查看 Access 来源
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {editor.sheetChrome.contentViewOptions.map((option) => (
                    <DropdownMenuItem key={option.mode} onSelect={() => editor.setContentView(option.mode)}>
                      <Check className={cn('mr-2 h-3.5 w-3.5', option.active ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1" aria-label={editor.sheetChrome.contentScrollAriaLabel}>
          <div className="mx-auto w-full max-w-[760px] px-8 py-12">
            <input
              aria-label={editor.sheetChrome.titleInputAriaLabel}
              className="mb-8 w-full min-w-0 rounded-sm border-0 bg-transparent px-0 py-0.5 text-4xl font-semibold leading-tight text-foreground outline-none placeholder:text-muted-foreground/40 focus-visible:ring-0 read-only:cursor-default"
              value={editor.noteTitle}
              readOnly={!editor.canSaveRichText}
              onChange={(event) => editor.setNoteTitle(event.target.value)}
              onBlur={editor.saveNoteTitle}
              onKeyDown={handleNoteTitleKeyDown}
            />
            {editor.structuredReturnAction ? (
              <button
                className="-mt-5 mb-5 text-[11px] font-medium text-primary hover:underline"
                onClick={editor.returnToSourceStructuredSubject}
              >
                {editor.structuredReturnAction.label}
              </button>
            ) : null}
            {editor.sourceLinkedPanel ? (
              <div className="mb-4 rounded-md border border-border/40 bg-muted/20 px-3 py-2">
                <p className="text-[11px] font-medium text-foreground/80">{editor.sourceLinkedPanel.title}</p>
                <div className="mt-2 grid gap-1 text-[11px]">
                  {editor.sourceLinkedPanel.rows.map((row) => (
                    <p key={row.id}>
                      <span className="text-muted-foreground">{row.label}</span>{' '}
                      <span className={cn(row.breakAll && 'break-all', 'text-foreground/80')}>{row.value}</span>
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            {editor.contentView === 'rich' ? (
              renderRichContent()
            ) : (
              <FileEditorRawSourceEditor
                sourceState={editor.rawSourceEditorState}
                onSubmitProposal={editor.submitChangeProposal}
                proposalPending={editor.proposalPending}
                proposalLabel={editor.proposalLabel}
                allowCanonicalSave={!editor.isSourceLinkedEditor}
              />
            )}
          </div>
          <FileEditorSheetMetaTail
            id={editor.metaTailId}
            file={file}
            noteTitle={editor.noteTitle}
            content={editor.metaContent}
            sourceLinkedDescriptor={sourceLinkedDescriptor}
            sourceLinkedDescriptorUri={sourceLinkedDescriptorUri}
          />
        </ScrollArea>
        <AccessPolicyDialog
          file={file}
          open={sidecarActions.accessOpen}
          onOpenChange={sidecarActions.setAccessDialogOpen}
        />
      </DialogContent>
    </Dialog>
  )
}
