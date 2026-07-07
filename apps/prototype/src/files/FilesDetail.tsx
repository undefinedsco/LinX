import { FileCode2, FolderOpen } from 'lucide-react'
import { FileAvatarMark, InfoRow } from './FilesChrome'
import { FileMetaBlock } from './ResourceSidecars'
import { fileOpenSamples, filesRootFolderOpenSample, folderOpenSample } from './files-model'
import type { FilesSelection } from './files-types'

export function FilesDetail({
  open,
  selection,
}: {
  open: boolean
  selection: FilesSelection
}) {
  if (!open) return null

  if (selection === 'folderRoot' || selection === 'folder') {
    const folder = selection === 'folderRoot' ? filesRootFolderOpenSample : folderOpenSample
    return (
      <aside className="detail-pane resource-detail">
        <section className="resource-card">
          <div className="resource-card-top">
            <FileAvatarMark icon={FolderOpen} active />
            <span>
              <em>Folder .meta</em>
              <h2>{folder.name}.meta</h2>
              <p>{folder.path}</p>
            </span>
          </div>
          <div className="card-summary">
            <p>{folder.summary}</p>
          </div>
          <div className="card-tags">
            <span className="class">folder</span>
            <span>{folder.meta[0][1]}</span>
            <span>{folder.meta[2][1]}</span>
          </div>
        </section>
        <FileMetaBlock heading="Folder meta" kind={folder.kind} meta={folder.meta} path={folder.path} metaName={`${folder.name}.meta`} />
      </aside>
    )
  }

  if (selection === 'document' || selection === 'image') {
    const file = fileOpenSamples[selection]
    const Icon = file.icon
    return (
      <aside className="detail-pane resource-detail">
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
      </aside>
    )
  }

  const vocabName = selection === 'structuredVocabShapes'
    ? 'shapes.ttl'
    : selection === 'structuredVocabNamespaces'
      ? 'namespaces.ttl'
      : 'terms.ttl'
  const vocabPath = `/.vocab/${vocabName}`
  const vocabMeta = `${vocabName}.meta`
  const vocabSummary = selection === 'structuredVocabShapes'
    ? 'Shape registry defines constraints for resource cards, source-linked cards, and review-status values.'
    : selection === 'structuredVocabNamespaces'
      ? 'Namespace registry records local and imported prefixes used by terms and shapes.'
      : '2 predicates need URI review. 1 class has missing range metadata.'
  const vocabCounts = selection === 'structuredVocabShapes'
    ? { subjects: '3', classes: '0', predicates: '3', state: '3 shapes' }
    : selection === 'structuredVocabNamespaces'
      ? { subjects: '3', classes: '0', predicates: '3', state: '3 namespaces' }
      : { subjects: '5', classes: '4', predicates: '21', state: '2 warnings' }

  return (
    <aside className="detail-pane resource-detail">
      <section className="resource-card">
        <div className="resource-card-top">
          <FileAvatarMark icon={FileCode2} active />
          <span>
            <em>Document .meta</em>
            <h2>{vocabMeta}</h2>
            <p>metadata for {vocabPath}</p>
          </span>
        </div>
        <div className="card-summary">
          <p>{vocabSummary}</p>
        </div>
        <div className="card-tags">
          <span className="class">ttl</span>
          <span>subjects:{vocabCounts.subjects}</span>
          <span>predicates:{vocabCounts.predicates}</span>
        </div>
      </section>
      <section className="property-panel">
        <h3>Document meta</h3>
        <InfoRow label="format" value="text/turtle" />
        <InfoRow label="subjects" value={vocabCounts.subjects} />
        <InfoRow label="classes" value={vocabCounts.classes} />
        <InfoRow label="predicates" value={vocabCounts.predicates} />
      </section>
      <section className="property-panel">
        <h3>Resource</h3>
        <InfoRow label="path" value={vocabPath} />
        <InfoRow label="meta" value={vocabMeta} />
        <InfoRow label="modified" value="Today 09:38" />
        <InfoRow label="state" value={vocabCounts.state} />
      </section>
    </aside>
  )
}
