/**
 * ChatListPane - S1 / S0b / S1b / S1c: the conversation list.
 *
 * One row per identity (assistant, person, group), flat 64px rows, 标星 first.
 * Search covers conversations, topics, contacts and file names; ⌘K focuses it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Check, ListFilter, Loader2, Plus, Search, ShieldAlert, User, Users, WifiOff, X } from 'lucide-react'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { ContactPickerDialog } from '@/modules/contacts'
import { useBrowserOnline } from '@/lib/use-browser-online'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useChatStore } from '../store'
import { chatOps, useChatInit, useChatMutations } from '../collections'
import { deleteChatCopy } from '../domain/chat-list-model'
import { useChatListEntries } from '../features/list/useChatListEntries'
import { GlobalSearchResults } from '../features/search/GlobalSearchResults'
import { ChatListRow } from '../ui/ChatListRow'
import { AddChatDialog } from './AddChatDialog'

type ListFilter = 'all' | 'unread'

export interface ChatListPaneProps extends MicroAppPaneProps {}

export function ChatListPane(_props: ChatListPaneProps) {
  useChatInit()
  const { toast } = useToast()
  const search = useChatStore((state) => state.search)
  const setSearch = useChatStore((state) => state.setSearch)
  const searchRequest = useChatStore((state) => state.searchRequest)
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const selectChat = useChatStore((state) => state.selectChat)
  const openAddDialog = useChatStore((state) => state.openAddDialog)
  const [filter, setFilter] = useState<ListFilter>('all')
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const [isContactPickerOpen, setIsContactPickerOpen] = useState(false)
  const optionRefs = useRef<Array<HTMLDivElement | null>>([])
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const lastSearchRequest = useRef(searchRequest)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 120)
    return () => window.clearTimeout(timer)
  }, [search])

  // ⌘K (wired by the shell) asks the list column to start searching.
  useEffect(() => {
    if (searchRequest === lastSearchRequest.current) return
    lastSearchRequest.current = searchRequest
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }, [searchRequest])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const isOnline = useBrowserOnline()
  const mutations = useChatMutations()
  const { entries, isLoading, isError, isForbidden, refetch } = useChatListEntries()

  const visible = useMemo(
    () => (filter === 'unread' ? entries.filter((entry) => entry.unreadCount > 0) : entries),
    [entries, filter],
  )
  const selectedIndex = visible.findIndex((entry) => entry.id === selectedChatId)

  const onItemKeyDown = useCallback((index: number, event: KeyboardEvent<HTMLDivElement>) => {
    let next: number
    if (event.key === 'ArrowDown') next = Math.min(index + 1, visible.length - 1)
    else if (event.key === 'ArrowUp') next = Math.max(index - 1, 0)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = visible.length - 1
    else return
    event.preventDefault()
    selectChat(visible[next].id)
    optionRefs.current[next]?.focus()
  }, [selectChat, visible])

  const updateFlag = useCallback(async (chatId: string, values: { starred?: boolean; muted?: boolean; unreadCount?: number }) => {
    try {
      await mutations.updateChat.mutateAsync({ id: chatId, ...values })
    } catch (error) {
      console.error('Update chat failed:', error)
      toast({ description: '没能保存，请稍后再试。', variant: 'destructive' })
    }
  }, [mutations.updateChat, toast])

  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const pendingRemove = pendingRemoveId ? entries.find((entry) => entry.id === pendingRemoveId) ?? null : null
  const pendingTopicCount = pendingRemoveId ? chatOps.getThreads(pendingRemoveId).length : 0

  const requestRemove = useCallback((chatId: string) => {
    const entry = entries.find((item) => item.id === chatId)
    if (!entry) return
    if (entry.isProtected) {
      toast({ description: 'LinX 助手不能删除。' })
      return
    }
    // Let the menu close and hand focus back before the dialog traps it.
    window.setTimeout(() => setPendingRemoveId(chatId), 0)
  }, [entries, toast])

  const confirmRemove = useCallback(async () => {
    const chatId = pendingRemoveId
    if (!chatId) return
    try {
      await mutations.deleteChat.mutateAsync(chatId)
      if (selectedChatId === chatId) selectChat(null)
      setPendingRemoveId(null)
    } catch (error) {
      console.error('Remove chat failed:', error)
      toast({ description: '没能删除这个会话，请稍后再试。', variant: 'destructive' })
    }
  }, [mutations.deleteChat, pendingRemoveId, selectChat, selectedChatId, toast])

  const removeCopy = pendingRemove
    ? pendingRemove.kind === 'group'
      ? { title: `退出“${pendingRemove.title}”？`, description: '退出后不再收到这个群的消息，群里的文件不受影响。' }
      : deleteChatCopy(pendingRemove, pendingTopicCount)
    : { title: '删除这个会话？', description: '聊天记录会被删除，不能恢复。' }

  const searching = debouncedSearch.trim().length > 0

  return (
    <div className="flex h-full flex-col bg-layout-list-item">
      <div data-testid="chat-list-header" className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-layout-list-header px-3">
        <div className="relative min-w-0 flex-1">
          <Search strokeWidth={1.5} className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') setSearch('') }}
            placeholder="搜索"
            aria-label="搜索"
            className="h-8 rounded-sm border-0 bg-muted/50 pl-8 pr-14 text-xs transition-colors hover:bg-muted/80 focus:bg-background focus-visible:ring-1"
          />
          {search ? (
            <button
              type="button"
              aria-label="清除搜索"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted-foreground/20"
            >
              <X strokeWidth={1.5} className="h-3 w-3 text-muted-foreground" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-background/70 px-1 text-[10px] text-muted-foreground">⌘K</kbd>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              title="筛选会话"
              aria-label="筛选会话"
              className={cn('h-8 w-8 shrink-0 rounded-sm', filter !== 'all' ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground hover:bg-muted/80')}
            >
              <ListFilter strokeWidth={1.5} className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-32">
            {([['all', '全部'], ['unread', '未读']] as const).map(([value, label]) => (
              <DropdownMenuItem key={value} onClick={() => setFilter(value)}>
                <Check strokeWidth={1.5} className={cn('mr-2 h-4 w-4', filter === value ? 'opacity-100' : 'opacity-0')} />
                <span>{label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" title="新建聊天" aria-label="新建聊天" className="h-8 w-8 shrink-0 rounded-sm bg-muted/50 hover:bg-muted/80">
              <Plus strokeWidth={1.5} className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setIsContactPickerOpen(true)}>
              <User strokeWidth={1.5} className="mr-2 h-4 w-4" />
              <span>找人聊天</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openAddDialog('group')}>
              <Users strokeWidth={1.5} className="mr-2 h-4 w-4" />
              <span>发起群聊</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!isOnline ? (
        <div role="status" className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/60 px-4 py-2 text-xs text-muted-foreground">
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          网络不可用，显示的是上次的内容
        </div>
      ) : isForbidden ? (
        <div role="status" className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/60 px-4 py-2 text-xs text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          没有权限读取你的会话，请到“我”里检查空间授权
        </div>
      ) : isError ? (
        <div role="status" className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/60 px-4 py-2 text-xs text-muted-foreground">
          会话列表没有更新成功
          <button type="button" className="text-primary hover:underline" onClick={refetch}>重试</button>
        </div>
      ) : null}

      {searching ? (
        <GlobalSearchResults query={debouncedSearch} />
      ) : (
        <ScrollArea className="flex-1">
          {isLoading && entries.length === 0 ? (
            <div className="flex animate-fade-in items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              正在加载...
            </div>
          ) : visible.length === 0 ? (
            <div className="animate-fade-in px-4 py-12 text-center text-sm text-muted-foreground">
              {filter === 'unread' ? '没有未读会话' : '还没有会话'}
            </div>
          ) : (
            <div role="listbox" aria-label="聊天" aria-orientation="vertical" className="animate-fade-in divide-y divide-border/30">
              {visible.map((entry, index) => {
                const tabbable = selectedChatId === entry.id || (selectedIndex < 0 && index === 0)
                return (
                  <ChatListRow
                    key={entry.id}
                    entry={entry}
                    isActive={selectedChatId === entry.id}
                    tabIndex={tabbable ? 0 : -1}
                    itemRef={(node) => { optionRefs.current[index] = node }}
                    onRovingKeyDown={(event) => onItemKeyDown(index, event)}
                    onOpen={() => selectChat(entry.id)}
                    onToggleStar={() => { void updateFlag(entry.id, { starred: !entry.starred }) }}
                    onMarkUnread={() => { void updateFlag(entry.id, { unreadCount: 1 }) }}
                    onToggleMute={() => { void updateFlag(entry.id, { muted: !entry.muted }) }}
                    onDelete={() => requestRemove(entry.id)}
                    onLeave={() => requestRemove(entry.id)}
                  />
                )
              })}
            </div>
          )}
        </ScrollArea>
      )}

      <AddChatDialog />
      <ContactPickerDialog
        open={isContactPickerOpen}
        onOpenChange={setIsContactPickerOpen}
        onChatReady={(chatId) => selectChat(chatId)}
        onAddFriend={() => openAddDialog('friend')}
      />
      <ConfirmDialog
        open={pendingRemoveId !== null}
        onOpenChange={(open) => { if (!open) setPendingRemoveId(null) }}
        title={removeCopy.title}
        description={removeCopy.description}
        confirmLabel={pendingRemove?.kind === 'group' ? '退出' : '删除'}
        destructive
        busy={mutations.deleteChat.isPending}
        onConfirm={() => { void confirmRemove() }}
      />
    </div>
  )
}

export default ChatListPane
