import { useMemo } from 'react'
import { agentResource, isAgentContact, isGroupContact, solidProfileResource, type ContactRow } from '@undefineds.co/models'
import { useEntity } from '@/lib/data/use-entity'
import { formatErrorForUser } from '@/lib/user-facing-errors'
import { contactOps } from '../../data/collections'

export function useContactProfileSyncController(contact: ContactRow | null) {
  const aboutRef = contact && !isGroupContact(contact) ? contact.about || null : null
  const aboutResource = isAgentContact(contact) ? agentResource : solidProfileResource
  const {
    data: sourceData,
    isLoading: isSyncing,
    error: syncError,
    refresh: handleManualSync,
  } = useEntity(aboutResource, aboutRef, {
    onUpdate: (data) => {
      if (!contact?.id || !data) return
      contactOps.updateContact(contact.id, {
        name: data.name || contact.name,
        avatarUrl: (data as { avatar?: string; avatarUrl?: string }).avatar
          || (data as { avatarUrl?: string }).avatarUrl
          || contact.avatarUrl,
        lastSyncedAt: new Date(),
      }).catch(() => undefined)
    },
  })

  return useMemo(() => ({
    sourceData,
    isSyncing,
    syncErrorMessage: syncError
      ? formatErrorForUser(syncError, '联系人同步失败。请稍后重试。')
      : null,
    handleManualSync,
    lastSyncedText: contactOps.getLastSyncedText(contact?.lastSyncedAt),
  }), [contact?.lastSyncedAt, handleManualSync, isSyncing, sourceData, syncError])
}
