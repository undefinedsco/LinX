import { Parser, Writer } from 'n3'

export type PodFetch = (url: string, init?: RequestInit) => Promise<Response>

export type TurtleObject =
  | { type: 'iri'; value: string }
  | { type: 'literal'; value: string; datatype?: string }
  | { type: 'integer'; value: number }

export interface TurtlePredicate {
  predicate: string
  object: TurtleObject
}

export interface ManagedTurtleBlock {
  subject: string
  triples: TurtlePredicate[]
  extraStatements?: string[]
}

export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
export const XSD_DATE_TIME = 'http://www.w3.org/2001/XMLSchema#dateTime'
export const DCT_CREATED = 'http://purl.org/dc/terms/created'
export const DCT_MODIFIED = 'http://purl.org/dc/terms/modified'
export const DCT_TITLE = 'http://purl.org/dc/terms/title'
export const FOAF_MAKER = 'http://xmlns.com/foaf/0.1/maker'
export const SIOC_CONTENT = 'http://rdfs.org/sioc/ns#content'
export const SIOC_RICH_CONTENT = 'http://rdfs.org/sioc/ns#richContent'
export const SIOC_HAS_MEMBER = 'http://rdfs.org/sioc/ns#has_member'
export const MEETING_LONG_CHAT = 'http://www.w3.org/ns/pim/meeting#LongChat'
export const MEETING_MESSAGE = 'http://www.w3.org/ns/pim/meeting#Message'
export const SIOC_THREAD = 'http://rdfs.org/sioc/ns#Thread'
export const WF_MESSAGE = 'http://www.w3.org/2005/01/wf/flow-1.0#message'
export const UDFS_AGENT = 'https://undefineds.co/ns#Agent'
export const UDFS_AUDIT_ENTRY = 'https://undefineds.co/ns#AuditEntry'
export const UDFS_APPROVAL_REQUEST = 'https://undefineds.co/ns#ApprovalRequest'
export const UDFS_AUTONOMY_GRANT = 'https://undefineds.co/ns#AutonomyGrant'
export const UDFS_SESSION = 'https://undefineds.co/ns#Session'
export const UDFS_ACTION = 'https://undefineds.co/ns#action'
export const UDFS_ACTOR = 'https://undefineds.co/ns#actor'
export const UDFS_ACTOR_ROLE = 'https://undefineds.co/ns#actorRole'
export const UDFS_CHAT_TYPE = 'https://undefineds.co/ns#chatType'
export const UDFS_CONTEXT = 'https://undefineds.co/ns#context'
export const UDFS_CONVERSATION = 'https://undefineds.co/ns#conversation'
export const UDFS_CONVERSATION_TITLE = 'https://undefineds.co/ns#conversationTitle'
export const UDFS_CONVERSATION_TYPE = 'https://undefineds.co/ns#conversationType'
export const UDFS_HAS_THREAD = 'https://undefineds.co/ns#hasThread'
export const UDFS_IN_THREAD = 'https://undefineds.co/ns#inThread'
export const UDFS_LAST_ACTIVE_AT = 'https://undefineds.co/ns#lastActiveAt'
export const UDFS_MESSAGE_STATUS = 'https://undefineds.co/ns#messageStatus'
export const UDFS_MESSAGE_TYPE = 'https://undefineds.co/ns#messageType'
export const UDFS_METADATA = 'https://undefineds.co/ns#metadata'
export const UDFS_MODEL = 'https://undefineds.co/ns#model'
export const UDFS_ON_BEHALF_OF = 'https://undefineds.co/ns#onBehalfOf'
export const UDFS_ASSIGNED_TO = 'https://undefineds.co/ns#assignedTo'
export const UDFS_DECISION_BY = 'https://undefineds.co/ns#decisionBy'
export const UDFS_DECISION_ROLE = 'https://undefineds.co/ns#decisionRole'
export const UDFS_EFFECT = 'https://undefineds.co/ns#effect'
export const UDFS_POLICY_VERSION = 'https://undefineds.co/ns#policyVersion'
export const UDFS_PROVIDER = 'https://undefineds.co/ns#provider'
export const UDFS_REASON = 'https://undefineds.co/ns#reason'
export const UDFS_RESOLVED_AT = 'https://undefineds.co/ns#resolvedAt'
export const UDFS_REVOKED_AT = 'https://undefineds.co/ns#revokedAt'
export const UDFS_RISK = 'https://undefineds.co/ns#risk'
export const UDFS_RISK_CEILING = 'https://undefineds.co/ns#riskCeiling'
export const UDFS_SESSION_STATUS = 'https://undefineds.co/ns#sessionStatus'
export const UDFS_SESSION_TOOL = 'https://undefineds.co/ns#sessionTool'
export const UDFS_STATUS = 'https://undefineds.co/ns#status'
export const UDFS_TOKEN_USAGE = 'https://undefineds.co/ns#tokenUsage'
export const UDFS_TOOL_CALL_ID = 'https://undefineds.co/ns#toolCallId'
export const UDFS_TOOL_NAME = 'https://undefineds.co/ns#toolName'
export const UDFS_WORKSPACE = 'https://undefineds.co/ns#workspace'
export const ODRL_ACTION = 'http://www.w3.org/ns/odrl/2/action'
export const ODRL_POLICY = 'http://www.w3.org/ns/odrl/2/Policy'
export const ODRL_TARGET = 'http://www.w3.org/ns/odrl/2/target'
export const AS_ANNOUNCE = 'https://www.w3.org/ns/activitystreams#Announce'
export const AS_ACTOR = 'https://www.w3.org/ns/activitystreams#actor'
export const AS_OBJECT = 'https://www.w3.org/ns/activitystreams#object'

