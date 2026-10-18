import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { StructuredCellWriteProposal } from '../../domain/structured/structured-table'
import {
  createStructuredSaveState,
  projectStructuredSaveFailed,
  projectStructuredSaveFinished,
  projectStructuredSaveSettled,
  projectStructuredSaveStarted,
} from './structured-save-state-model'

/**
 * The 保存中… / 已保存 / 没保存成功 重试 line for views that write through their own
 * callbacks (the kanban board). A cell write that comes back `false` or throws is
 * a failure; 重试 sends the same write again.
 */
export function useStructuredSaveTracker() {
  const [state, setState] = useState(createStructuredSaveState)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryJob = useRef<(() => void) | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const run = useCallback(async <T,>(job: () => T | Promise<T>, proposal: StructuredCellWriteProposal | null, isFailure: (result: T) => boolean) => {
    if (timer.current) clearTimeout(timer.current)
    setState((current) => projectStructuredSaveStarted(current))
    const fail = () => {
      setState((current) => proposal
        ? projectStructuredSaveFailed(current, proposal)
        : { ...current, inFlight: Math.max(0, current.inFlight - 1), status: 'error' as const })
      retryJob.current = () => { void run(job, proposal, isFailure) }
    }
    try {
      const result = await job()
      if (isFailure(result)) {
        fail()
      } else {
        setState((current) => projectStructuredSaveFinished(current))
        timer.current = setTimeout(() => setState((current) => projectStructuredSaveSettled(current)), 2000)
      }
      return result
    } catch (error) {
      fail()
      throw error
    }
  }, [])

  const track = useCallback(
    <T,>(job: () => T | Promise<T>, proposal: StructuredCellWriteProposal) => run(job, proposal, (result) => (result as unknown) === false),
    [run],
  )
  const trackCreate = useCallback(
    <T,>(job: () => T | Promise<T>) => run(job, null, (result) => (result as unknown) === false),
    [run],
  )
  const retry = useCallback(() => { retryJob.current?.() }, [])

  return useMemo(() => ({ state, track, trackCreate, retry }), [retry, state, track, trackCreate])
}
