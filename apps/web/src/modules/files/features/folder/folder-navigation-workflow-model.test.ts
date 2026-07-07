import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'
import {
  planFolderChildOpenEffect,
  projectFolderChildCopyText,
  projectSelectedFolderChildCopyText,
  shouldClearFolderChildSheet,
} from './folder-navigation-workflow-model'

const modelPath = 'src/modules/files/features/folder/folder-navigation-workflow-model.ts'
const controllerPath = 'src/modules/files/features/folder/useFolderDetailNavigationController.ts'

function entry(overrides: Partial<FilesEntry> = {}): FilesEntry {
  return {
    id: overrides.uri ?? 'https://pod.example/files/readme.md',
    uri: overrides.uri ?? 'https://pod.example/files/readme.md',
    name: overrides.name ?? 'readme.md',
    kind: overrides.kind ?? 'resource',
    semanticKind: overrides.semanticKind ?? 'file',
    parentUri: overrides.parentUri ?? 'https://pod.example/files/',
    mimeType: overrides.mimeType ?? 'text/markdown',
    size: overrides.size ?? 100,
    modifiedAt: overrides.modifiedAt ?? null,
  }
}

function detail(uri: string): FilesDetail {
  return {
    ...entry({ uri }),
    headers: {},
    previewText: null,
  }
}

describe('folder navigation workflow model', () => {
  it('keeps folder navigation copy/open/stale-sheet decisions in a pure model', () => {
    expect(existsSync(modelPath)).toBe(true)
    expect(existsSync(controllerPath)).toBe(true)
    if (!existsSync(modelPath) || !existsSync(controllerPath)) return

    const modelSource = readFileSync(modelPath, 'utf8')
    const controllerSource = readFileSync(controllerPath, 'utf8')

    expect(modelSource).toContain('export function planFolderChildOpenEffect')
    expect(modelSource).toContain('export function projectFolderChildCopyText')
    expect(modelSource).toContain('export function projectSelectedFolderChildCopyText')
    expect(modelSource).toContain('export function shouldClearFolderChildSheet')
    expect(modelSource).not.toContain('useFilesStore')
    expect(modelSource).not.toContain('useState')
    expect(modelSource).not.toContain('copyFilesText')
    expect(controllerSource).toContain("from './folder-navigation-workflow-model'")
    expect(controllerSource).not.toContain("from '../../domain/folder/folder-child-open'")
    expect(controllerSource).not.toContain('resolveFolderChildOpenDecision')
    expect(controllerSource).not.toContain('selectedChildren.map')
    expect(controllerSource).not.toContain('!childUriSet.has(sheetChild.uri)')
  })

  it('plans folder child open effects without coupling controller to open-mode semantics', () => {
    expect(planFolderChildOpenEffect(entry(), 'click')).toEqual({
      type: 'select-local-preview',
      fileUri: 'https://pod.example/files/readme.md',
    })
    expect(planFolderChildOpenEffect(entry({
      kind: 'container',
      semanticKind: 'container',
      name: 'docs',
      uri: 'https://pod.example/files/docs/',
      mimeType: 'inode/container',
    }), 'double-click')).toEqual({
      type: 'browse-container',
      treeNodeId: 'container:https://pod.example/files/docs/',
    })
    expect(planFolderChildOpenEffect(entry(), 'double-click')).toEqual({
      type: 'open-editable-sheet',
      file: expect.objectContaining({
        uri: 'https://pod.example/files/readme.md',
        previewUnavailableReason: '文件夹预览只显示轻量摘要；正文在文件详情中读取。',
      }),
    })
    expect(planFolderChildOpenEffect(entry({
      name: 'graph.ttl',
      uri: 'https://pod.example/files/graph.ttl',
      mimeType: 'text/turtle',
      semanticKind: 'structured',
    }), 'enter')).toEqual({
      type: 'select-file-preview',
      fileUri: 'https://pod.example/files/graph.ttl',
    })
  })

  it('projects copy payloads and stale sheet cleanup decisions', () => {
    const readme = entry()
    const graph = entry({
      name: 'graph.ttl',
      uri: 'https://pod.example/files/graph.ttl',
      mimeType: 'text/turtle',
      semanticKind: 'structured',
    })

    expect(projectFolderChildCopyText(readme)).toBe('https://pod.example/files/readme.md')
    expect(projectSelectedFolderChildCopyText([readme, graph])).toBe([
      'https://pod.example/files/readme.md',
      'https://pod.example/files/graph.ttl',
    ].join('\n'))
    expect(shouldClearFolderChildSheet({
      sheetChild: null,
      childUriSet: new Set([readme.uri]),
    })).toBe(false)
    expect(shouldClearFolderChildSheet({
      sheetChild: detail(readme.uri),
      childUriSet: new Set([readme.uri]),
    })).toBe(false)
    expect(shouldClearFolderChildSheet({
      sheetChild: detail(readme.uri),
      childUriSet: new Set([graph.uri]),
    })).toBe(true)
  })
})
