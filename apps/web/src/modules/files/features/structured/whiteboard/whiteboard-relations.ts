/** The relations a person can pick for a line between two cards. */
export interface WhiteboardRelationChoice {
  label: string
  predicate: string
}

export const WHITEBOARD_RELATION_CHOICES: readonly WhiteboardRelationChoice[] = [
  { label: '支持', predicate: 'https://undefineds.co/vocab/supports' },
  { label: '反对', predicate: 'https://undefineds.co/vocab/opposes' },
  { label: '替代', predicate: 'http://purl.org/dc/terms/replaces' },
]

const LABEL_BY_PREDICATE = new Map(WHITEBOARD_RELATION_CHOICES.map((choice) => [choice.predicate, choice.label]))

function localName(value: string): string {
  const cleaned = value.replace(/^<|>$/g, '')
  const cut = Math.max(cleaned.lastIndexOf('#'), cleaned.lastIndexOf('/'), cleaned.lastIndexOf(':'))
  return cut >= 0 ? cleaned.slice(cut + 1) : cleaned
}

/** Plain name for a relation property, never a raw IRI. */
export function whiteboardRelationLabel(predicate: string): string {
  const known = LABEL_BY_PREDICATE.get(predicate)
  if (known) return known
  if (predicate === 'http://purl.org/dc/terms/relation' || predicate === 'dcterms:relation') return '相关'
  return localName(predicate).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ')
}
