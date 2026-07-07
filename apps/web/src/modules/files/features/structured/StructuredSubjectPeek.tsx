import type { ReactNode } from 'react'
import { ExternalLink, Info, X } from 'lucide-react'
import {
  type StructuredSubjectPeek,
} from '../../domain/structured/structured-subject-peek'
import { projectStructuredSubjectPeekDrawerChrome } from './structured-subject-peek-drawer-model'
import { useStructuredSubjectPeekBodyController } from './useStructuredSubjectPeekBodyController'

export type { StructuredSubjectPeek } from '../../domain/structured/structured-subject-peek'

function StructuredSubjectPeekBody({
  peek,
}: {
  peek: NonNullable<StructuredSubjectPeek>
}) {
  const peekBody = useStructuredSubjectPeekBodyController(peek)

  return (
    <div className="space-y-3 text-xs">
      <div aria-label={peekBody.chrome.summary.ariaLabel} className="space-y-1.5 px-1 py-0.5">
        <p className="break-words text-sm font-medium text-foreground/85">{peek.title}</p>
        {peekBody.typeLabel ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{peekBody.chrome.summary.typePrefix} · {peekBody.typeLabel}</p>
        ) : null}
        {peek.summary ? (
          <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{peek.summary}</p>
        ) : null}
      </div>
      {peekBody.showSourceLinkedCardSection ? (
        <div aria-label={peekBody.chrome.sourceLinkedSection.ariaLabel} className="space-y-1.5 px-1 py-1">
          <p className="text-[11px] font-medium text-foreground/80">{peekBody.chrome.sourceLinkedSection.heading}</p>
          <div className="space-y-1">
            {peekBody.sourceRows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2 text-[11px]">
                <span className="truncate text-muted-foreground">{label}</span>
                <span className="truncate text-foreground/80" title={value}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {peekBody.showPredicateSection ? (
        <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
          <p className="text-[11px] font-medium text-foreground/80">{peekBody.chrome.predicateSection.heading}</p>
          <div className="mt-2 space-y-1">
            {peekBody.predicateRows.map((fact) => (
              <div key={fact.key} className="grid grid-cols-[90px_minmax(0,1fr)] gap-2 text-[11px]">
                <span className="truncate text-muted-foreground" title={fact.predicate}>{fact.label}</span>
                <span className="truncate text-foreground/80" title={fact.title}>{fact.values}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {peekBody.showBacklinkSection ? (
        <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
          <p className="text-[11px] font-medium text-foreground/80">{peekBody.chrome.backlinkSection.heading}</p>
          <div className="mt-2 space-y-1">
            {peekBody.backlinkRows.map((backlink) => (
              <div key={backlink.key} className="grid grid-cols-[90px_minmax(0,1fr)] gap-2 text-[11px]">
                <span className="truncate text-muted-foreground" title={backlink.predicate}>{backlink.label}</span>
                <span className="truncate text-foreground/80" title={backlink.subject}>{backlink.subject}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {peekBody.showTermDefinitionSection ? (
        <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
          <p className="text-[11px] font-medium text-foreground/80">{peekBody.chrome.termDefinitionSection.heading}</p>
          <div className="mt-2 space-y-1">
            {peekBody.termFactRows.map((fact) => (
              <div key={fact.key} className="grid grid-cols-[90px_minmax(0,1fr)] gap-2 text-[11px]">
                <span className="truncate text-muted-foreground" title={fact.predicate}>{fact.predicate}</span>
                <span className="truncate text-foreground/80" title={fact.title}>{fact.values}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {peekBody.showSourceSection ? (
        <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
          <p className="text-[11px] font-medium text-foreground/80">{peekBody.chrome.sourceSection.heading}</p>
          <p className="mt-1 break-all text-foreground/80">{peekBody.sourceValue}</p>
        </div>
      ) : null}
      <div className="rounded-md border border-border/30 bg-background/60 px-3 py-2">
        <button
          type="button"
          aria-label={peekBody.chrome.technicalDetails.ariaLabel}
          aria-expanded={peekBody.technicalDetailsToggle.expanded}
          className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-medium text-foreground/70 hover:text-foreground"
          onClick={peekBody.toggleTechnicalDetails}
        >
          <span>{peekBody.chrome.technicalDetails.label}</span>
          <span className="text-muted-foreground">{peekBody.technicalDetailsToggle.stateLabel}</span>
        </button>
        {peekBody.technicalDetailsOpen ? (
          <div className="mt-2 space-y-1">
            <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-2 text-[11px]">
              <span className="truncate text-muted-foreground">{peekBody.chrome.technicalDetails.subjectUriLabel}</span>
              <span className="break-all text-foreground/70">{peek.subject}</span>
            </div>
            <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-2 text-[11px]">
              <span className="truncate text-muted-foreground">{peekBody.locationLabel}</span>
              <span className="break-all text-foreground/70">{peek.targetUri}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function StructuredSubjectPeekDrawer({
  peek,
  onClose,
  children,
}: {
  peek: StructuredSubjectPeek
  onClose: () => void
  children: ReactNode
}) {
  if (!peek) return null

  const drawerChrome = projectStructuredSubjectPeekDrawerChrome(peek)
  return (
    <aside
      aria-label={drawerChrome.drawerAriaLabel}
      data-structured-subject-peek="true"
      className="absolute right-3 top-3 z-30 flex max-h-[calc(100%-24px)] w-[min(360px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-border/50 bg-background shadow-lg"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2">
        {drawerChrome.iconKind === 'external-link' ? <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /> : <Info className="h-3.5 w-3.5 text-muted-foreground" />}
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{drawerChrome.title}</p>
        <button
          type="button"
          aria-label={drawerChrome.closeAriaLabel}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto p-3">
        <StructuredSubjectPeekBody peek={peek} />
        <div className="mt-3 flex items-center justify-end gap-2">
          {children}
        </div>
      </div>
    </aside>
  )
}
