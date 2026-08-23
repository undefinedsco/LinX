import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StructuredViewMetadata } from '../../domain/structured/structured-view-metadata'
import {
  loadLocalStructuredViewMetadata,
  saveLocalStructuredViewMetadata,
} from './local-structured-view-metadata-store'
import { useStructuredViewMetadataController } from './useStructuredViewMetadataController'

const hydrateStructuredViewMetadata = vi.fn()
const markStructuredViewMetadataDirty = vi.fn()
const clearStructuredViewMetadataDirty = vi.fn()

const baseMetadata: Required<StructuredViewMetadata> = {
  documentUri: 'https://pod.example/tasks.ttl',
  viewMode: 'table',
  classScope: null,
  searchText: '',
  sortKey: 'subject',
  sortDirection: 'asc',
  hiddenPredicates: [],
  kanbanGroupPredicate: null,
  kanbanOrder: {},
  kanbanBoard: { version: 1, laneOrder: [], cardOrder: {}, collapsedLaneIds: [], scrollLeft: 0 },
  columnSizing: {},
  whiteboard: {
    selectedSubjects: [],
    positions: {},
    visualRelations: [],
    snapshot: { version: 1, camera: { x: 0, y: 0, z: 1 }, nodes: [], groups: [], visualRelations: [] },
  },
  writesCanonicalData: false,
}

function renderController({
  currentViewMetadata = baseMetadata,
  localViewMetadataDirty = false,
}: {
  currentViewMetadata?: StructuredViewMetadata
  localViewMetadataDirty?: boolean
} = {}) {
  return renderHook(
    ({ currentViewMetadata, localViewMetadataDirty }) => useStructuredViewMetadataController({
      currentViewMetadata,
      file: { uri: baseMetadata.documentUri, kind: 'resource' },
      hydrateStructuredViewMetadata,
      localViewMetadataDirty,
      markStructuredViewMetadataDirty,
      clearStructuredViewMetadataDirty,
      whiteboardLayoutKey: baseMetadata.documentUri,
    }),
    { initialProps: { currentViewMetadata, localViewMetadataDirty } },
  )
}

describe('useStructuredViewMetadataController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('hydrates the stored view metadata from local storage on mount', () => {
    saveLocalStructuredViewMetadata(baseMetadata.documentUri, { ...baseMetadata, viewMode: 'kanban' })

    renderController()

    expect(hydrateStructuredViewMetadata).toHaveBeenCalledTimes(1)
    const [hydratedMetadata, layoutKey] = hydrateStructuredViewMetadata.mock.calls[0]
    expect(hydratedMetadata.viewMode).toBe('kanban')
    expect(hydratedMetadata.documentUri).toBe(baseMetadata.documentUri)
    expect(layoutKey).toBe(baseMetadata.documentUri)
  })

  it('does not autosave transient view state before the current document is locally changed', async () => {
    const transientMetadata = {
      ...baseMetadata,
      documentUri: 'https://pod.example/previous.ttl',
      viewMode: 'whiteboard' as const,
    }
    const { rerender } = renderController()

    rerender({ currentViewMetadata: transientMetadata, localViewMetadataDirty: false })
    await act(async () => vi.advanceTimersByTimeAsync(800))

    expect(loadLocalStructuredViewMetadata(baseMetadata.documentUri)).toBeNull()
    expect(loadLocalStructuredViewMetadata('https://pod.example/previous.ttl')).toBeNull()
  })

  it('saves local view changes to local storage after the debounce', async () => {
    const changedMetadata = { ...baseMetadata, viewMode: 'kanban' as const }
    const { result, rerender } = renderController()

    rerender({ currentViewMetadata: changedMetadata, localViewMetadataDirty: true })
    expect(result.current.viewMetadataSaveStatus).toBe('dirty')

    await act(async () => vi.advanceTimersByTimeAsync(800))

    const stored = loadLocalStructuredViewMetadata(baseMetadata.documentUri)
    expect(stored?.viewMode).toBe('kanban')
    expect(result.current.viewMetadataSaveStatus).toBe('synced')
    expect(result.current.viewMetadataSaveError).toBeNull()
    expect(clearStructuredViewMetadataDirty).toHaveBeenCalledWith(baseMetadata.documentUri)
  })

  it('keeps a durable error state and retries the current metadata', async () => {
    const setItemSpy = vi.spyOn(Object.getPrototypeOf(window.localStorage), 'setItem')
    setItemSpy.mockImplementationOnce(() => {
      throw new Error('quota exceeded')
    })
    const changedMetadata = { ...baseMetadata, viewMode: 'kanban' as const }
    const { result, rerender } = renderController()

    rerender({ currentViewMetadata: changedMetadata, localViewMetadataDirty: true })
    expect(result.current.viewMetadataSaveStatus).toBe('dirty')

    await act(async () => vi.advanceTimersByTimeAsync(800))

    expect(result.current.viewMetadataSaveStatus).toBe('error')
    expect(result.current.viewMetadataSaveError).toBe('quota exceeded')
    expect(loadLocalStructuredViewMetadata(baseMetadata.documentUri)).toBeNull()

    act(() => result.current.retryViewMetadataSave())
    expect(result.current.viewMetadataSaveStatus).toBe('dirty')
    await act(async () => vi.advanceTimersByTimeAsync(800))

    const stored = loadLocalStructuredViewMetadata(baseMetadata.documentUri)
    expect(stored?.viewMode).toBe('kanban')
    expect(result.current.viewMetadataSaveStatus).toBe('synced')
    expect(result.current.viewMetadataSaveError).toBeNull()
  })
})
