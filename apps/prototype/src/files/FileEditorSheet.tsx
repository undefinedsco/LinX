import { useEffect, useRef, useState } from 'react'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Archive,
  Bold,
  Check,
  ChevronDown,
  Clock3,
  Code2,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  HardDrive,
  Info,
  Italic,
  LayoutGrid,
  Link2,
  List,
  ListOrdered,
  MoreHorizontal,
  Plus,
  Quote,
  Redo2,
  Share2,
  ShieldCheck,
  Star,
  Tags,
  Trash2,
  Underline,
  Undo2,
  X,
} from 'lucide-react'
import { fileOpenSamples, sourceLinkedCardForSubject, sourceLinkedCardSample, vocabTerms } from './files-model'
import { sourceReviewSnapshot, type SourceReviewState } from './files-proposals'
import { TypedPredicateCell } from './typed-cell-editors'
import type { FileContentBlock, FileContentChunk, FileEditorContent, FileOpenSample, IconType, SourceIngestState, PredicateDefinition, SourceReviewSample, StoredFileContent, SubjectOpenTarget } from './files-types'
import { AccessPolicyDialog } from './ResourceSidecars'
import { InfoPanel, InfoRow } from '../shared/ui'

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
    return `
      <div class="note-title-block" data-block-id="${escapeHtml(block.id)}">
        <h1>${escapeHtml(block.text ?? '')}</h1>
      </div>
    `
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
      <h1>${file.name.replace(/\.md$/, '')}</h1>
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
  const [toolbarVisible, setToolbarVisible] = useState(false)
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
      className={`rich-editor-shell${toolbarVisible ? ' editor-active' : ''}`}
      data-seed-block-count={file.blocks?.length ?? 0}
      data-seed-format={file.blocks?.length ? 'blocks-with-double-newline-html' : 'fallback-html'}
      data-storage-format={isFileEditorContent(content) ? content.format : content ? 'legacy-html' : 'seed-blocks'}
      aria-label={`${file.name} editor`}
      onFocusCapture={() => setToolbarVisible(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setToolbarVisible(false)
      }}
    >
      {toolbarVisible ? <div className="rich-editor-toolbar" aria-label="Editor toolbar">
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
      </div> : null}
      <div className="rich-editor-body">
        {toolbarVisible ? <div className="editor-block-tools" aria-label="Block tools">
          <button title="Add block" aria-label="Add block"><Plus size={15} /></button>
          <button title="Move block" aria-label="Move block"><MoreHorizontal size={15} /></button>
        </div> : null}
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

