const DAY_MS = 24 * 60 * 60 * 1000

function toDate(value: unknown): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value as string)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDay(time: number): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** WeChat-style list time: clock time today, 昨天, weekday this week, otherwise the date. */
export function formatListTime(value?: unknown, now: number = Date.now()): string {
  const date = toDate(value)
  if (!date) return ''
  const today = startOfDay(now)
  const day = startOfDay(date.getTime())
  if (day === today) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  if (day === today - DAY_MS) return '昨天'
  if (now - date.getTime() < 7 * DAY_MS && day < today) {
    return date.toLocaleDateString('zh-CN', { weekday: 'short' })
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/** Sort key for list rows; unknown times sort last. */
export function listTimeValue(value?: unknown): number {
  return toDate(value)?.getTime() ?? 0
}
