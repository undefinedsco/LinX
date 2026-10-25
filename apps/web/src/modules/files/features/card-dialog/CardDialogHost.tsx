import { ChevronLeft, ChevronRight, History, Link2, Maximize2, MoreHorizontal, Share2, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCardDialog, type CardDialogRequest } from '@/lib/card-dialog'
import { useWithdrawnCards } from '@/lib/use-withdrawn-cards'
import { BlockNoteFileEditor } from '@/modules/files/ui/BlockNoteFileEditor'

import {
  projectCardLocatorLabel,
  projectCardLineQuote,
  cardBodyLeadsWithTitle,
  projectCardSaveLabel,
  type CardColumnModel,
  type CardPropertyModel,
} from '../../domain/card/card-dialog-model'
import { StructuredPredicateValueEditor } from '../structured/StructuredTableCellPrimitives'
import { CARD_NEW_PROPERTY_TYPES } from './card-new-property-model'
import { ShareDialog } from '../sidecars/ShareDialog'
import { CardHistoryDialog } from './CardHistoryDialog'
import { AiDraftBanner, AiDraftReview } from './AiDraftViews'
import { CardSelectionToolbar, CardTextViewer, useCardTextSelection } from './CardSelectionViews'
import type { CardBacklink } from '../../domain/card/card-backlinks'
import { NewCardDialog } from './NewCardDialog'
import { useCardDialogController } from './useCardDialogController'
import { useCardLinkOpener } from './useCardLinkOpener'
import type { CardWorkUseRow } from './useCardBacklinks'

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

const PROPERTY_ROW_CLASS = 'grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3 py-1 text-sm'

/** A property that is only shown (a file's description, a link). */
function PropertyRow({ property }: { property: CardPropertyModel }) {
  return (
    <div className={PROPERTY_ROW_CLASS}>
      <span className="truncate py-1 text-muted-foreground">{property.label}</span>
      <span className="break-words px-1 py-1"><PropertyValue property={property} /></span>
    </div>
  )
}

/** A column of the table: edited here with the editor its table cells use. Links read as links. */
function ColumnRow({ column, onSave }: { column: CardColumnModel; onSave: (values: string[]) => void }) {
  const [editingLink, setEditingLink] = useState(false)
  const showLinks = column.editorKind === 'relation' && column.displayValues.length > 0 && !editingLink
  return (
    <div className={PROPERTY_ROW_CLASS} data-card-column={column.predicate}>
      <span className="truncate py-1 text-muted-foreground" title={column.label}>{column.label}</span>
      {showLinks ? (
        <div className="flex min-w-0 items-start gap-2">
          <span className="min-w-0 break-words px-1 py-1"><PropertyValue property={column} /></span>
          <button
            type="button"
            aria-label={`修改${column.label}`}
            className="shrink-0 py-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setEditingLink(true)}
          >
            修改
          </button>
        </div>
      ) : (
        <StructuredPredicateValueEditor
          kind={column.editorKind}
          ariaLabel={column.label}
          values={column.editorValues}
          options={column.options}
          placeholder="—"
          className="min-w-0 border-transparent bg-transparent text-sm hover:bg-muted/50 focus-within:bg-muted/70"
          onCommit={(values) => { setEditingLink(false); onSave(values) }}
        />
      )}
    </div>
  )
}

