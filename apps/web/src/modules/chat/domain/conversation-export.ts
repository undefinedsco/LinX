import { formatErrorForUser } from '@/lib/user-facing-errors'

export interface ConversationExportMessage {
  id?: string | null
  role?: string | null
  content?: string | null
  createdAt?: Date | string | null
  richContent?: string | null
}

export interface ConversationExportOptions {
  title: string
  includeToolDetails?: boolean
  excludedMessageIds?: ReadonlySet<string>
}

const SENSITIVE_KEY = /api[-_]?key|authorization|cookie|credential|password|secret|token/iu

function redactSensitive(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY.test(key)) return '[已排除敏感值]'
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redactSensitive(child, childKey)]))
  }
  return value
}

function displayRole(role: string): string {
  if (role === 'user') return '用户'
  if (role === 'assistant') return 'LinX'
  return '工具活动'
}

function selectedMessages(messages: ConversationExportMessage[], options: ConversationExportOptions) {
  return messages.filter((message) => {
    if (message.id && options.excludedMessageIds?.has(message.id)) return false
    return message.role === 'user' || message.role === 'assistant' || options.includeToolDetails === true
  })
}

function exportContent(message: ConversationExportMessage): string {
  const content = message.content?.trim() || '（无文本内容）'
  if (
    message.role === 'assistant'
    && /(?:ACP process|process exited|private stack|require stack|cannot find module|findById|\/Users\/|\\Users\\|\bError:\s|\bid=\d+\b|\.tsx?:\d+|\.jsx?:\d+)/iu.test(content)
  ) return formatErrorForUser(content, '消息生成失败。请稍后重试。')
  return content
}

function toolDetails(message: ConversationExportMessage): string | null {
  if (!message.richContent) return null
  try {
    return JSON.stringify(redactSensitive(JSON.parse(message.richContent)), null, 2)
  } catch {
    return null
  }
}

export function renderConversationMarkdown(messages: ConversationExportMessage[], options: ConversationExportOptions): string {
  const sections = selectedMessages(messages, options).map((message) => {
    const role = displayRole(message.role ?? '')
    const time = message.createdAt ? new Date(message.createdAt).toLocaleString() : ''
    const details = options.includeToolDetails ? toolDetails(message) : null
    return [`## ${role}${time ? ` · ${time}` : ''}`, '', exportContent(message), details ? `\n\n<details><summary>结构化活动</summary>\n\n\`\`\`json\n${details}\n\`\`\`\n</details>` : ''].join('\n')
  })
  return [`# ${options.title}`, '', `导出时间：${new Date().toLocaleString()}`, '', ...sections].join('\n').trimEnd() + '\n'
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char))
}

export function renderConversationHtml(messages: ConversationExportMessage[], options: ConversationExportOptions): string {
  const body = selectedMessages(messages, options).map((message) => {
    const details = options.includeToolDetails ? toolDetails(message) : null
    return `<article><header>${escapeHtml(displayRole(message.role ?? ''))}</header><div class="content">${escapeHtml(exportContent(message))}</div>${details ? `<details><summary>结构化活动</summary><pre>${escapeHtml(details)}</pre></details>` : ''}</article>`
  }).join('\n')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;"><title>${escapeHtml(options.title)}</title><style>body{max-width:820px;margin:0 auto;padding:40px 24px;font:16px/1.7 system-ui;color:#171717}h1{font-size:28px}article{padding:20px 0;border-top:1px solid #e5e5e5}header{font-weight:650;margin-bottom:8px}.content{white-space:pre-wrap;overflow-wrap:anywhere}details{margin-top:12px}pre{overflow:auto;padding:12px;background:#f5f5f5;border-radius:8px}@media print{body{padding:0}article{break-inside:avoid}}</style></head><body><h1>${escapeHtml(options.title)}</h1><p>由 LinX 导出 · ${escapeHtml(new Date().toLocaleString())}</p>${body}</body></html>`
}

export function safeConversationFileName(title: string): string {
  return (title.trim() || 'LinX 会话').replace(/[\\/:*?"<>|]/gu, '-').slice(0, 80)
}
