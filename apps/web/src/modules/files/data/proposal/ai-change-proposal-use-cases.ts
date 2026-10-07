import type { SolidDatabase } from '@undefineds.co/models'
import { createRawTextResource } from '../pod-adapter'
import { createAiChangeProposalInboxApproval } from './ai-change-approval-commands'
import {
  renderAiChangeProposalTurtle,
  type AiChangeProposal,
} from '../../domain/proposal/ai-change-approval-model'

function requireAiChangeProposalDb(db?: SolidDatabase | null): SolidDatabase {
  if (!db) throw new Error('Database not connected')
  return db
}

export const aiChangeProposalUseCases = {
  async create(input: {
    db?: SolidDatabase | null
    proposal: AiChangeProposal
    actorWebId: string
  }): Promise<string> {
    const db = requireAiChangeProposalDb(input.db)

    await createRawTextResource(db, {
      uri: input.proposal.proposalResourceUri,
      mimeType: 'text/turtle',
    }, renderAiChangeProposalTurtle(input.proposal))

    return createAiChangeProposalInboxApproval(db, {
      actorWebId: input.actorWebId,
      proposal: input.proposal,
    })
  },
}
