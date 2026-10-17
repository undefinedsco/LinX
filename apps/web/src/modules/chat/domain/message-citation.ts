/**
 * 问 LinX citations as structured message context (R6-C).
 *
 * A message sent from 问 LinX carries `citation` = where the quoted passage came from. It rides on
 * the user message item (persisted in the Pod with the message: `citation` inside the item JSON that
 * is stored as the message's rich content) and reaches the model as a cited source block, not only
 * as the quoted text in the prompt.
 */
import type { CardDialogLocator } from '@/lib/card-dialog'

export interface MessageCitation {
  /** Pod resource URI the passage comes from. */
  sourceUri: string
  locator?: CardDialogLocator
  title?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Reads untrusted input (request params, stored JSON) into a citation; null when it has no source. */
export function normalizeMessageCitation(value: unknown): MessageCitation | null {
  if (!isRecord(value) || typeof value.sourceUri !== 'string' || !value.sourceUri.trim()) return null
  const citation: MessageCitation = { sourceUri: value.sourceUri.trim() }
  if (typeof value.title === 'string' && value.title.trim()) citation.title = value.title.trim()
  if (isRecord(value.locator)) {
    const { page, timeSeconds, line, quote } = value.locator
    const locator: CardDialogLocator = {}
    if (typeof page === 'number' && Number.isFinite(page)) locator.page = page
    if (typeof timeSeconds === 'number' && Number.isFinite(timeSeconds)) locator.timeSeconds = timeSeconds
    if (typeof line === 'number' && Number.isFinite(line)) locator.line = line
    if (typeof quote === 'string' && quote.trim()) locator.quote = quote
    if (Object.keys(locator).length > 0) citation.locator = locator
  }
  return citation
}

/** The block the model sees after the user's text: which file, where in it, and the quoted passage. */
export function renderCitedSourceBlock(citation: MessageCitation): string {
  const lines = ['<cited_source>', `uri: ${citation.sourceUri}`]
  if (citation.title) lines.push(`title: ${citation.title}`)
  const { locator } = citation
  if (locator?.page !== undefined) lines.push(`page: ${locator.page}`)
  if (locator?.timeSeconds !== undefined) lines.push(`time_seconds: ${locator.timeSeconds}`)
  if (locator?.line !== undefined) lines.push(`line: ${locator.line}`)
  if (locator?.quote) lines.push(`quote: ${locator.quote}`)
  lines.push('</cited_source>')
  return lines.join('\n')
}

export function withCitedSource(text: string, citation: unknown): string {
  const normalized = normalizeMessageCitation(citation)
  return normalized ? `${text}\n\n${renderCitedSourceBlock(normalized)}` : text
}

// The citation of the message being written: set by the composer chip, taken by the send.
let pending: MessageCitation | null = null

export function setComposerCitation(citation: MessageCitation | null) {
  pending = citation
}

/** Hands the pending citation to the message being sent, once. */
export function takeComposerCitation(): MessageCitation | null {
  const taken = pending
  pending = null
  return taken
}
