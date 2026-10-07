import {
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignVerticalDistributeCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Group,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-react'

type MenuAction = {
  label: string
  icon: typeof Copy
  disabled?: boolean
  destructive?: boolean
  run: () => void
}

export function LinxWhiteboardContextMenu({
  left,
  selectedCount,
  top,
  onAlignLeft,
  onBringToFront,
  onDelete,
  onDistributeHorizontal,
  onDistributeVertical,
  onDuplicate,
  onGroup,
  onRedo,
  onSendToBack,
  onUndo,
}: {
  left: number
  selectedCount: number
  top: number
  onAlignLeft: () => void
  onBringToFront: () => void
  onDelete: () => void
  onDistributeHorizontal: () => void
  onDistributeVertical: () => void
  onDuplicate: () => void
  onGroup: () => void
  onRedo: () => void
  onSendToBack: () => void
  onUndo: () => void
}) {
  const actions: Array<MenuAction | 'separator'> = [
    { label: '复制', icon: Copy, run: onDuplicate },
    { label: '组合', icon: Group, disabled: selectedCount < 2, run: onGroup },
    'separator',
    { label: '置于顶层', icon: ArrowUpToLine, run: onBringToFront },
    { label: '置于底层', icon: ArrowDownToLine, run: onSendToBack },
    { label: '左对齐', icon: AlignLeft, disabled: selectedCount < 2, run: onAlignLeft },
    { label: '水平分布', icon: AlignHorizontalDistributeCenter, disabled: selectedCount < 3, run: onDistributeHorizontal },
    { label: '垂直分布', icon: AlignVerticalDistributeCenter, disabled: selectedCount < 3, run: onDistributeVertical },
    'separator',
    { label: '撤销', icon: Undo2, run: onUndo },
    { label: '重做', icon: Redo2, run: onRedo },
    'separator',
    { label: '删除', icon: Trash2, destructive: true, run: onDelete },
  ]

  return (
    <div
      role="menu"
      aria-label="白板所选内容操作"
      className="absolute z-50 min-w-40 rounded-md border border-border/40 bg-popover p-1 text-[11px] shadow-lg"
      style={{ left, top }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {actions.map((action, index) => {
        if (action === 'separator') return <div key={`separator-${index}`} className="my-1 h-px bg-border/35" />
        const Icon = action.icon
        return (
          <button
            key={action.label}
            type="button"
            role="menuitem"
            disabled={action.disabled}
            className={`flex h-7 w-full items-center gap-2 rounded px-2 text-left disabled:opacity-35 ${
              action.destructive
                ? 'text-destructive hover:bg-destructive/10'
                : 'text-foreground hover:bg-muted'
            }`}
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              action.run()
            }}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {action.label}
          </button>
        )
      })}
    </div>
  )
}
