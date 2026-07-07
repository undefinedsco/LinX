import { describe, expect, it } from 'vitest'
import {
  extractFileMetaPredicateValues,
  summarizeMetaSidecarContent,
  summarizeWorkspaceMetaSidecarContent,
} from './domain/sidecar/meta-sidecar'
import { existsSync, readFileSync } from 'node:fs'

const rootMetaSidecarShimPath = 'src/modules/files/meta-sidecar.ts'
const metaSidecarModelPath = 'src/modules/files/domain/sidecar/meta-sidecar.ts'

describe('meta sidecar architecture boundary', () => {
  it('keeps RDF sidecar projection in domain/sidecar with a root compatibility shim', () => {
    expect(existsSync(metaSidecarModelPath)).toBe(true)
    expect(existsSync(rootMetaSidecarShimPath)).toBe(true)
    if (!existsSync(metaSidecarModelPath) || !existsSync(rootMetaSidecarShimPath)) return

    const rootShimSource = readFileSync(rootMetaSidecarShimPath, 'utf8')
    const modelSource = readFileSync(metaSidecarModelPath, 'utf8')

    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/sidecar\/meta-sidecar'\n?$/)
    expect(modelSource).toContain("from '../structured/structured-table'")
    expect(modelSource).not.toContain("from './structured-table'")
    expect(modelSource).not.toContain("from '../browser'")
  })
})

describe('summarizeMetaSidecarContent', () => {
  it('extracts file card source, links, and vocab schema rows from Turtle meta', () => {
    const rows = summarizeMetaSidecarContent(
      'https://pod.example/public/README.md.meta',
      'text/turtle',
      `
        @prefix dcterms: <http://purl.org/dc/terms/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix udfs: <https://undefineds.co/vocab/> .
        <#meta> dcterms:source <https://source.example/readme> ;
          rdfs:seeAlso <https://pod.example/public/spec.md> ;
          udfs:vocab <https://pod.example/.vocab/terms.ttl> ;
          udfs:shape <https://pod.example/.vocab/shapes.ttl#MarkdownFileShape> .
      `,
    )

    expect(rows).toEqual([
      ['source', 'https://source.example/readme'],
      ['links', 'https://pod.example/public/spec.md'],
      ['vocab/schema', 'https://pod.example/.vocab/shapes.ttl#MarkdownFileShape, https://pod.example/.vocab/terms.ttl'],
    ])
  })

  it('returns no summary rows when the sidecar has no semantic content', () => {
    expect(summarizeMetaSidecarContent('https://pod.example/public/README.md.meta', 'text/turtle', null)).toEqual([])
  })

  it('leaves workspace repository facts to the workspace-specific summary', () => {
    const rows = summarizeMetaSidecarContent(
      'https://pod.example/.data/workspaces/ws-1/.meta',
      'text/turtle',
      `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix git: <https://undefineds.co/vocab/git/> .

        <#workspace> udfs:repository <https://pod.example/.data/repositories/linx.ttl> ;
          git:branchName "files-module" ;
          udfs:runtimeStatus "active" .
      `,
    )

    expect(rows).toEqual([])
  })

  it('extracts repository and agent home facts from resource meta', () => {
    const rows = summarizeMetaSidecarContent(
      'https://pod.example/.data/agents/secretary/.meta',
      'text/turtle',
      `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix git: <https://undefineds.co/vocab/git/> .

        <#agent-home> a udfs:AgentHomeMeta ;
          udfs:agent <https://pod.example/.data/agents/secretary/card.ttl#agent> ;
          udfs:workspace <https://pod.example/.data/workspaces/ws-1/> ;
          udfs:repository <https://pod.example/.data/repositories/linx.ttl> ;
          git:branchName "files-module" ;
          udfs:runtimeStatus "active" .
      `,
    )

    expect(rows).toEqual([
      ['repository', 'https://pod.example/.data/repositories/linx.ttl'],
      ['agent', 'https://pod.example/.data/agents/secretary/card.ttl#agent'],
      ['workspace', 'https://pod.example/.data/workspaces/ws-1/'],
      ['branch', 'files-module'],
      ['runtime status', 'active'],
    ])
  })
})

