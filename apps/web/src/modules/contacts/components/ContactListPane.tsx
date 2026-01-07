import { useMemo, useCallback, useRef, useEffect } from 'react'
import type { MicroAppPaneProps } from '@/modules/layout/micro-app-registry'
import { useContactStore } from '../store'
import { contactOps, initializeContactCollections } from '../collections'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import type { UnifiedContact, ContactSection, SectionKey } from '../types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { 
  Search, 
  Plus, 
  Loader2,
  UserPlus,
  Star,
  ChevronRight,
  Bot,
  User
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

interface ContactItemProps {
  contact: UnifiedContact
  isActive: boolean
  onClick: () => void
}

function ContactItem({ contact, isActive, onClick }: ContactItemProps) {
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
        <Avatar className="h-10 w-10 rounded-lg border border-border/30">
          <AvatarImage src={contact.displayAvatar} className="object-cover" />
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
            {contact.displayName.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
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

  // 字母索引点击滚动
  const scrollToLetter = useCallback((letter: string) => {
    // ⭐ 映射到星标朋友
    const targetTitle = letter === '⭐' ? '星标朋友' : letter
    const sectionEl = sectionRefs.current.get(targetTitle)
    if (sectionEl) {
      sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  // 数据处理: 转换为 UnifiedContact 并分组
  const { sections, letters } = useMemo(() => {
    const rawItems = rawContacts || []
    
    // 转换为 UnifiedContact 格式
    const unified: UnifiedContact[] = rawItems.map((c: ContactRow) => ({
      ...c,
      displayName: c.alias || c.name || 'Unknown',
      displayAvatar: c.avatarUrl || '',
      initial: getInitial(c.alias || c.name || ''),
      sourceType: (c.contactType as any) === 'agent' ? 'agent' :
                  (c.externalPlatform === 'wechat' ? 'wechat' : 'solid')
    } as UnifiedContact))

    // 分组逻辑 (搜索已在 query 中处理)
    const starredItems = unified.filter(c => c.starred)
    const normalItems = unified.filter(c => !c.starred)
    
    // 按字母排序 A-Z (仅对非星标用户)
    const groups: Record<string, UnifiedContact[]> = {}
    normalItems.forEach(c => {
      if (!groups[c.initial]) groups[c.initial] = []
      groups[c.initial].push(c)
    })

    const sortedLetters = Object.keys(groups).sort((a, b) => {
      if (a === '#') return 1
      if (b === '#') return -1
      return a.localeCompare(b)
    })

    const contactSections: ContactSection[] = [
      // 星标分组 (如果存在)
      ...(starredItems.length > 0 ? [{
        key: 'starred' as SectionKey,
        title: '星标朋友',
        items: starredItems
      }] : []),
      // A-Z 分组
      ...sortedLetters.map(l => ({
        key: 'contacts' as SectionKey,
        title: l,
        items: groups[l].sort((a, b) => a.displayName.localeCompare(b.displayName))
      }))
    ]
    
    // 字母索引包括星标和 A-Z
    const indexLetters = [
      ...(starredItems.length > 0 ? ['⭐'] : []),
      ...sortedLetters
    ]

    return {
      sections: contactSections,
      letters: indexLetters,
    }
  }, [rawContacts])

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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
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
