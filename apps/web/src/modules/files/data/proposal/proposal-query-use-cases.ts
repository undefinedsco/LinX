import type { SolidDatabase } from '@undefineds.co/models'
import { readRawTextResource } from '../pod-adapter'

export type PendingApprovalProjection = {
  status?: string | null
  toolName?: string | null
  action?: string | null
  target?: unknown
}

type FetchPendingApprovals = () => Promise<PendingApprovalProjection[]>

function stripResourceFragment(uri: string): string {
  const hashIndex = uri.indexOf('#')
  return hashIndex >= 0 ? uri.slice(0, hashIndex) : uri
}

async function readProposalFromTarget<T>(
  db: SolidDatabase,
  target: string,
  parse: (source: string, resourceUri: string) => T,
): Promise<T> {
  const proposalResourceUri = stripResourceFragment(target)
  try {
    const resource = await readRawTextResource(db, proposalResourceUri)
    return parse(resource.content, resource.uri)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read pending proposal target ${target} from ${proposalResourceUri}: ${message}`)
  }
}

async function fetchPendingProposalTargets(
  fetchApprovals: FetchPendingApprovals,
  toolName: string,
  action: string,
): Promise<string[]> {
  const approvals = await fetchApprovals()
  return Array.from(new Set(
    approvals
      .filter((approval) => (
        approval.status === 'pending'
        && approval.toolName === toolName
        && approval.action === action
        && typeof approval.target === 'string'
        && approval.target.length > 0
      ))
      .map((approval) => approval.target as string),
  ))
}

export const proposalQueryUseCases = {
  async fetchPendingProposals<T>(
    db: SolidDatabase,
    options: {
      fetchApprovals: FetchPendingApprovals
      toolName: string
      action: string
      parse: (source: string, resourceUri: string) => T
      isMatch: (proposal: T) => boolean
    },
  ): Promise<T[]> {
    const proposalTargets = await fetchPendingProposalTargets(
      options.fetchApprovals,
      options.toolName,
      options.action,
    )
    const proposals = await Promise.all(proposalTargets.map((target) => (
      readProposalFromTarget(db, target, options.parse)
    )))

    const matched: T[] = []
    for (const proposal of proposals) {
      if (options.isMatch(proposal)) {
        matched.push(proposal)
      }
    }
    return matched
  },
}
