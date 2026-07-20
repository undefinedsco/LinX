import { describe, expect, it } from 'vitest'
import {
  buildFolderChildCopyName,
  buildFolderChildRenameDestination,
  resolveFolderChildRenameDestination,
  resolveFolderChildTransferDestination,
  fileEntryToFolderChildDetail,
  resolveFolderChildOpenDecision,
  type FolderChildOpenTrigger,
} from './folder-child-open'
import type { FilesEntry } from './browser'

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

describe('folder child open decisions', () => {
  it('converts a child entry into the lightweight detail used by folder sheets', () => {
    expect(fileEntryToFolderChildDetail(entry({ name: 'README.md' }))).toMatchObject({
      name: 'README.md',
      headers: {},
      previewText: null,
      previewUnavailableReason: '文件夹预览只显示轻量摘要；正文在文件详情中读取。',
    })
  })

  it.each([
    ['click', { type: 'noop' }],
    ['double-click', { type: 'browse-container', treeNodeId: 'container:https://pod.example/public/docs/' }],
    ['enter', { type: 'browse-container', treeNodeId: 'container:https://pod.example/public/docs/' }],
    ['explicit-open', { type: 'browse-container', treeNodeId: 'container:https://pod.example/public/docs/' }],
  ] satisfies [FolderChildOpenTrigger, ReturnType<typeof resolveFolderChildOpenDecision>][])(
    'maps container %s to the expected decision',
    (trigger, expected) => {
      expect(resolveFolderChildOpenDecision(entry({
        uri: 'https://pod.example/public/docs/',
        name: 'docs',
        kind: 'container',
        semanticKind: 'container',
        mimeType: 'inode/container',
      }), trigger)).toEqual(expected)
    },
  )

  it('opens an editable file in read-only preview on click and a sheet on open triggers', () => {
    const child = entry({ uri: 'https://pod.example/public/README.md', mimeType: 'text/markdown' })

    expect(resolveFolderChildOpenDecision(child, 'click')).toEqual({
      type: 'select-file-preview',
      fileUri: 'https://pod.example/public/README.md',
    })
    expect(resolveFolderChildOpenDecision(child, 'double-click')).toEqual({
      type: 'open-editable-sheet',
      file: fileEntryToFolderChildDetail(child),
    })
    expect(resolveFolderChildOpenDecision(child, 'enter')).toEqual({
      type: 'open-editable-sheet',
      file: fileEntryToFolderChildDetail(child),
    })
    expect(resolveFolderChildOpenDecision(child, 'explicit-open')).toEqual({
      type: 'open-editable-sheet',
      file: fileEntryToFolderChildDetail(child),
    })
  })

  it('opens a readonly file preview on click and on explicit open triggers', () => {
    const child = entry({ uri: 'https://pod.example/public/image.png', mimeType: 'image/png' })

    expect(resolveFolderChildOpenDecision(child, 'click')).toEqual({
      type: 'select-file-preview',
      fileUri: 'https://pod.example/public/image.png',
    })
    expect(resolveFolderChildOpenDecision(child, 'double-click')).toEqual({
      type: 'select-file-preview',
      fileUri: 'https://pod.example/public/image.png',
    })
    expect(resolveFolderChildOpenDecision(child, 'enter')).toEqual({
      type: 'select-file-preview',
      fileUri: 'https://pod.example/public/image.png',
    })
    expect(resolveFolderChildOpenDecision(child, 'explicit-open')).toEqual({
      type: 'select-file-preview',
      fileUri: 'https://pod.example/public/image.png',
    })
  })

  it('opens structured and vocab resource previews on click and open triggers', () => {
    const structured = entry({
      uri: 'https://pod.example/.data/state.ttl',
      name: 'state.ttl',
      mimeType: 'text/turtle',
      semanticKind: 'structured-data',
    })
    const vocab = entry({
      uri: 'https://pod.example/.vocab/terms.ttl',
      name: 'terms.ttl',
      mimeType: 'text/turtle',
      semanticKind: 'vocab-terms',
    })

    expect(resolveFolderChildOpenDecision(structured, 'click')).toEqual({
      type: 'select-file-preview',
      fileUri: 'https://pod.example/.data/state.ttl',
    })
    expect(resolveFolderChildOpenDecision(structured, 'double-click')).toEqual({
      type: 'select-file-preview',
      fileUri: 'https://pod.example/.data/state.ttl',
    })
    expect(resolveFolderChildOpenDecision(structured, 'enter')).toEqual({
      type: 'select-file-preview',
      fileUri: 'https://pod.example/.data/state.ttl',
    })
    expect(resolveFolderChildOpenDecision(structured, 'explicit-open')).toEqual({
      type: 'select-file-preview',
      fileUri: 'https://pod.example/.data/state.ttl',
    })
    expect(resolveFolderChildOpenDecision(vocab, 'click')).toEqual({
      type: 'select-file-preview',
      fileUri: 'https://pod.example/.vocab/terms.ttl',
    })
    expect(resolveFolderChildOpenDecision(vocab, 'double-click')).toEqual({
      type: 'select-file-preview',
      fileUri: 'https://pod.example/.vocab/terms.ttl',
    })
    expect(resolveFolderChildOpenDecision(vocab, 'enter')).toEqual({
      type: 'select-file-preview',
      fileUri: 'https://pod.example/.vocab/terms.ttl',
    })
    expect(resolveFolderChildOpenDecision(vocab, 'explicit-open')).toEqual({
      type: 'select-file-preview',
      fileUri: 'https://pod.example/.vocab/terms.ttl',
    })
  })
})

