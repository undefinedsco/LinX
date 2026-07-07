import type { SolidDatabase } from '@undefineds.co/models'
import { createRawTextResource } from '../pod-adapter'
import {
  createSourceUpdateProposalInboxApproval,
} from './source-approval-commands'
import {
  renderSourceUpdateProposalTurtle,
  type SourceUpdateProposal,
} from '../../domain/source/source-approval-model'
import { createSourceIngestManifest } from '../../domain/source/source-ingest-manifest'
import { ensureSourceIngestManifestResource } from '../ingest/source-ingest-service'

function requireSourceUpdateProposalDb(db?: SolidDatabase | null): SolidDatabase {
  if (!db) throw new Error('Database not connected')
  return db
}

export const sourceUpdateProposalUseCases = {
  async create(input: {
    db?: SolidDatabase | null
    proposal: SourceUpdateProposal
    actorWebId: string
  }): Promise<string> {
    const db = requireSourceUpdateProposalDb(input.db)
    const sourceIngestManifest = createSourceIngestManifest({
      documentUri: input.proposal.documentUri,
      sourceUri: input.proposal.sourceUri,
      sourceHash: input.proposal.sourceHash,
      ingestVersion: input.proposal.ingestVersion,
      manifestUri: input.proposal.sourceIngestManifestUri,
      status: 'partial',
      lastIngestedAt: input.proposal.snapshotAt,
    })

    await ensureSourceIngestManifestResource(db, sourceIngestManifest)
    await createRawTextResource(db, {
      uri: input.proposal.proposalResourceUri,
      mimeType: 'text/turtle',
    }, renderSourceUpdateProposalTurtle(input.proposal))

    return createSourceUpdateProposalInboxApproval(db, {
      actorWebId: input.actorWebId,
      proposal: input.proposal,
    })
  },
}