const MANAGED_BEGIN = '# linx-managed-subject:'
const MANAGED_END = '# /linx-managed-subject'

export function podBaseUrlFromWebId(webId: string): string {
  return webId.replace('/profile/card#me', '').replace(/\/$/, '')
}

export function buildSessionResourceUrl(webId: string, sessionId: string): string {
  return `${podBaseUrlFromWebId(webId)}/.data/session/${encodeURIComponent(sessionId)}.ttl`
}

export function buildAuditResourceUrl(webId: string, auditId: string): string {
  return `${podBaseUrlFromWebId(webId)}/.data/audit/${encodeURIComponent(auditId)}.ttl`
}

export function buildApprovalResourceUrl(webId: string, approvalId: string): string {
  return `${podBaseUrlFromWebId(webId)}/.data/approvals/${encodeURIComponent(approvalId)}.ttl`
}

export function buildGrantResourceUrl(webIdOrUri: string, grantId: string): string {
  return `${podBaseUrlFromWebIdOrUri(webIdOrUri)}/settings/autonomy/grants/${encodeURIComponent(grantId)}.ttl`
}

export function buildInboxResourceUrl(webIdOrUri: string, notificationId: string): string {
  return `${podBaseUrlFromWebIdOrUri(webIdOrUri)}/inbox/${encodeURIComponent(notificationId)}.ttl`
}

export function buildAgentResourceUrl(webId: string, agentId: string): string {
  return `${podBaseUrlFromWebId(webId)}/.data/agents/${encodeURIComponent(agentId)}.ttl`
}

export function buildChatIndexResourceUrl(webId: string, chatId: string): string {
  return `${podBaseUrlFromWebId(webId)}/.data/chat/${encodeURIComponent(chatId)}/index.ttl`
}

export function buildMessageResourceUrl(webId: string, chatId: string, createdAt: Date): string {
  const yyyy = String(createdAt.getUTCFullYear())
  const mm = String(createdAt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(createdAt.getUTCDate()).padStart(2, '0')
  return `${podBaseUrlFromWebId(webId)}/.data/chat/${encodeURIComponent(chatId)}/${yyyy}/${mm}/${dd}/messages.ttl`
}

export function buildMessageSubjectUrl(resourceUrl: string, messageId: string): string {
  return `${resourceUrl}#${encodeURIComponent(messageId)}`
}

export function iri(value: string): TurtleObject {
  return { type: 'iri', value }
}

export function literal(value: string, datatype?: string): TurtleObject {
  return { type: 'literal', value, datatype }
}

export function dateLiteral(value: Date): TurtleObject {
  return literal(value.toISOString(), XSD_DATE_TIME)
}

export function integerLiteral(value: number): TurtleObject {
  return { type: 'integer', value: Number.isFinite(value) ? Math.trunc(value) : 0 }
}

export async function readTurtleResource(fetcher: PodFetch, url: string): Promise<string | null> {
  const response = await fetcher(url, {
    method: 'GET',
    headers: { Accept: 'text/turtle, application/n-triples;q=0.9, */*;q=0.1' },
  })
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`Failed to read Pod resource ${url}: ${response.status} ${response.statusText}`)
  }
  return response.text()
}

