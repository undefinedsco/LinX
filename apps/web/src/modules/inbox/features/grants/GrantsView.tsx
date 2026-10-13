import { useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { useAutoJudgeActions, useGrantRows, useGrantUseCounts } from '../../data/auto-judge'
import { AUTO_JUDGE_WINDOW_CHOICES, useAutoJudgeSettings } from '../../app/auto-judge-settings'
import { describeGrantAction, formatAutoJudgeWindow, HIGH_IMPACT_LABEL, detectHighImpact } from '../../domain/auto-judge-view'
import type { AutoJudgeConfidence } from '@linx/agent-runtime/auto-judge'

/**
 * R6 K11 授权: what LinX may decide on your behalf, with revoke.
 * Shown in Files › <assistant> › 授权.
 */
export interface GrantsViewProps {
  /**
   * Assistant whose grants to show. Grants do not record which assistant they
   * were given to yet (shared model has no field), so all grants are shown.
   */
  agentId?: string
}

const CONFIDENCE_ROWS: Array<{ key: AutoJudgeConfidence; label: string }> = [
  { key: 'high', label: '把握高' },
  { key: 'medium', label: '把握中' },
  { key: 'low', label: '把握低' },
]

function formatDay(value: unknown): string {
  const date = new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) return ''
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return '今天'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function GrantsView(_props: GrantsViewProps) {
  const { data: grants } = useGrantRows()
  const counts = useGrantUseCounts()
  const { revokeGrant } = useAutoJudgeActions()
  const windows = useAutoJudgeSettings((state) => state.windows)
  const setWindow = useAutoJudgeSettings((state) => state.setWindow)
  const rows = useMemo(() => grants.filter((grant) => grant.effect !== 'deny'), [grants])

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <header>
          <h2 className="text-base font-semibold text-foreground">授权</h2>
          <p className="mt-1 text-sm text-muted-foreground">这些事 LinX 自己判断；其余的一直等你</p>
        </header>

        <section aria-label="交给 LinX 判断的">
          <h3 className="pb-2 text-xs text-muted-foreground">交给 LinX 判断的</h3>
          {rows.length === 0 ? (
            <p className="rounded-lg border border-border px-4 py-6 text-center text-sm text-muted-foreground">
              还没有授权过。批准一件事时勾上“以后这类交给 LinX 判断”就会出现在这里。
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-normal text-muted-foreground">
                  <th className="py-2 pr-3 font-normal">哪类事</th>
                  <th className="py-2 pr-3 font-normal">拿不准时</th>
                  <th className="py-2 pr-3 font-normal">谁授权的</th>
                  <th className="py-2 pr-3 font-normal">用过</th>
                  <th className="py-2 font-normal"><span className="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((grant) => {
                  const impact = detectHighImpact({ action: grant.action, toolName: grant.title })
                  return (
                    <tr key={grant.id} className="border-b border-border">
                      <td className="py-2.5 pr-3 text-foreground">
                        {describeGrantAction(grant)}
                        {impact ? <span className="ml-2 text-xs text-muted-foreground">{HIGH_IMPACT_LABEL[impact]}</span> : null}
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">交给你</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">你 · {formatDay(grant.createdAt)}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{counts.get(grant.id ?? '') ?? 0} 次</td>
                      <td className="py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          disabled={revokeGrant.isPending}
                          onClick={() => revokeGrant.mutate(grant)}
                        >
                          收回
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        <section aria-label="自动通过前等多久">
          <h3 className="pb-2 text-xs text-muted-foreground">自动通过前等多久（按 LinX 的把握）</h3>
          <div className="overflow-hidden rounded-lg border border-border">
            {CONFIDENCE_ROWS.map(({ key, label }) => (
              <div key={key} className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 last:border-b-0">
                <label htmlFor={`auto-judge-window-${key}`} className="text-sm text-foreground">{label}</label>
                <select
                  id={`auto-judge-window-${key}`}
                  value={windows[key] === null ? 'never' : String(windows[key])}
                  onChange={(event) => setWindow(key, event.target.value === 'never' ? null : Number(event.target.value))}
                  className="h-7 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {AUTO_JUDGE_WINDOW_CHOICES[key].map((ms) => (
                    <option key={ms === null ? 'never' : ms} value={ms === null ? 'never' : String(ms)}>
                      {formatAutoJudgeWindow(ms)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            等的时候在收件箱“LinX 会自动通过”里能看到，可以提前批准、拒绝，或改成你来判断。自动通过的都能在收件箱复查。
          </p>
        </section>

        <section aria-label="一直等你判断的">
          <h3 className="pb-2 text-xs text-muted-foreground">一直等你判断的</h3>
          <div className="overflow-hidden rounded-lg border border-border text-sm">
            <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3">
              <span className="text-foreground">没授权过的事</span>
              <span className="text-xs text-muted-foreground">批准时可以勾“以后交给 LinX”</span>
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3 px-3">
              <span className="text-foreground">花钱、删除、对外发送</span>
              <span className="text-xs text-muted-foreground">授权前会再确认一次</span>
            </div>
          </div>
        </section>
      </div>
    </ScrollArea>
  )
}
