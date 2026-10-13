import { useCallback, useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { scheduleResource, type RunRow, type ScheduleRow } from '@undefineds.co/models'
import { symphonyRunCollection } from '@/modules/symphony/collections'
import { useSolidDatabase } from '@/providers/solid-database-provider'

export interface ThreadScheduleRun {
  id: string
  status: string
  at: Date | null
}

export interface ThreadScheduleState {
  schedule: ScheduleRow | null
  runs: ThreadScheduleRun[]
  setAutoRun: (on: boolean) => Promise<void>
  setRepeat: (cron: string) => Promise<void>
}

function sameThread(runThread: unknown, threadId: string): boolean {
  if (typeof runThread !== 'string' || !runThread) return false
  const clean = runThread.replace(/[?#].*$/u, '')
  return runThread === threadId || clean === threadId || clean.endsWith(`/${threadId}`) || runThread.endsWith(`#${threadId}`)
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value as string)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * W6: the Schedule behind a recurring topic. A topic is recurring when some of
 * its Runs belong to a Task that has a Schedule; the Pod stores no direct
 * topic -> schedule link, so the Run is the bridge.
 */
export function useThreadSchedule(threadId: string | null): ThreadScheduleState {
  const { db } = useSolidDatabase()
  const queryClient = useQueryClient()
  const runQuery = useLiveQuery(symphonyRunCollection)

  const threadRuns = useMemo(() => {
    if (!threadId) return []
    return ((runQuery.data ?? []) as RunRow[])
      .filter((run) => sameThread(run.thread, threadId))
      .sort((left, right) => (toDate(right.createdAt)?.getTime() ?? 0) - (toDate(left.createdAt)?.getTime() ?? 0))
  }, [runQuery.data, threadId])
  const taskIri = threadRuns.find((run) => run.task)?.task ?? null

  const scheduleKey = ['chat-thread-schedule', threadId, taskIri] as const
  const { data: schedule = null } = useQuery({
    queryKey: scheduleKey,
    enabled: Boolean(db && taskIri),
    queryFn: async () => {
      const rows = (await (db as any).select().from(scheduleResource).execute()) as ScheduleRow[]
      return rows.find((row) => row.task === taskIri) ?? null
    },
  })

  const update = useMutation({
    mutationFn: async (values: Partial<ScheduleRow>) => {
      if (!db || !schedule) throw new Error('这项任务还没有定时')
      const target = db as any
      const iri = typeof target.resolveRowIri === 'function'
        ? target.resolveRowIri(scheduleResource, { id: schedule.id })
        : schedule.id
      await target.updateByIri(scheduleResource, iri, values)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chat-thread-schedule'] }),
  })

  const setAutoRun = useCallback(
    async (on: boolean) => { await update.mutateAsync({ status: on ? 'active' : 'paused' }) },
    [update],
  )
  const setRepeat = useCallback(
    async (cron: string) => { await update.mutateAsync({ scheduleKind: 'cron', cron, intervalSeconds: null as never }) },
    [update],
  )

  const runs = useMemo<ThreadScheduleRun[]>(() => threadRuns.slice(0, 4).map((run) => ({
    id: run.id as string,
    status: String(run.status ?? ''),
    at: toDate(run.startedAt ?? run.createdAt),
  })), [threadRuns])

  return { schedule, runs, setAutoRun, setRepeat }
}
