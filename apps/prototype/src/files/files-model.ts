import {
  Check,
  Clock3,
  ExternalLink,
  FileCode2,
  FileText,
  FolderOpen,
  Image,
  Link2,
  ListFilter,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Tags,
} from 'lucide-react'
import type {
  FileContentBlock,
  FileOpenSample,
  FilesSelection,
  FolderOpenSample,
  IconType,
  PredicateDefinition,
  PredicateKind,
  RegularFileSelection,
  SubjectRow,
  VocabTermRow,
  VocabTermState,
  TableSortMode,
} from './files-types'

export const subjectRows: SubjectRow[] = [
  {
    subject: '#FileResource',
    className: 'Class',
    label: 'File resource',
    meta: 'dcterms:title, schema:about, acl:mode',
    relation: 'used by 18 resources',
    status: 'Valid',
    active: true,
  },
  {
    subject: '/.vocab/terms.ttl#tags',
    className: 'Class',
    label: 'Tags predicate term',
    meta: 'kind Predicate, range skos:Concept[], shape FileResource',
    relation: 'used by Class, Agent, GrantPage',
    status: 'Registered',
  },
  {
    subject: '#WorkspaceMeta',
    className: 'Workspace',
    label: 'Workspace metadata',
    meta: 'repository, localPath, currentCommit',
    relation: 'links Repository',
    status: 'Missing',
  },
  {
    subject: '#AgentHome',
    className: 'Agent',
    label: 'Agent home container',
    meta: 'skills, backend, memory, grants',
    relation: 'contains profile.ttl',
    status: 'Valid',
  },
  {
    subject: '#Repository',
    className: 'Code',
    label: 'Repository metadata',
    meta: 'dcterms:source, branchRef',
    relation: 'referenced by workspace',
    status: 'Review',
  },
  {
    subject: '#GrantWikiPage',
    className: 'GrantPage',
    label: 'Autonomy grant wiki',
    meta: 'summary, tags, sourceHash',
    relation: 'feeds approval policy',
    status: 'Valid',
  },
  {
    subject: 'https://solidproject.org/TR/protocol',
    className: 'GrantPage',
    label: 'Solid Protocol source',
    meta: 'Ingest chunks, sync cadence, sourceHash',
    relation: 'source for #GrantWikiPage',
    status: 'Sync',
  },
]

export const structuredClassOptions = ['Class', 'Workspace', 'Agent', 'Code', 'GrantPage']
export const structuredClassStates: Partial<Record<string, VocabTermState>> = {
  GrantPage: 'ai-pending',
}

export const vocabTermSlug = (value: string) => {
  const words = value.trim().split(/[^a-zA-Z0-9]+/).filter(Boolean)
  return words
    .map((word, index) => {
      const lowered = word.toLowerCase()
      return index === 0 ? lowered : `${lowered.charAt(0).toUpperCase()}${lowered.slice(1)}`
    })
    .join('')
}

export const classVocabUri = (className: string) => `/.vocab/terms.ttl#${vocabTermSlug(className) || 'class'}`
export const vocabStateLabel = (state?: VocabTermState) => {
  if (state === 'ai-pending') return 'AI draft'
  if (state === 'modified-pending') return 'Pending change'
  return 'Confirmed'
}

