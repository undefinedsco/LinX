import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'
import { FolderDetailTreeView } from './FolderDetailTreeView'

const mockUseFileDetail = vi.fn()

vi.mock('../../data/queries', () => ({
  useFileDetail: (...args: unknown[]) => mockUseFileDetail(...args),
}))

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
    ...entry('docs', 'container'),
    headers: {},
    previewText: null,
    childEntries,
  }
}

describe('FolderDetailTreeView', () => {
  it('loads child containers only after disclosure and opens nested files through the existing workflow', async () => {
    const docs = entry('docs', 'container')
    const guide = {
      ...entry('guide.md'),
      id: 'https://pod.example/files/docs/guide.md',
      uri: 'https://pod.example/files/docs/guide.md',
      parentUri: docs.uri,
    }
    const onOpen = vi.fn()
    mockUseFileDetail.mockReturnValue({
      data: folderDetail([guide]),
      isLoading: false,
      error: null,
    })

    render(
      <FolderDetailTreeView
        file={folderDetail([docs])}
        rows={[{
          entry: docs,
          iconKind: 'folder',
          typeLabel: '目录',
          modifiedLabel: '—',
          sizeLabel: '—',
        }]}
        selectedUris={new Set()}
        sort={{ key: 'name', direction: 'asc' }}
        actionMenu={{ items: [] }}
        collectionChrome={{ ariaLabel: 'Folder list view', sortHeaders: [] }}
        onSortKey={vi.fn()}
        onSelect={vi.fn()}
        onKeyboardSelect={vi.fn()}
        onContextMenuSelect={vi.fn()}
        onOpen={onOpen}
        onCopyUri={vi.fn()}
        onRename={vi.fn()}
        onCopy={vi.fn()}
        onMove={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(mockUseFileDetail).not.toHaveBeenCalled()
    expect(screen.queryByText('guide.md')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '展开 docs' }))

    expect(await screen.findByText('guide.md')).toBeInTheDocument()
    expect(mockUseFileDetail).toHaveBeenCalledWith(docs.uri)

    const tree = screen.getByRole('tree', { name: 'Folder list view' })
    const guideButton = within(tree).getByRole('button', { name: /guide\.md/ })
    fireEvent.click(guideButton)
    expect(onOpen).toHaveBeenCalledWith(guide, 'click')
    fireEvent.doubleClick(guideButton)
    expect(onOpen).toHaveBeenCalledWith(guide, 'double-click')
  })
})
