import type { SolidDatabase } from '@undefineds.co/models'
import { createRawTextResource } from '../pod-adapter'
import {
  createSourceUpdateProposalInboxApproval,
} from '../proposal/source-approval-commands'
import { renderSourceUpdateProposalTurtle } from '../../domain/source/source-approval-model'
import {
  ensureSourceIngestManifestResource,
  markSourceIngestRangeIngestedResource,
} from './source-ingest-service'
import type {
  SourceIngestManifest,
  SourceIngestRange,
} from '../../domain/source/source-ingest-manifest'
import {
  createSourceIngestPlan,
  createSourceRefreshPlan,
  renderSourceLinkedCardTurtle,
  type SourceIngestKind,
  type SourceIngestPlan,
  type SourceRefreshPlan,
} from '../../domain/source/source-ingest'
import {
  createSourceIngestSnapshot,
  type SourceIngestAdapter,
} from './source-ingest-snapshot'

type CurrentPodRootResolver = (db: SolidDatabase) => string | null | undefined

interface SourceIngestUseCaseBaseInput {
  db?: SolidDatabase | null
  podRootUri?: string | null
  resolveCurrentPodRootUri?: CurrentPodRootResolver
}

function requireSourceIngestDb(db?: SolidDatabase | null): SolidDatabase {
  if (!db) throw new Error('Database not connected')
  return db
}

function resolvePlanPodRootUri(
  input: SourceIngestUseCaseBaseInput,
  db: SolidDatabase,
): string | undefined {
  return input.podRootUri ?? input.resolveCurrentPodRootUri?.(db) ?? undefined
}

