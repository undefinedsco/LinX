import { ChevronLeft, ChevronRight, Expand, History, Link2, MoreHorizontal, Share2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useRouterState } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCardDialog, type CardDialogRequest } from '@/lib/card-dialog'
import { BlockNoteFileEditor } from '@/modules/files/ui/BlockNoteFileEditor'

import {
  projectCardLocatorLabel,
  projectCardSaveLabel,
  type CardPropertyModel,
} from '../../domain/card/card-dialog-model'
import { ShareDialog } from '../sidecars/ShareDialog'
import { CardHistoryDialog } from './CardHistoryDialog'
import { AiDraftBanner, AiDraftReview } from './AiDraftViews'
import { CardSelectionToolbar, CardTextViewer, useCardTextSelection } from './CardSelectionViews'
import { useCardDialogController } from './useCardDialogController'

const AUTOSAVE_MS = 800

function PropertyValue({ property }: { property: CardPropertyModel }) {
  if (property.displayValues.length === 0) return <>—</>
  return (
    <>
      {property.displayValues.map((value, index) => {
        const href = property.links[index]
        return (
          <span key={`${value}-${index}`}>
            {index > 0 ? '、' : null}
            {href && /^https?:\/\//.test(href)
              ? <a href={href} target="_blank" rel="noreferrer" title={href} className="text-primary underline-offset-2 hover:underline">{value}</a>
              : value}
          </span>
        )
      })}
    </>
  )
}

