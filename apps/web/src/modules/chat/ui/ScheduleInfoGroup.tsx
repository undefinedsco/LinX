import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useToast } from '@/components/ui/use-toast'
import {
  SCHEDULE_WEEKDAY_OPTIONS,
  buildCron,
  describeRunStatus,
  describeScheduleRepeat,
  describeTimezone,
  formatScheduleMoment,
  isScheduleAutoRunOn,
  parseRepeatDraft,
  type ScheduleFrequency,
  type ScheduleRepeatDraft,
} from '../domain/schedule-label'
import type { ThreadScheduleState } from '../features/schedule/useThreadSchedule'
import { InfoGroup, InfoRow, InfoSwitchRow } from './ChatInfoParts'

const FREQUENCIES: Array<{ value: ScheduleFrequency; label: string }> = [
  { value: 'daily', label: '每天' },
  { value: 'weekdays', label: '工作日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
]

const DEFAULT_DRAFT: ScheduleRepeatDraft = { frequency: 'weekly', weekday: 1, dayOfMonth: 1, hour: 9, minute: 0 }

function RepeatEditor({ cron, onSave }: { cron?: string | null; onSave: (cron: string) => Promise<void> }) {
  const [draft, setDraft] = useState<ScheduleRepeatDraft>(parseRepeatDraft(cron) ?? DEFAULT_DRAFT)
  const [saving, setSaving] = useState(false)
  const time = `${String(draft.hour).padStart(2, '0')}:${String(draft.minute).padStart(2, '0')}`
  const fieldClass = 'h-8 w-full rounded-md border border-input bg-background px-2 text-sm'
  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-xs text-muted-foreground">
        重复
        <select
          aria-label="重复方式"
          className={fieldClass}
          value={draft.frequency}
          onChange={(event) => setDraft({ ...draft, frequency: event.target.value as ScheduleFrequency })}
        >
          {FREQUENCIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      {draft.frequency === 'weekly' ? (
        <select
          aria-label="星期几"
          className={fieldClass}
          value={draft.weekday}
          onChange={(event) => setDraft({ ...draft, weekday: Number(event.target.value) })}
        >
          {SCHEDULE_WEEKDAY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      ) : null}
      {draft.frequency === 'monthly' ? (
        <select
          aria-label="几号"
          className={fieldClass}
          value={draft.dayOfMonth}
          onChange={(event) => setDraft({ ...draft, dayOfMonth: Number(event.target.value) })}
        >
          {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day} 号</option>)}
        </select>
      ) : null}
      <input
        type="time"
        aria-label="几点"
        className={fieldClass}
        value={time}
        onChange={(event) => {
          const [hour, minute] = event.target.value.split(':').map(Number)
          if (Number.isFinite(hour) && Number.isFinite(minute)) setDraft({ ...draft, hour, minute })
        }}
      />
      <Button
        size="sm"
        className="w-full"
        disabled={saving}
        onClick={async () => {
          setSaving(true)
          try { await onSave(buildCron(draft)) } finally { setSaving(false) }
        }}
      >
        {saving ? '保存中…' : '保存'}
      </Button>
    </div>
  )
}

/** W6: 重复 / 下一次 / 以后自动运行 / 最近运行 for a recurring topic. */
export function ScheduleInfoGroup({ state }: { state: ThreadScheduleState }) {
  const { schedule, runs } = state
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  if (!schedule) return null

  const repeat = describeScheduleRepeat(schedule)
  const next = formatScheduleMoment(schedule.nextRunAt)
  const fail = () => toast({ description: '没能保存，请稍后再试。', variant: 'destructive' })

  return (
    <>
      <InfoGroup title="计划">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="flex w-full items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5 text-left text-sm hover:bg-muted/40">
              <span>重复</span>
              <span className="text-xs text-muted-foreground">{repeat?.label ?? '未设置'} ›</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <RepeatEditor
              cron={schedule.cron}
              onSave={async (cron) => {
                try { await state.setRepeat(cron); setOpen(false) } catch { fail() }
              }}
            />
          </PopoverContent>
        </Popover>
        <InfoRow label="下一次" value={isScheduleAutoRunOn(schedule) ? (next ?? '—') : '已关掉'} />
        <InfoSwitchRow
          label="以后自动运行"
          checked={isScheduleAutoRunOn(schedule)}
          hint="关掉只影响以后，不会停止正在运行的这次。"
          last
          onCheckedChange={(on) => { state.setAutoRun(on).catch(fail) }}
        />
      </InfoGroup>
      <p className="px-1 text-xs text-muted-foreground">时间按{describeTimezone(schedule.timezone)}</p>
      {runs.length > 0 ? (
        <InfoGroup title="最近运行">
          {runs.map((run, index) => (
            <InfoRow
              key={run.id}
              label={formatScheduleMoment(run.at) ?? '时间未知'}
              value={describeRunStatus(run.status)}
              last={index === runs.length - 1}
            />
          ))}
        </InfoGroup>
      ) : null}
    </>
  )
}
