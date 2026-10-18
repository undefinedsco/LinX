import type { InboxItem } from './inbox-item'
import { isSecretInputRequest } from './input-request'
import { isActionableInboxItem } from './utils'

/**
 * A request shown as a card inside the conversation that raised it. The same
 * request looks the same in the inbox; there is never an "always allow".
 */
export type DecisionKind = 'approval' | 'input' | 'login'

export type DecisionOutcome = 'approved' | 'rejected' | 'answered' | 'logged-in' | 'expired' | 'withdrawn'

export function decisionKind(item: Pick<InboxItem, 'kind' | 'category'>): DecisionKind | null {
  if (item.category === 'auth_required') return 'login'
  if (item.kind === 'input_request') return 'input'
  if (item.kind === 'approval') return 'approval'
  return null
}

export function decisionOutcome(item: InboxItem): DecisionOutcome | null {
  if (isActionableInboxItem(item)) return null
  const kind = decisionKind(item)
  if (kind === 'login') return item.status === 'resolved' ? 'logged-in' : null
  if (kind === 'approval') {
    const status = item.approval?.status ?? item.status
    if (status === 'approved') return 'approved'
    if (status === 'rejected') return 'rejected'
    if (status === 'expired') return 'expired'
    if (status === 'cancelled') return 'withdrawn'
    return null
  }
  if (kind === 'input') {
    const status = item.inputRequest?.status ?? item.status
    if (status === 'resolved') return 'answered'
    if (status === 'expired') return 'expired'
    if (status === 'cancelled') return 'withdrawn'
  }
  return null
}

function resolvedAt(item: InboxItem): string | null {
  const value = item.approval?.resolvedAt ?? item.inputRequest?.resolvedAt ?? null
  if (!value) return null
  const date = new Date(value as unknown as string)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/** One line that says what happened, and whether it happened here or elsewhere. */
export function describeDecisionOutcome(item: InboxItem, outcome: DecisionOutcome, resolvedHere: boolean): string {
  const time = resolvedAt(item)
  const at = time ? ` · ${time}` : ''
  const where = resolvedHere ? '' : '已在收件箱'
  switch (outcome) {
    case 'approved':
      return resolvedHere ? `已批准${at}` : `${where}批准${at}`
    case 'rejected':
      return resolvedHere ? `已拒绝${at}` : `${where}拒绝${at}`
    case 'answered': {
      const secret = isSecretInputRequest(item.inputRequest?.requestKind)
      const answer = secret ? null : item.inputRequest?.response?.trim()
      if (!resolvedHere) return `${where}回答${at}`
      return answer ? `${answer} · 已回答` : '已回答（内容不显示）'
    }
    case 'logged-in':
      return '已登录，正在继续'
    case 'expired':
      return '这个请求已过期，没有执行'
    case 'withdrawn':
      return '助手撤回了这个请求'
  }
}
