import { useMemo, useCallback, useRef, useEffect } from 'react'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useContactStore } from '../store'
import { contactOps, initializeContactCollections } from '../collections'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import type { UnifiedContact, ContactSection, SectionKey, ContactListFilter } from '../types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Search,
  Plus,
  Loader2,
  UserPlus,
  Star,
  ChevronRight,
  Bot,
  User,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { ContactRow } from '@linx/models'
import { ContactType } from '@linx/models'
import { useQuery } from '@tanstack/react-query'

// ============================================
// Helpers
// ============================================

/**
 * 提取首字母 (支持中英文)
 * 简化版实现，优先匹配英文，中文暂归入 #
 */
function getInitial(name: string): string {
  if (!name) return '#'
  const first = name.trim().charAt(0).toUpperCase()
  if (/[A-Z]/.test(first)) return first
  // 中文逻辑后续通过 pinyin-pro 增强，目前先归类
  return '#'
}

// ============================================
// Components
// ============================================

const FILTER_OPTIONS: { value: ContactListFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'personal', label: '个人' },
  { value: 'agents', label: 'AI' },
  { value: 'groups', label: '群组' },
]

/**
 * CP1: Segmented filter tabs for contact type filtering
 */
function FilterTabs({
  value,
  onChange,
}: {
  value: ContactListFilter
  onChange: (v: ContactListFilter) => void
}) {
  return (
    <div className="flex gap-0.5 p-0.5 bg-muted/40 rounded-md">
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 text-xs py-1 px-2 rounded-sm transition-colors',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Group avatar: 2x2 grid of initials for group contacts
 */
function GroupAvatarGrid({ name }: { name: string }) {
  const letters = (name || '??').slice(0, 2).split('')
  return (
    <div className="h-10 w-10 rounded-lg border border-border/30 bg-primary/10 grid grid-cols-2 gap-px overflow-hidden">
      {letters.map((l, i) => (
        <div key={i} className="flex items-center justify-center text-[10px] font-bold text-primary">
          {l.toUpperCase()}
        </div>
      ))}
      <div className="col-span-2 flex items-center justify-center">
        <Users className="w-3.5 h-3.5 text-primary/60" />
      </div>
    </div>
  )
}

interface ContactItemProps {
  contact: UnifiedContact
  isActive: boolean
  onClick: () => void
}

function ContactItem({ contact, isActive, onClick }: ContactItemProps) {
  const isGroup = contact.contactType === ContactType.GROUP
  const isAgent = contact.sourceType === 'agent'

  // Subtitle: group shows member count, agent shows model, personal shows note/WebID
  const subtitle = useMemo(() => {
    if (isGroup && contact.groupInfo) {
      return `${contact.groupInfo.memberCount}人`
    }
    if (isAgent && contact.agentConfig?.model) {
      return contact.agentConfig.model
    }
    if (contact.note) {
      return contact.note
    }
    if (contact.entityUri && contact.contactType === ContactType.SOLID) {
      return contact.entityUri
    }
    return undefined
  }, [contact, isGroup, isAgent])

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-3 h-14 px-3 cursor-pointer select-none',
        'transition-all duration-200',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-muted/50'
      )}
    >
      <div className="relative shrink-0">
        {isGroup ? (
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
              <span className="text-[10px] font-normal text-muted-foreground/50 ml-0.5">
                @wechat
              </span>
            )}
          </span>
          {contact.starred && (
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 shrink-0" />
          )}
        </div>
        {subtitle && (
          <div className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 顶部固定功能项 (新的朋友)
 */
function StaticEntry({
  icon: Icon,
  label,
  badge,
  onClick
}: {
  icon?: any,
  label: string,
  badge?: number,
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 h-14 px-3 cursor-pointer hover:bg-muted/50 transition-colors"
    >
      {Icon ? (
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <Icon className="w-5 h-5" />
        </div>
      ) : (
        <div className="w-10 shrink-0" /> /* 占位以保持文字对齐 */
      )}
      <span className="flex-1 text-sm font-medium">{label}</span>
      {badge ? (
        <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
          {badge}
        </span>
      ) : (
        <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
      )}
    </div>
  )
}

// ============================================
// Main Component
// ============================================

export function ContactListPane({}: MicroAppPaneProps) {
  const search = useContactStore((state) => state.search)
  const setSearch = useContactStore((state) => state.setSearch)
  const selectedId = useContactStore((state) => state.selectedId)
  const select = useContactStore((state) => state.select)
  const openCreateDialog = useContactStore((state) => state.openCreateDialog)
  const showNewFriends = useContactStore((state) => state.showNewFriends)
  const newFriendsCount = useContactStore((state) => state.newFriendsCount)
  const listFilter = useContactStore((state) => state.listFilter)
  const setListFilter = useContactStore((state) => state.setListFilter)

  // Initialize collection with database and subscribe to notifications
  const { db } = useSolidDatabase()
  
  useEffect(() => {
    initializeContactCollections(db)
  }, [db])

  // Subscribe to Pod notifications for real-time updates
  useEffect(() => {
    if (!db) return
    
    let cleanup: (() => void) | undefined
    
    contactOps.subscribeToPod().then((unsubscribe) => {
      cleanup = unsubscribe
    })
    
    return () => {
      cleanup?.()
    }
  }, [db])

  // Use TanStack Query with contactOps for reactive updates
  const { data: rawContacts = [], isLoading, error } = useQuery({
    queryKey: ['contacts', search],
    queryFn: async () => {
      console.log('[ContactListPane] Fetching contacts, db:', !!db)
      // Use search if there's a query, otherwise get all
      const result = search.trim() 
        ? await contactOps.search(search.trim())
        : contactOps.getAll()
      console.log('[ContactListPane] Fetched contacts:', result.length)
      return result
    },
    enabled: !!db,
    staleTime: 1000 * 60, // 1 minute
  })
  
  // Debug: log loading state
  useEffect(() => {
    console.log('[ContactListPane] State:', { isLoading, error, db: !!db, count: rawContacts.length })
  }, [isLoading, error, db, rawContacts.length])

  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // 字母索引点击滚动 (支持 ⭐/群/AI/A-Z)
  const scrollToLetter = useCallback((letter: string) => {
    // Map index labels to section title prefixes
    let target: string | undefined
    if (letter === '⭐') target = '星标朋友'
    else if (letter === '群') {
      target = Array.from(sectionRefs.current.keys()).find(k => k.startsWith('群组'))
    } else if (letter === 'AI') {
      target = Array.from(sectionRefs.current.keys()).find(k => k.startsWith('AI'))
    } else {
      target = letter
    }
    if (target) {
      const el = sectionRefs.current.get(target)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  // 数据处理: 转换为 UnifiedContact 并按 contactType 分组
  const { sections, letters } = useMemo(() => {
    const rawItems = rawContacts || []

    // 转换为 UnifiedContact 格式
    const unified: UnifiedContact[] = rawItems.map((c: ContactRow) => {
      const isGroup = c.contactType === ContactType.GROUP
      const base = {
        ...c,
        displayName: c.alias || c.name || 'Unknown',
        displayAvatar: c.avatarUrl || '',
        initial: getInitial(c.alias || c.name || ''),
        sourceType: (c.contactType as any) === 'agent' ? 'agent' as const :
                    (c.externalPlatform === 'wechat' ? 'wechat' as const : 'solid' as const),
      }

      // Populate groupInfo for group contacts
      if (isGroup) {
        const members = contactOps.getGroupMembers(c.id)
        return {
          ...base,
          groupInfo: {
            memberCount: members.length,
            isOwner: false, // TODO: compare with current user WebID
            memberPreview: [], // TODO: resolve member names
          },
        } as UnifiedContact
      }

      return base as UnifiedContact
    })

    // Apply listFilter
    const filtered = listFilter !== 'all'
      ? unified.filter(c => {
          if (listFilter === 'personal') return c.contactType === ContactType.SOLID
          if (listFilter === 'agents') return c.contactType === ContactType.AGENT
          if (listFilter === 'groups') return c.contactType === ContactType.GROUP
          return true
        })
      : unified

    // Split by contactType
    const starredItems = filtered.filter(c => c.starred)
    const groupItems = filtered.filter(c => c.contactType === ContactType.GROUP && !c.starred)
    const agentItems = filtered.filter(c => c.contactType === ContactType.AGENT && !c.starred)
    const personalItems = filtered.filter(c =>
      c.contactType !== ContactType.GROUP &&
      c.contactType !== ContactType.AGENT &&
      !c.starred
    )

    // A-Z sub-groups for personal contacts
    const alphaGroups: Record<string, UnifiedContact[]> = {}
    personalItems.forEach(c => {
      if (!alphaGroups[c.initial]) alphaGroups[c.initial] = []
      alphaGroups[c.initial].push(c)
    })
    const sortedLetters = Object.keys(alphaGroups).sort((a, b) => {
      if (a === '#') return 1
      if (b === '#') return -1
      return a.localeCompare(b)
    })

    const contactSections: ContactSection[] = [
      ...(starredItems.length > 0 ? [{
        key: 'starred' as SectionKey,
        title: '星标朋友',
        items: starredItems,
      }] : []),
      ...(groupItems.length > 0 ? [{
        key: 'groups' as SectionKey,
        title: `群组 (${groupItems.length})`,
        items: groupItems.sort((a, b) => a.displayName.localeCompare(b.displayName)),
      }] : []),
      ...(agentItems.length > 0 ? [{
        key: 'agents' as SectionKey,
        title: `AI 助手 (${agentItems.length})`,
        items: agentItems.sort((a, b) => a.displayName.localeCompare(b.displayName)),
      }] : []),
      ...sortedLetters.map(l => ({
        key: 'contacts' as SectionKey,
        title: l,
        items: alphaGroups[l].sort((a, b) => a.displayName.localeCompare(b.displayName)),
      })),
    ]

    const indexLetters = [
      ...(starredItems.length > 0 ? ['⭐'] : []),
      ...(groupItems.length > 0 ? ['群'] : []),
      ...(agentItems.length > 0 ? ['AI'] : []),
      ...sortedLetters,
    ]

    return { sections: contactSections, letters: indexLetters }
  }, [rawContacts, listFilter])

  return (
    <div className="flex h-full flex-col bg-layout-list-item border-r border-border/50 relative">
      {/* Header */}
      <div className="h-16 flex items-center gap-2 px-3 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索联系人"
            className="pl-9 h-9 bg-muted/30 rounded-md border-transparent focus-visible:ring-1"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-9 w-9 rounded-md">
              <Plus className="w-5 h-5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => openCreateDialog('agent')} className="gap-2">
              <Bot className="w-4 h-4" />
              <span>新建助手</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openCreateDialog('friend')} className="gap-2">
              <User className="w-4 h-4" />
              <span>添加朋友</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openCreateDialog('group')} className="gap-2">
              <Users className="w-4 h-4" />
              <span>创建群组</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filter tabs */}
      {!search && (
        <div className="px-3 pb-2 shrink-0">
          <FilterTabs value={listFilter} onChange={setListFilter} />
        </div>
      )}

      {/* List content */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="pb-10">
          {/* Static Top Entries */}
          {!search && (
            <div className="mb-2">
              <StaticEntry 
                icon={UserPlus} 
                label="新的朋友" 
                badge={newFriendsCount > 0 ? newFriendsCount : undefined}
                onClick={showNewFriends} 
              />
            </div>
          )}
          {/* Contact Sections */}
          {isLoading ? (
            <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : sections.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">暂无联系人</div>
          ) : (
            sections.map((section, idx) => (
              <div 
                key={idx}
                ref={(el) => {
                  if (el) sectionRefs.current.set(section.title, el)
                }}
              >
                <div className="h-6 px-3 flex items-center bg-muted/20 sticky top-0 z-10 backdrop-blur-sm">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">{section.title}</span>
                </div>
                {section.items.map(contact => (
                  <ContactItem
                    key={contact.id}
                    contact={contact}
                    isActive={selectedId === contact.id}
                    onClick={() => select(contact.id)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Right Index Bar */}
      {!search && letters.length > 0 && (
        <div className="absolute right-0.5 top-24 bottom-10 w-4 flex flex-col items-center justify-center gap-0.5 z-20 text-[9px] font-bold text-muted-foreground/60">
          {letters.map(l => (
            <button 
              key={l} 
              className="hover:text-primary transition-colors"
              onClick={() => scrollToLetter(l)}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ContactListPane
