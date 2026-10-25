/**
 * Stable, muted colors for enum / select option chips (Heptabase / Notion style).
 * The data model stores no option color, so it is derived from the option value.
 * Class strings are literal so Tailwind keeps them; each has a dark-mode pair.
 */
export interface StructuredOptionTone {
  /** Chip: background + text. */
  chip: string
  /** Small dot / accent. */
  dot: string
}

export const STRUCTURED_OPTION_TONES: readonly StructuredOptionTone[] = [
  { chip: 'bg-gray-500/15 text-gray-700 dark:text-gray-300', dot: 'bg-gray-500' },
  { chip: 'bg-amber-500/15 text-amber-800 dark:text-amber-300', dot: 'bg-amber-500' },
  { chip: 'bg-orange-500/15 text-orange-800 dark:text-orange-300', dot: 'bg-orange-500' },
  { chip: 'bg-rose-500/15 text-rose-800 dark:text-rose-300', dot: 'bg-rose-500' },
  { chip: 'bg-pink-500/15 text-pink-800 dark:text-pink-300', dot: 'bg-pink-500' },
  { chip: 'bg-purple-500/15 text-purple-800 dark:text-purple-300', dot: 'bg-purple-500' },
  { chip: 'bg-blue-500/15 text-blue-800 dark:text-blue-300', dot: 'bg-blue-500' },
  { chip: 'bg-teal-500/15 text-teal-800 dark:text-teal-300', dot: 'bg-teal-500' },
  { chip: 'bg-green-500/15 text-green-800 dark:text-green-300', dot: 'bg-green-500' },
]

/** Drops the pending-proposal `*` suffix and surrounding space so a value keeps its color. */
function normalizeOptionValue(value: string) {
  return value.trim().replace(/\*+$/, '').trim().toLowerCase()
}

export function structuredOptionTone(value: string): StructuredOptionTone {
  const key = normalizeOptionValue(value)
  // FNV-1a
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return STRUCTURED_OPTION_TONES[(hash >>> 0) % STRUCTURED_OPTION_TONES.length]
}
