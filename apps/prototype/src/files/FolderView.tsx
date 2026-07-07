import { useState } from 'react'
import {
  ChevronRight,
  Columns3,
  LayoutGrid,
  List,
  Plus,
  Upload,
} from 'lucide-react'
import { FileDetailModal, type FilePropertyState } from './FileEditorSheet'
import type { FileOpenSample, FilesSelection, FolderOpenSample, StoredFileContent } from './files-types'
import { AccessPolicyDialog } from './ResourceSidecars'
import { AccessIconButton, FilePageHeader, MetaToggleButton } from './files-ui'
import { multiChannelAccessBlocks } from './files-model'

type FolderViewMode = 'list' | 'column' | 'icon'

export function FolderMain({
  folder,
  detailOpen,
  onToggleDetail,
  onOpenSelection,
  isFileFavorite,
  fileContentsByPath,
  filePropertiesByPath,
  onChangeFileContent,
  onChangeFileProperties,
  onToggleFileFavorite,
}: {
  folder: FolderOpenSample
  detailOpen: boolean
  onToggleDetail: () => void
  onOpenSelection?: (selection: FilesSelection) => void
  fileContentsByPath?: Record<string, StoredFileContent>
  filePropertiesByPath?: Record<string, FilePropertyState>
  isFileFavorite?: (path: string) => boolean
  onChangeFileContent?: (path: string, content: StoredFileContent) => void
  onChangeFileProperties?: (path: string, properties: FilePropertyState) => void
  onToggleFileFavorite?: (file: FileOpenSample) => void
}) {
  const [selectedChildName, setSelectedChildName] = useState(folder.children[0]?.name ?? '')
  const [viewMode, setViewMode] = useState<FolderViewMode>('list')
  const [documentOpen, setDocumentOpen] = useState(false)
  const selectedChild = folder.children.find((child) => child.name === selectedChildName) ?? folder.children[0]
  const SelectedIcon = selectedChild.icon
  const [accessOpen, setAccessOpen] = useState(false)
  const isSelectedDocument = selectedChild.name.endsWith('.md')
  const isSelectedImage = selectedChild.kind === 'Image'
  const isSelectedStructured = selectedChild.targetSelection === 'structuredData' || selectedChild.targetSelection === 'structuredVocab'
  const hasSelectedOpenTarget = Boolean(selectedChild.targetSelection)
  const pathParts = folder.path.split('/').filter(Boolean)
  const openSelectedChild = () => {
    if (isSelectedDocument) {
      setDocumentOpen(true)
      return
    }
    if (selectedChild.targetSelection) onOpenSelection?.(selectedChild.targetSelection)
  }
  const selectedDocumentFile: FileOpenSample = {
    id: 'document',
    name: selectedChild.name,
    path: `${folder.path}${selectedChild.name}`,
    kind: 'Markdown document',
    summary: `${selectedChild.name} is an editable Markdown resource in this folder.`,
    icon: selectedChild.icon,
    blocks: multiChannelAccessBlocks,
    meta: [
      ['format', 'text/markdown'],
      ['size', selectedChild.detail.split('·')[0]?.trim() ?? 'Markdown'],
      ['modified', selectedChild.detail.split('·')[1]?.trim() ?? 'Unknown'],
      ['permission', 'Private'],
    ],
  }

  return (
    <main className="work-pane files-work file-open-work">
      <FilePageHeader title={folder.name} subtitle={`${folder.kind} · ${folder.path}`}>
        <AccessIconButton onClick={() => setAccessOpen(true)} />
        <button><Upload size={15} /> Upload</button>
        <button><Plus size={15} /> New</button>
        <MetaToggleButton open={detailOpen} onToggle={onToggleDetail} />
      </FilePageHeader>
      <section className="folder-detail-surface">
        <div className="finder-toolbar" aria-label="Folder toolbar">
          <span className="finder-nav">
            <button title="Back"><ChevronRight size={14} /></button>
            <button title="Forward"><ChevronRight size={14} /></button>
          </span>
          <span className="finder-path">
            <button>Pod Home</button>
            {pathParts.map((part) => (
              <span className="finder-path-part" key={part}>
                <ChevronRight size={13} />
                <button>{part}</button>
              </span>
            ))}
          </span>
          <span className="finder-view-toggle">
            <button
              className={viewMode === 'list' ? 'active' : ''}
              title="List view"
              aria-label="Folder list view"
              onClick={() => setViewMode('list')}
            >
              <List size={14} />
            </button>
            <button
              className={viewMode === 'column' ? 'active' : ''}
              title="Column view"
              aria-label="Folder column view"
              onClick={() => setViewMode('column')}
            >
              <Columns3 size={14} />
            </button>
            <button
              className={viewMode === 'icon' ? 'active' : ''}
              title="Icon view"
              aria-label="Folder icon view"
              onClick={() => setViewMode('icon')}
            >
              <LayoutGrid size={14} />
            </button>
          </span>
        </div>
        <div className={`folder-browser ${viewMode}`} data-folder-root={folder.name} data-folder-view={viewMode} data-view={viewMode}>
          <div className="folder-list-pane">
            {viewMode !== 'icon' ? (
              <div className="folder-browser-head">
              <span>Name</span>
              <span>Kind</span>
              <span>Modified</span>
              </div>
            ) : null}
            <div className="folder-browser-list" data-layout={viewMode === 'icon' ? 'icon-grid' : 'list'} aria-label={`${folder.name} children`}>
              {folder.children.map((child) => {
                const Icon = child.icon
                const resourceKind = child.targetSelection === 'structuredData' || child.targetSelection === 'structuredVocab'
                  ? 'structured-data'
                  : child.targetSelection === 'folder' || child.kind === 'Folder'
                    ? 'folder'
                    : child.name.endsWith('.md')
                      ? 'editable-file'
                      : child.kind === 'Image'
                        ? 'readonly-image'
                        : 'file'
                return (
                  <button
                    className={`folder-child ${child.name === selectedChild.name ? 'active' : ''}`}
                    data-folder-child={child.name}
                    data-resource-name={child.name}
                    data-resource-kind={resourceKind}
                    key={child.name}
                    onClick={() => setSelectedChildName(child.name)}
                    onDoubleClick={() => {
                      if (child.name.endsWith('.md')) setDocumentOpen(true)
                      if (child.targetSelection) onOpenSelection?.(child.targetSelection)
                    }}
                  >
                    <span><Icon size={16} /> <strong>{child.name}</strong></span>
                    <em>{child.kind}</em>
                    <small>{child.detail}</small>
                  </button>
                )
              })}
            </div>
          </div>
          {viewMode === 'column' ? (
            <div className="folder-middle-column" data-folder-column="children" aria-label={`${folder.name} selected child details`}>
              <header>
                <span>{folder.name}</span>
                <strong>{selectedChild.name}</strong>
              </header>
              <div className="folder-column-card">
                <SelectedIcon size={22} />
                <span>
                  <strong>{selectedChild.kind}</strong>
                  <small>{selectedChild.detail}</small>
                </span>
              </div>
              <div className="folder-column-list">
                {folder.children.slice(0, 4).map((child) => (
                  <span className={child.name === selectedChild.name ? 'active' : ''} key={child.name}>{child.name}</span>
                ))}
              </div>
            </div>
          ) : null}
          <aside
            className="folder-preview-pane"
            data-selected-resource={selectedChild.name}
            aria-label="Selected folder item preview"
          >
            <SelectedIcon size={28} />
            <h2>{selectedChild.name}</h2>
            <p>{selectedChild.kind} · {selectedChild.detail}</p>
            {isSelectedImage ? (
              <div className="folder-preview-card image" data-folder-preview="image">
                <strong>Image preview</strong>
                <span>{selectedChild.detail}</span>
                <div className="folder-image-thumb">
                  <span className="preview-window"><span /><span /><span /></span>
                  <div className="preview-layout"><aside /><main><b /><b /><b /></main></div>
                </div>
              </div>
            ) : (
              <div className="folder-preview-card" data-folder-preview={isSelectedDocument ? 'document' : isSelectedStructured ? 'structured-data' : 'resource'}>
                <strong>{isSelectedDocument ? 'Markdown document' : selectedChild.kind}</strong>
                <span>{selectedChild.detail}</span>
              </div>
            )}
            {isSelectedDocument || isSelectedStructured || hasSelectedOpenTarget ? (
              <button className="folder-open-child" onClick={openSelectedChild}>
                Open
              </button>
            ) : null}
          </aside>
        </div>
      </section>
      <footer className="table-status">{folder.meta[0][1]} · {folder.meta[1][1]} · {folder.meta[2][1]}</footer>
      {documentOpen ? (
        <FileDetailModal
          content={fileContentsByPath?.[selectedDocumentFile.path]}
          file={selectedDocumentFile}
          fileProperties={filePropertiesByPath?.[selectedDocumentFile.path]}
          isFavorite={isFileFavorite?.(selectedDocumentFile.path)}
          onChangeContent={(content) => onChangeFileContent?.(selectedDocumentFile.path, content)}
          onChangeFileProperties={(properties) => onChangeFileProperties?.(selectedDocumentFile.path, properties)}
          onClose={() => setDocumentOpen(false)}
          onToggleFavorite={onToggleFileFavorite}
        />
      ) : null}
      {accessOpen ? <AccessPolicyDialog scope="Folder" onClose={() => setAccessOpen(false)} /> : null}
    </main>
  )
}
