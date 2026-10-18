/**
 * Runtime-managed thread switching (applies `threadRolloverReason`).
 *
 * Called right before a message is sent. If the chat's current internal thread
 * is too long or has been idle for long, a successor thread is created that:
 *  - shares the workspace of the old one (so project context carries over), and
 *  - stores a short "where we left off" note in its existing `metadata` field:
 *    `handoff_summary` (text) and `continues_thread` (the old thread's id).
 * The local chat service adds that note to the assistant's context (service.ts,
 * `buildConversationHistory`). Nothing here is visible in the UI.
 */
import type { MessageRow, ThreadRow } from '@undefineds.co/models'
import { chatOps, messageRowMatchesThread } from '../../collections'
import {
  THREAD_HANDOFF_METADATA,
  buildHandoffSummary,
  estimateTokens,
  pickSendThread,
  threadRolloverReason,
  type ThreadLoad,
} from '../../domain/chat-threads'

/** Text of a stored message row (rich content is a separate field; `content` is the plain text). */
function rowText(row: Pick<MessageRow, 'content'>): string {
  return typeof row.content === 'string' ? row.content : ''
}

export function threadLoadOf(rows: readonly MessageRow[], threadId: string): ThreadLoad {
  let messageCount = 0
  let estimatedTokens = 0
  let last = 0
  for (const row of rows) {
    if (!messageRowMatchesThread(row.thread, threadId)) continue
    messageCount += 1
    estimatedTokens += estimateTokens(rowText(row))
    const at = row.createdAt ? new Date(row.createdAt as string | Date).getTime() : 0
    if (at > last) last = at
  }
  return { messageCount, estimatedTokens, lastMessageAt: last || undefined }
}

export interface RolloverInput {
  chatId: string
  /** Local id of the thread new messages currently go to. */
  currentThreadId: string
  threads: readonly ThreadRow[]
  rows: readonly MessageRow[]
  now?: number
}

/** Creates the successor thread when one is due; returns its id, or null to stay. */
export async function rolloverThreadIfNeeded(input: RolloverInput): Promise<string | null> {
  const current = input.threads.find((thread) => thread.id === input.currentThreadId)
    ?? pickSendThread(input.threads)
  if (!current?.id) return null
  const load = threadLoadOf(input.rows, current.id)
  const reason = threadRolloverReason(current, load, input.now ?? Date.now())
  if (!reason) return null

  const summary = buildHandoffSummary(input.rows
    .filter((row) => messageRowMatchesThread(row.thread, current.id!))
    .map((row) => ({ role: row.role, text: rowText(row), createdAt: row.createdAt })))
  const created = await chatOps.createThread(input.chatId, current.title || undefined)
  await chatOps.updateThread(created.id, {
    metadata: {
      ...(summary ? { [THREAD_HANDOFF_METADATA.summary]: summary } : {}),
      [THREAD_HANDOFF_METADATA.continues]: current.id,
    },
  } as Partial<ThreadRow>)
  await chatOps.ensureThreadWorkspace({
    threadId: created.id,
    ...(current.workspace ? { workspaceUri: current.workspace } : {}),
    title: current.title || undefined,
  }).catch((error) => console.error('Bind workspace for the next thread failed:', error))
  return created.id
}
