import type { Session } from '@inrupt/solid-client-authn-node'
import type { LinxSyncRunResult } from '@linx/agent-runtime/sync'
import {
  drizzle,
  solidResources,
  type SolidDatabase,
} from './models.js'

export interface PodChatStoreRuntime {
  createDb(session: Session): SolidDatabase
  now(): Date
  randomUUID(): string
  onSyncResult?(result: LinxSyncRunResult): void
}

function createPodChatStoreDb(session: Session): SolidDatabase {
  return drizzle(session, {
    logger: false,
    disableInteropDiscovery: true,
    resourcePreparation: 'best-effort' as never,
    schema: solidResources,
  }) as unknown as SolidDatabase
}

const defaultPodChatStoreRuntime: PodChatStoreRuntime = {
  createDb: createPodChatStoreDb,
  now: () => new Date(),
  randomUUID: () => crypto.randomUUID(),
}

let activePodChatStoreRuntime: PodChatStoreRuntime = defaultPodChatStoreRuntime
let podChatStoreSyncSeq = 0

export function getPodChatStoreRuntime(): PodChatStoreRuntime {
  return activePodChatStoreRuntime
}

export function setPodChatStoreRuntime(runtime: Partial<PodChatStoreRuntime> = {}): void {
  activePodChatStoreRuntime = {
    ...defaultPodChatStoreRuntime,
    ...runtime,
  }
}

export function resetPodChatStoreRuntime(): void {
  activePodChatStoreRuntime = defaultPodChatStoreRuntime
  podChatStoreSyncSeq = 0
}

export function recordPodChatStoreSyncResult(result: LinxSyncRunResult): void {
  activePodChatStoreRuntime.onSyncResult?.(result)
}

export function nextPodChatStoreSyncOperationId(input: {
  action: string
  chatId?: string
  threadId?: string
  messageId?: string
}): string {
  const subject = input.messageId ?? input.threadId ?? input.chatId ?? 'cli-chat'
  const timestamp = getPodChatStoreRuntime().now().toISOString().replace(/[:.]/g, '-')
  return `cli-chat-store:${input.action}:${subject}:${timestamp}:${++podChatStoreSyncSeq}`
}
