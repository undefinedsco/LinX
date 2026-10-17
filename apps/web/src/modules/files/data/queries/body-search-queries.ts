import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { filesResourceCollection } from '../collections'
import { getBodySearchStore, type BodySearchSnapshot, type BodySearchStore } from './body-search-store'
import { useFilesCurrentPodRootUri, useFilesPodSearchEntries } from './resource-queries'

const EMPTY_SNAPSHOT: BodySearchSnapshot = {
  version: 0,
  indexing: false,
  coverage: { totalFiles: 0, indexedFiles: 0, indexing: false },
  note: null,
  indexedChars: 0,
}
const noopSubscribe = () => () => {}
const getEmptySnapshot = () => EMPTY_SNAPSHOT

/**
 * Body index for the current Pod. Only starts reading once `enabled` (someone is
 * searching), then keeps itself current whenever the Pod listing changes.
 */
export function useFilesBodyIndex(enabled: boolean): {
  store: BodySearchStore | null
  snapshot: BodySearchSnapshot
  entries: FilesEntry[]
  isLoadingEntries: boolean
} {
  const { db } = useSolidDatabase()
  const podRootUri = useFilesCurrentPodRootUri()
  const entriesQuery = useFilesPodSearchEntries(enabled)
  const store = useMemo(() => (podRootUri ? getBodySearchStore(podRootUri) : null), [podRootUri])
  const entries = entriesQuery.data

  useEffect(() => {
    if (!enabled || !store || !db || !entries) return
    void store.sync(entries, async (uri) => (await filesResourceCollection.readRawText(uri, db)).content)
  }, [db, enabled, entries, store])

  const snapshot = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.getSnapshot : getEmptySnapshot,
    getEmptySnapshot,
  )
  return {
    store,
    snapshot,
    entries: entries ?? [],
    isLoadingEntries: enabled && entriesQuery.isLoading,
  }
}