export const structuredBasePredicatesByClass: Record<string, PredicateDefinition[]> = {
  Class: [
    { id: 'dcterms:title', label: 'dcterms:title', uri: 'http://purl.org/dc/terms/title', type: 'text', description: 'Display label for the subject.' },
    { id: 'schema:about', label: 'schema:about', uri: 'https://schema.org/about', type: 'relation', description: 'IRI target this class is about.' },
    { id: 'acl:mode', label: 'acl:mode', uri: 'http://www.w3.org/ns/auth/acl#mode', type: 'select', description: 'Controlled access mode value.', options: ['read', 'write', 'read/write', 'append', 'control'] },
    { id: 'udfs:tags', label: 'udfs:tags', uri: '/.vocab/terms.ttl#tags', type: 'multi-select', description: 'Topic metadata tags.', options: ['core', 'rdf', 'solid-modeling', 'xpod-cli', 'ui-prototype', 'vocab'] },
    { id: 'udfs:updatedAt', label: 'udfs:updatedAt', uri: '/.vocab/terms.ttl#updatedAt', type: 'date', description: 'Last schema review date.' },
    { id: 'udfs:published', label: 'udfs:published', uri: '/.vocab/terms.ttl#published', type: 'checkbox', description: 'Whether the term is published.' },
  ],
  Workspace: [
    { id: 'dcterms:title', label: 'dcterms:title', uri: 'http://purl.org/dc/terms/title', type: 'text', description: 'Workspace label.' },
    { id: 'udfs:repository', label: 'udfs:repository', uri: '/.vocab/terms.ttl#repository', type: 'relation', description: 'Linked repository subject.' },
    { id: 'udfs:localPath', label: 'udfs:localPath', uri: '/.vocab/terms.ttl#localPath', type: 'url', description: 'Local path metadata.', valueStyle: 'path' },
    { id: 'udfs:currentCommit', label: 'udfs:currentCommit', uri: '/.vocab/terms.ttl#currentCommit', type: 'text', description: 'Current Git commit reference.', valueStyle: 'code' },
    { id: 'udfs:runtimeStatus', label: 'udfs:runtimeStatus', uri: '/.vocab/terms.ttl#runtimeStatus', type: 'select', description: 'AI-suggested workspace runtime status.', options: ['active', 'paused', 'archived'], vocabState: 'ai-pending' },
  ],
  Agent: [
    { id: 'dcterms:title', label: 'dcterms:title', uri: 'http://purl.org/dc/terms/title', type: 'text', description: 'Agent label.' },
    { id: 'ldp:contains', label: 'ldp:contains', uri: 'http://www.w3.org/ns/ldp#contains', type: 'relation', description: 'Contained profile or resource.' },
    { id: 'udfs:skills', label: 'udfs:skills', uri: '/.vocab/terms.ttl#skills', type: 'multi-select', description: 'Enabled skill labels.', options: ['solid-modeling', 'xpod-cli', 'ui-prototype', 'vocab'] },
    { id: 'udfs:backend', label: 'udfs:backend', uri: '/.vocab/terms.ttl#backend', type: 'select', description: 'Backend route.', options: ['local', 'cloud', 'hybrid'] },
  ],
  Code: [
    { id: 'dcterms:title', label: 'dcterms:title', uri: 'http://purl.org/dc/terms/title', type: 'text', description: 'Repository label.' },
    { id: 'schema:about', label: 'schema:about', uri: 'https://schema.org/about', type: 'relation', description: 'Repository owner/name.' },
    { id: 'udfs:branchRef', label: 'udfs:branchRef', uri: '/.vocab/terms.ttl#branchRef', type: 'text', description: 'Current branch ref.', valueStyle: 'code' },
  ],
  GrantPage: [
    { id: 'dcterms:title', label: 'dcterms:title', uri: 'http://purl.org/dc/terms/title', type: 'text', description: 'Grant page title.' },
    { id: 'schema:about', label: 'schema:about', uri: 'https://schema.org/about', type: 'relation', description: 'Policy topic.' },
    { id: 'udfs:sourceHash', label: 'udfs:sourceHash', uri: '/.vocab/terms.ttl#sourceHash', type: 'text', description: 'Source content hash.', valueStyle: 'code' },
    { id: 'udfs:reviewStatus', label: 'udfs:reviewStatus', uri: '/.vocab/terms.ttl#reviewStatus', type: 'select', description: 'Review status shared by table and Kanban views.', options: ['Draft', 'Ready', 'Published'] },
  ],
}

