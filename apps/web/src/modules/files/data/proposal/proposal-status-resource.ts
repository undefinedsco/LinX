import type { SolidDatabase } from '@undefineds.co/models'
import { FilesSaveConflictError, readRawTextResource, saveRawTextResource } from '../pod-adapter'
import {
  readFilesProposalStatus,
  stripProposalFragment,
  updateProposalStatusInTurtle,
  type FilesProposalDecisionStatus,
} from '../../domain/proposal/proposal-status'

export async function markFilesProposalResourceResolved(
  db: SolidDatabase,
  proposalRef: string,
  status: FilesProposalDecisionStatus,
): Promise<void> {
  const proposalResourceUri = stripProposalFragment(proposalRef)
  const proposalResource = await readRawTextResource(db, proposalResourceUri)
  const nextSource = updateProposalStatusInTurtle(proposalResource.content, status)
  if (nextSource === proposalResource.content) return
  try {
    await saveRawTextResource(db, { ...proposalResource, mimeType: 'text/turtle' }, nextSource)
  } catch (error) {
    if (!(error instanceof FilesSaveConflictError)) throw error
    const latestProposalResource = await readRawTextResource(db, proposalResourceUri)
    const latestStatus = readFilesProposalStatus(latestProposalResource.content)
    if (latestStatus === status) return
    if (latestStatus !== 'pending') throw error
    const latestNextSource = updateProposalStatusInTurtle(latestProposalResource.content, status)
    if (latestNextSource === latestProposalResource.content) return
    await saveRawTextResource(db, { ...latestProposalResource, mimeType: 'text/turtle' }, latestNextSource)
  }
}