function PropertyRow({ property, onSave }: { property: CardPropertyModel; onSave?: (text: string) => void }) {
  const text = property.displayValues.join('、')
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-3 py-1.5 text-sm">
      <span className="truncate text-muted-foreground">{property.label}</span>
      {onSave && !property.isResource ? (
        <input
          defaultValue={text}
          aria-label={property.label}
          className="rounded px-1 py-0.5 outline-none hover:bg-muted/50 focus:bg-muted/70"
          onBlur={(event) => { if (event.currentTarget.value !== text) onSave(event.currentTarget.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
        />
      ) : (
        <span className="break-words px-1"><PropertyValue property={property} /></span>
      )}
    </div>
  )
}

/** Highlights the cited quote in the body once the editor has rendered it. */
function useLocatorHighlight(container: React.RefObject<HTMLElement | null>, quote: string | undefined, key: string) {
  useEffect(() => {
    const registry = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights
    const HighlightCtor = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
    if (!quote || !registry || !HighlightCtor) return
    // The editor renders asynchronously: look again for a few seconds until the quote is there.
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const find = () => {
      // The body mounts after the card loads, so read the ref on every attempt.
      const root = container.current
      const walker = root ? document.createTreeWalker(root, NodeFilter.SHOW_TEXT) : null
      for (let node = walker?.nextNode(); walker && node; node = walker.nextNode()) {
        const index = node.textContent?.indexOf(quote) ?? -1
        if (index < 0) continue
        const range = document.createRange()
        range.setStart(node, index)
        range.setEnd(node, index + quote.length)
        registry.set('card-locator', new HighlightCtor(range))
        node.parentElement?.scrollIntoView?.({ block: 'center' })
        return
      }
      attempts += 1
      if (attempts < 20) timer = setTimeout(find, 300)
    }
    timer = setTimeout(find, 300)
    return () => { clearTimeout(timer); registry.delete('card-locator') }
  }, [container, quote, key])
}

function CardDialog({ request }: { request: CardDialogRequest }) {
  const card = useCardDialogController(request)
  const bodyRef = useRef<HTMLDivElement>(null)
  const { selection } = useCardTextSelection(bodyRef)
  useLocatorHighlight(bodyRef, request.locator?.quote, request.uri)
  const locatorLabel = projectCardLocatorLabel(request.locator)
  const { siblings } = card

  const renderBody = () => {
    if (card.loading) return <p className="py-10 text-center text-sm text-muted-foreground">正在打开…</p>
    if (card.blocking) {
      return (
        <div className="py-10 text-center">
          <p className="text-sm font-medium">{card.blocking.title}</p>
          {card.blocking.description ? <p className="mt-1 text-xs text-muted-foreground">{card.blocking.description}</p> : null}
          {card.blocking.action === 'retry' ? <Button className="mt-3" size="sm" variant="outline" onClick={card.retry}>重试</Button> : null}
          {card.blocking.action === 'back-to-folder' ? <Button className="mt-3" size="sm" variant="outline" onClick={card.close}>回到文件夹</Button> : null}
        </div>
      )
    }
    const media = card.mediaSource && card.mediaKind ? (
      <div className="mb-4 overflow-hidden rounded-lg bg-muted/30">
        {card.mediaKind === 'image' ? <img src={card.mediaSource} alt={card.title} className="mx-auto max-h-[360px]" /> : null}
        {card.mediaKind === 'audio' ? <audio controls src={card.mediaSource} className="w-full" /> : null}
        {card.mediaKind === 'video' ? <video controls src={card.mediaSource} className="max-h-[360px] w-full" /> : null}
        {card.mediaKind === 'pdf' ? <iframe title={card.title} src={card.mediaSource} className="h-[420px] w-full" /> : null}
      </div>
    ) : null
    const properties = card.subject?.properties ?? card.fileProperties?.properties ?? []
    return (
      <>
        {media}
        {card.kind === 'document' ? <AiDraftBanner draft={card.aiDraft} currentContent={card.documentText} /> : null}
        {card.subject?.photoUri ? (
          <img src={card.subject.photoUri} alt={card.title} data-card-photo="true" className="mb-4 h-20 w-20 rounded-full object-cover" />
        ) : null}
        <div ref={bodyRef}>
          <CardSelectionToolbar
            selection={selection}
            onAsk={(quote) => { void card.askLinx(quote) }}
            onMakeCard={(quote) => { void card.makeCardFromQuote(quote) }}
            onCopyLink={() => { void card.copyQuoteLink() }}
          />
          {card.subject && (card.kind !== 'table' || card.subject.bodyText) ? (
            <BlockNoteFileEditor
              key={request.uri}
              content={{ inputFormat: 'markdownish', saveFormat: 'markdown', text: card.subject.bodyText }}
              editable
              hideStatusBar
              autoSaveDelayMs={AUTOSAVE_MS}
              onSaveText={card.saveSubjectBody}
              onSaveStatusChange={(status) => card.setSaveStatus(status === 'dirty' ? 'idle' : status)}
              className="min-h-[200px] border-0 px-0 py-0 shadow-none"
            />
          ) : card.subject ? null : card.kind === 'document' && card.aiDraft?.state === 'draft' ? (
            <AiDraftReview key={card.aiDraft.updatedAt} draft={card.aiDraft} onEdit={card.keepAiDraftAndEdit} />
          ) : card.documentPlainText ? (
            <CardTextViewer text={card.documentText} locator={request.locator} />
          ) : card.kind === 'document' ? (
            <BlockNoteFileEditor
              key={request.uri}
              content={{ inputFormat: card.documentMimeType === 'text/html' ? 'html' : 'markdownish', saveFormat: 'markdown', text: card.documentText }}
              editable={card.documentEditable}
              hideStatusBar
              autoSaveDelayMs={AUTOSAVE_MS}
              onSaveText={card.documentEditable ? card.saveDocumentText : undefined}
              onSaveStatusChange={(status) => card.setSaveStatus(status === 'dirty' ? 'idle' : status)}
              className="min-h-[320px] border-0 px-0 py-0 shadow-none"
            />
          ) : card.subjectList ? (
            <section aria-label="内容" className="divide-y divide-border/30">
              {card.subjectList.map((row) => (
                <button
                  key={row.subjectIri}
                  type="button"
                  disabled={!row.openable}
                  data-card-subject-row="true"
                  className="block w-full px-1 py-2.5 text-left hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
                  onClick={() => card.openSubject(row.subjectIri)}
                >
                  <span className="block truncate text-sm font-medium">{row.title}</span>
                  {row.summary.length > 0 ? (
                    <span className="block truncate text-xs text-muted-foreground">{row.summary.join('　')}</span>
                  ) : null}
                </button>
              ))}
              <p className="pt-3 text-xs text-muted-foreground">想看完整的表，点右上角「展开」。</p>
            </section>
          ) : null}
        </div>
        {properties.length > 0 ? (
          <section className="mt-6 border-t border-border/40 pt-3" aria-label="属性">
            {properties.map((property) => (
              <PropertyRow
                key={property.predicate}
                property={property}
                onSave={card.subject ? (text) => { void card.saveSubjectProperty(property, text) } : undefined}
              />
            ))}
          </section>
        ) : null}
      </>
    )
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) card.close() }}>
        <DialogContent
          data-card-dialog="true"
          className="flex max-h-[820px] w-[min(960px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden rounded-xl p-0"
        >
          <header className="flex items-center gap-2 border-b border-border/40 py-2.5 pl-4 pr-12">
            <Button size="icon" variant="ghost" aria-label="上一张" disabled={!siblings.previousUri} onClick={() => card.goTo(siblings.previousUri)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="下一张" disabled={!siblings.nextUri} onClick={() => card.goTo(siblings.nextUri)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {siblings.positionLabel ? <span className="text-xs text-muted-foreground">{siblings.positionLabel}</span> : null}
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-sm font-medium">{card.title}</DialogTitle>
              <DialogDescription className="truncate text-xs">{card.pathLabel}</DialogDescription>
            </div>
            {locatorLabel ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{locatorLabel}</span> : null}
            <span className="text-xs text-muted-foreground" data-card-save-status={card.saveStatus}>{projectCardSaveLabel(card.saveStatus)}</span>
            <Button size="sm" variant="ghost" onClick={card.expand}><Expand className="mr-1 h-3.5 w-3.5" />展开</Button>
            {card.detail ? (
              <Button size="sm" variant="ghost" onClick={() => card.setAccessOpen(true)}><Share2 className="mr-1 h-3.5 w-3.5" />共享…</Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="更多"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => { void card.copyLink() }}><Link2 className="mr-2 h-3.5 w-3.5" />复制链接</DropdownMenuItem>
                {card.historySupported ? (
                  <DropdownMenuItem onSelect={() => { void card.openHistory() }}><History className="mr-2 h-3.5 w-3.5" />版本…</DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          {card.saveStatus === 'conflict' ? (
            <div role="alert" data-card-conflict="true" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
              <span className="flex-1">这张卡片在另一台设备上也改了。比较后选择用哪一份，或者两处都保留成两个版本。</span>
              <Button size="sm" variant="outline" onClick={() => { void card.openHistory() }}>比较</Button>
              <Button size="sm" variant="ghost" onClick={card.retry}>刷新</Button>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-5">{renderBody()}</div>
        </DialogContent>
      </Dialog>
      <CardHistoryDialog
        open={card.historyOpen}
        onOpenChange={card.setHistoryOpen}
        rows={card.versionRows}
        error={card.historyError}
        current={card.currentSnapshot}
        canRestore={card.canRestore}
        onRestore={card.restoreVersion}
      />
      {card.detail ? (
        <ShareDialog file={card.detail} open={card.accessOpen} onOpenChange={card.setAccessOpen} />
      ) : null}
    </>
  )
}

/** Renders the card popup requested through `useCardDialog` (R6 K2/K8). */
export function CardDialogHost() {
  const request = useCardDialog((state) => state.request)
  const close = useCardDialog((state) => state.close)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  // The popup belongs to the page it was opened from: leaving the page closes it.
  const openedAt = useRef(pathname)
  useEffect(() => {
    if (!request) {
      openedAt.current = pathname
      return
    }
    if (openedAt.current !== pathname) close()
  }, [close, pathname, request])
  if (!request) return null
  return <CardDialog request={request} />
}
