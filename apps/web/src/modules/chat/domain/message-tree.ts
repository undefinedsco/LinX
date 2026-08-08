export interface MessageTreeNode {
  id: string
  parentItemId?: string
  branchId?: string
  supersedes?: string
  createdAt?: string | Date
}

export interface MessageSiblingGroup {
  parentItemId: string | null
  items: MessageTreeNode[]
}

/** Groups sibling versions so the UI can render ChatGPT-style 1/2 navigation. */
export function groupMessageSiblings(messages: readonly MessageTreeNode[]): MessageSiblingGroup[] {
  const groups = new Map<string, MessageTreeNode[]>()
  for (const message of messages) {
    const key = message.parentItemId ?? `root:${message.id}`
    const items = groups.get(key) ?? []
    items.push(message)
    groups.set(key, items)
  }
  return [...groups.entries()].map(([key, items]) => ({
    parentItemId: key.startsWith('root:') ? null : key,
    items: [...items].sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))),
  }))
}

export function selectSiblingIndex(group: MessageSiblingGroup, activeId?: string | null): number {
  if (!activeId) return Math.max(0, group.items.length - 1)
  const index = group.items.findIndex((item) => item.id === activeId)
  return index >= 0 ? index : Math.max(0, group.items.length - 1)
}

export function cycleSibling(group: MessageSiblingGroup, activeId: string | null | undefined, direction: -1 | 1): string | null {
  if (group.items.length === 0) return null
  const current = selectSiblingIndex(group, activeId)
  const next = (current + direction + group.items.length) % group.items.length
  return group.items[next]?.id ?? null
}

/** Returns the visible path by selecting one sibling at each message level. */
export function projectActiveMessagePath(
  messages: readonly MessageTreeNode[],
  activeByParent: Readonly<Record<string, string | undefined>> = {},
): MessageTreeNode[] {
  const byParent = new Map<string | null, MessageTreeNode[]>()
  for (const message of messages) {
    const key = message.parentItemId ?? null
    const items = byParent.get(key) ?? []
    items.push(message)
    byParent.set(key, items)
  }

  const visible: MessageTreeNode[] = []
  let parent: string | null = null
  while (true) {
    const siblings = byParent.get(parent)
    if (!siblings || siblings.length === 0) break
    const selectedId: string | undefined = activeByParent[parent ?? 'root']
    const selected: MessageTreeNode | undefined = siblings.find((item) => item.id === selectedId) ?? siblings[siblings.length - 1]
    if (!selected) break
    visible.push(selected)
    parent = selected.id
  }
  return visible
}
