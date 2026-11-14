import type { ChatRow, SolidDatabase, ThreadRow } from '@undefineds.co/models'

/**
 * Structural view of the chat module's scoped Matrix access. Contacts must not
 * import the chat module directly; the shape is kept compatible so the port
 * continues to receive the same object.
 */
export interface ContactsMatrixInterfaceAccess {
  get(): {
    apiKey: string
    webId: string
    accountOrigin: string
    origin: string
    resource?: string
  } | null
  authorize(): Promise<{
    apiKey: string
    webId: string
    accountOrigin: string
    origin: string
    resource?: string
  }>
  importAuthorization(input: {
    apiKey?: string
    clientId?: string
    clientSecret?: string
  }): Promise<{
    apiKey: string
    webId: string
    accountOrigin: string
    origin: string
    resource?: string
  }>
  accountOrigin(): string | null
  release(): Promise<void>
}

export interface ContactsMatrixAuthOptions {
  /** Browser-owned Pod interface credential, scoped to the Pod origin. */
  access: ContactsMatrixInterfaceAccess
  /** Test seam; production uses the DB dialect's DPoP-authenticated fetch. */
  grantRoomAccess?: (input: {
    roomContainerUri: string
    participants: string[]
    ownerWebId: string
  }) => Promise<{
    roomContainerUri: string
    aclUri: string
    grantedWebIds: string[]
  }>
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
    access: ContactsMatrixInterfaceAccess
    name: string
    participants: string[]
    ownerRef?: string
    grantRoomAccess?: (input: {
      roomContainerUri: string
      participants: string[]
      ownerWebId: string
    }) => Promise<{
      roomContainerUri: string
      aclUri: string
      grantedWebIds: string[]
    }>
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
