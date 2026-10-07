import { projectStructuredResourceTable } from '../structured/structured-table'
import type {
  FilesAccessPolicyGrant,
  FilesAccessPolicySummary,
} from './resource-model'

function predicateLocalName(predicate: string) {
  const hashIndex = predicate.lastIndexOf('#')
  if (hashIndex >= 0 && hashIndex < predicate.length - 1) return predicate.slice(hashIndex + 1)
  const slashIndex = predicate.lastIndexOf('/')
  if (slashIndex >= 0 && slashIndex < predicate.length - 1) return predicate.slice(slashIndex + 1)
  const colonIndex = predicate.lastIndexOf(':')
  if (colonIndex >= 0 && colonIndex < predicate.length - 1) return predicate.slice(colonIndex + 1)
  return predicate
}

function normalizeRdfTermValue(value: string) {
  const trimmed = value.trim()
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) return trimmed.slice(1, -1)
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1)
  return trimmed
}

function isPublicAgentClass(value: string) {
  const normalized = normalizeRdfTermValue(value)
  return normalized === 'foaf:Agent' || normalized.endsWith('#Agent') || normalized.endsWith('/Agent')
}

function isAuthenticatedAgentClass(value: string) {
  const normalized = normalizeRdfTermValue(value)
  return normalized === 'acl:AuthenticatedAgent'
    || normalized.endsWith('#AuthenticatedAgent')
    || normalized.endsWith('/AuthenticatedAgent')
}

function applyAccessMode(modes: FilesAccessPolicyGrant['modes'], value: string) {
  const normalized = normalizeRdfTermValue(value)
  const local = predicateLocalName(normalized).toLowerCase()
  if (local === 'read') modes.read = true
  if (local === 'append') modes.append = true
  if (local === 'write') modes.write = true
  if (local === 'control') modes.control = true
}

export function summarizeWacAclPolicy(uri: string, content: string): FilesAccessPolicySummary {
  const projection = projectStructuredResourceTable({
    uri,
    mimeType: 'text/turtle',
    source: content,
  })
  const grants: FilesAccessPolicyGrant[] = []

  for (const row of projection.rows) {
    const modes: FilesAccessPolicyGrant['modes'] = {
      read: false,
      append: false,
      write: false,
      control: false,
    }
    const audiences: Array<Pick<FilesAccessPolicyGrant, 'audience' | 'audienceRef'>> = []

    for (const cell of row.cells) {
      const localName = predicateLocalName(cell.predicate)
      if (localName === 'mode') {
        cell.values.forEach((value) => applyAccessMode(modes, value))
        continue
      }
      if (localName === 'agent') {
        cell.values.forEach((value) => {
          audiences.push({
            audience: 'agent',
            audienceRef: normalizeRdfTermValue(value),
          })
        })
        continue
      }
      if (localName === 'agentClass') {
        cell.values.forEach((value) => {
          if (isAuthenticatedAgentClass(value)) {
            audiences.push({ audience: 'authenticated', audienceRef: 'acl:AuthenticatedAgent' })
          } else if (isPublicAgentClass(value)) {
            audiences.push({ audience: 'public', audienceRef: 'foaf:Agent' })
          }
        })
      }
    }

    if (!modes.read && !modes.append && !modes.write && !modes.control) continue
    for (const audience of audiences) {
      grants.push({
        ...audience,
        modes: { ...modes },
      })
    }
  }

  return {
    uri,
    provider: 'acl',
    state: 'exists',
    grants,
  }
}
