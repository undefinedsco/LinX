/**
 * MemberList - Group member list sidebar
 * Displays group members with roles, search, and action menus.
 */

import { useState, useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Search, MoreHorizontal, UserPlus, Bot, Crown, Shield } from 'lucide-react'
import type { ContactRow } from '@linx/models'
import { ContactType } from '@linx/models'

export type MemberRole = 'owner' | 'admin' | 'member'

export interface GroupMember {
  contact: ContactRow
  role: MemberRole
}

interface MemberListProps {
  members: GroupMember[]
  currentUserId?: string
  /** Current user is the group owner */
  isOwner?: boolean
  /** Current user is an admin (owner OR admin role) */
  isAdmin?: boolean
  onViewProfile?: (contactId: string) => void
  onMention?: (contactName: string) => void
  onRemoveMember?: (contactId: string) => void
  /** Only owner can promote/demote — called with (contactId, newRole) */
  onUpdateRole?: (contactId: string, role: 'admin' | 'member') => void
  onInvite?: () => void
}

function RoleBadge({ role }: { role: MemberRole }) {
  if (role === 'owner') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500">
        <Crown className="w-3 h-3" />
        群主
      </span>
    )
  }
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-400">
        <Shield className="w-3 h-3" />
        管理员
      </span>
    )
  }
  return null
}

function MemberItem({ member, isCurrentUser, canManage, canSetRole, onViewProfile, onMention, onRemoveMember, onUpdateRole }: {
  member: GroupMember; isCurrentUser: boolean; canManage: boolean; canSetRole: boolean
  onViewProfile?: (id: string) => void; onMention?: (name: string) => void
  onRemoveMember?: (id: string) => void; onUpdateRole?: (id: string, role: 'admin' | 'member') => void
}) {
  const { contact, role } = member
  const isAgent = contact.contactType === ContactType.AGENT
  const displayName = contact.alias || contact.name || '?'

  return (
    <div className="group flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors">
      <div className="relative shrink-0">
        <Avatar className="h-8 w-8 rounded-md">
          <AvatarImage src={contact.avatarUrl ?? undefined} />
          <AvatarFallback className="text-xs bg-primary/10 text-primary">
            {isAgent ? <Bot className="w-4 h-4" /> : displayName.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm truncate">
            {displayName}
            {isCurrentUser && (
              <span className="text-[10px] text-muted-foreground ml-1">(你)</span>
            )}
          </span>
          <RoleBadge role={role} />
        </div>
      </div>

      {/* Action menu - hidden for current user */}
      {!isCurrentUser && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => onViewProfile?.(contact.id)}>
              查看资料
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMention?.(displayName)}>
              @提及
            </DropdownMenuItem>
            {/* Role management - only owner can set roles, and not on other owners */}
            {canSetRole && role === 'member' && (
              <DropdownMenuItem onClick={() => onUpdateRole?.(contact.id, 'admin')}>
                <Shield className="w-3.5 h-3.5 mr-1.5" />
                设为管理员
              </DropdownMenuItem>
            )}
            {canSetRole && role === 'admin' && (
              <DropdownMenuItem onClick={() => onUpdateRole?.(contact.id, 'member')}>
                取消管理员
              </DropdownMenuItem>
            )}
            {/* Remove - owner/admin can remove non-owner members */}
            {canManage && role !== 'owner' && (
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onRemoveMember?.(contact.id)}
              >
                移除成员
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

export function MemberList({
  members,
  currentUserId,
  isOwner = false,
  isAdmin = false,
  onViewProfile,
  onMention,
  onRemoveMember,
  onUpdateRole,
  onInvite,
}: MemberListProps) {
  const [search, setSearch] = useState('')

  // Derived permission flags
  const canManageMembers = isOwner || isAdmin
  const canSetRoles = isOwner // only owner can promote/demote

  const filtered = useMemo(() => {
    if (!search.trim()) return members
    const q = search.toLowerCase()
    return members.filter(m =>
      m.contact.name?.toLowerCase().includes(q) ||
      m.contact.alias?.toLowerCase().includes(q)
    )
  }, [members, search])

  // Sort: owner first, then admin, then member
  const sorted = useMemo(() => {
    const order: Record<MemberRole, number> = { owner: 0, admin: 1, member: 2 }
    return [...filtered].sort((a, b) => order[a.role] - order[b.role])
  }, [filtered])

  return (
    <div className="flex flex-col h-full border-l border-border/50 bg-background w-[220px]">
      {/* Header */}
      <div className="px-3 py-3 border-b border-border/30">
        <div className="text-sm font-medium mb-2">
          群成员 ({members.length})
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索成员"
            className="pl-7 h-7 text-xs"
          />
        </div>
      </div>

      {/* Member list */}
      <ScrollArea className="flex-1">
        {sorted.map(member => (
          <MemberItem
            key={member.contact.id}
            member={member}
            isCurrentUser={member.contact.id === currentUserId}
            canManage={canManageMembers}
            canSetRole={canSetRoles}
            onViewProfile={onViewProfile}
            onMention={onMention}
            onRemoveMember={onRemoveMember}
            onUpdateRole={onUpdateRole}
          />
        ))}
      </ScrollArea>

      {/* Invite button */}
      {onInvite && (
        <div className="p-2 border-t border-border/30">
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={onInvite}
          >
            <UserPlus className="w-3.5 h-3.5" />
            邀请成员
          </Button>
        </div>
      )}
    </div>
  )
}
