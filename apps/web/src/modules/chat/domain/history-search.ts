/** 查找聊天记录: filters one conversation's messages by text, files or images. */
export type HistoryTab = 'all' | 'file' | 'image'

export interface HistoryMessage {
  id: string
  content?: string | null
  createdAt?: string | Date | null
}

export interface HistoryAsset {
  id: string
  name: string
  type: 'image' | 'file'
  messageId: string | null
  url: string
}

export function searchHistoryText(messages: readonly HistoryMessage[], query: string, limit = 50): HistoryMessage[] {
  const term = query.trim().toLocaleLowerCase()
  if (!term) return []
  return messages
    .filter((message) => typeof message.content === 'string' && message.content.toLocaleLowerCase().includes(term))
    .slice(0, limit)
}

export function filterHistoryAssets(assets: readonly HistoryAsset[], tab: Exclude<HistoryTab, 'all'>, query: string): HistoryAsset[] {
  const term = query.trim().toLocaleLowerCase()
  return assets.filter((asset) => asset.type === tab && (!term || asset.name.toLocaleLowerCase().includes(term)))
}

/** A short snippet around the first hit. */
export function snippetAround(content: string, query: string, radius = 24): string {
  const index = content.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase())
  if (index < 0) return content.slice(0, radius * 2)
  const start = Math.max(0, index - radius)
  const end = Math.min(content.length, index + query.trim().length + radius)
  return `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`
}
