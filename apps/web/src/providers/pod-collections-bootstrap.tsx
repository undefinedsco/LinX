import { useEffect } from 'react'
import { useSolidDatabase } from './solid-database-provider'
import { chatOps, initializeChatCollections } from '@/modules/chat/collections'
import { initializeContactCollections } from '@/modules/contacts/collections'
import { initializeFavoriteCollections } from '@/modules/favorites/collections'
import { inboxOps, initializeInboxCollections } from '@/modules/inbox/collections'
import { initializeModelCollections } from '@/modules/model-services/collections'

export function PodCollectionsBootstrap() {
  const { db } = useSolidDatabase()

  useEffect(() => {
    initializeChatCollections(db)
    initializeContactCollections(db)
    initializeFavoriteCollections(db)
    initializeInboxCollections(db)
    initializeModelCollections(db)

    if (!db) return

    void chatOps.ensureLinxWelcome().catch((error) => {
      console.warn('[PodCollectionsBootstrap] Failed to prepare LinX welcome:', error)
    })

    let disposed = false
    let unsubscribe: (() => void) | null = null
    void inboxOps.subscribeToPod()
      .then((cleanup) => {
        if (disposed) {
          cleanup()
          return
        }
        unsubscribe = cleanup
      })
      .catch((error) => {
        console.warn('[PodCollectionsBootstrap] Failed to subscribe inbox collections:', error)
      })

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [db])

  return null
}
