import {
  filesDataResourceUri,
  filesProposalInstanceSuffix,
  resolveFilesPodRootUri,
  turtleString,
} from '../resource/files-rdf-contract'
import { readProposalIri, readProposalLiteral, readProposalLiterals } from './proposal-rdf'
import { readFilesProposalStatus, type FilesProposalStatus } from './proposal-status'

export const FILES_ACCESS_APPROVAL_POLICY_VERSION = 'files-access-proposal-v1'
export const FILES_ACCESS_APPROVAL_TOOL_NAME = 'files.access.proposal'
export const FILES_ACCESS_APPROVAL_ACTION = 'https://undefineds.co/vocab/reviewAccessPolicyProposal'

export type AccessProposalAudience = 'public' | 'authenticated' | 'agent'
export type AccessProposalRole = 'viewer' | 'contributor' | 'editor' | 'manager'

export interface AccessPolicyProposal {
  id: string
  kind: 'access-policy-proposal'
  status: FilesProposalStatus
  operation: 'request-change'
  proposalResourceUri: string
  ownerUri: string
  activePolicyUri: string | null
  targetPolicyUri: string
  provider: 'acl' | 'acr' | 'unknown'
  audience: AccessProposalAudience
  audienceRef: string
  role: AccessProposalRole
  modes: string[]
  reason: string
  createdAt: string
  writesCanonicalPolicy: false
}