/** "+ 属性": name it, pick what it holds; it becomes a column of the table at once. */
function AddPropertyRow({ onAdd }: { onAdd: (label: string, type: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [type, setType] = useState('text')
  const [busy, setBusy] = useState(false)
  const reset = () => { setOpen(false); setLabel(''); setType('text') }
  const submit = async () => {
    if (!label.trim() || busy) return
    setBusy(true)
    try {
      if (await onAdd(label, type)) reset()
    } finally {
      setBusy(false)
    }
  }
  if (!open) {
    return (
      <div className={PROPERTY_ROW_CLASS}>
        <button type="button" className="py-1 text-left text-primary hover:underline" onClick={() => setOpen(true)}>+ 属性</button>
        <span />
      </div>
    )
  }
  return (
    <div className={PROPERTY_ROW_CLASS} data-card-add-property="true">
      <span className="py-1 text-muted-foreground">新属性</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <input
          autoFocus
          aria-label="属性名"
          placeholder="属性名"
          value={label}
          disabled={busy}
          className="h-8 min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 text-sm outline-none focus:border-primary/50"
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); reset() }
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void submit() }
          }}
        />
        <select
          aria-label="属性类型"
          value={type}
          disabled={busy}
          className="h-8 rounded-md border border-border/60 bg-background px-2 text-sm outline-none"
          onChange={(event) => setType(event.target.value)}
        >
          {CARD_NEW_PROPERTY_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <Button size="sm" disabled={busy || !label.trim()} onClick={() => { void submit() }}>添加</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={reset}>取消</Button>
      </div>
    </div>
  )
}

const REFERENCES_SHOWN = 5

