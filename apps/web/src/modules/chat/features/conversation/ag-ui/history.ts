import { linxSourcesActivityId, LINX_SOURCES_ACTIVITY_TYPE } from '@linx/agent-runtime/ag-ui'
import type { Attachment, ThreadItem } from '@/lib/vendor/xpod-chatkit'
import { sourcesOfItem } from './thread-events'

/** AG-UI messages as the assistant-ui adapter reads them (structural subset). */
export type AgUiHistoryMessage =
  | { id: string; role: 'user'; content: string | Array<Record<string, unknown>> }
  | {
      id: string
      role: 'assistant'
      content?: string
      toolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
    }
  | { id: string; role: 'tool'; toolCallId: string; content: string }
  | { id: string; role: 'activity'; activityType: string; content: Record<string, unknown> }

export interface ConversationHistoryItem {
  item: ThreadItem
  /** Pod message URI: the AG-UI messageId. */
  uri: string
}

function attachmentPart(attachment: Attachment): Record<string, unknown> | null {
  const url = attachment.download_url ?? attachment.preview_url
  if (!url) return null
  const mimeType = attachment.mime_type || 'application/octet-stream'
  return {
    type: attachment.type === 'image' ? 'image' : 'document',
    source: { type: 'url', value: url, mimeType },
    metadata: { filename: attachment.name },
  }
}

/**
 * The persisted active branch of a topic as AG-UI messages. Ids are the Pod
 * message URIs, so a card or the "remember" button can point back at them.
 */
export function itemsToAgUiMessages(entries: readonly ConversationHistoryItem[]): AgUiHistoryMessage[] {
  const messages: AgUiHistoryMessage[] = []
  for (const { item, uri } of entries) {
    switch (item.type) {
      case 'user_message': {
        const text = item.content.map((part) => part.text).join('\n')
        const files = (item.attachments ?? []).flatMap((attachment) => {
          const part = attachmentPart(attachment)
          return part ? [part] : []
        })
        messages.push({
          id: uri,
          role: 'user',
          content: files.length > 0 ? [{ type: 'text', text }, ...files] : text,
        })
        break
      }
      case 'assistant_message': {
        messages.push({ id: uri, role: 'assistant', content: item.content.map((part) => part.text).join('') })
        const sources = sourcesOfItem(item)
        if (sources.length > 0) {
          messages.push({
            id: linxSourcesActivityId(uri),
            role: 'activity',
            activityType: LINX_SOURCES_ACTIVITY_TYPE,
            content: { sources },
          })
        }
        break
      }
      case 'client_tool_call': {
        const callId = item.call_id || item.id
        messages.push({
          id: uri,
          role: 'assistant',
          toolCalls: [{ id: callId, type: 'function', function: { name: item.name, arguments: JSON.stringify(item.arguments ?? {}) } }],
        })
        if (item.output !== undefined && item.output !== null) {
          messages.push({
            id: `${uri}#result`,
            role: 'tool',
            toolCallId: callId,
            content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output),
          })
        }
        break
      }
      default:
        break
    }
  }
  return messages
}
