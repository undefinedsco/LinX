import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { readWithdrawnCards, writeWithdrawnCards, type FetchLike } from '@/lib/withdrawn-cards'
import { useSession } from '@/providers/solid-session-context'
import { useSolidDatabase } from '@/providers/solid-database-provider'

const queryKeyFor = (podBaseUrl: string | null) => ['withdrawn-cards', podBaseUrl ?? ''] as const

/** The withdrawn list with 撤回 / 恢复使用. */
export function useWithdrawnCards() {
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const queryClient = useQueryClient()
  const podBaseUrl = useMemo(() => (db ? resolveCurrentPodBaseUrl(db as never) : null), [db])
  const fetchFn = session.fetch as FetchLike
  const queryKey = queryKeyFor(podBaseUrl)

  const query = useQuery({
    queryKey,
    queryFn: () => readWithdrawnCards(podBaseUrl as string, fetchFn),
    enabled: !!podBaseUrl,
    staleTime: 60_000,
  })
  const uris = useMemo(() => new Set(query.data ?? []), [query.data])

  const mutation = useMutation({
    mutationFn: async ({ uri, withdrawn }: { uri: string; withdrawn: boolean }) => {
      if (!podBaseUrl) throw new Error('空间还没准备好')
      const current = await readWithdrawnCards(podBaseUrl, fetchFn)
      const next = withdrawn ? [...current.filter((item) => item !== uri), uri] : current.filter((item) => item !== uri)
      await writeWithdrawnCards(podBaseUrl, fetchFn, next)
      return next
    },
    onSuccess: (next) => queryClient.setQueryData(queryKey, next),
  })

  const isWithdrawn = useCallback((uri: string) => uris.has(uri), [uris])
  return {
    isWithdrawn,
    withdraw: (uri: string) => mutation.mutateAsync({ uri, withdrawn: true }),
    restore: (uri: string) => mutation.mutateAsync({ uri, withdrawn: false }),
    pending: mutation.isPending,
  }
}
