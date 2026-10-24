import { useRef, useState } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useCardDialog, type CardDialogDraft, type CardDialogRequest } from '@/lib/card-dialog'

import { projectNewCardMessage } from '../../domain/card/card-dialog-model'

/**
 * R6 K2 "+ 卡片": an empty card. The title is focused; once it is named (Enter, leaving the field
 * or closing) the row is created and this popup carries on as the normal card of that row.
 */
export function NewCardDialog({ request, draft }: { request: CardDialogRequest; draft: CardDialogDraft }) {
  const openCard = useCardDialog((state) => state.open)
  const close = useCardDialog((state) => state.close)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef<Promise<boolean> | null>(null)

  /** Creates the row; resolves true when the popup moved on to the new card. */
  const commit = (): Promise<boolean> => {
    if (inFlight.current) return inFlight.current
    if (!title.trim()) return Promise.resolve(false)
    setBusy(true)
    const job = run().finally(() => { inFlight.current = null; setBusy(false) })
    inFlight.current = job
    return job
  }

  const run = async (): Promise<boolean> => {
    const result = await draft.create(title)
    if (result.kind === 'created') {
      openCard({ uri: result.uri, siblings: result.siblings ?? request.siblings, from: request.from })
      return true
    }
    setMessage(projectNewCardMessage(result.reason))
    return false
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open) return
        // Closing with a name typed still makes the card, so nothing typed is lost.
        if (title.trim()) void commit().then((moved) => { if (!moved) close() })
        else close()
      }}
    >
      <DialogContent
        data-card-dialog="true"
        data-card-draft="true"
        className="flex max-h-[820px] w-[min(960px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden rounded-xl p-0"
      >
        {/* The same frame as an opened card (K2): bar on top, the title where the heading sits. */}
        <header className="flex items-center gap-2 border-b border-border/40 py-2.5 pl-4 pr-12">
          <div className="min-w-0 flex-1">
            <DialogTitle className="sr-only">新卡片</DialogTitle>
            <DialogDescription className="truncate text-xs">新卡片 · 起个名字，回车后就能写正文、加属性</DialogDescription>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 sm:px-[72px]">
          <input
            autoFocus
            aria-label="卡片标题"
            placeholder="卡片标题"
            value={title}
            disabled={busy}
            data-card-title="true"
            className="mb-4 block w-full bg-transparent text-2xl font-semibold leading-tight outline-none placeholder:text-muted-foreground/50"
            onChange={(event) => { setTitle(event.target.value); setMessage(null) }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
              event.preventDefault()
              void commit()
            }}
            onBlur={() => { void commit() }}
          />
          {message ? <p role="alert" className="mb-3 text-xs text-destructive">{message}</p> : null}
          <p className="min-h-[200px] text-[15px] leading-[1.75] text-muted-foreground/60">起好名字后，在这里写正文</p>
          <section className="mt-6 border-t border-border/40 pt-2" aria-label="属性">
            <div className="pb-1 text-xs text-muted-foreground">属性</div>
            <p className="py-1 text-sm text-muted-foreground/60">起好名字后，这张表的属性会出现在这里</p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
