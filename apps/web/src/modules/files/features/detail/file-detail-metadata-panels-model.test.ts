import { describe, expect, it } from 'vitest'

import type { FilesDetail, FilesMetaSidecar } from '../../domain/resource/resource-model'
import type { SourceLinkedCardDescriptor } from '../../domain/source/source-ingest'
import {
  projectFileRdfMetadataPanelModel,
  projectDetailMetaPredicateStatusChrome,
  projectSourceLinkedCardDrawerMetadataPanelModel,
  projectSourceLinkedCardMetadataPanelModel,
} from './file-detail-metadata-panels-model'

function file(overrides: Partial<FilesDetail> = {}): FilesDetail {
  return {
    id: 'report.md',
    uri: 'https://pod.example/public/report.md',
    name: 'report.md',
    kind: 'resource',
    semanticKind: 'ordinary',
    parentUri: 'https://pod.example/public/',
    mimeType: 'text/markdown',
    size: 12,
    modifiedAt: '2026-06-18T00:00:00.000Z',
    headers: {},
    previewText: null,
    ...overrides,
  }
}

function meta(overrides: Partial<FilesMetaSidecar> = {}): FilesMetaSidecar {
  return {
    ownerUri: 'https://pod.example/public/report.md',
    metaUri: 'https://pod.example/public/report.md.meta',
    state: 'exists',
    status: 200,
    content: `
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix dcterms: <http://purl.org/dc/terms/> .
      <#meta>
        rdfs:label "Meta title" ;
        udfs:tags "alpha", "beta" ;
        udfs:reviewStatus "Ready" ;
        dcterms:source <https://source.example/report> .
    `,
    mimeType: 'text/turtle',
    etag: '"1"',
    size: 100,
    ...overrides,
  }
}

describe('file detail metadata panels model', () => {
  it('projects predicate status marker chrome for pending and failed meta writes', () => {
    expect(projectDetailMetaPredicateStatusChrome({
      status: undefined,
      statusLabel: 'File title meta predicate',
    })).toBeNull()

    expect(projectDetailMetaPredicateStatusChrome({
      status: 'pending',
      statusLabel: 'File title meta predicate',
    })).toEqual({
      ariaLabel: '待审核更改：File title meta predicate',
      className: 'text-[13px] font-semibold leading-none text-primary',
      marker: '*',
      title: '待审核更改',
    })

    expect(projectDetailMetaPredicateStatusChrome({
      status: 'error',
      statusLabel: 'File title meta predicate',
    })).toEqual({
      ariaLabel: 'meta predicate 更改提交失败：File title meta predicate',
      className: 'text-[12px] font-semibold leading-none text-destructive',
      marker: '!',
      title: 'meta predicate 更改提交失败',
    })
  })

  it('projects file RDF metadata panel props from the meta sidecar owner', () => {
    const model = projectFileRdfMetadataPanelModel({
      file: file(),
      title: 'Fallback title',
      meta: meta(),
    })

    expect(model).not.toHaveProperty('typedControls')
    expect(model).toMatchObject({
      documentUri: 'https://pod.example/public/report.md.meta',
      labelPrefix: 'File',
      relation: {
        ariaLabel: 'File source meta predicate',
        label: 'source',
        predicate: 'dcterms:source',
        value: 'https://source.example/report',
        previousValues: ['<https://source.example/report>'],
      },
      reviewStatusValue: 'Ready',
      subject: '#meta',
      tagsValue: 'alpha, beta',
      titleValue: 'Meta title',
    })
  })

  it('falls back to the file title and conventional meta URI when the sidecar is not readable yet', () => {
    expect(projectFileRdfMetadataPanelModel({
      file: file(),
      title: 'Fallback title',
      meta: undefined,
    })).toMatchObject({
      documentUri: 'https://pod.example/public/report.md.meta',
      relation: {
        value: '',
        previousValues: [],
      },
      reviewStatusValue: '',
      subject: '#meta',
      tagsValue: '',
      titleValue: 'Fallback title',
    })
  })

  it('projects source-linked card metadata panel props with a body-resource fallback', () => {
    const descriptor: SourceLinkedCardDescriptor = {
      title: 'Quarterly report',
      tags: ['source-linked', 'research'],
      tagsPreviousValues: ['"source-linked"', '"research"'],
      reviewStatus: 'Needs review',
      reviewStatusPreviousValues: ['"Needs review"'],
      sourceUri: 'https://source.example/report.html',
      mimeType: 'text/html',
      sourceKind: 'url',
      sourceHash: 'sha256-url-1',
      ingestVersion: 'url-ingest-v1',
      sourceIngestManifestUri: 'https://pod.example/.data/ingest/sources/report/manifest.ttl',
      createdAt: '2026-06-18T00:00:00.000Z',
      writesCanonicalContent: false,
    }

    const model = projectSourceLinkedCardMetadataPanelModel({
      descriptor,
      documentUri: 'https://pod.example/.data/cards/report.card.ttl',
      fallbackBodyResourceUri: 'https://pod.example/.data/cards/report.md',
    })

    expect(model).not.toHaveProperty('typedControls')
    expect(model).toMatchObject({
      documentUri: 'https://pod.example/.data/cards/report.card.ttl',
      labelPrefix: 'Card',
      relation: {
        ariaLabel: 'Card relation meta predicate',
        label: 'relation',
        predicate: 'udfs:bodyResource',
        value: 'https://pod.example/.data/cards/report.md',
        previousValues: ['<https://pod.example/.data/cards/report.md>'],
      },
      reviewStatusValue: 'Needs review',
      subject: '#card',
      tagsValue: 'source-linked, research',
      titleValue: 'Quarterly report',
    })
  })

  it('parses source-linked card preview text into drawer metadata props', () => {
    const source = `
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix dcterms: <http://purl.org/dc/terms/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      <#card> a udfs:SourceLinkedCard ;
        rdfs:label "Parsed report" ;
        udfs:tags "source-linked", "research" ;
        udfs:reviewStatus "Ready" ;
        dcterms:source <https://source.example/parsed.html> ;
        dcterms:format "text/html" ;
        udfs:sourceKind "url" ;
        udfs:sourceHash "sha256-url-2" ;
        udfs:ingestVersion "url-ingest-v1" ;
        udfs:ingestManifest <https://pod.example/.data/ingest/sources/parsed/manifest.ttl> ;
        dcterms:created "2026-06-18T00:00:00.000Z" ;
        udfs:writesCanonicalContent false .
    `

    expect(projectSourceLinkedCardDrawerMetadataPanelModel(file({
      uri: 'https://pod.example/.data/cards/parsed.card.ttl',
      previewText: source,
      semanticKind: 'source-linked-card',
    }))).toMatchObject({
      documentUri: 'https://pod.example/.data/cards/parsed.card.ttl',
      relation: {
        value: 'https://pod.example/.data/cards/parsed.md',
        previousValues: ['<https://pod.example/.data/cards/parsed.md>'],
      },
      reviewStatusValue: 'Ready',
      titleValue: 'Parsed report',
    })
  })
})
