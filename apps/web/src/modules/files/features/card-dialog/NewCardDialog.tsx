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
        <header className="border-b border-border/40 py-2.5 pl-4 pr-12">
          <DialogTitle className="text-sm font-medium">新卡片</DialogTitle>
          <DialogDescription className="text-xs">起个名字，回车后就能写正文、加属性</DialogDescription>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-5">
          <input
            autoFocus
            aria-label="卡片标题"
            placeholder="卡片标题"
            value={title}
            disabled={busy}
            className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/50"
            onChange={(event) => { setTitle(event.target.value); setMessage(null) }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
              event.preventDefault()
              void commit()
            }}
            onBlur={() => { void commit() }}
          />
          {message ? <p role="alert" className="mt-2 text-xs text-destructive">{message}</p> : null}
          <p className="mt-6 text-sm text-muted-foreground/70">正文和属性在起好名字之后填写。</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
