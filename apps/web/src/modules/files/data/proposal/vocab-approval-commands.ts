import {
  approvalResource,
  auditResource,
  inboxNotificationResource,
  type SolidDatabase,
} from '@undefineds.co/models'
import { assertInsertValuesBelongToCurrentPod } from '@/lib/data/pod-write-guard'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { createRawTextResource, readRawTextResource } from '../pod-adapter'
import {
  FILES_VOCAB_APPROVAL_ACTION,
  FILES_VOCAB_APPROVAL_POLICY_VERSION,
  FILES_VOCAB_APPROVAL_TOOL_NAME,
  parseVocabTermProposalTurtle,
  renderApprovedVocabShapeProposalNTriples,
  vocabShapeRuleUri,
  renderApprovedVocabTermNTriples,
  type VocabTermProposal,
} from '../../domain/structured/structured-table'
import { stripProposalFragment } from '../../domain/proposal/proposal-status'
import { hashText } from '../../domain/history/text-hash'

function resolveRequiredPodBaseUrl(db: SolidDatabase): string {
  const podBaseUrl = resolveCurrentPodBaseUrl(db)
  if (!podBaseUrl) {
    throw new Error('Cannot create vocab proposal approval without a current SP Pod URL.')
  }
  return podBaseUrl
}

export async function createVocabTermProposalInboxApproval(
  db: SolidDatabase,
  input: {
    actorWebId: string
    proposal: VocabTermProposal
    createdAt?: Date
  },
): Promise<string> {
  const createdAt = input.createdAt ?? new Date()
  const podBaseUrl = resolveRequiredPodBaseUrl(db)
  const approvalId = crypto.randomUUID()
  const auditId = crypto.randomUUID()
  const approvalResourceId = approvalResource.buildId({ id: approvalId, createdAt })
  const approvalUri = approvalResource.buildIri(podBaseUrl, { id: approvalId, createdAt } as any)

  const approvalPayload = {
    id: approvalResourceId,
    session: input.proposal.id,
    toolCallId: `${FILES_VOCAB_APPROVAL_TOOL_NAME}:${approvalId}`,
    toolName: FILES_VOCAB_APPROVAL_TOOL_NAME,
    target: input.proposal.id,
    action: FILES_VOCAB_APPROVAL_ACTION,
    risk: 'medium',
    status: 'pending',
    assignedTo: input.actorWebId,
    policyVersion: FILES_VOCAB_APPROVAL_POLICY_VERSION,
    createdAt,
  }
  assertInsertValuesBelongToCurrentPod(db, approvalPayload)
  await db.insert(approvalResource).values(approvalPayload).execute()

  const auditPayload = {
    id: auditId,
    action: 'files.vocab.proposal.requested',
    actor: input.actorWebId,
    actorRole: 'human',
    approval: approvalUri,
    entry: input.proposal.proposalResourceUri,
    toolName: FILES_VOCAB_APPROVAL_TOOL_NAME,
    policyVersion: FILES_VOCAB_APPROVAL_POLICY_VERSION,
    createdAt,
  }
  assertInsertValuesBelongToCurrentPod(db, auditPayload)
  await db.insert(auditResource).values(auditPayload).execute()

  const notificationPayload = {
    id: crypto.randomUUID(),
    actor: input.actorWebId,
    object: approvalUri,
    createdAt,
  }
  assertInsertValuesBelongToCurrentPod(db, notificationPayload)
  await db.insert(inboxNotificationResource).values(notificationPayload).execute()

  return approvalUri
}

function normalizeAbsoluteIri(iri: string): string {
  try {
    return new URL(iri).href
  } catch {
    return iri
  }
}

function siblingVocabResourceUri(termsUri: string, resourceName: 'terms.ttl' | 'shapes.ttl' | 'namespaces.ttl'): string {
  try {
    return new URL(resourceName, termsUri).href
  } catch {
    return `${termsUri.replace(/[^/]*$/, '')}${resourceName}`
  }
}

function getAuthenticatedFetch(db: SolidDatabase): typeof fetch {
  const authFetch = (db as any)?.getDialect?.()?.getAuthenticatedFetch?.()
  if (typeof authFetch !== 'function') {
    throw new Error('认证 fetch 不可用。')
  }
  return authFetch
}

