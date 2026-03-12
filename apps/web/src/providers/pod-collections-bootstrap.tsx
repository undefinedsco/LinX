import { useEffect } from 'react'
import { useSolidDatabase } from './solid-database-provider'
import { initializeChatCollections } from '@/modules/chat/collections'
import { initializeContactCollections } from '@/modules/contacts/collections'
import { initializeFavoriteCollections } from '@/modules/favorites/collections'
import { initializeInboxCollections } from '@/modules/inbox/collections'
import { initializeModelCollections } from '@/modules/model-services/collections'

export function PodCollectionsBootstrap() {
  const { db } = useSolidDatabase()

  useEffect(() => {
    initializeChatCollections(db)
    initializeContactCollections(db)
    initializeFavoriteCollections(db)
    initializeInboxCollections(db)
    initializeModelCollections(db)
  }, [db])

  return null
}
