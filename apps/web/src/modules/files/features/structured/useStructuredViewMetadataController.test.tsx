import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StructuredViewMetadata } from '../../domain/structured/structured-view-metadata'
import { useStructuredViewMetadataController } from './useStructuredViewMetadataController'

const mutateAsync = vi.fn()
const toast = vi.fn()
const saveMutation = { mutateAsync }
const hydrateStructuredViewMetadata = vi.fn()
const markStructuredViewMetadataDirty = vi.fn()
const clearStructuredViewMetadataDirty = vi.fn()

vi.mock('../../data/queries', () => ({
  useStructuredViewMetadata: () => ({ data: baseMetadata }),
  useSaveStructuredViewMetadata: () => saveMutation,
}))

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast }),
}))

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

describe('useStructuredViewMetadataController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  it('does not autosave transient view state before the current document is locally changed', async () => {
    const transientMetadata = {
      ...baseMetadata,
      documentUri: 'https://pod.example/previous.ttl',
      viewMode: 'whiteboard' as const,
    }
    const { rerender } = renderHook(
      ({ currentViewMetadata }) => useStructuredViewMetadataController({
        currentViewMetadata,
        file: { uri: baseMetadata.documentUri, kind: 'resource' },
        hydrateStructuredViewMetadata,
        localViewMetadataDirty: false,
        markStructuredViewMetadataDirty,
        clearStructuredViewMetadataDirty,
        whiteboardLayoutKey: baseMetadata.documentUri,
      }),
      { initialProps: { currentViewMetadata: baseMetadata } },
    )

    rerender({ currentViewMetadata: transientMetadata })
    await act(async () => vi.advanceTimersByTimeAsync(800))

    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('keeps a durable error state and retries the current metadata', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce(undefined)
    const changedMetadata = { ...baseMetadata, viewMode: 'kanban' as const }
    const { result, rerender } = renderHook(
      ({ currentViewMetadata, localViewMetadataDirty }) => useStructuredViewMetadataController({
        currentViewMetadata,
        file: { uri: baseMetadata.documentUri, kind: 'resource' },
        hydrateStructuredViewMetadata,
        localViewMetadataDirty,
        markStructuredViewMetadataDirty,
        clearStructuredViewMetadataDirty,
        whiteboardLayoutKey: baseMetadata.documentUri,
      }),
      { initialProps: { currentViewMetadata: baseMetadata, localViewMetadataDirty: false } },
    )

    rerender({ currentViewMetadata: baseMetadata, localViewMetadataDirty: false })
    rerender({ currentViewMetadata: changedMetadata, localViewMetadataDirty: true })
    expect(result.current.viewMetadataSaveStatus).toBe('dirty')

    await act(async () => vi.advanceTimersByTimeAsync(800))

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(result.current.viewMetadataSaveStatus).toBe('error')
    expect(result.current.viewMetadataSaveError).toBe('network unavailable')

    act(() => result.current.retryViewMetadataSave())
    expect(result.current.viewMetadataSaveStatus).toBe('dirty')
    await act(async () => vi.advanceTimersByTimeAsync(800))

    expect(mutateAsync).toHaveBeenCalledTimes(2)
    expect(result.current.viewMetadataSaveStatus).toBe('synced')
    expect(result.current.viewMetadataSaveError).toBeNull()
  })
})
