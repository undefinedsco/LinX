import type { FilesDetail, FilesMetaSidecar } from '../../domain/resource/resource-model'
import {
  getFileMetaRows,
  getFolderMetaRows,
  getMetaSidecarRows,
} from '../../domain/detail/detail-metadata'
import {
  extractFileMetaPredicateValues,
  summarizeMetaSidecarContent,
  summarizeWorkspaceMetaSidecarContent,
} from '../../domain/sidecar/meta-sidecar'

const META_STATE_LABELS: Record<string, string> = {
  exists: '已连接',
  missing: '未创建',
  inaccessible: '不可访问',
  unknown: '未知',
}

const META_ROW_LABELS: Record<string, string> = {
  owner: '资源',
  state: '状态',
  status: '读取状态',
  MIME: 'MIME',
  ETag: 'ETag',
  size: '.meta 大小',
  source: '来源',
  links: '相关链接',
  'vocab/schema': '词表 / Schema',
  repository: '仓库',
  agent: 'Agent',
  workspace: '工作区',
  branch: '分支',
  'runtime status': '运行状态',
  'local path': '本地路径',
  cwd: '工作目录',
  'dirty state': '变更状态',
  'sync state': '同步状态',
}

export type ResourceMetaSidecarContentModel = {
  status: 'loading' | 'error' | 'unknown' | 'ready'
  errorMessage: string | null
  meta: FilesMetaSidecar | null
  metaState: FilesMetaSidecar['state'] | null
  fileRows: [string, string][]
  folderRows: [string, string][]
  metaRows: [string, string][]
  userRows: [string, string][]
  semanticRows: [string, string][]
  workspaceRows: [string, string][]
  showFolderRows: boolean
  showSemanticRows: boolean
  showWorkspaceRows: boolean
  rawContentAvailable: boolean
  rawText: string | null
  rawPanel: ResourceMetaSidecarRawPanel | null
}

export type ResourceMetaSidecarRawPanel =
  | {
    kind: 'content'
    text: string | null
  }
  | {
    kind: 'notice'
    tone: 'neutral' | 'warning'
    message: string
  }

function emptyResourceMetaSidecarContent(
  file: FilesDetail,
  status: ResourceMetaSidecarContentModel['status'],
  errorMessage: string | null = null,
): ResourceMetaSidecarContentModel {
  return {
    status,
    errorMessage,
    meta: null,
    metaState: null,
    fileRows: getFileMetaRows(file),
    folderRows: [],
    metaRows: [],
    userRows: [],
    semanticRows: [],
    workspaceRows: [],
    showFolderRows: false,
    showSemanticRows: false,
    showWorkspaceRows: false,
    rawContentAvailable: false,
    rawText: null,
    rawPanel: null,
  }
}

function localizeMetaRows(rows: [string, string][]): [string, string][] {
  return rows.map(([label, value]) => {
    const localizedLabel = META_ROW_LABELS[label] ?? label
    if (label === 'state') return [localizedLabel, META_STATE_LABELS[value] ?? value]
    if (label === 'sync state') {
      const [state, status] = value.split(' · ')
      const localizedState = META_STATE_LABELS[state] ?? state
      return [localizedLabel, status ? `${localizedState} · ${status}` : localizedState]
    }
    return [localizedLabel, value]
  })
}

function omitAccessPolicyFactsFromMetaText(text: string | null | undefined) {
  if (!text) return null
  const lines = text.split('\n').filter((line) => {
    const normalized = line.toLowerCase()
    return !normalized.includes('http://www.w3.org/ns/auth/acl#')
      && !normalized.includes('https://w3id.org/solid/acp#')
      && !normalized.includes('acl:')
      && !normalized.includes('acr:')
  })
  const filtered = lines.join('\n').trim()
  return filtered || null
}

function formatMetaQueryError(error: unknown) {
  return error instanceof Error ? error.message : 'unknown error'
}

function resourceMetaRows(file: FilesDetail, meta: FilesMetaSidecar) {
  const userValues = extractFileMetaPredicateValues(meta.metaUri, meta.mimeType, meta.content)
  const userRows: [string, string][] = []
  if (userValues.title) userRows.push(['标题', userValues.title])
  if (userValues.tags.length > 0) userRows.push(['标签', userValues.tags.join('、')])
  if (userValues.reviewStatus) userRows.push(['审核状态', userValues.reviewStatus])

  return {
    folderRows: file.kind === 'container'
      ? localizeMetaRows(getFolderMetaRows(file, file.childEntries?.length ?? 0, meta))
      : [],
    metaRows: localizeMetaRows(getMetaSidecarRows(meta)),
    userRows,
    semanticRows: meta.state === 'exists'
      ? localizeMetaRows(summarizeMetaSidecarContent(meta.metaUri, meta.mimeType, meta.content))
      : [],
    workspaceRows: meta.state === 'exists'
      ? localizeMetaRows(summarizeWorkspaceMetaSidecarContent(meta.metaUri, meta.mimeType, meta.content))
      : [],
  }
}

function projectResourceMetaSidecarRawPanel({
  meta,
  rawContentAvailable,
  rawText,
}: {
  meta: FilesMetaSidecar
  rawContentAvailable: boolean
  rawText: string | null
}): ResourceMetaSidecarRawPanel {
  if (rawContentAvailable) {
    return {
      kind: 'content',
      text: rawText,
    }
  }

  if (meta.state === 'missing') {
    return {
      kind: 'notice',
      tone: 'neutral',
      message: '未找到 .meta。',
    }
  }

  if (meta.state === 'inaccessible') {
    return {
      kind: 'notice',
      tone: 'warning',
      message: '.meta 不可访问。',
    }
  }

  return {
    kind: 'notice',
    tone: 'neutral',
    message: '无法确认 .meta 状态。',
  }
}

export function projectResourceMetaSidecarContent({
  file,
  isLoading,
  error,
  meta,
}: {
  file: FilesDetail
  isLoading: boolean
  error: unknown
  meta: FilesMetaSidecar | undefined
}): ResourceMetaSidecarContentModel {
  if (isLoading) return emptyResourceMetaSidecarContent(file, 'loading')
  if (error) return emptyResourceMetaSidecarContent(file, 'error', formatMetaQueryError(error))
  if (!meta) return emptyResourceMetaSidecarContent(file, 'unknown')

  const rows = resourceMetaRows(file, meta)
  const rawContentAvailable = meta.state === 'exists' && !!meta.content
  const rawText = omitAccessPolicyFactsFromMetaText(meta.content)
  return {
    status: 'ready',
    errorMessage: null,
    meta,
    metaState: meta.state,
    fileRows: getFileMetaRows(file),
    ...rows,
    showFolderRows: rows.folderRows.length > 0,
    showSemanticRows: rows.semanticRows.length > 0,
    showWorkspaceRows: rows.workspaceRows.length > 0,
    rawContentAvailable,
    rawText,
    rawPanel: projectResourceMetaSidecarRawPanel({
      meta,
      rawContentAvailable,
      rawText,
    }),
  }
}
