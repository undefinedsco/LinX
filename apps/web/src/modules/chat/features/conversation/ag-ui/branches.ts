/**
 * Versions of a message (user edits, regenerated answers) as a tree, so the
 * branch picker can offer the ones that are not shown. The service keeps the
 * versions as siblings that share a `parent_item_id`; an edited user message
 * shares a virtual `branch-root:` parent, which stands for "the message before".
 */
import type { ThreadItem } from '@/lib/vendor/xpod-chatkit'
import type { AgUiHistoryMessage, ConversationHistoryItem } from './history'

/** Same rule as the service: `chat/x.ttl#id` and `id` name one item. */
export function canonicalBranchRef(value: string): string {
  const prefix = 'branch-root:'
  if (value.startsWith(prefix)) return `${prefix}${canonicalBranchRef(value.slice(prefix.length))}`
  const hash = value.lastIndexOf('#')
  return hash >= 0 ? value.slice(hash + 1) : value
}

export function branchParentOf(item: ThreadItem): string | undefined {
  const value = (item as ThreadItem & { parent_item_id?: unknown }).parent_item_id
  return typeof value === 'string' && value ? value : undefined
}

const isVisibleRole = (message: AgUiHistoryMessage) => message.role === 'user' || message.role === 'assistant'

/**
 * Where each message of a hidden version hangs in the tree: message id →
 * parent message id (`null` = first message). Versions whose place cannot be
 * found are left out.
 */
export function alternateParents(
  active: readonly ConversationHistoryItem[],
  activeMessages: readonly AgUiHistoryMessage[],
  alternates: readonly ConversationHistoryItem[],
  alternateMessages: readonly AgUiHistoryMessage[],
): Map<string, string | null> {
  const chain = activeMessages.filter(isVisibleRole).map((message) => message.id)
  const predecessorOf = new Map<string, string | null>()
  chain.forEach((id, index) => predecessorOf.set(id, index > 0 ? chain[index - 1] : null))
  const known = new Set([...chain, ...alternateMessages.filter(isVisibleRole).map((message) => message.id)])

  const entryByRef = new Map<string, ConversationHistoryItem>()
  for (const entry of [...active, ...alternates]) entryByRef.set(canonicalBranchRef(entry.item.id), entry)
  // The shown member of each group of versions → the message before the group.
  const groupPredecessor = new Map<string, string | null>()
  for (const entry of active) {
    const parent = branchParentOf(entry.item)
    if (!parent || !predecessorOf.has(entry.uri)) continue
    groupPredecessor.set(canonicalBranchRef(parent), predecessorOf.get(entry.uri) ?? null)
  }

  const resolve = (item: ThreadItem, depth: number): string | null | undefined => {
    const parent = branchParentOf(item)
    if (!parent || depth > 32) return undefined
    const ref = canonicalBranchRef(parent)
    if (ref.startsWith('branch-root:')) return groupPredecessor.has(ref) ? groupPredecessor.get(ref) : undefined
    const owner = entryByRef.get(ref)
    if (!owner) return undefined
    if (known.has(owner.uri)) return owner.uri
    return resolve(owner.item, depth + 1) // the parent item is not a message (e.g. an image): climb
  }

  const result = new Map<string, string | null>()
  for (const entry of alternates) {
    if (!known.has(entry.uri)) continue
    const parentId = resolve(entry.item, 0)
    if (parentId !== undefined) result.set(entry.uri, parentId)
  }
  return result
}