function slugify(value: string) {
  const slug = value
    .trim()
    .replace(/^[#./]+/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug || 'access'
}

export function createAccessPolicyProposal(input: {
  ownerUri: string
  activePolicyUri?: string | null
  targetPolicyUri: string
  provider: 'acl' | 'acr' | 'unknown'
  audience: AccessProposalAudience
  audienceRef: string
  role: AccessProposalRole
  modes: string[]
  reason: string
  createdAt?: string
}): AccessPolicyProposal {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const podRoot = resolveFilesPodRootUri(input.ownerUri, { inferLocalPathPod: true })
  const label = `${input.audience}-${input.role}-${slugify(input.audienceRef)}`
  const instanceSuffix = filesProposalInstanceSuffix([
    createdAt,
    input.ownerUri,
    input.activePolicyUri,
    input.targetPolicyUri,
    input.provider,
    input.audience,
    input.audienceRef,
    input.role,
    input.modes,
    input.reason,
  ])
  const proposalResourceUri = filesDataResourceUri(podRoot, `proposals/access/${slugify(label)}-${instanceSuffix}.ttl`)
  return {
    id: `${proposalResourceUri}#proposal`,
    kind: 'access-policy-proposal',
    status: 'pending',
    operation: 'request-change',
    proposalResourceUri,
    ownerUri: input.ownerUri,
    activePolicyUri: input.activePolicyUri ?? null,
    targetPolicyUri: input.targetPolicyUri,
    provider: input.provider,
    audience: input.audience,
    audienceRef: input.audienceRef,
    role: input.role,
    modes: input.modes,
    reason: input.reason.trim() || '未填写说明。',
    createdAt,
    writesCanonicalPolicy: false,
  }
}

export function renderAccessPolicyProposalTurtle(proposal: AccessPolicyProposal) {
  const lines = [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '',
    '<#proposal> a udfs:AccessPolicyProposal ;',
    `  udfs:status ${turtleString(proposal.status)} ;`,
    `  udfs:operation ${turtleString(proposal.operation)} ;`,
    `  udfs:ownerResource <${proposal.ownerUri}> ;`,
    `  udfs:targetPolicy <${proposal.targetPolicyUri}> ;`,
    `  udfs:provider ${turtleString(proposal.provider)} ;`,
    `  udfs:audience ${turtleString(proposal.audience)} ;`,
    `  udfs:audienceRef ${turtleString(proposal.audienceRef)} ;`,
    `  udfs:role ${turtleString(proposal.role)} ;`,
    ...proposal.modes.map((mode) => `  udfs:mode ${turtleString(mode)} ;`),
    `  dcterms:description ${turtleString(proposal.reason)} ;`,
    `  dcterms:created ${turtleString(proposal.createdAt)} ;`,
    `  udfs:writesCanonicalPolicy ${proposal.writesCanonicalPolicy ? 'true' : 'false'} .`,
  ]
  if (proposal.activePolicyUri) {
    lines.splice(7, 0, `  udfs:activePolicy <${proposal.activePolicyUri}> ;`)
  }
  return lines.join('\n')
}

function isAccessAudience(value: string | null): value is AccessProposalAudience {
  return value === 'public' || value === 'authenticated' || value === 'agent'
}

function isAccessRole(value: string | null): value is AccessProposalRole {
  return value === 'viewer' || value === 'contributor' || value === 'editor' || value === 'manager'
}

function isAccessProvider(value: string | null): value is AccessPolicyProposal['provider'] {
  return value === 'acl' || value === 'acr' || value === 'unknown'
}

export function parseAccessPolicyProposalTurtle(source: string, proposalResourceUri: string): AccessPolicyProposal {
  const ownerUri = readProposalIri(source, 'udfs:ownerResource')
  const targetPolicyUri = readProposalIri(source, 'udfs:targetPolicy')
  const provider = readProposalLiteral(source, 'udfs:provider')
  const audience = readProposalLiteral(source, 'udfs:audience')
  const role = readProposalLiteral(source, 'udfs:role')
  const audienceRef = readProposalLiteral(source, 'udfs:audienceRef')
  if (!ownerUri || !targetPolicyUri || !isAccessProvider(provider) || !isAccessAudience(audience) || !isAccessRole(role) || !audienceRef) {
    throw new Error('Invalid access policy proposal: missing required fields.')
  }

  return {
    id: `${proposalResourceUri}#proposal`,
    kind: 'access-policy-proposal',
    status: readFilesProposalStatus(source),
    operation: 'request-change',
    proposalResourceUri,
    ownerUri,
    activePolicyUri: readProposalIri(source, 'udfs:activePolicy'),
    targetPolicyUri,
    provider,
    audience,
    audienceRef,
    role,
    modes: readProposalLiterals(source, 'udfs:mode'),
    reason: readProposalLiteral(source, 'dcterms:description') ?? '',
    createdAt: readProposalLiteral(source, 'dcterms:created') ?? new Date().toISOString(),
    writesCanonicalPolicy: false,
  }
}

function aclModeName(mode: string) {
  switch (mode) {
    case 'read': return 'acl:Read'
    case 'append': return 'acl:Append'
    case 'write': return 'acl:Write'
    case 'control': return 'acl:Control'
    default: return null
  }
}

function authorizationSlug(proposal: AccessPolicyProposal) {
  return `${proposal.audience}-${proposal.role}-${slugify(proposal.audienceRef)}`
}

function renderAclAudience(proposal: AccessPolicyProposal) {
  if (proposal.audience === 'public') return '  acl:agentClass foaf:Agent ;'
  if (proposal.audience === 'authenticated') return '  acl:agentClass acl:AuthenticatedAgent ;'
  return `  acl:agent <${proposal.audienceRef}> ;`
}

export function applyAccessPolicyProposalToAclTurtle(existingContent: string, proposal: AccessPolicyProposal) {
  if (proposal.provider === 'acr' || proposal.targetPolicyUri.endsWith('.acr')) {
    throw new Error('ACR access proposal apply is not supported yet.')
  }
  const prefixes = [
    ['acl', '@prefix acl: <http://www.w3.org/ns/auth/acl#> .'],
    ['foaf', '@prefix foaf: <http://xmlns.com/foaf/0.1/> .'],
    ['dcterms', '@prefix dcterms: <http://purl.org/dc/terms/> .'],
  ] as const
  const prefixBlock = prefixes
    .filter(([prefix]) => !new RegExp(`@prefix\\s+${prefix}:`).test(existingContent))
    .map(([, line]) => line)
    .join('\n')
  const modeValues = proposal.modes.map(aclModeName).filter((mode) => mode !== null)
  if (modeValues.length === 0) {
    throw new Error('Invalid access policy proposal: no supported ACL modes.')
  }

  const authorization = [
    `<#${authorizationSlug(proposal)}> a acl:Authorization ;`,
    `  acl:accessTo <${proposal.ownerUri}> ;`,
    renderAclAudience(proposal),
    `  acl:mode ${modeValues.join(', ')} ;`,
    `  dcterms:description ${turtleString(proposal.reason)} .`,
  ].join('\n')
  return [prefixBlock, existingContent.trim(), authorization]
    .filter((part) => part.length > 0)
    .join('\n\n')
    .concat('\n')
}
