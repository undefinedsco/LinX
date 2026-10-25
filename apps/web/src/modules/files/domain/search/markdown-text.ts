/**
 * Markdown syntax removed from a line of a note: heading, quote and list markers, link and
 * emphasis marks. What is left is what a person reads (search snippets, finding a line in the body).
 */
export function stripMarkdownSyntax(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)+/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/(^|\s)[*_]+|[*_]+(?=\s|$)/g, '$1')
    .trim()
}
