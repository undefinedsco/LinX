import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import { cn } from '@/lib/utils'
import type { MyAgent } from '../data/agents'
import { useSaveAgentMethod } from '../data/agents'
import {
  diffMethod,
  hasMethodChanged,
  parseMethodSections,
  serializeMethodSections,
  type MethodSections,
} from '../domain/method'

/**
 * One place to edit how an assistant works. Saving first shows exactly what
 * changed and where it applies; it never grants the assistant new access.
 */
export function MethodEditor({ agent, inDialog = false }: { agent: MyAgent; inDialog?: boolean }) {
  const [sections, setSections] = useState<MethodSections>(() => parseMethodSections(agent.instructions))
  const [showNotes, setShowNotes] = useState(() => Boolean(parseMethodSections(agent.instructions).notes))
  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const save = useSaveAgentMethod()

  useEffect(() => {
    const parsed = parseMethodSections(agent.instructions)
    setSections(parsed)
    setShowNotes(Boolean(parsed.notes))
  }, [agent.id, agent.instructions])

  // Compare in the structured form, so reading an older method does not count as a change.
  const saved = useMemo(() => serializeMethodSections(parseMethodSections(agent.instructions)), [agent.instructions])
  const draft = serializeMethodSections(sections)
  const changed = hasMethodChanged(saved, draft)
  const changes = useMemo(
    () => (isReviewOpen ? diffMethod(saved, draft) : []),
    [draft, isReviewOpen, saved],
  )
  const update = (patch: Partial<MethodSections>) => setSections((current) => ({ ...current, ...patch }))
  const discard = () => setSections(parseMethodSections(agent.instructions))

  const handleSave = async () => {
    try {
      await save.mutateAsync({ agentId: agent.id, instructions: draft })
      setIsReviewOpen(false)
    } catch {
      // The dialog stays open with the error; the draft is kept.
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* In the shell dialog the close button sits top-right; keep the actions clear of it. */}
      <div className={cn('flex h-12 shrink-0 items-center gap-3 border-b border-border px-5', inDialog && 'pr-14')}>
        <h1 className="text-sm font-semibold">{inDialog ? `${agent.name} · 做事的方法` : agent.name}</h1>
        <span className="text-xs text-muted-foreground">
          {agent.isDefault ? '默认方法 · 这个助手的所有会话都会用' : '这个助手的所有会话都会用'}
        </span>
        <span className="flex-1" />
        {changed ? (
          <>
            <span className="text-xs text-muted-foreground">有改动</span>
            <Button variant="outline" size="sm" onClick={discard}>放弃</Button>
            <Button size="sm" onClick={() => setIsReviewOpen(true)}>保存…</Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">已保存</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-6 py-6">
          <p className="text-xs text-muted-foreground">助手每次做事都会按这里来。没写的部分按通用方式做。</p>

          <MethodField label="目标" htmlFor="my-ai-method-goal">
            <Textarea
              id="my-ai-method-goal"
              value={sections.goal}
              onChange={(event) => update({ goal: event.target.value })}
              placeholder="例如：帮书店两个人把活动和日常运营做好，省时间、少维护。"
              className="min-h-[64px] bg-card text-sm leading-6"
            />
          </MethodField>

          <MethodField label="判断标准">
            <div className="space-y-2">
              {sections.criteria.map((criterion, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    aria-label={`判断标准 ${index + 1}`}
                    value={criterion}
                    onChange={(event) => update({
                      criteria: sections.criteria.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                    })}
                    className="bg-card text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label={`删除判断标准 ${index + 1}`}
                    onClick={() => update({ criteria: sections.criteria.filter((_, itemIndex) => itemIndex !== index) })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-primary"
                onClick={() => update({ criteria: [...sections.criteria, ''] })}
              >
                <Plus className="mr-1 h-4 w-4" />
                添加一条
              </Button>
            </div>
          </MethodField>

          <MethodField label="例外" htmlFor="my-ai-method-exceptions">
            <Textarea
              id="my-ai-method-exceptions"
              value={sections.exceptions}
              onChange={(event) => update({ exceptions: event.target.value })}
              placeholder="例如：活动前一天的紧急变化，可以直接在群里通知，不用等我。"
              className="min-h-[64px] bg-card text-sm leading-6"
            />
          </MethodField>

          {showNotes ? (
            <MethodField label="补充说明" htmlFor="my-ai-method-notes">
              <Textarea
                id="my-ai-method-notes"
                value={sections.notes}
                onChange={(event) => update({ notes: event.target.value })}
                className="min-h-[96px] bg-card text-sm leading-6"
              />
            </MethodField>
          ) : (
            <Button variant="ghost" size="sm" className="h-8 w-fit px-2 text-muted-foreground" onClick={() => setShowNotes(true)}>
              补充说明（可选）
            </Button>
          )}

          <p className="text-xs text-muted-foreground">
            改方法不会给助手更多权限。能看的资料、能连的服务另外设置；对外发送、花钱、删除一定会先问你，这里关不掉。
          </p>
        </div>
      </div>

      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>保存“{agent.name}”的方法？</DialogTitle>
            <DialogDescription>以后的工作按新的方法；正在进行的那一次不受影响。</DialogDescription>
          </DialogHeader>
          <div
            aria-label="改动"
            className="max-h-[280px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-sm leading-6"
          >
            {changes.map((part, index) => (
              <span
                key={index}
                className={cn(
                  part.kind === 'added' && 'rounded-sm bg-primary/15 font-medium text-foreground',
                  part.kind === 'removed' && 'text-muted-foreground line-through',
                )}
              >
                {part.kind === 'added' ? <span className="sr-only">新增：</span> : null}
                {part.kind === 'removed' ? <span className="sr-only">删除：</span> : null}
                {part.value}
              </span>
            ))}
          </div>
          {save.error ? (
            <p className="text-xs text-destructive">{formatLoginErrorForUser(save.error, '没保存成功，改动还在。')}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReviewOpen(false)}>再改改</Button>
            <Button onClick={() => void handleSave()} disabled={save.isPending}>
              {save.isPending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MethodField({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-sm font-semibold">{label}</label>
      ) : (
        <p className="text-sm font-semibold">{label}</p>
      )}
      {children}
    </div>
  )
}
