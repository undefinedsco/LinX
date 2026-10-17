import { useState, type KeyboardEvent } from 'react'
import { AttachmentPrimitive, ComposerPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { AudioLines, Camera, FileText, Globe, ImagePlus, Mic, Paperclip, Quote, Send, Square, X } from 'lucide-react'
import { Command, CommandEmpty, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { useThreadList } from '../../../collections'
import { useOptionalConversationIdentity } from '../ConversationContext'
import { useWorkbenchDialogs } from '../workbench-dialogs'
import { SLASH_COMMANDS, useComposerTools, type SlashCommand } from './composer-tools'
import type { ComposerCitation } from '../useAskLinxIntoComposer'

function AttachmentChip() {
  const name = useAuiState((state) => state.attachment.name)
  const status = useAuiState((state) => state.attachment.status)
  const failed = status.type === 'incomplete'
  return (
    <AttachmentPrimitive.Root className={cn('inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 text-xs', failed && 'text-destructive')}>
      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="max-w-[200px] truncate">{name}</span>
      {status.type === 'running' ? <span className="text-muted-foreground">读取中</span> : null}
      {failed ? <span>打不开</span> : null}
      <AttachmentPrimitive.Remove className="rounded p-0.5 hover:bg-background" aria-label={`移除 ${name}`}>
        <X className="h-3 w-3" aria-hidden="true" />
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  )
}

const iconButton = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted'

/** `/` at the start of the message opens a small list of commands. */
function useSlashMenu() {
  const aui = useAui()
  const text = useAuiState((state) => state.composer.text)
  const { setWebSearch, setImageGeneration } = useComposerTools()
  const openDialog = useWorkbenchDialogs((state) => state.open)
  const identity = useOptionalConversationIdentity()
  const { data: threads = [] } = useThreadList(identity?.chatId ?? '', { enabled: Boolean(identity?.chatId) })
  const hasWorkspace = (threads as Array<{ id?: string | null; workspace?: string | null }>).some(
    (thread) => thread.id === identity?.threadId && Boolean(thread.workspace),
  )
  const [selected, setSelected] = useState<SlashCommand['id']>('generate-image')
  const isOpen = /^\/\S*$/u.test(text)
  const query = isOpen ? text.slice(1).trim().toLowerCase() : ''
  const commands = isOpen
    ? SLASH_COMMANDS.filter((command) => (command.id !== 'project-context' || hasWorkspace)).filter((command) => !query || `${command.label} ${command.keywords}`.toLowerCase().includes(query))
    : []
  const active = commands.some((command) => command.id === selected) ? selected : commands[0]?.id
  const run = (id: SlashCommand['id']) => {
    aui.composer().setText('')
    if (id === 'generate-image') setImageGeneration(true)
    else if (id === 'web-search') setWebSearch(true)
    else openDialog(id)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isOpen || commands.length === 0) return
    const index = commands.findIndex((command) => command.id === active)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + commands.length) % commands.length
      setSelected(commands[next].id)
    } else if (event.key === 'Enter' && !event.shiftKey && active) {
      event.preventDefault()
      run(active)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      aui.composer().setText('')
    }
  }
  return { isOpen: isOpen && commands.length > 0, commands, active, setSelected, run, onKeyDown }
}

/** 消息 · 发送 · 停止 — the WeChat-style input row. Attachments never block sending. */
export function Composer({ disabled, disabledReason, citation }: { disabled?: boolean; disabledReason?: string; citation?: ComposerCitation | null }) {
  const running = useAuiState((state) => state.thread.isRunning)
  const dictating = useAuiState((state) => state.composer.dictation != null)
  const { webSearch, setWebSearch, imageGeneration, setImageGeneration } = useComposerTools()
  const openDialog = useWorkbenchDialogs((state) => state.open)
  const slash = useSlashMenu()
  return (
    <ComposerPrimitive.Root className="bg-background px-4 pb-3 pt-1">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex flex-wrap gap-1.5 empty:hidden">
          {citation ? (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary/10 px-2 text-xs text-primary" data-testid="composer-citation">
              <Quote className="h-3.5 w-3.5" aria-hidden="true" />
              <button type="button" className="max-w-[200px] truncate hover:underline" title="打开引用的内容" onClick={citation.open}>{citation.label}</button>
              <button type="button" aria-label={`移除引用 ${citation.label}`} className="rounded p-0.5 hover:bg-background" onClick={citation.remove}>
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ) : null}
          <ComposerPrimitive.Attachments components={{ Attachment: AttachmentChip }} />
        </div>
        <div className="relative">
        {slash.isOpen ? (
          <Command shouldFilter={false} value={slash.active} onValueChange={(value) => slash.setSelected(value as SlashCommand['id'])} className="absolute bottom-full left-0 z-20 mb-2 h-auto w-64 rounded-lg border shadow-md">
            <CommandList aria-label="命令">
              <CommandEmpty>没有这个命令</CommandEmpty>
              {slash.commands.map((command) => (
                <CommandItem key={command.id} value={command.id} onSelect={() => slash.run(command.id)}>{command.label}</CommandItem>
              ))}
            </CommandList>
          </Command>
        ) : null}
        {/* Like WeChat's desktop input area: no divider or box, tools above the text, 发送 at the bottom right. */}
        <div>
          <div className="flex items-center gap-1">
            <ComposerPrimitive.AddAttachment
              aria-label="添加附件"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <Paperclip className="h-4 w-4" aria-hidden="true" />
            </ComposerPrimitive.AddAttachment>
            <button
              type="button"
              aria-label="生成图片"
              aria-pressed={imageGeneration}
              title="生成图片（只用于下一条消息）"
              onClick={() => setImageGeneration(!imageGeneration)}
              className={cn('inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs hover:bg-muted', imageGeneration ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" />{imageGeneration ? '图片' : null}
            </button>
            <button type="button" aria-label="截图记录" title="截图记录" onClick={() => openDialog('capture')} className={iconButton}>
              <Camera className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="联网搜索"
              aria-pressed={webSearch}
              title="联网搜索（只用于下一条消息）"
              onClick={() => setWebSearch(!webSearch)}
              className={cn('inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs hover:bg-muted', webSearch ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}
            >
              <Globe className="h-4 w-4" aria-hidden="true" />{webSearch ? '搜索' : null}
            </button>
            {dictating ? (
              <ComposerPrimitive.StopDictation aria-label="结束语音输入" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
              </ComposerPrimitive.StopDictation>
            ) : (
              <ComposerPrimitive.Dictate aria-label="语音输入" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:hidden">
                <Mic className="h-4 w-4" aria-hidden="true" />
              </ComposerPrimitive.Dictate>
            )}
            <button type="button" aria-label="语音对话" title="语音对话" onClick={() => openDialog('voice')} className={iconButton}>
              <AudioLines className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <ComposerPrimitive.Input
            rows={1}
            onKeyDown={slash.onKeyDown}
            maxRows={6}
            aria-label="消息"
            placeholder={disabled ? disabledReason ?? '暂时不能发送' : imageGeneration ? '描述想要的图片' : '消息'}
            disabled={disabled}
            className="block min-h-16 w-full resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="flex items-center justify-end">
            {running ? (
              <ComposerPrimitive.Cancel
                aria-label="停止"
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-muted"
              >
                <Square className="h-3 w-3" aria-hidden="true" />停止
              </ComposerPrimitive.Cancel>
            ) : (
              <ComposerPrimitive.Send
                aria-label="发送"
                disabled={disabled}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />发送
              </ComposerPrimitive.Send>
            )}
          </div>
        </div>
        </div>
      </div>
    </ComposerPrimitive.Root>
  )
}