describe('folder child rename destinations', () => {
  it('builds same-parent rename destinations for files, containers, and encoded names', () => {
    expect(buildFolderChildRenameDestination(entry({
      uri: 'https://pod.example/public/notes.md',
      name: 'notes.md',
    }), 'notes-renamed.md')).toBe('https://pod.example/public/notes-renamed.md')

    expect(buildFolderChildRenameDestination(entry({
      uri: 'https://pod.example/public/docs/',
      name: 'docs',
      kind: 'container',
      semanticKind: 'container',
      mimeType: 'inode/container',
    }), 'archive')).toBe('https://pod.example/public/archive/')

    expect(buildFolderChildRenameDestination(entry({
      uri: 'https://pod.example/public/notes.md',
      name: 'notes.md',
    }), 'report copy.md')).toBe('https://pod.example/public/report%20copy.md')
  })

  it('returns null for empty or unchanged folder child names', () => {
    const child = entry({
      uri: 'https://pod.example/public/notes.md',
      name: 'notes.md',
    })

    expect(buildFolderChildRenameDestination(child, '')).toBeNull()
    expect(buildFolderChildRenameDestination(child, '   ')).toBeNull()
    expect(buildFolderChildRenameDestination(child, 'notes.md')).toBeNull()
  })

  it('rejects folder child rename names that escape the current folder', () => {
    const child = entry({
      uri: 'https://pod.example/public/notes.md',
      name: 'notes.md',
    })

    expect(buildFolderChildRenameDestination(child, '../notes.md')).toBeNull()
    expect(buildFolderChildRenameDestination(child, 'docs/notes.md')).toBeNull()
    expect(buildFolderChildRenameDestination(child, 'https://other.example/notes.md')).toBeNull()
  })

  it('explains invalid rename destinations before a Pod mutation is attempted', () => {
    const child = entry({
      uri: 'https://pod.example/public/notes.md',
      name: 'notes.md',
    })
    const siblingEntries = [
      child,
      entry({
        uri: 'https://pod.example/public/existing.md',
        name: 'existing.md',
      }),
    ]

    expect(resolveFolderChildRenameDestination({
      child,
      input: '',
      siblingEntries,
    })).toEqual({ ok: false, reason: 'empty' })
    expect(resolveFolderChildRenameDestination({
      child,
      input: 'notes.md',
      siblingEntries,
    })).toEqual({ ok: false, reason: 'unchanged' })
    expect(resolveFolderChildRenameDestination({
      child,
      input: 'existing.md',
      siblingEntries,
    })).toEqual({
      ok: false,
      reason: 'conflict',
      destinationUri: 'https://pod.example/public/existing.md',
    })
    expect(resolveFolderChildRenameDestination({
      child,
      input: '../escape.md',
      siblingEntries,
    })).toEqual({ ok: false, reason: 'escape' })
    expect(resolveFolderChildRenameDestination({
      child,
      input: 'renamed.md',
      siblingEntries,
    })).toEqual({
      ok: true,
      destinationUri: 'https://pod.example/public/renamed.md',
    })
  })
})