export async function putTurtleResource(fetcher: PodFetch, url: string, turtle: string): Promise<void> {
  await ensureResourceContainers(fetcher, url)
  const response = await fetcher(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle; charset=utf-8' },
    body: turtle.endsWith('\n') ? turtle : `${turtle}\n`,
  })
  if (!response.ok) {
    throw new Error(`Failed to write Pod resource ${url}: ${response.status} ${response.statusText}`)
  }
}

export async function upsertManagedTurtleBlock(
  fetcher: PodFetch,
  url: string,
  block: ManagedTurtleBlock,
): Promise<void> {
  await ensureResourceContainers(fetcher, url)
  const existing = await readTurtleResource(fetcher, url).catch((error) => {
    if (isNotFoundError(error)) {
      return null
    }
    throw error
  })
  const turtle = mergeManagedBlock(existing ?? '', block)
  await putTurtleResource(fetcher, url, turtle)
}

export async function deleteManagedTurtleSubject(
  fetcher: PodFetch,
  url: string,
  subject: string,
): Promise<void> {
  const existing = await readTurtleResource(fetcher, url).catch((error) => {
    if (isNotFoundError(error)) {
      return null
    }
    throw error
  })
  if (!existing) {
    return
  }

  const encoded = encodeURIComponent(subject)
  const pattern = new RegExp(
    `${escapeRegExp(MANAGED_BEGIN)} ${escapeRegExp(encoded)}\\n[\\s\\S]*?${escapeRegExp(MANAGED_END)}\\n?`,
    'g',
  )
  const withoutManagedBlock = existing.replace(pattern, '').trim()
  const withoutSubject = removeStandardTriplesForSubject(withoutManagedBlock, subject).trim()
  await putTurtleResource(fetcher, url, withoutSubject ? `${withoutSubject}\n` : '')
}

export function mergeManagedBlock(existing: string, block: ManagedTurtleBlock): string {
  const encoded = encodeURIComponent(block.subject)
  const blockText = renderManagedBlock(block)
  const pattern = new RegExp(
    `${escapeRegExp(MANAGED_BEGIN)} ${escapeRegExp(encoded)}\\n[\\s\\S]*?${escapeRegExp(MANAGED_END)}\\n?`,
    'g',
  )
  const withoutPreviousManagedBlock = existing.replace(pattern, '').trim()
  const withoutPrevious = removeStandardTriplesForSubject(withoutPreviousManagedBlock, block.subject).trim()
  return [withoutPrevious, blockText].filter(Boolean).join('\n\n')
}

export function renderManagedBlock(block: ManagedTurtleBlock): string {
  const encoded = encodeURIComponent(block.subject)
  const lines = [`${MANAGED_BEGIN} ${encoded}`]
  const predicates = [
    ...block.triples,
    ...(block.extraStatements ?? []).map((statement) => ({ statement })),
  ]
  const tripleLines = block.triples.map((triple, index) => {
    const suffix = index === block.triples.length - 1 && !block.extraStatements?.length ? ' .' : ' ;'
    return `  <${triple.predicate}> ${renderTurtleObject(triple.object)}${suffix}`
  })
  lines.push(`<${block.subject}>`)
  lines.push(...tripleLines)
  if (block.extraStatements?.length) {
    if (tripleLines.length > 0) {
      const lastTripleIndex = lines.length - 1
      lines[lastTripleIndex] = lines[lastTripleIndex].replace(/\s;$/, ' .')
    }
    lines.push(...block.extraStatements.map((statement) => (
      statement.trim().endsWith('.') ? statement.trim() : `${statement.trim()} .`
    )))
  }
  if (predicates.length === 0) {
    lines.push('  .')
  }
  lines.push(MANAGED_END)
  return `${lines.join('\n')}\n`
}

