import { useEffect, useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Check, InfoIcon, MoreHorizontal, Shield } from 'lucide-react'
import type { FilesDetail } from '../../domain/resource/resource-model'
import { AccessPolicyDialog } from '../sidecars/ResourceSidecars'
import { useResourceSidecarActionsController } from '../sidecars/useResourceSidecarActionsController'
import { RichTextFileEditor } from '../../ui/RichTextFileEditor'
import { FileEditorSheetMetaTail } from './FileEditorSheetMetaTail'
import { FileEditorRawSourceEditor } from './FileEditorRawSourceEditor'
import { useFileEditorSheetController, type FileEditorSourceLinkedDescriptor } from './useFileEditorSheetController'

type PendingDiscardAction =
  | { type: 'close' }
  | { type: 'switch-view'; view: 'rich' | 'raw' }

export function DocumentEditorModal({
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
  const setContentView = editor.setContentView
  const [richTextDirty, setRichTextDirty] = useState(false)
  const [richTextSaveStatus, setRichTextSaveStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [rawSourceDirty, setRawSourceDirty] = useState(false)
  const [rawSourceSavePending, setRawSourceSavePending] = useState(false)
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false)
  const [pendingDiscardAction, setPendingDiscardAction] = useState<PendingDiscardAction | null>(null)
  const hasUnsavedChanges = richTextDirty || rawSourceDirty
  const savePending = richTextSaveStatus === 'saving' || rawSourceSavePending

  useEffect(() => {
    if (open) return
    setRichTextDirty(false)
    setRichTextSaveStatus('saved')
    setRawSourceDirty(false)
    setRawSourceSavePending(false)
    setDiscardDialogOpen(false)
    setPendingDiscardAction(null)
  }, [open])

  const requestDiscardConfirmation = (action: PendingDiscardAction) => {
    setPendingDiscardAction(action)
    setDiscardDialogOpen(true)
  }

  const closeEditor = () => {
    onOpenChange(false)
    if (editor.structuredReturnAction) editor.returnToSourceStructuredSubject()
  }

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && hasUnsavedChanges) {
      requestDiscardConfirmation({ type: 'close' })
      return
    }
    if (nextOpen) onOpenChange(true)
    else closeEditor()
  }

  const handleContentViewChange = (view: 'rich' | 'raw') => {
    if (view === editor.contentView) return
    if (hasUnsavedChanges) {
      requestDiscardConfirmation({ type: 'switch-view', view })
      return
    }
    setContentView(view)
  }

  const discardChanges = () => {
    if (savePending) return
    const action = pendingDiscardAction
    setDiscardDialogOpen(false)
    setPendingDiscardAction(null)
    setRichTextDirty(false)
    setRawSourceDirty(false)
    if (action?.type === 'switch-view') {
      setContentView(action.view)
      return
    }
    if (action?.type === 'close') closeEditor()
  }

  useEffect(() => {
    if (!discardDialogOpen || !pendingDiscardAction || hasUnsavedChanges || savePending) return
    const action = pendingDiscardAction
    setDiscardDialogOpen(false)
    setPendingDiscardAction(null)
    if (action.type === 'switch-view') {
      setContentView(action.view)
      return
    }
    closeEditor()
  }, [
    discardDialogOpen,
    hasUnsavedChanges,
    onOpenChange,
    pendingDiscardAction,
    savePending,
    setContentView,
  ])

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
        onDirtyChange={setRichTextDirty}
        onSaveStatusChange={setRichTextSaveStatus}
        onSubmitProposal={editor.canUseRichEditor ? editor.submitChangeProposal : undefined}
        proposalPending={editor.proposalPending}
        proposalLabel={editor.proposalLabel}
        className="min-h-[360px] border-0 px-0 py-0 shadow-none"
      />
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleSheetOpenChange}>
      <DialogContent
        data-document-editor-modal="true"
        className="max-h-[92vh] w-[min(1120px,calc(100vw-32px))] max-w-none gap-0 overflow-hidden rounded-xl border-border/40 p-0 shadow-2xl"
      >
        <DialogHeader className="h-12 border-b border-border/30 px-4 pr-14">
          <div className="flex h-12 items-center justify-between gap-3" aria-label={editor.sheetChrome.headerAriaLabel}>
            <DialogTitle className="sr-only">{editor.sheetChrome.dialogTitle}</DialogTitle>
            <DialogDescription className="sr-only">
              编辑文件内容并在下方查看文件 meta。
            </DialogDescription>
            <span
              data-document-editor-file-title="true"
              className="min-w-0 max-w-[min(520px,60vw)] truncate text-sm font-medium text-foreground"
            >
              {file.name}
            </span>
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
                    <DropdownMenuItem key={option.mode} onSelect={() => handleContentViewChange(option.mode)}>
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
          <div className="mx-auto w-full max-w-[800px] px-8 py-8">
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
                onDirtyChange={setRawSourceDirty}
                onSavePendingChange={setRawSourceSavePending}
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
        {sidecarActions.accessOpen ? (
          <AccessPolicyDialog
            file={file}
            open
            onOpenChange={sidecarActions.setAccessDialogOpen}
          />
        ) : null}
      </DialogContent>
      </Dialog>
      <Dialog
        open={discardDialogOpen}
        onOpenChange={(nextOpen) => {
          setDiscardDialogOpen(nextOpen)
          if (!nextOpen) setPendingDiscardAction(null)
        }}
      >
        <DialogContent className="w-[min(420px,calc(100vw-32px))] gap-4 rounded-xl border-border/40 p-5">
          <DialogHeader>
            <DialogTitle>未保存的修改</DialogTitle>
            <DialogDescription>
              {pendingDiscardAction?.type === 'switch-view'
                ? savePending
                  ? '正在保存当前模式的修改。保存完成后会自动切换编辑模式。'
                  : '当前模式的草稿尚未写入文件。继续编辑可以保留草稿，放弃修改会切换编辑模式。'
                : savePending
                  ? '正在保存修改。保存完成后会自动关闭文件详情。'
                : '内容尚未写入当前文件。继续编辑可以保留草稿，放弃修改会关闭文件详情。'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDiscardDialogOpen(false)
                setPendingDiscardAction(null)
              }}
            >
              继续编辑
            </Button>
            <Button variant="destructive" size="sm" disabled={savePending} onClick={discardChanges}>
              放弃修改
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
