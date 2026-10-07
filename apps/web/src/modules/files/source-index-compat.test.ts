import { describe, expect, it } from 'vitest'
import * as sourceIndex from './source-index'
import * as sourceIndexService from './source-index-service'

describe('legacy source-index compatibility entrypoints', () => {
  it('exposes only read-only legacy SourceIndex manifest helpers from the source-index entrypoint', () => {
    expect(sourceIndex).toHaveProperty('resolveSourceIndexManifestUri')
    expect(sourceIndex).toHaveProperty('parseSourceIndexManifestTurtle')
    expect(sourceIndex).toHaveProperty('canReuseSourceIndexManifest')
    expect(sourceIndex).toHaveProperty('sourceIndexManifestTurtleMatches')
    expect(sourceIndex).not.toHaveProperty('createSourceIndexManifest')
    expect(sourceIndex).not.toHaveProperty('renderSourceIndexManifestTurtle')
    expect(sourceIndex).not.toHaveProperty('markSourceIndexRangeIndexed')

    expect(sourceIndex).not.toHaveProperty('createSourceIngestManifest')
    expect(sourceIndex).not.toHaveProperty('resolveSourceIngestManifestUri')
    expect(sourceIndex).not.toHaveProperty('parseSourceIngestManifestTurtle')
    expect(sourceIndex).not.toHaveProperty('renderSourceIngestManifestTurtle')
    expect(sourceIndex).not.toHaveProperty('canReuseSourceIngestManifest')
    expect(sourceIndex).not.toHaveProperty('sourceIngestManifestTurtleMatches')
    expect(sourceIndex).not.toHaveProperty('markSourceIngestRangeIngested')
  })

  it('does not expose legacy SourceIndex service writer helpers from the source-index-service entrypoint', () => {
    expect(sourceIndexService).not.toHaveProperty('ensureSourceIndexManifestResource')
    expect(sourceIndexService).not.toHaveProperty('markSourceIndexRangeIndexedResource')

    expect(sourceIndexService).not.toHaveProperty('ensureSourceIngestManifestResource')
    expect(sourceIndexService).not.toHaveProperty('markSourceIngestRangeIngestedResource')
  })
})
