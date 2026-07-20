import { describe, expect, it } from 'vitest'

import type { FilesStructuredViewMetadataSidecar } from '../../domain/resource/resource-model'
import type { StructuredViewMetadata } from '../../domain/structured/structured-view-metadata'
import {
  defaultStructuredViewMetadataSignature,
  isSameStructuredDocumentUri,
  projectStructuredViewMetadataHydration,
  structuredViewMetadataSignature,
} from './structured-view-metadata-workflow-model'

const documentUri = 'https://pod.example/.data/tasks.ttl'

function metadata(overrides: Partial<StructuredViewMetadata> = {}): Required<StructuredViewMetadata> {
  return {
    documentUri,
    viewMode: 'whiteboard',
    classScope: 'https://schema.example#Task',
    searchText: ' review ',
    sortKey: 'status',
    sortDirection: 'desc',
    hiddenPredicates: ['https://schema.example/private'],
    kanbanGroupPredicate: 'status',
    kanbanOrder: {
      Done: ['#b'],
      Todo: ['#a'],
    },
    columnSizing: {
      status: 120,
      title: 240,
    },
    whiteboard: {
      selectedSubjects: ['#a'],
      positions: {
        '#b': { x: 20, y: 30 },
        '#a': { x: 10, y: 20 },
      },
      visualRelations: [
        { id: 'rel-b', from: '#b', to: '#a', label: 'blocks' },
        { id: 'rel-a', from: '#a', to: '#b', label: 'relates' },
      ],
    },
    writesCanonicalData: false,
    ...overrides,
  }
}

function sidecar(overrides: Partial<FilesStructuredViewMetadataSidecar> = {}): FilesStructuredViewMetadataSidecar {
  return {
    uri: `${documentUri}.meta`,
    ownerUri: documentUri,
    metaUri: `${documentUri}.meta`,
    content: '',
    etag: 'etag-1',
    metadata: metadata(),
    ...overrides,
  }
}

