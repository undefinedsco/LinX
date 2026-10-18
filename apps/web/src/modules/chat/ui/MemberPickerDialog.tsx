import { useState, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { ChatIdentityKind } from '../domain/chat-list-model'
import { IdentityAvatar } from './IdentityAvatar'

export interface MemberCandidate {
  id: string
  name: string
  kind: Extract<ChatIdentityKind, 'assistant' | 'person'>
  avatarUrl?: string | null
  /** e.g. 已在群里 — shown greyed out and not pickable. */
  disabledReason?: string | null
  hint?: string | null
}

export interface MemberPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  candidates: MemberCandidate[]
  selected: string[]
  onToggle: (id: string) => void
  confirmLabel: string
  canConfirm: boolean
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  /** Extra fields under the list, e.g. the optional group name. */
  footer?: ReactNode
}

/**
 * W9 发起群聊 / W8b 邀请成员: tick people, the picked ones show as chips on
 * top and can be removed there.
 */
export function MemberPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  candidates,
  selected,
  onToggle,
  confirmLabel,
  canConfirm,
  busy = false,
  error,
  onConfirm,
  footer,
}: MemberPickerDialogProps) {
  const [search, setSearch] = useState('')
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const chips = selected.map((id) => byId.get(id)).filter((candidate): candidate is MemberCandidate => Boolean(candidate))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch('')
        onOpenChange(next)
      }}
    >
      <DialogContent className="gap-3 p-0 sm:max-w-[420px]">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-4" aria-label="已选">
            {chips.map((chip) => (
              <span key={chip.id} className="inline-flex h-7 items-center gap-1 rounded-md bg-muted pl-2 pr-1 text-xs text-foreground">
                {chip.name}
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                  aria-label={`不选${chip.name}`}
                  onClick={() => onToggle(chip.id)}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <Command className="border-y">
          <CommandInput placeholder="搜索联系人" value={search} onValueChange={setSearch} />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>{candidates.length > 0 ? '没有找到这个人' : '还没有联系人，先加朋友'}</CommandEmpty>
            <CommandGroup>
              {candidates.map((candidate) => {
                const isSelected = selected.includes(candidate.id)
                const disabled = Boolean(candidate.disabledReason)
                return (
                  <CommandItem
                    key={candidate.id}
                    value={`${candidate.name} ${candidate.id}`}
                    disabled={disabled || busy}
                    onSelect={() => onToggle(candidate.id)}
                    aria-selected={isSelected}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                        isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                      )}
                    >
                      {isSelected ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <IdentityAvatar
                      kind={candidate.kind}
                      text={candidate.kind === 'assistant' ? 'AI' : Array.from(candidate.name)[0] ?? '?'}
                      avatarUrl={candidate.avatarUrl}
                      size="chip"
                      className="mr-2"
                    />
                    <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                    {candidate.disabledReason || candidate.hint ? (
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">{candidate.disabledReason ?? candidate.hint}</span>
                    ) : null}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {footer ? <div className="px-4">{footer}</div> : null}
        {error ? <p role="alert" className="px-4 text-xs text-destructive">{error}</p> : null}
        <DialogFooter className="px-4 pb-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button>
          <Button onClick={onConfirm} disabled={!canConfirm || busy}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
