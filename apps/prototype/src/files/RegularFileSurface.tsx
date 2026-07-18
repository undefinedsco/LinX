import { useState } from 'react'
import {
  Copy,
  Download,
  Pencil,
  Star,
} from 'lucide-react'
import { FileDetailModal, type FilePropertyState } from './FileEditorSheet'
import { AccessPolicyDialog } from './ResourceSidecars'
import { fileOpenSamples, folderSamples, grantWikiPageBlocks, multiChannelAccessBlocks } from './files-model'
import type { FileContentBlock, FileOpenSample, FilesFolderId, FolderChildItem, RegularFileSelection, StoredFileContent } from './files-types'
import { AccessIconButton, FilePageHeader, MetaToggleButton } from './files-ui'

function blocksForChild(child: FolderChildItem): FileContentBlock[] {
  if (child.name.includes('multi-channel-access')) return multiChannelAccessBlocks
  if (child.name.includes('grant-wiki')) return grantWikiPageBlocks
  if (child.name.endsWith('.ttl')) {
    return [
      { id: 't1', kind: 'code', text: `@prefix udfs: <https://vocab.undefineds.co/linx#> .\n@prefix dcterms: <http://purl.org/dc/terms/> .` },
      { id: 't2', kind: 'code', text: `<#this> a udfs:${child.name.includes('profile') ? 'Agent' : 'ReviewStatus'} ;\n  dcterms:title "${child.name.replace('.ttl', '')}" ;\n  udfs:updatedAt "2026-07-17" .` },
    ]
  }
  return [
    { id: 'title', kind: 'title', text: child.name.replace(/\.(md|card\.md)$/, '') },
    { id: 'p1', kind: 'paragraph', text: `${child.name} 是 ${child.kind} 资源，以普通 Pod 文件保存。` },
  ]
}

function deriveFileSample(child: FolderChildItem, folderId: FilesFolderId, selection: RegularFileSelection): FileOpenSample {
  const exact = fileOpenSamples[selection]
  if (exact.name === child.name) return exact
  const folder = folderSamples[folderId]
  const path = `${folder.path}${child.name}`
  const detailParts = child.detail.split('·').map((part) => part.trim())
  return {
    id: selection,
    name: child.name,
    path,
    kind: selection === 'image' ? 'Image file' : child.kind === 'Turtle' ? 'Turtle source' : 'Markdown document',
    summary: `${child.name} · ${child.detail}`,
    icon: child.icon,
    blocks: selection === 'image' ? undefined : blocksForChild(child),
    meta: [
      ['format', selection === 'image' ? 'image/png' : child.kind === 'Turtle' ? 'text/turtle' : 'text/markdown'],
      ['size', detailParts[0] ?? '—'],
      ['modified', detailParts[1] ?? '—'],
      ['permission', 'Private'],
    ],
  }
}

export function RegularFileSurface({
  selection,
  folderId,
  openedChild,
  detailOpen,
  onToggleDetail,
  onCloseDetail,
  isFileFavorite,
  fileContentsByPath,
  filePropertiesByPath,
  onChangeFileContent,
  onChangeFileProperties,
  onToggleFileFavorite,
  notify,
}: {
  selection: RegularFileSelection
  folderId: FilesFolderId
  openedChild?: FolderChildItem | null
  detailOpen: boolean
  onToggleDetail: () => void
  onCloseDetail: () => void
  fileContentsByPath?: Record<string, StoredFileContent>
  filePropertiesByPath?: Record<string, FilePropertyState>
  isFileFavorite?: (path: string) => boolean
  onChangeFileContent?: (path: string, content: StoredFileContent) => void
  onChangeFileProperties?: (path: string, properties: FilePropertyState) => void
  onToggleFileFavorite?: (file: FileOpenSample) => void
  notify?: (title: string, kind?: 'ok' | 'err') => void
}) {

  const file = openedChild ? deriveFileSample(openedChild, folderId, selection) : fileOpenSamples[selection]
  const Icon = file.icon
  const [fileDetailOpen, setFileDetailOpen] = useState(false)
  const [accessOpen, setAccessOpen] = useState(false)
  const editable = file.id === 'document'
  const isText = file.id === 'document' || file.id === 'jsonl'
  const favorited = isFileFavorite?.(file.path) ?? false

  const headerActions = (
    <>
      <AccessIconButton onClick={() => setAccessOpen(true)} />
      <button
        title={favorited ? '取消收藏' : '收藏'}
        aria-pressed={favorited}
        className={favorited ? 'active' : ''}
        onClick={() => onToggleFileFavorite?.(file)}
      >
        <Star size={15} />
      </button>
      <button title="复制 URI" onClick={() => notify?.('已复制 URI')}><Copy size={15} /></button>
      {editable ? (
        <button className="primary-action" onClick={() => setFileDetailOpen(true)}><Pencil size={15} /> 编辑</button>
      ) : (
        <button><Download size={15} /> 下载</button>
      )}
      <MetaToggleButton open={detailOpen} onToggle={onToggleDetail} />
    </>
  )

  return (
    <main className="work-pane files-work file-open-work">
      <FilePageHeader title={file.name} subtitle={`${file.kind} · ${file.path}`}>
        {headerActions}
      </FilePageHeader>
      {isText ? (
        <section className="doc-preview">
          <div className="doc-facts">
            <span>{file.meta[0]?.[1]}</span>
            <span>{file.meta[1]?.[1]}</span>
            <span>{file.meta[2]?.[1]}</span>
          </div>
          <article className="doc-body">
            {(file.blocks ?? []).map((block) => {
              if (block.kind === 'title') return <h1 key={block.id}>{block.text}</h1>
              if (block.kind === 'heading') {
                const level = block.level === 3 ? 3 : 2
                return level === 3 ? <h3 key={block.id}>{block.text}</h3> : <h2 key={block.id}>{block.text}</h2>
              }
              if (block.kind === 'list') return <ul key={block.id}>{(block.items ?? []).map((item) => <li key={item}>{item}</li>)}</ul>
              if (block.kind === 'quote') return <blockquote key={block.id}>{block.text}</blockquote>
              if (block.kind === 'code') return <pre key={block.id}><code>{block.text}</code></pre>
              return <p key={block.id}>{block.text}</p>
            })}
          </article>
        </section>
      ) : (
        <div className={`file-preview-surface ${selection} readonly`}>
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
        </div>
      )}
      <footer className="table-status meta-tail">
        <span>{file.path}</span>
        <span>{file.meta.map(([label, value]) => `${label}: ${value}`).join(' · ')}</span>
      </footer>
      {fileDetailOpen ? (
        <FileDetailModal
          content={fileContentsByPath?.[file.path]}
          file={file}
          fileProperties={filePropertiesByPath?.[file.path]}
          isFavorite={favorited}
          onChangeContent={(content) => onChangeFileContent?.(file.path, content)}
          onChangeFileProperties={(properties) => onChangeFileProperties?.(file.path, properties)}
          onClose={() => setFileDetailOpen(false)}
          onToggleFavorite={onToggleFileFavorite}
          notify={notify}
        />
      ) : null}
      {accessOpen ? <AccessPolicyDialog scope="File" onClose={() => setAccessOpen(false)} /> : null}
    </main>
  )
}
