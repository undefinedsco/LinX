import type { SolidDatabase } from '@undefineds.co/models'

import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'

import {
  applyShareChangeToRules,
  isOwnPodResource,
  projectShareStateFromAccess,
  renderShareAclTurtle,
  shareRulesFromGrants,
  type ShareChangeInput,
} from '../../domain/resource/share-acl-model'
import { resolveFilesResourceSidecars } from '../../domain/resource/resource-semantics'
import type { ShareState } from '../../domain/resource/share-model'
import {
  createRawTextResource,
  readFilesAccessBasics,
  readRawTextResource,
  saveRawTextResource,
} from '../pod-adapter'
import { getAuthenticatedFetch, getPodRootUri } from '../pod-adapter/pod-runtime'

export type ShareChange = ShareChangeInput

function currentPodRoots(db: SolidDatabase): string[] {
  const roots: string[] = []
  try { roots.push(getPodRootUri(db)) } catch { /* no dialect pod url */ }
  const base = resolveCurrentPodBaseUrl(db)
  if (base) roots.push(base)
  return roots
}

function target(uri: string, isFolder: boolean) {
  return { uri, kind: isFolder ? ('container' as const) : ('resource' as const) }
}

/** Who can open this item right now, read through the same access policy the 权限 dialog uses. */
export async function readShareState(
  db: SolidDatabase,
  uri: string,
  isFolder: boolean,
  selfWebId?: string | null,
): Promise<ShareState> {
  const sidecars = resolveFilesResourceSidecars(target(uri, isFolder))
  const isOwnPod = isOwnPodResource(uri, currentPodRoots(db))
  let access = null
  try {
    access = await readFilesAccessBasics(db, target(uri, isFolder))
  } catch (error) {
    // An owner can still manage an item whose rules cannot be read right now.
    if (!isOwnPod) throw error
  }
  return projectShareStateFromAccess({ access, ownAclUri: sidecars.accessPolicyUris.acl, isOwnPod, selfWebId })
}

/** Applies one sharing change straight away (no approval step); revoking takes effect at once. */
export async function applyShareChange(
  db: SolidDatabase,
  input: { uri: string; isFolder: boolean; change: ShareChange; selfWebId?: string | null },
): Promise<void> {
  const sidecars = resolveFilesResourceSidecars(target(input.uri, input.isFolder))
  const ownAclUri = sidecars.accessPolicyUris.acl
  const isOwnPod = isOwnPodResource(input.uri, currentPodRoots(db))
  const access = await readFilesAccessBasics(db, target(input.uri, input.isFolder))
  if (!isOwnPod && access.effectiveAccess?.user.control !== true) {
    throw new Error('403 not allowed to change sharing')
  }
  if (access.activeSource?.provider === 'acr' && access.activeSource.uri !== ownAclUri) {
    throw new Error('Access policy is ACR; applying sharing changes is not supported yet.')
  }

  if (input.change.type === 'follow-parent') {
    if (access.activeSource?.uri !== ownAclUri) return
    const response = await getAuthenticatedFetch(db)(ownAclUri, { method: 'DELETE' })
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      throw new Error(`HTTP ${response.status} could not follow the folder`)
    }
    return
  }

  const rules = applyShareChangeToRules(
    shareRulesFromGrants(access.policySummary?.state === 'exists' ? access.policySummary.grants : []),
    input.change,
    input.selfWebId,
  )
  const content = renderShareAclTurtle({ ownerUri: sidecars.ownerUri, isFolder: input.isFolder, rules })

  if (access.activeSource?.uri === ownAclUri) {
    const existing = await readRawTextResource(db, ownAclUri)
    await saveRawTextResource(db, existing, content)
    return
  }
  await createRawTextResource(db, { uri: ownAclUri, mimeType: 'text/turtle' }, content)
}