export const structuredSubjectValues: Record<string, Record<string, string>> = {
  '#FileResource': {
    'dcterms:title': 'File resource',
    'schema:about': '../files/',
    'acl:mode': 'read/write',
    'udfs:tags': 'core, rdf',
    'udfs:updatedAt': '2026-06-10',
    'udfs:published': 'true',
  },
  '/.vocab/terms.ttl#tags': {
    'dcterms:title': 'Tags predicate term',
    'schema:about': '#FileResource',
    'acl:mode': 'read',
    'udfs:tags': 'vocab, rdf',
    'udfs:updatedAt': '2026-06-16',
    'udfs:published': 'true',
  },
  '#WorkspaceMeta': {
    'dcterms:title': 'Workspace metadata',
    'udfs:repository': '#Repository',
    'udfs:localPath': '~/develop/linx-files',
    'udfs:currentCommit': '8f3c2e1',
    'udfs:runtimeStatus': 'active',
  },
  '#AgentHome': {
    'dcterms:title': 'Agent home container',
    'ldp:contains': 'profile.ttl',
    'udfs:skills': 'solid-modeling, xpod-cli',
    'udfs:backend': 'local',
  },
  '#Repository': {
    'dcterms:title': 'Repository metadata',
    'schema:about': 'undefinedsco/LinX',
    'udfs:branchRef': 'main',
  },
  '#GrantWikiPage': {
    'dcterms:title': 'Autonomy grant wiki',
    'schema:about': 'approval policy',
    'udfs:sourceHash': 'sha256:92d7',
    'udfs:reviewStatus': 'Draft',
  },
  'https://solidproject.org/TR/protocol': {
    'dcterms:title': 'Solid Protocol source',
    'schema:about': '#GrantWikiPage',
    'udfs:sourceHash': 'sha256:92d7',
    'udfs:reviewStatus': 'Ready',
  },
}

export const predicateTypeOptions: Array<{ kind: PredicateKind; label: string; icon: IconType; example: string }> = [
  { kind: 'text', label: 'Text', icon: FileText, example: 'Plain literal' },
  { kind: 'number', label: 'Number', icon: MoreHorizontal, example: 'Numeric literal' },
  { kind: 'select', label: 'Select', icon: Tags, example: 'Single controlled value' },
  { kind: 'multi-select', label: 'Multi-select', icon: ListFilter, example: 'Multiple controlled values' },
  { kind: 'date', label: 'Date', icon: Clock3, example: 'Date / datetime' },
  { kind: 'checkbox', label: 'Checkbox', icon: Check, example: 'Boolean' },
  { kind: 'url', label: 'URL', icon: Link2, example: 'IRI or external URL' },
  { kind: 'phone', label: 'Phone', icon: Mic, example: 'Phone literal' },
  { kind: 'email', label: 'Email', icon: MessageSquare, example: 'Email literal' },
  { kind: 'relation', label: 'Relation', icon: ExternalLink, example: 'IRI link to another subject' },
]

export const predicateLocalName = (label: string) => label.includes(':') ? label.split(':').pop() ?? label : label

export interface StructuredProjection {
  predicates: PredicateDefinition[]
  rows: SubjectRow[]
  cellValue: (subject: string, predicateId: string) => string | undefined
}

export function getStructuredProjection({
  selectedClass,
  hiddenPredicateIds = [],
  cellOverrides = {},
  predicates: predicateOverride,
  searchQuery = '',
  sortMode = 'none',
}: {
  selectedClass: string
  hiddenPredicateIds?: string[]
  cellOverrides?: Record<string, string>
  predicates?: PredicateDefinition[]
  searchQuery?: string
  sortMode?: TableSortMode
}): StructuredProjection {
  const predicates = (predicateOverride ?? structuredBasePredicatesByClass[selectedClass] ?? [])
    .filter((predicate) => !hiddenPredicateIds.includes(predicate.id))
  const cellValue = (subject: string, predicateId: string) => {
    return cellOverrides[`${subject}::${predicateId}`] ?? structuredSubjectValues[subject]?.[predicateId]
  }
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const classRows = subjectRows.filter((row) => row.className === selectedClass)
  const searchedRows = normalizedSearch
    ? classRows.filter((row) => {
        const haystack = [
          row.subject,
          row.label,
          row.meta,
          row.relation,
          row.status,
          ...predicates.map((predicate) => cellValue(row.subject, predicate.id) ?? ''),
        ].join(' ').toLowerCase()
        return haystack.includes(normalizedSearch)
      })
    : classRows
  const rows = sortMode === 'none'
    ? searchedRows
    : [...searchedRows].sort((left, right) => {
        const result = left.subject < right.subject ? -1 : left.subject > right.subject ? 1 : 0
        return sortMode === 'asc' ? result : -result
      })

  return { predicates, rows, cellValue }
}

