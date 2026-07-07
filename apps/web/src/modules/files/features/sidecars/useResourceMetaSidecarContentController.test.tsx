import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { FilesDetail, FilesMetaSidecar } from '../../domain/resource/resource-model'
import type { ResourceMetaSidecarQuery } from './useResourceMetaDrawerController'
import { useResourceMetaSidecarContentController } from './useResourceMetaSidecarContentController'

const folder: FilesDetail = {
  id: 'https://pod.example/public/',
  uri: 'https://pod.example/public/',
  name: 'public',
  kind: 'container',
  semanticKind: 'container',
  parentUri: 'https://pod.example/',
  mimeType: 'inode/container',
  size: null,
  modifiedAt: '2026-06-29T00:00:00.000Z',
  headers: {},
  previewText: null,
  childEntries: [
    {
      id: 'https://pod.example/public/report.md',
      uri: 'https://pod.example/public/report.md',
      name: 'report.md',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 120,
      modifiedAt: '2026-06-29T01:00:00.000Z',
    },
    {
      id: 'https://pod.example/public/notes.md',
      uri: 'https://pod.example/public/notes.md',
      name: 'notes.md',
      kind: 'resource',
      semanticKind: 'file',
      parentUri: 'https://pod.example/public/',
      mimeType: 'text/markdown',
      size: 80,
      modifiedAt: '2026-06-29T02:00:00.000Z',
    },
  ],
}

function query(overrides: {
  data?: FilesMetaSidecar
  error?: unknown
  isLoading?: boolean
}): ResourceMetaSidecarQuery {
  return {
    data: overrides.data,
    error: overrides.error ?? null,
    isLoading: overrides.isLoading ?? false,
  } as ResourceMetaSidecarQuery
}

describe('useResourceMetaSidecarContentController', () => {
  it('projects meta sidecar content rows and access-filtered raw text outside the renderer', () => {
    const meta: FilesMetaSidecar = {
      ownerUri: folder.uri,
      metaUri: 'https://pod.example/public/.meta',
      state: 'exists',
      status: 200,
      content: [
        '<#meta> <#title> "Public folder" .',
        '<#meta> acl:agent <https://agent.example/profile#me> .',
        '<#meta> <https://w3id.org/solid/acp#grant> <#grant> .',
      ].join('\n'),
      mimeType: 'text/turtle',
      etag: '"meta-1"',
      size: 180,
    }

    const { result } = renderHook(() => useResourceMetaSidecarContentController({
      file: folder,
      query: query({ data: meta }),
    }))

    expect(result.current.status).toBe('ready')
    expect(result.current.metaRows.map(([, value]) => value)).toEqual(expect.arrayContaining([
      folder.uri,
      meta.metaUri,
      '200',
      'text/turtle',
      '"meta-1"',
    ]))
    expect(result.current.folderRows.map(([, value]) => value)).toContain(folder.uri)
    expect(result.current.folderRows.some(([, value]) => value.includes('200'))).toBe(true)
    expect(result.current.showFolderRows).toBe(true)
    expect(result.current.showSemanticRows).toBe(true)
    expect(result.current.showWorkspaceRows).toBe(false)
    expect(result.current.rawContentAvailable).toBe(true)
    expect(result.current.rawText).toContain('Public folder')
    expect(result.current.rawText).not.toContain('acl:agent')
    expect(result.current.rawText).not.toContain('solid/acp')
  })

  it('normalizes loading, error, missing-data, and missing-sidecar states', () => {
    expect(renderHook(() => useResourceMetaSidecarContentController({
      file: folder,
      query: query({ isLoading: true }),
    })).result.current).toMatchObject({
      status: 'loading',
      showFolderRows: false,
      showSemanticRows: false,
      showWorkspaceRows: false,
    })

    expect(renderHook(() => useResourceMetaSidecarContentController({
      file: folder,
      query: query({ error: new Error('HTTP 500') }),
    })).result.current).toMatchObject({
      status: 'error',
      errorMessage: 'HTTP 500',
      showFolderRows: false,
      showSemanticRows: false,
      showWorkspaceRows: false,
    })

    expect(renderHook(() => useResourceMetaSidecarContentController({
      file: folder,
      query: query({}),
    })).result.current).toMatchObject({
      status: 'unknown',
      showFolderRows: false,
      showSemanticRows: false,
      showWorkspaceRows: false,
    })

    expect(renderHook(() => useResourceMetaSidecarContentController({
      file: folder,
      query: query({
        data: {
          ownerUri: folder.uri,
          metaUri: 'https://pod.example/public/.meta',
          state: 'missing',
          status: 404,
          content: null,
          mimeType: null,
          etag: null,
          size: null,
        },
      }),
    })).result.current).toMatchObject({
      status: 'ready',
      metaState: 'missing',
      rawContentAvailable: false,
      rawText: null,
    })
  })
})
