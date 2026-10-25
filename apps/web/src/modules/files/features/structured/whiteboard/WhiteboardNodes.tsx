import { createContext, lazy, Suspense, useContext, useState } from 'react'
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'

import { cn } from '@/lib/utils'
import { WHITEBOARD_SECTION_COLORS } from '../../../domain/structured/structured-whiteboard-canvas'
import type { WhiteboardCardData, WhiteboardSectionData } from './whiteboard-flow'

const WhiteboardBodyEditor = lazy(() => import('./WhiteboardBodyEditor'))
const WhiteboardDocumentEditor = lazy(() => import('./WhiteboardDocumentEditor'))

/** A document card whose file the board can edit in place. */
export const isEditableWhiteboardDocument = (uri: string | null) =>
  Boolean(uri && !uri.includes('#') && /\.(?:md|markdown)$/i.test(uri.split('?')[0] ?? uri))

export const WHITEBOARD_CARD_MIN_SIZE = { width: 140, height: 80 } as const
export const WHITEBOARD_CARD_MAX_SIZE = { width: 800, height: 800 } as const

export interface WhiteboardNodeActions {
  editingId: string | null
  connecting: boolean
  startEdit: (id: string) => void
  stopEdit: () => void
  commitBody: (id: string, markdown: string, title?: string) => void
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
  const isDocument = content.kind === 'file' && isEditableWhiteboardDocument(content.uri)
  const facts = content.kind === 'row' && !content.body.trim() ? content.facts ?? [] : []
  return (
    <>
      {/* Outside the clipped card so the handles at its corners are not cut off. */}
      <NodeResizer
        isVisible={selected && !editing && !deleted}
        minWidth={WHITEBOARD_CARD_MIN_SIZE.width}
        minHeight={WHITEBOARD_CARD_MIN_SIZE.height}
        maxWidth={WHITEBOARD_CARD_MAX_SIZE.width}
        maxHeight={WHITEBOARD_CARD_MAX_SIZE.height}
      />
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
            {isDocument ? (
              <WhiteboardDocumentEditor uri={content.uri as string} onDone={actions.stopEdit} />
            ) : (
              <WhiteboardBodyEditor
                markdown={content.body}
                title={content.kind === 'row' ? content.title : undefined}
                onCommit={(markdown, title) => actions.commitBody(id, markdown, title)}
                onCancel={actions.stopEdit}
              />
            )}
          </Suspense>
        ) : (
          <>
            {content.title ? <h3 className="mb-1 truncate text-[13px] font-semibold">{content.title}</h3> : null}
            {content.className ? <p className="mb-1 truncate text-[11px] text-muted-foreground">{content.className}</p> : null}
            {facts.length > 0 ? (
              <ul className="min-h-0 flex-1 space-y-1 overflow-hidden" data-whiteboard-card-facts="true">
                {facts.map((fact) => (
                  <li key={fact.label} className="flex min-w-0 items-baseline gap-1.5">
                    <span className="shrink-0 text-muted-foreground">{fact.label}</span>
                    <span className="min-w-0 truncate rounded bg-muted px-1.5 py-0.5 text-foreground">{fact.value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="min-h-0 flex-1 overflow-hidden whitespace-pre-wrap break-words leading-relaxed">{content.body}</p>
            )}
          </>
        )}
      </div>
    </>
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
      <NodeResizer isVisible={selected} minWidth={160} minHeight={120} maxWidth={2400} maxHeight={2400} />
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
