import { Bot, UserPlus } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { UnifiedContact } from '../domain/types'

export interface ContactPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  people: UnifiedContact[]
  assistants: UnifiedContact[]
  busyContactId: string | null
  error: string | null
  onPick: (contactId: string) => void
  onAddFriend: () => void
}

function ContactRow({ contact, isAssistant, busy }: { contact: UnifiedContact; isAssistant: boolean; busy: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-medium text-foreground">
        {isAssistant ? <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : contact.displayName.slice(0, 1).toUpperCase()}
      </span>
      <span className="truncate">{contact.displayName}</span>
      {isAssistant ? <span className="shrink-0 text-xs text-muted-foreground">助手</span> : null}
      {busy ? <span className="ml-auto shrink-0 text-xs text-muted-foreground">正在打开…</span> : null}
    </div>
  )
}

/**
 * "找人聊天": pick someone from contacts and go straight to that conversation.
 * People and assistants are listed separately so they are never confused.
 */
export function ContactPicker({
  open,
  onOpenChange,
  people,
  assistants,
  busyContactId,
  error,
  onPick,
  onAddFriend,
}: ContactPickerProps) {
  const hasContacts = people.length > 0 || assistants.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[420px]">
        <DialogHeader className="sr-only">
          <DialogTitle>找人聊天</DialogTitle>
          <DialogDescription>从联系人里选一个人或助手开始聊天</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder="搜索联系人" />
          <CommandList className="max-h-[360px]">
            <CommandEmpty>{hasContacts ? '没有找到这个人' : '还没有联系人'}</CommandEmpty>
            {people.length > 0 ? (
              <CommandGroup heading="朋友">
                {people.map((contact) => (
                  <CommandItem
                    key={contact.id}
                    value={`${contact.displayName} ${contact.id}`}
                    disabled={busyContactId !== null}
                    onSelect={() => onPick(contact.id)}
                  >
                    <ContactRow contact={contact} isAssistant={false} busy={busyContactId === contact.id} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {assistants.length > 0 ? (
              <CommandGroup heading="助手">
                {assistants.map((contact) => (
                  <CommandItem
                    key={contact.id}
                    value={`${contact.displayName} ${contact.id}`}
                    disabled={busyContactId !== null}
                    onSelect={() => onPick(contact.id)}
                  >
                    <ContactRow contact={contact} isAssistant busy={busyContactId === contact.id} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            <CommandSeparator />
            <CommandGroup>
              <CommandItem value="添加朋友" onSelect={onAddFriend}>
                <UserPlus className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                添加朋友…
              </CommandItem>
            </CommandGroup>
          </CommandList>
          {error ? <p className="border-t px-3 py-2 text-xs text-destructive">{error}</p> : null}
        </Command>
      </DialogContent>
    </Dialog>
  )
}
