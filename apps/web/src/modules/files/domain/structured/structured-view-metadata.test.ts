import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STRUCTURED_VIEW_CONFIG,
  normalizeStructuredKanbanBoardMetadata,
  normalizeStructuredViewConfig,
  normalizeStructuredWhiteboardSnapshotMetadata,
  parseStructuredViewMetadataTurtle,
  renderStructuredViewMetadataTurtle,
  normalizeStructuredWhiteboardLayouts,
} from './structured-view-metadata'

describe('structured view metadata model', () => {
  it('normalizes stored view config values without app store state', () => {
    expect(normalizeStructuredViewConfig({
      viewMode: 'whiteboard',
      classScope: 'https://schema.example/Task',
      searchText: 'draft',
      sortKey: 'https://schema.example/priority',
      sortDirection: 'desc',
      hiddenPredicates: ['https://schema.example/private', 42, null],
      kanbanGroupPredicate: 'https://schema.example/status',
      kanbanOrder: {
        Todo: ['task-2', '', 'task-1', 'task-2'],
        Done: 'not an array',
      },
      columnSizing: {
        subject: 164.6,
        invalid: Number.NaN,
        title: 'wide',
      },
    })).toEqual({
      viewMode: 'whiteboard',
      classScope: 'https://schema.example/Task',
      searchText: 'draft',
      sortKey: 'https://schema.example/priority',
      sortDirection: 'desc',
      hiddenPredicates: ['https://schema.example/private'],
      kanbanGroupPredicate: 'https://schema.example/status',
      kanbanOrder: {
        Todo: ['task-2', 'task-1'],
      },
      columnSizing: {
        subject: 165,
      },
    })
  })

  it('falls back invalid stored view config values to the default table config', () => {
    expect(normalizeStructuredViewConfig({
      viewMode: 'calendar',
      classScope: 42,
      searchText: null,
      sortKey: false,
      sortDirection: 'sideways',
      hiddenPredicates: 'not an array',
      kanbanGroupPredicate: 3,
      kanbanOrder: null,
      columnSizing: null,
    })).toEqual(DEFAULT_STRUCTURED_VIEW_CONFIG)
    expect(normalizeStructuredViewConfig(null)).toBeNull()
  })

  it('normalizes persisted whiteboard layouts without app store state', () => {
    expect(normalizeStructuredWhiteboardLayouts({
      'doc-a': {
        'task-1': { x: 10.4, y: 20.6 },
        'task-2': { x: Number.NaN, y: 2 },
        'task-3': { x: 1, y: '2' },
      },
      'doc-empty': {
        'task-4': null,
      },
      'doc-b': {
        'task-5': { x: -4.4, y: 0 },
      },
      'doc-invalid': 'not a layout',
    })).toEqual({
      'doc-a': {
        'task-1': { x: 10, y: 21 },
      },
      'doc-b': {
        'task-5': { x: -4, y: 0 },
      },
    })
    expect(normalizeStructuredWhiteboardLayouts(null)).toEqual({})
  })

  it('normalizes versioned Kanban board metadata without trusting corrupt values', () => {
    expect(normalizeStructuredKanbanBoardMetadata({
      version: 1,
      laneOrder: ['doing', '', 'done', 'doing'],
      collapsedLaneIds: ['done', 42, 'done'],
      scrollLeft: -12,
      cardOrder: {
        doing: ['#b', '#a', '#b', ''],
        done: 'not an array',
      },
    }, {
      todo: ['#legacy'],
    })).toEqual({
      version: 1,
      laneOrder: ['doing', 'done'],
      collapsedLaneIds: ['done'],
      scrollLeft: 0,
      cardOrder: {
        doing: ['#b', '#a'],
      },
    })

    expect(normalizeStructuredKanbanBoardMetadata({ version: 99 }, {
      todo: ['#legacy', '#legacy'],
    })).toEqual({
      version: 1,
      laneOrder: [],
      collapsedLaneIds: [],
      scrollLeft: 0,
      cardOrder: {
        todo: ['#legacy'],
      },
    })
  })

  it('normalizes versioned Whiteboard snapshots and migrates legacy positions', () => {
    expect(normalizeStructuredWhiteboardSnapshotMetadata({
      version: 1,
      camera: { x: 10.4, y: 20.6, z: 0 },
      nodes: [
        { resourceUri: '#A', shapeId: 'shape-a', x: 1.2, y: 2.8, w: 299.5, h: 120.4, z: 2, groupId: 'group-1' },
        { resourceUri: '#A', x: 999, y: 999, w: 100, h: 100, z: 99 },
        { resourceUri: '', x: 1, y: 2, w: 3, h: 4, z: 5 },
      ],
      groups: [
        { id: 'group-1', title: 'Sprint', color: 'blue' },
        { id: 'group-1', title: 'Duplicate', color: 'red' },
      ],
      visualRelations: [
        { id: 'rel-a-b', from: '#A', to: '#B', label: 'blocks', predicate: 'https://schema.example/blocks' },
        { id: 'rel-a-b', from: '#A', to: '#C' },
        { id: '', from: '#A', to: '#B' },
      ],
    }, {
      positions: { '#Legacy': { x: 40, y: 60 } },
      visualRelations: [{ id: 'legacy-rel', from: '#Legacy', to: '#A', label: 'legacy' }],
    })).toEqual({
      version: 1,
      camera: { x: 10, y: 21, z: 1 },
      nodes: [
        { resourceUri: '#A', shapeId: 'shape-a', x: 1, y: 3, w: 300, h: 120, z: 2, groupId: 'group-1', kind: 'subject' },
      ],
      groups: [
        { id: 'group-1', title: 'Sprint', color: 'blue' },
      ],
      visualRelations: [
        { id: 'rel-a-b', from: '#A', to: '#B', label: 'blocks', predicate: 'https://schema.example/blocks' },
      ],
    })

    expect(normalizeStructuredWhiteboardSnapshotMetadata({ version: 99 }, {
      positions: { '#Legacy': { x: 40, y: 60 } },
      visualRelations: [{ id: 'legacy-rel', from: '#Legacy', to: '#A', label: 'legacy' }],
    })).toEqual({
      version: 1,
      camera: { x: 0, y: 0, z: 1 },
      nodes: [
        { resourceUri: '#Legacy', x: 40, y: 60, w: 288, h: 160, z: 0, kind: 'subject' },
      ],
      groups: [],
      visualRelations: [
        { id: 'legacy-rel', from: '#Legacy', to: '#A', label: 'legacy' },
      ],
    })
  })

  it('preserves valid zoom-out camera state', () => {
    expect(normalizeStructuredWhiteboardSnapshotMetadata({
      version: 1,
      camera: { x: 0, y: 0, z: 0.5 },
      nodes: [],
      groups: [],
      visualRelations: [],
    }).camera).toEqual({ x: 0, y: 0, z: 0.5 })
  })

  it('keeps distinct visual instances of the same resource by shape identity', () => {
    expect(normalizeStructuredWhiteboardSnapshotMetadata({
      version: 1,
      camera: { x: 0, y: 0, z: 1 },
      nodes: [
        { resourceUri: '#a', shapeId: 'shape:a-1', x: 0, y: 0, w: 288, h: 160, z: 0 },
        { resourceUri: '#a', shapeId: 'shape:a-2', x: 400, y: 0, w: 288, h: 160, z: 1 },
      ],
      groups: [],
      visualRelations: [],
    }).nodes).toEqual([
      expect.objectContaining({ resourceUri: '#a', shapeId: 'shape:a-1', x: 0 }),
      expect.objectContaining({ resourceUri: '#a', shapeId: 'shape:a-2', x: 400 }),
    ])
  })

  it('round-trips versioned board metadata while preserving legacy Turtle fields', () => {
    const turtle = renderStructuredViewMetadataTurtle({
      documentUri: 'https://pod.example/.data/files/files.ttl',
      viewMode: 'whiteboard',
      classScope: null,
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: 'status',
      kanbanOrder: {
        todo: ['#A'],
      },
      kanbanBoard: {
        version: 1,
        laneOrder: ['todo', 'done'],
        collapsedLaneIds: ['done'],
        scrollLeft: 240,
        cardOrder: {
          todo: ['#A', '#B'],
        },
      },
      columnSizing: {},
      whiteboard: {
        selectedSubjects: ['#A'],
        positions: { '#A': { x: 10, y: 20 } },
        visualRelations: [{ id: 'legacy-rel', from: '#A', to: '#B', label: 'legacy' }],
        snapshot: {
          version: 1,
          camera: { x: 4, y: 8, z: 1.5 },
          nodes: [{ resourceUri: '#A', x: 10, y: 20, w: 288, h: 160, z: 1, kind: 'subject' }],
          groups: [{ id: 'group-1', title: 'Sprint', color: 'blue' }],
          visualRelations: [{ id: 'rel-a-b', from: '#A', to: '#B', label: 'blocks', predicate: 'status' }],
        },
      },
      writesCanonicalData: false,
    })

    expect(turtle).toContain('udfs:kanbanCardOrder [ udfs:column "todo" ; udfs:subject "#A" ; udfs:index 0 ]')
    expect(turtle).toContain('udfs:writesCanonicalData false')

    expect(parseStructuredViewMetadataTurtle(turtle, 'fallback')).toMatchObject({
      kanbanOrder: {
        todo: ['#A'],
      },
      kanbanBoard: {
        version: 1,
        laneOrder: ['todo', 'done'],
        collapsedLaneIds: ['done'],
        scrollLeft: 240,
        cardOrder: {
          todo: ['#A', '#B'],
        },
      },
      whiteboard: {
        selectedSubjects: ['#A'],
        positions: { '#A': { x: 10, y: 20 } },
        visualRelations: [{ id: 'legacy-rel', from: '#A', to: '#B', label: 'legacy' }],
        snapshot: {
          version: 1,
          camera: { x: 4, y: 8, z: 1.5 },
          nodes: [{ resourceUri: '#A', x: 10, y: 20, w: 288, h: 160, z: 1, kind: 'subject' }],
          groups: [{ id: 'group-1', title: 'Sprint', color: 'blue' }],
          visualRelations: [{ id: 'rel-a-b', from: '#A', to: '#B', label: 'blocks', predicate: 'status' }],
        },
      },
      writesCanonicalData: false,
    })
  })
})
