import { useEffect, useState } from 'react'
import { PencilLine, Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { clearAccountDrafts, countAccountDrafts } from '@/modules/chat/draft-store'

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountScope: string
  onConfirm: () => void
}

/**
 * Apple-style confirmation: says what happens to unsent drafts and to work
 * that keeps running, then gets out of the way. Drafts are kept by default.
 */
export function SignOutDialog({ open, onOpenChange, accountScope, onConfirm }: SignOutDialogProps) {
  const [draftCount, setDraftCount] = useState(0)

  useEffect(() => {
    if (open) setDraftCount(countAccountDrafts(accountScope))
  }, [accountScope, open])

  const signOut = (discardDrafts: boolean) => {
    if (discardDrafts) clearAccountDrafts(accountScope)
    onOpenChange(false)
    onConfirm()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>退出登录？</DialogTitle>
          <DialogDescription className="sr-only">退出前说明会发生什么</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm text-foreground">
          {draftCount > 0 ? (
            <p className="flex items-start gap-2">
              <PencilLine className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{draftCount} 条没发出的草稿会留在这台电脑，只有你登录后能看到</span>
            </p>
          ) : null}
          <p className="flex items-start gap-2">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>正在运行的任务会继续，退出不会停止它们</span>
          </p>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <div className="flex w-full gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>取消</Button>
            <Button className="flex-1" onClick={() => signOut(false)}>退出登录</Button>
          </div>
          {draftCount > 0 ? (
            <button
              type="button"
              className="self-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              onClick={() => signOut(true)}
            >
              放弃草稿并退出
            </button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