export const sourceIngestUseCases = {
  async buildCreatePlan(input: SourceIngestUseCaseBaseInput & {
    fetchSource?: typeof fetch
    input: {
      containerUri: string
      sourceUri: string
      title: string
      sourceKind: SourceIngestKind
      mimeType?: string
      sourceHash?: string
      ingestVersion?: string
      ingestAdapter?: SourceIngestAdapter
    }
  }): Promise<SourceIngestPlan> {
    const db = requireSourceIngestDb(input.db)
    const sourceInput = input.input
    const ingestSnapshot = await createSourceIngestSnapshot({
      sourceUri: sourceInput.sourceUri,
      sourceKind: sourceInput.sourceKind,
      title: sourceInput.title,
      mimeType: sourceInput.mimeType,
      fetchSource: input.fetchSource,
      ingestAdapter: sourceInput.ingestAdapter,
    })
    if (!ingestSnapshot?.sourceHash) {
      throw new Error('Ingest source could not be read.')
    }

    return createSourceIngestPlan({
      documentUri: `${sourceInput.containerUri.replace(/\/$/, '')}/index.ttl`,
      containerUri: sourceInput.containerUri,
      sourceUri: sourceInput.sourceUri,
      sourceKind: sourceInput.sourceKind,
      title: sourceInput.title,
      mimeType: sourceInput.mimeType,
      sourceHash: sourceInput.sourceHash,
      ingestVersion: sourceInput.ingestVersion,
      ingestSnapshot,
      podRootUri: resolvePlanPodRootUri(input, db),
    })
  },

  async commitCreate(input: {
    db?: SolidDatabase | null
    actorWebId: string
    plan: SourceIngestPlan
  }): Promise<void> {
    const db = requireSourceIngestDb(input.db)

    await ensureSourceIngestManifestResource(db, input.plan.sourceIngestManifest)
    await createRawTextResource(db, {
      uri: input.plan.sourceProposal.proposalResourceUri,
      mimeType: 'text/turtle',
    }, renderSourceUpdateProposalTurtle(input.plan.sourceProposal))
    await createSourceUpdateProposalInboxApproval(db, {
      actorWebId: input.actorWebId,
      proposal: input.plan.sourceProposal,
    })
    await createRawTextResource(db, {
      uri: input.plan.targetResourceUri,
      mimeType: 'text/turtle',
    }, renderSourceLinkedCardTurtle(input.plan))
  },

  async create(input: SourceIngestUseCaseBaseInput & {
    actorWebId: string
    fetchSource?: typeof fetch
    input: {
      containerUri: string
      sourceUri: string
      title: string
      sourceKind: SourceIngestKind
      mimeType?: string
      sourceHash?: string
      ingestVersion?: string
      ingestAdapter?: SourceIngestAdapter
    }
  }): Promise<SourceIngestPlan> {
    const plan = await sourceIngestUseCases.buildCreatePlan(input)
    await sourceIngestUseCases.commitCreate({
      db: input.db,
      actorWebId: input.actorWebId,
      plan,
    })
    return plan
  },

  async buildRefreshPlan(input: SourceIngestUseCaseBaseInput & {
    fetchSource?: typeof fetch
    input: {
      documentUri: string
      subject: string
      targetResourceUri: string
      sourceUri: string
      sourceKind: SourceIngestKind
      title: string
      mimeType?: string
      currentSourceHash: string
      ingestVersion?: string
      sourceIngestManifestUri?: string
      ingestAdapter?: SourceIngestAdapter
    }
  }): Promise<SourceRefreshPlan> {
    const db = requireSourceIngestDb(input.db)
    const sourceInput = input.input
    const ingestSnapshot = await createSourceIngestSnapshot({
      sourceUri: sourceInput.sourceUri,
      sourceKind: sourceInput.sourceKind,
      title: sourceInput.title,
      mimeType: sourceInput.mimeType,
      fetchSource: input.fetchSource,
      ingestAdapter: sourceInput.ingestAdapter,
    })
    if (!ingestSnapshot?.sourceHash) {
      throw new Error('Source refresh did not return readable content.')
    }

    return createSourceRefreshPlan({
      documentUri: sourceInput.documentUri,
      subject: sourceInput.subject,
      targetResourceUri: sourceInput.targetResourceUri,
      sourceUri: sourceInput.sourceUri,
      sourceKind: sourceInput.sourceKind,
      title: sourceInput.title,
      mimeType: sourceInput.mimeType,
      currentSourceHash: sourceInput.currentSourceHash,
      ingestVersion: sourceInput.ingestVersion,
      sourceIngestManifestUri: sourceInput.sourceIngestManifestUri,
      ingestSnapshot,
      podRootUri: resolvePlanPodRootUri(input, db),
    })
  },

  async commitRefresh(input: {
    db?: SolidDatabase | null
    actorWebId: string
    plan: SourceRefreshPlan
  }): Promise<void> {
    const db = requireSourceIngestDb(input.db)

    await ensureSourceIngestManifestResource(db, input.plan.sourceIngestManifest)
    if (input.plan.sourceProposal) {
      await createRawTextResource(db, {
        uri: input.plan.sourceProposal.proposalResourceUri,
        mimeType: 'text/turtle',
      }, renderSourceUpdateProposalTurtle(input.plan.sourceProposal))
      await createSourceUpdateProposalInboxApproval(db, {
        actorWebId: input.actorWebId,
        proposal: input.plan.sourceProposal,
      })
    }
  },

  async refresh(input: SourceIngestUseCaseBaseInput & {
    actorWebId: string
    fetchSource?: typeof fetch
    input: {
      documentUri: string
      subject: string
      targetResourceUri: string
      sourceUri: string
      sourceKind: SourceIngestKind
      title: string
      mimeType?: string
      currentSourceHash: string
      ingestVersion?: string
      sourceIngestManifestUri?: string
      ingestAdapter?: SourceIngestAdapter
    }
  }): Promise<SourceRefreshPlan> {
    const plan = await sourceIngestUseCases.buildRefreshPlan(input)
    await sourceIngestUseCases.commitRefresh({
      db: input.db,
      actorWebId: input.actorWebId,
      plan,
    })
    return plan
  },

  async requestRange(input: {
    db?: SolidDatabase | null
    manifest: SourceIngestManifest
    range?: SourceIngestRange
    ranges?: SourceIngestRange[]
    requestedAt?: string
  }) {
    const db = requireSourceIngestDb(input.db)
    return ensureSourceIngestManifestResource(db, input.manifest, {
      requestedRange: input.range,
      requestedRanges: input.ranges,
      requestedAt: input.requestedAt,
    })
  },

  async markRangeIngested(input: {
    db?: SolidDatabase | null
    manifest: SourceIngestManifest
    range: SourceIngestRange
    ingestedAt?: string
  }) {
    const db = requireSourceIngestDb(input.db)
    return markSourceIngestRangeIngestedResource(db, input.manifest, {
      range: input.range,
      ingestedAt: input.ingestedAt,
    })
  },
}
