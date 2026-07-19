import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Image as ImageIcon, Loader2, Paperclip } from 'lucide-react'
import { resolveRowSubject } from '@undefineds.co/drizzle-solid'
import { extractChatIdFromChatRef, extractThreadIdFromThreadRef } from '@undefineds.co/models'
import { useToast } from '@/components/ui/use-toast'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import { useMessageList } from '../collections'
import { Inputbar, type InputbarFile } from './Inputbar'
import { MarkdownRenderer } from './Markdown'

export type LocalChatAgent = {
  provider?: string
  model?: string
}

type LocalChatStreamEvent =
  | { event: 'user_message'; data: { id?: string } }
  | { event: 'assistant_delta'; data: { id?: string; delta?: string } }
  | { event: 'assistant_done'; data: { id?: string; content?: string } }
  | { event: 'error'; data: { error?: string } }
  | { event: 'done'; data: { ok?: boolean } }
  | { event: string; data: Record<string, unknown> }

type LocalChatAttachmentPayload = {
  filename: string
  mimeType: string
  dataUrl: string
  fileData: string
}

type LocalChatMessageAttachment = Pick<LocalChatAttachmentPayload, 'filename' | 'mimeType' | 'dataUrl'>

type LocalChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  richContent?: string
  createdAt: string
  attachments?: LocalChatMessageAttachment[]
}

type PersistedLocalChatMessage = {
  id?: string
  role?: string
  content?: string
  richContent?: string
  createdAt?: string | Date
}

export function resolveLocalChatAgent(metadata: unknown): LocalChatAgent {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {}
  }

  const agent = (metadata as Record<string, unknown>).agent
  if (!agent || typeof agent !== 'object' || Array.isArray(agent)) {
    return {}
  }

  return {
    provider: typeof (agent as Record<string, unknown>).provider === 'string'
      ? (agent as Record<string, unknown>).provider as string
      : undefined,
    model: typeof (agent as Record<string, unknown>).model === 'string'
      ? (agent as Record<string, unknown>).model as string
      : undefined,
  }
}

