const UNTITLED_CHAT_NAMES = new Set([
  'AI Secretary',
  'Default Chat',
  '未命名聊天',
  '新聊天',
])

export function shouldAutoTitleChat(title: unknown): boolean {
  return typeof title !== 'string' || !title.trim() || UNTITLED_CHAT_NAMES.has(title.trim())
}

export function summarizeConversationTitle(content: string, maxLength = 24): string | null {
  const normalized = content
    .replace(/```[\s\S]*?```/g, ' 代码 ')
    .replace(/https?:\/\/\S+/g, ' 链接 ')
    .replace(/\s+/g, ' ')
    .replace(/^[，。！？、：；,.!?;:\s]+|[，。！？、：；,.!?;:\s]+$/g, '')
    .trim()
  if (!normalized) return null

  const firstSentence = normalized.split(/[。！？!?\n]/, 1)[0]?.trim() || normalized
  return firstSentence.length > maxLength
    ? `${firstSentence.slice(0, maxLength).trim()}…`
    : firstSentence
}
