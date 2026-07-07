import { describe, expect, it, vi } from 'vitest'
import {
  applyApprovedVocabShapeProposalToTurtle,
  applyApprovedVocabTermProposalToTurtle,
  applyStructuredCellWriteProposalToTurtle,
  createStructuredCellWriteProposal,
  createVocabTermProposal,
  getStructuredClassOptions,
  projectStructuredClassScope,
  projectStructuredColumnVisibility,
  projectStructuredEffectiveViewProjection,
  projectStructuredVocabSchemaColumns,
  projectLockedVocabRegistryRows,
  projectStructuredResourceTable,
  projectStructuredTableView,
  renderStructuredProjectionAsRawText,
  buildStructuredVocabDefinitionIndex,
  projectRdfXmlTable,
  projectTurtleTable,
  renderVocabTermProposalTurtle,
  validateStructuredTableShapeConstraints,
} from './structured-table'

describe('structured cell write proposals', () => {
  it('describes a .data cell patch before approval applies the canonical write', () => {
    expect(createStructuredCellWriteProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Draft title"'],
    })).toEqual({
      id: 'https://pod.example/.data/workspaces/ws-1/state.ttl|#Workspace|title',
      kind: 'cell-write',
      status: 'pending-write',
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Draft title"'],
      writesCanonicalResource: true,
    })
  })

  it('applies a cell write proposal to an existing Turtle subject predicate', () => {
    const proposal = createStructuredCellWriteProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Draft title"'],
    })

    const nextSource = applyStructuredCellWriteProposalToTurtle(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#Workspace> a udfs:Workspace ; title "Files" ; status "active" .
    `, proposal)

    expect(nextSource).toContain('<#Workspace>')
    expect(nextSource).toContain('title "Draft title"')
    expect(nextSource).toContain('status "active"')
    expect(nextSource).not.toContain('title "Files"')
  })

  it('patches a simple Turtle predicate without reserializing unrelated source text', () => {
    const proposal = createStructuredCellWriteProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Files"'],
      nextValues: ['"Draft title"'],
    })
    const source = [
      '# keep leading comment',
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '',
      '<#Workspace> a udfs:Workspace ;',
      '  title "Files" ; # keep inline comment',
      '  status "active" .',
      '',
      '<#Other> title "Other" .',
    ].join('\n')

    const nextSource = applyStructuredCellWriteProposalToTurtle(source, proposal)

    expect(nextSource).toContain('# keep leading comment')
    expect(nextSource).toContain('  title "Draft title" ; # keep inline comment')
    expect(nextSource).toContain('  status "active" .')
    expect(nextSource).toContain('<#Other> title "Other" .')
    expect(nextSource).not.toContain('title "Files"')
  })

  it('patches Pod-expanded N-Triples without reserializing unrelated triples', () => {
    const proposal = createStructuredCellWriteProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: 'https://pod.example/.data/workspaces/ws-1/state.ttl#Workspace',
      predicate: 'https://undefineds.co/vocab/title',
      previousValues: ['"Files E2E"'],
      nextValues: ['"Draft title"'],
    })
    const source = [
      '<https://pod.example/.data/workspaces/ws-1/state.ttl#Workspace> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/Workspace> .',
      '<https://pod.example/.data/workspaces/ws-1/state.ttl#Workspace> <https://undefineds.co/vocab/title> "Files E2E" .',
      '<https://pod.example/.data/workspaces/ws-1/state.ttl#Workspace> <https://undefineds.co/vocab/mode> "read/write" .',
    ].join('\n')

    const nextSource = applyStructuredCellWriteProposalToTurtle(source, proposal)

    expect(nextSource).toContain('<https://undefineds.co/vocab/title> "Draft title" .')
    expect(nextSource).toContain('<https://undefineds.co/vocab/mode> "read/write" .')
    expect(nextSource).not.toContain('"Files E2E"')
  })

  it('rejects unsafe cell patches instead of falling back to lossy projection serialization', () => {
    const proposal = createStructuredCellWriteProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Workspace',
      predicate: 'title',
      previousValues: ['"Stale title"'],
      nextValues: ['"Draft"'],
    })
    const source = [
      '# keep leading comment',
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '<#Workspace> a udfs:Workspace ; title "Files" .',
      '<#Other> title "Other" .',
    ].join('\n')

    expect(() => applyStructuredCellWriteProposalToTurtle(source, proposal)).toThrow(
      'Cannot apply structured cell proposal without a lossless Turtle patch',
    )
  })

  it('inserts a missing predicate into an existing Turtle subject without reserializing the file', () => {
    const proposal = createStructuredCellWriteProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#Other',
      predicate: 'summary',
      previousValues: [],
      nextValues: ['"Needs review"'],
    })
    const source = [
      '# keep file comment',
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '<#Workspace> a udfs:Workspace ; title "Files" ; summary "Primary" .',
      '<#Other> a udfs:Workspace ; title "Other" .',
    ].join('\n')

    const nextSource = applyStructuredCellWriteProposalToTurtle(source, proposal)

    expect(nextSource).toContain('# keep file comment')
    expect(nextSource).toContain('<#Workspace> a udfs:Workspace ; title "Files" ; summary "Primary" .')
    expect(nextSource).toContain('<#Other> a udfs:Workspace ; title "Other" ; summary "Needs review" .')
  })

  it('appends a new subject when an approved rdf:type cell proposal targets a missing subject', () => {
    const proposal = createStructuredCellWriteProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      subject: '#NewSubject',
      predicate: 'rdf:type',
      previousValues: [],
      nextValues: ['udfs:Workspace'],
    })

    const nextSource = applyStructuredCellWriteProposalToTurtle(
      '@prefix udfs: <https://undefineds.co/vocab/> .\n<#Workspace> a udfs:Workspace ; title "Files" .',
      proposal,
    )

    expect(nextSource).toContain('<#Workspace> a udfs:Workspace ; title "Files" .')
    expect(nextSource).toContain('<#NewSubject> rdf:type udfs:Workspace')
  })
})

describe('projectRdfXmlTable', () => {
  it('describes missing XML support without exposing parser implementation wording', () => {
    vi.stubGlobal('DOMParser', undefined)
    try {
      const projection = projectRdfXmlTable('<rdf:RDF />')

      expect(projection.warnings).toEqual(['RDF/XML preview requires browser XML support.'])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('vocab term proposals', () => {
  it('creates a pending predicate proposal resource beside .vocab without modifying the business table', () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: 'minCount 0 · maxCount 1',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal).toMatchObject({
      kind: 'vocab-term-proposal',
      status: 'pending',
      operation: 'create',
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
      targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: 'minCount 0 · maxCount 1',
      createdAt: '2026-06-17T00:00:00.000Z',
      writesCanonicalVocab: false,
    })
    expect(proposal.proposalResourceUri).toMatch(
      /^https:\/\/pod\.example\/\.data\/proposals\/vocab\/summary-[a-z0-9]{7}\.ttl$/,
    )
    expect(proposal.id).toBe(`${proposal.proposalResourceUri}#proposal`)

    expect(renderVocabTermProposalTurtle(proposal)).toContain('<#proposal> a udfs:VocabTermProposal')
    expect(renderVocabTermProposalTurtle(proposal)).toContain('udfs:targetVocab <https://pod.example/.vocab/terms.ttl>')
    expect(renderVocabTermProposalTurtle(proposal)).toContain('udfs:term <https://pod.example/.vocab/terms.ttl#summary>')
    expect(renderVocabTermProposalTurtle(proposal)).toContain('rdfs:comment "Short note summary shown on cards."')
    expect(renderVocabTermProposalTurtle(proposal)).toContain('udfs:writesCanonicalVocab false')
  })

  it.each([
    ['class', 'Workspace', 'class'],
    ['predicate', 'summary', 'predicate'],
    ['enum-option', 'reviewing', 'enum-option'],
  ] as const)('targets the discovered private vocab registry for %s proposals', (_label, termName, termKind) => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: termKind === 'class' ? null : 'udfs:Workspace',
      termUri: `https://pod.example/private/.vocab/terms.ttl#${termName}`,
      termKind,
      label: termName,
      valueType: termKind,
      description: `Discovered private ${termKind}.`,
      shape: termKind === 'enum-option' ? 'predicate https://pod.example/private/.vocab/terms.ttl#mode' : 'minCount 0 · maxCount 1',
      predicate: termKind === 'enum-option' ? 'https://pod.example/private/.vocab/terms.ttl#mode' : undefined,
      targetVocabUri: 'https://pod.example/private/.vocab/terms.ttl',
      targetShapesUri: 'https://pod.example/private/.vocab/shapes.ttl',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal).toMatchObject({
      targetVocabUri: 'https://pod.example/private/.vocab/terms.ttl',
      targetShapesUri: 'https://pod.example/private/.vocab/shapes.ttl',
      termUri: `https://pod.example/private/.vocab/terms.ttl#${termName}`,
    })
    const turtle = renderVocabTermProposalTurtle(proposal)
    expect(turtle).toContain('udfs:targetVocab <https://pod.example/private/.vocab/terms.ttl>')
    expect(turtle).toContain('udfs:targetShapes <https://pod.example/private/.vocab/shapes.ttl>')
  })

  it('creates an enum option proposal without writing canonical vocab', () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#solid-modeling',
      termKind: 'enum-option',
      predicate: '#tags',
      label: 'solid-modeling',
      valueType: 'enum-option',
      description: 'Enum option for tags.',
      shape: 'predicate tags',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal.proposalResourceUri).toMatch(
      /^https:\/\/pod\.example\/\.data\/proposals\/vocab\/solid-modeling-[a-z0-9]{7}\.ttl$/,
    )
    expect(proposal.targetVocabUri).toBe('https://pod.example/.vocab/terms.ttl')
    expect(proposal.targetShapesUri).toBe('https://pod.example/.vocab/shapes.ttl')
    expect(proposal.termKind).toBe('enum-option')
    expect(proposal.predicate).toBe('https://pod.example/.vocab/terms.ttl#tags')
    expect(proposal.writesCanonicalVocab).toBe(false)
    expect(renderVocabTermProposalTurtle(proposal)).toContain('udfs:termKind "enum-option"')
    expect(renderVocabTermProposalTurtle(proposal)).toContain('udfs:predicate <https://pod.example/.vocab/terms.ttl#tags>')
    expect(renderVocabTermProposalTurtle(proposal)).toContain('udfs:writesCanonicalVocab false')
  })

  it('places path-based Pod vocab proposals under the selected current Pod root', () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://node-0000.undefineds.co/alice/public/state.ttl',
      podRootUri: 'https://node-0000.undefineds.co/alice/',
      classScope: 'udfs:Workspace',
      termUri: 'https://node-0000.undefineds.co/alice/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: 'minCount 0',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal.proposalResourceUri).toMatch(
      /^https:\/\/node-0000\.undefineds\.co\/alice\/\.data\/proposals\/vocab\/summary-[a-z0-9]{7}\.ttl$/,
    )
    expect(proposal.targetVocabUri).toBe('https://node-0000.undefineds.co/alice/.vocab/terms.ttl')
    expect(proposal.targetShapesUri).toBe('https://node-0000.undefineds.co/alice/.vocab/shapes.ttl')
  })

  it('creates a class proposal without writing canonical vocab', () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      termUri: 'https://pod.example/.vocab/terms.ttl#Note',
      termKind: 'class',
      label: 'Note',
      valueType: 'class',
      description: 'Class scope for rdf:type table filtering.',
      shape: 'rdf:type scope',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(proposal.proposalResourceUri).toMatch(
      /^https:\/\/pod\.example\/\.data\/proposals\/vocab\/note-[a-z0-9]{7}\.ttl$/,
    )
    expect(proposal.classScope).toBeNull()
    expect(proposal.termKind).toBe('class')
    expect(proposal.writesCanonicalVocab).toBe(false)
    expect(renderVocabTermProposalTurtle(proposal)).toContain('udfs:termKind "class"')
    expect(renderVocabTermProposalTurtle(proposal)).toContain('udfs:writesCanonicalVocab false')
  })

  it('rejects external term URIs because proposals only write the selected vocab registry', () => {
    expect(() => createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      termUri: 'https://schema.org/summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'External schema.org term should be referenced, not redefined.',
      shape: 'minCount 0 · maxCount 1',
      createdAt: '2026-06-17T00:00:00.000Z',
    })).toThrow('Vocab term proposals must target the selected vocab terms registry.')
  })

  it('keeps repeated vocab proposals for the same term label in distinct proposal resources', () => {
    const first = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'First definition.',
      shape: 'minCount 0',
      createdAt: '2026-06-17T00:00:00.000Z',
    })
    const second = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Second definition.',
      shape: 'minCount 1',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    expect(first.proposalResourceUri).not.toBe(second.proposalResourceUri)
    expect(first.proposalResourceUri).toMatch(
      /^https:\/\/pod\.example\/\.data\/proposals\/vocab\/summary-[a-z0-9]{7}\.ttl$/,
    )
    expect(second.proposalResourceUri).toMatch(
      /^https:\/\/pod\.example\/\.data\/proposals\/vocab\/summary-[a-z0-9]{7}\.ttl$/,
    )
  })

  it('applies an approved proposal to canonical terms without duplicating the term', () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: 'minCount 0 · maxCount 1',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    const nextSource = applyApprovedVocabTermProposalToTurtle('@prefix udfs: <https://undefineds.co/vocab/> .\n', proposal)

    expect(nextSource).toContain('<https://pod.example/.vocab/terms.ttl#summary> a udfs:PredicateTerm')
    expect(nextSource).toContain('rdfs:label "summary"')
    expect(nextSource).toContain('udfs:valueType "text"')
    expect(nextSource).toContain(`udfs:sourceProposal <${proposal.id}>`)
    expect(applyApprovedVocabTermProposalToTurtle(nextSource, proposal)).toBe(nextSource)
  })

  it('applies an approved proposal to canonical shapes without duplicating the shape rule', () => {
    const proposal = createVocabTermProposal({
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
      classScope: 'udfs:Workspace',
      termUri: 'https://pod.example/.vocab/terms.ttl#summary',
      termKind: 'predicate',
      label: 'summary',
      valueType: 'text',
      description: 'Short note summary shown on cards.',
      shape: 'minCount 0 · maxCount 1',
      createdAt: '2026-06-17T00:00:00.000Z',
    })

    const nextSource = applyApprovedVocabShapeProposalToTurtle('', proposal)

    expect(nextSource).toContain('<https://pod.example/.vocab/shapes.ttl#summary-shape> a udfs:ShapeRule')
    expect(nextSource).toContain('udfs:term <https://pod.example/.vocab/terms.ttl#summary>')
    expect(nextSource).toContain('udfs:constraint "minCount 0 · maxCount 1"')
    expect(nextSource).toContain('udfs:classScope "udfs:Workspace"')
    expect(nextSource).toContain(`udfs:sourceProposal <${proposal.id}>`)
    expect(applyApprovedVocabShapeProposalToTurtle(nextSource, proposal)).toBe(nextSource)
  })
})

