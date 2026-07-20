import { useCallback, useRef } from 'react'
import { Bot, Loader2, Plus, Search, Star, User, Users } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import type { ContactListFilter, ContactSection, UnifiedContact } from '../domain/types'

export interface ContactListProps {
  search: string
  onSearchChange: (value: string) => void
  filter: ContactListFilter
  onFilterChange: (filter: ContactListFilter) => void
  selectedId: string | null
  sections: ContactSection[]
  letters: string[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
  onSelect: (id: string) => void
  onCreate: (type: 'agent' | 'friend' | 'group') => void
}

function GroupAvatarGrid({ name }: { name: string }) {
  const letters = (name || '??').slice(0, 2).split('')
  return (
    <div className="h-10 w-10 rounded-lg border border-border/30 bg-primary/10 grid grid-cols-2 gap-px overflow-hidden">
      {letters.map((letter, index) => (
        <div key={`${letter}-${index}`} className="flex items-center justify-center text-[10px] font-bold text-primary">
          {letter.toUpperCase()}
        </div>
      ))}
      <div className="col-span-2 flex items-center justify-center">
        <Users className="w-3.5 h-3.5 text-primary/60" />
      </div>
    </div>
  )
}

function ContactItem({
  contact,
  selected,
  onSelect,
}: {
  contact: UnifiedContact
  selected: boolean
  onSelect: (id: string) => void
}) {
  const isAgent = contact.sourceType === 'agent'
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(contact.id)}
      className={cn(
        'group relative flex w-full items-center gap-3 h-14 px-3 cursor-pointer select-none text-left',
        'transition-all duration-200',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50',
      )}
    >
      <div className="relative shrink-0">
        {contact.isGroup ? (
          <GroupAvatarGrid name={contact.displayName} />
        ) : (
          <Avatar className="h-10 w-10 rounded-lg border border-border/30">
            <AvatarImage src={contact.displayAvatar} className="object-cover" />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
              {isAgent ? <Bot className="w-5 h-5" /> : contact.displayName.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">
            {contact.displayName}
            {contact.sourceType === 'wechat' && (
              <span className="text-[10px] font-normal text-muted-foreground/50 ml-0.5">@wechat</span>
            )}
          </span>
          {contact.starred && <Star className="w-3 h-3 shrink-0 fill-primary text-primary" />}
          {contact.isGroup && contact.groupInfo?.isOwner && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary shrink-0">
              群主
            </span>
          )}
        </div>
        {contact.subtitle && (
          <div className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{contact.subtitle}</div>
        )}
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-16 right-0 h-px bg-border/70"
      />
    </button>
  )
}

export function ContactList({
  search,
  onSearchChange,
  filter: _filter,
  onFilterChange: _onFilterChange,
  selectedId,
  sections,
  letters,
  isLoading,
  error,
  onRetry,
  onSelect,
  onCreate,
}: ContactListProps) {
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const scrollToLetter = useCallback((letter: string) => {
    const keys = [...sectionRefs.current.keys()]
    const target = letter === '⭐'
      ? '星标朋友'
      : letter === '群'
        ? keys.find((key) => key.startsWith('群组'))
        : letter === 'AI'
          ? keys.find((key) => key.startsWith('AI'))
          : letter
    if (target) sectionRefs.current.get(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])
  const openCreateAfterMenuClose = useCallback((type: 'agent' | 'friend' | 'group') => {
    window.setTimeout(() => onCreate(type), 0)
  }, [onCreate])

  return (
    <div className="relative flex h-full flex-col bg-layout-list-item">
      <div className="h-12 flex items-center gap-2 px-3 shrink-0 border-b border-border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索联系人"
            className="h-7 rounded-sm border-transparent bg-muted/30 pl-8 text-xs focus-visible:ring-1"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="添加联系人" size="icon" variant="ghost" className="h-7 w-7 rounded-sm">
              <Plus className="w-4 h-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onSelect={() => openCreateAfterMenuClose('agent')} className="gap-2">
              <Bot className="w-4 h-4" /><span>新建助手</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openCreateAfterMenuClose('friend')} className="gap-2">
              <User className="w-4 h-4" /><span>添加朋友</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openCreateAfterMenuClose('group')} className="gap-2">
              <Users className="w-4 h-4" /><span>创建群组</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ScrollArea className="flex-1">
        <div className="pb-10">
          {isLoading ? (
            <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : error ? (
            <div role="alert" className="p-8 text-center text-sm text-destructive">
              <p>{error}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>重试</Button>
            </div>
          ) : sections.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">暂无联系人</div>
          ) : (
            <div role="listbox" aria-label="联系人">
              {sections.map((section) => (
                <div
                  key={`${section.key}-${section.title}`}
                  ref={(element) => {
                    if (element) sectionRefs.current.set(section.title, element)
                  }}
                >
                  <div className="h-6 px-3 flex items-center bg-background sticky top-0 z-10">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">{section.title}</span>
                  </div>
                  {section.items.map((contact) => (
                    <ContactItem
                      key={contact.id}
                      contact={contact}
                      selected={selectedId === contact.id}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
      {!search && letters.length > 0 && !error && (
        <div className="absolute right-0.5 top-24 bottom-10 w-4 flex flex-col items-center justify-center gap-0.5 z-20 text-[9px] font-bold text-muted-foreground/60">
          {letters.map((letter) => (
            <button
              type="button"
              key={letter}
              aria-label={`跳转到 ${letter}`}
              className="hover:text-primary transition-colors"
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
