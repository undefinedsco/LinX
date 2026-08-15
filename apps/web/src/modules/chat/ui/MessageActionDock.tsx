import { ArrowLeft, ArrowRight, Pencil, Quote, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ActionableMessage } from '../domain/message-actions'

export interface MessageActionDockProps {
  items: readonly ActionableMessage[]
  selectedItem: ActionableMessage
  messageBranch?: { index: number; count: number }
  answerBranch?: { index: number; count: number }
  onSelect: (messageId: string) => void
  onPreviousMessageBranch: () => void
  onNextMessageBranch: () => void
  onPreviousAnswerBranch: () => void
  onNextAnswerBranch: () => void
  onEdit: () => void
  onRegenerate: () => void
  onQuote: () => void
  onDelete: () => void
}
export function MessageActionDock({
  items,
  selectedItem,
  messageBranch,
  answerBranch,
  onSelect,
  onPreviousMessageBranch,
  onNextMessageBranch,
  onPreviousAnswerBranch,
  onNextAnswerBranch,
  onEdit,
  onRegenerate,
  onQuote,
  onDelete,
}: MessageActionDockProps) {
  return (
    <div className="absolute bottom-40 left-3 right-3 z-20 flex justify-end">
      <div className="flex max-w-full gap-1 overflow-x-auto rounded-md border bg-background/95 p-1 shadow-sm">
        <select aria-label="选择要操作的消息" className="h-10 min-w-0 max-w-[240px] flex-1 bg-transparent px-1 text-xs md:h-8" value={selectedItem.id} onChange={(event) => onSelect(event.target.value)}>
          {items.map((message, index) => <option key={message.id} value={message.id}>{message.role === 'user' ? '你' : '助手'} {index + 1}：{message.content.slice(0, 24)}</option>)}
        </select>
        {messageBranch ? (
          <>
            <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="上一个分支" title="上一个分支" onClick={onPreviousMessageBranch}><ArrowLeft className="size-3.5" /></Button>
            <span className="flex min-w-12 items-center justify-center text-xs tabular-nums">{messageBranch.index + 1}/{messageBranch.count}</span>
            <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="下一个分支" title="下一个分支" onClick={onNextMessageBranch}><ArrowRight className="size-3.5" /></Button>
          </>
        ) : null}
        {answerBranch ? (
          <>
            <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="上一个回答" title="上一个回答" onClick={onPreviousAnswerBranch}><ArrowLeft className="size-3.5" /></Button>
            <span className="flex min-w-16 items-center justify-center text-xs tabular-nums">回答 {answerBranch.index + 1}/{answerBranch.count}</span>
            <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="下一个回答" title="下一个回答" onClick={onNextAnswerBranch}><ArrowRight className="size-3.5" /></Button>
          </>
        ) : null}
        {selectedItem.canEdit ? (
          <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="编辑消息" title="编辑消息" onClick={onEdit}><Pencil className="size-3.5" /></Button>
        ) : null}
        {selectedItem.canRegenerate ? (
          <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="重新生成回答" title="重新生成回答" onClick={onRegenerate}><RefreshCw className="size-3.5" /></Button>
        ) : null}
        <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="引用消息" title="引用消息" onClick={onQuote}><Quote className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" className="size-10 shrink-0 text-destructive hover:text-destructive" aria-label="删除消息" title="删除消息" onClick={onDelete}><Trash2 className="size-3.5" /></Button>
      </div>
    </div>
  )
}
