import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/providers/solid-session-context'
import {
  classifyFavoriteSourceResponse,
  isCheckableFavoriteTarget,
  splitFavoriteTarget,
  type FavoriteSourceStatus,
} from '../domain/source-status'

/** Asks the Pod whether a favorite's original still exists and is still readable. */
export function useFavoriteSourceStatus(targetUri: string | null | undefined): FavoriteSourceStatus {
  const { session } = useSession()
  const checkable = isCheckableFavoriteTarget(targetUri)

  const query = useQuery({
    queryKey: ['favorites', 'source-status', targetUri ?? null],
    enabled: checkable,
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<FavoriteSourceStatus> => {
      if (!isCheckableFavoriteTarget(targetUri)) return 'unknown'
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
      const { documentUrl, fragment } = splitFavoriteTarget(targetUri)
      try {
        const response = await session.fetch(documentUrl, {
          method: fragment ? 'GET' : 'HEAD',
          headers: { Accept: 'text/turtle' },
        })
        const body = fragment && response.ok ? await response.text() : null
        return classifyFavoriteSourceResponse({ status: response.status, body, fragment })
      } catch {
        return 'offline'
      }
    },
  })

  if (!checkable) return 'unknown'
  if (query.isPending) return 'checking'
  return query.data ?? 'unreachable'
}
