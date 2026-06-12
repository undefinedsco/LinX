import { Parser, Writer } from 'n3'
import { resolvePodBaseUrl } from '@undefineds.co/drizzle-solid'
import { AS, DCTerms, FOAF, MEETING, ODRL, RDF, SIOC, UDFS, WF } from '@undefineds.co/models/namespaces'
import {
  agentResource,
  approvalResource,
  auditResource,
  chatResource,
  grantResource,
  messageResource,
  sessionResource,
  threadRepository,
} from '../models.js'

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

export const RDF_TYPE = RDF.type
export const XSD_DATE_TIME = 'http://www.w3.org/2001/XMLSchema#dateTime'
export const DCT_CREATED = DCTerms.created
export const DCT_MODIFIED = DCTerms.modified
export const DCT_TITLE = DCTerms.title
export const FOAF_MAKER = FOAF.maker
export const SIOC_CONTENT = SIOC.content
export const SIOC_RICH_CONTENT = SIOC.richContent
export const SIOC_HAS_MEMBER = SIOC.has_member
export const MEETING_LONG_CHAT = MEETING.LongChat
export const MEETING_MESSAGE = MEETING.Message
export const SIOC_THREAD = SIOC.Thread
export const WF_MESSAGE = WF.message
export const UDFS_AGENT = UDFS.Agent
export const UDFS_AUDIT_ENTRY = UDFS.AuditEntry
export const UDFS_APPROVAL_REQUEST = UDFS.ApprovalRequest
export const UDFS_AUTONOMY_GRANT = UDFS.AutonomyGrant
export const UDFS_SESSION = UDFS.Session
export const UDFS_ACTION = UDFS.action
export const UDFS_ACTOR = UDFS.actor
export const UDFS_ACTOR_ROLE = UDFS.actorRole
export const UDFS_APPROVAL = UDFS.approval
export const UDFS_CHAT_TYPE = UDFS.chatType
export const UDFS_CONTEXT = UDFS.context
export const UDFS_ENTRY = UDFS.entry
export const UDFS_CONVERSATION = UDFS.conversation
export const UDFS_CONVERSATION_TITLE = UDFS.conversationTitle
export const UDFS_CONVERSATION_TYPE = UDFS.conversationType
export const UDFS_HAS_THREAD = UDFS.hasThread
export const UDFS_IN_THREAD = UDFS.inThread
export const UDFS_LAST_ACTIVE_AT = UDFS.lastActiveAt
export const UDFS_MESSAGE_STATUS = UDFS.messageStatus
export const UDFS_MESSAGE_TYPE = UDFS.messageType
export const UDFS_METADATA = UDFS.metadata
export const UDFS_MODEL = UDFS.model
export const UDFS_ON_BEHALF_OF = UDFS.onBehalfOf
export const UDFS_ASSIGNED_TO = UDFS.assignedTo
export const UDFS_DECISION_BY = UDFS.decisionBy
export const UDFS_DECISION_ROLE = UDFS.decisionRole
export const UDFS_EFFECT = UDFS.effect
export const UDFS_POLICY_VERSION = UDFS.policyVersion
export const UDFS_PROVIDER = UDFS.provider
export const UDFS_REASON = UDFS.reason
export const UDFS_RESOLVED_AT = UDFS.resolvedAt
export const UDFS_REVOKED_AT = UDFS.revokedAt
export const UDFS_RISK = UDFS.risk
export const UDFS_RISK_CEILING = UDFS.riskCeiling
export const UDFS_SESSION_STATUS = UDFS.sessionStatus
export const UDFS_SESSION_TOOL = UDFS.sessionTool
export const UDFS_STATUS = UDFS.status
export const UDFS_TOKEN_USAGE = UDFS.tokenUsage
export const UDFS_TOOL_CALL_ID = UDFS.toolCallId
export const UDFS_TOOL_NAME = UDFS.toolName
export const UDFS_WORKSPACE = UDFS.workspace
export const ODRL_ACTION = ODRL.action
export const ODRL_POLICY = ODRL.Policy
export const ODRL_TARGET = ODRL.target
export const AS_ANNOUNCE = AS.Announce
export const AS_ACTOR = AS.actor
export const AS_OBJECT = AS.object

