import type { FilesEntry } from '../resource/resource-model'
import { normalizeContainerUri } from '../resource/resource-semantics'

/** R6 K0: the tree shows folders and tables, and a few built-in views under each assistant folder. */

export const GRANTS_VIEW_URI_PREFIX = 'linx://view/grants/'
const AGENT_HOME_PATTERN = /\/(?:\.data\/)?agents\/([^/]+)\/$/

export function isGrantsViewUri(uri: string | null | undefined): uri is string {
  return !!uri && uri.startsWith(GRANTS_VIEW_URI_PREFIX)
}

export function parseAgentHomeContainer(containerUri: string): { agentId: string; homeUri: string } | null {
  const homeUri = normalizeContainerUri(containerUri)
  const match = AGENT_HOME_PATTERN.exec(homeUri)
  return match ? { agentId: decodeURIComponent(match[1]), homeUri } : null
}

function virtualEntry(uri: string, name: string, parentUri: string, semanticKind: FilesEntry['semanticKind']): FilesEntry {
  return {
    id: uri,
    uri,
    name,
    kind: 'resource',
    semanticKind,
    parentUri,
    mimeType: semanticKind === 'structured-data' ? 'text/turtle' : null,
    size: null,
    modifiedAt: null,
  }
}

/** 授权 (what this assistant may do) and 记住的 (`remembered.ttl`) under an assistant folder. */
export function projectAgentHomeVirtualEntries(containerUri: string): FilesEntry[] {
  const home = parseAgentHomeContainer(containerUri)
  if (!home) return []
  return [
    virtualEntry(`${GRANTS_VIEW_URI_PREFIX}${encodeURIComponent(home.agentId)}`, '授权', home.homeUri, 'file'),
    virtualEntry(`${home.homeUri}remembered.ttl`, '记住的', home.homeUri, 'structured-data'),
  ]
}

export function mergeAgentHomeVirtualEntries(
  childEntriesByContainerUri: Record<string, FilesEntry[]>,
): Record<string, FilesEntry[]> {
  let merged: Record<string, FilesEntry[]> | null = null
  for (const [containerUri, children] of Object.entries(childEntriesByContainerUri)) {
    const extra = projectAgentHomeVirtualEntries(containerUri)
    if (extra.length === 0) continue
    const existing = new Set(children.map((child) => child.uri))
    merged ??= { ...childEntriesByContainerUri }
    merged[containerUri] = [
      ...children.filter((child) => !extra.some((virtual) => virtual.uri === child.uri && existing.has(child.uri))),
      ...extra,
    ]
  }
  return merged ?? childEntriesByContainerUri
}

const VOCAB_LABELS: Partial<Record<FilesEntry['semanticKind'], string>> = {
  'vocab-terms': '属性',
  'vocab-shapes': '类型',
  'vocab-namespaces': '命名空间',
}

/** Plain words for built-in folders and vocabulary tables; everything else keeps its own name. */
export function projectExplorerEntryLabel(entry: FilesEntry): string {
  const vocabLabel = VOCAB_LABELS[entry.semanticKind]
  if (vocabLabel) return vocabLabel
  if (entry.kind === 'container' && /\/\.vocab\/$/.test(normalizeContainerUri(entry.uri))) return '词表'
  return entry.name
}

/** Row name in folder views: assistant home folders show the assistant's name, other entries keep their own. */
export function projectEntryDisplayName(entry: FilesEntry, agentNames?: Record<string, string>): string {
  if (entry.kind === 'container' && agentNames) {
    const agentId = parseAgentHomeContainer(entry.uri)?.agentId
    if (agentId && agentNames[agentId]) return agentNames[agentId]
  }
  return entry.name
}

/** The tree lists folders and data tables only; other files are reached through their folder's table. */
export function isExplorerTreeEntry(entry: FilesEntry): boolean {
  if (entry.kind === 'container') return true
  if (isGrantsViewUri(entry.uri)) return true
  return entry.semanticKind === 'structured-data'
    || entry.semanticKind === 'vocab-terms'
    || entry.semanticKind === 'vocab-shapes'
    || entry.semanticKind === 'vocab-namespaces'
}
