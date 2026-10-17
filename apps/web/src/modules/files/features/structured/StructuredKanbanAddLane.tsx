import { Plus } from 'lucide-react'
import { useState } from 'react'

/** K6d 加一列: a name, Enter to add; the lane starts empty and cards can be dragged into it. */
export function StructuredKanbanAddLane({ takenIds, onAdd }: { takenIds: readonly string[]; onAdd: (name: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const commit = () => {
    const name = draft.trim()
    if (name && !takenIds.includes(name)) onAdd(name)
    setDraft('')
    setAdding(false)
  }
  return (
    <div className="w-56 shrink-0">
      {adding ? (
        <input
          autoFocus
          aria-label="新列的名字"
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          placeholder="列的名字，回车添加"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); commit() }
            if (event.key === 'Escape') { setDraft(''); setAdding(false) }
          }}
          onBlur={() => { if (!draft.trim()) setAdding(false) }}
        />
      ) : (
        <button
          type="button"
          aria-label="添加一列"
          className="flex h-9 w-full items-center gap-1.5 rounded-md border border-dashed border-border/60 px-2 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          列
        </button>
      )}
    </div>
  )
}
