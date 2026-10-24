import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  completeStructuredEditStep,
  createStructuredEditHistory,
  describeStructuredEdit,
  dropStructuredEditStep,
  findStructuredEditConflict,
  isTypePredicate,
  peekStructuredEdit,
  planStructuredEditStep,
  recordStructuredEdit,
  type StructuredEditChange,
  type StructuredEditDirection,
  type StructuredEditEntry,
  type StructuredEditHistory,
  type StructuredEditValueCanonicalizer,
} from './structured-edit-history-model'

export type StructuredEditLatestDocument = {
  read: (subject: string, predicate: string) => readonly string[]
  etag: string | null
}

/** `expectedEtag` set: the version the write is checked against (null: no check). Left out: the caller's own default. */
export type StructuredEditWriteOptions = { expectedEtag?: string | null }

export type StructuredEditToast = (message: string, options?: { destructive?: boolean }) => void

/** The Pod refused the write because the document moved on (HTTP 409 / 412). */
function isWriteConflict(error: unknown) {
  return error instanceof Error
    && (error.name === 'StructuredCellWriteConflictError' || /HTTP 4(?:09|12)\b/.test(error.message))
}

function newEntryId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `edit-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * 撤销 / 重做 for the person's own edits in this table, this session. A step is carried out by writing
 * its inverse through the same own-write path, so other devices see it. When the cell no longer holds
 * what the step expects (it changed elsewhere) nothing is overwritten: the person is told and the step
 * leaves the history.
 */
export function useStructuredEditHistoryController({
  canonicalizeValue,
  documentUri,
  notify,
  predicateLabel,
  readLatest,
  writeChange,
}: {
  /** How a value is spelled when the table's cell is compared with what a step expects. */
  canonicalizeValue?: StructuredEditValueCanonicalizer
  documentUri: string
  notify: StructuredEditToast
  predicateLabel?: (predicate: string) => string
  /**
   * Reads the document again, so a step is compared with what the Pod holds now rather than with
   * a table that may not have caught up with our last write. Null when it could not be read.
   */
  readLatest?: () => Promise<StructuredEditLatestDocument | null>
  writeChange: (change: StructuredEditChange, options?: StructuredEditWriteOptions) => Promise<void>
}) {
  const [history, setHistory] = useState<StructuredEditHistory>(createStructuredEditHistory)
  const historyRef = useRef(history)
  const groupRef = useRef<StructuredEditChange[] | null>(null)
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)

  const commitHistory = useCallback((next: StructuredEditHistory) => {
    historyRef.current = next
    setHistory(next)
  }, [])

  useEffect(() => {
    groupRef.current = null
    commitHistory(createStructuredEditHistory())
  }, [commitHistory, documentUri])

  /** A write of the person's own landed. Inside {@link recordGroup} it joins the group's step. */
  const recordChange = useCallback((change: StructuredEditChange) => {
    if (groupRef.current) {
      groupRef.current.push(change)
      return
    }
    commitHistory(recordStructuredEdit(historyRef.current, { id: newEntryId(), changes: [change] }))
  }, [commitHistory])

  /** Runs several writes that undo and redo as one step (a new card on a board, a bulk delete). */
  const recordGroup = useCallback(async <T,>(title: string, run: () => Promise<T>): Promise<T> => {
    const outer = groupRef.current
    if (outer) return run()
    const changes: StructuredEditChange[] = []
    groupRef.current = changes
    try {
      return await run()
    } finally {
      groupRef.current = null
      commitHistory(recordStructuredEdit(historyRef.current, { id: newEntryId(), title, changes }))
    }
  }, [commitHistory])

  const step = useCallback(async (direction: StructuredEditDirection) => {
    if (busyRef.current) return false
    const entry = peekStructuredEdit(historyRef.current, direction)
    if (!entry) return false
    const verb = direction === 'undo' ? '撤销' : '重做'
    const changes = planStructuredEditStep(entry, direction)

    busyRef.current = true
    setBusy(true)
    try {
      const latest = readLatest ? await readLatest() : null
      if (readLatest && !latest) {
        notify(`没能读到最新内容，${verb}没有成功，请稍后再试。`, { destructive: true })
        return false
      }
      if (latest) {
        const conflict = findStructuredEditConflict(changes, latest.read, canonicalizeValue)
        if (conflict) {
          commitHistory(dropStructuredEditStep(historyRef.current, direction))
          const where = isTypePredicate(conflict.predicate) ? '这一行' : `「${predicateLabel?.(conflict.predicate) ?? conflict.predicate}」`
          notify(`${where}刚被别处改过，没法${verb}了。这一步已从记录里去掉。`, { destructive: true })
          return false
        }
      }
      // Checked against the version just read; the writes after the first follow our own.
      for (const [index, change] of changes.entries()) {
        if (latest) await writeChange(change, { expectedEtag: index === 0 ? latest.etag : null })
        else await writeChange(change)
      }
      commitHistory(completeStructuredEditStep(historyRef.current, direction))
      return true
    } catch (error) {
      if (isWriteConflict(error)) {
        commitHistory(dropStructuredEditStep(historyRef.current, direction))
        notify(`这里刚被别处改过，没法${verb}了。这一步已从记录里去掉。`, { destructive: true })
      } else {
        notify(`${verb}没有成功，请重试。`, { destructive: true })
      }
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [canonicalizeValue, commitHistory, notify, predicateLabel, readLatest, writeChange])

  const undo = useCallback(() => step('undo'), [step])
  const redo = useCallback(() => step('redo'), [step])

  const view = useMemo(() => {
    const undoEntry: StructuredEditEntry | null = peekStructuredEdit(history, 'undo')
    const redoEntry: StructuredEditEntry | null = peekStructuredEdit(history, 'redo')
    return {
      canUndo: !!undoEntry && !busy,
      canRedo: !!redoEntry && !busy,
      undoTitle: undoEntry ? `撤销：${describeStructuredEdit(undoEntry, predicateLabel)}` : '撤销',
      redoTitle: redoEntry ? `重做：${describeStructuredEdit(redoEntry, predicateLabel)}` : '重做',
    }
  }, [busy, history, predicateLabel])

  return { ...view, recordChange, recordGroup, redo, undo }
}
