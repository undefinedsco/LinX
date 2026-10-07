import type { SolidDatabase } from '@undefineds.co/models'
import { createRawTextResource } from '../pod-adapter'
import { createStructuredCellChangeProposalInboxApproval } from './structured-cell-approval-commands'
import {
  renderStructuredCellChangeProposalTurtle,
  type StructuredCellChangeProposal,
} from '../../domain/proposal/structured-cell-approval-model'

function requireStructuredCellProposalDb(db?: SolidDatabase | null): SolidDatabase {
  if (!db) throw new Error('Database not connected')
  return db
}

export const structuredCellProposalUseCases = {
  async create(input: {
    db?: SolidDatabase | null
    proposal: StructuredCellChangeProposal
    actorWebId: string
  }): Promise<string> {
    const db = requireStructuredCellProposalDb(input.db)

    await createRawTextResource(db, {
      uri: input.proposal.proposalResourceUri,
      mimeType: 'text/turtle',
    }, renderStructuredCellChangeProposalTurtle(input.proposal))

    return createStructuredCellChangeProposalInboxApproval(db, {
      actorWebId: input.actorWebId,
      proposal: input.proposal,
    })
  },
}
