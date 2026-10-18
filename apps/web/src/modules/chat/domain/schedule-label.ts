/**
 * W6 持续任务: turns a Schedule resource into plain words (“每周一 9:00”) and
 * back into a cron expression for the small “重复” editor.
 */

export interface ScheduleLike {
  status?: string | null
  scheduleKind?: string | null
  cron?: string | null
  intervalSeconds?: number | null
  timezone?: string | null
  startsAt?: Date | string | null
  nextRunAt?: Date | string | null
  lastRunAt?: Date | string | null
}

export interface ScheduleRepeatLabel {
  /** e.g. 每周一 9:00 */
  label: string
  /** e.g. 每周一 — fits the topic switcher's status column. */
  short: string
  supported: boolean
}

export type ScheduleFrequency = 'daily' | 'weekdays' | 'weekly' | 'monthly'

export interface ScheduleRepeatDraft {
  frequency: ScheduleFrequency
  /** 0 = 周日 … 6 = 周六 */
  weekday: number
  dayOfMonth: number
  hour: number
  minute: number
}

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']
const UNSUPPORTED: ScheduleRepeatLabel = { label: '这种重复方式还不支持', short: '定时', supported: false }

function clock(hour: number, minute: number): string {
  return `${hour}:${String(minute).padStart(2, '0')}`
}

function toInt(field: string, min: number, max: number): number | null {
  if (!/^\d+$/u.test(field)) return null
  const value = Number(field)
  return value >= min && value <= max ? value : null
}

function weekdayName(day: number): string {
  return WEEKDAY_NAMES[day % 7] ?? ''
}

export function parseRepeatDraft(cron?: string | null): ScheduleRepeatDraft | null {
  const fields = cron?.trim().split(/\s+/u) ?? []
  if (fields.length !== 5) return null
  const [minuteField, hourField, dayField, monthField, weekdayField] = fields
  const minute = toInt(minuteField, 0, 59)
  const hour = toInt(hourField, 0, 23)
  if (minute === null || hour === null || monthField !== '*') return null

  if (dayField === '*' && weekdayField === '*') {
    return { frequency: 'daily', weekday: 1, dayOfMonth: 1, hour, minute }
  }
  if (dayField === '*' && weekdayField === '1-5') {
    return { frequency: 'weekdays', weekday: 1, dayOfMonth: 1, hour, minute }
  }
  if (dayField === '*') {
    const weekday = toInt(weekdayField, 0, 7)
    return weekday === null ? null : { frequency: 'weekly', weekday: weekday % 7, dayOfMonth: 1, hour, minute }
  }
  if (weekdayField === '*') {
    const dayOfMonth = toInt(dayField, 1, 31)
    return dayOfMonth === null ? null : { frequency: 'monthly', weekday: 1, dayOfMonth, hour, minute }
  }
  return null
}

export function buildCron(draft: ScheduleRepeatDraft): string {
  const minute = Math.min(59, Math.max(0, Math.round(draft.minute)))
  const hour = Math.min(23, Math.max(0, Math.round(draft.hour)))
  switch (draft.frequency) {
    case 'daily': return `${minute} ${hour} * * *`
    case 'weekdays': return `${minute} ${hour} * * 1-5`
    case 'weekly': return `${minute} ${hour} * * ${((draft.weekday % 7) + 7) % 7}`
    case 'monthly': return `${minute} ${hour} ${Math.min(31, Math.max(1, Math.round(draft.dayOfMonth)))} * *`
  }
}

function describeDraft(draft: ScheduleRepeatDraft): ScheduleRepeatLabel {
  const time = clock(draft.hour, draft.minute)
  switch (draft.frequency) {
    case 'daily': return { label: `每天 ${time}`, short: '每天', supported: true }
    case 'weekdays': return { label: `工作日 ${time}`, short: '工作日', supported: true }
    case 'weekly': return { label: `每周${weekdayName(draft.weekday)} ${time}`, short: `每周${weekdayName(draft.weekday)}`, supported: true }
    case 'monthly': return { label: `每月 ${draft.dayOfMonth} 日 ${time}`, short: `每月 ${draft.dayOfMonth} 日`, supported: true }
  }
}

function describeInterval(seconds: number): ScheduleRepeatLabel {
  if (seconds % 86_400 === 0) {
    const days = seconds / 86_400
    return days === 1 ? { label: '每天', short: '每天', supported: true } : { label: `每 ${days} 天`, short: `每 ${days} 天`, supported: true }
  }
  if (seconds % 3_600 === 0) {
    const hours = seconds / 3_600
    return { label: `每 ${hours} 小时`, short: `每 ${hours} 小时`, supported: true }
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60
    return { label: `每 ${minutes} 分钟`, short: `每 ${minutes} 分钟`, supported: true }
  }
  return UNSUPPORTED
}

export function describeScheduleRepeat(schedule: ScheduleLike | null | undefined, now: number = Date.now()): ScheduleRepeatLabel | null {
  if (!schedule) return null
  const kind = schedule.scheduleKind ?? (schedule.cron ? 'cron' : schedule.intervalSeconds ? 'interval' : 'once')
  if (kind === 'cron') {
    const draft = parseRepeatDraft(schedule.cron)
    return draft ? describeDraft(draft) : UNSUPPORTED
  }
  if (kind === 'interval') {
    const seconds = Number(schedule.intervalSeconds)
    return Number.isFinite(seconds) && seconds > 0 ? describeInterval(seconds) : UNSUPPORTED
  }
  const moment = formatScheduleMoment(schedule.nextRunAt ?? schedule.startsAt, now)
  return moment ? { label: `只运行一次 · ${moment}`, short: '一次', supported: true } : UNSUPPORTED
}

/** 今天 9:00 / 明天 9:00 / 10月20日 9:00 */
export function formatScheduleMoment(value: Date | string | null | undefined, now: number = Date.now()): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86_400_000)
  const time = clock(date.getHours(), date.getMinutes())
  if (diffDays === 0) return `今天 ${time}`
  if (diffDays === 1) return `明天 ${time}`
  if (diffDays === -1) return `昨天 ${time}`
  const sameYear = date.getFullYear() === today.getFullYear()
  return `${sameYear ? '' : `${date.getFullYear()}年`}${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}

export function isScheduleAutoRunOn(schedule: ScheduleLike | null | undefined): boolean {
  return (schedule?.status ?? 'active') === 'active'
}

export function describeTimezone(timezone?: string | null): string {
  if (!timezone || timezone === 'Asia/Shanghai' || timezone === 'Asia/Chongqing') return '北京时间'
  return timezone
}

export const SCHEDULE_WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map((day) => ({ value: day, label: `周${weekdayName(day)}` }))

const RUN_STATUS_LABELS: Record<string, string> = {
  queued: '等待开始',
  running: '运行中',
  waiting_input: '等你',
  waiting_runner: '等本机空间',
  completed: '完成',
  failed: '没成功',
  cancelled: '已停止',
}

export function describeRunStatus(status?: string | null): string {
  return RUN_STATUS_LABELS[status ?? ''] ?? '状态未知'
}
