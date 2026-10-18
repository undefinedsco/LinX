/**
 * W7b: a request can stop being answerable while it is open.
 * - 过期: it has an `expiresAt` that has passed and nobody decided;
 * - 别处已处理: it was pending when opened, and a re-read shows someone (the
 *   conversation, another device) already decided it.
 * Offline is the browser's own network signal (see `useBrowserOnline`).
 */
export interface RequestStateInput {
  status?: string | null
  expiresAt?: string | Date | null
  decisionRole?: string | null
  decisionBy?: string | null
  resolvedAt?: string | Date | null
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

export function isPendingRequestStatus(status: string | null | undefined): boolean {
  return !status || status === 'pending' || status === 'handling'
}

/** Pending but past `expiresAt`: the assistant did not go ahead. */
export function isRequestExpired(request: RequestStateInput | null | undefined, now: Date): boolean {
  if (!request || !isPendingRequestStatus(request.status)) return false
  const expiresAt = toDate(request.expiresAt)
  return expiresAt !== null && expiresAt.getTime() <= now.getTime()
}

export interface HandledElsewhere {
  /** "已在会话里批准" / "已在别处拒绝" */
  title: string
  /** "10:43" */
  timeLabel: string | null
}

function formatClock(date: Date | null): string | null {
  return date ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : null
}

/**
 * What to tell a person looking at a request that was decided somewhere else.
 * Null while it is still pending.
 */
export function describeHandledElsewhere(request: RequestStateInput | null | undefined): HandledElsewhere | null {
  if (!request || isPendingRequestStatus(request.status)) return null
  const verb = request.status === 'approved' || request.status === 'resolved'
    ? '批准'
    : request.status === 'rejected' ? '拒绝' : '处理'
  const where = request.decisionRole === 'secretary' ? '由 LinX' : '在会话里'
  return {
    title: where === '由 LinX' ? `已由 LinX ${verb}` : `已在会话里${verb}`,
    timeLabel: formatClock(toDate(request.resolvedAt)),
  }
}
