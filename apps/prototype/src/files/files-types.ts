import type { LucideIcon } from 'lucide-react'
import type { JSONContent } from '@tiptap/core'

export type IconType = LucideIcon
export type StructuredView = 'table' | 'discover' | 'kanban' | 'whiteboard' | 'raw'
export type FilesSelection = 'structuredVocab' | 'structuredVocabShapes' | 'structuredVocabNamespaces' | 'structuredData' | 'folderRoot' | 'folder' | 'document' | 'image' | 'restricted'
export type StructuredVocabSelection = 'structuredVocab' | 'structuredVocabShapes' | 'structuredVocabNamespaces'
export type RegularFileSelection = Exclude<FilesSelection, StructuredVocabSelection | 'structuredData' | 'folderRoot' | 'folder' | 'restricted'>
export type TableSortMode = 'none' | 'asc' | 'desc'
export type PredicateKind = 'text' | 'number' | 'select' | 'multi-select' | 'date' | 'checkbox' | 'url' | 'phone' | 'email' | 'relation'
export type VocabTermState = 'confirmed' | 'ai-pending' | 'modified-pending'
export type SubjectTargetKind = 'file-resource' | 'source-linked-card' | 'external-url' | 'fragment-subject' | 'vocab-term'

export interface PredicateDefinition {
  id: string
  label: string
  uri: string
  type: PredicateKind
  description: string
  valueStyle?: 'code' | 'path'
  options?: string[]
  vocabState?: VocabTermState
}

export interface SubjectRow {
  subject: string
  className: string
  label: string
  meta: string
  relation: string
  status: string
  active?: boolean
}

export interface SubjectOpenTarget {
  row: SubjectRow
  kind: SubjectTargetKind
  routeContext?: SubjectRouteContext
}

export interface SubjectRouteContext {
  className: string
  view: StructuredView
  searchQuery: string
  sortMode: TableSortMode
  rowSubject: string
  rowIndex?: number
  tableScrollTop?: number
  destination?: FilesSelection
  source: 'table' | 'kanban' | 'whiteboard' | 'raw' | 'discover'
}

export type LastOpenedSubjectRoute = SubjectRouteContext & {
  kind: SubjectTargetKind
}

export interface VocabTermRow {
  term: string
  kind: 'Class' | 'Predicate' | 'Enum' | 'Shape' | 'Namespace'
  uri: string
  label: string
  definition: string
  range: string
  status: string
  vocabState?: VocabTermState
}

export interface ChatFileItem {
  id: string
  name: string
  kind: string
  source: string
  path: string
  time: string
  size: string
  icon: IconType
  active?: boolean
}

export interface FileOpenSample {
  id: RegularFileSelection
  name: string
  path: string
  kind: string
  summary: string
  icon: IconType
  blocks?: FileContentBlock[]
  meta: Array<[string, string]>
  sourceReview?: SourceReviewSample
}

export type FileContentBlockKind = 'title' | 'paragraph' | 'heading' | 'list' | 'quote' | 'code'

export interface FileContentBlock {
  id: string
  kind: FileContentBlockKind
  text?: string
  items?: string[]
  level?: 1 | 2 | 3
  meta?: Array<[string, string]>
}

export interface FileContentChunk extends FileContentBlock {
  source?: string
  sourceChunkId?: string
  sourceHash?: string
  protected?: boolean
}

export interface FileEditorContent {
  format: 'tiptap-json'
  version: 1
  chunks: FileContentChunk[]
  doc: JSONContent
}

export type StoredFileContent = string | FileEditorContent

export interface SourceReviewSample {
  source: string
  ingestStatus: string
  readChunks: number
  totalChunks: number
  changedChunks: number
  localProtectedBlocks: number
  sourceHash: string
}

export interface SourceIngestState {
  ingestStatus: string
  readChunks: number
  totalChunks: number
  sourceHash: string
  syncStatus: string
  manifestPath: string
}

export interface FolderOpenSample {
  name: string
  path: string
  kind: string
  summary: string
  meta: Array<[string, string]>
  children: Array<{ name: string; kind: string; icon: IconType; detail: string; targetSelection?: FilesSelection }>
}