/** K2 bottom: 被引用 (what points at this card) and 用过它的工作 (chats that cited it). */
function CardReferences({
  backlinks,
  workUses,
  onOpenBacklink,
  onOpenWork,
}: {
  backlinks: CardBacklink[]
  workUses: CardWorkUseRow[]
  onOpenBacklink: (link: CardBacklink) => void
  onOpenWork: (use: CardWorkUseRow) => void
}) {
  const [showAll, setShowAll] = useState(false)
  if (backlinks.length === 0 && workUses.length === 0) return null
  const shownLinks = showAll ? backlinks : backlinks.slice(0, REFERENCES_SHOWN)
  const shownWork = showAll ? workUses : workUses.slice(0, REFERENCES_SHOWN)
  const hidden = backlinks.length - shownLinks.length + workUses.length - shownWork.length
  const workTotal = workUses.reduce((sum, use) => sum + use.count, 0)
  const summary = [
    backlinks.length > 0 ? `被 ${backlinks.length} 处引用` : null,
    workUses.length > 0 ? `用过它的工作 ${workTotal} 次` : null,
  ].filter(Boolean).join(' · ')
  return (
    <div className="mt-6 border-t border-border/40 pt-3" data-card-references="true">
      <p className="text-[13px] text-muted-foreground" data-card-references-summary="true">
        {summary}
        {hidden > 0 ? (
          <button type="button" className="ml-1.5 text-primary hover:underline" onClick={() => setShowAll(true)}>看全部</button>
        ) : null}
      </p>
      <div className="mt-2 space-y-3">
        {backlinks.length > 0 ? (
          <section aria-label="被引用">
            <ul>
              {shownLinks.map((link) => (
                <li key={link.key}>
                  <button
                    type="button"
                    data-card-backlink="true"
                    className="flex w-full items-baseline gap-2 rounded px-1 py-1.5 text-left text-sm hover:bg-muted/50"
                    onClick={() => onOpenBacklink(link)}
                  >
                    <span className="min-w-0 truncate">{link.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{link.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {workUses.length > 0 ? (
          <section aria-label="用过它的工作">
            <ul>
              {shownWork.map((use) => (
                <li key={use.chatRef}>
                  <button
                    type="button"
                    data-card-work-use="true"
                    className="flex w-full items-baseline gap-2 rounded px-1 py-1.5 text-left text-sm hover:bg-muted/50"
                    onClick={() => onOpenWork(use)}
                  >
                    <span className="min-w-0 truncate">{use.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">问 LinX 引用过{use.count > 1 ? ` ${use.count} 次` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
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
  const openLink = useCardLinkOpener()
  // A cited line of a note is lit up by its words (`#line=3` -> what line 3 says).
  const highlightQuote = request.locator?.quote
    ?? projectCardLineQuote(card.subject ? card.subject.bodyText : card.documentText, request.locator?.line)
    ?? undefined
  useLocatorHighlight(bodyRef, card.documentPlainText ? undefined : highlightQuote, request.uri)
  // The body already opens with its own "# Title": show the title once.
  const titleInBody = !card.documentPlainText
    && cardBodyLeadsWithTitle(card.subject ? card.subject.bodyText : card.documentText, card.title)
  const locatorLabel = projectCardLocatorLabel(request.locator)
  const { siblings } = card
  // K2b 撤回: future work stops using this card; finished work and chats keep it.
  const withdrawnCards = useWithdrawnCards()
  const withdrawn = withdrawnCards.isWithdrawn(request.uri)
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false)

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
        <div ref={bodyRef} className="relative">
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
              onOpenLink={openLink}
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
              onOpenLink={openLink}
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
        {card.subject || properties.length > 0 ? (
          <section className="mt-6 border-t border-border/40 pt-2" aria-label="属性">
            <div className="pb-1 text-xs text-muted-foreground">属性</div>
            {card.subject
              ? card.columns.map((column) => (
                <ColumnRow key={column.predicate} column={column} onSave={(values) => { void card.saveSubjectColumn(column, values).catch(() => undefined) }} />
              ))
              : properties.map((property) => <PropertyRow key={property.predicate} property={property} />)}
            {card.subject && card.canAddColumn ? <AddPropertyRow onAdd={card.addColumn} /> : null}
          </section>
        ) : null}
        <CardReferences
          backlinks={card.backlinks}
          workUses={card.workUses}
          onOpenBacklink={card.openBacklink}
          onOpenWork={card.openWorkUse}
        />
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
              <DialogDescription className="truncate text-xs">{card.pathLabel}</DialogDescription>
            </div>
            {locatorLabel ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{locatorLabel}</span> : null}
            <span className="text-xs text-muted-foreground" data-card-save-status={card.saveStatus}>{projectCardSaveLabel(card.saveStatus)}</span>
            <Button size="icon" variant="ghost" aria-label="展开成整页" title="展开成整页" onClick={card.expand}><Maximize2 className="h-4 w-4" /></Button>
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
                {!withdrawn ? (
                  // Let the menu close before the confirm dialog takes focus.
                  <DropdownMenuItem onSelect={() => { setTimeout(() => setWithdrawConfirmOpen(true), 0) }}><Undo2 className="mr-2 h-3.5 w-3.5" />撤回…</DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          {withdrawn ? (
            <div role="status" data-card-withdrawn="true" className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
              <span className="flex-1">已撤回：以后的工作不再使用这张卡片。</span>
              <Button size="sm" variant="outline" disabled={withdrawnCards.pending} onClick={() => { void withdrawnCards.restore(request.uri) }}>恢复使用</Button>
            </div>
          ) : null}
          {card.saveStatus === 'conflict' ? (
            <div role="alert" data-card-conflict="true" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
              <span className="flex-1">这张卡片在另一台设备上也改了。比较后选择用哪一份，或者两处都保留成两个版本。</span>
              <Button size="sm" variant="outline" onClick={() => { void card.openHistory() }}>比较</Button>
              <Button size="sm" variant="ghost" onClick={card.retry}>刷新</Button>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 sm:px-[72px]">
            {!card.loading && !card.blocking && !titleInBody ? (
              <DialogTitle data-card-title="true" className="mb-4 break-words text-2xl font-semibold leading-tight">{card.title}</DialogTitle>
            ) : <DialogTitle data-card-title="true" className="sr-only">{card.title}</DialogTitle>}
            {renderBody()}
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={withdrawConfirmOpen}
        onOpenChange={setWithdrawConfirmOpen}
        title={`撤回“${card.title}”？`}
        description="以后的工作不再使用它。已完成的工作和原来的聊天不受影响。"
        confirmLabel="撤回"
        destructive
        busy={withdrawnCards.pending}
        onConfirm={() => {
          void withdrawnCards.withdraw(request.uri).then(() => setWithdrawConfirmOpen(false)).catch(() => undefined)
        }}
      />
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
  if (request.draft) return <NewCardDialog request={request} draft={request.draft} />
  return <CardDialog request={request} />
}
