import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
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
  const { db, status: databaseStatus, error: databaseError, retry: retryDatabase } = useSolidDatabase()
  const [fetchError, setFetchError] = useState<Error | null>(null)
  const search = useContactStore((state) => state.search)
  const setSearch = useContactStore((state) => state.setSearch)
  const selectedId = useContactStore((state) => state.selectedId)
  const select = useContactStore((state) => state.select)
  const openCreateDialog = useContactStore((state) => state.openCreateDialog)
  const listFilter = useContactStore((state) => state.listFilter)
  const setListFilter = useContactStore((state) => state.setListFilter)

  useEffect(() => {
    if (!db) {
      setFetchError(null)
      return
    }
    contactCollection.startSyncImmediate()
    let active = true
    let cleanup: (() => void) | undefined
    setFetchError(null)
    void contactOps.fetch().catch((error) => {
      if (active) {
        setFetchError(error instanceof Error ? error : new Error(String(error)))
      }
    })
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

  const retryContacts = useCallback(() => {
    if (!db) {
      retryDatabase()
      return
    }
    setFetchError(null)
    void contactOps.fetch().catch((error) => {
      setFetchError(error instanceof Error ? error : new Error(String(error)))
    })
  }, [db, retryDatabase])

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
  const connectionError = !db && databaseStatus === 'error'
    ? databaseError?.message ?? '空间连接失败，请重试。'
    : !db && databaseStatus === 'idle' && !session.info.isLoggedIn
      ? '当前空间未连接，请先完成登录。'
      : !db && databaseStatus === 'idle'
        ? '空间数据尚未就绪，请重试。'
        : null

  const listError = connectionError
    ?? (fetchError ? '联系人加载失败，请重试。' : null)
    ?? (db && liveQuery.isError ? '联系人加载失败，请重试。' : null)

  const flatContacts = useMemo(
    () => projection.sections.flatMap((section) => section.items),
    [projection.sections],
  )
  const selectedIndex = useMemo(
    () => flatContacts.findIndex((contact) => contact.id === selectedId),
    [flatContacts, selectedId],
  )
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const registerItemRef = useCallback((index: number, node: HTMLButtonElement | null) => {
    optionRefs.current[index] = node
  }, [])
  const onItemKeyDown = useCallback((index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    let nextIndex: number
    if (event.key === 'ArrowDown') nextIndex = Math.min(index + 1, flatContacts.length - 1)
    else if (event.key === 'ArrowUp') nextIndex = Math.max(index - 1, 0)
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = flatContacts.length - 1
    else return
    event.preventDefault()
    const target = flatContacts[nextIndex]
    if (!target) return
    select(target.id)
    optionRefs.current[nextIndex]?.focus()
  }, [flatContacts, select])

  return (
    <ContactList
      search={search}
      onSearchChange={setSearch}
      filter={listFilter}
      onFilterChange={setListFilter}
      selectedId={selectedId}
      sections={projection.sections}
      letters={projection.letters}
      isLoading={databaseStatus === 'initializing' || (!!db && liveQuery.isLoading)}
      error={listError}
      onRetry={retryContacts}
      onSelect={select}
      onCreate={openCreateDialog}
      selectedIndex={selectedIndex}
      onItemKeyDown={onItemKeyDown}
      registerItemRef={registerItemRef}
    />
  )
}

export default ContactListPane
