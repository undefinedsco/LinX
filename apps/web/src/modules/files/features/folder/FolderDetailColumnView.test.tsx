import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'
import { FolderColumnPanel } from './FolderDetailColumnView'

function entry(name: string): FilesEntry {
  const uri = `https://pod.example/files/${name}`
  return {
    id: uri,
    uri,
    name,
    kind: 'resource',
    semanticKind: 'file',
    parentUri: 'https://pod.example/files/',
    mimeType: 'text/markdown',
    size: 100,
    modifiedAt: null,
  }
}

function folder(): FilesDetail {
  const uri = 'https://pod.example/files/'
  return {
    id: uri,
    uri,
    name: 'files',
    kind: 'container',
    semanticKind: 'container',
    parentUri: 'https://pod.example/',
    mimeType: 'inode/container',
    size: null,
    modifiedAt: null,
    headers: {},
    previewText: null,
  }
}

describe('FolderColumnPanel', () => {
  it('sends a single-click file to the global read-only preview flow', () => {
    const child = entry('readme.md')
    const onOpen = vi.fn()

    render(
      <FolderColumnPanel
        ariaLabel="Folder column"
        title="files"
        parentFile={folder()}
        entries={[child]}
        selectedUri={null}
        sort={{ key: 'name', direction: 'asc' }}
        columnDepth={0}
        onSelect={vi.fn()}
        onContextMenuSelect={vi.fn()}
        onOpen={onOpen}
        onCopyUri={vi.fn()}
        onCopy={vi.fn()}
        onMove={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /readme\.md/ }))

    expect(onOpen).toHaveBeenCalledWith(child, 'click')
  })
})
