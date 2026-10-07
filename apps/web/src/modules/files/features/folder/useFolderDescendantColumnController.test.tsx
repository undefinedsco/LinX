import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'
import { useFolderDescendantColumnController } from './useFolderDescendantColumnController'

const mockUseFileDetail = vi.fn()

vi.mock('../../data/queries', () => ({
  useFileDetail: (uri: string) => mockUseFileDetail(uri),
}))

function entry(overrides: Partial<FilesEntry> = {}): FilesEntry {
  return {
    id: overrides.id ?? overrides.uri ?? 'https://pod.example/files/report.md',
    uri: overrides.uri ?? 'https://pod.example/files/report.md',
    name: overrides.name ?? 'report.md',
    kind: overrides.kind ?? 'resource',
    semanticKind: overrides.semanticKind ?? 'file',
    parentUri: overrides.parentUri ?? 'https://pod.example/files/',
    mimeType: overrides.mimeType ?? 'text/markdown',
    size: overrides.size ?? 10,
    modifiedAt: overrides.modifiedAt ?? '2026-06-01T00:00:00.000Z',
  }
}

function container(overrides: Partial<FilesDetail> = {}): FilesDetail {
  return {
    ...entry({
      id: overrides.uri ?? 'https://pod.example/files/',
      uri: overrides.uri ?? 'https://pod.example/files/',
      name: overrides.name ?? 'files',
      kind: 'container',
      semanticKind: 'container',
      mimeType: null,
      size: null,
      parentUri: overrides.parentUri ?? 'https://pod.example/',
    }),
    headers: overrides.headers ?? {},
    previewText: overrides.previewText ?? null,
    childEntries: overrides.childEntries ?? [],
  }
}

describe('useFolderDescendantColumnController', () => {
  beforeEach(() => {
    mockUseFileDetail.mockReset()
  })

  it('projects descendant loading state without exposing query state to the column renderer', () => {
    mockUseFileDetail.mockReturnValue({
      data: null,
      error: null,
      isLoading: true,
    })

    const { result } = renderHook(() => useFolderDescendantColumnController('https://pod.example/files/'))

    expect(result.current.chrome.title).toBe('files')
    expect(result.current.chrome.ariaLabel).toBe('Folder column files')
    expect(result.current.chrome.loadingMessage).toBe('正在加载...')
    expect(result.current.contentState).toEqual({ kind: 'loading' })
  })

  it('projects descendant ready state and filters sidecar children', () => {
    const visible = entry()
    const sidecar = entry({
      id: 'report-meta',
      uri: 'https://pod.example/files/report.md.meta',
      name: 'report.md.meta',
    })
    const parentFile = container({
      childEntries: [visible, sidecar],
    })
    mockUseFileDetail.mockReturnValue({
      data: parentFile,
      error: null,
      isLoading: false,
    })

    const { result } = renderHook(() => useFolderDescendantColumnController('https://pod.example/files/'))

    expect(result.current.contentState).toEqual({ kind: 'ready', parentFile })
    expect(result.current.entries).toEqual([visible])
  })

  it('projects descendant unavailable state for failed or non-container detail reads', () => {
    mockUseFileDetail.mockReturnValue({
      data: entry(),
      error: new Error('HTTP 404'),
      isLoading: false,
    })

    const { result } = renderHook(() => useFolderDescendantColumnController('https://pod.example/files/'))

    expect(result.current.contentState).toEqual({ kind: 'unavailable' })
    expect(result.current.entries).toEqual([])
  })
})
