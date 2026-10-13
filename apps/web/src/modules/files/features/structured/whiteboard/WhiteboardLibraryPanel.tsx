import { useMemo, useState } from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface WhiteboardLibraryItem {
  uri: string
  title: string
  subtitle?: string
}

export const WHITEBOARD_LIBRARY_DRAG_TYPE = 'application/x-linx-whiteboard-card'

/** Cards and files that can be dragged onto the board. */
export function WhiteboardLibraryPanel({
  tab,
  cards,
  files,
  onTab,
  onAdd,
  onClose,
}: {
  tab: 'cards' | 'files'
  cards: readonly WhiteboardLibraryItem[]
  files: readonly WhiteboardLibraryItem[]
  onTab: (tab: 'cards' | 'files') => void
  onAdd: (item: WhiteboardLibraryItem) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const source = tab === 'cards' ? cards : files
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = needle
      ? source.filter((item) => `${item.title} ${item.subtitle ?? ''}`.toLowerCase().includes(needle))
      : source
    return list.slice(0, 100)
  }, [query, source])
  return (
    <aside
      data-whiteboard-library="true"
      aria-label="卡片库"
      className="absolute bottom-0 right-0 top-0 z-10 flex w-72 flex-col border-l border-border bg-card shadow-lg"
    >
      <div className="flex items-center justify-between px-3 pt-3">
        <h2 className="text-sm font-semibold">卡片库</h2>
        <button type="button" aria-label="关闭卡片库" className="rounded p-1 hover:bg-muted" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-1 px-3 pt-2">
        {(['cards', 'files'] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            className={cn('rounded-md px-2 py-1 text-xs', tab === id ? 'bg-muted font-semibold' : 'text-muted-foreground hover:bg-muted/60')}
            onClick={() => onTab(id)}
          >
            {id === 'cards' ? '卡片' : '文件'}
          </button>
        ))}
      </div>
      <input
        aria-label="搜卡片、文件"
        placeholder="搜卡片、文件、表格里的行"
        className="mx-3 mt-2 h-8 rounded-md border border-border bg-background px-2 text-xs outline-none"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p className="px-3 pt-2 text-[11px] text-muted-foreground">拖到白板上，或点一下放进来。同一张卡片可以在多块白板上。</p>
      <ul className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {shown.length === 0 ? <li className="px-2 py-3 text-xs text-muted-foreground">没有可以放的内容</li> : null}
        {shown.map((item) => (
          <li key={item.uri}>
            <button
              type="button"
              draggable
              data-whiteboard-library-item={item.uri}
              className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
              onDragStart={(event) => {
                event.dataTransfer.setData(WHITEBOARD_LIBRARY_DRAG_TYPE, JSON.stringify(item))
                event.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => onAdd(item)}
            >
              <span className="block truncate text-xs font-medium">{item.title}</span>
              {item.subtitle ? <span className="block truncate text-[11px] text-muted-foreground">{item.subtitle}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
