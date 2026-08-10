import type { Attachment } from '@/lib/vendor/xpod-chatkit'

interface MessageWithAssets {
  id?: string
  thread?: string | null
  chat?: string | null
  createdAt?: string | Date | null
  richContent?: string | null
}

export interface ChatAsset extends Attachment {
  pod_url: string
  messageId: string | null
  threadRef: string | null
  chatRef: string | null
  createdAt: string | null
}

function parsedRichContent(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function isoDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'string' || !value) return null
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString()
}

function attachmentFrom(value: unknown): Attachment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (
    typeof record.id !== 'string'
    || typeof record.name !== 'string'
    || typeof record.mime_type !== 'string'
    || (record.type !== 'image' && record.type !== 'file')
  ) return null
  return {
    id: record.id,
    name: record.name,
    mime_type: record.mime_type,
    type: record.type,
    ...(record.type === 'image' && typeof record.preview_url === 'string' ? { preview_url: record.preview_url } : {}),
  } as Attachment
}

export function projectChatAssets(messages: MessageWithAssets[], podBaseUrl: string): ChatAsset[] {
  const root = podBaseUrl.replace(/\/+$/u, '')
  const byId = new Map<string, ChatAsset>()
  for (const message of messages) {
    const richContent = parsedRichContent(message.richContent)
    const attachments = Array.isArray(richContent?.attachments) ? richContent.attachments : []
    for (const raw of attachments) {
      const attachment = attachmentFrom(raw)
      if (!attachment) continue
      const podUrl = `${root}/.data/chat-attachments/${encodeURIComponent(attachment.id)}`
      const next: ChatAsset = {
        ...attachment,
        pod_url: podUrl,
        ...(attachment.type === 'image' ? { preview_url: podUrl } : {}),
        messageId: typeof message.id === 'string' ? message.id : null,
        threadRef: typeof message.thread === 'string' ? message.thread : null,
        chatRef: typeof message.chat === 'string' ? message.chat : null,
        createdAt: isoDate(message.createdAt),
      }
      const existing = byId.get(next.id)
      if (!existing || (next.createdAt ?? '') > (existing.createdAt ?? '')) byId.set(next.id, next)
    }
  }
  return [...byId.values()].sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? '') || left.name.localeCompare(right.name))
}
