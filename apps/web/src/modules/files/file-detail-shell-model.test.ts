import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

import type { FilesDetail } from './domain/resource/resource-model'
import { projectFileDetailShellState } from './domain/detail/file-detail-shell-model'

const rootShellModelShimPath = 'src/modules/files/file-detail-shell-model.ts'
const shellModelPath = 'src/modules/files/domain/detail/file-detail-shell-model.ts'

function filesDetail(overrides: Partial<FilesDetail> = {}): FilesDetail {
  return {
    id: 'https://pod.example/public/readme.md',
    uri: 'https://pod.example/public/readme.md',
    name: 'readme.md',
    kind: 'resource',
    semanticKind: 'file',
    parentUri: 'https://pod.example/public/',
    mimeType: 'text/markdown',
    size: 42,
    modifiedAt: '2026-06-01T10:00:00Z',
    headers: {},
    previewText: 'hello',
    ...overrides,
  }
}

describe('file detail shell model', () => {
  it('keeps the detail shell projection in domain/detail with a root compatibility shim', () => {
    expect(existsSync(shellModelPath)).toBe(true)
    expect(existsSync(rootShellModelShimPath)).toBe(true)
    if (!existsSync(shellModelPath) || !existsSync(rootShellModelShimPath)) return

    const rootShimSource = readFileSync(rootShellModelShimPath, 'utf8')
    const modelSource = readFileSync(shellModelPath, 'utf8')

    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/detail\/file-detail-shell-model'\n?$/)
    expect(modelSource).not.toContain("from './browser'")
    expect(modelSource).not.toContain("from '../browser'")
    expect(modelSource).not.toContain("from '../../store'")
  })

  it('projects editable file chrome without tabs or inline sidecar drawer', () => {
    const state = projectFileDetailShellState({
      detailTab: 'metadata',
      file: filesDetail(),
      hasSystemOpen: true,
    })

    expect(state).toMatchObject({
      activeDetailTab: 'preview',
      openMode: 'editable-file-sheet',
      showHeadSidecarActions: false,
      showMetaDrawer: false,
      showSourceLinkedDrawerMetadata: false,
      showTabs: false,
    })
    expect(state.resourceActions.map((action) => action.id)).toEqual(['download', 'system-open'])
    expect(state.sidecarOwnerTarget).toEqual({
      kind: 'resource',
      uri: 'https://pod.example/public/readme.md',
    })
  })

  it('projects embedded structured and locked vocab resources without tabs while keeping sidecars available', () => {
    const structuredState = projectFileDetailShellState({
      detailTab: 'lineage',
      file: filesDetail({
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        name: 'state.ttl',
        semanticKind: 'structured-data',
        mimeType: 'text/turtle',
      }),
      hasSystemOpen: false,
    })
    const vocabState = projectFileDetailShellState({
      detailTab: 'preview',
      file: filesDetail({
        uri: 'https://pod.example/.vocab/terms.ttl',
        name: 'terms.ttl',
        semanticKind: 'vocab-terms',
        mimeType: 'text/turtle',
      }),
      hasSystemOpen: false,
    })

    expect(structuredState).toMatchObject({
      activeDetailTab: 'lineage',
      openMode: 'structured-data-table',
      showHeadSidecarActions: true,
      showMetaDrawer: true,
      showTabs: false,
    })
    expect(vocabState).toMatchObject({
      openMode: 'locked-vocab-table',
      showHeadSidecarActions: true,
      showMetaDrawer: true,
      showTabs: false,
    })
  })

  it('projects source-linked cards with tabs and drawer metadata', () => {
    const state = projectFileDetailShellState({
      detailTab: 'metadata',
      file: filesDetail({
        uri: 'https://pod.example/.data/sources/report.card.ttl',
        name: 'report.card.ttl',
        semanticKind: 'source-linked-card',
        mimeType: 'text/turtle',
      }),
      hasSystemOpen: false,
    })

    expect(state).toMatchObject({
      activeDetailTab: 'preview',
      openMode: 'source-linked-card-preview',
      showHeadSidecarActions: true,
      showMetaDrawer: true,
      showSourceLinkedDrawerMetadata: true,
      showTabs: true,
    })
  })

  it('uses the folder browser itself instead of preview and source tabs', () => {
    const state = projectFileDetailShellState({
      detailTab: 'preview',
      file: filesDetail({
        uri: 'https://pod.example/public/',
        name: 'public',
        kind: 'container',
        semanticKind: 'container',
        mimeType: 'inode/container',
      }),
      hasSystemOpen: false,
    })

    expect(state).toMatchObject({
      openMode: 'browse-container',
      showTabs: false,
    })
  })

  it('projects sidecar owner targets back to the canonical file resource', () => {
    const state = projectFileDetailShellState({
      detailTab: 'preview',
      file: filesDetail({
        uri: 'https://pod.example/public/readme.md.meta',
        name: 'readme.md.meta',
        semanticKind: 'meta-sidecar',
        mimeType: 'text/turtle',
      }),
      hasSystemOpen: false,
    })

    expect(state).toMatchObject({
      openMode: 'sidecar-detail',
      showHeadSidecarActions: true,
      showMetaDrawer: true,
      showTabs: true,
    })
    expect(state.sidecarOwnerTarget).toEqual({
      kind: 'resource',
      uri: 'https://pod.example/public/readme.md',
    })
  })
})
