import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import type { RunRow } from '@undefineds.co/models'
import { symphonyRunCollection } from '@/modules/symphony/collections'

/** Run states that keep going after the person signs out. */
const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'waiting_input', 'waiting_runner'])

export function countRunningTasks(runs: ReadonlyArray<Pick<RunRow, 'status'>>): number {
  return runs.filter((run) => ACTIVE_RUN_STATUSES.has(String(run.status ?? ''))).length
}

/** S4: how many tasks are still running (read-only; from the runs the Pod already holds). */
export function useRunningTaskCount(): number {
  const query = useLiveQuery(symphonyRunCollection)
  return useMemo(() => countRunningTasks((query.data ?? []) as RunRow[]), [query.data])
}
