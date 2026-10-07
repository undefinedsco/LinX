import type { SolidDatabase } from '@undefineds.co/models'
import {
  createRawTextResource,
  FilesResourceReadError,
  FilesSaveConflictError,
  readRawTextResource,
  saveRawTextResource,
} from '../pod-adapter'
import {
  canReuseSourceIngestManifest,
  markSourceIngestRangeIngested,
  parseSourceIndexManifestTurtle,
  parseSourceIngestManifestTurtle,
  queueSourceIngestRanges,
  renderSourceIndexManifestTurtle,
  renderSourceIngestManifestTurtle,
  withSourceIngestLegacyAliases,
  type SourceIngestManifest,
  type SourceIngestRange,
} from '../../domain/source/source-ingest-manifest'

export type SourceIngestEnsureAction = 'created' | 'reused' | 'updated-priority' | 'replaced'
/** @deprecated Use SourceIngestEnsureAction. */
export type SourceIndexEnsureAction = SourceIngestEnsureAction

export interface SourceIngestEnsureResult {
  action: SourceIngestEnsureAction
  manifest: SourceIngestManifest
}
/** @deprecated Use SourceIngestEnsureResult. */
export type SourceIndexEnsureResult = SourceIngestEnsureResult

export interface SourceIngestRangeIngestedResult {
  action: 'marked-ingested' | 'already-ingested'
  manifest: SourceIngestManifest
}
/** @deprecated Use SourceIngestRangeIngestedResult. */
export type SourceIngestRangeIndexedResult = SourceIngestRangeIngestedResult
/** @deprecated Use SourceIngestRangeIngestedResult. */
export type SourceIndexRangeIndexedResult = SourceIngestRangeIngestedResult

function isSourceIngestManifestUri(uri: string) {
  return /\/\.data\/(?:ingest|index)\/sources\/.+\/manifest\.ttl$/.test(uri)
}

function isMissingRawTextResourceError(error: unknown, uri: string) {
  if (error instanceof FilesResourceReadError && error.kind === 'missing') return true
  if (!(error instanceof Error)) return false
  if (/\bHTTP (404|410)\b/.test(error.message)) return true
  return isSourceIngestManifestUri(uri) && /\bHTTP 403\b/.test(error.message)
}

type SourceManifestCodec = {
  parse: (source: string, manifestUri: string) => SourceIngestManifest | null
  render: (manifest: SourceIngestManifest) => string
}

const sourceIngestManifestCodec: SourceManifestCodec = {
  parse: parseSourceIngestManifestTurtle,
  render: renderSourceIngestManifestTurtle,
}

const sourceIndexManifestCodec: SourceManifestCodec = {
  parse: parseSourceIndexManifestTurtle,
  render: renderSourceIndexManifestTurtle,
}

async function ensureSourceManifestResource(
  db: SolidDatabase,
  manifest: SourceIngestManifest,
  options: {
    requestedRange?: SourceIngestRange
    requestedRanges?: SourceIngestRange[]
    requestedAt?: string
  },
  codec: SourceManifestCodec,
): Promise<SourceIngestEnsureResult> {
  const baseManifest = withSourceIngestLegacyAliases({
    ...manifest,
    writesCanonicalContent: false as const,
  })

  try {
    const existingManifestResource = await readRawTextResource(db, baseManifest.manifestUri)
    const parsedExistingManifest = codec.parse(existingManifestResource.content, baseManifest.manifestUri)

    if (parsedExistingManifest && canReuseSourceIngestManifest(parsedExistingManifest, baseManifest)) {
      const requestedRanges = options.requestedRanges?.length
        ? options.requestedRanges
        : options.requestedRange
          ? [options.requestedRange]
          : []
      const prioritized = queueSourceIngestRanges(parsedExistingManifest, requestedRanges)
      if (!prioritized.changed) return { action: 'reused', manifest: parsedExistingManifest }
      const updatedManifest = withSourceIngestLegacyAliases({
        ...prioritized.manifest,
        lastIngestedAt: options.requestedAt ?? prioritized.manifest.lastIngestedAt,
        writesCanonicalContent: false as const,
      })
      await saveRawTextResource(db, existingManifestResource, codec.render(updatedManifest))
      return { action: 'updated-priority', manifest: updatedManifest }
    }

    await saveRawTextResource(db, existingManifestResource, codec.render(baseManifest))
    return { action: 'replaced', manifest: baseManifest }
  } catch (error) {
    if (!isMissingRawTextResourceError(error, baseManifest.manifestUri)) throw error
    try {
      await createRawTextResource(db, {
        uri: baseManifest.manifestUri,
        mimeType: 'text/turtle',
      }, codec.render(baseManifest))
    } catch (createError) {
      if (!(createError instanceof FilesSaveConflictError)) throw createError
      const existingManifestResource = await readRawTextResource(db, baseManifest.manifestUri)
      const parsedExistingManifest = codec.parse(existingManifestResource.content, baseManifest.manifestUri)
      if (parsedExistingManifest && canReuseSourceIngestManifest(parsedExistingManifest, baseManifest)) {
        return { action: 'reused', manifest: parsedExistingManifest }
      }
      await saveRawTextResource(db, existingManifestResource, codec.render(baseManifest))
      return { action: 'replaced', manifest: baseManifest }
    }
    return { action: 'created', manifest: baseManifest }
  }
}

