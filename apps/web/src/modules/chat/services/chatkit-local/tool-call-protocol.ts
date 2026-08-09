import type { ClientToolCallItem, ThreadItem } from '@/lib/vendor/xpod-chatkit'

type ToolArguments = Record<string, unknown>

function isRecord(value: unknown): value is ToolArguments {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Normalize runtime JSON strings to the structured arguments ChatKit expects. */
export function normalizeToolCallArguments(value: unknown): ToolArguments {
  if (isRecord(value)) return value

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return {}
    try {
      const parsed = JSON.parse(trimmed) as unknown
      return isRecord(parsed) ? parsed : { value: parsed }
    } catch {
      return { raw: value }
    }
  }

  return value === undefined ? {} : { value }
}

/** Upgrade historical string-based tool items while replaying them from Pod. */
export function normalizeClientToolCallItem(item: ThreadItem): ThreadItem {
  if (item.type !== 'client_tool_call') return item
  return {
    ...item,
    arguments: normalizeToolCallArguments(item.arguments),
  } satisfies ClientToolCallItem
}
