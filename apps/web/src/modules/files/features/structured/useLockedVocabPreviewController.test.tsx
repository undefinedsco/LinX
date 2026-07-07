import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FilesDetail } from '../../domain/resource/resource-model'
import { useLockedVocabPreviewController } from './useLockedVocabPreviewController'

const {
  mockUseFilesRouteBridge,
  mockUseFilesStore,
  mockUseRawTextResource,
} = vi.hoisted(() => ({
  mockUseFilesRouteBridge: vi.fn(),
  mockUseFilesStore: vi.fn(),
  mockUseRawTextResource: vi.fn(),
}))

vi.mock('../../app/FilesRouteContext', () => ({
  useFilesRouteBridge: (...args: unknown[]) => mockUseFilesRouteBridge(...args),
}))

vi.mock('../../app/store', () => ({
  useFilesStore: (...args: unknown[]) => mockUseFilesStore(...args),
}))

vi.mock('../../data/queries', () => ({
  useRawTextResource: (...args: unknown[]) => mockUseRawTextResource(...args),
}))

function detail(overrides: Partial<FilesDetail>): FilesDetail {
  return {
    id: overrides.uri ?? 'https://pod.example/.vocab/terms.ttl',
    uri: overrides.uri ?? 'https://pod.example/.vocab/terms.ttl',
    name: overrides.name ?? 'terms.ttl',
    kind: 'resource',
    semanticKind: overrides.semanticKind ?? 'vocab-terms',
    parentUri: overrides.parentUri ?? 'https://pod.example/.vocab/',
    mimeType: overrides.mimeType ?? 'text/turtle',
    size: overrides.size ?? 80,
    modifiedAt: '2026-06-29T00:00:00.000Z',
    headers: {},
    previewText: overrides.previewText ?? null,
    ...overrides,
  }
}

describe('useLockedVocabPreviewController', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUseFilesRouteBridge.mockReturnValue(null)
    mockUseFilesStore.mockImplementation((selector: (state: { openStructuredSubjectResource: () => void }) => unknown) => (
      selector({ openStructuredSubjectResource: vi.fn() })
    ))
    mockUseRawTextResource.mockImplementation((uri: string) => ({
      data: {
        uri,
        content: `
          @prefix udfs: <https://undefineds.co/vocab/> .
          @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
          <#status> a udfs:Predicate ; rdfs:label "Status" .
        `,
        mimeType: 'text/turtle',
        etag: '"raw-1"',
        headers: {},
      },
      error: null,
      isLoading: false,
    }))
  })

  it('projects preview chrome from the locked vocab registry kind and row count', () => {
    const { result } = renderHook(() => useLockedVocabPreviewController(detail({})))

    expect(result.current.chrome).toEqual({
      viewport: { ariaLabel: 'Locked vocab registry viewport' },
      header: {
        title: '词表定义表',
        countLabel: '1 条定义',
        readOnlyNote: '定义表只读；修改通过待确认提案进入审批。',
        badge: { label: '只读' },
      },
    })
  })

  it('switches preview chrome for shape registries', () => {
    const { result } = renderHook(() => useLockedVocabPreviewController(detail({
      uri: 'https://pod.example/.vocab/shapes.ttl',
      name: 'shapes.ttl',
      semanticKind: 'vocab-shapes',
    })))

    expect(result.current.chrome.header.title).toBe('Shape 规则表')
    expect(result.current.chrome.header.countLabel).toBe('1 条规则')
  })
})
