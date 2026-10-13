import { useMemo, useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import { useChatStore } from '../../store'
import { useChatMutations, useThreadList } from '../../collections'
import { formatListTime } from '../../domain/list-time'
import { useTopicStatuses } from './useTopicStatuses'

/**
 * “# 话题 ▾” beside the assistant's name: switch topic, search topics, see which
 * one is waiting on you, start a new one. Works at every window width.
 */
export function ThreadSwitcher({ chatId }: { chatId: string }) {
  const selectedThreadId = useChatStore((state) => state.selectedThreadId)
  const selectThread = useChatStore((state) => state.selectThread)
  const { data: rawThreads } = useThreadList(chatId, { enabled: !!chatId })
  const statuses = useTopicStatuses()
  const mutations = useChatMutations()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const threads = useMemo(
    () => (rawThreads ?? [])
      .filter((thread) => typeof thread.id === 'string' && thread.id.length > 0)
      .map((thread) => ({
        id: thread.id as string,
        title: thread.title?.trim() || '新话题',
        time: formatListTime(thread.updatedAt ?? thread.createdAt),
        status: statuses.byThread.get(thread.id as string) ?? null,
      })),
    [rawThreads, statuses.byThread],
  )
  const current = threads.find((thread) => thread.id === selectedThreadId) ?? null

  if (threads.length === 0) return null

  const handleCreate = async () => {
    setIsCreating(true)
    try {
      const created = await mutations.createThread.mutateAsync({ chatId, title: '新话题' })
      if (created?.id) selectThread(created.id)
      setOpen(false)
    } catch (error) {
      toast({ title: '没有新建成功', description: formatLoginErrorForUser(error, '请稍后再试。') })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`切换话题，当前：${current?.title ?? '未选择'}`}
          className="ml-1 flex min-w-0 max-w-[240px] items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted"
        >
          <span className="truncate"># {current?.title ?? '选择话题'}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="搜索话题" />
          <CommandList>
            <CommandEmpty>没有找到话题</CommandEmpty>
            <CommandGroup>
              {threads.map((thread) => (
                <CommandItem
                  key={thread.id}
                  value={`${thread.title} ${thread.id}`}
                  onSelect={() => { selectThread(thread.id); setOpen(false) }}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4 shrink-0', thread.id === selectedThreadId ? 'opacity-100' : 'opacity-0')}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate"># {thread.title}</span>
                  {thread.status ? (
                    <span className={cn('ml-2 shrink-0 text-xs', thread.status.needsYou ? 'font-medium text-primary' : 'text-muted-foreground')}>
                      {thread.status.label}
                    </span>
                  ) : thread.time ? (
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">{thread.time}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem value="__new-topic__" disabled={isCreating} onSelect={() => { void handleCreate() }}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                新话题
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
