type StructuredProjectionTableRowChromeInput = {
  pending?: boolean
}

type StructuredProjectionTableCellChromeInput = {
  columnId: string
  index: number
}

type StructuredProjectionTableCellInteractionInput = {
  columnId: string
}

export function projectStructuredProjectionTableRowClassName(row: StructuredProjectionTableRowChromeInput) {
  return row.pending ? 'bg-amber-500/5' : undefined
}

export function projectStructuredProjectionTableCellClassName({
  columnId,
  index,
}: StructuredProjectionTableCellChromeInput) {
  return [
    'border-b border-border/5 px-1.5 py-0.5',
    index > 0 ? 'border-l border-border/5' : null,
    columnId === 'subject'
      ? 'min-w-0 font-medium text-foreground/80'
      : columnId === '__addPredicate'
        ? 'text-muted-foreground/50'
    : 'min-w-0 text-foreground/70',
  ].filter(Boolean).join(' ')
}

export function isStructuredProjectionTableCellInteractive({
  columnId,
}: StructuredProjectionTableCellInteractionInput) {
  return columnId !== 'subject' && columnId !== '__addPredicate'
}
