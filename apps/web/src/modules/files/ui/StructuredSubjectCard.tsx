import { type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'

import { cn } from '@/lib/utils'

export type StructuredSubjectCardModel = {
  subject: string
  title: string
  summary: string
  classLabel?: string | null
  facts: Array<{ id: string; label: string }>
  pending: boolean
  errorLabel?: string
  thumbnailUrl?: string
}

export function StructuredSubjectCardContent({
  model,
  pendingLabel = '提交中',
}: {
  model: StructuredSubjectCardModel
  pendingLabel?: string
}) {
  return (
    <>
      <div className="flex min-w-0 items-start gap-2">
        {model.thumbnailUrl ? (
          <img
            src={model.thumbnailUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded border border-border/40 object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 truncate font-medium text-foreground/90">{model.title}</p>
            {model.pending ? (
              <span className="shrink-0 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">{pendingLabel}</span>
            ) : null}
          </div>
          {model.summary ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{model.summary}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex min-h-5 flex-wrap gap-1">
        {model.classLabel ? (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{model.classLabel}</span>
        ) : null}
        {model.facts.slice(0, 2).map((fact) => (
          <span key={fact.id} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{fact.label}</span>
        ))}
        {model.errorLabel ? (
          <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">{model.errorLabel}</span>
        ) : null}
      </div>
    </>
  )
}

export function StructuredSubjectCard({
  model,
  selected,
  action,
  dragging = false,
  onSelect,
  onOpen,
}: {
  model: StructuredSubjectCardModel
  selected: boolean
  action?: ReactNode
  dragging?: boolean
  onSelect: (subject: string, options: { extend: boolean }) => void
  onOpen: (subject: string, options: { navigate: boolean }) => void
}) {
  const selectSubject = (extend = false) => onSelect(model.subject, { extend })
  const openSubject = (navigate = false) => onOpen(model.subject, { navigate })
  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-structured-card-action="true"]')) return
    selectSubject(event.shiftKey || event.metaKey || event.ctrlKey)
  }
  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      openSubject(false)
      return
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      selectSubject(event.shiftKey || event.metaKey || event.ctrlKey)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={model.title}
      className={cn(
        'group relative min-h-28 rounded-md border border-border/50 bg-background px-3 py-2 text-left text-xs shadow-sm outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        selected && 'border-primary/70 bg-primary/5',
        dragging && 'opacity-60',
      )}
      data-card-density="compact"
      data-structured-subject={model.subject}
      data-testid="structured-subject-card"
      onClick={handleCardClick}
      onDoubleClick={(event) => {
        event.preventDefault()
        openSubject(true)
      }}
      onKeyDown={handleCardKeyDown}
    >
      <div className="pr-7">
        <StructuredSubjectCardContent model={model} />
      </div>
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        {action}
        <button
          type="button"
          aria-label={`打开 ${model.title}`}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          data-structured-card-action="true"
          onClick={(event) => {
            event.stopPropagation()
            openSubject(false)
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
