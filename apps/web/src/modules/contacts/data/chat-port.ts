import type { ChatRow, SolidDatabase, ThreadRow } from '@undefineds.co/models'

export interface ContactsMatrixAuthOptions {
  authFetch: typeof fetch
}

export interface ContactsMatrixGroupRoomResult {
  roomId: string
  chatId: string
  chatUri: string
  threadId: string
  threadUri: string
}

export interface ContactsChatPort {
  chatCollection: any
  threadCollection: any
  useSelectChat(): (chatId: string) => void
  createMatrixGroupRoom(input: {
    db: SolidDatabase
    authFetch: typeof fetch
    name: string
    participants: string[]
    ownerRef?: string
  }): Promise<ContactsMatrixGroupRoomResult>
  loadMatrixChatRow(db: SolidDatabase, chatId: string): Promise<ChatRow | null>
  loadMatrixThreadRow(db: SolidDatabase, threadId: string): Promise<ThreadRow | null>
}

let contactsChatPort: ContactsChatPort | null = null

export function configureContactsChatPort(port: ContactsChatPort): void {
  contactsChatPort = port
}

export function getContactsChatPort(): ContactsChatPort {
  if (!contactsChatPort) {
    throw new Error('Contacts Chat port is not configured.')
  }
  return contactsChatPort
}

export function getContactsChatCollection(): any {
  return getContactsChatPort().chatCollection
}

export function useContactsChatSelection(): (chatId: string) => void {
  return getContactsChatPort().useSelectChat()
}
