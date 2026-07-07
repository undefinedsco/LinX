import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface FilesOperationSheetInput {
  label: string
  value: string
  onValueChange: (value: string) => void
}

export interface FilesOperationSheetProps {
  open: boolean
  title: string
  description: string
  input?: FilesOperationSheetInput | null
  confirmLabel: string
  confirmDisabled: boolean
  destructive?: boolean
  validationMessage?: string | null
  onClose: () => void
  onConfirm: () => void
}

export function FilesOperationSheet({
  open,
  title,
  description,
  input = null,
  confirmLabel,
  confirmDisabled,
  destructive = false,
  validationMessage,
  onClose,
  onConfirm,
}: FilesOperationSheetProps) {
  if (!open) return null

  return (
    <div className="fixed inset-x-0 top-16 z-50 flex justify-center px-4 pointer-events-none">
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="files-list-operation-title"
        aria-describedby="files-list-operation-description"
        className="pointer-events-auto w-[min(420px,calc(100vw-32px))] rounded-xl border border-border/70 bg-popover p-4 text-popover-foreground shadow-xl"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }}
      >
        <div className="space-y-1">
          <h2 id="files-list-operation-title" className="text-sm font-semibold leading-5">
            {title}
          </h2>
          <p id="files-list-operation-description" className="line-clamp-2 break-all text-xs text-muted-foreground">
            {description}
          </p>
        </div>
        {input ? (
          <div className="mt-4 space-y-1.5">
            <label htmlFor="files-list-operation-input" className="text-[11px] font-medium text-muted-foreground">
              {input.label}
            </label>
            <Input
              id="files-list-operation-input"
              value={input.value}
              onChange={(event) => input.onValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  if (!confirmDisabled) onConfirm()
                }
              }}
              className="h-8 text-xs"
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
            type="button"
            className={cn(
              'h-8 rounded-md px-3 text-xs font-medium text-primary-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              destructive ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90',
            )}
            disabled={confirmDisabled}
            onClick={() => {
              if (!confirmDisabled) onConfirm()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