describe('projectTurtleTable', () => {
  it('projects basic Turtle triples into subject rows and predicate columns', () => {
    const projection = projectTurtleTable(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#Workspace> a udfs:Workspace ;
        udfs:title "LinX Files" ;
        udfs:tag "core", "rdf" .
      <#Run> udfs:title "Parser run" .
    `)

    expect(projection.prefixes).toEqual({
      udfs: 'https://undefineds.co/vocab/',
    })
    expect(projection.predicates).toEqual(['rdf:type', 'udfs:tag', 'udfs:title'])
    expect(projection.rows).toEqual([
      {
        subject: '#Run',
        cells: [
          { predicate: 'udfs:title', values: ['"Parser run"'] },
        ],
      },
      {
        subject: '#Workspace',
        cells: [
          { predicate: 'rdf:type', values: ['udfs:Workspace'] },
          { predicate: 'udfs:tag', values: ['"core"', '"rdf"'] },
          { predicate: 'udfs:title', values: ['"LinX Files"'] },
        ],
      },
    ])
  })

  it('keeps dots inside literals and IRIs intact', () => {
    const projection = projectTurtleTable(`
      <https://pod.example/.data/state.ttl#this> <https://schema.org/name> "v1.2.3 # stable" .
    `)

    expect(projection.rows).toEqual([
      {
        subject: 'https://pod.example/.data/state.ttl#this',
        cells: [
          { predicate: 'https://schema.org/name', values: ['"v1.2.3 # stable"'] },
        ],
      },
    ])
  })

  it('keeps escaped quotes and typed literals as values', () => {
    const projection = projectTurtleTable(`
      <#Doc> <#title> "The \\"Files\\" module" ;
        <#updated> "2026-06-16"^^<http://www.w3.org/2001/XMLSchema#date> .
    `)

    expect(projection.rows[0].cells).toEqual([
      { predicate: '#title', values: ['"The \\"Files\\" module"'] },
      { predicate: '#updated', values: ['"2026-06-16"^^<http://www.w3.org/2001/XMLSchema#date>'] },
    ])
  })

  it('keeps decimal literals and dotted prefixed terms intact', () => {
    const projection = projectTurtleTable(`
      @prefix ex: <https://example.com/vocab#> .
      ex:file.name ex:score 1.23 ;
        ex:release.version ex:v1.2 .
    `)

    expect(projection.rows).toEqual([
      {
        subject: 'ex:file.name',
        cells: [
          { predicate: 'ex:release.version', values: ['ex:v1.2'] },
          { predicate: 'ex:score', values: ['1.23'] },
        ],
      },
    ])
    expect(projection.warnings).toEqual([])
  })

  it('projects default prefix, base iri, and SPARQL PREFIX directives without warnings', () => {
    const projection = projectTurtleTable(`
      @prefix : <https://pod.example/default#> .
      @base <https://pod.example/.data/> .
      PREFIX schema: <https://schema.org/>
      <state.ttl#Card> a :Card ;
        schema:name "Card first" ;
        <relations/source> <docs/source.md> .
    `)

    expect(projection.prefixes).toEqual({
      '': 'https://pod.example/default#',
      schema: 'https://schema.org/',
    })
    expect(projection.rows).toEqual([
      {
        subject: 'https://pod.example/.data/state.ttl#Card',
        cells: [
          { predicate: 'rdf:type', values: [':Card'] },
          { predicate: 'https://pod.example/.data/relations/source', values: ['https://pod.example/.data/docs/source.md'] },
          { predicate: 'schema:name', values: ['"Card first"'] },
        ],
      },
    ])
    expect(projection.warnings).toEqual([])
  })

  it('warns for incomplete statements without throwing', () => {
    const projection = projectTurtleTable(`
      <#Complete> <#label> "ok" .
      <#Broken> <#label> "missing dot"
    `)

    expect(projection.rows).toEqual([
      {
        subject: '#Complete',
        cells: [
          { predicate: '#label', values: ['"ok"'] },
        ],
      },
    ])
    expect(projection.warnings).toEqual([
      'Skipped incomplete Turtle statement: <#Broken> <#label> "missing dot"',
    ])
  })

  it('returns an empty projection for empty or comment-only Turtle', () => {
    const projection = projectTurtleTable(`
      # no data yet
    `)

    expect(projection.predicates).toEqual([])
    expect(projection.rows).toEqual([])
    expect(projection.warnings).toEqual([])
  })

  it('dispatches JSON-LD resources to a JSON-LD projection instead of Turtle parsing', () => {
    const projection = projectStructuredResourceTable({
      uri: 'https://pod.example/public/schema.jsonld',
      mimeType: 'application/ld+json',
      source: JSON.stringify({
        '@context': {
          schema: 'https://schema.org/',
        },
        '@id': '#Profile',
        '@type': ['schema:Person'],
        'schema:name': 'Ada Lovelace',
        'schema:url': { '@id': 'https://example.com/ada' },
      }),
    })

    expect(projection.prefixes).toEqual({
      schema: 'https://schema.org/',
    })
    expect(projection.predicates).toEqual(['rdf:type', 'schema:name', 'schema:url'])
    expect(projection.rows).toEqual([
      {
        subject: '#Profile',
        cells: [
          { predicate: 'rdf:type', values: ['schema:Person'] },
          { predicate: 'schema:name', values: ['"Ada Lovelace"'] },
          { predicate: 'schema:url', values: ['https://example.com/ada'] },
        ],
      },
    ])
    expect(projection.warnings).toEqual([])
  })

  it('scopes rows by rdf:type class and removes rdf:type from visible schema columns', () => {
    const projection = projectTurtleTable(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#Workspace> a udfs:Workspace ; udfs:title "Files" ; udfs:status "active" .
      <#Page> a udfs:Page ; udfs:title "Grant" ; udfs:url <https://example.com/grant> .
    `)

    expect(getStructuredClassOptions(projection)).toEqual(['udfs:Page', 'udfs:Workspace'])

    const workspaceScope = projectStructuredClassScope(projection, 'udfs:Workspace')

    expect(workspaceScope.className).toBe('udfs:Workspace')
    expect(workspaceScope.predicates).toEqual(['udfs:status', 'udfs:title'])
    expect(workspaceScope.rows).toEqual([
      {
        subject: '#Workspace',
        cells: [
          { predicate: 'udfs:status', values: ['"active"'] },
          { predicate: 'udfs:title', values: ['"Files"'] },
        ],
      },
    ])

    const pageScope = projectStructuredClassScope(projection, 'udfs:Page')
    expect(pageScope.predicates).toEqual(['udfs:title', 'udfs:url'])
    expect(pageScope.rows.map((row) => row.subject)).toEqual(['#Page'])
  })

  it('prefers SourceIngestManifest over legacy SourceIndexManifest for class scope defaults', () => {
    const projection = projectTurtleTable(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#manifest> a udfs:SourceIngestManifest, udfs:SourceIndexManifest ;
        udfs:sourceHash "sha256-source" ;
        udfs:ingestStatus "partial" .
      <#legacyManifest> a udfs:SourceIndexManifest ;
        udfs:sourceHash "sha256-legacy" .
    `)

    const scoped = projectStructuredClassScope(projection, null)

    expect(scoped.className).toBe('udfs:SourceIngestManifest')
    expect(scoped.classOptions[0]).toBe('udfs:SourceIngestManifest')
    expect(scoped.rows.map((row) => row.subject)).toEqual(['#manifest'])

    const legacyScoped = projectStructuredClassScope(projection, 'udfs:SourceIndexManifest')
    expect(legacyScoped.className).toBe('udfs:SourceIndexManifest')
    expect(legacyScoped.rows.map((row) => row.subject)).toEqual(['#legacyManifest', '#manifest'])
  })

  it('requires a class scope instead of rendering untyped projections as a mixed table', () => {
    const projection = projectTurtleTable('<#Note> <#title> "Loose note" .')
    const scoped = projectStructuredClassScope(projection, null)

    expect(scoped.className).toBeNull()
    expect(scoped.classOptions).toEqual([])
    expect(scoped.predicates).toEqual([])
    expect(scoped.rows).toEqual([])
  })

  it('recognizes Pod-expanded RDF type triples as class scope input', () => {
    const repositorySubject = 'https://pod.example/.data/repositories/repository.ttl#Repository'
    const labelPredicate = 'http://www.w3.org/2000/01/rdf-schema#label'
    const branchPredicate = 'https://undefineds.co/vocab/defaultBranch'
    const projection = projectStructuredResourceTable({
      uri: 'https://pod.example/.data/repositories/repository.ttl',
      mimeType: 'text/turtle',
      source: [
        `<${repositorySubject}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/Repository> .`,
        `<${repositorySubject}> <${labelPredicate}> "LinX Repository Smoke" .`,
        `<${repositorySubject}> <${branchPredicate}> "main" .`,
      ].join('\n'),
    })
    const scoped = projectStructuredClassScope(projection, null)

    expect(projection.predicates).toEqual(['rdf:type', labelPredicate, branchPredicate])
    expect(scoped.className).toBe('https://undefineds.co/vocab/Repository')
    expect(scoped.predicates).toEqual([labelPredicate, branchPredicate])
    expect(scoped.rows).toEqual([
      {
        subject: repositorySubject,
        cells: [
          { predicate: labelPredicate, values: ['"LinX Repository Smoke"'] },
          { predicate: branchPredicate, values: ['"main"'] },
        ],
      },
    ])
  })

  it('preserves a requested class scope for empty projections only', () => {
    const emptyProjection = projectTurtleTable('@prefix udfs: <https://undefineds.co/vocab/> .')
    const emptyScoped = projectStructuredClassScope(emptyProjection, 'udfs:Workspace')

    expect(emptyScoped.className).toBe('udfs:Workspace')
    expect(emptyScoped.classOptions).toEqual([])
    expect(emptyScoped.rows).toEqual([])

    const populatedProjection = projectTurtleTable(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#Page> a udfs:Page ; title "Grant" .
    `)
    const populatedScoped = projectStructuredClassScope(populatedProjection, 'udfs:Workspace')

    expect(populatedScoped.className).toBe('udfs:Page')
    expect(populatedScoped.rows.map((row) => row.subject)).toEqual(['#Page'])
  })

  it('filters scoped rows by subject, predicate, and value text', () => {
    const projection = projectStructuredClassScope(projectTurtleTable(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#a> a udfs:Task ; title "Draft" ; status "todo" .
      <#b> a udfs:Task ; title "Ship" ; status "done" .
    `), 'udfs:Task')

    expect(projectStructuredTableView(projection, { searchText: 'ship' }).rows.map((row) => row.subject)).toEqual(['#b'])
    expect(projectStructuredTableView(projection, { searchText: 'status' }).rows.map((row) => row.subject)).toEqual(['#a', '#b'])
    expect(projectStructuredTableView(projection, { searchText: '#a' }).rows.map((row) => row.subject)).toEqual(['#a'])
  })

  it('sorts scoped rows by subject or predicate value', () => {
    const projection = projectStructuredClassScope(projectTurtleTable(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#b> a udfs:Task ; title "B" ; rank 2 .
      <#a> a udfs:Task ; title "A" ; rank 10 .
    `), 'udfs:Task')

    expect(projectStructuredTableView(projection, { sortKey: 'subject', sortDirection: 'desc' }).rows.map((row) => row.subject)).toEqual(['#b', '#a'])
    expect(projectStructuredTableView(projection, { sortKey: 'rank', sortDirection: 'asc' }).rows.map((row) => row.subject)).toEqual(['#b', '#a'])
  })

  it('hides predicate columns without mutating the scoped projection', () => {
    const projection = projectStructuredClassScope(projectTurtleTable(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#a> a udfs:Task ; title "A" ; status "todo" ; owner "me" .
    `), 'udfs:Task')

    const visible = projectStructuredColumnVisibility(projection, new Set(['status']))

    expect(visible.predicates).toEqual(['owner', 'title'])
    expect(visible.rows[0].cells).toEqual([
      { predicate: 'owner', values: ['"me"'] },
      { predicate: 'title', values: ['"A"'] },
    ])
    expect(projection.predicates).toEqual(['owner', 'status', 'title'])
  })

  it('builds a shared effective projection from pending cell writes and visible predicates', () => {
    const projection = projectStructuredClassScope(projectTurtleTable(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#a> a udfs:Task ; title "A" ; status "todo" ; owner "me" .
      <#b> a udfs:Task ; title "B" ; status "done" ; owner "you" .
    `), 'udfs:Task')
    const pendingStatus = createStructuredCellWriteProposal({
      documentUri: 'https://pod.example/.data/tasks.ttl',
      subject: '#a',
      predicate: 'status',
      previousValues: ['"todo"'],
      nextValues: ['"blocked"'],
    })

    const effective = projectStructuredEffectiveViewProjection(projection, {
      documentUri: 'https://pod.example/.data/tasks.ttl',
      pendingCellWriteProposals: [pendingStatus],
      hiddenPredicates: new Set(['owner']),
    })

    expect(effective.predicates).toEqual(['status', 'title'])
    expect(effective.rows[0].cells).toEqual([
      { predicate: 'status', values: ['"blocked"'] },
      { predicate: 'title', values: ['"A"'] },
    ])
    expect(effective.rows[1].cells).toEqual([
      { predicate: 'status', values: ['"done"'] },
      { predicate: 'title', values: ['"B"'] },
    ])
    expect(projection.rows[0].cells.find((cell) => cell.predicate === 'status')?.values).toEqual(['"todo"'])
  })

  it('renders effective structured projections as raw text without hidden predicates', () => {
    const projection = projectStructuredEffectiveViewProjection(projectStructuredClassScope(projectTurtleTable(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#a> a udfs:Task ; title "A" ; status "todo" ; owner "me" .
    `), 'udfs:Task'), {
      documentUri: 'https://pod.example/.data/tasks.ttl',
      pendingCellWriteProposals: [
        createStructuredCellWriteProposal({
          documentUri: 'https://pod.example/.data/tasks.ttl',
          subject: '#a',
          predicate: 'status',
          previousValues: ['"todo"'],
          nextValues: ['"blocked"'],
        }),
      ],
      hiddenPredicates: new Set(['owner']),
    })

    const raw = renderStructuredProjectionAsRawText(projection)

    expect(raw).toContain('@prefix udfs: <https://undefineds.co/vocab/> .')
    expect(raw).toContain('status "blocked"')
    expect(raw).toContain('title "A"')
    expect(raw).not.toContain('rdf:type')
    expect(raw).not.toContain('owner')
    expect(raw).not.toContain('"todo"')
  })

  it('projects locked vocab registries into fixed term metadata rows', () => {
    const rows = projectLockedVocabRegistryRows(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      <#tags> a udfs:Predicate ;
        rdfs:label "tags" ;
        rdfs:comment "Topic labels" ;
        udfs:range "skos:Concept" ;
        udfs:shape <#TagsShape> ;
        udfs:deprecated false .
      <#oldField> a udfs:Predicate ;
        udfs:deprecated true .
    `)

    expect(rows).toEqual([
      {
        registryKind: 'terms',
        uri: '#oldField',
        label: 'oldField',
        definition: '',
        kind: 'udfs:Predicate',
        range: '',
        status: 'deprecated',
        shape: '',
        predicate: '',
        term: '',
        classScope: '',
        constraint: '',
        prefix: '',
        namespace: '',
      },
      {
        registryKind: 'terms',
        uri: '#tags',
        label: 'tags',
        definition: 'Topic labels',
        kind: 'udfs:Predicate',
        range: 'skos:Concept',
        status: 'active',
        shape: '#TagsShape',
        predicate: '',
        term: '',
        classScope: '',
        constraint: '',
        prefix: '',
        namespace: '',
      },
    ])
  })

  it('uses vocab valueType as the predicate range/type when approved proposals omit udfs:range', () => {
    const turtleRows = projectLockedVocabRegistryRows(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      <#mode> a udfs:PredicateTerm ;
        rdfs:label "mode" ;
        udfs:valueType "multi-select" .
    `)
    const nTriplesRows = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/terms.ttl',
      mimeType: 'text/turtle',
      source: [
        '<https://pod.example/.vocab/terms.ttl#published> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://undefineds.co/vocab/PredicateTerm> .',
        '<https://pod.example/.vocab/terms.ttl#published> <http://www.w3.org/2000/01/rdf-schema#label> "Published flag" .',
        '<https://pod.example/.vocab/terms.ttl#published> <https://undefineds.co/vocab/valueType> "boolean" .',
      ].join('\n'),
    })
    const index = buildStructuredVocabDefinitionIndex({ terms: [...turtleRows, ...nTriplesRows] })

    expect(turtleRows[0]).toMatchObject({
      uri: '#mode',
      range: 'multi-select',
    })
    expect(nTriplesRows[0]).toMatchObject({
      uri: 'https://pod.example/.vocab/terms.ttl#published',
      label: 'Published flag',
      kind: 'https://undefineds.co/vocab/PredicateTerm',
      range: 'boolean',
    })
    expect(index.predicates.get('#mode')?.valueType).toBe('multi-select')
    expect(index.predicates.get('#published')?.valueType).toBe('boolean')
  })

  it('preserves SHACL class ranges in vocab rows while projecting relation value types for table cells', () => {
    const rows = projectLockedVocabRegistryRows(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix schema: <https://schema.org/> .
      <#owner> a udfs:PredicateTerm ;
        rdfs:label "owner" ;
        sh:class schema:Person .
    `)
    const index = buildStructuredVocabDefinitionIndex({ terms: rows })

    expect(rows[0]).toMatchObject({
      uri: '#owner',
      range: 'schema:Person',
    })
    expect(index.predicates.get('#owner')?.valueType).toBe('relation')
  })

  it('normalizes RDF Schema ranges into table value types for cell behavior', () => {
    const rows = projectLockedVocabRegistryRows(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      @prefix schema: <https://schema.org/> .
      @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
      <#owner> a udfs:PredicateTerm ; rdfs:label "owner" ; rdfs:range schema:Person .
      <#due> a udfs:PredicateTerm ; rdfs:label "due" ; rdfs:range xsd:date .
      <#published> a udfs:PredicateTerm ; rdfs:label "published" ; rdfs:range xsd:boolean .
      <#count> a udfs:PredicateTerm ; rdfs:label "count" ; rdfs:range xsd:integer .
      <#title> a udfs:PredicateTerm ; rdfs:label "title" ; rdfs:range xsd:string .
      <#label> a udfs:PredicateTerm ; rdfs:label "label" ; rdfs:range rdf:langString .
    `)
    const index = buildStructuredVocabDefinitionIndex({ terms: rows })

    expect(index.predicates.get('#owner')?.valueType).toBe('relation')
    expect(index.predicates.get('#due')?.valueType).toBe('date')
    expect(index.predicates.get('#published')?.valueType).toBe('boolean')
    expect(index.predicates.get('#count')?.valueType).toBe('number')
    expect(index.predicates.get('#title')?.valueType).toBe('text')
    expect(index.predicates.get('#label')?.valueType).toBe('text')
  })

  it('uses shape-only SHACL class ranges as predicate definitions for schema-only columns', () => {
    const shapes = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/shapes.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix sh: <http://www.w3.org/ns/shacl#> .
        @prefix schema: <https://schema.org/> .
        <#owner-shape> a udfs:ShapeRule ;
          sh:path udfs:owner ;
          sh:targetClass udfs:Workspace ;
          sh:class schema:Person .
      `,
      registryKind: 'shapes',
    })
    const index = buildStructuredVocabDefinitionIndex({ terms: [], shapes })

    expect(index.predicates.get('udfs:owner')).toMatchObject({
      uri: 'udfs:owner',
      label: 'owner',
      valueType: 'relation',
      shapeRules: [
        expect.objectContaining({
          uri: '#owner-shape',
          classScope: 'udfs:Workspace',
        }),
      ],
    })
  })

  it('uses shape-only SHACL datatype IRIs as predicate value types for schema-only columns', () => {
    const shapes = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/shapes.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix sh: <http://www.w3.org/ns/shacl#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
        <#due-shape> a udfs:ShapeRule ;
          sh:path udfs:due ;
          sh:targetClass udfs:Workspace ;
          sh:datatype <http://www.w3.org/2001/XMLSchema#date> .
        <#published-shape> a udfs:ShapeRule ;
          sh:path udfs:published ;
          sh:targetClass udfs:Workspace ;
          sh:datatype xsd:boolean .
        <#count-shape> a udfs:ShapeRule ;
          sh:path udfs:count ;
          sh:targetClass udfs:Workspace ;
          sh:datatype xsd:integer .
      `,
      registryKind: 'shapes',
    })
    const index = buildStructuredVocabDefinitionIndex({ terms: [], shapes })

    expect(index.predicates.get('udfs:due')?.valueType).toBe('date')
    expect(index.predicates.get('udfs:published')?.valueType).toBe('boolean')
    expect(index.predicates.get('udfs:count')?.valueType).toBe('number')
  })

  it('aliases registered prefixed terms and full IRIs through the namespace registry', () => {
    const terms = projectLockedVocabRegistryRows(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      <schema:dateModified> a udfs:PredicateTerm ;
        rdfs:label "date modified" ;
        udfs:valueType "date" .
    `)
    const namespaces = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/namespaces.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix sh: <http://www.w3.org/ns/shacl#> .
        <#schema> a udfs:Namespace ;
          sh:prefix "schema" ;
          sh:namespace "https://schema.org/" .
      `,
    })

    const index = buildStructuredVocabDefinitionIndex({ terms, namespaces })

    expect(index.namespaces.get('schema')).toBe('https://schema.org/')
    expect(index.predicates.get('schema:dateModified')?.valueType).toBe('date')
    expect(index.predicates.get('https://schema.org/dateModified')?.valueType).toBe('date')
  })

  it('uses udfs:predicate as the actual table predicate while keeping the local registry term', () => {
    const terms = projectLockedVocabRegistryRows(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      <#summary> a udfs:PredicateTerm ;
        rdfs:label "Summary" ;
        udfs:valueType "text" ;
        udfs:predicate <https://schema.org/summary> .
    `)
    const shapes = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/shapes.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix sh: <http://www.w3.org/ns/shacl#> .
        <#summary-required> a udfs:ShapeRule ;
          udfs:term <#summary> ;
          sh:minCount 1 .
      `,
    })
    const index = buildStructuredVocabDefinitionIndex({ terms, shapes })
    const scoped = projectStructuredClassScope(projectTurtleTable(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      <#Card> a udfs:Card .
    `), 'udfs:Card')

    expect(index.predicates.get('#summary')?.predicateUri).toBe('https://schema.org/summary')
    expect(index.predicates.get('https://schema.org/summary')?.uri).toBe('#summary')

    const schemaProjection = projectStructuredVocabSchemaColumns(scoped, index, 'udfs:Card')
    expect(schemaProjection.predicates).toEqual(['https://schema.org/summary'])
    expect(validateStructuredTableShapeConstraints(schemaProjection, index, 'udfs:Card')).toEqual([
      expect.objectContaining({
        subject: '#Card',
        predicate: 'https://schema.org/summary',
        rule: 'minCount 1',
      }),
    ])
  })

  it('uses explicit enum option predicate relations before legacy shape strings', () => {
    const terms = projectLockedVocabRegistryRows(`
      @prefix udfs: <https://undefineds.co/vocab/> .
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      <#tags> a udfs:PredicateTerm ;
        rdfs:label "tags" ;
        udfs:valueType "enum" .
      <#core> a udfs:EnumOptionTerm ;
        rdfs:label "core" ;
        rdfs:comment "Core topic." ;
        udfs:predicate <#tags> .
      <#legacy> a udfs:EnumOptionTerm ;
        rdfs:label "legacy" ;
        udfs:shape "predicate #tags" .
    `)

    const index = buildStructuredVocabDefinitionIndex({ terms })

    expect(index.enumOptionsByPredicate.get('#tags')).toEqual([
      {
        uri: '#core',
        label: 'core',
        description: 'Core topic.',
        status: 'active',
      },
      {
        uri: '#legacy',
        label: 'legacy',
        description: '',
        status: 'active',
      },
    ])
  })

  it('projects JSON-LD locked vocab registries through the same fixed term metadata rows', () => {
    const rows = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/domain.jsonld',
      mimeType: 'application/ld+json',
      source: JSON.stringify({
        '@context': {
          udfs: 'https://undefineds.co/vocab/',
          rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
        },
        '@graph': [
          {
            '@id': '#tags',
            '@type': 'udfs:Predicate',
            'rdfs:label': 'tags',
            'rdfs:comment': 'Topic labels',
            'udfs:range': 'skos:Concept',
            'udfs:shape': { '@id': '#TagsShape' },
          },
        ],
      }),
    })

    expect(rows).toEqual([
      {
        registryKind: 'terms',
        uri: '#tags',
        label: 'tags',
        definition: 'Topic labels',
        kind: 'udfs:Predicate',
        range: 'skos:Concept',
        status: 'active',
        shape: '#TagsShape',
        predicate: '',
        term: '',
        classScope: '',
        constraint: '',
        prefix: '',
        namespace: '',
      },
    ])
  })

  it('projects RDF/XML locked vocab registries through the same fixed term metadata rows', () => {
    const rows = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/domain.rdf',
      mimeType: 'application/rdf+xml',
      source: `<?xml version="1.0"?>
        <rdf:RDF
          xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
          xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
          xmlns:udfs="https://undefineds.co/vocab/">
          <rdf:Description rdf:about="#tags">
            <rdf:type rdf:resource="https://undefineds.co/vocab/Predicate" />
            <rdfs:label>tags</rdfs:label>
            <rdfs:comment>Topic labels</rdfs:comment>
            <udfs:range>skos:Concept</udfs:range>
            <udfs:shape rdf:resource="#TagsShape" />
          </rdf:Description>
        </rdf:RDF>`,
    })

    expect(rows).toEqual([
      {
        registryKind: 'terms',
        uri: '#tags',
        label: 'tags',
        definition: 'Topic labels',
        kind: 'udfs:Predicate',
        range: 'skos:Concept',
        status: 'active',
        shape: '#TagsShape',
        predicate: '',
        term: '',
        classScope: '',
        constraint: '',
        prefix: '',
        namespace: '',
      },
    ])
  })

  it('projects locked shape registries into shape metadata rows', () => {
    const rows = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/shapes.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        <#summary-shape> a udfs:ShapeRule ;
          rdfs:label "Summary shape" ;
          udfs:term <https://pod.example/.vocab/terms.ttl#summary> ;
          udfs:classScope "udfs:Workspace" ;
          udfs:constraint "minCount 0 · maxCount 1" ;
          udfs:status "pending" .
      `,
    })

    expect(rows).toEqual([
      {
        registryKind: 'shapes',
        uri: '#summary-shape',
        label: 'Summary shape',
        definition: '',
        kind: 'udfs:ShapeRule',
        range: '',
        status: 'pending',
        shape: '',
        predicate: '',
        term: 'https://pod.example/.vocab/terms.ttl#summary',
        classScope: 'udfs:Workspace',
        constraint: 'minCount 0 · maxCount 1',
        prefix: '',
        namespace: '',
      },
    ])
  })

  it('projects locked namespace registries into namespace metadata rows', () => {
    const rows = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/namespaces.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix sh: <http://www.w3.org/ns/shacl#> .
        <#schema> a udfs:Namespace ;
          sh:prefix "schema" ;
          sh:namespace "https://schema.org/" ;
          rdfs:comment "Schema.org terms" .
      `,
    })

    expect(rows).toEqual([
      {
        registryKind: 'namespaces',
        uri: '#schema',
        label: 'schema',
        definition: 'Schema.org terms',
        kind: 'udfs:Namespace',
        range: '',
        status: 'active',
        shape: '',
        predicate: '',
        term: '',
        classScope: '',
        constraint: '',
        prefix: 'schema',
        namespace: 'https://schema.org/',
      },
    ])
  })

  it('builds a definition index from terms and shapes registries for table editors', () => {
    const terms = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/terms.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        <#Workspace> a udfs:ClassTerm ;
          rdfs:label "Workspace" ;
          rdfs:comment "A personal workspace." ;
          udfs:status "active" .
        <#tags> a udfs:PredicateTerm ;
          rdfs:label "tags" ;
          rdfs:comment "Topic labels." ;
          udfs:range "enum" ;
          udfs:shape <#TagsShape> ;
          udfs:status "active" .
        <#core> a udfs:EnumOptionTerm ;
          rdfs:label "core" ;
          rdfs:comment "Core topic." ;
          udfs:shape "predicate #tags" .
        <#draft> a udfs:EnumOptionTerm ;
          rdfs:label "draft" ;
          udfs:shape "predicate #status" ;
          udfs:status "ai-pending" .
      `,
    })
    const shapes = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/shapes.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        <#tags-shape> a udfs:ShapeRule ;
          rdfs:label "Tags shape" ;
          udfs:term <https://pod.example/.vocab/terms.ttl#tags> ;
          udfs:classScope "udfs:Workspace" ;
          udfs:constraint "minCount 0 · maxCount 5" ;
          udfs:status "active" .
      `,
    })

    const index = buildStructuredVocabDefinitionIndex({ terms, shapes })

    expect(index.classes.get('#Workspace')).toMatchObject({
      uri: '#Workspace',
      label: 'Workspace',
      description: 'A personal workspace.',
      status: 'active',
    })
    expect(index.predicates.get('#tags')).toMatchObject({
      uri: '#tags',
      label: 'tags',
      description: 'Topic labels.',
      valueType: 'enum',
      status: 'active',
      shape: '#TagsShape',
    })
    expect(index.predicates.get('#tags')?.shapeRules).toEqual([
      {
        uri: '#tags-shape',
        label: 'Tags shape',
        classScope: 'udfs:Workspace',
        constraint: 'minCount 0 · maxCount 5',
        status: 'active',
      },
    ])
    expect(index.enumOptionsByPredicate.get('#tags')).toEqual([
      {
        uri: '#core',
        label: 'core',
        description: 'Core topic.',
        status: 'active',
      },
    ])
    expect(index.enumOptionsByPredicate.get('#status')).toEqual([
      {
        uri: '#draft',
        label: 'draft',
        description: '',
        status: 'ai-pending',
      },
    ])
  })

  it('indexes enum options embedded in a predicate shape proposal', () => {
    const terms = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/terms.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        <#status> a udfs:PredicateTerm ;
          rdfs:label "Status" ;
          udfs:valueType "enum" ;
          udfs:shape "class udfs:Workspace · option Ready · option Blocked · editor select" .
      `,
    })

    const index = buildStructuredVocabDefinitionIndex({ terms })

    expect(index.enumOptionsByPredicate.get('#status')).toEqual([
      {
        uri: '#status#Ready',
        label: 'Ready',
        description: 'Option for Status.',
        status: 'active',
      },
      {
        uri: '#status#Blocked',
        label: 'Blocked',
        description: 'Option for Status.',
        status: 'active',
      },
    ])
  })

  it('validates table cells against lightweight shape minCount and maxCount rules', () => {
    const projection = projectStructuredResourceTable({
      uri: 'https://pod.example/.data/state.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        <#Workspace> a udfs:Workspace ; udfs:tags "core", "rdf" ; udfs:title "Files" .
        <#Empty> a udfs:Workspace .
      `,
    })
    const terms = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/terms.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        udfs:tags a udfs:PredicateTerm ; rdfs:label "tags" ; udfs:range "multi-select" .
        udfs:title a udfs:PredicateTerm ; rdfs:label "title" ; udfs:range "text" .
      `,
    })
    const shapes = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/shapes.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        <#tags-shape> a udfs:ShapeRule ;
          udfs:term udfs:tags ;
          udfs:classScope "udfs:Workspace" ;
          udfs:constraint "maxCount 1" .
        <#title-shape> a udfs:ShapeRule ;
          udfs:term udfs:title ;
          udfs:classScope "udfs:Workspace" ;
          udfs:constraint "minCount 1" .
      `,
      registryKind: 'shapes',
    })
    const index = buildStructuredVocabDefinitionIndex({ terms, shapes })

    expect(validateStructuredTableShapeConstraints(projection, index, 'udfs:Workspace')).toEqual([
      {
        id: '#Workspace|udfs:tags|maxCount',
        subject: '#Workspace',
        predicate: 'udfs:tags',
        severity: 'warning',
        message: '#Workspace udfs:tags has 2 values; maxCount is 1.',
        rule: 'maxCount 1',
      },
      {
        id: '#Empty|udfs:title|minCount',
        subject: '#Empty',
        predicate: 'udfs:title',
        severity: 'warning',
        message: '#Empty udfs:title has 0 values; minCount is 1.',
        rule: 'minCount 1',
      },
    ])
  })

  it('warns for required shape predicates even when no row currently has that column', () => {
    const projection = projectStructuredResourceTable({
      uri: 'https://pod.example/.data/state.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        <#Workspace> a udfs:Workspace ; udfs:title "Files" .
        <#Other> a udfs:Workspace ; udfs:title "Other" .
      `,
    })
    const terms = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/terms.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        udfs:owner a udfs:PredicateTerm ; rdfs:label "owner" ; udfs:valueType "relation" .
      `,
    })
    const shapes = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/shapes.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        <#owner-shape> a udfs:ShapeRule ;
          udfs:term udfs:owner ;
          udfs:classScope "udfs:Workspace" ;
          udfs:constraint "minCount 1" .
      `,
      registryKind: 'shapes',
    })
    const index = buildStructuredVocabDefinitionIndex({ terms, shapes })

    expect(projection.predicates).not.toContain('udfs:owner')
    expect(validateStructuredTableShapeConstraints(projection, index, 'udfs:Workspace')).toEqual([
      {
        id: '#Other|udfs:owner|minCount',
        subject: '#Other',
        predicate: 'udfs:owner',
        severity: 'warning',
        message: '#Other udfs:owner has 0 values; minCount is 1.',
        rule: 'minCount 1',
      },
      {
        id: '#Workspace|udfs:owner|minCount',
        subject: '#Workspace',
        predicate: 'udfs:owner',
        severity: 'warning',
        message: '#Workspace udfs:owner has 0 values; minCount is 1.',
        rule: 'minCount 1',
      },
    ])
  })

  it('projects class-scoped shape predicates into the table schema without fake cell values', () => {
    const sourceProjection = projectStructuredResourceTable({
      uri: 'https://pod.example/.data/state.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        <#Workspace> a udfs:Workspace ; udfs:title "Files" .
      `,
    })
    const scopedProjection = projectStructuredClassScope(sourceProjection, 'udfs:Workspace')
    const terms = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/terms.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        udfs:owner a udfs:PredicateTerm ; rdfs:label "owner" ; udfs:valueType "relation" .
      `,
    })
    const shapes = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/shapes.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        <#owner-shape> a udfs:ShapeRule ;
          udfs:term udfs:owner ;
          udfs:classScope "udfs:Workspace" ;
          udfs:constraint "minCount 1" .
      `,
      registryKind: 'shapes',
    })
    const index = buildStructuredVocabDefinitionIndex({ terms, shapes })

    const schemaProjection = projectStructuredVocabSchemaColumns(scopedProjection, index, scopedProjection.className)

    expect(schemaProjection.predicates).toEqual(['udfs:title', 'udfs:owner'])
    expect(schemaProjection.rows).toEqual([
      {
        subject: '#Workspace',
        cells: [
          { predicate: 'udfs:title', values: ['"Files"'] },
        ],
      },
    ])
    expect(schemaProjection).toMatchObject({
      className: 'udfs:Workspace',
      classOptions: ['udfs:Workspace'],
    })
  })

  it('does not duplicate an observed predicate when a shape references an alias of the same term', () => {
    const sourceProjection = projectStructuredResourceTable({
      uri: 'https://pod.example/.data/state.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        <#Workspace> a udfs:Workspace ; <#owner> <#Me> .
      `,
    })
    const scopedProjection = projectStructuredClassScope(sourceProjection, 'udfs:Workspace')
    const shapes = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/shapes.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        <#owner-shape> a udfs:ShapeRule ;
          udfs:term udfs:owner ;
          udfs:classScope "udfs:Workspace" ;
          udfs:constraint "minCount 1" .
      `,
      registryKind: 'shapes',
    })
    const index = buildStructuredVocabDefinitionIndex({ terms: [], shapes })

    const schemaProjection = projectStructuredVocabSchemaColumns(scopedProjection, index, scopedProjection.className)

    expect(schemaProjection.predicates).toEqual(['#owner'])
    expect(schemaProjection.rows[0]?.cells).toEqual([
      { predicate: '#owner', values: ['#Me'] },
    ])
  })

  it('uses shape registry rules even when the matching predicate term registry row is missing', () => {
    const projection = projectStructuredResourceTable({
      uri: 'https://pod.example/.data/state.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        <#Workspace> a udfs:Workspace ; udfs:title "Files" .
      `,
    })
    const shapes = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/shapes.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        <#owner-shape> a udfs:ShapeRule ;
          udfs:term udfs:owner ;
          udfs:classScope "udfs:Workspace" ;
          udfs:constraint "minCount 1" .
      `,
      registryKind: 'shapes',
    })
    const index = buildStructuredVocabDefinitionIndex({ terms: [], shapes })

    expect(validateStructuredTableShapeConstraints(projection, index, 'udfs:Workspace')).toEqual([
      {
        id: '#Workspace|udfs:owner|minCount',
        subject: '#Workspace',
        predicate: 'udfs:owner',
        severity: 'warning',
        message: '#Workspace udfs:owner has 0 values; minCount is 1.',
        rule: 'minCount 1',
      },
    ])
  })

  it('warns when table cells violate lightweight shape datatype and pattern rules', () => {
    const projection = projectStructuredResourceTable({
      uri: 'https://pod.example/.data/state.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
        <#Task> a udfs:Task ; udfs:due "tomorrow" ; udfs:code "todo-1" .
        <#Ready> a udfs:Task ; udfs:due "2026-06-19"^^xsd:date ; udfs:code "TASK-19" .
      `,
    })
    const terms = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/terms.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        udfs:due a udfs:PredicateTerm ; rdfs:label "due" ; udfs:range "date" .
        udfs:code a udfs:PredicateTerm ; rdfs:label "code" ; udfs:range "text" .
      `,
    })
    const shapes = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/shapes.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        <#due-shape> a udfs:ShapeRule ;
          udfs:term udfs:due ;
          udfs:classScope "udfs:Task" ;
          udfs:constraint "datatype xsd:date" .
        <#code-shape> a udfs:ShapeRule ;
          udfs:term udfs:code ;
          udfs:classScope "udfs:Task" ;
          udfs:constraint "pattern ^[A-Z]+-[0-9]+$" .
      `,
      registryKind: 'shapes',
    })
    const index = buildStructuredVocabDefinitionIndex({ terms, shapes })

    expect(validateStructuredTableShapeConstraints(projection, index, 'udfs:Task')).toEqual([
      {
        id: '#Task|udfs:code|pattern',
        subject: '#Task',
        predicate: 'udfs:code',
        severity: 'warning',
        message: '#Task udfs:code value "todo-1" does not match pattern ^[A-Z]+-[0-9]+$.',
        rule: 'pattern ^[A-Z]+-[0-9]+$',
      },
      {
        id: '#Task|udfs:due|datatype',
        subject: '#Task',
        predicate: 'udfs:due',
        severity: 'warning',
        message: '#Task udfs:due value "tomorrow" is not datatype xsd:date.',
        rule: 'datatype xsd:date',
      },
    ])
  })

  it('normalizes direct SHACL shape predicates into lightweight table warnings', () => {
    const projection = projectStructuredResourceTable({
      uri: 'https://pod.example/.data/state.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        <#Workspace> a udfs:Workspace ; udfs:title "files" ; udfs:due "tomorrow" .
      `,
    })
    const terms = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/terms.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        udfs:title a udfs:PredicateTerm ; rdfs:label "title" ; udfs:range "text" .
        udfs:due a udfs:PredicateTerm ; rdfs:label "due" ; udfs:range "date" .
      `,
    })
    const shapes = projectLockedVocabRegistryRows({
      uri: 'https://pod.example/.vocab/shapes.ttl',
      mimeType: 'text/turtle',
      source: `
        @prefix udfs: <https://undefineds.co/vocab/> .
        @prefix sh: <http://www.w3.org/ns/shacl#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
        <#title-shape> a udfs:ShapeRule ;
          sh:path udfs:title ;
          sh:targetClass udfs:Workspace ;
          sh:minCount 1 ;
          sh:maxCount 1 ;
          sh:datatype xsd:string ;
          sh:pattern "^[A-Z]" .
        <#due-shape> a udfs:ShapeRule ;
          sh:path udfs:due ;
          sh:targetClass udfs:Workspace ;
          sh:datatype xsd:date .
      `,
      registryKind: 'shapes',
    })
    const index = buildStructuredVocabDefinitionIndex({ terms, shapes })

    expect(index.predicates.get('udfs:title')?.shapeRules[0]).toMatchObject({
      minCount: 1,
      maxCount: 1,
      datatype: 'xsd:string',
      pattern: '^[A-Z]',
    })
    expect(validateStructuredTableShapeConstraints(projection, index, 'udfs:Workspace')).toEqual([
      {
        id: '#Workspace|udfs:due|datatype',
        subject: '#Workspace',
        predicate: 'udfs:due',
        severity: 'warning',
        message: '#Workspace udfs:due value "tomorrow" is not datatype xsd:date.',
        rule: 'datatype xsd:date',
      },
      {
        id: '#Workspace|udfs:title|pattern',
        subject: '#Workspace',
        predicate: 'udfs:title',
        severity: 'warning',
        message: '#Workspace udfs:title value "files" does not match pattern ^[A-Z].',
        rule: 'pattern ^[A-Z]',
      },
    ])
  })
})
