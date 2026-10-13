/**
 * Reads and changes what a contact can do in my space, using the Solid
 * access-control helpers from @inrupt/solid-client (WAC and ACP).
 *
 * Only places LinX can check without an index are probed: the space root and
 * the public profile. Shares on single files are managed from Files.
 */

import { getSolidDataset, getThing, getUrlAll, universalAccess } from '@inrupt/solid-client'
import { profileDocumentUrl } from '../domain/account-address'
import type {
  AccessModes,
  ContactAccessPlace,
  ContactAccessProbe,
  ContactAccessProbeItem,
} from '../domain/contact-access'
import { hasAnyAccess } from '../domain/contact-access'

const FOAF_KNOWS = 'http://xmlns.com/foaf/0.1/knows'

export interface ContactAccessProbeInput {
  authFetch: typeof fetch
  contactWebId: string
  spaceRootUrl: string | null
  ownerWebId: string | null
}

function placesToProbe(input: ContactAccessProbeInput): Array<{ place: ContactAccessPlace; url: string }> {
  const places: Array<{ place: ContactAccessPlace; url: string }> = []
  if (input.spaceRootUrl) {
    places.push({ place: 'space', url: `${input.spaceRootUrl.replace(/\/+$/, '')}/` })
  }
  if (input.ownerWebId) {
    places.push({ place: 'profile', url: profileDocumentUrl(input.ownerWebId) })
  }
  return places
}

async function readOrNull(read: () => Promise<AccessModes | null>): Promise<AccessModes | null> {
  try {
    return await read()
  } catch {
    return null
  }
}

export async function probeContactAccess(input: ContactAccessProbeInput): Promise<ContactAccessProbe> {
  const options = { fetch: input.authFetch }
  const items = await Promise.all(placesToProbe(input).map(async ({ place, url }): Promise<ContactAccessProbeItem> => {
    const [agent, everyone] = await Promise.all([
      readOrNull(() => universalAccess.getAgentAccess(url, input.contactWebId, options)),
      readOrNull(() => universalAccess.getPublicAccess(url, options)),
    ])
    return { place, url, agent, public: everyone }
  }))
  return { items }
}

const NO_ACCESS = {
  read: false,
  append: false,
  write: false,
  controlRead: false,
  controlWrite: false,
} as const

export interface RevokeContactAccessResult {
  revoked: number
  failed: number
}

/** Takes back every grant this person holds by name in the probed places. */
export async function revokeContactAccess(input: {
  authFetch: typeof fetch
  contactWebId: string
  items: readonly ContactAccessProbeItem[]
}): Promise<RevokeContactAccessResult> {
  let revoked = 0
  let failed = 0
  for (const item of input.items) {
    if (!hasAnyAccess(item.agent)) continue
    try {
      const result = await universalAccess.setAgentAccess(item.url, input.contactWebId, NO_ACCESS, { fetch: input.authFetch })
      if (result === null || hasAnyAccess(result)) failed += 1
      else revoked += 1
    } catch {
      failed += 1
    }
  }
  return { revoked, failed }
}

/**
 * People listed in my public profile (foaf:knows). Returns null when the
 * profile cannot be read.
 */
export async function readPublicKnows(input: {
  authFetch: typeof fetch
  ownerWebId: string
}): Promise<string[] | null> {
  try {
    const dataset = await getSolidDataset(profileDocumentUrl(input.ownerWebId), { fetch: input.authFetch })
    const me = getThing(dataset, input.ownerWebId)
    return me ? getUrlAll(me, FOAF_KNOWS) : []
  } catch {
    return null
  }
}

function escapeIri(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only HTTP(S) accounts can be listed')
  return url.href.replace(/[<>"{}|\\^`\s]/g, (character) => encodeURIComponent(character))
}

/** Adds or removes `<me> foaf:knows <them>` in my public profile. */
export async function setPublicKnows(input: {
  authFetch: typeof fetch
  ownerWebId: string
  contactWebId: string
  show: boolean
}): Promise<void> {
  const triple = `<${escapeIri(input.ownerWebId)}> <${FOAF_KNOWS}> <${escapeIri(input.contactWebId)}> .`
  const response = await input.authFetch(profileDocumentUrl(input.ownerWebId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/sparql-update' },
    body: input.show ? `INSERT DATA { ${triple} }` : `DELETE DATA { ${triple} }`,
  })
  if (!response.ok) {
    throw new Error(`Public profile update failed with HTTP ${response.status}`)
  }
}
