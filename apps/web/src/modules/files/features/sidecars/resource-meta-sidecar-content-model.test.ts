import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { FilesDetail, FilesMetaSidecar } from '../../domain/resource/resource-model'
import { projectResourceMetaSidecarContent } from './resource-meta-sidecar-content-model'

const modelPath = 'src/modules/files/features/sidecars/resource-meta-sidecar-content-model.ts'
const controllerPath = 'src/modules/files/features/sidecars/useResourceMetaSidecarContentController.ts'

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
  ],
}

function meta(overrides: Partial<FilesMetaSidecar> = {}): FilesMetaSidecar {
  return {
    ownerUri: overrides.ownerUri ?? folder.uri,
    metaUri: overrides.metaUri ?? 'https://pod.example/public/.meta',
    state: overrides.state ?? 'exists',
    status: overrides.status ?? 200,
    content: 'content' in overrides
      ? overrides.content ?? null
      : [
          '<#meta> <#title> "Public folder" .',
          '<#meta> acl:agent <https://agent.example/profile#me> .',
          '<#meta> <https://w3id.org/solid/acp#grant> <#grant> .',
        ].join('\n'),
    mimeType: overrides.mimeType ?? 'text/turtle',
    etag: overrides.etag ?? '"meta-1"',
    size: overrides.size ?? 180,
  }
}

describe('resource meta sidecar content model', () => {
  it('keeps meta content projection in a pure model', () => {
    expect(existsSync(modelPath)).toBe(true)
    expect(existsSync(controllerPath)).toBe(true)
    if (!existsSync(modelPath) || !existsSync(controllerPath)) return

    const modelSource = readFileSync(modelPath, 'utf8')
    const controllerSource = readFileSync(controllerPath, 'utf8')

    expect(modelSource).toContain('export function projectResourceMetaSidecarContent')
    expect(modelSource).toContain('function localizeMetaRows')
    expect(modelSource).toContain('function omitAccessPolicyFactsFromMetaText')
    expect(modelSource).toContain('function formatMetaQueryError')
    expect(modelSource).not.toContain('useFilesMetaSidecar')
    expect(modelSource).not.toContain('SidecarDrawer')
    expect(modelSource).not.toContain('<MetaRows')
    expect(controllerSource).toContain("from './resource-meta-sidecar-content-model'")
    expect(controllerSource).not.toContain('function localizeMetaRows')
    expect(controllerSource).not.toContain('function omitAccessPolicyFactsFromMetaText')
    expect(controllerSource).not.toContain('function formatMetaQueryError')
    expect(controllerSource).not.toContain('folderRows.length')
  })

  it('projects meta rows and access-filtered raw text', () => {
    const content = projectResourceMetaSidecarContent({
      file: folder,
      isLoading: false,
      error: null,
      meta: meta(),
    })

    expect(content.status).toBe('ready')
    expect(content.fileRows.map(([, value]) => value)).toEqual(expect.arrayContaining([
      folder.id,
      folder.name,
      folder.uri,
      'inode/container',
    ]))
    expect(content.metaRows.map(([, value]) => value)).toEqual(expect.arrayContaining([
      folder.uri,
      'https://pod.example/public/.meta',
      '200',
      'text/turtle',
      '"meta-1"',
    ]))
    expect(content.folderRows.map(([, value]) => value)).toContain(folder.uri)
    expect(content.showFolderRows).toBe(true)
    expect(content.showSemanticRows).toBe(true)
    expect(content.showWorkspaceRows).toBe(false)
    expect(content.rawContentAvailable).toBe(true)
    expect(content.rawText).toContain('Public folder')
    expect(content.rawText).not.toContain('acl:agent')
    expect(content.rawText).not.toContain('solid/acp')
    expect(content.rawPanel).toEqual({
      kind: 'content',
      text: content.rawText,
    })
  })

  it('projects human-facing metadata before transport diagnostics', () => {
    const content = projectResourceMetaSidecarContent({
      file: folder,
      isLoading: false,
      error: null,
      meta: meta({
        content: [
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '<#meta> rdfs:label "Public knowledge" ;',
          '  udfs:tags "docs", "shared" ;',
          '  udfs:reviewStatus "Needs review" .',
        ].join('\n'),
      }),
    })

    expect(content.userRows).toEqual([
      ['标题', 'Public knowledge'],
      ['标签', 'docs、shared'],
      ['审核状态', 'Needs review'],
    ])
  })

  it('projects owner metadata from a file-level sidecar subject', () => {
    const content = projectResourceMetaSidecarContent({
      file: folder,
      isLoading: false,
      error: null,
      meta: meta({
        content: [
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '@prefix udfs: <https://undefineds.co/vocab/> .',
          '<./> rdfs:label "Public knowledge" ;',
          '  udfs:reviewStatus "Ready" .',
        ].join('\n'),
      }),
    })

    expect(content.userRows).toEqual([
      ['标题', 'Public knowledge'],
      ['审核状态', 'Ready'],
    ])
  })

  it('normalizes loading, error, unknown, and missing sidecar states', () => {
    expect(projectResourceMetaSidecarContent({
      file: folder,
      isLoading: true,
      error: null,
      meta: undefined,
    })).toMatchObject({
      status: 'loading',
      fileRows: expect.arrayContaining([
        ['名称', folder.name],
        ['URI', folder.uri],
      ]),
      showFolderRows: false,
      showSemanticRows: false,
      showWorkspaceRows: false,
    })

    expect(projectResourceMetaSidecarContent({
      file: folder,
      isLoading: false,
      error: new Error('HTTP 500'),
      meta: undefined,
    })).toMatchObject({
      status: 'error',
      errorMessage: 'HTTP 500',
      showFolderRows: false,
      showSemanticRows: false,
      showWorkspaceRows: false,
    })

    expect(projectResourceMetaSidecarContent({
      file: folder,
      isLoading: false,
      error: null,
      meta: undefined,
    })).toMatchObject({
      status: 'unknown',
      showFolderRows: false,
      showSemanticRows: false,
      showWorkspaceRows: false,
    })

    expect(projectResourceMetaSidecarContent({
      file: folder,
      isLoading: false,
      error: null,
      meta: meta({
        state: 'missing',
        status: 404,
        content: null,
        mimeType: null,
        etag: null,
        size: null,
      }),
    })).toMatchObject({
      status: 'ready',
      metaState: 'missing',
      rawContentAvailable: false,
      rawText: null,
      rawPanel: {
        kind: 'notice',
        tone: 'neutral',
        message: '未找到 .meta。',
      },
    })

    expect(projectResourceMetaSidecarContent({
      file: folder,
      isLoading: false,
      error: null,
      meta: meta({
        state: 'inaccessible',
        status: 403,
        content: null,
      }),
    })).toMatchObject({
      rawPanel: {
        kind: 'notice',
        tone: 'warning',
        message: '.meta 不可访问。',
      },
    })
  })
})
