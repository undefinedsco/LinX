import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolveFilesListOpenDecision, type FilesListOpenTrigger } from './domain/list/list-open'
import type { FilesEntry } from './domain/resource/resource-model'

const rootListOpenShimPath = 'src/modules/files/list-open.ts'
const listOpenModelPath = 'src/modules/files/domain/list/list-open.ts'

function entry(overrides: Partial<FilesEntry>): FilesEntry {
  return {
    id: overrides.uri ?? 'https://pod.example/public/file.md',
    uri: overrides.uri ?? 'https://pod.example/public/file.md',
    name: overrides.name ?? 'file.md',
    kind: overrides.kind ?? 'resource',
    semanticKind: overrides.semanticKind ?? 'file',
    parentUri: 'https://pod.example/public/',
    mimeType: overrides.mimeType ?? 'text/markdown',
    size: 1024,
    modifiedAt: '2026-03-01T10:00:00Z',
    ...overrides,
  }
}

describe('files list open decisions', () => {
  it('keeps the list open decision model in domain/list with a root compatibility shim', () => {
    expect(existsSync(listOpenModelPath)).toBe(true)
    expect(existsSync(rootListOpenShimPath)).toBe(true)
    if (!existsSync(listOpenModelPath) || !existsSync(rootListOpenShimPath)) return

    const rootShimSource = readFileSync(rootListOpenShimPath, 'utf8')
    const modelSource = readFileSync(listOpenModelPath, 'utf8')

    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/list\/list-open'\n?$/)
    expect(modelSource).not.toContain("from './browser'")
    expect(modelSource).not.toContain("from '../browser'")
  })

  it('selects containers on click without entering them', () => {
    const container = entry({
      uri: 'https://pod.example/public/docs/',
      name: 'docs',
      kind: 'container',
      semanticKind: 'container',
      mimeType: 'inode/container',
    })

    expect(resolveFilesListOpenDecision(container, 'click')).toEqual({
      type: 'select-file',
      fileUri: 'https://pod.example/public/docs/',
    })
  })

  it('selects editable files on click without opening the sheet', () => {
    expect(resolveFilesListOpenDecision(entry({
      uri: 'https://pod.example/public/README.md',
      semanticKind: 'file',
      mimeType: 'text/markdown',
    }), 'click')).toEqual({
      type: 'select-file',
      fileUri: 'https://pod.example/public/README.md',
    })
  })

  it.each([
    ['double-click', { type: 'browse-container', treeNodeId: 'container:https://pod.example/public/docs/' }],
    ['enter', { type: 'browse-container', treeNodeId: 'container:https://pod.example/public/docs/' }],
    ['explicit-open', { type: 'browse-container', treeNodeId: 'container:https://pod.example/public/docs/' }],
  ] satisfies [FilesListOpenTrigger, ReturnType<typeof resolveFilesListOpenDecision>][])(
    'enters containers on %s',
    (trigger, expected) => {
      expect(resolveFilesListOpenDecision(entry({
        uri: 'https://pod.example/public/docs/',
        name: 'docs',
        kind: 'container',
        semanticKind: 'container',
        mimeType: 'inode/container',
      }), trigger)).toEqual(expected)
    },
  )

  it.each([
    [
      'readonly media files',
      {
        uri: 'https://pod.example/public/diagram.png',
        semanticKind: 'file' as const,
        mimeType: 'image/png',
      },
    ],
    [
      'structured RDF files',
      {
        uri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
        semanticKind: 'structured-data' as const,
        mimeType: 'text/turtle',
      },
    ],
    [
      'locked vocab registries',
      {
        uri: 'https://pod.example/.vocab/terms.ttl',
        semanticKind: 'vocab-terms' as const,
        mimeType: 'text/turtle',
      },
    ],
  ])('selects %s into the detail preview flow on open triggers', (_label, overrides) => {
    for (const trigger of ['double-click', 'enter', 'explicit-open'] satisfies FilesListOpenTrigger[]) {
      expect(resolveFilesListOpenDecision(entry(overrides), trigger)).toEqual({
        type: 'select-file-preview',
        fileUri: overrides.uri,
      })
    }
  })

  it('opens editable files through the sheet flow on open triggers', () => {
    const file = entry({
      uri: 'https://pod.example/public/README.md',
      semanticKind: 'file',
      mimeType: 'text/markdown',
    })

    for (const trigger of ['double-click', 'enter', 'explicit-open'] satisfies FilesListOpenTrigger[]) {
      expect(resolveFilesListOpenDecision(file, trigger)).toEqual({
        type: 'open-editable-sheet',
        fileUri: 'https://pod.example/public/README.md',
      })
    }
  })
})
