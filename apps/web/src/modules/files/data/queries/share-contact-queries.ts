import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { isAgentContact, isGroupContact, type ContactRow } from '@undefineds.co/models'

import { displayAssistantName } from '@/lib/assistant-name'
import { contactCollection } from '@/modules/contacts'
import { parseAccountInput } from '@/modules/contacts/domain/account-address'
import { contactDisplayName } from '@/modules/contacts/domain/contact-display-name'

export interface ShareContact {
  id: string
  webId: string
  name: string
  isAssistant: boolean
}

/** People (and assistants) the sharing dialog can offer, from the person's contacts. */
export function useShareContacts() {
  const query = useLiveQuery(contactCollection)
  return useMemo(() => {
    const contacts: ShareContact[] = []
    for (const row of (query.data ?? []) as ContactRow[]) {
      if (!row?.id || row.deletedAt || isGroupContact(row) || !row.about) continue
      const isAssistant = isAgentContact(row)
      const stored = contactDisplayName(row)
      contacts.push({
        id: row.id,
        webId: row.about,
        name: isAssistant ? displayAssistantName(stored) : stored,
        isAssistant,
      })
    }
    contacts.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
    const names = new Map(contacts.map((contact) => [contact.webId, contact.name]))
    return { contacts, names }
  }, [query.data])
}

/** Accepts "名字@提供方" or a full address and returns the WebID, or null when it is not an account. */
export function parseShareAccountInput(raw: string): string | null {
  const parsed = parseAccountInput(raw)
  return parsed.kind === 'ok' ? parsed.webId : null
}
