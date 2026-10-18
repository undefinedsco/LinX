/**
 * "记住" (W3 / W3b): one `as:Note` per remembered thing, in
 * `{agent home}/remembered.ttl` (spec §3.2). Nothing is written unless the
 * person presses the button on a message.
 *
 *   <#note-…> a as:Note ;
 *     as:content "…" ;
 *     dcterms:source <message> ;
 *     dcterms:created "…"^^xsd:dateTime ;
 *     dcterms:creator <webid> .
 *
 * A replaced note stays, with `dcterms:isReplacedBy <#new>`.
 */
import { getDatetime, getSolidDataset, getStringNoLocale, getThingAll, getUrl, getUrlAll, type Thing } from '@inrupt/solid-client'

export const AS_NOTE = 'https://www.w3.org/ns/activitystreams#Note'
export const AS_CONTENT = 'https://www.w3.org/ns/activitystreams#content'
export const DCT = 'http://purl.org/dc/terms/'
export const DCT_SOURCE = `${DCT}source`
export const DCT_CREATED = `${DCT}created`
export const DCT_CREATOR = `${DCT}creator`
export const DCT_IS_REPLACED_BY = `${DCT}isReplacedBy`
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const XSD_DATETIME = 'http://www.w3.org/2001/XMLSchema#dateTime'

export interface RememberedNote {
  uri: string
  content: string
  source: string | null
  created: string | null
  replacedBy: string | null
}

export type RememberResult =
  | { status: 'remembered'; noteUri: string }
  | { status: 'replaced'; noteUri: string; replacedUri: string; replacedContent: string }
  | { status: 'already'; noteUri: string }

export class RememberFailedError extends Error {
  constructor(readonly reason: 'forbidden' | 'offline' | 'unavailable') {
    super(reason === 'forbidden' ? '没有权限写入' : reason === 'offline' ? '没有网络' : '暂时写不进去')
    this.name = 'RememberFailedError'
  }
}

export function normalizeNote(text: string): string {
  return text.replace(/\s+/gu, ' ').trim()
}

/** A Turtle / SPARQL string literal. JSON escapes are valid in both. */
function literal(value: string): string {
  return JSON.stringify(value)
}

function readNote(thing: Thing): RememberedNote | null {
  const content = getStringNoLocale(thing, AS_CONTENT)
  if (content === null) return null
  return {
    uri: thing.url,
    content,
    source: getUrl(thing, DCT_SOURCE),
    created: getDatetime(thing, DCT_CREATED)?.toISOString() ?? null,
    replacedBy: getUrl(thing, DCT_IS_REPLACED_BY),
  }
}

export async function listRemembered(fileUrl: string, authFetch: typeof fetch): Promise<RememberedNote[]> {
  try {
    const dataset = await getSolidDataset(fileUrl, { fetch: authFetch })
    return getThingAll(dataset).flatMap((thing) => {
      if (!getUrlAll(thing, RDF_TYPE).includes(AS_NOTE)) return []
      const note = readNote(thing)
      return note ? [note] : []
    })
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) return []
    throw error
  }
}

function failure(error: unknown): RememberFailedError {
  if (error instanceof RememberFailedError) return error
  const status = (error as { statusCode?: number; status?: number })?.statusCode
    ?? (error as { status?: number })?.status
  if (status === 401 || status === 403) return new RememberFailedError('forbidden')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new RememberFailedError('offline')
  if (error instanceof TypeError) return new RememberFailedError('offline')
  return new RememberFailedError('unavailable')
}

async function ensureFile(fileUrl: string, authFetch: typeof fetch): Promise<void> {
  const response = await authFetch(fileUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle', 'If-None-Match': '*' },
    body: '',
  })
  if (!response.ok && response.status !== 412) {
    throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
  }
}

async function sparqlUpdate(fileUrl: string, authFetch: typeof fetch, update: string): Promise<void> {
  const response = await authFetch(fileUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/sparql-update' },
    body: update,
  })
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
}

export interface RememberInput {
  fileUrl: string
  authFetch: typeof fetch
  content: string
  /** The message the note came from. */
  sourceUri: string
  creatorWebId: string
  /** An earlier note this one contradicts: kept, marked as replaced. */
  replaces?: string
  now?: Date
}

export async function rememberNote(input: RememberInput): Promise<RememberResult> {
  const content = input.content.trim()
  if (!content) throw new RememberFailedError('unavailable')
  try {
    const existing = await listRemembered(input.fileUrl, input.authFetch).catch((error) => {
      if ((error as { statusCode?: number }).statusCode === 404) return []
      throw error
    })
    const same = existing.find((note) => !note.replacedBy && normalizeNote(note.content) === normalizeNote(content))
    if (same) return { status: 'already', noteUri: same.uri }

    await ensureFile(input.fileUrl, input.authFetch)
    const noteUri = `${input.fileUrl}#note-${crypto.randomUUID()}`
    const created = (input.now ?? new Date()).toISOString()
    const replaced = input.replaces ? existing.find((note) => note.uri === input.replaces) : undefined
    const triples = [
      `<${noteUri}> a <${AS_NOTE}> ;`,
      `  <${AS_CONTENT}> ${literal(content)} ;`,
      `  <${DCT_SOURCE}> <${input.sourceUri}> ;`,
      `  <${DCT_CREATED}> "${created}"^^<${XSD_DATETIME}> ;`,
      `  <${DCT_CREATOR}> <${input.creatorWebId}> .`,
      ...(replaced ? [`<${replaced.uri}> <${DCT_IS_REPLACED_BY}> <${noteUri}> .`] : []),
    ]
    await sparqlUpdate(input.fileUrl, input.authFetch, `INSERT DATA { ${triples.join('\n')} }`)
    return replaced
      ? { status: 'replaced', noteUri, replacedUri: replaced.uri, replacedContent: replaced.content }
      : { status: 'remembered', noteUri }
  } catch (error) {
    throw failure(error)
  }
}

/** "撤销": removes the note again; an earlier note it replaced is live again. */
export async function forgetNote(input: {
  fileUrl: string
  authFetch: typeof fetch
  noteUri: string
  replacedUri?: string
}): Promise<void> {
  try {
    const statements = [`DELETE WHERE { <${input.noteUri}> ?p ?o };`]
    if (input.replacedUri) {
      statements.push(`DELETE DATA { <${input.replacedUri}> <${DCT_IS_REPLACED_BY}> <${input.noteUri}> }`)
    }
    await sparqlUpdate(input.fileUrl, input.authFetch, statements.join('\n'))
  } catch (error) {
    throw failure(error)
  }
}
