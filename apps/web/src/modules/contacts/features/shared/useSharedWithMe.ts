import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import { isAgentContact, isGroupContact, type ContactRow } from '@undefineds.co/models'
import { useSession } from '@/providers/solid-session-context'
import { contactOps, contactCollection } from '../../data/collections'
import { readSharedWithMe, type SharedWithMePerson } from '../../data/shared-with-me'
import { contactDisplayName } from '../../domain/contact-display-name'
import { applyOwnerNames, type SharedWithMeItem } from '../../domain/shared-with-me'

export type { SharedWithMeItem }

/**
 * 共享给我: what the people in my contacts let me open in their space,
 * `{ ownerName, uri, name, kind }[]`. Derived from what my sign-in can list in
 * each person's space (there is no share index); a person whose space cannot be
 * read simply contributes nothing.
 */
export function useSharedWithMe(): { items: SharedWithMeItem[]; isLoading: boolean } {
  const { session } = useSession()
  const ownWebId = session.info.webId ?? null
  const contacts = useLiveQuery(contactCollection)

  const people = useMemo<SharedWithMePerson[]>(() => {
    const result: SharedWithMePerson[] = []
    for (const row of (contacts.data ?? []) as ContactRow[]) {
      if (!row?.id || row.deletedAt || isGroupContact(row) || isAgentContact(row)) continue
      if (!/^https?:\/\//i.test(row.about ?? '')) continue
      result.push({ name: contactDisplayName(row) || '联系人', webId: row.about as string })
    }
    return result
  }, [contacts.data])

  const peopleKey = people.map((person) => person.webId).join('|')
  const query = useQuery({
    queryKey: ['contacts', 'shared-with-me', ownWebId, peopleKey],
    enabled: people.length > 0,
    staleTime: 60_000,
    queryFn: () => readSharedWithMe({ authFetch: contactOps.getAuthFetch(), people, ownWebId }),
  })

  // The listing is cached by WebID only; names are applied here so a new remark shows at once.
  const items = useMemo(
    () => applyOwnerNames(query.data ?? [], new Map(people.map((person) => [person.webId, person.name]))),
    [query.data, people],
  )
  return { items, isLoading: people.length > 0 && query.isLoading }
}
