import { UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ContactEntry, UnifiedContact } from '../domain/types'
import { GroupCard, GroupRow } from './group-rows'

export interface ContactEntryViewProps {
  entry: ContactEntry
  groups: UnifiedContact[]
  recentFriends: UnifiedContact[]
  onSelect(contactId: string): void
  onAddFriend(): void
}

/** What "新的朋友" and "群聊" open to, above the A–Z list. */
export function ContactEntryView({ entry, groups, recentFriends, onSelect, onAddFriend }: ContactEntryViewProps) {
  if (entry === 'new-friends') {
    return (
      <div className="flex-1 overflow-y-auto bg-layout-content">
        <div className="mx-auto max-w-2xl space-y-3 px-8 py-8">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">新的朋友</h2>
            <Button size="sm" onClick={onAddFriend}>添加朋友</Button>
          </div>
          {recentFriends.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <UserPlus className="mx-auto mb-2 h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
              现在没有新的朋友。想认识谁，粘贴对方的账号就能添加。
            </div>
          ) : (
            <GroupCard>
              {recentFriends.map((friend) => (
                <GroupRow key={friend.id} label={friend.displayName} onClick={() => onSelect(friend.id)}>
                  <span className="ml-auto text-xs text-muted-foreground">已添加</span>
                </GroupRow>
              ))}
            </GroupCard>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="flex-1 overflow-y-auto bg-layout-content">
      <div className="mx-auto max-w-2xl space-y-3 px-8 py-8">
        <h2 className="text-base font-semibold">群聊</h2>
        {groups.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
            还没有群聊
          </div>
        ) : (
          <GroupCard>
            {groups.map((group) => (
              <GroupRow key={group.id} label={group.displayName} onClick={() => onSelect(group.id)}>
                {group.subtitle ? <span className="ml-auto truncate text-xs text-muted-foreground">{group.subtitle}</span> : null}
              </GroupRow>
            ))}
          </GroupCard>
        )}
      </div>
    </div>
  )
}
