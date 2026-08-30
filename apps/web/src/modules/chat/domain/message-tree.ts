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

export interface BranchNavigationSelection {
  userId: string
  messageGroup?: MessageSiblingGroup
  answerGroup?: MessageSiblingGroup
}

function createdAtTimestamp(value: MessageTreeNode['createdAt']): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const timestamp = Date.parse(value)
    return Number.isNaN(timestamp) ? 0 : timestamp
  }
  return 0
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
    items: [...items].sort((a, b) => createdAtTimestamp(a.createdAt) - createdAtTimestamp(b.createdAt)),
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

/** Finds the newest branching point while respecting the active edited-message branch. */
export function findLatestBranchNavigation(
  userIds: readonly string[],
  userGroups: readonly MessageSiblingGroup[],
  answerGroups: readonly MessageSiblingGroup[],
  activeByParent: Readonly<Record<string, string | undefined>> = {},
): BranchNavigationSelection | undefined {
  const positions = new Map(userIds.map((id, index) => [id, index]))
  let selected: (BranchNavigationSelection & { position: number }) | undefined
  for (const messageGroup of userGroups) {
    if (messageGroup.items.length < 2 || !messageGroup.parentItemId) continue
    const activeId = activeByParent[messageGroup.parentItemId]
    const userId = messageGroup.items[selectSiblingIndex(messageGroup, activeId)]?.id
    if (!userId) continue
    const position = Math.max(...messageGroup.items.map((item) => positions.get(item.id) ?? -1))
    if (!selected || position >= selected.position) {
      selected = {
        position,
        userId,
        messageGroup,
        answerGroup: answerGroups.find((group) => group.parentItemId === userId),
      }
    }
  }
  for (const answerGroup of answerGroups) {
    if (answerGroup.items.length < 2 || !answerGroup.parentItemId) continue
    const messageGroup = userGroups.find((group) => group.items.some((item) => item.id === answerGroup.parentItemId))
    if (messageGroup && messageGroup.items.length > 1 && messageGroup.parentItemId) {
      const activeId = activeByParent[messageGroup.parentItemId]
      if (messageGroup.items[selectSiblingIndex(messageGroup, activeId)]?.id !== answerGroup.parentItemId) continue
    }
    const position = positions.get(answerGroup.parentItemId) ?? -1
    if (!selected || position >= selected.position) {
      selected = {
        position,
        userId: answerGroup.parentItemId,
        messageGroup: messageGroup && messageGroup.items.length > 1 ? messageGroup : undefined,
        answerGroup,
      }
    }
  }
  if (!selected) return undefined
  const { position: _position, ...navigation } = selected
  return navigation
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