function FileInfoPanel({
  file,
  properties,
  onChangeProperties,
  notify,
}: {
  file: FileOpenSample
  properties: FilePropertyState
  onChangeProperties?: (properties: FilePropertyState) => void
  notify?: (title: string, kind?: 'ok' | 'err') => void
}) {
  const [hidden, setHidden] = useState(false)
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
  ]
  const setProperty = (key: keyof FilePropertyState, value: string) => {
    onChangeProperties?.({ ...properties, [key]: value })
  }
  const enumTone = (value: string) => {
    const tones = ['blue', 'green', 'yellow', 'red', 'gray']
    const sum = value.split('').reduce((total, char) => total + char.charCodeAt(0), 0)
    return tones[sum % tones.length]
  }
  const tagList = properties.tags.split(',').map((tag) => tag.trim()).filter(Boolean)

  return (
    <section className="file-info-panel" data-file-property-panel={file.path} data-property-status={properties.status} aria-label="Info">
      <header className="file-info-head">
        <span><Info size={13} /> Info</span>
        <span className="file-info-head-side">
          <small>{sourceLinked ? 'source-linked card' : 'file card'}</small>
          <button onClick={() => setHidden((current) => !current)}>{hidden ? 'Show' : 'Hide'}</button>
        </span>
      </header>
      {hidden ? null : (
        <div className="file-info-body">
          <div className="file-info-row">
            <span><Clock3 size={12} /> Modified</span>
            <strong>{file.meta.find(([label]) => label === 'modified')?.[1] ?? '—'}</strong>
          </div>
          <div className="file-info-row">
            <span><FileCode2 size={12} /> Format</span>
            <strong>{file.meta.find(([label]) => label === 'format')?.[1] ?? file.kind}</strong>
          </div>
          <div className="file-info-row">
            <span><HardDrive size={12} /> Size</span>
            <strong>{file.meta.find(([label]) => label === 'size')?.[1] ?? '—'}</strong>
          </div>
          <div className="file-info-row">
            <span><Tags size={12} /> Tags ({tagList.length})</span>
            <span className="file-info-tags">
              {tagList.map((tag) => (
                <em className={`file-info-tag ${enumTone(tag)}`} key={tag}>{tag}</em>
              ))}
              <button aria-label="添加标签" title="添加标签" onClick={() => notify?.('在下方 tags 行编辑标签')}>+</button>
            </span>
          </div>
          {propertyPredicates.map((predicate) => {
            const propertyKey = predicate.propertyKey
            const value = propertyKey ? properties[propertyKey] : ''
            return (
              <div className="file-info-row editable" data-property-id={predicate.id} key={predicate.id}>
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
          {sourceLinked && file.sourceReview ? (
            <div className="file-info-row">
              <span><Link2 size={12} /> Source</span>
              <strong className="file-info-link">{file.sourceReview.source}</strong>
            </div>
          ) : null}
          <div className="file-info-row">
            <span><FileText size={12} /> Path</span>
            <strong className="file-info-path">{file.path}</strong>
          </div>
        </div>
      )}
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
  notify,
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
  notify?: (title: string, kind?: 'ok' | 'err') => void
  sourceReviewState?: SourceReviewState
}) {
  const Icon = file.icon
  const [accessOpen, setAccessOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLSpanElement>(null)
  const closeLater = () => window.setTimeout(onClose, 0)
  const sourceLinked = file.kind === 'Source-linked card'
  const resolvedProperties = fileProperties ?? defaultFileProperties(file)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !accessOpen) {
        if (moreOpen) {
          setMoreOpen(false)
          return
        }
        closeLater()
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [accessOpen, moreOpen, onClose])

  useEffect(() => {
    if (!moreOpen) return
    const closeOnOutside = (event: MouseEvent) => {
      if (moreRef.current && event.target instanceof Node && !moreRef.current.contains(event.target)) setMoreOpen(false)
    }
    window.addEventListener('mousedown', closeOnOutside)
    return () => window.removeEventListener('mousedown', closeOnOutside)
  }, [moreOpen])

  const moreItems: Array<{ label: string; icon: IconType; kbd?: string; destructive?: boolean; run: () => void }> = [
    { label: '在新标签打开', icon: ExternalLink, kbd: '⌘⏎', run: () => notify?.('已在新标签打开（演示）') },
    { label: '导出为 Markdown', icon: Download, kbd: '', run: () => notify?.('已导出 Markdown') },
    { label: '导出为 PDF', icon: FileText, kbd: '', run: () => notify?.('已导出 PDF') },
    { label: '版本历史', icon: Clock3, kbd: '', run: () => notify?.('版本历史（演示）') },
    { label: '复制链接', icon: Link2, kbd: '⌘L', run: () => notify?.('已复制链接') },
    { label: '分享', icon: Share2, kbd: '', run: () => notify?.('分享（演示）') },
    { label: '加入收件箱', icon: Archive, kbd: '', run: () => notify?.('已加入收件箱') },
    { label: '管理标签', icon: Tags, kbd: '⌘T', run: () => notify?.('在 Info 面板编辑标签') },
    { label: '加到白板', icon: LayoutGrid, kbd: '⌘M', run: () => notify?.('已加到白板（演示）') },
    { label: '删除', icon: Trash2, destructive: true, run: () => {
      notify?.('文件已删除', 'err')
      onClose()
    } },
  ]

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
            <span className="file-more-anchor" ref={moreRef}>
              <button title="更多" aria-label="更多" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
                <MoreHorizontal size={16} />
              </button>
              {moreOpen ? (
                <span className="file-more-menu" role="menu">
                  {moreItems.map((item) => {
                    const ItemIcon = item.icon
                    return (
                      <button
                        role="menuitem"
                        className={item.destructive ? 'destructive' : ''}
                        key={item.label}
                        onClick={() => {
                          setMoreOpen(false)
                          item.run()
                        }}
                      >
                        <ItemIcon size={14} />
                        <span>{item.label}</span>
                        {item.kbd ? <kbd>{item.kbd}</kbd> : null}
                      </button>
                    )
                  })}
                </span>
              ) : null}
            </span>
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
        <FileInfoPanel
          file={file}
          properties={resolvedProperties}
          onChangeProperties={onChangeFileProperties}
          notify={notify}
        />
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
  notify,
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
  notify?: (title: string, kind?: 'ok' | 'err') => void
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
            <button title="Copy URI" aria-label="Copy URI" onClick={() => notify?.('已复制 URI')}><Link2 size={15} /></button>
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
              <span><strong>ingest</strong><em>{externalSourceIngestState?.ingestStatus} · {externalSourceIngestState?.readChunks}/{externalSourceIngestState?.totalChunks} read</em></span>
              <span><strong>sync</strong><em>{externalSourceIngestState?.syncStatus}</em></span>
              <button data-source-ingest-action="read" aria-label="Read external Ingest chunks" onClick={readExternalChunks}>
                <Plus size={13} /> Load chunks
              </button>
            </div>
          ) : null}
        </section>
        <InfoPanel badge={kind}>
          {isExternal ? (
            <>
              <InfoRow icon={Link2} label="Source" value="HTTP URL stays the canonical origin" />
              <InfoRow icon={FileCode2} label="Manifest" value={ingestManifestPath} />
              <InfoRow icon={ShieldCheck} label="Source hash" value={externalSourceIngestState?.sourceHash ?? 'sha256:92d7'} />
            </>
          ) : isVocab ? (
            <>
              <InfoRow icon={Tags} label="Kind" value={vocabTerm?.kind ?? 'Term'} />
              <InfoRow icon={ExternalLink} label="Range" value={vocabTerm?.range ?? '—'} />
              <InfoRow icon={Check} label="Status" value={vocabTerm?.status ?? '—'} />
              <InfoRow icon={FileText} label="Shape" value="used by current class predicate rules" />
            </>
          ) : (
            <>
              <InfoRow icon={Tags} label="Class" value={target.row.className} />
              <InfoRow icon={Link2} label="Links" value={target.row.relation || '—'} />
              <InfoRow icon={Check} label="Status" value={target.row.status || '—'} />
            </>
          )}
          {target.routeContext ? (
            <InfoRow
              icon={Undo2}
              label="Return"
              value={`${target.routeContext.view} · ${target.routeContext.className} · row ${target.routeContext.rowIndex ?? 0}`}
            />
          ) : null}
          <InfoRow icon={FileText} label="Path" value={path} />
        </InfoPanel>
      </article>
    </div>
  )
}
