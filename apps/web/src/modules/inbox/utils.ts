import type { InboxFilter } from './store'

export interface ActionableInboxItemLike {
  kind: 'approval' | 'audit'
  category: 'approval' | 'auth_required' | 'audit'
  status?: string
}

export function isActionableInboxItem(item: ActionableInboxItemLike): boolean {
  if (item.category === 'auth_required') {
    return item.status !== 'resolved'
  }
  return item.kind === 'approval' && item.status === 'pending'
}

export function filterInboxItems<T extends ActionableInboxItemLike>(items: T[], filter: InboxFilter): T[] {
  switch (filter) {
    case 'pending':
      return items.filter(isActionableInboxItem)
    case 'audit':
      return items.filter((item) => item.kind === 'audit')
    default:
      return items
  }
}

export function countActionableInboxItems<T extends ActionableInboxItemLike>(items: T[]): number {
  return items.filter(isActionableInboxItem).length
}
