import type { ContactRow } from '@undefineds.co/models'

type NamedContact = Pick<ContactRow, 'alias' | 'name'>

/** How a saved contact is shown: remark (备注) -> contact name; empty when neither is set. */
export function contactDisplayName(contact: NamedContact | null | undefined): string {
  return contact?.alias?.trim() || contact?.name?.trim() || ''
}
