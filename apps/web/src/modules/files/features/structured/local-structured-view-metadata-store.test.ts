import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadLocalStructuredViewMetadata,
  saveLocalStructuredViewMetadata,
} from './local-structured-view-metadata-store'

const firstDocument = 'https://pod.example/.data/first.ttl'
const secondDocument = 'https://pod.example/.data/second.ttl'

describe('local structured view metadata store', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns null for malformed JSON', () => {
    window.localStorage.setItem(
      `linx-files:structured-view:${encodeURIComponent(firstDocument)}`,
      '{not-json',
    )

    expect(loadLocalStructuredViewMetadata(firstDocument)).toBeNull()
  })

  it('normalizes invalid stored fields instead of trusting persisted UI state', () => {
    window.localStorage.setItem(
      `linx-files:structured-view:${encodeURIComponent(firstDocument)}`,
      JSON.stringify({
        documentUri: 'https://attacker.example/wrong.ttl',
        viewMode: 'unknown',
        openViews: ['raw', 'unknown', 'raw'],
        classScope: 42,
        searchText: false,
        sortDirection: 'sideways',
        hiddenPredicates: ['name', 42],
        columnSizing: { name: 123.6, invalid: 'wide' },
        whiteboard: {
          selectedSubjects: 'invalid',
          positions: null,
          visualRelations: 'invalid',
        },
        writesCanonicalData: true,
      }),
    )

    expect(loadLocalStructuredViewMetadata(firstDocument)).toMatchObject({
      documentUri: firstDocument,
      viewMode: 'table',
      openViews: ['raw'],
      classScope: null,
      searchText: '',
      sortDirection: 'asc',
      hiddenPredicates: ['name'],
      columnSizing: { name: 124 },
      whiteboard: {
        selectedSubjects: [],
        positions: {},
        visualRelations: [],
      },
      writesCanonicalData: false,
    })
  })

  it('isolates metadata by document URI', () => {
    saveLocalStructuredViewMetadata(firstDocument, {
      documentUri: firstDocument,
      viewMode: 'raw',
      classScope: null,
      searchText: 'first',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: null,
      columnSizing: {},
      whiteboard: {
        selectedSubjects: [],
        positions: {},
        visualRelations: [],
      },
      writesCanonicalData: false,
    })

    expect(loadLocalStructuredViewMetadata(firstDocument)?.searchText).toBe('first')
    expect(loadLocalStructuredViewMetadata(secondDocument)).toBeNull()
  })
})
