import { useMutation, useQuery, useQueryClient, type QueryKey, type UseMutationOptions, type UseQueryOptions } from '@tanstack/react-query'
import type { PodRepositoryDescriptor } from '@linx/models'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { runWithOfflineQueue } from '@/lib/data/offline-queue'

const DEFAULT_STALE_TIME = 5 * 60 * 1000
const DEFAULT_GC_TIME = 15 * 60 * 1000

const buildKey = (namespace: string, scope: string, params?: unknown): QueryKey => [
  namespace,
  scope,
  params ?? null,
]

type ListQueryOptions<Row> = Omit<UseQueryOptions<Row[], Error, Row[], QueryKey>, 'queryKey' | 'queryFn'>
type DetailQueryOptions<Row> = Omit<UseQueryOptions<Row | null, Error, Row | null, QueryKey>, 'queryKey' | 'queryFn'>
type CreateMutationOptions<Row, Insert> = Omit<UseMutationOptions<Row, Error, Insert>, 'mutationFn'>
type UpdateMutationOptions<Row, Update> = Omit<UseMutationOptions<Row, Error, { id: string; input: Update }>, 'mutationFn'>
type RemoveMutationOptions = Omit<UseMutationOptions<{ id: string }, Error, { id: string }>, 'mutationFn'>

const deriveRowId = <Row>(row: Row | null | undefined): string | undefined => {
  if (!row) return undefined
  const record = row as Record<string, unknown>
  const explicit = record['@id']
  if (typeof explicit === 'string' && explicit.length > 0) return explicit
  if (typeof record.subject === 'string' && record.subject.length > 0) return record.subject
  if (typeof record.id === 'string' && record.id.length > 0) return record.id
  return undefined
}

const invalidateScopes = (
  namespace: string,
  scopes: string[] | undefined,
  queryClient: ReturnType<typeof useQueryClient>,
  context?: { detailId?: string }
) => {
  scopes?.forEach((scope) => {
    if (!scope) return
    if (scope === 'detail') {
      if (context?.detailId) {
        void queryClient.invalidateQueries({ queryKey: buildKey(namespace, 'detail', context.detailId) })
      }
      return
    }
    const params = scope === 'list' ? null : context?.detailId ?? null
    void queryClient.invalidateQueries({ queryKey: buildKey(namespace, scope, params) })
  })
}

export type RepositoryQueries<
  Row extends Record<string, unknown>,
  Insert = Row,
  Update = Insert,
  Filters extends Record<string, unknown> = Record<string, unknown>
> = ReturnType<typeof createRepositoryQueries<Row, Insert, Update, Filters>>

export function createRepositoryQueries<
  Row extends Record<string, unknown>,
  Insert = Row,
  Update = Insert,
  Filters extends Record<string, unknown> = Record<string, unknown>
>(descriptor: PodRepositoryDescriptor<any, Row, Insert, Update, Filters>) {
  const defaultCache = descriptor.cache ?? {}

  const useListQuery = (filters?: Filters, options?: ListQueryOptions<Row>) => {
    const { db, status, error } = useSolidDatabase()
    const { enabled: optEnabled, ...rest } = options ?? {}
    const ready = status === 'ready' && Boolean(db)
    return useQuery({
      queryKey: buildKey(descriptor.namespace, 'list', filters ?? null),
      queryFn: () => {
        if (!ready || !db) {
          throw error ?? new Error('Solid database is not ready. Please sign in to your Pod.')
        }
        return descriptor.list(db, filters)
      },
      enabled: (optEnabled ?? true) && ready,
      staleTime: defaultCache.staleTime ?? DEFAULT_STALE_TIME,
      gcTime: defaultCache.gcTime ?? DEFAULT_GC_TIME,
      ...rest,
    })
  }

  const useDetailQuery = (id: string | null, options?: DetailQueryOptions<Row>) => {
    const { db, status, error } = useSolidDatabase()
    const { enabled: optEnabled, ...rest } = options ?? {}
    const ready = status === 'ready' && Boolean(db)
    return useQuery({
      queryKey: buildKey(descriptor.namespace, 'detail', id ?? 'unknown'),
      queryFn: () => {
        if (!id) return Promise.resolve(null)
        if (!ready || !db) {
          throw error ?? new Error('Solid database is not ready. Please sign in to your Pod.')
        }
        return descriptor.detail(db, id)
      },
      enabled: Boolean(id) && ready && (optEnabled ?? true),
      staleTime: defaultCache.staleTime ?? DEFAULT_STALE_TIME,
      gcTime: defaultCache.gcTime ?? DEFAULT_GC_TIME,
      ...rest,
    })
  }

  const useCreateMutation = descriptor.create
    ? (options?: CreateMutationOptions<Row, Insert>) => {
        const queryClient = useQueryClient()
        const { db, status, error } = useSolidDatabase()
        return useMutation({
          mutationFn: (variables: Insert) => {
            if (!db || status !== 'ready') {
              throw error ?? new Error('Solid database is not ready. Please sign in to your Pod.')
            }
            return runWithOfflineQueue(() => descriptor.create!(db, variables))
          },
          onSuccess: (data, variables, context, mutation) => {
            invalidateScopes(descriptor.namespace, descriptor.invalidations.create, queryClient)
            options?.onSuccess?.(data, variables, context, mutation)
          },
          ...options,
        })
      }
    : undefined

  const useUpdateMutation = descriptor.update
    ? (options?: UpdateMutationOptions<Row, Update>) => {
        const queryClient = useQueryClient()
        const { db, status, error } = useSolidDatabase()
        return useMutation({
          mutationFn: ({ id, input }: { id: string; input: Update }) =>
            runWithOfflineQueue(() => {
              if (!db || status !== 'ready') {
                throw error ?? new Error('Solid database is not ready. Please sign in to your Pod.')
              }
              return descriptor.update!(db, id, input)
            }),
          onSuccess: (data, variables, context, mutation) => {
            const detailId = deriveRowId(data) ?? variables.id
            invalidateScopes(descriptor.namespace, descriptor.invalidations.update, queryClient, { detailId })
            options?.onSuccess?.(data, variables, context, mutation)
          },
          ...options,
        })
      }
    : undefined

  const useRemoveMutation = descriptor.remove
    ? (options?: RemoveMutationOptions) => {
        const queryClient = useQueryClient()
        const { db, status, error } = useSolidDatabase()
        return useMutation({
          mutationFn: ({ id }: { id: string }) =>
            runWithOfflineQueue(() => {
              if (!db || status !== 'ready') {
                throw error ?? new Error('Solid database is not ready. Please sign in to your Pod.')
              }
              return descriptor.remove!(db, id)
            }),
          onSuccess: (data, variables, context, mutation) => {
            invalidateScopes(descriptor.namespace, descriptor.invalidations.remove, queryClient, {
              detailId: variables.id,
            })
            options?.onSuccess?.(data, variables, context, mutation)
          },
          ...options,
        })
      }
    : undefined

  return {
    namespace: descriptor.namespace,
    useListQuery,
    useDetailQuery,
    useCreateMutation,
    useUpdateMutation,
    useRemoveMutation,
    listKey: (filters?: Filters) => buildKey(descriptor.namespace, 'list', filters ?? null),
    detailKey: (id: string) => buildKey(descriptor.namespace, 'detail', id),
  }
}
