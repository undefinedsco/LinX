import type { KeyboardEvent } from 'react'
import { Plus } from 'lucide-react'

import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type {
  StructuredSubjectCreationDialogModel,
  StructuredSubjectCreationFooterModel,
} from './structured-subject-creation-model'

export function StructuredSubjectCreationFooterRow({
  disabled,
  footerModel,
  footerPredicates,
  onOpen,
  title,
}: {
  disabled: boolean
  footerModel: StructuredSubjectCreationFooterModel
  footerPredicates: readonly string[]
  onOpen: () => void
  title: string
}) {
  return (
    <tr>
      <td className="px-2 py-1 font-medium text-foreground/80">
        <button
          aria-label={footerModel.buttonAriaLabel}
          className="flex items-center gap-1 rounded px-1 py-0.5 text-primary hover:bg-primary/10"
          disabled={disabled}
          title={title}
          onClick={onOpen}
        >
          <Plus className="h-3.5 w-3.5" />
          {footerModel.buttonLabel}
        </button>
      </td>
      {footerPredicates.map((predicate) => (
        <td key={predicate} className="border-l border-border/5 px-1.5 py-0.5 text-muted-foreground/30"> </td>
      ))}
      <td className="border-l border-border/5 px-1.5 py-0.5 text-muted-foreground/30"> </td>
    </tr>
  )
}

export function StructuredSubjectCreationDialog({
  dialogModel,
  onOpenChange,
  onSubjectDraftChange,
  onSubjectDraftKeyDown,
  onSubmit,
  open,
  subjectDraft,
  submitDisabled,
}: {
  dialogModel: StructuredSubjectCreationDialogModel
  onOpenChange: (open: boolean) => void
  onSubjectDraftChange: (value: string) => void
  onSubjectDraftKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onSubmit: () => void
  open: boolean
  subjectDraft: string
  submitDisabled: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogModel.title}</DialogTitle>
          <DialogDescription>{dialogModel.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            aria-label={dialogModel.subjectInputLabel}
            value={subjectDraft}
            onChange={(event) => onSubjectDraftChange(event.target.value)}
            onKeyDown={onSubjectDraftKeyDown}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/70"
              onClick={() => onOpenChange(false)}
            >
              {dialogModel.cancelLabel}
            </button>
            <button
              type="button"
              className="rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-60"
              disabled={submitDisabled}
              onClick={onSubmit}
            >
              {dialogModel.submitLabel}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
