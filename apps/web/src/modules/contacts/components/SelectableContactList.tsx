/**
 * SelectableContactList - Reusable contact selection UI
 *
 * Used by CreateGroupDialog and invite-member flows.
 */

import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Search, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ContactRow } from '@linx/models'

interface SelectableContactListProps {
  title: string
  icon: React.ReactNode
  contacts: ContactRow[]
  selected: Set<string>
  onToggle: (id: string) => void
  search?: string
  onSearchChange?: (val: string) => void
  showSearch?: boolean
}

export function SelectableContactList({
  title, icon, contacts, selected, onToggle,
  search, onSearchChange, showSearch,
}: SelectableContactListProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
      </div>
      {showSearch && onSearchChange && (
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            value={search ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索联系人..."
            className="pl-8 h-8 text-sm"
          />
        </div>
      )}
      <ScrollArea className="h-[140px] border rounded-md">
        {contacts.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">暂无可选联系人</div>
        ) : (
          contacts.map(c => (
            <SelectableItem
              key={c.id}
              contact={c}
              isSelected={selected.has(c.id)}
              onToggle={() => onToggle(c.id)}
            />
          ))
        )}
      </ScrollArea>
    </div>
  )
}

function SelectableItem({
  contact, isSelected, onToggle,
}: {
  contact: ContactRow
  isSelected: boolean
  onToggle: () => void
}) {
  return (
    <div
      onClick={onToggle}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors',
        isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'
      )}
    >
      <div className={cn(
        'w-4 h-4 rounded border flex items-center justify-center shrink-0',
        isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'
      )}>
        {isSelected && <Check className="w-3 h-3" />}
      </div>
      <Avatar className="h-7 w-7 rounded-md">
        <AvatarImage src={contact.avatarUrl ?? undefined} />
        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
          {(contact.name ?? '?').slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm truncate">{contact.alias || contact.name}</span>
    </div>
  )
}
