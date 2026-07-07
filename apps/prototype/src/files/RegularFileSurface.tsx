import { useEffect, useState } from 'react'
import {
  Download,
  ExternalLink,
} from 'lucide-react'
import { FileDetailModal, type FilePropertyState } from './FileEditorSheet'
import { AccessPolicyDialog } from './ResourceSidecars'
import { fileOpenSamples } from './files-model'
import type { FileOpenSample, RegularFileSelection, StoredFileContent } from './files-types'
import { AccessIconButton, FilePageHeader, MetaToggleButton } from './files-ui'

export function RegularFileSurface({
  selection,
  detailOpen,
  onToggleDetail,
  onCloseDetail,
  isFileFavorite,
  fileContentsByPath,
  filePropertiesByPath,
  onChangeFileContent,
  onChangeFileProperties,
  onToggleFileFavorite,
}: {
  selection: RegularFileSelection
  detailOpen: boolean
  onToggleDetail: () => void
  onCloseDetail: () => void
  fileContentsByPath?: Record<string, StoredFileContent>
  filePropertiesByPath?: Record<string, FilePropertyState>
  isFileFavorite?: (path: string) => boolean
  onChangeFileContent?: (path: string, content: StoredFileContent) => void
  onChangeFileProperties?: (path: string, properties: FilePropertyState) => void
  onToggleFileFavorite?: (file: FileOpenSample) => void
}) {

  const file = fileOpenSamples[selection]
  const Icon = file.icon
  const [fileDetailOpen, setFileDetailOpen] = useState(false)
  const [accessOpen, setAccessOpen] = useState(false)
  const editable = file.id === 'document'

  useEffect(() => {
    if (editable) {
      if (detailOpen) onCloseDetail()
      setFileDetailOpen(true)
    } else {
      setFileDetailOpen(false)
    }
  }, [editable, file.id, detailOpen])

  const previewContent = (
    <article className="image-preview">
      <div className="image-preview-frame">
        <div className="image-preview-canvas">
          <span className="preview-window">
            <span />
            <span />
            <span />
          </span>
          <div className="preview-layout">
            <aside />
            <main>
              <b />
              <b />
              <b />
            </main>
          </div>
        </div>
      </div>
      <div className="image-preview-caption">
        <Icon size={18} />
        <strong>{file.name}</strong>
        <span>{file.summary}</span>
      </div>
    </article>
  )

  return (
    <main className="work-pane files-work file-open-work">
      <FilePageHeader title={file.name} subtitle={`${file.kind} · ${file.path}`}>
        <AccessIconButton onClick={() => setAccessOpen(true)} />
        <button onClick={() => {
          if (editable && detailOpen) onCloseDetail()
          if (editable) setFileDetailOpen(true)
        }}><ExternalLink size={15} /> Open</button>
        <button><Download size={15} /> Download</button>
        <MetaToggleButton open={detailOpen} onToggle={onToggleDetail} />
      </FilePageHeader>
      {editable ? (
        <section className="file-open-placeholder">
          <Icon size={26} />
          <h2>{file.name}</h2>
          <p>{file.summary}</p>
          <button onClick={() => setFileDetailOpen(true)}><ExternalLink size={15} /> Open detail</button>
        </section>
      ) : (
        <div className={`file-preview-surface ${selection} readonly`}>
          {previewContent}
        </div>
      )}
      <footer className="table-status">
        {editable ? `${file.meta[0][1]} · ${file.meta[1][1]} · ${file.meta[3][1]}` : `${file.meta[0][1]} · ${file.meta[1][1]} · preview only`}
      </footer>
      {fileDetailOpen ? (
        <FileDetailModal
          content={fileContentsByPath?.[file.path]}
          file={file}
          fileProperties={filePropertiesByPath?.[file.path]}
          isFavorite={isFileFavorite?.(file.path)}
          onChangeContent={(content) => onChangeFileContent?.(file.path, content)}
          onChangeFileProperties={(properties) => onChangeFileProperties?.(file.path, properties)}
          onClose={() => setFileDetailOpen(false)}
          onToggleFavorite={onToggleFileFavorite}
        />
      ) : null}
      {accessOpen ? <AccessPolicyDialog scope="File" onClose={() => setAccessOpen(false)} /> : null}
    </main>
  )
}
