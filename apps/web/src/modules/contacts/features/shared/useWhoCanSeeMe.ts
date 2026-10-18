import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import { isAgentContact, isGroupContact, type ContactRow } from '@undefineds.co/models'
import { useSession } from '@/providers/solid-session-context'
import { contactCollection, contactOps } from '../../data/collections'
import { probeContactAccess, readPublicKnows } from '../../data/contact-access'
import { formatAccountAddress } from '../../domain/account-address'
import { hasAnyAccess } from '../../domain/contact-access'

export interface PublicContactEntry {
  webId: string
  /** My saved name for them, else their "名字@提供方" address. */
  name: string
}

export interface WhoCanSeeMe {
  /** People listed in my public profile (foaf:knows); null when it cannot be read. */
  publicContacts: PublicContactEntry[] | null
  /**
   * How many saved people I gave access to my space or profile by name (the
   * only share Pods can tell without an index); null while unknown.
   */
  sharedWithPeople: number | null
  isLoading: boolean
}

const MAX_PROBED_PEOPLE = 20

/** S3c 还有谁能看到: who my public profile lists, and who I gave access to by name. */
export function useWhoCanSeeMe(): WhoCanSeeMe {
  const { session } = useSession()
  const ownerWebId = session.info.webId ?? null
  const contacts = useLiveQuery(contactCollection)

  const people = useMemo(() => {
    const byWebId = new Map<string, string>()
    for (const row of (contacts.data ?? []) as ContactRow[]) {
      if (!row?.id || row.deletedAt || isGroupContact(row) || isAgentContact(row)) continue
      if (!/^https?:\/\//i.test(row.about ?? '')) continue
      byWebId.set(row.about as string, row.alias?.trim() || row.name?.trim() || '')
    }
    return byWebId
  }, [contacts.data])

  const peopleKey = [...people.keys()].join('|')

  const knows = useQuery({
    queryKey: ['profile', 'public-knows', ownerWebId],
    enabled: !!ownerWebId,
    staleTime: 30_000,
    queryFn: () => readPublicKnows({ authFetch: contactOps.getAuthFetch(), ownerWebId: ownerWebId as string }),
  })

  const shared = useQuery({
    queryKey: ['profile', 'shared-with-people', ownerWebId, peopleKey],
    enabled: !!ownerWebId && people.size > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const authFetch = contactOps.getAuthFetch()
      const spaceRootUrl = contactOps.getSpaceRootUrl()
      let count = 0
      for (const webId of [...people.keys()].slice(0, MAX_PROBED_PEOPLE)) {
        const probe = await probeContactAccess({ authFetch, contactWebId: webId, spaceRootUrl, ownerWebId })
        if (probe.items.some((item) => item.place === 'space' && hasAnyAccess(item.agent))) count += 1
      }
      return count
    },
  })

  const publicContacts = useMemo<PublicContactEntry[] | null>(() => {
    if (!knows.data) return knows.isLoading ? null : knows.data ?? null
    return knows.data.map((webId) => ({
      webId,
      name: people.get(webId) || formatAccountAddress(webId) || '联系人',
    }))
  }, [knows.data, knows.isLoading, people])

  return {
    publicContacts,
    sharedWithPeople: people.size === 0 ? 0 : shared.data ?? null,
    isLoading: knows.isLoading,
  }
}
