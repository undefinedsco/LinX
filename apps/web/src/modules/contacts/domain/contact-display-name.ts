import type { ContactRow } from '@undefineds.co/models'

type NamedContact = Pick<ContactRow, 'alias' | 'name'>

/** How a saved contact is shown: remark (备注) -> contact name; empty when neither is set. */
export function contactDisplayName(contact: NamedContact | null | undefined): string {
  return contact?.alias?.trim() || contact?.name?.trim() || ''
}

/**
 * Display name for a person by WebID: remark -> contact name -> `fallback`
 * (profile name or a WebID-derived label, supplied by the caller).
 */
export function resolveWebIdDisplayName(
  webId: string,
  namesByWebId: ReadonlyMap<string, string>,
  fallback: string | ((webId: string) => string),
): string {
  return namesByWebId.get(webId)?.trim() || (typeof fallback === 'function' ? fallback(webId) : fallback)
}
