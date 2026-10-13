import { diffChars, diffLines } from 'diff'

export interface MethodChangePart {
  value: string
  kind: 'same' | 'added' | 'removed'
}

/**
 * Change preview shown before a method is saved. Short methods diff by
 * character (Chinese has no word spacing); long ones diff by line so the
 * preview stays readable.
 */
export function diffMethod(previous: string, next: string): MethodChangePart[] {
  const parts = previous.length + next.length > 800 ? diffLines(previous, next) : diffChars(previous, next)
  return parts.map((part) => ({
    value: part.value,
    kind: part.added ? 'added' : part.removed ? 'removed' : 'same',
  }))
}

export function hasMethodChanged(previous: string, next: string): boolean {
  return previous.trim() !== next.trim()
}

/**
 * A method is still stored as one text (the assistant's instructions), written
 * as plain Markdown sections so any runtime reads it as-is. Older free-form
 * text that has no sections is kept whole under 补充说明.
 */
export interface MethodSections {
  goal: string
  criteria: string[]
  exceptions: string
  notes: string
}

const SECTION_TITLES = {
  goal: '目标',
  criteria: '判断标准',
  exceptions: '例外',
  notes: '补充说明',
} as const

type SectionKey = keyof typeof SECTION_TITLES

const TITLE_TO_KEY = new Map<string, SectionKey>(
  (Object.entries(SECTION_TITLES) as Array<[SectionKey, string]>).map(([key, title]) => [title, key]),
)

export function emptyMethodSections(): MethodSections {
  return { goal: '', criteria: [], exceptions: '', notes: '' }
}

export function parseMethodSections(text: string): MethodSections {
  const source = text.replace(/\r\n/gu, '\n').trim()
  const sections = emptyMethodSections()
  if (!source) return sections

  const headingPattern = /^##\s+(.+?)\s*$/gmu
  const headings = [...source.matchAll(headingPattern)].filter((match) => TITLE_TO_KEY.has(match[1].trim()))
  if (headings.length === 0) {
    sections.notes = source
    return sections
  }

  const leading = source.slice(0, headings[0].index).trim()
  const notes: string[] = leading ? [leading] : []
  headings.forEach((match, index) => {
    const key = TITLE_TO_KEY.get(match[1].trim()) as SectionKey
    const start = (match.index ?? 0) + match[0].length
    const end = index + 1 < headings.length ? headings[index + 1].index : source.length
    const body = source.slice(start, end).trim()
    if (key === 'criteria') {
      sections.criteria = body
        .split('\n')
        .map((line) => line.replace(/^\s*[-*]\s*/u, '').trim())
        .filter(Boolean)
    } else if (key === 'notes') {
      if (body) notes.push(body)
    } else {
      sections[key] = body
    }
  })
  sections.notes = notes.join('\n\n')
  return sections
}

export function serializeMethodSections(sections: MethodSections): string {
  const parts: string[] = []
  if (sections.goal.trim()) parts.push(`## ${SECTION_TITLES.goal}\n${sections.goal.trim()}`)
  const criteria = sections.criteria.map((item) => item.trim()).filter(Boolean)
  if (criteria.length > 0) parts.push(`## ${SECTION_TITLES.criteria}\n${criteria.map((item) => `- ${item}`).join('\n')}`)
  if (sections.exceptions.trim()) parts.push(`## ${SECTION_TITLES.exceptions}\n${sections.exceptions.trim()}`)
  if (sections.notes.trim()) parts.push(`## ${SECTION_TITLES.notes}\n${sections.notes.trim()}`)
  return parts.join('\n\n')
}
