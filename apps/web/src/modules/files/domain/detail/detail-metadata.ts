import {
  getFilesEntryOpenMode,
  getFilesEntrySemanticLabel,
  getFilesOpenModeLabel,
  isLockedVocabRegistry,
} from '../resource/resource-semantics'
import type {
  FilesAccessBasics,
  FilesDetail,
  FilesEntry,
  FilesEntrySemanticKind,
  FilesMetaSidecar,
} from '../resource/resource-model'

export function formatBytes(bytes?: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('zh-CN')
}

export function getFileMetaRows(file: FilesDetail): [string, string][] {
  const openMode = getFilesEntryOpenMode(file)
  return [
    ['ID', file.id],
    ['名称', file.name],
    ['URI', file.uri],
    ['MIME 类型', file.mimeType ?? '未知'],
    ['语义类型', getFilesEntrySemanticLabel(file.semanticKind)],
    ['打开方式', getFilesOpenModeLabel(openMode)],
    ['大小', formatBytes(file.size)],
    ['类别', file.kind === 'container' ? '容器' : '文件'],
    ['父容器', file.parentUri],
    ['修改时间', formatDateTime(file.modifiedAt)],
  ]
}

export function getMetaSidecarRows(meta: FilesMetaSidecar): [string, string][] {
  return [
    ['owner', meta.ownerUri],
    ['.meta', meta.metaUri],
    ['state', meta.state],
    ['status', meta.status ? String(meta.status) : '—'],
    ['MIME', meta.mimeType ?? '—'],
    ['ETag', meta.etag ?? '—'],
    ['size', meta.size == null ? '—' : formatBytes(meta.size)],
  ]
}

type AccessModeSet = {
  read: boolean
  append: boolean
  write: boolean
  control?: boolean
}

export function formatAccessModeSet(modes?: AccessModeSet | null): string {
  if (!modes) return '未知'
  const labels = [
    modes.read ? '可查看' : null,
    modes.append ? '可追加' : null,
    modes.write ? '可编辑' : null,
    modes.control ? '可管理权限' : null,
  ].filter((label): label is string => Boolean(label))
  return labels.length > 0 ? labels.join('、') : '无访问权限'
}

export function getAccessMetaRows(access?: FilesAccessBasics | null): [string, string][] {
  if (!access) return []

  const rows: [string, string][] = [
    ['owner', access.ownerUri],
  ]

  if (access.activeSource) {
    rows.push([
      '来源',
      `${access.activeSource.provider.toUpperCase()} · ${access.activeSource.inheritance === 'direct' ? 'direct' : 'inherited/candidate'}`,
    ])
    rows.push(['策略', access.activeSource.uri])
  } else {
    rows.push(['来源', '未确认'])
  }

  if (access.effectiveAccess) {
    rows.push(['你', formatAccessModeSet(access.effectiveAccess.user)])
    if (access.effectiveAccess.public) {
      rows.push(['公开访问', formatAccessModeSet(access.effectiveAccess.public)])
    }
  }

  if (access.policySummary) {
    rows.push(['策略状态', `${access.policySummary.provider.toUpperCase()} · ${access.policySummary.state}`])
  }

  return rows
}

export function getFolderChildPreviewRows(
  file: FilesDetail,
  child: FilesEntry | null,
  childCount: number,
): [string, string][] {
  if (!child) {
    return [
      ['容器', file.uri],
      ['包含', `${childCount} 项`],
      ['类型', file.mimeType ?? 'inode/container'],
      ['修改', formatDateTime(file.modifiedAt)],
    ]
  }

  return [
    ['名称', child.name],
    ['类型', child.mimeType ?? '未知'],
    ['摘要', child.summary ?? '—'],
    ['语义', getFilesEntrySemanticLabel(child.semanticKind)],
    ['大小', formatBytes(child.size)],
    ['修改', formatDateTime(child.modifiedAt)],
    ['URI', child.uri],
  ]
}

export function getFolderMetaRows(
  file: FilesDetail,
  childCount: number,
  meta?: FilesMetaSidecar | null,
): [string, string][] {
  const syncState = meta
    ? `${meta.state}${meta.status ? ` · ${meta.status}` : ''}`
    : 'unknown'

  return [
    ['容器', file.uri],
    ['包含', `${childCount} 项`],
    ['类型', file.mimeType ?? 'inode/container'],
    ['修改', formatDateTime(file.modifiedAt)],
    ['owner', meta?.ownerUri ?? file.uri],
    ['sync state', syncState],
  ]
}

export function getFilesEntrySemanticPolicy(semanticKind: FilesEntrySemanticKind): string {
  if (semanticKind === 'access-policy-sidecar') return '这是文件级 ACL/ACR sidecar。'
  if (isLockedVocabRegistry(semanticKind)) return '这是 locked vocabulary registry，写入应通过 proposal/approval。'
  if (semanticKind === 'source-linked-card') return '这是 source-linked card，原始来源和 Ingest 输出通过 proposal 审批后再写入。'
  if (semanticKind === 'structured-data') return '这是个人 `.data` 结构化数据，schema 变更应提升到 `/.vocab/`。'
  if (semanticKind === 'meta-sidecar') return '这是文件级 `.meta` sidecar。'
  return '按 Pod resource 路径浏览。'
}
