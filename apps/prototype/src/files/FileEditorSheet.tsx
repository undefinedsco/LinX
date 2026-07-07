import { useEffect, useState } from 'react'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Check,
  ChevronDown,
  Code2,
  ExternalLink,
  FileCode2,
  FileText,
  Italic,
  Link2,
  List,
  ListOrdered,
  MoreHorizontal,
  Plus,
  Quote,
  Redo2,
  ShieldCheck,
  Star,
  Tags,
  Underline,
  Undo2,
  X,
} from 'lucide-react'
import { fileOpenSamples, sourceLinkedCardForSubject, sourceLinkedCardSample, vocabTerms } from './files-model'
import { sourceReviewSnapshot, type SourceReviewState } from './files-proposals'
import { TypedPredicateCell } from './typed-cell-editors'
import type { FileContentBlock, FileContentChunk, FileEditorContent, FileOpenSample, IconType, SourceIngestState, PredicateDefinition, SourceReviewSample, StoredFileContent, SubjectOpenTarget } from './files-types'
import { AccessPolicyDialog, FileMetaBlock } from './ResourceSidecars'

export interface FilePropertyState {
  status: string
  tags: string
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function blockToHtml(block: FileContentBlock) {
  if (block.kind === 'title') {
    const meta = block.meta ?? []
    return `
      <div class="note-title-block" data-block-id="${escapeHtml(block.id)}">
        <span>${escapeHtml(block.text ?? '')}</span>
        <h1>${escapeHtml(block.text ?? '')}</h1>
        <div>
          {meta}
        </div>
      </div>
    `.replace('{meta}', meta.map(([, value]) => `<em>${escapeHtml(value)}</em>`).join(''))
  }
  if (block.kind === 'heading') {
    const level = block.level === 3 ? 3 : 2
    return `<h${level} data-block-id="${escapeHtml(block.id)}">${escapeHtml(block.text ?? '')}</h${level}>`
  }
  if (block.kind === 'list') {
    return `<ul data-block-id="${escapeHtml(block.id)}">${(block.items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
  }
  if (block.kind === 'quote') {
    return `<blockquote data-block-id="${escapeHtml(block.id)}">${escapeHtml(block.text ?? '')}</blockquote>`
  }
  if (block.kind === 'code') {
    return `<pre data-block-id="${escapeHtml(block.id)}"><code>${escapeHtml(block.text ?? '')}</code></pre>`
  }
  return `<p data-block-id="${escapeHtml(block.id)}">${escapeHtml(block.text ?? '')}</p>`
}

function blocksToRichTextContent(file: FileOpenSample) {
  if (file.blocks?.length) return file.blocks.map(blockToHtml).join('\n\n')

  return `
    <div class="note-title-block">
      <span>${file.path}</span>
      <h1>${file.name.replace(/\.md$/, '')}</h1>
      <div>
        <em>draft</em>
        <em>linked resource</em>
        <em>private</em>
      </div>
    </div>
    <p>Local, LAN, tunnel, and cloud routes are access channels over the same Pod resource identity. Use one canonical storage identity, then let each route describe how the same resource is reached.</p>
    <h2>Routes</h2>
    <ul>
      <li>Local works without public reachability.</li>
      <li>Canonical URL belongs in resource metadata.</li>
      <li>Sharing and backlinks use file metadata.</li>
    </ul>
    <blockquote>Keep the visible URL stable; change transport without changing the resource subject.</blockquote>
    <pre><code>solid:storage /.data/workspaces/linx-prototype/</code></pre>
  `
}

function blocksToChunks(file: FileOpenSample): FileContentChunk[] {
  return (file.blocks ?? []).map((block, index) => ({
    ...block,
    protected: block.kind === 'quote' || file.kind !== 'Source-linked card',
    source: file.sourceReview?.source,
    sourceChunkId: file.sourceReview ? `chunk-${file.sourceReview.readChunks + index}` : undefined,
    sourceHash: file.sourceReview?.sourceHash,
  }))
}

function isFileEditorContent(content: StoredFileContent | undefined): content is FileEditorContent {
  return Boolean(
    content
    && typeof content === 'object'
    && 'format' in content
    && content.format === 'tiptap-json'
    && 'doc' in content,
  )
}

function initialEditorContent(content: StoredFileContent | undefined, file: FileOpenSample) {
  if (isFileEditorContent(content)) return content.doc
  return content ?? blocksToRichTextContent(file)
}

function RichTextFileEditor({
  content,
  file,
  onChangeContent,
}: {
  content?: StoredFileContent
  file: FileOpenSample
  onChangeContent?: (content: StoredFileContent) => void
}) {
  const chunks = blocksToChunks(file)
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
    ],
    content: initialEditorContent(content, file),
    editorProps: {
      attributes: {
        class: 'rich-document',
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      onChangeContent?.({
        format: 'tiptap-json',
        version: 1,
        chunks,
        doc: currentEditor.getJSON(),
      })
    },
  })

  const toolbarGroups: Array<Array<{ label: string; icon: IconType; active?: boolean; action?: () => void }>> = [
    [
      { label: 'Undo', icon: Undo2, action: () => editor?.chain().focus().undo().run() },
      { label: 'Redo', icon: Redo2, action: () => editor?.chain().focus().redo().run() },
    ],
    [
      { label: 'Bold', icon: Bold, active: editor?.isActive('bold'), action: () => editor?.chain().focus().toggleBold().run() },
      { label: 'Italic', icon: Italic, active: editor?.isActive('italic'), action: () => editor?.chain().focus().toggleItalic().run() },
      { label: 'Underline', icon: Underline },
      { label: 'Code', icon: Code2, active: editor?.isActive('code'), action: () => editor?.chain().focus().toggleCode().run() },
    ],
    [
      { label: 'Bullet list', icon: List, active: editor?.isActive('bulletList'), action: () => editor?.chain().focus().toggleBulletList().run() },
      { label: 'Ordered list', icon: ListOrdered, active: editor?.isActive('orderedList'), action: () => editor?.chain().focus().toggleOrderedList().run() },
      { label: 'Quote', icon: Quote, active: editor?.isActive('blockquote'), action: () => editor?.chain().focus().toggleBlockquote().run() },
      { label: 'Link', icon: Link2 },
    ],
  ]

  return (
    <section
      className="rich-editor-shell"
      data-seed-block-count={file.blocks?.length ?? 0}
      data-seed-format={file.blocks?.length ? 'blocks-with-double-newline-html' : 'fallback-html'}
      data-storage-format={isFileEditorContent(content) ? content.format : content ? 'legacy-html' : 'seed-blocks'}
      aria-label={`${file.name} editor`}
    >
      <div className="rich-editor-toolbar" aria-label="Editor toolbar">
        <button className="block-style-button" title="Block style">
          <FileText size={15} />
          <span>Paragraph</span>
          <ChevronDown size={14} />
        </button>
        {toolbarGroups.map((group, groupIndex) => (
          <span className="editor-tool-group" key={groupIndex}>
            {group.map((tool) => {
              const Icon = tool.icon
              return (
                <button
                  className={tool.active ? 'active' : ''}
                  key={tool.label}
                  title={tool.label}
                  aria-label={tool.label}
                  disabled={!editor || !tool.action}
                  onClick={tool.action}
                >
                  <Icon size={15} />
                </button>
              )
            })}
          </span>
        ))}
      </div>
      <div className="rich-editor-body">
        <div className="editor-block-tools" aria-label="Block tools">
          <button title="Add block" aria-label="Add block"><Plus size={15} /></button>
          <button title="Move block" aria-label="Move block"><MoreHorizontal size={15} /></button>
        </div>
        <EditorContent editor={editor} />
      </div>
    </section>
  )
}

function SourceLinkedReviewPanel({
  sourceIngestState,
  review,
  reviewState,
  onChangeSourceIngestState,
  onChangeReviewState,
}: {
  sourceIngestState?: SourceIngestState
  review: SourceReviewSample
  reviewState: SourceReviewState
  onChangeSourceIngestState?: (state: SourceIngestState) => void
  onChangeReviewState: (state: SourceReviewState) => void
}) {
  const [open, setOpen] = useState(false)
  const pending = reviewState === 'pending'
  const effectiveReview = {
    ...review,
    ingestStatus: sourceIngestState?.ingestStatus ?? review.ingestStatus,
    readChunks: sourceIngestState?.readChunks ?? review.readChunks,
    totalChunks: sourceIngestState?.totalChunks ?? review.totalChunks,
    sourceHash: sourceIngestState?.sourceHash ?? review.sourceHash,
  }
  const snapshot = sourceReviewSnapshot(effectiveReview, reviewState)
  const readMore = () => {
    const current = sourceIngestState ?? {
      ingestStatus: review.ingestStatus,
      readChunks: review.readChunks,
      totalChunks: review.totalChunks,
      sourceHash: review.sourceHash,
      syncStatus: 'scheduled · 24h',
      manifestPath: '/.data/ingest/sources/solid-protocol/manifest.ttl',
    }
    onChangeSourceIngestState?.({
      ...current,
      readChunks: Math.min(current.totalChunks, current.readChunks + 12),
      syncStatus: 'read on demand',
    })
  }

  return (
    <section
      className={`source-review-panel ${reviewState}`}
      data-review-state={reviewState}
      data-source-ingest-status={effectiveReview.ingestStatus}
      data-read-chunks={effectiveReview.readChunks}
      data-total-chunks={effectiveReview.totalChunks}
      data-source-update-count={snapshot.sourceUpdateCount}
      data-local-kept-count={snapshot.localKeptCount}
      aria-label="Ingest review"
    >
      <header>
        <span>
          <strong>Ingest</strong>
          <em>{snapshot.panelText}</em>
        </span>
        <button
          data-source-review-action="open"
          aria-expanded={open}
          aria-label="Review Ingest changes"
          onClick={() => setOpen((current) => !current)}
        >
          <ExternalLink size={13} /> Review
        </button>
      </header>
      {open ? (
        <div className="source-review-body">
          <span><strong>source</strong><em>{review.source}</em></span>
          <span><strong>ingest</strong><em>{snapshot.ingestSummary}</em></span>
          <button data-source-ingest-action="read" aria-label="Read Ingest chunks" onClick={readMore}>
            <Plus size={13} /> Load chunks
          </button>
          <span><strong>conflict</strong><em>user-owned blocks stay protected from source overwrite</em></span>
          {pending ? (
            <div className="source-review-actions">
              <button
                data-source-review-action="accept"
                aria-label="Accept Ingest"
                onClick={() => {
                  onChangeReviewState('accepted')
                  setOpen(false)
                }}
              >
                <Check size={13} /> Accept ingest
              </button>
              <button
                data-source-review-action="keep"
                aria-label="Keep local edits"
                onClick={() => {
                  onChangeReviewState('kept')
                  setOpen(false)
                }}
              >
                <X size={13} /> Keep local
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function defaultFileProperties(file: FileOpenSample): FilePropertyState {
  if (file.kind === 'Source-linked card') return { status: 'Draft', tags: 'source-linked, solid' }
  return { status: 'Draft', tags: 'notes, file' }
}

function FilePropertyPanel({
  file,
  properties,
  onChangeProperties,
}: {
  file: FileOpenSample
  properties: FilePropertyState
  onChangeProperties?: (properties: FilePropertyState) => void
}) {
  const [activeProperty, setActiveProperty] = useState<string | null>(null)
  const [enumDrafts, setEnumDrafts] = useState<Record<string, string>>({})
  const sourceLinked = file.kind === 'Source-linked card'
  const subject = file.path
  const propertyPredicates: Array<PredicateDefinition & { propertyKey?: keyof FilePropertyState; readonlyValue?: string }> = [
    {
      description: 'Review status for the file/card detail.',
      id: 'udfs:reviewStatus',
      label: 'udfs:reviewStatus',
      options: ['Draft', 'Ready', 'Published'],
      propertyKey: 'status',
      type: 'select',
      uri: '/.vocab/terms.ttl#reviewStatus',
    },
    {
      description: 'Topic tags attached to this file/card.',
      id: 'udfs:tags',
      label: 'udfs:tags',
      options: ['notes', 'file', 'source-linked', 'solid', 'rdf'],
      propertyKey: 'tags',
      type: 'multi-select',
      uri: '/.vocab/terms.ttl#tags',
    },
    ...(sourceLinked && file.sourceReview ? [{
      description: 'Canonical source URL for this card.',
      id: 'udfs:source',
      label: 'udfs:source',
      readonlyValue: file.sourceReview.source,
      type: 'url' as const,
      uri: '/.vocab/terms.ttl#source',
    }] : []),
  ]
  const setProperty = (key: keyof FilePropertyState, value: string) => {
    onChangeProperties?.({ ...properties, [key]: value })
  }
  const enumTone = (value: string) => {
    const tones = ['blue', 'green', 'yellow', 'red', 'gray']
    const sum = value.split('').reduce((total, char) => total + char.charCodeAt(0), 0)
    return tones[sum % tones.length]
  }

  return (
    <section
      className="file-property-panel"
      data-file-property-panel={file.path}
      data-property-status={properties.status}
      aria-label="File properties"
    >
      <header>
        <strong>Properties</strong>
        <small>{sourceLinked ? 'source-linked card' : 'file card'}</small>
      </header>
      {propertyPredicates.map((predicate) => {
        const propertyKey = predicate.propertyKey
        const value = propertyKey ? properties[propertyKey] : predicate.readonlyValue
        return (
          <div className="file-property-row" data-property-id={predicate.id} key={predicate.id}>
            <span>{predicate.label}</span>
            <TypedPredicateCell
              active={activeProperty === predicate.id}
              enumDraft={enumDrafts[predicate.id] ?? ''}
              enumOptions={predicate.options ?? []}
              enumOptionState={() => undefined}
              enumOptionTone={enumTone}
              enumOptionUri={(option) => `/.vocab/terms.ttl#${option}`}
              predicate={predicate}
              readonly={!propertyKey}
              subject={subject}
              value={value}
              onActivate={() => setActiveProperty(predicate.id)}
              onApproveEnumOption={() => {}}
              onClearActive={() => setActiveProperty(null)}
              onCreateEnumOption={(option) => {
                if (!propertyKey) return
                setProperty(propertyKey, predicate.type === 'multi-select' && value ? `${value}, ${option}` : option)
              }}
              onCycleEnumTone={() => {}}
              onDiscardEnumOption={() => {}}
              onSetEnumDraft={(nextValue) => setEnumDrafts((current) => ({ ...current, [predicate.id]: nextValue }))}
              onSetValue={(nextValue) => {
                if (!propertyKey) return
                setProperty(propertyKey, nextValue)
              }}
              onToggleEnumDefinition={() => {}}
            />
          </div>
        )
      })}
    </section>
  )
}

