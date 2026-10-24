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
  changeVocabTermValueType,
  createVocabTermProposalInboxApproval,
} from './vocab-approval-commands'
import { markFilesProposalResourceResolved } from './proposal-status-resource'

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

  /**
   * A term the person made themselves (a column, an option) goes straight into the vocabulary:
   * there is nobody to ask. `resolveRecord` is for a term whose approval record already exists
   * (an older column still waiting in the inbox): the record is closed so it does not linger.
   */
  async confirm(input: {
    db?: SolidDatabase | null
    proposal: VocabTermProposal
    resolveRecord?: boolean
  }): Promise<FilesRawTextResource> {
    const db = requireVocabTermProposalDb(input.db)

    await approveVocabTermProposalCanonical(db, input.proposal, { documentAnywhereInPod: true })
    if (input.resolveRecord) {
      await markFilesProposalResourceResolved(db, input.proposal.proposalResourceUri, 'approved')
    }
    return readRawTextResource(db, input.proposal.targetVocabUri)
  },

  async changeValueType(input: {
    db?: SolidDatabase | null
    termUri: string
    targetVocabUri: string
    valueType: string
    shape: string
  }): Promise<FilesRawTextResource> {
    const db = requireVocabTermProposalDb(input.db)

    await changeVocabTermValueType(db, {
      termUri: input.termUri,
      targetVocabUri: input.targetVocabUri,
      valueType: input.valueType,
      shape: input.shape,
    })
    return readRawTextResource(db, input.targetVocabUri)
  },
}
