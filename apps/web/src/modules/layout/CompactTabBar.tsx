import { FolderOpen, MessageCircle, User, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MicroAppId } from './micro-app-registry'

const TABS: Array<{ id: MicroAppId; label: string; icon: typeof MessageCircle }> = [
  { id: 'chat', label: '聊天', icon: MessageCircle },
  { id: 'contacts', label: '联系人', icon: Users },
  { id: 'files', label: '文件', icon: FolderOpen },
  { id: 'me', label: '我', icon: User },
]

/** Pages reached from 我 keep 我 selected, like WeChat's phone tabs. */
const ME_PAGES: readonly MicroAppId[] = ['me', 'profile', 'favorites', 'settings', 'model-services']

export function compactTabFor(id: MicroAppId): MicroAppId | null {
  if (ME_PAGES.includes(id)) return 'me'
  return TABS.some((tab) => tab.id === id) ? id : null
}

export interface CompactTabBarProps {
  activeId: MicroAppId
  onNavigate: (id: MicroAppId) => void
}

/**
 * Narrow windows (< 700): the rail becomes a WeChat-style bottom bar —
 * 聊天 / 联系人 / 文件 / 我. The inbox sits in the page head instead.
 */
export function CompactTabBar({ activeId, onNavigate }: CompactTabBarProps) {
  const activeTab = compactTabFor(activeId)

  return (
    <nav aria-label="主导航" className="flex shrink-0 border-t border-border bg-layout-list-item pb-[env(safe-area-inset-bottom)]">
      {TABS.map((tab) => {
        const active = activeTab === tab.id
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors',
              active
                ? 'font-semibold text-primary shadow-[inset_0_3px_0_hsl(var(--primary))]'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onNavigate(tab.id)}
          >
            <Icon className="h-5 w-5" strokeWidth={active ? 2 : 1.5} aria-hidden="true" />
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
