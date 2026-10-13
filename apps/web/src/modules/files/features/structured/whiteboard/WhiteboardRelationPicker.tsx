import { useState } from 'react'

import { WHITEBOARD_RELATION_CHOICES, whiteboardRelationLabel } from './whiteboard-relations'

/** "这条线是…": pick what a new line means, or leave it as a drawing on this board. */
export function WhiteboardRelationPicker({
  left,
  top,
  canWriteRelation,
  otherPredicates,
  saveError,
  onChoose,
  onViewOnly,
  onRemove,
}: {
  left: number
  top: number
  canWriteRelation: boolean
  otherPredicates: readonly string[]
  saveError?: string | null
  onChoose: (predicate: string) => void
  onViewOnly: () => void
  onRemove: () => void
}) {
  const [showOthers, setShowOthers] = useState(false)
  const rows = showOthers ? otherPredicates : WHITEBOARD_RELATION_CHOICES.map((choice) => choice.predicate)
  return (
    <div
      role="dialog"
      aria-label="这条线是"
      data-whiteboard-relation-picker="true"
      className="absolute z-20 w-48 rounded-[10px] border border-border bg-card p-1.5 text-[13px] shadow-xl"
      style={{ left, top }}
    >
      <p className="px-2 py-1 text-xs text-muted-foreground">这条线是</p>
      <button type="button" className="flex h-[30px] w-full items-center rounded-md px-2 text-left hover:bg-muted" onClick={onViewOnly}>
        只画一条线
      </button>
      {canWriteRelation ? (
        <>
          <div className="my-1 border-t border-border" />
          {rows.map((predicate) => (
            <button
              key={predicate}
              type="button"
              className="flex h-[30px] w-full items-center justify-between rounded-md px-2 text-left hover:bg-muted"
              onClick={() => onChoose(predicate)}
            >
              <span>{whiteboardRelationLabel(predicate)}</span>
              {!showOthers && WHITEBOARD_RELATION_CHOICES.some((c) => c.predicate === predicate) ? (
                <span className="text-[11px] text-muted-foreground">词表</span>
              ) : null}
            </button>
          ))}
          {!showOthers && otherPredicates.length > 0 ? (
            <button type="button" className="flex h-[30px] w-full items-center rounded-md px-2 text-left hover:bg-muted" onClick={() => setShowOthers(true)}>
              其他属性…
            </button>
          ) : null}
        </>
      ) : (
        <p className="px-2 py-1 text-[11px] text-muted-foreground">这张卡片不在当前表里，只能先画线</p>
      )}
      <div className="my-1 border-t border-border" />
      <button type="button" className="flex h-[30px] w-full items-center rounded-md px-2 text-left text-destructive hover:bg-muted" onClick={onRemove}>
        删除这条线
      </button>
      {saveError ? <p role="alert" className="px-2 py-1 text-[11px] text-destructive">{saveError}</p> : null}
    </div>
  )
}
