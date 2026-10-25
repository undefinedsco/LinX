import { getContainedResourceUrlAll, getSolidDataset, getThing, getUrl } from '@inrupt/solid-client'
import { profileDocumentUrl } from '../domain/account-address'
import { sharedItemsFromListing, type SharedWithMeItem } from '../domain/shared-with-me'

const PIM_STORAGE = 'http://www.w3.org/ns/pim/space#storage'

export interface SharedWithMePerson {
  name: string
  webId: string
}

/** Where a person's space starts: `pim:storage` in their profile, else the folder above `profile/`. */
async function resolveSpaceRoot(authFetch: typeof fetch, webId: string): Promise<string | null> {
  try {
    const dataset = await getSolidDataset(profileDocumentUrl(webId), { fetch: authFetch })
    const storage = getThing(dataset, webId) ? getUrl(getThing(dataset, webId)!, PIM_STORAGE) : null
    if (storage) return storage.endsWith('/') ? storage : `${storage}/`
  } catch {
    // Fall through to the address shape.
  }
  try {
    const url = new URL(webId)
    const index = url.pathname.indexOf('/profile/')
    if (index < 0) return null
    return `${url.origin}${url.pathname.slice(0, index + 1)}`
  } catch {
    return null
  }
}

/** What one person's space lists for me; empty when it cannot be read. */
export async function readSharedByPerson(authFetch: typeof fetch, person: SharedWithMePerson): Promise<SharedWithMeItem[]> {
  const root = await resolveSpaceRoot(authFetch, person.webId)
  if (!root) return []
  try {
    const dataset = await getSolidDataset(root, { fetch: authFetch })
    return sharedItemsFromListing(person.name, getContainedResourceUrlAll(dataset))
      .map((item) => ({ ...item, ownerWebId: person.webId }))
  } catch {
    return []
  }
}

/** At most `limit` people are asked, a few at a time, so opening Files stays light. */
export async function readSharedWithMe(input: {
  authFetch: typeof fetch
  people: readonly SharedWithMePerson[]
  ownWebId?: string | null
  limit?: number
}): Promise<SharedWithMeItem[]> {
  const people = input.people.filter((person) => person.webId !== input.ownWebId).slice(0, input.limit ?? 30)
  const results: SharedWithMeItem[][] = []
  for (let index = 0; index < people.length; index += 5) {
    const batch = people.slice(index, index + 5)
    results.push(...await Promise.all(batch.map((person) => readSharedByPerson(input.authFetch, person))))
  }
  return results.flat()
}