export function LocalChatPanel({
  chatId,
  threadId,
  maker,
  agent,
}: {
  chatId: string
  threadId: string
  maker: string
  agent?: LocalChatAgent
}) {
  const { toast } = useToast()
  const { db } = useSolidDatabase()
  const persistedMessages = useMessageList(chatId, threadId)
  const [xpodMessages, setXpodMessages] = useState<PersistedLocalChatMessage[]>([])
  const localChatId = useMemo(() => normalizeChatIdForLocalChat(chatId), [chatId])
  const localThreadId = useMemo(() => normalizeThreadIdForLocalChat(threadId), [threadId])
  const persistedMessageRows = xpodMessages.length > 0 ? xpodMessages : (persistedMessages.data ?? [])
  const messages = useMemo(() => persistedMessageRows.map((message) => ({
    id: message.id ?? resolveRowSubject(message as Record<string, unknown>) ?? undefined,
    role: typeof message.role === 'string' ? message.role : 'user',
    content: typeof message.content === 'string' ? message.content : '',
    richContent: typeof message.richContent === 'string' ? message.richContent : undefined,
    createdAt: message.createdAt,
  })), [persistedMessageRows])
  const isLoading = persistedMessages.isLoading
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<InputbarFile[]>([])
  const [isSending, setIsSending] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<InputbarFile[]>([])
  const [localMessages, setLocalMessages] = useState<LocalChatMessage[]>([])

  const messageData = useMemo(() => {
    const localById = new Map(localMessages.map((message) => [message.id, message]))
    const persisted: LocalChatMessage[] = messages.map((message) => {
      const id = message.id ?? resolveRowSubject(message as Record<string, unknown>) ?? crypto.randomUUID()
      const role: LocalChatMessage['role'] =
        message.role === 'assistant' || message.role === 'system' ? message.role : 'user'
      return {
        id,
        role,
        content: typeof message.content === 'string' ? message.content : '',
        createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : String(message.createdAt ?? ''),
        attachments: localById.get(id)?.attachments ?? parseLocalChatRichContentAttachments(message.richContent),
      }
    })
    const persistedIds = new Set(persisted.map((message) => message.id))
    return persisted.concat(localMessages.filter((message) => !persistedIds.has(message.id)))
  }, [localMessages, messages])

  const handleSend = useCallback(async () => {
    const content = input.trim()
    const outgoingFiles = files
    if ((!content && outgoingFiles.length === 0) || isSending) return

    try {
      setInput('')
      setIsSending(true)

      if (!db) {
        throw new Error('Solid database is not ready.')
      }
      const authFetch = getSolidAuthenticatedFetch(db)
      if (!authFetch) {
        throw new Error('Solid authenticated fetch is not ready.')
      }

      const tempUserId = crypto.randomUUID()
      const attachments = await Promise.all(outgoingFiles.map(inputbarFileToLocalChatAttachment))
      setLocalMessages((current) => current.concat({
        id: tempUserId,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
        attachments,
      }))

      const tempAssistantId = crypto.randomUUID()
      setFiles([])
      revokeInputbarFiles(outgoingFiles)

      const response = await authFetch('http://localhost:5737/v1/linx/local-chat', {
        method: 'POST',
        headers: {
          'Accept': 'text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: localChatId,
          threadId: localThreadId,
          webId: maker,
          content,
          ...(attachments.length > 0 ? { attachments } : {}),
          ...(agent?.provider ? { provider: agent.provider } : {}),
          ...(agent?.model ? { model: agent.model } : {}),
          stream: true,
        }),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`Local chat API failed: ${response.status} ${text.slice(0, 200)}`)
      }

      if (response.body) {
        setLocalMessages((current) => current.concat({
          id: tempAssistantId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
        }))

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const blocks = buffer.split(/\r?\n\r?\n/)
          buffer = blocks.pop() ?? ''

          for (const event of parseLocalChatSseEvents(blocks.join('\n\n'))) {
            if (event.event === 'user_message' && typeof event.data.id === 'string') {
              const persistedUserId = event.data.id
              setLocalMessages((current) => current.map((message) => (
                message.id === tempUserId ? { ...message, id: persistedUserId } : message
              )))
            }

            if (event.event === 'assistant_delta' && typeof event.data.delta === 'string') {
              const assistantId = typeof event.data.id === 'string' ? event.data.id : tempAssistantId
              setLocalMessages((current) => current.map((message) => (
                message.id === tempAssistantId || message.id === assistantId
                  ? {
                      ...message,
                      id: assistantId,
                      content: `${message.content}${event.data.delta as string}`,
                    }
                  : message
              )))
            }

            if (event.event === 'assistant_done') {
              const assistantId = typeof event.data.id === 'string' ? event.data.id : tempAssistantId
              const assistantContent = typeof event.data.content === 'string' ? event.data.content : null
              setLocalMessages((current) => current.map((message) => (
                message.id === tempAssistantId || message.id === assistantId
                  ? {
                      ...message,
                      id: assistantId,
                      ...(assistantContent !== null ? { content: assistantContent } : {}),
                    }
                  : message
              )))
              void persistedMessages.refetch()
            }

            if (event.event === 'error') {
              const errorMessage = typeof event.data.error === 'string'
                ? event.data.error
                : 'Local chat stream failed'
              setLocalMessages((current) => current.map((message) => (
                message.id === tempAssistantId
                  ? {
                      ...message,
                      role: 'system',
                      content: `模型服务暂时不可用，消息已保存。${errorMessage}`,
                    }
                  : message
              )))
              void persistedMessages.refetch()
              return
            }
          }
        }

        return
      }

      const result = await response.json() as {
        userMessage?: { id?: string; content?: string }
        assistantMessage?: { id?: string; content?: string }
      }
      setLocalMessages((current) => {
        const next = current.map((message) => (
          message.id === tempUserId && result.userMessage?.id
            ? { ...message, id: result.userMessage.id }
            : message
        ))
        if (result.assistantMessage?.id && result.assistantMessage.content) {
          next.push({
            id: result.assistantMessage.id,
            role: 'assistant',
            content: result.assistantMessage.content,
            createdAt: new Date().toISOString(),
          })
        }
        void persistedMessages.refetch()
        return next
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送失败，请稍后重试。'
      toast({
        title: '发送消息失败',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setIsSending(false)
    }
  }, [agent?.model, agent?.provider, db, files, input, isSending, localChatId, localThreadId, maker, persistedMessages, toast])

  const appendFiles = useCallback((selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return
    setFiles((current) => current.concat(buildInputbarFiles(selectedFiles)))
  }, [])

  const handleImageInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    appendFiles(Array.from(event.currentTarget.files ?? []))
    event.currentTarget.value = ''
  }, [appendFiles])

  const handleFileInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    appendFiles(Array.from(event.currentTarget.files ?? []))
    event.currentTarget.value = ''
  }, [appendFiles])

  useEffect(() => {
    filesRef.current = files
  }, [files])

  useEffect(() => {
    return () => revokeInputbarFiles(filesRef.current)
  }, [])

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return
    if (!localChatId.startsWith('http://localhost:5737/')) return

    const controller = new AbortController()
    const params = new URLSearchParams({
      chatId: localChatId,
      threadId: localThreadId,
      webId: maker,
    })

    const authFetch = getSolidAuthenticatedFetch(db)
    if (!authFetch) return

    authFetch(`http://localhost:5737/v1/linx/local-chat/messages?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return
        const payload = await response.json() as { messages?: PersistedLocalChatMessage[] }
        setXpodMessages(Array.isArray(payload.messages) ? payload.messages : [])
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.warn('[LocalChat] Failed to fetch xpod messages:', error)
      })

    return () => controller.abort()
  }, [db, localChatId, localThreadId, maker])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {isLoading && messageData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : messageData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p className="text-sm">暂无消息，输入内容开始本地聊天留档。</p>
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end gap-3">
            {messageData.map((message) => {
              const isUser = message.role === 'user'
              return (
                <div
                  key={message.id}
                  className={isUser ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={
                      isUser
                        ? 'max-w-[75%] rounded-2xl bg-primary px-4 py-2 text-sm leading-relaxed text-primary-foreground'
                        : 'max-w-[75%] rounded-2xl border border-border/50 bg-muted px-4 py-2 text-sm leading-relaxed text-foreground'
                    }
                  >
                    <LocalChatMessageContent
                      role={message.role}
                      content={message.content}
                      attachments={message.attachments}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleImageInputChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
      <Inputbar
        value={input}
        onChange={setInput}
        onSend={handleSend}
        disabled={isSending}
        isGenerating={isSending}
        placeholder="输入消息..."
        files={files}
        onFilesChange={setFiles}
        toolsProps={{
          groups: [{
            id: 'media',
            items: [
              { id: 'image', icon: ImageIcon, label: '图片', onClick: () => imageInputRef.current?.click() },
              { id: 'file', icon: Paperclip, label: '文件', onClick: () => fileInputRef.current?.click() },
            ],
          }],
        }}
      />
    </div>
  )
}

function normalizeThreadIdForLocalChat(threadId: string): string {
  return extractThreadIdFromThreadRef(threadId)
    ?? (threadId.includes('#') ? threadId.split('#').pop() || threadId : threadId)
}

function normalizeChatIdForLocalChat(chatId: string): string {
  const documentMatch = chatId.match(/https?:\/\/[^#\s]+\/\.data\/chat\/[^#\s]+(?:\.ttl|\/index\.ttl)(?:#.*)?$/)
  if (documentMatch) {
    return chatId
  }

  const parsed = extractChatIdFromChatRef(chatId)
  if (parsed && parsed !== 'this') {
    return parsed
  }

  return chatId.includes('#') ? chatId.split('#').pop() || chatId : chatId
}

function getSolidAuthenticatedFetch(db: unknown): typeof fetch | null {
  const authFetch = (db as any)?.getDialect?.()?.getAuthenticatedFetch?.()
  return typeof authFetch === 'function' ? authFetch : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseLocalChatRichContentAttachments(richContent: unknown): LocalChatMessageAttachment[] {
  if (typeof richContent !== 'string' || !richContent.trim()) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(richContent)
  } catch {
    return []
  }

  if (!isRecord(parsed)) return []
  const rawItems = Array.isArray(parsed.items)
    ? parsed.items
    : Array.isArray(parsed.blocks)
      ? parsed.blocks
      : []

  return rawItems
    .filter(isRecord)
    .map((item): LocalChatMessageAttachment | null => {
      const metadata = isRecord(item.metadata) ? item.metadata : {}
      const type = pickString(item.type)
      const filename = pickString(item.fileName)
        ?? pickString(metadata.filename)
        ?? pickString(item.filename)
        ?? '附件'
      const mimeType = pickString(item.mimeType)
        ?? pickString(metadata.mimeType)
        ?? (type === 'image' ? 'image/*' : 'application/octet-stream')
      const dataUrl = pickString(item.url)
        ?? pickString(item.dataUrl)
        ?? pickString(item.fileUrl)

      if (!dataUrl?.startsWith('data:')) return null
      return { filename, mimeType, dataUrl }
    })
    .filter((attachment): attachment is LocalChatMessageAttachment => attachment !== null)
}

function parseLocalChatSseEvents(chunk: string): LocalChatStreamEvent[] {
  return chunk
    .split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map((eventBlock) => {
      let event = 'message'
      const dataLines: string[] = []

      for (const line of eventBlock.split(/\r?\n/)) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim())
        }
      }

      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(dataLines.join('\n'))
      } catch {
        data = {}
      }

      return { event, data } as LocalChatStreamEvent
    })
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read attachment as ArrayBuffer.'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read attachment.'))
    reader.readAsArrayBuffer(file)
  })
}

async function inputbarFileToLocalChatAttachment(input: InputbarFile): Promise<LocalChatAttachmentPayload> {
  const mimeType = input.file.type || 'application/octet-stream'
  const fileData = arrayBufferToBase64(await readFileAsArrayBuffer(input.file))
  return {
    filename: input.file.name,
    mimeType,
    dataUrl: `data:${mimeType};base64,${fileData}`,
    fileData,
  }
}

function buildInputbarFiles(selectedFiles: File[]): InputbarFile[] {
  return selectedFiles.map((file) => ({
    id: `${Date.now()}-${crypto.randomUUID()}`,
    file,
    preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
  }))
}

function revokeInputbarFiles(files: InputbarFile[]): void {
  files.forEach((file) => {
    if (file.preview) URL.revokeObjectURL(file.preview)
  })
}

function LocalChatMessageContent({
  role,
  content,
  attachments = [],
}: {
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: LocalChatMessageAttachment[]
}) {
  if (role === 'user') {
    return (
      <div className="space-y-2">
        {content && <div className="whitespace-pre-wrap break-words">{content}</div>}
        <LocalChatMessageAttachments attachments={attachments} />
      </div>
    )
  }

  return (
    <MarkdownRenderer
      content={content}
      className="break-words [&_ol]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:max-w-full [&_ul]:my-1"
    />
  )
}

function LocalChatMessageAttachments({
  attachments,
}: {
  attachments: LocalChatMessageAttachment[]
}) {
  if (attachments.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {attachments.map((attachment) => {
        const isImage = attachment.mimeType.startsWith('image/') && attachment.dataUrl
        if (isImage) {
          return (
            <figure key={`${attachment.filename}-${attachment.dataUrl}`} className="space-y-1">
              <img
                src={attachment.dataUrl}
                alt={attachment.filename}
                className="max-h-64 max-w-full rounded-lg border border-white/30 object-contain"
              />
              <figcaption className="max-w-72 truncate text-xs text-primary-foreground/80">
                {attachment.filename}
              </figcaption>
            </figure>
          )
        }

        return (
          <div
            key={attachment.filename}
            className="max-w-72 truncate rounded-md border border-white/25 bg-white/10 px-2 py-1 text-xs text-primary-foreground/90"
          >
            {attachment.filename}
          </div>
        )
      })}
    </div>
  )
}
