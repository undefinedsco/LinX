import { useCallback, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Bot, Loader2, Plus, Search, User, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { ContactEntry, ContactSection, UnifiedContact } from '../domain/types'
import { ContactAvatar } from './ContactAvatar'

export interface ContactListProps {
  search: string
  onSearchChange: (value: string) => void
  selectedId: string | null
  entry: ContactEntry | null
  sections: ContactSection[]
  letters: string[]
  groupCount: number
  isLoading: boolean
  error: string | null
  onRetry: () => void
  onSelect: (id: string) => void
  onOpenEntry: (entry: ContactEntry) => void
  onCreate: (type: 'agent' | 'friend') => void
  selectedIndex: number
  onItemKeyDown: (index: number, event: KeyboardEvent<HTMLButtonElement>) => void
  registerItemRef: (index: number, node: HTMLButtonElement | null) => void
}

const ROW_CLASS = 'group relative flex h-14 w-full cursor-pointer select-none items-center gap-2.5 px-3 text-left transition-colors'
const SELECTED_CLASS = 'bg-accent text-accent-foreground shadow-[inset_2px_0_0_hsl(var(--primary))]'

function RowSeparator() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 left-[58px] right-0 h-px bg-border/70"
    />
  )
}

function EntryRow({
  icon,
  label,
  trailing,
  selected,
  onClick,
}: {
  icon: ReactNode
  label: string
  trailing?: ReactNode
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onClick}
      className={cn(ROW_CLASS, selected ? SELECTED_CLASS : 'hover:bg-muted/50')}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
        {icon}
      </span>
      <span className="flex-1 truncate text-sm">{label}</span>
      {trailing}
      <RowSeparator />
    </button>
  )
}

function ContactItem({
  contact,
  selected,
  onSelect,
  tabIndex,
  itemRef,
  onKeyDown,
}: {
  contact: UnifiedContact
  selected: boolean
  onSelect: (id: string) => void
  tabIndex: number
  itemRef: (node: HTMLButtonElement | null) => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      tabIndex={tabIndex}
      ref={itemRef}
      onKeyDown={onKeyDown}
      onClick={() => onSelect(contact.id)}
      className={cn(ROW_CLASS, selected ? SELECTED_CLASS : 'hover:bg-muted/50')}
    >
      {contact.isGroup ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
          <Users className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : (
        <ContactAvatar
          name={contact.displayName}
          src={contact.displayAvatar}
          isAssistant={contact.sourceType === 'agent'}
        />
      )}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-sm">
          {contact.displayName}
          {contact.sourceType === 'wechat' && (
            <span className="ml-0.5 text-[10px] font-normal text-muted-foreground/60">@wechat</span>
          )}
        </span>
      </span>
      <RowSeparator />
    </button>
  )
}

export function ContactList({
  search,
  onSearchChange,
  selectedId,
  entry,
  sections,
  letters,
  groupCount,
  isLoading,
  error,
  onRetry,
  onSelect,
  onOpenEntry,
  onCreate,
  selectedIndex,
  onItemKeyDown,
  registerItemRef,
}: ContactListProps) {
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const scrollToLetter = useCallback((letter: string) => {
    sectionRefs.current.get(letter)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])
  const openCreateAfterMenuClose = useCallback((type: 'agent' | 'friend') => {
    window.setTimeout(() => onCreate(type), 0)
  }, [onCreate])
  const searching = search.trim().length > 0

  let flatIndex = 0
  return (
    <div className="relative flex h-full flex-col bg-layout-list-item">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索联系人"
            className="h-7 rounded-sm border-transparent bg-muted/30 pl-8 text-xs focus-visible:ring-1"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="添加朋友、创建助手" size="icon" variant="ghost" className="h-7 w-7 rounded-sm">
              <Plus className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onSelect={() => openCreateAfterMenuClose('friend')} className="gap-2">
              <User className="h-4 w-4" /><span>添加朋友</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openCreateAfterMenuClose('agent')} className="gap-2">
              <Bot className="h-4 w-4" /><span>创建助手</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ScrollArea className="flex-1">
        <div className="pb-10">
          {searching ? null : (
            <nav aria-label="联系人入口">
              <EntryRow
                icon={<UserPlus className="h-4 w-4" aria-hidden="true" />}
                label="新的朋友"
                selected={entry === 'new-friends'}
                onClick={() => onOpenEntry('new-friends')}
              />
              <EntryRow
                icon={<Users className="h-4 w-4" aria-hidden="true" />}
                label="群聊"
                trailing={groupCount > 0 ? <span className="text-xs text-muted-foreground">{groupCount}</span> : null}
                selected={entry === 'groups'}
                onClick={() => onOpenEntry('groups')}
              />
            </nav>
          )}
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin text-muted-foreground" aria-label="正在加载" /></div>
          ) : error ? (
            <div role="alert" className="p-8 text-center text-sm text-destructive">
              <p>{error}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>重试</Button>
            </div>
          ) : sections.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {searching ? '没有找到' : '还没有联系人'}
            </div>
          ) : (
            <div role="listbox" aria-label="联系人" aria-orientation="vertical">
              {sections.map((section) => (
                <div
                  key={`${section.key}-${section.title}`}
                  ref={(element) => {
                    if (element) sectionRefs.current.set(section.title, element)
                  }}
                >
                  <div className="sticky top-0 z-10 flex h-6 items-center bg-layout-list-item px-3">
                    <span className="text-xs text-muted-foreground">{section.title}</span>
                  </div>
                  {section.items.map((contact) => {
                    const index = flatIndex++
                    const selected = selectedId === contact.id
                    const tabbable = selected || (selectedIndex < 0 && index === 0)
                    return (
                      <ContactItem
                        key={contact.id}
                        contact={contact}
                        selected={selected}
                        onSelect={onSelect}
                        tabIndex={tabbable ? 0 : -1}
                        itemRef={(node) => registerItemRef(index, node)}
                        onKeyDown={(event) => onItemKeyDown(index, event)}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
      {/* A jump index only helps once there is more than one section to jump between. */}
      {!searching && letters.length > 1 && !error && (
        <div className="absolute bottom-10 right-0.5 top-24 z-20 flex w-4 flex-col items-center justify-center gap-0.5 text-[9px] font-bold text-muted-foreground/60">
          {letters.map((letter) => (
            <button
              type="button"
              key={letter}
              aria-label={`跳转到 ${letter}`}
              className="transition-colors hover:text-primary"
              onClick={() => scrollToLetter(letter)}
            >
              {letter}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
