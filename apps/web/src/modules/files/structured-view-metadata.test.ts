import { describe, expect, it } from 'vitest'
import {
  parseStructuredViewMetadataTurtle,
  renderStructuredViewMetadataTurtle,
  type StructuredViewMetadata,
} from './domain/structured/structured-view-metadata'

describe('structured view metadata turtle', () => {
  it('round-trips class-scoped table, kanban, and whiteboard view state without changing canonical data', () => {
    const metadata: StructuredViewMetadata = {
      documentUri: 'https://pod.example/.data/files/files.ttl',
      viewMode: 'whiteboard',
      classScope: 'https://pod.example/.vocab/terms.ttl#FileResource',
      searchText: 'report',
      sortKey: 'https://schema.org/dateModified',
      sortDirection: 'desc',
      hiddenPredicates: ['https://schema.org/description', 'https://schema.org/url'],
      kanbanGroupPredicate: 'https://pod.example/.vocab/terms.ttl#mode',
      kanbanOrder: {
        'read/write': ['#FolderResource', '#FileResource'],
      },
      columnSizing: {
        subject: 148,
        'https://schema.org/name': 132,
        'https://pod.example/.vocab/terms.ttl#mode': 120,
      },
      whiteboard: {
        selectedSubjects: ['#FileResource', '#FolderResource'],
        positions: {
          '#FileResource': { x: 42.4, y: 96.8 },
          '#FolderResource': { x: 320, y: 144 },
        },
        visualRelations: [
          {
            id: 'visual-depends-on',
            from: '#FileResource',
            to: '#FolderResource',
            label: 'depends on',
          },
        ],
      },
    }

    const turtle = renderStructuredViewMetadataTurtle(metadata)

    expect(turtle).toContain('<#view> a udfs:StructuredViewMetadata')
    expect(turtle).toContain('udfs:document <https://pod.example/.data/files/files.ttl>')
    expect(turtle).toContain('udfs:viewMode "whiteboard"')
    expect(turtle).toContain('udfs:writesCanonicalData false')
    expect(turtle).toContain('udfs:selectedSubject "#FileResource"')
    expect(turtle).toContain('udfs:kanbanCardOrder [ udfs:column "read/write" ; udfs:subject "#FolderResource" ; udfs:index 0 ]')
    expect(turtle).toContain('udfs:kanbanCardOrder [ udfs:column "read/write" ; udfs:subject "#FileResource" ; udfs:index 1 ]')
    expect(turtle).toContain('udfs:columnWidth [ udfs:predicate <https://schema.org/name> ; udfs:width 132 ]')
    expect(turtle).toContain('udfs:whiteboardPosition [ udfs:subject "#FileResource" ; udfs:x 42 ; udfs:y 97 ]')
    expect(turtle).toContain('udfs:whiteboardVisualRelation [ udfs:id "visual-depends-on" ; udfs:fromSubject "#FileResource" ; udfs:toSubject "#FolderResource" ; udfs:label "depends on" ]')

    expect(parseStructuredViewMetadataTurtle(turtle, metadata.documentUri)).toEqual({
      ...metadata,
      columnSizing: {
        subject: 148,
        'https://schema.org/name': 132,
        'https://pod.example/.vocab/terms.ttl#mode': 120,
      },
      whiteboard: {
        selectedSubjects: ['#FileResource', '#FolderResource'],
        positions: {
          '#FileResource': { x: 42, y: 97 },
          '#FolderResource': { x: 320, y: 144 },
        },
        visualRelations: [
          {
            id: 'visual-depends-on',
            from: '#FileResource',
            to: '#FolderResource',
            label: 'depends on',
          },
        ],
      },
      writesCanonicalData: false,
    })
  })

  it('normalizes invalid persisted view state to a compact table-safe default', () => {
    const turtle = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '',
      '<#view> a udfs:StructuredViewMetadata ;',
      '  udfs:document <https://pod.example/.data/files/files.ttl> ;',
      '  udfs:viewMode "timeline" ;',
      '  udfs:sortDirection "sideways" ;',
      '  udfs:hiddenPredicate "https://schema.org/description" ;',
      '  udfs:hiddenPredicate "https://schema.org/description" ;',
      '  udfs:columnWidth [ udfs:predicate <https://schema.org/name> ; udfs:width -8 ] ;',
      '  udfs:whiteboardPosition [ udfs:subject "#FileResource" ; udfs:x NaN ; udfs:y 97 ] ;',
      '  udfs:whiteboardVisualRelation [ udfs:id "" ; udfs:fromSubject "#FileResource" ; udfs:toSubject "#FolderResource" ; udfs:label "bad" ] ;',
      '  udfs:whiteboardVisualRelation [ udfs:id "missing-to" ; udfs:fromSubject "#FileResource" ; udfs:label "bad" ] ;',
      '  udfs:writesCanonicalData true .',
    ].join('\n')

    expect(parseStructuredViewMetadataTurtle(turtle, 'https://pod.example/.data/files/files.ttl')).toEqual({
      documentUri: 'https://pod.example/.data/files/files.ttl',
      viewMode: 'table',
      classScope: null,
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: ['https://schema.org/description'],
      kanbanGroupPredicate: null,
      kanbanOrder: {},
      columnSizing: {},
      whiteboard: {
        selectedSubjects: [],
        positions: {},
        visualRelations: [],
      },
      writesCanonicalData: false,
    })
  })

  it('hydrates view state when a Pod returns expanded udfs predicate IRIs', () => {
    const turtle = [
      '<#view> <https://undefineds.co/vocab/document> <https://pod.example/.data/files/files.ttl> ;',
      '  <https://undefineds.co/vocab/viewMode> "whiteboard" ;',
      '  <https://undefineds.co/vocab/classScope> <https://pod.example/.vocab/terms.ttl#FileResource> ;',
      '  <https://undefineds.co/vocab/searchText> "report" ;',
      '  <https://undefineds.co/vocab/sortKey> <https://schema.org/dateModified> ;',
      '  <https://undefineds.co/vocab/sortDirection> "desc" ;',
      '  <https://undefineds.co/vocab/hiddenPredicate> <https://schema.org/description>, <https://schema.org/url> ;',
      '  <https://undefineds.co/vocab/kanbanGroupPredicate> <https://pod.example/.vocab/terms.ttl#mode> ;',
      '  <https://undefineds.co/vocab/kanbanCardOrder> [ <https://undefineds.co/vocab/column> "read/write" ; <https://undefineds.co/vocab/subject> "#FileResource" ; <https://undefineds.co/vocab/index> 0 ] ;',
      '  <https://undefineds.co/vocab/columnWidth> [ <https://undefineds.co/vocab/predicate> <https://schema.org/name> ; <https://undefineds.co/vocab/width> 132 ] ;',
      '  <https://undefineds.co/vocab/selectedSubject> "#FileResource", "#FolderResource" ;',
      '  <https://undefineds.co/vocab/whiteboardPosition> _:position1 ;',
      '  <https://undefineds.co/vocab/whiteboardVisualRelation> _:relation1 ;',
      '  <https://undefineds.co/vocab/writesCanonicalData> false .',
      '_:position1 <https://undefineds.co/vocab/x> 42 .',
      '_:position1 <https://undefineds.co/vocab/subject> "#FileResource" .',
      '_:position1 <https://undefineds.co/vocab/y> 97 .',
      '_:relation1 <https://undefineds.co/vocab/toSubject> "#FolderResource" .',
      '_:relation1 <https://undefineds.co/vocab/id> "visual-depends-on" .',
      '_:relation1 <https://undefineds.co/vocab/label> "depends on" .',
      '_:relation1 <https://undefineds.co/vocab/fromSubject> "#FileResource" .',
    ].join('\n')

    expect(parseStructuredViewMetadataTurtle(turtle, 'https://pod.example/.data/files/fallback.ttl')).toMatchObject({
      documentUri: 'https://pod.example/.data/files/files.ttl',
      viewMode: 'whiteboard',
      classScope: 'https://pod.example/.vocab/terms.ttl#FileResource',
      searchText: 'report',
      sortKey: 'https://schema.org/dateModified',
      sortDirection: 'desc',
      hiddenPredicates: ['https://schema.org/description', 'https://schema.org/url'],
      kanbanGroupPredicate: 'https://pod.example/.vocab/terms.ttl#mode',
      kanbanOrder: { 'read/write': ['#FileResource'] },
      columnSizing: { 'https://schema.org/name': 132 },
      whiteboard: {
        selectedSubjects: ['#FileResource', '#FolderResource'],
        positions: { '#FileResource': { x: 42, y: 97 } },
        visualRelations: [
          {
            id: 'visual-depends-on',
            from: '#FileResource',
            to: '#FolderResource',
            label: 'depends on',
          },
        ],
      },
    })
  })

  it('hydrates labeled blank nodes when a Pod serializes each blank node as a multiline statement', () => {
    const turtle = [
      '<#view> <https://undefineds.co/vocab/document> <https://pod.example/.data/files/files.ttl>;',
      '    <https://undefineds.co/vocab/viewMode> "whiteboard";',
      '    <https://undefineds.co/vocab/selectedSubject> "https://pod.example/.data/files/files.ttl#Workspace", "https://pod.example/.data/files/files.ttl#Other";',
      '    <https://undefineds.co/vocab/whiteboardPosition> _:g_210;',
      '    <https://undefineds.co/vocab/whiteboardVisualRelation> _:g_310;',
      '    <https://undefineds.co/vocab/writesCanonicalData> false.',
      '_:g_210 <https://undefineds.co/vocab/subject> "https://pod.example/.data/files/files.ttl#Workspace";',
      '    <https://undefineds.co/vocab/x> 199;',
      '    <https://undefineds.co/vocab/y> 104.',
      '_:g_310 <https://undefineds.co/vocab/id> "visual-workspace-other";',
      '    <https://undefineds.co/vocab/fromSubject> "https://pod.example/.data/files/files.ttl#Workspace";',
      '    <https://undefineds.co/vocab/toSubject> "https://pod.example/.data/files/files.ttl#Other";',
      '    <https://undefineds.co/vocab/label> "e2e sketch link".',
    ].join('\n')

    expect(parseStructuredViewMetadataTurtle(turtle, 'https://pod.example/.data/files/fallback.ttl')).toMatchObject({
      documentUri: 'https://pod.example/.data/files/files.ttl',
      viewMode: 'whiteboard',
      whiteboard: {
        selectedSubjects: [
          'https://pod.example/.data/files/files.ttl#Workspace',
          'https://pod.example/.data/files/files.ttl#Other',
        ],
        positions: {
          'https://pod.example/.data/files/files.ttl#Workspace': { x: 199, y: 104 },
        },
        visualRelations: [
          {
            id: 'visual-workspace-other',
            from: 'https://pod.example/.data/files/files.ttl#Workspace',
            to: 'https://pod.example/.data/files/files.ttl#Other',
            label: 'e2e sketch link',
          },
        ],
      },
    })
  })
})