export function parseManagedTurtleBlocks(turtle: string, baseIRI?: string): Map<string, Map<string, TurtleObject[]>> {
  const blocks = new Map<string, Map<string, TurtleObject[]>>()
  const regexp = new RegExp(
    `${escapeRegExp(MANAGED_BEGIN)} ([^\\n]+)\\n([\\s\\S]*?)${escapeRegExp(MANAGED_END)}`,
    'g',
  )
  let match: RegExpExecArray | null
  while ((match = regexp.exec(turtle))) {
    const subject = decodeURIComponent(match[1])
    const body = match[2]
    const predicates = new Map<string, TurtleObject[]>()
    const lineRegexp = /^ {2}<([^>]+)>\s+(.+?)\s*[;.]$/gm
    let lineMatch: RegExpExecArray | null
    while ((lineMatch = lineRegexp.exec(body))) {
      const object = parseTurtleObject(lineMatch[2])
      if (!object) {
        continue
      }
      const existing = predicates.get(lineMatch[1]) ?? []
      existing.push(object)
      predicates.set(lineMatch[1], existing)
    }
    blocks.set(subject, predicates)
  }
  for (const [subject, predicates] of parseStandardTurtleBlocks(turtle, baseIRI)) {
    const existing = blocks.get(subject) ?? new Map<string, TurtleObject[]>()
    for (const [predicate, objects] of predicates) {
      existing.set(predicate, [...(existing.get(predicate) ?? []), ...objects])
    }
    blocks.set(subject, existing)
  }
  return blocks
}

export function firstLiteral(
  predicates: Map<string, TurtleObject[]>,
  predicate: string,
): string | undefined {
  const object = predicates.get(predicate)?.[0]
  return object?.type === 'literal' ? object.value : undefined
}

export function firstIri(
  predicates: Map<string, TurtleObject[]>,
  predicate: string,
): string | undefined {
  const object = predicates.get(predicate)?.[0]
  return object?.type === 'iri' ? object.value : undefined
}

export function firstInteger(
  predicates: Map<string, TurtleObject[]>,
  predicate: string,
): number | undefined {
  const object = predicates.get(predicate)?.[0]
  return object?.type === 'integer' ? object.value : undefined
}

export function subjectIdFromResourceUrl(resourceUrl: string): string {
  return decodeURIComponent(resourceUrl.split('/').pop()?.replace(/\.ttl$/, '') ?? '')
}

