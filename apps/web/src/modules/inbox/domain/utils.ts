/**
 * `pending` and `done` are the two views people switch between; `audit` is the
 * activity log reached from the bottom of the list. `all` is for data callers.
 */
export type InboxFilter = 'all' | 'pending' | 'done' | 'audit' | 'review'

export interface ActionableInboxItemLike {
  kind: 'approval' | 'input_request' | 'audit'
  category: 'approval' | 'input_request' | 'auth_required' | 'audit'
  status?: string
  /** Auto-judge phase of an approval (`waiting` / `due` / `auto-approved` …). */
  autoPhase?: string | null
}

/** LinX is waiting to approve it ("LinX 会自动通过"): not the person's to-do. */
export function isAutoWaitingInboxItem(item: ActionableInboxItemLike): boolean {
  return item.kind === 'approval' && item.status === 'pending' && (item.autoPhase === 'waiting' || item.autoPhase === 'due')
}

/** Approved by LinX on the person's behalf ("LinX 自动通过的"). */
export function isAutoApprovedInboxItem(item: ActionableInboxItemLike): boolean {
  return item.kind === 'approval' && item.autoPhase === 'auto-approved'
}

export function isActionableInboxItem(item: ActionableInboxItemLike): boolean {
  if (isAutoWaitingInboxItem(item)) return false
  if (item.category === 'auth_required') {
    return item.status !== 'resolved'
  }
  if (item.kind === 'input_request') {
    return item.status === 'pending' || item.status === 'handling'
  }
  return item.kind === 'approval' && item.status === 'pending'
}

export function filterInboxItems<T extends ActionableInboxItemLike>(items: T[], filter: InboxFilter): T[] {
  switch (filter) {
    case 'pending':
      return items.filter(isActionableInboxItem)
    case 'done':
      // Login requests are stored as audit rows, but once handled they are still "done" work.
      return items.filter((item) => (
        (item.kind !== 'audit' || item.category === 'auth_required')
        && !isActionableInboxItem(item)
        && !isAutoWaitingInboxItem(item)
      ))
    case 'review':
      return items.filter(isAutoApprovedInboxItem)
    case 'audit':
      return items.filter((item) => item.kind === 'audit')
    default:
      return items
  }
}

export function countActionableInboxItems<T extends ActionableInboxItemLike>(items: T[]): number {
  return items.filter(isActionableInboxItem).length
}

export function countAutoWaitingInboxItems<T extends ActionableInboxItemLike>(items: T[]): number {
  return items.filter(isAutoWaitingInboxItem).length
}