describe('folder child transfer destinations', () => {
  const child = entry({
    uri: 'https://pod.example/public/diagram.png',
    name: 'diagram.png',
    parentUri: 'https://pod.example/public/',
    mimeType: 'image/png',
  })
  const siblingEntries = [
    entry({
      uri: 'https://pod.example/public/docs/',
      name: 'docs',
      kind: 'container',
      semanticKind: 'container',
      mimeType: 'inode/container',
    }),
    child,
    entry({
      uri: 'https://pod.example/public/existing.png',
      name: 'existing.png',
      mimeType: 'image/png',
    }),
  ]

  it('builds Finder-style copy names without colliding with siblings', () => {
    expect(buildFolderChildCopyName(child, siblingEntries)).toBe('diagram copy.png')
    expect(buildFolderChildCopyName(child, [
      ...siblingEntries,
      entry({
        uri: 'https://pod.example/public/diagram%20copy.png',
        name: 'diagram copy.png',
        mimeType: 'image/png',
      }),
    ])).toBe('diagram copy 2.png')
  })

  it('resolves Finder-style relative paths inside the current folder', () => {
    expect(resolveFolderChildTransferDestination({
      child,
      input: 'diagram copy.png',
      containerUri: 'https://pod.example/public/',
      siblingEntries,
    })).toEqual({
      ok: true,
      destinationUri: 'https://pod.example/public/diagram%20copy.png',
    })
  })

  it('treats trailing slash input as a target folder and appends the current file name', () => {
    expect(resolveFolderChildTransferDestination({
      child,
      input: 'archive/',
      containerUri: 'https://pod.example/public/',
      siblingEntries,
    })).toEqual({
      ok: true,
      destinationUri: 'https://pod.example/public/archive/diagram.png',
    })
  })

  it('rejects unchanged, existing sibling, and cross-Pod transfer destinations', () => {
    expect(resolveFolderChildTransferDestination({
      child,
      input: 'diagram.png',
      containerUri: 'https://pod.example/public/',
      siblingEntries,
    })).toEqual({ ok: false, reason: 'unchanged' })

    expect(resolveFolderChildTransferDestination({
      child,
      input: 'existing.png',
      containerUri: 'https://pod.example/public/',
      siblingEntries,
    })).toEqual({
      ok: false,
      reason: 'conflict',
      destinationUri: 'https://pod.example/public/existing.png',
    })

    expect(resolveFolderChildTransferDestination({
      child,
      input: 'https://other.example/public/diagram.png',
      containerUri: 'https://pod.example/public/',
      siblingEntries,
    })).toEqual({
      ok: false,
      reason: 'cross-pod',
      destinationUri: 'https://other.example/public/diagram.png',
    })
  })

  it('rejects relative transfer paths that escape the current folder', () => {
    expect(resolveFolderChildTransferDestination({
      child,
      input: '../escape.png',
      containerUri: 'https://pod.example/public/',
      siblingEntries,
    })).toEqual({
      ok: false,
      reason: 'escape',
      destinationUri: 'https://pod.example/escape.png',
    })
  })

  it('rejects absolute same-Pod transfer destinations outside the current folder', () => {
    expect(resolveFolderChildTransferDestination({
      child,
      input: '/private/diagram.png',
      containerUri: 'https://pod.example/public/',
      siblingEntries,
    })).toEqual({
      ok: false,
      reason: 'escape',
      destinationUri: 'https://pod.example/private/diagram.png',
    })

    expect(resolveFolderChildTransferDestination({
      child,
      input: 'https://pod.example/private/diagram.png',
      containerUri: 'https://pod.example/public/',
      siblingEntries,
    })).toEqual({
      ok: false,
      reason: 'escape',
      destinationUri: 'https://pod.example/private/diagram.png',
    })
  })

  it('rejects same-Pod absolute URI transfer destinations even when they stay inside the current folder', () => {
    expect(resolveFolderChildTransferDestination({
      child,
      input: 'https://pod.example/public/diagram-copy.png',
      containerUri: 'https://pod.example/public/',
      siblingEntries,
    })).toEqual({
      ok: false,
      reason: 'cross-pod',
      destinationUri: 'https://pod.example/public/diagram-copy.png',
    })
  })
})
