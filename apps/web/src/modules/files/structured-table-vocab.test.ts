import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as helpers from './domain/structured/structured-table-vocab'

const vocabHelpersPath = 'src/modules/files/domain/structured/structured-table-vocab.ts'
const structuredPreviewPath = 'src/modules/files/features/structured/StructuredTablePreview.tsx'

describe('structured table vocab helpers', () => {
  it('keeps vocab URI and label rules in a pure helper module instead of the preview component', async () => {
    expect(existsSync(vocabHelpersPath)).toBe(true)
    if (!existsSync(vocabHelpersPath)) return

    const previewSource = readFileSync(structuredPreviewPath, 'utf8')

    expect(helpers.localPredicateLabel('https://schema.org/dateCreated')).toBe('dateCreated')
    expect(helpers.localPredicateLabel('rdf:type')).toBe('type')
    expect(helpers.resolveLocalVocabTermUri(
      'https://pod.example/.data/workspaces/ws-1/state.ttl',
      ' Review Status ',
      undefined,
      'https://pod.example/.vocab/terms.ttl',
    )).toBe('https://pod.example/.vocab/terms.ttl#review-status')
    expect(helpers.resolvePodVocabResourceUri(
      'https://pod.example/.data/workspaces/ws-1/state.ttl',
      'shapes.ttl',
    )).toBe('https://pod.example/.vocab/shapes.ttl')
    expect(helpers.resolveDiscoveredVocabTermsUri({
      public: [{ instance: null, instanceContainer: 'https://pod.example/.vocab/' }],
      private: [{ instance: 'https://pod.example/private/terms.ttl', instanceContainer: null }],
    })).toBe('https://pod.example/private/terms.ttl')
    expect(helpers.resolveSiblingVocabResourceUri('https://pod.example/.vocab/terms.ttl#ignored', 'namespaces.ttl'))
      .toBe('https://pod.example/.vocab/namespaces.ttl')

    expect(previewSource).not.toMatch(/\nfunction resolveLocalVocabTermUri\(/)
    expect(previewSource).not.toMatch(/\nfunction resolveDiscoveredVocabTermsUri\(/)
    expect(previewSource).not.toMatch(/\nfunction resolveSiblingVocabResourceUri\(/)
  })
})
