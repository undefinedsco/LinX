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

const SIOC_HAS_MEMBER = 'http://rdfs.org/sioc/ns#has_member'

function documentUrlFromIri(iri: string): string {
  const hashIndex = iri.indexOf('#')
  return hashIndex >= 0 ? iri.slice(0, hashIndex) : iri
}

function readBindingIri(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (
    value
    && typeof value === 'object'
    && 'value' in value
    && typeof (value as { value?: unknown }).value === 'string'
  ) {
    return (value as { value: string }).value
  }
  return null
}

async function queryExactThreadMembers(
  db: SolidDatabase,
  chatIri: string,
  threadIri: string,
): Promise<MessageRow[] | null> {
  const dialect = (db as any).getDialect?.()
  const executeOnResource = dialect?.executeOnResource
  const findByIri = (db as any).findByIri
  if (typeof executeOnResource !== 'function' || typeof findByIri !== 'function') {
    return null
  }

  const podUrl = dialect?.getPodUrl?.()
  const sparqlEndpoint = typeof podUrl === 'string'
    ? new URL('.data/chat/-/sparql', podUrl).toString()
    : null
  const rows = await executeOnResource.call(
    dialect,
    sparqlEndpoint ?? documentUrlFromIri(threadIri),
    {
      type: 'SELECT',
      query: `SELECT DISTINCT ?message WHERE {
        GRAPH ?graph { <${threadIri}> <${SIOC_HAS_MEMBER}> ?message . }
      }`,
      prefixes: {},
    },
    sparqlEndpoint
      ? { mode: 'sparql', endpoint: sparqlEndpoint }
      : undefined,
  ) as Array<{ message?: unknown }>
  const messageIris = [...new Set(
    rows.map((row) => readBindingIri(row.message)).filter((iri): iri is string => Boolean(iri)),
  )]
  // The Message writer stores `sioc:has_member` alongside each date-sharded
  // Message document. Older Thread index documents therefore contain no
  // membership triples even though the timeline is populated. Treat an empty
  // exact lookup as inconclusive so the Chat-scoped collection query can
  // discover those shards.
  if (messageIris.length === 0) return null

  const messages = await Promise.all(messageIris.map(
    (iri) => findByIri.call(db, messageResource as any, iri) as Promise<MessageRow | null>,
  ))
  return messages
    .filter((row): row is MessageRow => Boolean(row))
    .map((row) => ({
      ...row,
      chat: chatIri,
      thread: threadIri,
    }))
}

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
  if (threadIri) {
    try {
      const exactRows = await queryExactThreadMembers(db, chatIri, threadIri)
      if (exactRows !== null) {
        return exactRows
      }
    } catch (error) {
      // Older dialects do not expose exact-resource queries. Keep the scoped
      // collection query as a compatibility fallback.
      console.warn('[message-query] Exact Thread member lookup failed:', error)
    }
  }

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
