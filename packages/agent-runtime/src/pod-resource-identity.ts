const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/
const AGENT_RESOURCE_ID = /^([A-Za-z0-9_.-]+)\/$/
const AGENT_KEY = /^[A-Za-z0-9_.-]+$/

declare const baseRelativeResourceIdBrand: unique symbol
declare const resourceIriBrand: unique symbol

export type BaseRelativeResourceId = string & {
  readonly [baseRelativeResourceIdBrand]: 'BaseRelativeResourceId'
}

export type ResourceIri = string & {
  readonly [resourceIriBrand]: 'ResourceIri'
}

export function asBaseRelativeResourceId(value: string, label = 'Resource id'): BaseRelativeResourceId {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty base-relative resource id.`)
  }
  const normalized = value.trim()
  if (ABSOLUTE_IRI.test(normalized) || normalized.startsWith('/') || normalized.startsWith('//')) {
    throw new Error(`${label} must be a base-relative resource id.`)
  }
  return normalized as BaseRelativeResourceId
}

export function asResourceIri(value: string, label = 'Resource IRI'): ResourceIri {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty resource IRI.`)
  }
  const normalized = value.trim()
  if (!ABSOLUTE_IRI.test(normalized)) {
    throw new Error(`${label} must be a full resource IRI.`)
  }
  return normalized as ResourceIri
}

export function requireRowResourceId(
  row: { id?: string | null } | null | undefined,
  label = 'Pod row',
): BaseRelativeResourceId {
  if (!row || typeof row.id !== 'string' || row.id.trim().length === 0) {
    throw new Error(`${label} row is missing row.id.`)
  }
  return asBaseRelativeResourceId(row.id, `${label} row.id`)
}

function defaultAgentKey(): string {
  return `agent_${Math.random().toString(36).slice(2, 12)}`
}

export function agentResourceId(key?: string | null): BaseRelativeResourceId {
  const raw = typeof key === 'string' ? key.trim() : ''
  const value = raw || defaultAgentKey()

  if (AGENT_RESOURCE_ID.test(value)) {
    return asBaseRelativeResourceId(value, 'Agent resource id')
  }

  if (!AGENT_KEY.test(value)) {
    throw new Error('Agent key must use letters, numbers, dot, underscore, or dash.')
  }

  return asBaseRelativeResourceId(`${value}/`, 'Agent resource id')
}

export function agentKeyFromResourceId(resourceId: string): string {
  const id = asBaseRelativeResourceId(resourceId, 'Agent resource id')
  const match = id.match(AGENT_RESOURCE_ID)
  if (!match?.[1]) {
    throw new Error('Agent resource id must use {agentKey}/.')
  }
  return match[1]
}

export function agentHomeDirFromResourceId(resourceId: string): BaseRelativeResourceId {
  return asBaseRelativeResourceId(agentResourceId(agentKeyFromResourceId(resourceId)), 'Agent home dir')
}
