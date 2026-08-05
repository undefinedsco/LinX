import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

type QueryCollectionErrorUtils = {
  lastError?: unknown
  isError?: boolean
}

type QueryCollectionWithErrorState = {
  utils?: QueryCollectionErrorUtils
}

export function useCollectionQueryError(collection: QueryCollectionWithErrorState) {
  const queryClient = useQueryClient()
  const readError = () => collection.utils?.lastError ?? null
  const [error, setError] = useState<unknown>(readError)

  useEffect(() => {
    const syncError = () => setError((current: unknown) => {
      const next = readError()
      return Object.is(current, next) ? current : next
    })

    syncError()
    return queryClient.getQueryCache().subscribe(syncError)
  }, [collection, queryClient])

  return {
    error,
    isError: error !== null,
  }
}
