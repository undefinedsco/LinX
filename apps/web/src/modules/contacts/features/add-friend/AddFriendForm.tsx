import { useEffect } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ContactAvatar } from '../../ui/ContactAvatar'
import { useAddFriend, type AddedFriend } from './useAddFriend'

export interface AddFriendFormProps {
  onAdded: (friend: AddedFriend) => void
  /** Open an existing friend instead of adding them twice. */
  onOpenExisting?: (contactId: string) => void
}

/** 添加朋友: paste the other person's account, see who it is, add. */
export function AddFriendForm({ onAdded, onOpenExisting }: AddFriendFormProps) {
  const friend = useAddFriend({ onAdded })
  const { reset } = friend
  useEffect(() => reset, [reset])

  const { state } = friend
  const searching = state.kind === 'searching'

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="friend-account">对方的账号</Label>
        <div className="flex gap-2">
          <Input
            id="friend-account"
            value={friend.input}
            autoFocus
            onChange={(event) => friend.setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void friend.search()
              }
            }}
            placeholder="例如 songqing@solidcommunity.net"
          />
          <Button type="button" variant="outline" onClick={() => void friend.search()} disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
            搜索
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">先粘贴对方的账号；按名字搜索以后再做</p>
      </div>

      {state.kind === 'problem' ? (
        <p role="alert" className="text-sm text-destructive">{state.text}</p>
      ) : null}

      {state.kind === 'found' ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <ContactAvatar name={state.profile.name} src={state.profile.avatarUrl} className="h-10 w-10" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{state.profile.name}</p>
            <p className="truncate text-xs text-muted-foreground">{friend.foundAddress}</p>
          </div>
          {state.existingContactId ? (
            onOpenExisting ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpenExisting(state.existingContactId as string)}
              >
                已添加
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">已添加</span>
            )
          ) : (
            <Button type="button" size="sm" onClick={() => void friend.add()} disabled={friend.isAdding}>
              {friend.isAdding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              添加
            </Button>
          )}
        </div>
      ) : null}

      {friend.addError ? <p role="alert" className="text-sm text-destructive">{friend.addError}</p> : null}
    </div>
  )
}