describe('structured-view-metadata-workflow-model', () => {
  it('builds stable signatures for unordered metadata records and default metadata', () => {
    const left = metadata()
    const right = metadata({
      hiddenPredicates: ['https://schema.example/private'],
      kanbanOrder: {
        Todo: ['#a'],
        Done: ['#b'],
      },
      columnSizing: {
        title: 240,
        status: 120,
      },
      whiteboard: {
        selectedSubjects: ['#a'],
        positions: {
          '#a': { x: 10, y: 20 },
          '#b': { x: 20, y: 30 },
        },
        visualRelations: [
          { id: 'rel-a', from: '#a', to: '#b', label: 'relates' },
          { id: 'rel-b', from: '#b', to: '#a', label: 'blocks' },
        ],
      },
    })

    expect(structuredViewMetadataSignature(left)).toBe(structuredViewMetadataSignature(right))
    expect(defaultStructuredViewMetadataSignature(documentUri)).toBe(structuredViewMetadataSignature({
      documentUri,
      viewMode: 'table',
      classScope: null,
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: null,
      kanbanOrder: {},
      columnSizing: {},
      whiteboard: {
        selectedSubjects: [],
        positions: {},
        visualRelations: [],
      },
      writesCanonicalData: false,
    }))
  })

  it('changes the signature when board chrome or whiteboard camera changes', () => {
    const base = metadata({
      kanbanBoard: {
        version: 1,
        laneOrder: ['Todo', 'Done'],
        collapsedLaneIds: [],
        scrollLeft: 0,
        cardOrder: { Todo: ['#a'], Done: ['#b'] },
      },
      whiteboard: {
        ...metadata().whiteboard,
        snapshot: {
          version: 1,
          camera: { x: 0, y: 0, z: 1 },
          nodes: [],
          groups: [],
          visualRelations: [],
        },
      },
    })
    const changed = metadata({
      ...base,
      kanbanBoard: { ...base.kanbanBoard!, collapsedLaneIds: ['Done'] },
      whiteboard: {
        ...base.whiteboard,
        snapshot: { ...base.whiteboard.snapshot!, camera: { x: 40, y: 20, z: 1.5 } },
      },
    })

    expect(structuredViewMetadataSignature(changed)).not.toBe(structuredViewMetadataSignature(base))
  })

  it('treats legacy board and whiteboard fields as equal to their normalized snapshots', () => {
    const legacy = metadata({
      kanbanOrder: { Todo: ['#a'] },
      whiteboard: {
        selectedSubjects: ['#a'],
        positions: { '#a': { x: 10, y: 20 } },
        visualRelations: [{ id: 'rel-a', from: '#a', to: '#b', label: 'relates' }],
      },
    })
    const normalized = metadata({
      ...legacy,
      kanbanBoard: {
        version: 1,
        laneOrder: [],
        collapsedLaneIds: [],
        scrollLeft: 0,
        cardOrder: { Todo: ['#a'] },
      },
      whiteboard: {
        ...legacy.whiteboard,
        snapshot: {
          version: 1,
          camera: { x: 0, y: 0, z: 1 },
          nodes: [{
            resourceUri: '#a',
            x: 10,
            y: 20,
            w: 288,
            h: 160,
            z: 0,
            kind: 'subject',
          }],
          groups: [],
          visualRelations: [{ id: 'rel-a', from: '#a', to: '#b', label: 'relates' }],
        },
      },
    })

    expect(structuredViewMetadataSignature(legacy)).toBe(structuredViewMetadataSignature(normalized))
  })

  it('normalizes comparable document URIs and rejects unrelated metadata sidecars', () => {
    expect(isSameStructuredDocumentUri(`${documentUri}#view`, `${documentUri}#view`)).toBe(true)
    expect(isSameStructuredDocumentUri('not a url', documentUri)).toBe(false)

    expect(projectStructuredViewMetadataHydration({
      currentHydrationKey: null,
      fileUri: documentUri,
      localViewMetadataChangeBeforeHydration: false,
      metadataSidecar: sidecar({
        ownerUri: 'https://pod.example/.data/other.ttl',
        metadata: metadata({ documentUri: 'https://pod.example/.data/other.ttl' }),
      }),
      whiteboardLayoutKey: 'layout-1',
    })).toEqual({ action: 'none' })
  })

  it('plans default sync and current-file hydration without performing effects', () => {
    expect(projectStructuredViewMetadataHydration({
      currentHydrationKey: null,
      fileUri: documentUri,
      localViewMetadataChangeBeforeHydration: false,
      metadataSidecar: sidecar({ metadata: null }),
      whiteboardLayoutKey: 'layout-1',
    })).toEqual({
      action: 'sync-default',
      signature: defaultStructuredViewMetadataSignature(documentUri),
    })

    const plan = projectStructuredViewMetadataHydration({
      currentHydrationKey: null,
      fileUri: documentUri,
      localViewMetadataChangeBeforeHydration: false,
      metadataSidecar: sidecar({
        metadata: metadata({ documentUri: 'https://pod.example/.data/old.ttl' }),
      }),
      whiteboardLayoutKey: 'layout-1',
    })

    expect(plan).toMatchObject({
      action: 'hydrate',
      hydrationKey: `${documentUri}::${documentUri}.meta::etag-1::layout-1`,
      shouldHydrate: true,
    })
    expect(plan.action === 'hydrate' ? plan.metadata.documentUri : '').toBe(documentUri)
  })

  it('plans no repeated hydration and suppresses hydrate after local pre-hydration edits', () => {
    const hydrationKey = `${documentUri}::${documentUri}.meta::etag-1::layout-1`

    expect(projectStructuredViewMetadataHydration({
      currentHydrationKey: hydrationKey,
      fileUri: documentUri,
      localViewMetadataChangeBeforeHydration: false,
      metadataSidecar: sidecar(),
      whiteboardLayoutKey: 'layout-1',
    })).toEqual({ action: 'none' })

    expect(projectStructuredViewMetadataHydration({
      currentHydrationKey: null,
      fileUri: documentUri,
      localViewMetadataChangeBeforeHydration: true,
      metadataSidecar: sidecar(),
      whiteboardLayoutKey: 'layout-1',
    })).toMatchObject({
      action: 'hydrate',
      shouldHydrate: false,
    })
  })
})
