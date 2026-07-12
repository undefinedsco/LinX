import { useEffect, useMemo } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import { useLiveQuery } from '@tanstack/react-db'
import type { ContactRow } from '@undefineds.co/models'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { useContactStore } from '../../app/store'
import { contactCollection, contactOps } from '../../data/collections'
import {
  buildContactListProjection,
  isContactGroup,
} from '../../domain/contact-projection'
import type { GroupContactInfo } from '../../domain/types'
import { ContactList } from '../../ui/ContactList'

export function ContactListPane({}: MicroAppPaneProps) {
  const { session } = useSession()
  const { db } = useSolidDatabase()
  const search = useContactStore((state) => state.search)
  const setSearch = useContactStore((state) => state.setSearch)
  const selectedId = useContactStore((state) => state.selectedId)
  const select = useContactStore((state) => state.select)
  const openCreateDialog = useContactStore((state) => state.openCreateDialog)
  const listFilter = useContactStore((state) => state.listFilter)
  const setListFilter = useContactStore((state) => state.setListFilter)

  useEffect(() => {
    if (!db) return
    contactCollection.startSyncImmediate()
    let active = true
    let cleanup: (() => void) | undefined
    void contactOps.subscribeToPod().then((unsubscribe) => {
      if (active) {
        cleanup = unsubscribe
      } else {
        unsubscribe()
      }
    })
    return () => {
      active = false
      cleanup?.()
    }
  }, [db])

  const liveQuery = useLiveQuery((query) => (
    query.from({ contact: contactCollection }).select(({ contact }) => contact)
  ))
  const rawContacts = useMemo(
    () => (liveQuery.data ?? []) as ContactRow[],
    [liveQuery.data],
  )
  const visibleContacts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    if (!term) return rawContacts
    return rawContacts.filter((contact) => (
      [contact.name, contact.alias, contact.externalId, contact.note, contact.about]
        .some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(term))
    ))
  }, [rawContacts, search])
  const groupInfoById = useMemo(() => {
    const result = new Map<string, GroupContactInfo>()
    for (const contact of visibleContacts) {
      if (isContactGroup(contact)) {
        result.set(contact.id, contactOps.getGroupDisplayInfo(contact.id, session.info.webId ?? undefined))
      }
    }
    return result
  }, [visibleContacts, session.info.webId])
  const projection = useMemo(
    () => buildContactListProjection(visibleContacts, { filter: listFilter, groupInfoById }),
    [visibleContacts, listFilter, groupInfoById],
  )

  return (
    <ContactList
      search={search}
      onSearchChange={setSearch}
      filter={listFilter}
      onFilterChange={setListFilter}
      selectedId={selectedId}
      sections={projection.sections}
      letters={projection.letters}
      isLoading={!!db && liveQuery.isLoading}
      error={db && liveQuery.isError ? '联系人加载失败，请重试。' : null}
      onRetry={() => { void contactOps.fetch() }}
      onSelect={select}
      onCreate={openCreateDialog}
    />
  )
}

export default ContactListPane
