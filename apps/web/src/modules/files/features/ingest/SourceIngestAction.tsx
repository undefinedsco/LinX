import type { FormEvent, KeyboardEvent } from 'react'
import { FilePlus2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSourceIngestToolbarController } from './useSourceIngestToolbarController'

export function SourceIngestToolbarAction() {
  const ingest = useSourceIngestToolbarController()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ingest.canIngest) return
    void ingest.submitIngest()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter') return
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    event.preventDefault()
    if (!ingest.canIngest) return
    void ingest.submitIngest()
  }

  return (
    <>
      {ingest.feedback.success ? (
        <p
          aria-live="polite"
          className="hidden max-w-[160px] truncate rounded-sm bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground ring-1 ring-border/35 lg:block"
          title={ingest.feedback.success.targetUri}
        >
          {ingest.feedback.success.message}
        </p>
      ) : null}
      {ingest.feedback.closedError ? (
        <p
          className="hidden max-w-[180px] truncate rounded-sm bg-background px-1.5 py-0.5 text-[11px] text-destructive ring-1 ring-border/35 lg:block"
          role="status"
          title={ingest.feedback.closedError}
        >
          {ingest.feedback.closedError}
        </p>
      ) : null}
      <Popover open={ingest.open} onOpenChange={ingest.setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={ingest.chrome.triggerLabel}
            title={ingest.chrome.triggerLabel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[400px] rounded-lg p-3 shadow-lg">
          <form className="grid gap-2" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
            <div className="flex items-center gap-2">
              <select
                aria-label={ingest.chrome.sourceKindLabel}
                className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs text-foreground outline-none"
                value={ingest.sourceKind}
                onChange={(event) => ingest.setSourceKind(event.target.value)}
              >
                {ingest.sourceKindOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <input
                aria-label={ingest.chrome.sourceUriLabel}
                className="h-8 min-w-0 flex-1 rounded-md border border-border/50 bg-background px-2 text-xs outline-none focus:border-primary/50"
                placeholder={ingest.chrome.sourceUriPlaceholder}
                value={ingest.sourceUri}
                onChange={(event) => ingest.setSourceUri(event.target.value)}
              />
            </div>
            <input
              aria-label={ingest.chrome.titleLabel}
              className="h-8 min-w-0 rounded-md border border-border/50 bg-background px-2 text-xs outline-none focus:border-primary/50"
              placeholder={ingest.chrome.titlePlaceholder}
              value={ingest.title}
              onChange={(event) => ingest.setTitle(event.target.value)}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[11px] text-muted-foreground">
                {ingest.chrome.containerLabel}
              </p>
              <button
                type="submit"
                className="h-8 shrink-0 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-40"
                disabled={!ingest.canIngest}
              >
                {ingest.chrome.submitLabel}
              </button>
            </div>
            {ingest.feedback.formError ? (
              <p className="truncate text-[11px] text-destructive" role="status" title={ingest.feedback.formError}>{ingest.feedback.formError}</p>
            ) : null}
          </form>
        </PopoverContent>
      </Popover>
    </>
  )
}
