/** The default assistant is stored as “LinX 主理人”; the product calls it LinX 助手. */
export const LINX_ASSISTANT_DISPLAY_NAME = 'LinX 助手'
const LEGACY_SECRETARY_NAMES = new Set(['LinX 主理人', 'AI Secretary', 'Secretary'])

export function displayAssistantName(name?: string | null): string {
  const trimmed = name?.trim()
  if (!trimmed || LEGACY_SECRETARY_NAMES.has(trimmed)) return LINX_ASSISTANT_DISPLAY_NAME
  return trimmed
}