describe('extractFileMetaPredicateValues', () => {
  it('extracts editable file RDF metadata predicates and preserves previous RDF values', () => {
    const values = extractFileMetaPredicateValues(
      'https://pod.example/public/README.md.meta',
      'text/turtle',
      `
        @prefix dcterms: <http://purl.org/dc/terms/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix udfs: <https://undefineds.co/vocab/> .
        <#meta> rdfs:label "Readme metadata title" ;
          udfs:reviewStatus "Needs review" ;
          udfs:tags "core", "rdf" ;
          dcterms:source <https://source.example/readme> .
      `,
    )

    expect(values).toEqual({
      subject: '#meta',
      title: 'Readme metadata title',
      titlePreviousValues: ['"Readme metadata title"'],
      tags: ['core', 'rdf'],
      tagsPreviousValues: ['"core"', '"rdf"'],
      reviewStatus: 'Needs review',
      reviewStatusPreviousValues: ['"Needs review"'],
      source: 'https://source.example/readme',
      sourcePreviousValues: ['<https://source.example/readme>'],
    })
  })

  it('uses the owner resource subject instead of mixing values from other sidecar subjects', () => {
    const values = extractFileMetaPredicateValues(
      'https://pod.example/public/README.md.meta',
      'text/turtle',
      `
        @prefix dcterms: <http://purl.org/dc/terms/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix udfs: <https://undefineds.co/vocab/> .
        <#audit> rdfs:label "Do not hydrate this" ;
          udfs:reviewStatus "Wrong" ;
          udfs:tags "audit" ;
          dcterms:source <https://source.example/audit> .
        <https://pod.example/public/README.md> rdfs:label "Owner resource title" ;
          udfs:reviewStatus "Ready" ;
          udfs:tags "docs", "public" ;
          dcterms:source <https://source.example/readme> .
      `,
    )

    expect(values).toEqual({
      subject: 'https://pod.example/public/README.md',
      title: 'Owner resource title',
      titlePreviousValues: ['"Owner resource title"'],
      tags: ['docs', 'public'],
      tagsPreviousValues: ['"docs"', '"public"'],
      reviewStatus: 'Ready',
      reviewStatusPreviousValues: ['"Ready"'],
      source: 'https://source.example/readme',
      sourcePreviousValues: ['<https://source.example/readme>'],
    })
  })

  it('keeps relation previous values in their original Turtle token form', () => {
    const values = extractFileMetaPredicateValues(
      'https://pod.example/public/README.md.meta',
      'text/turtle',
      `
        @prefix dcterms: <http://purl.org/dc/terms/> .
        @prefix ex: <https://source.example/> .
        <#meta> dcterms:source <../source.pdf>, ex:source .
      `,
    )

    expect(values.source).toBe('../source.pdf')
    expect(values.sourcePreviousValues).toEqual(['<../source.pdf>', 'ex:source'])
  })
})

describe('summarizeWorkspaceMetaSidecarContent', () => {
  it('extracts workspace and repository facts from Turtle meta', () => {
    const rows = summarizeWorkspaceMetaSidecarContent(
      'https://pod.example/.data/workspaces/ws-1/.meta',
      'text/turtle',
      `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix git: <https://undefineds.co/vocab/git/> .

        <#workspace> a udfs:WorkspaceMeta ;
          udfs:repository <https://pod.example/.data/repositories/linx.git> ;
          udfs:localPath "/Users/ganlu/develop/linx-files" ;
          udfs:cwd "/Users/ganlu/develop/linx-files/apps/web" ;
          git:branchName "files-module" ;
          git:branchRef "refs/heads/files-module" ;
          git:startCommit "abc123" ;
          git:currentCommit "def456" ;
          git:dirtyState "dirty" .
      `,
    )

    expect(rows).toEqual([
      ['repository', 'https://pod.example/.data/repositories/linx.git'],
      ['local path', '/Users/ganlu/develop/linx-files'],
      ['cwd', '/Users/ganlu/develop/linx-files/apps/web'],
      ['branch', 'files-module (refs/heads/files-module)'],
      ['start commit', 'abc123'],
      ['current commit', 'def456'],
      ['dirty state', 'dirty'],
    ])
  })

  it('extracts workspace metadata when the Pod is mounted below an account path', () => {
    const rows = summarizeWorkspaceMetaSidecarContent(
      'https://pod.example/test/.data/workspaces/ws-1/.meta',
      'text/turtle',
      `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix git: <https://undefineds.co/vocab/git/> .

        <./> udfs:repository <../../repositories/linx.ttl> ;
          udfs:localPath "/Users/ganlu/develop/linx-files" ;
          git:branchName "files-module" ;
          git:dirtyState "dirty" .
      `,
    )

    expect(rows).toContainEqual(['repository', 'https://pod.example/test/.data/repositories/linx.ttl'])
    expect(rows).toContainEqual(['local path', '/Users/ganlu/develop/linx-files'])
    expect(rows).toContainEqual(['branch', 'files-module'])
    expect(rows).toContainEqual(['dirty state', 'dirty'])
  })

  it('does not summarize workspace git metadata for session meta sidecars', () => {
    const rows = summarizeWorkspaceMetaSidecarContent(
      'https://pod.example/.data/sessions/s-1/.meta',
      'text/turtle',
      `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix git: <https://undefineds.co/vocab/git/> .

        <#session> a udfs:SessionMeta ;
          udfs:repository <https://pod.example/.data/repositories/linx.git> ;
          git:branchName "files-module" ;
          git:currentCommit "def456" .
      `,
    )

    expect(rows).toEqual([])
  })
})
