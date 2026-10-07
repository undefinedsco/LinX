// Deprecated compatibility entrypoint for the old SourceIndex naming.
// New Files code should import from domain/source/source-ingest-manifest.
// Keep this entrypoint read-only so new code cannot accidentally create or
// update legacy /.data/index resources through old parser/index names.
export {
  canReuseSourceIndexManifest,
  parseSourceIndexManifestTurtle,
  resolveSourceIndexManifestUri,
  sourceIndexManifestTurtleMatches,
  type SourceIndexManifest,
  type SourceIndexManifestInput,
  type SourceIndexRange,
  type SourceIndexStatus,
} from './domain/source/source-ingest-manifest'
