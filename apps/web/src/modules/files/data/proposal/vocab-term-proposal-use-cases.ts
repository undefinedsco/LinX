import type { SolidDatabase } from '@undefineds.co/models'
import {
  createRawTextResource,
  readRawTextResource,
  type FilesRawTextResource,
} from '../pod-adapter'
import {
  renderVocabTermProposalTurtle,
  type VocabTermProposal,
} from '../../domain/structured/structured-table'
import {
  approveVocabTermProposalCanonical,
  createVocabTermProposalInboxApproval,
} from './vocab-approval-commands'

function requireVocabTermProposalDb(db?: SolidDatabase | null): SolidDatabase {
  if (!db) throw new Error('Database not connected')
  return db
}

export const vocabTermProposalUseCases = {
  async create(input: {
    db?: SolidDatabase | null
    proposal: VocabTermProposal
    actorWebId: string
  }): Promise<string> {
    const db = requireVocabTermProposalDb(input.db)

    await createRawTextResource(db, {
      uri: input.proposal.proposalResourceUri,
      mimeType: 'text/turtle',
    }, renderVocabTermProposalTurtle(input.proposal))

    return createVocabTermProposalInboxApproval(db, {
      actorWebId: input.actorWebId,
      proposal: input.proposal,
    })
  },

  async approve(input: {
    db?: SolidDatabase | null
    proposal: VocabTermProposal
  }): Promise<FilesRawTextResource> {
    const db = requireVocabTermProposalDb(input.db)

    await approveVocabTermProposalCanonical(db, input.proposal)
    return readRawTextResource(db, input.proposal.targetVocabUri)
  },
}