export const vocabTerms: VocabTermRow[] = [
  {
    term: 'udfs:FileResource',
    kind: 'Class',
    uri: '/.vocab/terms.ttl#fileResource',
    label: 'File resource',
    definition: 'Pod-backed file or container resource.',
    range: 'rdfs:Class',
    status: 'published',
  },
  {
    term: 'udfs:tags',
    kind: 'Predicate',
    uri: '/.vocab/terms.ttl#tags',
    label: 'tags',
    definition: 'Topic metadata tags for a resource.',
    range: 'skos:Concept[]',
    status: 'published',
  },
  {
    term: 'udfs:published',
    kind: 'Predicate',
    uri: '/.vocab/terms.ttl#published',
    label: 'published',
    definition: 'Whether this vocab term is published.',
    range: 'xsd:boolean',
    status: 'published',
  },
  {
    term: 'udfs:Workspace',
    kind: 'Class',
    uri: '/.vocab/terms.ttl#workspace',
    label: 'Workspace',
    definition: 'A personal working folder connected to one project context.',
    range: 'rdfs:Class',
    status: 'confirmed',
  },
  {
    term: 'udfs:runtimeStatus',
    kind: 'Predicate',
    uri: '/.vocab/terms.ttl#runtimeStatus',
    label: 'runtime status',
    definition: 'Current local runtime state for a workspace.',
    range: 'active | paused | archived',
    status: 'registered',
  },
  {
    term: 'udfs:reviewStatus',
    kind: 'Predicate',
    uri: '/.vocab/terms.ttl#reviewStatus',
    label: 'review status',
    definition: 'User review state for generated resources.',
    range: 'Draft | Ready | Published',
    status: 'registered',
  },
  {
    term: 'udfs:reviewStatusDraft',
    kind: 'Enum',
    uri: '/.vocab/terms.ttl#reviewStatusDraft',
    label: 'Draft',
    definition: 'Selectable reviewStatus value for private drafts and pending Ingest review.',
    range: 'udfs:reviewStatus',
    status: 'registered',
  },
  {
    term: 'udfs:reviewStatusReady',
    kind: 'Enum',
    uri: '/.vocab/terms.ttl#reviewStatusReady',
    label: 'Ready',
    definition: 'Selectable reviewStatus value for reviewed resources ready to publish or share.',
    range: 'udfs:reviewStatus',
    status: 'registered',
  },
  {
    term: 'udfs:reviewStatusPublished',
    kind: 'Enum',
    uri: '/.vocab/terms.ttl#reviewStatusPublished',
    label: 'Published',
    definition: 'Selectable reviewStatus value for resources already accepted into the public workflow.',
    range: 'udfs:reviewStatus',
    status: 'published',
  },
]

export const vocabShapes: VocabTermRow[] = [
  {
    term: 'udfs:FileResourceShape',
    kind: 'Shape',
    uri: '/.vocab/shapes.ttl#fileResourceShape',
    label: 'File resource shape',
    definition: 'Required metadata for a Pod-backed file resource.',
    range: 'sh:NodeShape',
    status: 'published',
  },
  {
    term: 'udfs:SourceLinkedCardShape',
    kind: 'Shape',
    uri: '/.vocab/shapes.ttl#sourceLinkedCardShape',
    label: 'Source-linked card shape',
    definition: 'Validates card home, source URL, source hash, and protected local chunks.',
    range: 'sh:NodeShape',
    status: 'registered',
  },
  {
    term: 'udfs:ReviewStatusShape',
    kind: 'Shape',
    uri: '/.vocab/shapes.ttl#reviewStatusShape',
    label: 'Review status shape',
    definition: 'Constrains review status values used by Table and Kanban.',
    range: 'sh:PropertyShape',
    status: 'registered',
  },
]

