export type MarkdownishTask = {
  checked: boolean
  text: string
}

export type MarkdownishTable = {
  headers: string[]
  rows: string[][]
}

export type MarkdownishImage = {
  alt: string
  src: string
  title?: string
}

export type MarkdownishReference = {
  label: string
  href: string
  note?: string
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeBracketText(value: string): string {
  return normalizeInlineText(value).replace(/([\\\]])/g, '\\$1')
}

function escapeParenUrl(value: string): string {
  return value.trim().replace(/([\\)\s])/g, '\\$1')
}

function escapeQuotedText(value: string): string {
  return normalizeInlineText(value).replace(/(["\\])/g, '\\$1')
}

function readOptionalQuotedSuffix(value: string): { target: string; suffix?: string } {
  const match = value.match(/^(\S+)(?:\s+"((?:\\"|[^"])*)")?$/)
  if (!match) {
    return { target: value.trim() }
  }
  return {
    target: match[1],
    suffix: match[2]?.replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
  }
}

function serializeTitledTarget(target: string, title: string | undefined): string {
  const safeTarget = escapeParenUrl(target)
  const safeTitle = title ? ` "${escapeQuotedText(title)}"` : ''
  return `${safeTarget}${safeTitle}`
}

function parsePipeRow(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim())
}

function normalizeRowWidth(row: string[], width: number): string[] {
  if (row.length >= width) return row.slice(0, width)
  return [...row, ...Array.from({ length: width - row.length }, () => '')]
}

export function serializeMarkdownishTask(task: MarkdownishTask): string {
  return `- [${task.checked ? 'x' : ' '}] ${normalizeInlineText(task.text)}`
}

export function parseMarkdownishTask(line: string): MarkdownishTask | null {
  const match = line.match(/^\s*-\s+\[([ xX])\]\s+(.+?)\s*$/)
  if (!match) return null
  return {
    checked: match[1].toLocaleLowerCase() === 'x',
    text: normalizeInlineText(match[2]),
  }
}

export function serializeMarkdownishTable(table: MarkdownishTable): string {
  const headers = table.headers.map(normalizeInlineText)
  const width = headers.length
  const rows = table.rows.map((row) => normalizeRowWidth(row.map(normalizeInlineText), width))
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

export function parseMarkdownishTable(markdown: string): MarkdownishTable | null {
  const lines = markdown.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) return null
  const headers = parsePipeRow(lines[0])
  const separator = parsePipeRow(lines[1])
  if (!headers || headers.length === 0 || !separator) return null
  if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) return null
  return {
    headers,
    rows: lines.slice(2)
      .map(parsePipeRow)
      .filter((row): row is string[] => row !== null)
      .map((row) => normalizeRowWidth(row, headers.length)),
  }
}

export function serializeMarkdownishImage(image: MarkdownishImage): string {
  return `![${escapeBracketText(image.alt)}](${serializeTitledTarget(image.src, image.title)})`
}

export function parseMarkdownishImage(markdown: string): MarkdownishImage | null {
  const match = markdown.trim().match(/^!\[([^\]]*)\]\((.+)\)$/)
  if (!match) return null
  const parsedTarget = readOptionalQuotedSuffix(match[2])
  return {
    alt: match[1].replace(/\\]/g, ']'),
    src: parsedTarget.target,
    ...(parsedTarget.suffix ? { title: parsedTarget.suffix } : {}),
  }
}

export function serializeMarkdownishReference(reference: MarkdownishReference): string {
  return `@[${escapeBracketText(reference.label)}](${serializeTitledTarget(reference.href, reference.note)})`
}

export function parseMarkdownishReference(markdown: string): MarkdownishReference | null {
  const match = markdown.trim().match(/^@\[([^\]]+)\]\((.+)\)$/)
  if (!match) return null
  const parsedTarget = readOptionalQuotedSuffix(match[2])
  return {
    label: match[1].replace(/\\]/g, ']'),
    href: parsedTarget.target,
    ...(parsedTarget.suffix ? { note: parsedTarget.suffix } : {}),
  }
}
