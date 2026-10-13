import { useState, type ReactNode } from 'react'
import {
  BoxSelect, FilePlus2, Link2, MousePointer2, MoreHorizontal, Search, SquareDashed, StickyNote, Type,
} from 'lucide-react'

import { cn } from '@/lib/utils'

export type WhiteboardTool = 'select' | 'connect'

export interface WhiteboardFindItem {
  id: string
  title: string
}

function ToolButton({
  label, active, onClick, children,
}: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg text-foreground hover:bg-muted',
        active && 'bg-muted font-semibold',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** Vertical tool bar on the left edge of the board. */
export function WhiteboardToolbar({
  tool,
  libraryOpen,
  findItems,
  onTool,
  onAddCard,
  onToggleLibrary,
  onAddText,
  onAddSection,
  onFocusItem,
  onFit,
  onDeleteSelection,
}: {
  tool: WhiteboardTool
  libraryOpen: boolean
  findItems: readonly WhiteboardFindItem[]
  onTool: (tool: WhiteboardTool) => void
  onAddCard: () => void
  onToggleLibrary: (tab: 'cards' | 'files') => void
  onAddText: () => void
  onAddSection: () => void
  onFocusItem: (id: string) => void
  onFit: () => void
  onDeleteSelection: () => void
}) {
  const [popover, setPopover] = useState<'find' | 'more' | null>(null)
  const [query, setQuery] = useState('')
  const matches = findItems.filter((item) => item.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
  return (
    <div
      data-whiteboard-toolbar="true"
      className="absolute left-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-0.5 rounded-xl border border-border bg-card p-1.5 shadow-lg"
    >
      <ToolButton label="选择" active={tool === 'select'} onClick={() => onTool('select')}><MousePointer2 className="h-4 w-4" /></ToolButton>
      <ToolButton label="卡片" onClick={onAddCard}><StickyNote className="h-4 w-4" /></ToolButton>
      <ToolButton label="放文件" active={libraryOpen} onClick={() => onToggleLibrary('files')}><FilePlus2 className="h-4 w-4" /></ToolButton>
      <ToolButton label="连线" active={tool === 'connect'} onClick={() => onTool(tool === 'connect' ? 'select' : 'connect')}><Link2 className="h-4 w-4" /></ToolButton>
      <ToolButton label="文字" onClick={onAddText}><Type className="h-4 w-4" /></ToolButton>
      <ToolButton label="区块" onClick={onAddSection}><SquareDashed className="h-4 w-4" /></ToolButton>
      <ToolButton label="找" active={popover === 'find'} onClick={() => setPopover(popover === 'find' ? null : 'find')}><Search className="h-4 w-4" /></ToolButton>
      <ToolButton label="更多" active={popover === 'more'} onClick={() => setPopover(popover === 'more' ? null : 'more')}><MoreHorizontal className="h-4 w-4" /></ToolButton>
      {tool === 'connect' ? (
        <p className="absolute left-14 top-1/2 w-44 -translate-y-1/2 rounded-md bg-card px-2 py-1 text-xs text-muted-foreground shadow">
          从卡片边上的圆点拉到另一张卡片
        </p>
      ) : null}
      {popover === 'find' ? (
        <div className="absolute left-14 top-0 w-56 rounded-lg border border-border bg-card p-2 text-sm shadow-lg">
          <input
            autoFocus
            aria-label="在白板里找卡片"
            placeholder="找卡片"
            className="mb-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {matches.length === 0 ? <p className="px-2 py-1 text-xs text-muted-foreground">没有找到</p> : null}
          {matches.map((item) => (
            <button
              key={item.id}
              type="button"
              className="block w-full truncate rounded-md px-2 py-1 text-left text-xs hover:bg-muted"
              onClick={() => { onFocusItem(item.id); setPopover(null) }}
            >
              {item.title}
            </button>
          ))}
        </div>
      ) : null}
      {popover === 'more' ? (
        <div className="absolute bottom-0 left-14 w-44 rounded-lg border border-border bg-card p-1 text-sm shadow-lg">
          <button type="button" className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-muted" onClick={() => { onFit(); setPopover(null) }}>
            <BoxSelect className="h-4 w-4" />适应画面
          </button>
          <button type="button" className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-muted" onClick={() => { onToggleLibrary('cards'); setPopover(null) }}>
            <StickyNote className="h-4 w-4" />卡片库
          </button>
          <button type="button" className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-muted" onClick={() => { onDeleteSelection(); setPopover(null) }}>
            从白板移除所选
          </button>
        </div>
      ) : null}
    </div>
  )
}