export const vocabNamespaces: VocabTermRow[] = [
  {
    term: 'udfs',
    kind: 'Namespace',
    uri: '/.vocab/namespaces.ttl#udfs',
    label: 'Undefineds vocabulary',
    definition: 'Personal LinX/File vocabulary namespace for classes, predicates, shapes, and enum concepts.',
    range: 'https://vocab.undefineds.co/linx#',
    status: 'preferred',
  },
  {
    term: 'dcterms',
    kind: 'Namespace',
    uri: '/.vocab/namespaces.ttl#dcterms',
    label: 'Dublin Core Terms',
    definition: 'External metadata vocabulary used for titles and common resource metadata.',
    range: 'http://purl.org/dc/terms/',
    status: 'imported',
  },
  {
    term: 'sh',
    kind: 'Namespace',
    uri: '/.vocab/namespaces.ttl#sh',
    label: 'SHACL',
    definition: 'Shape vocabulary used by the sibling shape registry.',
    range: 'http://www.w3.org/ns/shacl#',
    status: 'imported',
  },
]

export const folderOpenSample: FolderOpenSample = {
  name: 'docs',
  path: '/files/docs/',
  kind: 'Pod container',
  summary: 'Editable notes, design references, and generated reports stored as normal Pod resources.',
  meta: [
    ['contains', '7 resources'],
    ['modified', 'Today 09:36'],
    ['permission', 'Private'],
    ['policy', 'inherited access summary'],
  ],
  children: [
    { name: 'multi-channel-access.md', kind: 'Markdown', icon: FileText, detail: '18 KB · Today 09:30' },
    { name: 'linx-prototype.ttl', kind: 'Turtle', icon: FileCode2, detail: 'Structured RDF · Today 09:12', targetSelection: 'structuredData' },
    { name: 'files-module-notes.md', kind: 'Markdown', icon: FileText, detail: '12 KB · Yesterday 16:42' },
    { name: 'reference-screenshots/', kind: 'Folder', icon: FolderOpen, detail: '4 images · Private' },
    { name: 'prototype-layout.png', kind: 'Image', icon: Image, detail: '842 KB · Yesterday 18:12' },
    { name: 'runtime-evidence.jsonl', kind: 'JSONL', icon: FileCode2, detail: '31 KB · Today 08:56' },
  ],
}

export const filesRootFolderOpenSample: FolderOpenSample = {
  name: 'files',
  path: '/files/',
  kind: 'Pod container',
  summary: 'User-facing file space for folders, editable notes, media, and structured resources.',
  meta: [
    ['contains', '4 folders'],
    ['modified', 'Today 09:40'],
    ['permission', 'Private'],
    ['policy', 'root ACR applies to file children'],
  ],
  children: [
    { name: 'docs', kind: 'Folder', icon: FolderOpen, detail: '7 resources · Private', targetSelection: 'folder' },
    { name: 'images', kind: 'Folder', icon: FolderOpen, detail: '4 images · Private' },
    { name: 'cards', kind: 'Folder', icon: FolderOpen, detail: 'source-linked notes · Private' },
    { name: 'linx-prototype.ttl', kind: 'Turtle', icon: FileCode2, detail: 'Structured RDF · Today 09:12', targetSelection: 'structuredData' },
  ],
}

