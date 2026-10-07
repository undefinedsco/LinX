import { useEffect, useState } from 'react'
import { FileCode2, FolderOpen, ShieldCheck, X } from 'lucide-react'
import { FileAvatarMark, InfoRow } from './FilesChrome'
import { AccessPolicyDialog, FileMetaBlock } from './ResourceSidecars'
import { fileOpenSamples, folderSamples } from './files-model'
import type { FilesFolderId, FilesSelection } from './files-types'
import type { AccessScope } from './ResourceSidecars'

function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [active, onClose])
}

export function FilesDetail({
  open,
  selection,
  folder,
  onClose,
}: {
  open: boolean
  selection: FilesSelection
  folder: FilesFolderId
  onClose?: () => void
}) {
  const [accessOpen, setAccessOpen] = useState(false)
  useEscape(open, () => onClose?.())
  if (!open) return null

  const scope: AccessScope = selection === 'folderRoot' || selection === 'folder'
    ? 'Folder'
    : selection === 'structuredVocab' || selection === 'structuredVocabShapes' || selection === 'structuredVocabNamespaces'
      ? 'Vocab'
      : 'File'

  const accessSummary = scope === 'Vocab'
    ? 'Readonly registry · .vocab ACR · 提案走 Inbox'
    : scope === 'Folder'
      ? 'Private · own ACR · 子项继承'
      : 'Private · 继承自 /files/ ACR'

  const accessCard = (
    <section className="property-panel">
      <h3>Access</h3>
      <InfoRow label="mode" value={scope === 'Vocab' ? 'Readonly' : 'Private'} />
      <InfoRow label="source" value={accessSummary} />
      <button className="policy-source-action" onClick={() => setAccessOpen(true)}>
        查看 Access 设置
      </button>
    </section>
  )

  let body: React.ReactNode
  if (selection === 'folderRoot' || selection === 'folder') {
    const folderSample = folderSamples[folder]
    body = (
      <>
        <section className="resource-card">
          <div className="resource-card-top">
            <FileAvatarMark icon={FolderOpen} active />
            <span>
              <em>Folder .meta</em>
              <h2>{folderSample.name}.meta</h2>
              <p>{folderSample.path}</p>
            </span>
          </div>
          <div className="card-summary">
            <p>{folderSample.summary}</p>
          </div>
          <div className="card-tags">
            <span className="class">folder</span>
            <span>{folderSample.meta[0][1]}</span>
            <span>{folderSample.meta[2][1]}</span>
          </div>
        </section>
        <FileMetaBlock heading="Folder meta" kind={folderSample.kind} meta={folderSample.meta} path={folderSample.path} metaName={`${folderSample.name}.meta`} />
        {accessCard}
      </>
    )
  } else if (selection === 'document' || selection === 'image' || selection === 'jsonl') {
    const file = fileOpenSamples[selection]
    const Icon = file.icon
    body = (
      <>
        <section className="resource-card">
          <div className="resource-card-top">
            <FileAvatarMark icon={Icon} active />
            <span>
              <em>File .meta</em>
              <h2>{file.name}.meta</h2>
              <p>{file.path}</p>
            </span>
          </div>
          <div className="card-summary">
            <p>{file.summary}</p>
          </div>
          <div className="card-tags">
            <span className="class">{file.kind}</span>
            <span>{file.meta[1][1]}</span>
            <span>{file.meta[3][1]}</span>
          </div>
        </section>
        <FileMetaBlock heading="File meta" kind={file.kind} meta={file.meta} path={file.path} metaName={`${file.name}.meta`} />
        {accessCard}
      </>
    )
  } else {
    const isWorkspace = selection === 'structuredData'
    const isEmptyDoc = selection === 'structuredEmpty'
    const docName = isWorkspace ? 'linx-prototype.ttl' : isEmptyDoc ? 'empty-notes.ttl' : selection === 'structuredVocabShapes' ? 'shapes.ttl' : selection === 'structuredVocabNamespaces' ? 'namespaces.ttl' : 'terms.ttl'
    const docPath = isWorkspace ? '/.data/workspaces/linx-prototype.ttl' : isEmptyDoc ? '/files/docs/empty-notes.ttl' : `/.vocab/${docName}`
    const docMetaName = `${docName}.meta`
    const docSummary = isWorkspace
      ? 'Workspace binding: repository, local path, and current commit for Threads and Sessions.'
      : isEmptyDoc
        ? '刚刚创建的空资源，还没有 class、predicate 和 subject。'
        : selection === 'structuredVocabShapes'
          ? 'Shape registry defines constraints for resource cards, source-linked cards, and review-status values.'
          : selection === 'structuredVocabNamespaces'
            ? 'Namespace registry records local and imported prefixes used by terms and shapes.'
            : '2 predicates need URI review. 1 class has missing range metadata.'
    const docCounts = isWorkspace
      ? { subjects: '7', classes: '5', predicates: '20', state: 'editable' }
      : isEmptyDoc
        ? { subjects: '0', classes: '0', predicates: '0', state: 'empty' }
        : selection === 'structuredVocabShapes'
          ? { subjects: '3', classes: '0', predicates: '3', state: '3 shapes' }
          : selection === 'structuredVocabNamespaces'
            ? { subjects: '3', classes: '0', predicates: '3', state: '3 namespaces' }
            : { subjects: '5', classes: '4', predicates: '21', state: '2 warnings' }
    body = (
      <>
        <section className="resource-card">
          <div className="resource-card-top">
            <FileAvatarMark icon={FileCode2} active />
            <span>
              <em>Document .meta</em>
              <h2>{docMetaName}</h2>
              <p>metadata for {docPath}</p>
            </span>
          </div>
          <div className="card-summary">
            <p>{docSummary}</p>
          </div>
          <div className="card-tags">
            <span className="class">ttl</span>
            <span>subjects:{docCounts.subjects}</span>
            <span>predicates:{docCounts.predicates}</span>
          </div>
        </section>
        <section className="property-panel">
          <h3>Document meta</h3>
          <InfoRow label="format" value="text/turtle" />
          <InfoRow label="subjects" value={docCounts.subjects} />
          <InfoRow label="classes" value={docCounts.classes} />
          <InfoRow label="predicates" value={docCounts.predicates} />
        </section>
        <section className="property-panel">
          <h3>Resource</h3>
          <InfoRow label="path" value={docPath} />
          <InfoRow label="meta" value={docMetaName} />
          <InfoRow label="modified" value="Today 09:38" />
          <InfoRow label="state" value={docCounts.state} />
        </section>
        {accessCard}
      </>
    )
  }

  return (
    <aside className="detail-pane resource-detail meta-side" aria-label=".meta 详情">
      <header className="meta-sheet-head">
        <span>
          <ShieldCheck size={14} />
          <strong>.meta</strong>
        </span>
        <button aria-label="关闭" onClick={() => onClose?.()}>
          <X size={15} />
        </button>
      </header>
      <div className="meta-sheet-body">
        {body}
      </div>
      {accessOpen ? <AccessPolicyDialog scope={scope} onClose={() => setAccessOpen(false)} /> : null}
    </aside>
  )
}