export async function listTurtleResources(fetcher: PodFetch, containerUrl: string): Promise<string[]> {
  const response = await fetcher(containerUrl, {
    method: 'GET',
    headers: { Accept: 'text/turtle, application/ld+json;q=0.8, */*;q=0.1' },
  })
  if (response.status === 404) {
    return []
  }
  if (!response.ok) {
    throw new Error(`Failed to list Pod container ${containerUrl}: ${response.status} ${response.statusText}`)
  }
  const text = await response.text()
  const urls = new Set<string>()
  const absoluteRegexp = /https?:\/\/[^<>"'\s)]+\.ttl/g
  for (const match of text.matchAll(absoluteRegexp)) {
    urls.add(match[0])
  }
  const relativeRegexp = /[<"]([^<>"']+\.ttl)[>"]/g
  let relativeMatch: RegExpExecArray | null
  while ((relativeMatch = relativeRegexp.exec(text))) {
    urls.add(new URL(relativeMatch[1], containerUrl).toString())
  }
  return [...urls].sort()
}

async function ensureResourceContainers(fetcher: PodFetch, resourceUrl: string): Promise<void> {
  for (const containerUrl of containerUrlsForResource(resourceUrl)) {
    await ensureContainer(fetcher, containerUrl)
  }
}

async function ensureContainer(fetcher: PodFetch, containerUrl: string): Promise<void> {
  const existing = await fetcher(containerUrl, { method: 'HEAD' }).catch(() => null)
  if (existing?.ok) {
    return
  }
  if (existing && existing.status !== 404 && existing.status !== 405) {
    return
  }
  const response = await fetcher(containerUrl, {
    method: 'PUT',
    headers: {
      Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
      'Content-Type': 'text/turtle; charset=utf-8',
    },
    body: '',
  })
  if (!response.ok && response.status !== 409) {
    throw new Error(`Failed to ensure Pod container ${containerUrl}: ${response.status} ${response.statusText}`)
  }
}

function containerUrlsForResource(resourceUrl: string): string[] {
  const url = new URL(resourceUrl)
  const parts = url.pathname.split('/').filter(Boolean)
  const containers: string[] = []
  let path = '/'
  for (let index = 0; index < parts.length - 1; index += 1) {
    path += `${parts[index]}/`
    containers.push(new URL(path, url.origin).toString())
  }
  return containers
}

function podBaseUrlFromWebIdOrUri(webIdOrUri: string): string {
  if (webIdOrUri.includes('/profile/card#me')) {
    return podBaseUrlFromWebId(webIdOrUri)
  }
  const match = webIdOrUri.match(/^(https?:\/\/[^?#]+?)(?:\/\.data\/|\/settings\/|\/inbox\/)/u)
  if (match) {
    return match[1].replace(/\/$/, '')
  }
  return webIdOrUri.replace(/\/$/, '')
}

function renderTurtleObject(object: TurtleObject): string {
  if (object.type === 'iri') {
    return `<${object.value}>`
  }
  if (object.type === 'integer') {
    return String(object.value)
  }
  const datatype = object.datatype ? `^^<${object.datatype}>` : ''
  return `"${escapeLiteral(object.value)}"${datatype}`
}

function parseStandardTurtleBlocks(turtle: string, baseIRI?: string): Map<string, Map<string, TurtleObject[]>> {
  const blocks = new Map<string, Map<string, TurtleObject[]>>()
  const parser = new Parser(baseIRI ? { baseIRI } : undefined)
  let quads
  try {
    quads = parser.parse(turtle)
  } catch {
    return blocks
  }
  for (const quad of quads) {
    if (quad.subject.termType !== 'NamedNode' || quad.predicate.termType !== 'NamedNode') {
      continue
    }
    const object = turtleObjectFromTerm(quad.object)
    if (!object) {
      continue
    }
    const predicates = blocks.get(quad.subject.value) ?? new Map<string, TurtleObject[]>()
    const values = predicates.get(quad.predicate.value) ?? []
    values.push(object)
    predicates.set(quad.predicate.value, values)
    blocks.set(quad.subject.value, predicates)
  }
  return blocks
}

function removeStandardTriplesForSubject(turtle: string, subject: string): string {
  if (!turtle.trim()) {
    return ''
  }
  const baseIRI = subject.includes('#') ? subject.split('#')[0] : subject
  const parser = new Parser({ baseIRI })
  let quads
  try {
    quads = parser.parse(turtle)
  } catch {
    return turtle
  }
  const kept = quads.filter((quad) => (
    quad.subject.value !== subject
    && !(quad.object.termType === 'NamedNode' && quad.object.value === subject)
  ))
  if (kept.length === quads.length) {
    return turtle
  }
  const writer = new Writer()
  writer.addQuads(kept)
  let output = ''
  writer.end((error, result) => {
    output = error ? turtle : result
  })
  return output
}

function turtleObjectFromTerm(term: { termType: string; value: string; datatype?: { value: string } }): TurtleObject | null {
  if (term.termType === 'NamedNode') {
    return iri(term.value)
  }
  if (term.termType !== 'Literal') {
    return null
  }
  const datatype = term.datatype?.value
  if (
    datatype === 'http://www.w3.org/2001/XMLSchema#integer'
    || datatype === 'http://www.w3.org/2001/XMLSchema#decimal'
  ) {
    const parsed = Number(term.value)
    if (Number.isFinite(parsed)) {
      return integerLiteral(parsed)
    }
  }
  return literal(term.value, datatype)
}

function parseTurtleObject(source: string): TurtleObject | null {
  const trimmed = source.trim()
  const iriMatch = /^<([^>]+)>$/.exec(trimmed)
  if (iriMatch) {
    return iri(iriMatch[1])
  }
  const integerMatch = /^-?\d+$/.exec(trimmed)
  if (integerMatch) {
    return integerLiteral(Number(trimmed))
  }
  const literalMatch = /^"((?:\\.|[^"\\])*)"(?:\^\^<([^>]+)>)?$/.exec(trimmed)
  if (!literalMatch) {
    return null
  }
  return literal(unescapeLiteral(literalMatch[1]), literalMatch[2])
}

function escapeLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
}

function unescapeLiteral(value: string): string {
  return value
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(': 404 ')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
