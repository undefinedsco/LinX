import { cn } from '@/lib/utils'
import {
  projectFolderChildOperationConfirmChrome,
  projectFolderChildOperationSheetModel,
  type FolderChildOperation,
} from '../../domain/folder/folder-operation-model'

export function FolderChildOperationSheet({
  operation,
  value,
  validationMessage,
  pending,
  confirmDisabled,
  onValueChange,
  onClose,
  onConfirm,
}: {
  operation: FolderChildOperation
  value: string
  validationMessage?: string | null
  pending: boolean
  confirmDisabled: boolean
  onValueChange: (value: string) => void
  onClose: () => void
  onConfirm: (operation: Exclude<FolderChildOperation, null>, value?: string) => void
}) {
  const sheet = projectFolderChildOperationSheetModel(operation)
  if (!operation || !sheet) return null
  const confirmChrome = projectFolderChildOperationConfirmChrome({ sheet, pending })

  return (
    <div className="fixed inset-x-0 top-16 z-50 flex justify-center px-4">
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="folder-child-operation-title"
        aria-describedby="folder-child-operation-description"
        className="w-[min(420px,calc(100vw-32px))] rounded-xl border border-border/70 bg-popover p-4 text-popover-foreground shadow-xl"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const submittedValue = sheet.requiresInput
              ? new FormData(event.currentTarget).get('folder-child-operation-value')?.toString() ?? value
              : value
            if (confirmDisabled) return
            onConfirm(operation, submittedValue)
          }}
        >
          <div className="space-y-1">
            <h2 id="folder-child-operation-title" className="text-sm font-semibold leading-5">
              {sheet.title}
            </h2>
            <p id="folder-child-operation-description" className="line-clamp-2 break-all text-xs text-muted-foreground">
              {sheet.description}
            </p>
          </div>
          {sheet.requiresInput ? (
            <div className="mt-4 space-y-1.5">
              <label htmlFor="folder-child-operation-input" className="text-[11px] font-medium text-muted-foreground">
                {sheet.inputLabel}
              </label>
              <input
                name="folder-child-operation-value"
                id="folder-child-operation-input"
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring"
              />
              {validationMessage ? (
                <p className="text-[11px] text-destructive">{validationMessage}</p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="h-8 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="submit"
              className={cn(
                'h-8 rounded-md px-3 text-xs font-medium text-primary-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                sheet.confirmTone === 'destructive' ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90',
              )}
              disabled={confirmDisabled}
              onClick={(event) => {
                event.preventDefault()
                const form = event.currentTarget.form
                const submittedValue = sheet.requiresInput
                  ? form
                    ? new FormData(form).get('folder-child-operation-value')?.toString() ?? value
                    : value
                  : value
                if (confirmDisabled) return
                onConfirm(operation, submittedValue)
              }}
            >
              {confirmChrome.label}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
