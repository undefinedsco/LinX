import type { SolidDatabase } from '@undefineds.co/models'
import { createRawTextResource } from '../pod-adapter'
import { createAccessPolicyProposalInboxApproval } from './access-approval-commands'
import {
  renderAccessPolicyProposalTurtle,
  type AccessPolicyProposal,
} from '../../domain/proposal/access-approval-model'

function requireAccessPolicyProposalDb(db?: SolidDatabase | null): SolidDatabase {
  if (!db) throw new Error('Database not connected')
  return db
}

export const accessPolicyProposalUseCases = {
  async create(input: {
    db?: SolidDatabase | null
    proposal: AccessPolicyProposal
    actorWebId: string
  }): Promise<string> {
    const db = requireAccessPolicyProposalDb(input.db)

    await createRawTextResource(db, {
      uri: input.proposal.proposalResourceUri,
      mimeType: 'text/turtle',
    }, renderAccessPolicyProposalTurtle(input.proposal))

    return createAccessPolicyProposalInboxApproval(db, {
      actorWebId: input.actorWebId,
      proposal: input.proposal,
    })
  },
}