export function ensureSourceIngestManifestResource(
  db: SolidDatabase,
  manifest: SourceIngestManifest,
  options: {
    requestedRange?: SourceIngestRange
    requestedRanges?: SourceIngestRange[]
    requestedAt?: string
  } = {},
): Promise<SourceIngestEnsureResult> {
  return ensureSourceManifestResource(db, manifest, options, sourceIngestManifestCodec)
}

/** @deprecated Use ensureSourceIngestManifestResource. */
export function ensureSourceIndexManifestResource(
  db: SolidDatabase,
  manifest: SourceIngestManifest,
  options: {
    requestedRange?: SourceIngestRange
    requestedRanges?: SourceIngestRange[]
    requestedAt?: string
  } = {},
): Promise<SourceIndexEnsureResult> {
  return ensureSourceManifestResource(db, manifest, options, sourceIndexManifestCodec)
}

async function markSourceRangeIngestedResource(
  db: SolidDatabase,
  manifest: SourceIngestManifest,
  input: {
    range: SourceIngestRange
    ingestedAt?: string
  },
  codec: SourceManifestCodec,
): Promise<SourceIngestRangeIngestedResult> {
  const existingManifestResource = await readRawTextResource(db, manifest.manifestUri)
  const parsedExistingManifest = codec.parse(existingManifestResource.content, manifest.manifestUri)
  if (!parsedExistingManifest) {
    throw new Error('Cannot mark Ingest range because the manifest is unreadable.')
  }
  if (!canReuseSourceIngestManifest(parsedExistingManifest, manifest)) {
    throw new Error('Cannot mark Ingest range because the manifest source hash or ingest version changed.')
  }

  const nextManifest = markSourceIngestRangeIngested(parsedExistingManifest, {
    range: input.range,
    ingestedAt: input.ingestedAt,
  })
  if (JSON.stringify(nextManifest) === JSON.stringify(parsedExistingManifest)) {
    return { action: 'already-ingested', manifest: parsedExistingManifest }
  }

  await saveRawTextResource(db, existingManifestResource, codec.render(nextManifest))
  return { action: 'marked-ingested', manifest: nextManifest }
}

export function markSourceIngestRangeIngestedResource(
  db: SolidDatabase,
  manifest: SourceIngestManifest,
  input: {
    range: SourceIngestRange
    ingestedAt?: string
  },
): Promise<SourceIngestRangeIngestedResult> {
  return markSourceRangeIngestedResource(db, manifest, input, sourceIngestManifestCodec)
}

/** @deprecated Use markSourceIngestRangeIngestedResource. */
export function markSourceIngestRangeIndexedResource(
  db: SolidDatabase,
  manifest: SourceIngestManifest,
  input: {
    range: SourceIngestRange
    indexedAt?: string
  },
): Promise<SourceIngestRangeIndexedResult> {
  return markSourceRangeIngestedResource(db, manifest, {
    range: input.range,
    ingestedAt: input.indexedAt,
  }, sourceIngestManifestCodec)
}

/** @deprecated Use markSourceIngestRangeIngestedResource. */
export function markSourceIndexRangeIndexedResource(
  db: SolidDatabase,
  manifest: SourceIngestManifest,
  input: {
    range: SourceIngestRange
    indexedAt?: string
  },
): Promise<SourceIndexRangeIndexedResult> {
  return markSourceRangeIngestedResource(db, manifest, {
    range: input.range,
    ingestedAt: input.indexedAt,
  }, sourceIndexManifestCodec)
}