const MANAGED_BEGIN = '# linx-managed-subject:'
const MANAGED_END = '# /linx-managed-subject'

export function podBaseUrlFromWebId(webId: string): string {
  return resolvePodBaseUrl(webId)
}

export function buildSessionResourceUrl(webId: string, sessionId: string, createdAt: Date = new Date()): string {
  return sessionResource.buildIri(webId,  { id: sessionId, createdAt })
}

export function buildAuditDocumentUrl(webId: string, createdAt: Date): string {
  return documentUrl(buildAuditResourceUrl(webId, '__document__', createdAt))
}

export function buildAuditResourceUrl(webId: string, auditId: string, createdAt: Date): string {
  return auditResource.buildIri(webId,  { id: auditId, createdAt })
}

export function buildApprovalDocumentUrl(webId: string, createdAt: Date): string {
  return documentUrl(buildApprovalResourceUrl(webId, '__document__', createdAt))
}

export function buildApprovalResourceUrl(webId: string, approvalId: string, createdAt: Date = new Date()): string {
  return approvalResource.buildIri(webId,  { id: approvalId, createdAt })
}

export function buildGrantResourceUrl(webIdOrUri: string, grantId: string): string {
  return grantResource.buildIri(webIdOrUri,  { id: grantId })
}

export function buildInboxResourceUrl(webIdOrUri: string, notificationId: string): string {
  return `${podBaseUrlFromWebIdOrUri(webIdOrUri)}/inbox/${encodeURIComponent(notificationId)}.ttl`
}

export function buildAgentResourceUrl(webId: string, agentId: string): string {
  return agentResource.buildIri(webId,  { id: agentId })
}

export function buildChatIndexResourceUrl(webId: string, chatId: string): string {
  return documentUrl(chatResource.buildIri(webId,  { id: chatId }))
}

export function buildMessageResourceUrl(webId: string, chatId: string, threadId: string, createdAt: Date): string {
  return documentUrl(messageResource.buildIri(webId,  {
    id: '__document__',
    chat: chatResource.buildIri(webId, { id: chatId }),
    thread: threadRepository.iriForChat(webId, chatId, threadId),
    createdAt,
  }))
}

export function buildMessageSubjectUrl(resourceUrl: string, messageId: string): string {
  return `${resourceUrl}#${encodeURIComponent(messageId)}`
}

function documentUrl(resourceUrl: string): string {
  return resourceUrl.split('#', 1)[0] ?? resourceUrl
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
    const details = await response.text().catch(() => '')
    const suffix = details.trim() ? ` - ${details.trim().slice(0, 500)}` : ''
    throw new Error(`Failed to write Pod resource ${url}: ${response.status} ${response.statusText}${suffix}`)
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
  const turtleWithoutManagedBlocks = turtle.replace(new RegExp(
    `${escapeRegExp(MANAGED_BEGIN)} [^\\n]+\\n[\\s\\S]*?${escapeRegExp(MANAGED_END)}\\n?`,
    'g',
  ), '')
  for (const [subject, predicates] of parseStandardTurtleBlocks(turtleWithoutManagedBlocks, baseIRI)) {
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
  const hashIndex = resourceUrl.indexOf('#')
  if (hashIndex !== -1) {
    return decodeURIComponent(resourceUrl.slice(hashIndex + 1))
  }
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

export async function listTurtleResourcesRecursive(fetcher: PodFetch, containerUrl: string): Promise<string[]> {
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
  const resources = new Set<string>()
  const containers = new Set<string>()
  const resourceRegexp = /[<"]([^<>"']+\.ttl)[>"]/g
  let resourceMatch: RegExpExecArray | null
  while ((resourceMatch = resourceRegexp.exec(text))) {
    resources.add(new URL(resourceMatch[1], containerUrl).toString())
  }
  const containerRegexp = /[<"]([^<>"']+\/)[>"]/g
  let containerMatch: RegExpExecArray | null
  while ((containerMatch = containerRegexp.exec(text))) {
    const url = new URL(containerMatch[1], containerUrl).toString()
    if (url !== containerUrl) {
      containers.add(url)
    }
  }

  const nested = await Promise.all([...containers].map((url) => listTurtleResourcesRecursive(fetcher, url)))
  return [...resources, ...nested.flat()].sort()
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