function renderVocabTermsRegistrySkeleton(): string {
  return [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '',
    '<#registry> a udfs:VocabTermRegistry ;',
    '  rdfs:label "Personal vocab terms" .',
    '',
  ].join('\n')
}

function renderVocabShapesRegistrySkeleton(): string {
  return [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '',
    '<#registry> a udfs:VocabShapeRegistry ;',
    '  rdfs:label "Personal vocab shapes" .',
    '',
  ].join('\n')
}

function renderVocabNamespacesRegistrySkeleton(): string {
  return [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '',
    '<#registry> a udfs:VocabNamespaceRegistry ;',
    '  rdfs:label "Personal vocab namespaces" .',
    '',
    '<#udfs> a udfs:NamespaceTerm ;',
    '  rdfs:label "udfs" ;',
    '  udfs:prefix "udfs" ;',
    '  udfs:namespace <https://undefineds.co/vocab/> .',
    '',
    '<#rdf> a udfs:NamespaceTerm ;',
    '  rdfs:label "rdf" ;',
    '  udfs:prefix "rdf" ;',
    '  udfs:namespace <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .',
    '',
    '<#rdfs> a udfs:NamespaceTerm ;',
    '  rdfs:label "rdfs" ;',
    '  udfs:prefix "rdfs" ;',
    '  udfs:namespace <http://www.w3.org/2000/01/rdf-schema#> .',
    '',
  ].join('\n')
}

function assertVocabProposalTargetsCurrentPod(
  db: SolidDatabase,
  proposal: VocabTermProposal,
  options: { documentAnywhereInPod?: boolean } = {},
): void {
  const podBaseUrl = resolveRequiredPodBaseUrl(db)
  const podPrefix = `${podBaseUrl}/`
  const proposalResourceUri = normalizeAbsoluteIri(proposal.proposalResourceUri)
  const documentUri = normalizeAbsoluteIri(proposal.documentUri)
  const targetVocabUri = normalizeAbsoluteIri(proposal.targetVocabUri)
  const targetShapesUri = normalizeAbsoluteIri(proposal.targetShapesUri)
  const termUri = normalizeAbsoluteIri(proposal.termUri)
  const expectedShapesUri = siblingVocabResourceUri(targetVocabUri, 'shapes.ttl')

  const valid =
    proposalResourceUri.startsWith(`${podPrefix}.data/proposals/vocab/`) &&
    // A table the person made can live in any folder of their Pod; only agent proposals are kept under .data.
    documentUri.startsWith(options.documentAnywhereInPod ? podPrefix : `${podPrefix}.data/`) &&
    targetVocabUri.startsWith(podPrefix) &&
    targetVocabUri.endsWith('/.vocab/terms.ttl') &&
    targetShapesUri === expectedShapesUri &&
    termUri.startsWith(`${targetVocabUri}#`)

  if (!valid) {
    throw new Error('Refusing to approve vocab proposal outside the current Pod vocab registry.')
  }
}

function assertVocabProposalPending(proposal: VocabTermProposal): void {
  if (proposal.status !== 'pending') {
    throw new Error(`Cannot approve vocab proposal because it is already ${proposal.status}.`)
  }
}

export async function approveVocabTermProposalFromInbox(
  db: SolidDatabase,
  proposalRef: string,
): Promise<VocabTermProposal> {
  const proposalResourceUri = stripProposalFragment(proposalRef)
  const proposalResource = await readRawTextResource(db, proposalResourceUri)
  const proposal = parseVocabTermProposalTurtle(proposalResource.content, proposalResource.uri)
  assertVocabProposalTargetsCurrentPod(db, proposal)
  // A column the person kept from the table is already in the vocabulary; its old inbox item can
  // still be approved to close it, instead of failing on "already approved".
  if (proposal.status === 'approved') return proposal
  assertVocabProposalPending(proposal)
  await approveVocabTermProposalCanonical(db, proposal)
  return proposal
}

function isMissingResourceError(error: unknown) {
  return error instanceof Error && /HTTP\s+(404|410)/.test(error.message)
}

function parseWacAllowUserModes(header: string | null): Set<string> | null {
  if (!header) return null
  const match = header.match(/user="([^"]*)"/i)
  if (!match) return null
  return new Set(match[1].split(/\s+/).map((mode) => mode.trim().toLowerCase()).filter(Boolean))
}

