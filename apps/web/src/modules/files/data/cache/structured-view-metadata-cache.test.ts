import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { createStructuredViewMetadataCacheCollection } from './structured-view-metadata-cache'

describe('structured view metadata cache', () => {
  it('preserves versioned board metadata when staging an optimistic save', () => {
    const queryClient = new QueryClient()
    const collection = createStructuredViewMetadataCacheCollection({
      structuredViewMetadata: ['files', 'structured-view-metadata'],
      metaSidecar: ['files', 'meta-sidecar'],
    })
    const file = {
      uri: 'https://pod.example/.data/files/files.ttl',
      kind: 'resource' as const,
    }

    collection.setMetadata(queryClient, file, {
      documentUri: file.uri,
      viewMode: 'whiteboard',
      classScope: null,
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: 'status',
      kanbanOrder: { todo: ['#A'] },
      kanbanBoard: {
        version: 1,
        laneOrder: ['todo', 'done'],
        collapsedLaneIds: ['done'],
        scrollLeft: 120,
        cardOrder: { todo: ['#A', '#B'] },
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

    expect(queryClient.getQueryData(collection.queryKey(file))).toMatchObject({
      metadata: {
        kanbanBoard: {
          version: 1,
          laneOrder: ['todo', 'done'],
          collapsedLaneIds: ['done'],
          scrollLeft: 120,
          cardOrder: { todo: ['#A', '#B'] },
        },
        whiteboard: {
          snapshot: {
            version: 1,
            camera: { x: 4, y: 8, z: 1.5 },
            nodes: [{ resourceUri: '#A', x: 10, y: 20, w: 288, h: 160, z: 1, kind: 'subject' }],
            groups: [{ id: 'group-1', title: 'Sprint', color: 'blue' }],
            visualRelations: [{ id: 'rel-a-b', from: '#A', to: '#B', label: 'blocks', predicate: 'status' }],
          },
        },
        writesCanonicalData: false,
      },
    })
  })
})
