import { describe, expect, it } from 'vitest'
import {
  ensureFilesContainerUri,
  filesDataResourceUri,
  filesAppMetaResourceUri,
  filesMetaInsertDataPatch,
  filesVocabRegistryUri,
  isFilesReservedResourceUri,
  resolveFilesAppMetaOwnerUri,
  resolveFilesPodRootUri,
  turtleString,
} from './domain/resource/files-rdf-contract'

describe('files RDF contract helpers', () => {
  it('resolves normal and scoped Pod roots without confusing .data or .vocab resources for folders', () => {
    expect(resolveFilesPodRootUri('https://pod.example/.data/workspaces/ws-1/state.ttl')).toBe('https://pod.example/')
    expect(resolveFilesPodRootUri('https://pod.example/.vocab/terms.ttl')).toBe('https://pod.example/')
    expect(resolveFilesPodRootUri('https://pod.example/private/.vocab/terms.ttl')).toBe('https://pod.example/private/')
    expect(resolveFilesPodRootUri('https://pod.example/public/README.md')).toBe('https://pod.example/')
  })

  it('can infer local path-based Pod roots when a caller needs ACL/ACR style ownership', () => {
    expect(resolveFilesPodRootUri('http://localhost:44470/test/index.ttl', { inferLocalPathPod: true })).toBe('http://localhost:44470/test/')
    expect(resolveFilesPodRootUri('http://127.0.0.1:44470/test/public/report.md', { inferLocalPathPod: true })).toBe('http://127.0.0.1:44470/test/')
  })

  it('uses an explicit current Pod root for path-based Pod resources without broad path guessing', () => {
    expect(resolveFilesPodRootUri('https://node-0000.undefineds.co/alice/public/report.md', {
      currentPodRootUri: 'https://node-0000.undefineds.co/alice/',
    })).toBe('https://node-0000.undefineds.co/alice/')
    expect(resolveFilesPodRootUri('https://node-0000.undefineds.co/bob/public/report.md', {
      currentPodRootUri: 'https://node-0000.undefineds.co/alice/',
    })).toBe('https://node-0000.undefineds.co/')
    expect(resolveFilesPodRootUri('https://pod.example/public/report.md', {
      currentPodRootUri: 'https://pod.example/alice/',
    })).toBe('https://pod.example/')
  })

  it('builds Files-owned .data and .vocab resource paths from one convention', () => {
    expect(ensureFilesContainerUri('https://pod.example/private')).toBe('https://pod.example/private/')
    expect(filesDataResourceUri('https://pod.example/private', 'proposals/source/report.ttl')).toBe('https://pod.example/private/.data/proposals/source/report.ttl')
    expect(filesVocabRegistryUri('https://pod.example/private/', 'terms')).toBe('https://pod.example/private/.vocab/terms.ttl')
    expect(filesVocabRegistryUri('https://pod.example/private/', 'shapes')).toBe('https://pod.example/private/.vocab/shapes.ttl')
    expect(filesVocabRegistryUri('https://pod.example/private/', 'namespaces')).toBe('https://pod.example/private/.vocab/namespaces.ttl')
  })

  it('builds file-level .meta sidecars instead of centralized .meta containers', () => {
    expect(filesAppMetaResourceUri('https://pod.example/public/report.md')).toBe('https://pod.example/public/report.md.meta')
    expect(filesAppMetaResourceUri('https://pod.example/public/', {
      currentPodRootUri: 'https://pod.example/',
    })).toBe('https://pod.example/public/.meta')
    expect(filesAppMetaResourceUri('http://localhost:5874/test/public/report.md', {
      currentPodRootUri: 'http://localhost:5874/test/',
    })).toBe('http://localhost:5874/test/public/report.md.meta')
  })

  it('resolves app metadata document owners for sidecar actions', () => {
    expect(resolveFilesAppMetaOwnerUri('https://pod.example/public/report.md.meta')).toBe('https://pod.example/public/report.md')
    expect(resolveFilesAppMetaOwnerUri('http://localhost:5874/test/public/.meta')).toBe('http://localhost:5874/test/public/')
    expect(resolveFilesAppMetaOwnerUri('https://pod.example/.meta/public%2Freport.md.ttl')).toBe('https://pod.example/public/report.md')
    expect(resolveFilesAppMetaOwnerUri('https://pod.example/public/metadata.ttl')).toBeNull()
  })

  it('renders .meta Turtle seed content as a SPARQL INSERT DATA patch', () => {
    const patch = filesMetaInsertDataPatch('https://pod.example/public/report.md.meta', [
      '@prefix dcterms: <http://purl.org/dc/terms/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '',
      '<#meta> rdfs:label "Report" ;',
      '  dcterms:source <https://source.example/report> .',
    ].join('\n'))

    expect(patch).toContain('BASE <https://pod.example/public/report.md.meta>')
    expect(patch).toContain('PREFIX dcterms: <http://purl.org/dc/terms/>')
    expect(patch).toContain('PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>')
    expect(patch).toContain('INSERT DATA {')
    expect(patch).toContain('<#meta> rdfs:label "Report" ;')
    expect(patch).toContain('dcterms:source <https://source.example/report> .')
    expect(patch).not.toContain('@prefix')
  })

  it('treats Ingest manifests as Files-managed control resources', () => {
    expect(isFilesReservedResourceUri('https://pod.example/.data/ingest/sources/report/manifest.ttl')).toBe(true)
    expect(isFilesReservedResourceUri('https://pod.example/.data/index/sources/report/manifest.ttl')).toBe(true)
    expect(isFilesReservedResourceUri('https://pod.example/public/report.md.meta')).toBe(true)
    expect(isFilesReservedResourceUri('https://pod.example/.data/workspaces/ws-1/cards/report.ttl')).toBe(false)
  })

  it('escapes Turtle string literals consistently for Files proposal resources', () => {
    expect(turtleString('quote " slash \\ tab\tline\ncarriage\r')).toBe('"quote \\" slash \\\\ tab\\tline\\ncarriage\\r"')
  })
})
