import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FilesDetail } from '../../domain/resource/resource-model'
import { useStructuredResourcePreviewController } from './useStructuredResourcePreviewController'

const { mockUseFilesCurrentPodRootUri, mockUseFilesVocabRegistryDiscovery, mockUseRawTextResource } = vi.hoisted(() => ({
  mockUseFilesCurrentPodRootUri: vi.fn(),
  mockUseFilesVocabRegistryDiscovery: vi.fn(),
  mockUseRawTextResource: vi.fn(),
}))

vi.mock('../../data/queries', () => ({
  useFilesCurrentPodRootUri: (...args: unknown[]) => mockUseFilesCurrentPodRootUri(...args),
  useFilesVocabRegistryDiscovery: (...args: unknown[]) => mockUseFilesVocabRegistryDiscovery(...args),
  useRawTextResource: (...args: unknown[]) => mockUseRawTextResource(...args),
}))

function detail(overrides: Partial<FilesDetail>): FilesDetail {
  return {
    id: overrides.uri ?? 'https://pod.example/.data/tasks.ttl',
    uri: overrides.uri ?? 'https://pod.example/.data/tasks.ttl',
    name: overrides.name ?? 'tasks.ttl',
    kind: 'resource',
    semanticKind: overrides.semanticKind ?? 'structured-data',
    parentUri: overrides.parentUri ?? 'https://pod.example/.data/',
    mimeType: overrides.mimeType ?? 'text/turtle',
    size: overrides.size ?? 80,
    modifiedAt: '2026-06-29T00:00:00.000Z',
    headers: {},
    previewText: overrides.previewText ?? '<#task> a <#Task> .',
    ...overrides,
  }
}

describe('useStructuredResourcePreviewController', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUseFilesCurrentPodRootUri.mockReturnValue('https://pod.example/')
    mockUseFilesVocabRegistryDiscovery.mockReturnValue({ data: null, error: null, isLoading: false })
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: {
        uri,
        content: '',
        mimeType: 'text/turtle',
        etag: '"raw-1"',
        headers: {},
      },
      error: null,
      isLoading: false,
    }))
  })

  it('projects structured write support from the resource preview owner', () => {
    const { result } = renderHook(() => useStructuredResourcePreviewController(detail({
      uri: 'https://pod.example/.data/tasks.ttl',
      parentUri: 'https://pod.example/.data/',
    })))

    expect(result.current.structuredWritesSupported).toBe(true)
  })

  it('projects locked vocab resources as not writable from the resource preview owner', () => {
    const { result } = renderHook(() => useStructuredResourcePreviewController(detail({
      uri: 'https://pod.example/.vocab/terms.ttl',
      name: 'terms.ttl',
      parentUri: 'https://pod.example/.vocab/',
      semanticKind: 'vocab-terms',
    })))

    expect(result.current.structuredWritesSupported).toBe(false)
  })

  it('keeps vocab enrichment off the critical path until the resource body is available', () => {
    mockUseRawTextResource.mockImplementation((uri: string, enabled = true) => ({
      data: undefined,
      error: null,
      isLoading: enabled && uri.endsWith('tasks.ttl'),
    }))

    renderHook(() => useStructuredResourcePreviewController(detail({
      uri: 'https://pod.example/.data/tasks.ttl',
      previewText: null,
    })))

    expect(mockUseRawTextResource).toHaveBeenCalledWith('https://pod.example/.data/tasks.ttl')
    expect(mockUseRawTextResource).toHaveBeenCalledWith('https://pod.example/.vocab/terms.ttl', false)
    expect(mockUseRawTextResource).toHaveBeenCalledWith('https://pod.example/.vocab/shapes.ttl', false)
    expect(mockUseRawTextResource).toHaveBeenCalledWith('https://pod.example/.vocab/namespaces.ttl', false)
    expect(mockUseFilesVocabRegistryDiscovery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
  })
})
