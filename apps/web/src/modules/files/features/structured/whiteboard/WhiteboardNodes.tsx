import { createContext, lazy, Suspense, useContext, useState } from 'react'
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'

import { cn } from '@/lib/utils'
import { WHITEBOARD_SECTION_COLORS } from '../../../domain/structured/structured-whiteboard-canvas'
import type { WhiteboardCardData, WhiteboardSectionData } from './whiteboard-flow'

const WhiteboardBodyEditor = lazy(() => import('./WhiteboardBodyEditor'))

export interface WhiteboardNodeActions {
  editingId: string | null
  connecting: boolean
  startEdit: (id: string) => void
  stopEdit: () => void
  commitBody: (id: string, markdown: string) => void
  openCard: (id: string) => void
  renameSection: (id: string, label: string) => void
  recolorSection: (id: string, color: string) => void
  canEdit: (id: string) => boolean
}

const noop = () => {}
export const WhiteboardNodeContext = createContext<WhiteboardNodeActions>({
  editingId: null,
  connecting: false,
  startEdit: noop,
  stopEdit: noop,
  commitBody: noop,
  openCard: noop,
  renameSection: noop,
  recolorSection: noop,
  canEdit: () => false,
})

const SIDE_POSITIONS = [
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
] as const

export function WhiteboardCardNode({ id, data, selected }: NodeProps & { data: WhiteboardCardData }) {
  const actions = useContext(WhiteboardNodeContext)
  const { content } = data
  const editing = actions.editingId === id
  const deleted = content.state === 'deleted'
  return (
    <div
      data-whiteboard-card={id}
      data-state={content.state}
      className={cn(
        'group/card flex h-full w-full flex-col overflow-hidden rounded-lg border bg-card px-3 py-2 text-xs shadow-sm',
        selected ? 'border-primary ring-1 ring-primary/40' : 'border-border',
        deleted && 'border-dashed bg-muted/40 text-muted-foreground',
      )}
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (!deleted && actions.canEdit(id)) actions.startEdit(id)
      }}
    >
      <NodeResizer isVisible={selected && !editing} minWidth={120} minHeight={64} />
      {SIDE_POSITIONS.map(([side, position]) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={position}
          className={cn(
            '!h-2.5 !w-2.5 !border-primary !bg-card transition-opacity',
            selected || actions.connecting ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100',
          )}
        />
      ))}
      {deleted ? (
        <div className="m-auto text-center">
          <p className="font-medium">这张卡片已删除</p>
          <p className="mt-0.5 text-[11px]">只留下位置，可以移除</p>
        </div>
      ) : editing ? (
        <Suspense fallback={<p className="text-muted-foreground">加载中…</p>}>
          <WhiteboardBodyEditor
            markdown={content.body}
            onCommit={(markdown) => actions.commitBody(id, markdown)}
            onCancel={actions.stopEdit}
          />
        </Suspense>
      ) : (
        <>
          {content.title ? <h3 className="mb-1 truncate text-[13px] font-semibold">{content.title}</h3> : null}
          {content.className ? <p className="mb-1 truncate text-[11px] text-muted-foreground">{content.className}</p> : null}
          <p className="min-h-0 flex-1 overflow-hidden whitespace-pre-wrap break-words leading-relaxed">{content.body}</p>
        </>
      )}
    </div>
  )
}

export function WhiteboardSectionNode({ id, data, selected }: NodeProps & { data: WhiteboardSectionData }) {
  const actions = useContext(WhiteboardNodeContext)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(data.label)
  const commit = () => {
    setRenaming(false)
    if (draft !== data.label) actions.renameSection(id, draft)
  }
  return (
    <div
      data-whiteboard-section={id}
      className="h-full w-full rounded-xl"
      style={{ backgroundColor: `${data.color}59` }}
    >
      <NodeResizer isVisible={selected} minWidth={160} minHeight={120} />
      <div
        className="absolute -top-4 left-3 inline-flex h-[30px] items-center gap-2 rounded-[7px] px-3 text-[15px] font-bold text-foreground"
        style={{ backgroundColor: data.color }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          setDraft(data.label)
          setRenaming(true)
        }}
      >
        {renaming ? (
          <input
            autoFocus
            aria-label="区块名称"
            className="nodrag w-40 bg-transparent outline-none"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit()
              if (event.key === 'Escape') setRenaming(false)
            }}
          />
        ) : (
          <span>{data.label || '未命名区块'}</span>
        )}
      </div>
      {selected ? (
        <div className="nodrag absolute -top-4 right-3 flex gap-1 rounded-md border border-border bg-card p-1 shadow-sm">
          {WHITEBOARD_SECTION_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`区块颜色 ${color}`}
              className={cn('h-4 w-4 rounded-full border', color === data.color ? 'border-foreground' : 'border-transparent')}
              style={{ backgroundColor: color }}
              onClick={() => actions.recolorSection(id, color)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