export function FileDetailModal({
  content,
  file,
  fileProperties,
  isFavorite,
  sourceIngestState,
  onClose,
  onChangeContent,
  onChangeFileProperties,
  onChangeSourceIngestState,
  onChangeSourceReviewState,
  onToggleFavorite,
  sourceReviewState = 'pending',
}: {
  content?: StoredFileContent
  file: FileOpenSample
  fileProperties?: FilePropertyState
  isFavorite?: boolean
  sourceIngestState?: SourceIngestState
  onClose: () => void
  onChangeContent?: (content: StoredFileContent) => void
  onChangeFileProperties?: (properties: FilePropertyState) => void
  onChangeSourceIngestState?: (state: SourceIngestState) => void
  onChangeSourceReviewState?: (state: SourceReviewState) => void
  onToggleFavorite?: (file: FileOpenSample) => void
  sourceReviewState?: SourceReviewState
}) {
  const Icon = file.icon
  const [accessOpen, setAccessOpen] = useState(false)
  const closeLater = () => window.setTimeout(onClose, 0)
  const sourceLinked = file.kind === 'Source-linked card'
  const resolvedProperties = fileProperties ?? defaultFileProperties(file)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !accessOpen) closeLater()
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [accessOpen, onClose])

  return (
    <div className="file-detail-layer" role="dialog" aria-label={`${file.name} detail`}>
      <div className="file-detail-backdrop" aria-hidden="true" onClick={closeLater} />
      <article className={`file-detail-dialog ${sourceLinked ? 'source-linked-dialog' : ''}`}>
        <header className="file-detail-header">
          <span>
            <em>{file.kind}</em>
            <strong>{file.name}</strong>
            <small>{file.path}</small>
          </span>
          <div className="file-detail-actions">
            <button title="Access" aria-label="Access" onClick={() => setAccessOpen(true)}><ShieldCheck size={15} /></button>
            <button
              className={isFavorite ? 'active' : ''}
              title="Favorite"
              aria-label="Favorite"
              aria-pressed={Boolean(isFavorite)}
              data-file-action="favorite"
              data-file-path={file.path}
              data-favorite-state={isFavorite ? 'on' : 'off'}
              onClick={() => onToggleFavorite?.(file)}
            >
              <Star size={15} />
            </button>
            <button title="Copy link" aria-label="Copy link"><Link2 size={15} /></button>
            <button aria-label="Close file detail" onClick={closeLater}>
              <X size={16} />
            </button>
          </div>
        </header>
        <section className="file-detail-preview">
          {file.id === 'document' ? (
            <RichTextFileEditor content={content} file={file} onChangeContent={onChangeContent} />
          ) : (
            <>
              <Icon size={24} />
              <h2>{file.name}</h2>
              <p>{file.summary}</p>
              <div className="file-detail-image">
                <div className="image-preview-canvas">
                  <span className="preview-window"><span /><span /><span /></span>
                  <div className="preview-layout">
                    <aside />
                    <main><b /><b /><b /></main>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
        {sourceLinked && file.sourceReview ? (
          <SourceLinkedReviewPanel
            sourceIngestState={sourceIngestState}
            review={file.sourceReview}
            reviewState={sourceReviewState}
            onChangeSourceIngestState={onChangeSourceIngestState}
            onChangeReviewState={onChangeSourceReviewState ?? (() => {})}
          />
        ) : null}
        <FilePropertyPanel
          file={file}
          properties={resolvedProperties}
          onChangeProperties={onChangeFileProperties}
        />
        <section className="file-detail-tail">
          <FileMetaBlock heading="Meta" kind={file.kind} meta={file.meta} path={file.path} metaName={`${file.name}.meta`} />
        </section>
        {accessOpen ? <AccessPolicyDialog scope="File" onClose={() => setAccessOpen(false)} /> : null}
      </article>
    </div>
  )
}

export function SubjectOpenDialog({
  fileContentsByPath,
  filePropertiesByPath,
  sourceIngestStatesBySource,
  target,
  onChangeFileContent,
  onChangeFileProperties,
  onChangeSourceIngestState,
  onChangeSourceReviewState,
  onClose,
  sourceReviewState = 'pending',
}: {
  fileContentsByPath?: Record<string, StoredFileContent>
  filePropertiesByPath?: Record<string, FilePropertyState>
  sourceIngestStatesBySource?: Record<string, SourceIngestState>
  target: SubjectOpenTarget
  onChangeFileContent?: (path: string, content: StoredFileContent) => void
  onChangeFileProperties?: (path: string, properties: FilePropertyState) => void
  onChangeSourceIngestState?: (source: string, state: SourceIngestState) => void
  onChangeSourceReviewState?: (state: SourceReviewState) => void
  onClose: () => void
  sourceReviewState?: SourceReviewState
}) {
  if (target.kind === 'file-resource') {
    return (
      <FileDetailModal
        content={fileContentsByPath?.[fileOpenSamples.document.path]}
        file={fileOpenSamples.document}
        fileProperties={filePropertiesByPath?.[fileOpenSamples.document.path]}
        onChangeContent={(content) => onChangeFileContent?.(fileOpenSamples.document.path, content)}
        onChangeFileProperties={(properties) => onChangeFileProperties?.(fileOpenSamples.document.path, properties)}
        onClose={onClose}
      />
    )
  }

  if (target.kind === 'source-linked-card') {
    const card = sourceLinkedCardForSubject(target.row.subject) ?? sourceLinkedCardSample
    const source = card.sourceReview?.source ?? ''
    return (
      <FileDetailModal
        content={fileContentsByPath?.[card.path]}
        file={card}
        fileProperties={filePropertiesByPath?.[card.path]}
        sourceIngestState={sourceIngestStatesBySource?.[source]}
        onChangeContent={(content) => onChangeFileContent?.(card.path, content)}
        onChangeFileProperties={(properties) => onChangeFileProperties?.(card.path, properties)}
        onChangeSourceIngestState={(state) => {
          if (source) onChangeSourceIngestState?.(source, state)
        }}
        onChangeSourceReviewState={onChangeSourceReviewState}
        onClose={onClose}
        sourceReviewState={sourceReviewState}
      />
    )
  }

  const isExternal = target.kind === 'external-url'
  const isVocab = target.kind === 'vocab-term'
  const vocabTerm = isVocab
    ? vocabTerms.find((term) => term.uri === target.row.subject || target.row.subject.endsWith(term.uri.split('#').pop() ?? ''))
    : null
  const closeLater = () => window.setTimeout(onClose, 0)
  const Icon = isExternal ? Link2 : isVocab ? Tags : FileCode2
  const kind = isExternal ? 'External source' : isVocab ? 'Vocabulary term' : 'RDF fragment subject'
  const externalSourceIngestState = isExternal
    ? sourceIngestStatesBySource?.[target.row.subject] ?? {
        ingestStatus: 'lazy chunks',
        readChunks: 38,
        totalChunks: 112,
        sourceHash: 'sha256:92d7',
        syncStatus: 'scheduled · 24h',
        manifestPath: '/.data/ingest/sources/solid-protocol/manifest.ttl',
      }
    : null
  const ingestManifestPath = externalSourceIngestState?.manifestPath
    ? externalSourceIngestState.manifestPath.replace('/.data/index/sources/', '/.data/ingest/sources/')
    : '/.data/ingest/sources/solid-protocol/manifest.ttl'
  const readExternalChunks = () => {
    if (!isExternal || !externalSourceIngestState) return
    onChangeSourceIngestState?.(target.row.subject, {
      ...externalSourceIngestState,
      readChunks: Math.min(externalSourceIngestState.totalChunks, externalSourceIngestState.readChunks + 18),
      syncStatus: 'read on demand',
    })
  }
  const path = isExternal
    ? target.row.subject
    : isVocab
      ? target.row.subject.startsWith('/.vocab/') ? target.row.subject : `/.vocab/terms.ttl${target.row.subject.startsWith('#') ? target.row.subject : `#${target.row.subject}`}`
      : `/.data/workspaces/linx-prototype.ttl${target.row.subject}`
  const meta: Array<[string, string]> = isExternal
    ? [
        ['Ingest', `${externalSourceIngestState?.ingestStatus ?? 'lazy'} · ${externalSourceIngestState?.readChunks ?? 0}/${externalSourceIngestState?.totalChunks ?? 0} read`],
        ['manifest', ingestManifestPath],
        ['sync', externalSourceIngestState?.syncStatus ?? 'scheduled · 24h'],
        ['source hash', externalSourceIngestState?.sourceHash ?? 'sha256:92d7'],
      ]
    : isVocab && vocabTerm
      ? [
          ['term kind', vocabTerm.kind],
          ['range', vocabTerm.range],
          ['status', vocabTerm.status],
          ['shape usage', 'FileResource · GrantPage'],
        ]
    : [
        ['class', target.row.className],
        ['relation', target.row.relation],
        ['status', target.row.status],
        ['return', 'table · class scope retained'],
      ]

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLater()
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="file-detail-layer" role="dialog" aria-label={`${target.row.subject} resource detail`}>
      <div className="file-detail-backdrop" aria-hidden="true" onClick={closeLater} />
      <article className="file-detail-dialog subject-detail-dialog">
        <header className="file-detail-header">
          <span>
            <em>{kind}</em>
            <strong>{target.row.label}</strong>
            <small>{target.row.subject}</small>
          </span>
          <div className="file-detail-actions">
            <button title="Copy URI" aria-label="Copy URI"><Link2 size={15} /></button>
            <button title="Open source" aria-label="Open source"><ExternalLink size={15} /></button>
            <button aria-label="Close subject detail" onClick={closeLater}>
              <X size={16} />
            </button>
          </div>
        </header>
        <section className="file-detail-preview subject-detail-preview">
          <Icon size={25} />
          <h2>{target.row.subject}</h2>
          <p>{isVocab && vocabTerm ? vocabTerm.definition : target.row.meta}</p>
          {isExternal ? (
            <div
              className="source-ingest-preview"
              data-source-ingest-source={target.row.subject}
              data-source-ingest-read-chunks={externalSourceIngestState?.readChunks ?? 0}
              data-source-ingest-total-chunks={externalSourceIngestState?.totalChunks ?? 0}
              data-source-ingest-sync={externalSourceIngestState?.syncStatus ?? ''}
              data-source-ingest-manifest={ingestManifestPath}
            >
              <span><strong>source</strong><em>HTTP URL stays the canonical origin</em></span>
              <span><strong>manifest</strong><em>{ingestManifestPath} · existing Ingest manifest reused when hash matches</em></span>
              <span><strong>ingest</strong><em>{externalSourceIngestState?.ingestStatus} · {externalSourceIngestState?.readChunks}/{externalSourceIngestState?.totalChunks} read · progressive chunks load only when read</em></span>
              <span><strong>sync</strong><em>{externalSourceIngestState?.syncStatus}</em></span>
              <span><strong>card</strong><em>local edits keep source lineage without overwrite</em></span>
              <button data-source-ingest-action="read" aria-label="Read external Ingest chunks" onClick={readExternalChunks}>
                <Plus size={13} /> Load chunks
              </button>
            </div>
          ) : isVocab ? (
            <div className="source-ingest-preview">
              <span><strong>kind</strong><em>{vocabTerm?.kind ?? 'Term'}</em></span>
              <span><strong>range</strong><em>{vocabTerm?.range ?? 'defined in terms.ttl'}</em></span>
              <span><strong>shape</strong><em>used by current class predicate rules</em></span>
              <span><strong>open</strong><em>resource file remains {path.split('#')[0]}</em></span>
            </div>
          ) : (
            <div className="source-ingest-preview">
              <span><strong>type</strong><em>{target.row.className}</em></span>
              <span><strong>links</strong><em>{target.row.relation}</em></span>
              <span><strong>file</strong><em>contained by /.data/workspaces/linx-prototype.ttl</em></span>
              <span><strong>return</strong><em>table · class scope · row retained</em></span>
            </div>
          )}
        </section>
        {target.routeContext ? (
          <section
            className="subject-return-context"
            data-route-class={target.routeContext.className}
            data-route-kind={target.kind}
            data-route-source={target.routeContext.source}
            data-route-subject={target.routeContext.rowSubject}
            data-route-view={target.routeContext.view}
            data-route-row={target.routeContext.rowSubject}
            data-route-row-index={target.routeContext.rowIndex ?? ''}
            data-route-scroll-top={target.routeContext.tableScrollTop ?? ''}
            data-route-destination={target.routeContext.destination ?? ''}
            data-route-search={target.routeContext.searchQuery}
            data-route-sort={target.routeContext.sortMode}
            aria-label="Subject return context"
          >
            <span><strong>Return</strong><em>{target.routeContext.view} · {target.routeContext.className}</em></span>
            <span><strong>Row</strong><em>{target.routeContext.rowSubject}</em></span>
            <span><strong>Position</strong><em>row {target.routeContext.rowIndex ?? 0}</em></span>
            <span><strong>Filter</strong><em>{target.routeContext.searchQuery || 'none'} · {target.routeContext.sortMode}</em></span>
          </section>
        ) : null}
        <section className="file-detail-tail">
          <FileMetaBlock heading="Meta" kind={kind} meta={meta} path={path} metaName={`${target.row.subject}.meta`} />
        </section>
      </article>
    </div>
  )
}
