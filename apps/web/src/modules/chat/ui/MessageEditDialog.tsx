import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

export interface MessageEditDialogProps {
  open: boolean
  value: string
  onValueChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}
export function MessageEditDialog({
  open,
  value,
  onValueChange,
  onOpenChange,
  onSubmit,
}: MessageEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑消息</DialogTitle>
          <DialogDescription>原消息与回答会保留为一个分支，并从编辑后的内容重新生成。</DialogDescription>
        </DialogHeader>
        <Textarea aria-label="消息内容" value={value} onChange={(event) => onValueChange(event.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={!value.trim()} onClick={onSubmit}>保存并重新生成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
