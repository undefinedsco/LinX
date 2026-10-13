import { AttachmentPrimitive, BranchPickerPrimitive, MessagePrimitive, useAuiState } from '@assistant-ui/react'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { ChevronLeft, ChevronRight, FileText, Loader2, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isLinxCardPart, LinxCardPart } from '../cards/CardCatalog'
import { useOptionalConversationIdentity } from '../ConversationContext'
import { MarkdownText, PlainText } from './MarkdownText'
import { MessageToolbar } from './MessageToolbar'
import { ProcessLine } from './ProcessLine'
import { SourcesLine } from './SourcesLine'
import { useSpeakerName } from './speaker'

function Avatar({ name, assistant }: { name: string; assistant: boolean }) {
  // Assistants always show “AI” (W5: only the avatar tells people and assistants apart).
  const initial = Array.from(name.trim())[0] ?? '我'
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-md text-[13px] font-semibold',
        assistant ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
      )}
    >
      {assistant ? 'AI' : initial}
    </span>
  )
}

/** Tool work stays one quiet line; the process line already summarises it. */
function ToolLine(props: ToolCallMessagePartProps) {
  if (isLinxCardPart(props)) return <LinxCardPart {...props} />
  const running = props.result === undefined
  return (
    <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
      {running ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Wrench className="h-3 w-3" aria-hidden="true" />}
      {running ? `正在用 ${props.toolName}…` : `用了 ${props.toolName}`}
    </p>
  )
}

function Reasoning({ text }: { text: string }) {
  if (!text) return null
  return (
    <details className="max-w-[440px] px-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">思考过程</summary>
      <p className="mt-1 whitespace-pre-wrap">{text}</p>
    </details>
  )
}

function FileChip() {
  const name = useAuiState((state) => state.attachment.name)
  return (
    <AttachmentPrimitive.Root className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 text-xs">
      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="max-w-[220px] truncate">{name}</span>
    </AttachmentPrimitive.Root>
  )
}

function BranchPicker() {
  return (
    <BranchPickerPrimitive.Root hideWhenSingleBranch className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <BranchPickerPrimitive.Previous className="rounded p-0.5 hover:bg-muted" aria-label="上一个版本"><ChevronLeft className="h-3.5 w-3.5" /></BranchPickerPrimitive.Previous>
      <span><BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count /></span>
      <BranchPickerPrimitive.Next className="rounded p-0.5 hover:bg-muted" aria-label="下一个版本"><ChevronRight className="h-3.5 w-3.5" /></BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  )
}

function Speaker({ role }: { role: 'user' | 'assistant' }) {
  const name = useSpeakerName(role)
  if (!name) return null
  return <span className="px-1 text-xs text-muted-foreground" data-testid="speaker-name">{name}</span>
}

export function UserMessage() {
  const messageId = useAuiState((state) => state.message.id)
  const identity = useOptionalConversationIdentity()
  const speaker = useSpeakerName('user')
  return (
    <MessagePrimitive.Root className="group/message flex items-start justify-end gap-2.5" data-role="user" data-message-id={messageId}>
      <div className="flex min-w-0 max-w-[68%] flex-col items-end gap-1.5">
        <Speaker role="user" />
        <MessagePrimitive.Parts components={{ Text: PlainText }} />
        <div className="flex flex-wrap justify-end gap-1.5">
          <MessagePrimitive.Attachments components={{ Attachment: FileChip }} />
        </div>
        <MessageToolbar role="user" />
      </div>
      <Avatar name={speaker ?? identity?.selfName ?? '我'} assistant={false} />
    </MessagePrimitive.Root>
  )
}

export function AssistantMessage() {
  const messageId = useAuiState((state) => state.message.id)
  const identity = useOptionalConversationIdentity()
  const running = useAuiState((state) => state.message.status?.type === 'running')
  const empty = useAuiState((state) => state.message.content.length === 0)
  const hasText = useAuiState((state) => state.message.content.some((part) => part.type === 'text' && part.text.trim().length > 0))
  const error = useAuiState((state) => {
    const status = state.message.status
    return status?.type === 'incomplete' && status.reason === 'error' ? status.error : undefined
  })
  return (
    <MessagePrimitive.Root className="group/message flex items-start gap-2.5" data-role="assistant" data-message-id={messageId}>
      <Avatar name={identity?.agentName ?? 'AI'} assistant />
      <div className="flex min-w-0 max-w-[72%] flex-col items-start gap-1.5">
        <Speaker role="assistant" />
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            Reasoning: ({ text }) => <Reasoning text={text} />,
            tools: { Override: ToolLine },
            data: {
              by_name: {
                'agui-activity/linx-progress': ({ name, data }) => <ProcessLine name={name} data={data} />,
                'agui-activity/linx-sources': ({ name, data }) => <SourcesLine name={name} data={data} />,
              },
              Fallback: () => null,
            },
          }}
        />
        {identity?.isGroup && !running && hasText ? (
          <p className="px-1 text-xs text-muted-foreground">只用了这个群里的消息</p>
        ) : null}
        {running && empty ? (
          <p role="status" className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />正在处理…
          </p>
        ) : null}
        {error ? <p role="alert" className="px-1 text-xs text-destructive">{typeof error === 'string' ? error : '这次没有完成，可以重试。'}</p> : null}
        <div className="flex items-center gap-2">
          <MessageToolbar role="assistant" />
          <BranchPicker />
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}
