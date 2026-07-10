import { FileCode2, FileText, Folder, FolderOpen, Home, Image } from 'lucide-react'
import { FilesSearchHeader } from './FilesChrome'
import type { FilesSelection, IconType } from './files-types'

export function FilesList({
  mobileOpen = false,
  onMobileClose,
  selection,
  onSelect,
}: {
  mobileOpen?: boolean
  onMobileClose?: () => void
  selection: FilesSelection
  onSelect: (selection: FilesSelection) => void
}) {
  const fileTree: Array<{
    id: string
    label: string
    icon: IconType
    depth: number
    selection?: FilesSelection
    open?: boolean
    muted?: boolean
  }> = [
    { id: 'pod-home', label: 'Pod Home', icon: Home, depth: 0, open: true },
    { id: 'data', label: '.data', icon: FolderOpen, depth: 1, open: true },
    { id: 'data-workspaces', label: 'workspaces', icon: FolderOpen, depth: 2, open: true },
    { id: 'data-workspace-linx', label: 'linx-prototype.ttl', icon: FileCode2, depth: 3, selection: 'structuredData' },
    { id: 'data-repositories', label: 'repositories', icon: FolderOpen, depth: 2, open: true },
    { id: 'data-repo-linx', label: 'linx.ttl', icon: FileCode2, depth: 3, muted: true },
    { id: 'data-agents', label: 'agents', icon: FolderOpen, depth: 2, open: true },
    { id: 'data-agent-secretary', label: 'secretary/profile.ttl', icon: FileCode2, depth: 3, muted: true },
    { id: 'data-proposals', label: 'proposals', icon: FolderOpen, depth: 2, open: true },
    { id: 'data-proposal-vocab', label: 'vocab/review-status.ttl', icon: FileCode2, depth: 3, muted: true },
    { id: 'data-restricted', label: 'restricted.ttl', icon: FileCode2, depth: 2, selection: 'restricted' },
    { id: 'vocab', label: '.vocab', icon: FolderOpen, depth: 1, open: true },
    { id: 'vocab-terms-ttl', label: 'terms.ttl', icon: FileCode2, depth: 2, selection: 'structuredVocab' },
    { id: 'vocab-shapes-ttl', label: 'shapes.ttl', icon: FileCode2, depth: 2, selection: 'structuredVocabShapes' },
    { id: 'vocab-namespaces', label: 'namespaces.ttl', icon: FileCode2, depth: 2, selection: 'structuredVocabNamespaces' },
    { id: 'files', label: 'files', icon: FolderOpen, depth: 1, selection: 'folderRoot', open: true },
    { id: 'docs', label: 'docs', icon: FolderOpen, depth: 2, selection: 'folder', open: true },
    { id: 'multi-channel-access', label: 'multi-channel-access.md', icon: FileText, depth: 3, selection: 'document' },
    { id: 'images', label: 'images', icon: FolderOpen, depth: 2, open: true },
    { id: 'prototype-layout', label: 'prototype-layout.png', icon: Image, depth: 3, selection: 'image' },
    { id: 'chat', label: 'chat', icon: Folder, depth: 1, muted: true },
    { id: 'inbox', label: 'inbox', icon: Folder, depth: 1, muted: true },
  ]

  return (
    <section className={`list-pane tree-pane ${mobileOpen ? 'mobile-open' : ''}`}>
      <FilesSearchHeader placeholder="Search files" addLabel="New resource" onMobileClose={onMobileClose} />
      <div className="folder-tree" aria-label="Pod file tree">
        {fileTree.map((item) => {
          const Icon = item.icon
          const active = item.selection === selection
          const selectItem = () => {
            if (!item.selection) return
            const nextSelection = item.selection
            if (mobileOpen) {
              onMobileClose?.()
              window.setTimeout(() => onSelect(nextSelection), 180)
              return
            }
            window.setTimeout(() => {
              onSelect(nextSelection)
            }, 0)
          }
          const selectFromMobilePointer = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
            if (!mobileOpen || !item.selection) return
            event.preventDefault()
            event.stopPropagation()
            selectItem()
          }
          return (
            <button
              className={`${active ? 'active ' : ''}${item.muted ? 'muted ' : ''}depth-${item.depth}`}
              key={item.id}
              onPointerUp={selectFromMobilePointer}
              onMouseUp={selectFromMobilePointer}
              onClick={selectItem}
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
