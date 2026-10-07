import type { AgentRow, ContactRow } from '@undefineds.co/models'

export interface ChatContactsPort {
  agentCollection: ChatContactCollection<AgentRow>
  contactCollection: ChatContactCollection<ContactRow>
}

export type ChatContactCollection<T extends { id: string }> = {
  readonly state: Map<string, T>
  get(id: string): T | undefined
  insert(row: T): any
  update(id: string, updater: (draft: T) => void): any
  delete(id: string): any
  fetch(): Promise<T[]>
  subscribeToPod(db: unknown): Promise<() => void>
}

export let agentCollection: ChatContactCollection<AgentRow>
export let contactCollection: ChatContactCollection<ContactRow>

export function configureChatContactsPort(port: ChatContactsPort): void {
  agentCollection = port.agentCollection
  contactCollection = port.contactCollection
}