async function assertVocabResourcePublishWritable(db: SolidDatabase, uri: string): Promise<void> {
  const authFetch = getAuthenticatedFetch(db)
  let response: Response
  try {
    response = await authFetch(uri, { method: 'HEAD' })
  } catch (error) {
    throw new Error(`Cannot verify write permission for vocab resource ${uri}: ${error instanceof Error ? error.message : 'unknown error'}`)
  }

  if (response.status === 404 || response.status === 410) return
  if (response.status === 401 || response.status === 403) {
    throw new Error(`Cannot publish vocab proposal: no write access to ${uri}.`)
  }
  if (!response.ok) {
    throw new Error(`Cannot verify write permission for vocab resource ${uri}: HTTP ${response.status}`)
  }

  const userModes = parseWacAllowUserModes(response.headers.get('WAC-Allow'))
  if (userModes && !userModes.has('write') && !userModes.has('control')) {
    throw new Error(`Cannot publish vocab proposal: no write access to ${uri}.`)
  }
}

async function assertVocabPublishWritable(db: SolidDatabase, proposal: VocabTermProposal): Promise<void> {
  await Promise.all([
    assertVocabResourcePublishWritable(db, proposal.targetVocabUri),
    assertVocabResourcePublishWritable(db, proposal.targetShapesUri),
    assertVocabResourcePublishWritable(db, siblingVocabResourceUri(proposal.targetVocabUri, 'namespaces.ttl')),
  ])
}

async function ensureVocabRegistryResource(
  db: SolidDatabase,
  uri: string,
  skeleton: string,
) {
  try {
    return await readRawTextResource(db, uri)
  } catch (error) {
    if (!isMissingResourceError(error)) throw error
    try {
      return await createRawTextResource(db, {
        uri,
        mimeType: 'text/turtle',
      }, skeleton)
    } catch (createError) {
      if (!isMissingResourceError(createError)) throw createError
      await ensureVocabContainer(db)
      return createRawTextResource(db, {
        uri,
        mimeType: 'text/turtle',
      }, skeleton)
    }
  }
}

async function ensureVocabContainer(db: SolidDatabase): Promise<void> {
  const podBaseUrl = resolveRequiredPodBaseUrl(db)
  const podRootUrl = new URL('.', `${podBaseUrl}/`).href
  const authFetch = getAuthenticatedFetch(db)
  const response = await authFetch(podRootUrl, {
    method: 'POST',
    headers: {
      Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
      Slug: '.vocab',
    },
  })

  if ([200, 201, 204, 409].includes(response.status)) return

  throw new Error(`创建 .vocab 容器失败: HTTP ${response.status}`)
}

function buildVocabRegistryInsertPatch(triples: string): string {
  return [
    'INSERT DATA {',
    ...triples.trim().split('\n').map((line) => `  ${line}`),
    '}',
  ].join('\n')
}

async function patchVocabRegistryResource(
  db: SolidDatabase,
  uri: string,
  triples: string,
): Promise<void> {
  if (!triples.trim()) return
  const response = await getAuthenticatedFetch(db)(uri, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/sparql-update',
    },
    body: buildVocabRegistryInsertPatch(triples),
  })

  if (!response.ok) {
    throw new Error(`Cannot publish vocab proposal to ${uri}: HTTP ${response.status}`)
  }
}

/** Whether a registry already names this address (as a full address or as `<#fragment>` in Turtle). */
function registryMentions(content: string, uri: string): boolean {
  const fragment = uri.includes('#') ? uri.slice(uri.lastIndexOf('#')) : null
  return content.includes(`<${uri}>`) || (!!fragment && content.includes(`<${fragment}>`))
}

