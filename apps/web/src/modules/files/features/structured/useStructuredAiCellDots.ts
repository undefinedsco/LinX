import { useCallback, useMemo } from 'react'

import {
  useAiCellChanges,
  useAiColumnChanges,
  useKeepAiColumnChange,
  useMarkAiCellChangeSeen,
  useRemoveAiColumnChange,
  useUndoAiCellChange,
} from '../../data/queries'
import { projectAiCellDots, type AiCellChange } from '../../domain/proposal/ai-cell-change-model'
import { projectAiColumns, type AiColumnChange } from '../../domain/proposal/ai-column-change-model'

/** The purple dots on cells and the marked columns LinX wrote into a table, with undo and "seen" (R6 K6b / K10b). */
export function useStructuredAiCellDots(documentUri: string) {
  const changesQuery = useAiCellChanges(documentUri)
  const columnsQuery = useAiColumnChanges(documentUri)
  const { mutate: undo } = useUndoAiCellChange()
  const { mutate: markSeen } = useMarkAiCellChangeSeen()
  const { mutate: keepColumn } = useKeepAiColumnChange()
  const { mutate: removeColumn } = useRemoveAiColumnChange()
  const aiCellDots = useMemo(() => projectAiCellDots(changesQuery.data ?? []), [changesQuery.data])
  const aiColumns = useMemo(() => projectAiColumns(columnsQuery.data ?? []), [columnsQuery.data])
  const onUndoAiCell = useCallback((change: AiCellChange) => { undo(change) }, [undo])
  const onSeenAiCell = useCallback((change: AiCellChange) => { markSeen(change) }, [markSeen])
  const onKeepAiColumn = useCallback((change: AiColumnChange) => { keepColumn(change) }, [keepColumn])
  const onRemoveAiColumn = useCallback((change: AiColumnChange) => { removeColumn(change) }, [removeColumn])
  return { aiCellDots, aiColumns, onUndoAiCell, onSeenAiCell, onKeepAiColumn, onRemoveAiColumn }
}
