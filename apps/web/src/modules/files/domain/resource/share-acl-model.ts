import type { FilesAccessBasics, FilesAccessPolicyGrant } from './resource-model'
import { shareModesFromRole, type ShareAccessModes, type ShareRole, type ShareState, projectShareState } from './share-model'
import { turtleString } from './files-rdf-contract'

/**
 * R6 K9 on the access-policy path: the same Pod access rules the 权限 dialog reads and writes
 * (the linked `.acl`), expressed in the sharing dialog's plain roles.
 */

export type ShareChangeInput =
  | { type: 'person'; webId: string; role: ShareRole | null }
  | { type: 'link'; on: boolean }
  | { type: 'follow-parent' }

const NO_MODES: ShareAccessModes = { read: false, append: false, write: false, control: false }
const FULL_MODES: ShareAccessModes = { read: true, append: true, write: true, control: true }

function withSlash(uri: string): string {
  return uri.endsWith('/') ? uri : `${uri}/`
}

/**
 * An item in the signed-in person's own Pod is theirs to share. Only items in another Pod
 * (共享给我) are "shared with you". A missing ACL says nothing about ownership.
 */
export function isOwnPodResource(uri: string, podRootUris: ReadonlyArray<string | null | undefined>): boolean {
  const target = uri.trim()
  if (!target) return false
  const normalizedTarget = withSlash(target)
  return podRootUris.some((root) => {
    const trimmed = root?.trim()
    if (!trimmed) return false
    return normalizedTarget.startsWith(withSlash(trimmed))
  })
}

function unionModes(left: ShareAccessModes, right: ShareAccessModes): ShareAccessModes {
  return {
    read: left.read || right.read,
    append: left.append || right.append,
    write: left.write || right.write,
    control: left.control || right.control,
  }
}

export interface ShareAclRules {
  agents: Record<string, ShareAccessModes>
  publicModes: ShareAccessModes | null
  authenticatedModes: ShareAccessModes | null
}

export function shareRulesFromGrants(grants: readonly FilesAccessPolicyGrant[]): ShareAclRules {
  const rules: ShareAclRules = { agents: {}, publicModes: null, authenticatedModes: null }
  for (const grant of grants) {
    if (grant.audience === 'agent') {
      rules.agents[grant.audienceRef] = unionModes(rules.agents[grant.audienceRef] ?? NO_MODES, grant.modes)
    } else if (grant.audience === 'public') {
      rules.publicModes = unionModes(rules.publicModes ?? NO_MODES, grant.modes)
    } else {
      rules.authenticatedModes = unionModes(rules.authenticatedModes ?? NO_MODES, grant.modes)
    }
  }
  return rules
}

/**
 * Who can open the item, from the linked access policy. `canManage` never comes from a missing ACL:
 * the owner's own Pod is always manageable.
 */
export function projectShareStateFromAccess(input: {
  access: FilesAccessBasics | null | undefined
  ownAclUri: string
  isOwnPod: boolean
  selfWebId?: string | null
}): ShareState {
  const { access } = input
  const rules = shareRulesFromGrants(access?.policySummary?.state === 'exists' ? access.policySummary.grants : [])
  if (input.isOwnPod && input.selfWebId && !Object.values(rules.agents).some((modes) => modes.control)) {
    rules.agents[input.selfWebId] = { ...FULL_MODES }
  }
  const controlOnItem = access?.effectiveAccess?.user.control === true
  return projectShareState({
    agents: rules.agents,
    publicModes: rules.publicModes,
    followsParent: !access?.activeSource || access.activeSource.uri !== input.ownAclUri,
    canManage: input.isOwnPod || controlOnItem,
  })
}

/** The rules after one change. The owner's control is never taken away. */
export function applyShareChangeToRules(rules: ShareAclRules, change: ShareChangeInput, selfWebId?: string | null): ShareAclRules {
  const next: ShareAclRules = {
    agents: { ...rules.agents },
    publicModes: rules.publicModes,
    authenticatedModes: rules.authenticatedModes,
  }
  if (change.type === 'person') {
    const current = next.agents[change.webId]
    if (current?.control) return next
    if (change.role === null) delete next.agents[change.webId]
    else next.agents[change.webId] = shareModesFromRole(change.role)
  } else if (change.type === 'link') {
    next.publicModes = change.on ? { ...NO_MODES, read: true } : null
  }
  if (selfWebId && !Object.values(next.agents).some((modes) => modes.control)) {
    next.agents[selfWebId] = { ...FULL_MODES }
  }
  return next
}

function aclModes(modes: ShareAccessModes): string {
  return [
    modes.read ? 'acl:Read' : null,
    modes.append ? 'acl:Append' : null,
    modes.write ? 'acl:Write' : null,
    modes.control ? 'acl:Control' : null,
  ].filter(Boolean).join(', ')
}

/** A complete WAC document for the item: one authorization per audience. */
export function renderShareAclTurtle(input: { ownerUri: string; isFolder: boolean; rules: ShareAclRules }): string {
  const blocks: string[] = []
  const block = (slug: string, audience: string, modes: ShareAccessModes) => {
    if (!aclModes(modes)) return
    blocks.push([
      `<#${slug}> a acl:Authorization ;`,
      `  acl:accessTo <${input.ownerUri}> ;`,
      input.isFolder ? `  acl:default <${input.ownerUri}> ;` : null,
      `  ${audience} ;`,
      `  acl:mode ${aclModes(modes)} ;`,
      `  dcterms:description ${turtleString('Updated from the LinX sharing dialog.')} .`,
    ].filter(Boolean).join('\n'))
  }
  Object.entries(input.rules.agents).forEach(([webId, modes], index) => {
    block(`agent-${index + 1}`, `acl:agent <${webId}>`, modes)
  })
  if (input.rules.authenticatedModes) block('authenticated', 'acl:agentClass acl:AuthenticatedAgent', input.rules.authenticatedModes)
  if (input.rules.publicModes) block('public', 'acl:agentClass foaf:Agent', input.rules.publicModes)
  return [
    '@prefix acl: <http://www.w3.org/ns/auth/acl#> .',
    '@prefix foaf: <http://xmlns.com/foaf/0.1/> .',
    '@prefix dcterms: <http://purl.org/dc/terms/> .',
    '',
    ...blocks.flatMap((entry) => [entry, '']),
  ].join('\n')
}
