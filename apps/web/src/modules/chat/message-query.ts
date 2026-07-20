import { eq } from '@undefineds.co/drizzle-solid'
import {
  messageResource,
  type MessageRow,
  type SolidDatabase,
} from '@undefineds.co/models'

type MessageCandidate = Pick<
  MessageRow,
  'id' | 'parent' | 'role' | 'content' | 'richContent' | 'status' | 'metadata' | 'createdAt'
>

/**
 * Query only the fields required to render and route a Chat message.
 *
 * The published models version still represents several Message relations as
 * OPTIONAL inverse predicates. Selecting the whole resource makes xpod build a
 * large OPTIONAL join before applying the Chat filter. On a populated Pod that
 * query can monopolize the CSS worker. Keeping this projection bounded avoids
 * resolving unrelated optional relations. `chat` is the same canonical parent
 * for Chat-owned messages and is restored without another inverse lookup.
 */
export async function queryMessageRowsForChat(
  db: SolidDatabase,
  chatIri: string,
  threadIri?: string,
): Promise<MessageRow[]> {
  const candidates = await db.select({
    id: messageResource.id,
    parent: (messageResource as any).parent,
    role: messageResource.role,
    content: messageResource.content,
    richContent: messageResource.richContent,
    status: messageResource.status,
    metadata: messageResource.metadata,
    createdAt: messageResource.createdAt,
  })
    .from(messageResource)
    .where(eq((messageResource as any).parent, chatIri))
    .execute() as MessageCandidate[]

  const rows = candidates.map((candidate) => ({
    ...candidate,
    chat: chatIri,
    thread: (candidate.metadata as any)?.reconciler?.latest?.thread ?? threadIri,
  })) as MessageRow[]

  // Older writers reused a nested metadata subject inside one document. That
  // can multiply one message into many equivalent SPARQL rows. ChatKit expects
  // stable item ids, so collapse those join duplicates at the query boundary.
  return [...new Map(rows.map((row) => [row.id, row])).values()]
}
