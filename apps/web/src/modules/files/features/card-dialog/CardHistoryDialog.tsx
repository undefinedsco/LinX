import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

import { diffCardLines, type CardSnapshot, type CardVersionRow } from '../../domain/history/card-history'

/** K2b 版本: when each version was saved and by whom; view it against the current text, or restore it. */
export function CardHistoryDialog({
  open,
  onOpenChange,
  rows,
  error,
  current,
  canRestore,
  onRestore,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: CardVersionRow[] | null
  error: boolean
  current: CardSnapshot | null
  canRestore: (snapshot: CardSnapshot) => boolean
  onRestore: (snapshot: CardSnapshot) => Promise<void>
}) {
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const viewing = rows?.find((row) => row.id === viewingId) ?? null
  const diff = useMemo(
    () => (viewing && current ? diffCardLines(viewing.snapshot.body, current.body) : []),
    [current, viewing],
  )

  const restore = async (row: CardVersionRow) => {
    setRestoring(true)
    try {
      await onRestore(row.snapshot)
      setConfirmId(null)
      setViewingId(null)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) { setViewingId(null); setConfirmId(null) } }}>
      <DialogContent data-card-history="true" className="flex max-h-[640px] w-[min(560px,calc(100vw-32px))] flex-col gap-3">
        <DialogTitle>版本</DialogTitle>
        <DialogDescription className="text-xs">每次保存都会留下一个版本，最近 20 个。</DialogDescription>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? <p className="py-6 text-center text-sm text-muted-foreground">没读到版本记录，稍后再试。</p> : null}
          {!error && rows === null ? <p className="py-6 text-center text-sm text-muted-foreground">正在读取…</p> : null}
          {!error && rows && rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">还没有历史版本，改动保存后会出现在这里。</p> : null}
          {viewing ? (
            <section aria-label={`${viewing.label} 和现在的区别`} className="mb-3 rounded-md border border-border/50 p-2 text-xs">
              <p className="mb-1 text-muted-foreground">{viewing.label} 和现在的区别（红色是现在没有的，绿色是现在新增的）</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">
                {diff.map((line, index) => (
                  <span
                    key={index}
                    data-diff={line.kind}
                    className={line.kind === 'removed' ? 'block bg-red-100 text-red-900' : line.kind === 'added' ? 'block bg-green-100 text-green-900' : 'block'}
                  >
                    {line.text || ' '}
                  </span>
                ))}
              </pre>
              <Button size="sm" variant="ghost" className="mt-1" onClick={() => setViewingId(null)}>收起</Button>
            </section>
          ) : null}
          <ul className="divide-y divide-border/40">
            {(rows ?? []).map((row) => (
              <li key={row.id} data-version-row={row.label} className="flex items-center gap-2 py-2 text-sm">
                <span className="w-8 font-medium">{row.label}</span>
                <span className="flex-1 text-xs text-muted-foreground">
                  {row.whenLabel} · {row.authorLabel}{row.isCurrent ? ' · 当前' : ''}
                </span>
                {confirmId === row.id ? (
                  <>
                    <span className="text-xs">恢复后会保存为新版本</span>
                    <Button size="sm" variant="ghost" disabled={restoring} onClick={() => setConfirmId(null)}>再想想</Button>
                    <Button size="sm" disabled={restoring} onClick={() => { void restore(row) }}>恢复</Button>
                  </>
                ) : (
                  <>
                    {!row.isCurrent ? <Button size="sm" variant="ghost" onClick={() => setViewingId(row.id)}>查看</Button> : null}
                    {!row.isCurrent && canRestore(row.snapshot) ? (
                      <Button size="sm" variant="outline" onClick={() => setConfirmId(row.id)}>恢复到这个版本</Button>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}
