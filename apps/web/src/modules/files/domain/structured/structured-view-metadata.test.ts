import { describe, expect, it } from 'vitest'

import {
  DEFAULT_STRUCTURED_VIEW_CONFIG,
  normalizeStructuredViewConfig,
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
})