export async function approveVocabTermProposalCanonical(
  db: SolidDatabase,
  proposal: VocabTermProposal,
  options: { documentAnywhereInPod?: boolean } = {},
): Promise<{ termUri: string; shapesUri: string | null }> {
  assertVocabProposalTargetsCurrentPod(db, proposal, options)
  assertVocabProposalPending(proposal)
  await assertVocabPublishWritable(db, proposal)
  const termsRegistry = await ensureVocabRegistryResource(db, proposal.targetVocabUri, renderVocabTermsRegistrySkeleton())
  const shapesRegistry = await ensureVocabRegistryResource(db, proposal.targetShapesUri, renderVocabShapesRegistrySkeleton())
  await ensureVocabRegistryResource(
    db,
    siblingVocabResourceUri(proposal.targetVocabUri, 'namespaces.ttl'),
    renderVocabNamespacesRegistrySkeleton(),
  )

  // A property is shared by every table: a second table that uses it adds its own rule, not a second term.
  if (!registryMentions(termsRegistry.content, proposal.termUri)) {
    await patchVocabRegistryResource(db, proposal.targetVocabUri, renderApprovedVocabTermNTriples(proposal))
  }

  const baseRuleUri = vocabShapeRuleUri(proposal)
  const ruleUri = registryMentions(shapesRegistry.content, baseRuleUri)
    ? `${baseRuleUri}-${hashText(proposal.classScope ?? 'any').slice(0, 7)}`
    : baseRuleUri
  const shapeTriples = registryMentions(shapesRegistry.content, ruleUri)
    ? ''
    : renderApprovedVocabShapeProposalNTriples(proposal, ruleUri)
  if (!shapeTriples) {
    return { termUri: proposal.termUri, shapesUri: null }
  }

  await patchVocabRegistryResource(db, proposal.targetShapesUri, shapeTriples)

  return { termUri: proposal.termUri, shapesUri: proposal.targetShapesUri }
}

function sparqlStringLiteral(value: string): string {
  return JSON.stringify(value)
}

async function runVocabRegistryUpdate(db: SolidDatabase, uri: string, update: string): Promise<void> {
  const response = await getAuthenticatedFetch(db)(uri, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/sparql-update' },
    body: update,
  })
  if (!response.ok) {
    throw new Error(`Cannot update vocab term in ${uri}: HTTP ${response.status}`)
  }
}

/**
 * K6d 改值的类型: the property keeps its name and address, only what it holds changes. The new type
 * is written to the term and to the rules that scope it to a table, so every table that uses the
 * property sees it. Values already on cards are not touched.
 */
export async function changeVocabTermValueType(
  db: SolidDatabase,
  input: { termUri: string; targetVocabUri: string; valueType: string; shape: string },
): Promise<void> {
  const podBaseUrl = resolveRequiredPodBaseUrl(db)
  const termUri = normalizeAbsoluteIri(input.termUri)
  const targetVocabUri = normalizeAbsoluteIri(input.targetVocabUri)
  if (
    !targetVocabUri.startsWith(`${podBaseUrl}/`)
    || !targetVocabUri.endsWith('/.vocab/terms.ttl')
    || !termUri.startsWith(`${targetVocabUri}#`)
  ) {
    throw new Error('Refusing to change a vocab term outside the current Pod vocab registry.')
  }
  const shapesUri = siblingVocabResourceUri(targetVocabUri, 'shapes.ttl')
  const valueType = sparqlStringLiteral(input.valueType)
  const shape = sparqlStringLiteral(input.shape)

  await runVocabRegistryUpdate(db, targetVocabUri, [
    'DELETE { <' + termUri + '> <https://undefineds.co/vocab/valueType> ?v . <' + termUri + '> <https://undefineds.co/vocab/shape> ?s }',
    'INSERT { <' + termUri + '> <https://undefineds.co/vocab/valueType> ' + valueType + ' . <' + termUri + '> <https://undefineds.co/vocab/shape> ' + shape + ' }',
    'WHERE { OPTIONAL { <' + termUri + '> <https://undefineds.co/vocab/valueType> ?v } OPTIONAL { <' + termUri + '> <https://undefineds.co/vocab/shape> ?s } }',
  ].join('\n'))

  await runVocabRegistryUpdate(db, shapesUri, [
    'DELETE { ?r <https://undefineds.co/vocab/valueType> ?v . ?r <https://undefineds.co/vocab/constraint> ?c }',
    'INSERT { ?r <https://undefineds.co/vocab/valueType> ' + valueType + ' . ?r <https://undefineds.co/vocab/constraint> ' + shape + ' }',
    'WHERE { ?r <https://undefineds.co/vocab/term> <' + termUri + '> . OPTIONAL { ?r <https://undefineds.co/vocab/valueType> ?v } OPTIONAL { ?r <https://undefineds.co/vocab/constraint> ?c } }',
  ].join('\n'))
}
