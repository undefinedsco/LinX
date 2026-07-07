import { describe, expect, it } from 'vitest'

import {
  buildMetaSidecarCopyPatch,
  renderCopyableMetaTriples,
  replaceMetaSidecarOwnerValue,
} from './domain/sidecar/meta-sidecar-transfer-model'

const sourceUri = 'https://pod.example/docs/source.md'
const destinationUri = 'https://pod.example/docs/destination.md'
const sourceMetaUri = `${sourceUri}.meta`
const destinationMetaUri = `${destinationUri}.meta`

describe('meta sidecar transfer model', () => {
  it('rewrites owner resource tokens without changing unrelated values', () => {
    expect(replaceMetaSidecarOwnerValue(sourceUri, sourceUri, destinationUri)).toBe(destinationUri)
    expect(replaceMetaSidecarOwnerValue('source.md', sourceUri, destinationUri)).toBe('destination.md')
    expect(replaceMetaSidecarOwnerValue('https://pod.example/docs/other.md', sourceUri, destinationUri)).toBe('https://pod.example/docs/other.md')
  })

  it('renders only copyable business metadata triples', () => {
    const content = [
      '@prefix dcterms: <http://purl.org/dc/terms/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix stat: <http://www.w3.org/ns/posix/stat#> .',
      '',
      `<${sourceUri}> a udfs:FileMeta ;`,
      '  rdfs:label "Source" ;',
      '  stat:size 123 ;',
      '  stat:mtime 456 .',
      '<source.md> udfs:reviewStatus "Ready" .',
      '<#meta> udfs:tags "alpha" .',
    ].join('\n')

    const result = renderCopyableMetaTriples(sourceMetaUri, sourceUri, destinationUri, content)

    expect(result.prefixes).toContain('PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>')
    expect(result.triples).toContain(`  <${destinationUri}> rdfs:label "Source" .`)
    expect(result.triples).toContain('  <destination.md> udfs:reviewStatus "Ready" .')
    expect(result.triples).toContain('  <#meta> udfs:tags "alpha" .')
    expect(result.triples.join('\n')).not.toContain('stat:size')
    expect(result.triples.join('\n')).not.toContain('stat:mtime')
    expect(result.triples.join('\n')).not.toContain('rdf:type')
  })

  it('builds an insert patch for copied metadata and omits empty patches', () => {
    const patch = buildMetaSidecarCopyPatch(
      sourceMetaUri,
      sourceUri,
      destinationMetaUri,
      destinationUri,
      [
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        `<${sourceUri}> rdfs:label "Source" .`,
      ].join('\n'),
    )

    expect(patch).toContain(`BASE <${destinationMetaUri}>`)
    expect(patch).toContain('INSERT DATA {')
    expect(patch).toContain(`  <${destinationUri}> rdfs:label "Source" .`)

    expect(buildMetaSidecarCopyPatch(
      sourceMetaUri,
      sourceUri,
      destinationMetaUri,
      destinationUri,
      `<${sourceUri}> a <https://undefineds.co/vocab/FileMeta> .`,
    )).toBeNull()
  })
})
