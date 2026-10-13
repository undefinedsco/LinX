import { useCallback, useMemo } from 'react'

import { useAiCellChanges, useMarkAiCellChangeSeen, useUndoAiCellChange } from '../../data/queries'
import { projectAiCellDots, type AiCellChange } from '../../domain/proposal/ai-cell-change-model'

/** The purple dots on cells LinX wrote into a table, with undo and "seen" (R6 K10b). */
export function useStructuredAiCellDots(documentUri: string) {
  const changesQuery = useAiCellChanges(documentUri)
  const { mutate: undo } = useUndoAiCellChange()
  const { mutate: markSeen } = useMarkAiCellChangeSeen()
  const aiCellDots = useMemo(() => projectAiCellDots(changesQuery.data ?? []), [changesQuery.data])
  const onUndoAiCell = useCallback((change: AiCellChange) => { undo(change) }, [undo])
  const onSeenAiCell = useCallback((change: AiCellChange) => { markSeen(change) }, [markSeen])
  return { aiCellDots, onUndoAiCell, onSeenAiCell }
}