export const multiChannelAccessBlocks: FileContentBlock[] = [
  {
    id: 'title',
    kind: 'title',
    text: 'multi-channel-access',
    meta: [
      ['draft', 'true'],
      ['linked resource', '/files/docs/multi-channel-access.md'],
      ['visibility', 'private'],
    ],
  },
  {
    id: 'route-identity',
    kind: 'paragraph',
    text: 'Local, LAN, tunnel, and cloud routes are access channels over the same Pod resource identity. Use one canonical storage identity, then let each route describe how the same resource is reached.',
  },
  {
    id: 'routes-heading',
    kind: 'heading',
    level: 2,
    text: 'Routes',
  },
  {
    id: 'route-list',
    kind: 'list',
    items: [
      'Local works without public reachability.',
      'Canonical URL belongs in resource metadata.',
      'Sharing and backlinks use file metadata.',
    ],
  },
  {
    id: 'stable-url',
    kind: 'quote',
    text: 'Keep the visible URL stable; change transport without changing the resource subject.',
  },
  {
    id: 'storage-code',
    kind: 'code',
    text: 'solid:storage /.data/workspaces/linx-prototype/',
  },
]

export const grantWikiPageBlocks: FileContentBlock[] = [
  {
    id: 'title',
    kind: 'title',
    text: 'grant-wiki-page',
    meta: [
      ['source', 'https://solidproject.org/TR/protocol'],
      ['Ingest', 'lazy chunks'],
      ['visibility', 'private'],
    ],
  },
  {
    id: 'source-ingest-summary',
    kind: 'paragraph',
    text: 'This card is an editable local note derived from ingested Solid Protocol chunks. Ingest changes can be reviewed without overwriting protected local edits.',
  },
  {
    id: 'source-chunks',
    kind: 'heading',
    level: 2,
    text: 'Ingest chunks',
  },
  {
    id: 'chunk-list',
    kind: 'list',
    items: [
      'Chunk 38 introduces resource access controls.',
      'Chunk 39 links storage identity to resource URLs.',
      'Chunk 40 is pending review before merge.',
    ],
  },
  {
    id: 'local-edit',
    kind: 'quote',
    text: 'Local edits stay user-owned even when Ingest chunks refresh.',
  },
]

export const fileOpenSamples: Record<RegularFileSelection, FileOpenSample> = {
  document: {
    id: 'document',
    name: 'multi-channel-access.md',
    path: '/files/docs/multi-channel-access.md',
    kind: 'Markdown document',
    summary: 'Editable Markdown with Pod metadata tracked beside the file.',
    icon: FileText,
    blocks: multiChannelAccessBlocks,
    meta: [
      ['format', 'text/markdown'],
      ['size', '18 KB'],
      ['modified', 'Today 09:30'],
      ['permission', 'Private'],
    ],
  },
  image: {
    id: 'image',
    name: 'prototype-layout.png',
    path: '/files/images/prototype-layout.png',
    kind: 'Image file',
    summary: 'Image resource with preview, file actions, and Pod metadata.',
    icon: Image,
    meta: [
      ['format', 'image/png'],
      ['size', '842 KB'],
      ['modified', 'Yesterday 18:12'],
      ['permission', 'Private'],
    ],
  },
}

export const sourceLinkedCardSample: FileOpenSample = {
  id: 'document',
  name: 'grant-wiki-page.card.md',
  path: '/files/docs/cards/grant-wiki-page.card.md',
  kind: 'Source-linked card',
  summary: 'Editable card derived from Ingest output, with source identity and Ingest manifest state kept in metadata.',
  icon: FileText,
  blocks: grantWikiPageBlocks,
  meta: [
    ['card home', '/files/docs/cards/'],
    ['inbox fallback', '/.data/cards/'],
    ['source', 'https://solidproject.org/TR/protocol'],
    ['Ingest', 'lazy chunks · 38/112 read'],
    ['source hash', 'sha256:92d7'],
    ['local edits', '3 blocks'],
  ],
  sourceReview: {
    source: 'https://solidproject.org/TR/protocol',
    ingestStatus: 'lazy chunks',
    readChunks: 38,
    totalChunks: 112,
    changedChunks: 12,
    localProtectedBlocks: 3,
    sourceHash: 'sha256:92d7',
  },
}

export const sourceLinkedCardsBySubject: Record<string, FileOpenSample> = {
  '#GrantWikiPage': sourceLinkedCardSample,
}

export function sourceLinkedCardForSubject(subject: string) {
  return sourceLinkedCardsBySubject[subject]
}
