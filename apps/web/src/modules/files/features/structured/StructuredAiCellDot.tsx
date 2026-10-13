import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import { displayRdfValue, isRdfLiteralToken, localRdfName } from '../../domain/card/rdf-term-tokens'
import { projectAiCellDotLabel, type AiCellChange } from '../../domain/proposal/ai-cell-change-model'

/** The small purple dot on a cell LinX wrote: click to see what it said before and undo (K10b). */
export function StructuredAiCellDot({
  change,
  onUndo,
  onSeen,
}: {
  change: AiCellChange
  onUndo: (change: AiCellChange) => void
  onSeen: (change: AiCellChange) => void
}) {
  const previous = change.previousValues
    .map((value) => (isRdfLiteralToken(value) ? displayRdfValue(value) : localRdfName(value.replace(/^<|>$/g, ''))))
    .join('、')
  return (
    <Popover onOpenChange={(open) => { if (!open) onSeen(change) }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="LinX 改的"
          data-ai-cell-dot="true"
          className="ml-1 inline-block h-2 w-2 shrink-0 rounded-full bg-primary align-middle"
          onClick={(event) => event.stopPropagation()}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[280px] p-2 text-xs" side="top" align="start">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">{projectAiCellDotLabel(change, previous)}</span>
          <button type="button" className="text-primary hover:underline" onClick={() => onUndo(change)}>撤销</button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
