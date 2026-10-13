export function nameFromUri(uri: string): string {
  try {
    const url = new URL(uri)
    const last = url.pathname.split('/').filter(Boolean).pop() ?? url.host
    return decodeURIComponent(last)
  } catch {
    return uri
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/u, '')} MB`
}

/** 文档 / 表格 / 图片 / PDF / … from what the Pod says the file is. */
export function fileKindLabel(contentType: string | null, name: string): string {
  const type = `${contentType ?? ''} ${name}`.toLowerCase()
  if (/pdf/u.test(type)) return 'PDF'
  if (/sheet|excel|csv|\.xlsx?\b/u.test(type)) return '表格'
  if (/image|\.(png|jpe?g|gif|webp)\b/u.test(type)) return '图片'
  if (/video|\.(mp4|mov)\b/u.test(type)) return '视频'
  if (/audio|\.(mp3|m4a|wav)\b/u.test(type)) return '音频'
  if (/markdown|text|word|\.docx?\b|\.md\b/u.test(type)) return '文档'
  return '文件'
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

function clock(hour: string, minute: string): string {
  return `${Number(hour)}:${twoDigits(Number(minute))}`
}

interface ScheduleLike {
  scheduleKind?: string | null
  cron?: string | null
  intervalSeconds?: number | null
  startsAt?: Date | string | null
  nextRunAt?: Date | string | null
}

function whenText(value: Date | string | null | undefined, now: Date): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const sameDay = date.toDateString() === now.toDateString()
  const day = sameDay ? '今天' : `${date.getMonth() + 1}月${date.getDate()}日`
  return `${day} ${clock(String(date.getHours()), String(date.getMinutes()))}`
}

/** "每周一 9:00" for the simple cron shapes people actually ask for. */
export function describeSchedule(schedule: ScheduleLike, now: Date): { repeat: string; next: string | null } {
  const next = whenText(schedule.nextRunAt ?? schedule.startsAt, now)
  if (schedule.scheduleKind === 'interval' && schedule.intervalSeconds) {
    const seconds = schedule.intervalSeconds
    const repeat = seconds % 3600 === 0 ? `每 ${seconds / 3600} 小时` : seconds % 60 === 0 ? `每 ${seconds / 60} 分钟` : `每 ${seconds} 秒`
    return { repeat, next }
  }
  if (schedule.scheduleKind === 'cron' && schedule.cron) {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.cron.trim().split(/\s+/u)
    if (/^\d+$/u.test(minute ?? '') && /^\d+$/u.test(hour ?? '') && dayOfMonth === '*' && month === '*') {
      if (dayOfWeek === '*') return { repeat: `每天 ${clock(hour, minute)}`, next }
      if (/^\d$/u.test(dayOfWeek ?? '')) return { repeat: `每周${WEEKDAYS[Number(dayOfWeek) % 7]} ${clock(hour, minute)}`, next }
    }
    if (/^\d+$/u.test(minute ?? '') && /^\d+$/u.test(hour ?? '') && /^\d+$/u.test(dayOfMonth ?? '') && month === '*' && dayOfWeek === '*') {
      return { repeat: `每月 ${dayOfMonth} 日 ${clock(hour, minute)}`, next }
    }
    return { repeat: '按计划重复', next }
  }
  return { repeat: next ? `${next} 运行一次` : '运行一次', next: null }
}
