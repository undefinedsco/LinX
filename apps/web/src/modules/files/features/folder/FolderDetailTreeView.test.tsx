import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'
import type { FolderChildCollectionRow } from '../../domain/folder/folder-detail-model'
import { FolderDetailTreeView } from './FolderDetailTreeView'

function entry(name: string, kind: FilesEntry['kind'] = 'resource'): FilesEntry {
  const uri = `https://pod.example/files/${name}${kind === 'container' ? '/' : ''}`
  return {
    id: uri,
    uri,
    name,
    kind,
    semanticKind: kind === 'container' ? 'container' : 'file',
    parentUri: 'https://pod.example/files/',
    mimeType: kind === 'container' ? 'inode/container' : 'text/markdown',
    size: null,
    modifiedAt: null,
  }
}

function folderDetail(childEntries: FilesEntry[]): FilesDetail {
  return {
    ...entry('files', 'container'),
    headers: {},
    previewText: null,
    childEntries,
  }
}

function row(child: FilesEntry): FolderChildCollectionRow {
  return {
    entry: child,
    iconKind: child.kind === 'container' ? 'folder' : 'file',
    typeLabel: child.kind === 'container' ? '目录' : '文件',
    modifiedLabel: '—',
    sizeLabel: '—',
  }
}

function renderView({
  children,
  onOpen = vi.fn(),
  onSelect = vi.fn(),
  onKeyboardSelect = vi.fn(),
}: {
  children: FilesEntry[]
  onOpen?: ReturnType<typeof vi.fn>
  onSelect?: ReturnType<typeof vi.fn>
  onKeyboardSelect?: ReturnType<typeof vi.fn>
}) {
  const utils = render(
    <FolderDetailTreeView
      file={folderDetail(children)}
      rows={children.map(row)}
      selectedUris={new Set()}
      sort={{ key: 'name', direction: 'asc' }}
      actionMenu={{ items: [] }}
      collectionChrome={{ ariaLabel: 'Folder list view', sortHeaders: [] }}
      onSortKey={vi.fn()}
      onSelect={onSelect}
      onKeyboardSelect={onKeyboardSelect}
      onContextMenuSelect={vi.fn()}
      onOpen={onOpen}
      onCopyUri={vi.fn()}
      onRename={vi.fn()}
      onCopy={vi.fn()}
      onMove={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
  return { ...utils, onOpen, onSelect, onKeyboardSelect }
}

describe('FolderDetailTreeView', () => {
  it('renders folder rows without disclosure controls', () => {
    renderView({ children: [entry('docs', 'container')] })

    expect(screen.queryByRole('button', { name: /^展开 / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^收起 / })).not.toBeInTheDocument()
  })

  it('selects a folder on click without opening it, and opens it via double click or Enter', () => {
    const docs = entry('docs', 'container')
    const { onOpen, onSelect } = renderView({ children: [docs] })

    const docsButton = screen.getByRole('button', { name: /docs/ })
    fireEvent.click(docsButton)
    expect(onSelect).toHaveBeenCalledWith(docs, expect.anything())
    expect(onOpen).not.toHaveBeenCalled()

    fireEvent.doubleClick(docsButton)
    expect(onOpen).toHaveBeenCalledWith(docs, 'double-click')

    fireEvent.keyDown(docsButton, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith(docs, 'enter')
  })

  it('opens files on click and on Enter', () => {
    const guide = entry('guide.md')
    const { onOpen } = renderView({ children: [guide] })

    const guideButton = screen.getByRole('button', { name: /guide\.md/ })
    fireEvent.click(guideButton)
    expect(onOpen).toHaveBeenCalledWith(guide, 'click')

    fireEvent.keyDown(guideButton, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith(guide, 'enter')
  })
})
