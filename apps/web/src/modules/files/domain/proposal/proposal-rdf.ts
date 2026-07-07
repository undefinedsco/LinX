const KNOWN_PREFIX_IRIS: Record<string, string> = {
  'dcterms:': 'http://purl.org/dc/terms/',
  'rdfs:': 'http://www.w3.org/2000/01/rdf-schema#',
  'udfs:': 'https://undefineds.co/vocab/',
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function predicatePattern(predicate: string): string {
  const prefix = predicate.match(/^([A-Za-z][\w-]*:)/)?.[1]
  const namespace = prefix ? KNOWN_PREFIX_IRIS[prefix] : undefined
  if (!namespace || !prefix) return escapeRegExp(predicate)
  return `(?:${escapeRegExp(predicate)}|<${escapeRegExp(`${namespace}${predicate.slice(prefix.length)}`)}>)`
}

function unescapeTurtleLiteral(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

export function readProposalIri(source: string, predicate: string): string | null {
  return source.match(new RegExp(`${predicatePattern(predicate)}\\s+<([^>]+)>`))?.[1] ?? null
}

export function readProposalIris(source: string, predicate: string): string[] {
  const matches = source.matchAll(new RegExp(`${predicatePattern(predicate)}\\s+<([^>]+)>`, 'g'))
  return Array.from(matches, (match) => match[1] ?? '')
}

export function readProposalLiteral(source: string, predicate: string): string | null {
  const match = source.match(new RegExp(`${predicatePattern(predicate)}\\s+"((?:\\\\.|[^"\\\\])*)"`))
  return match?.[1] ? unescapeTurtleLiteral(match[1]) : null
}

export function readProposalLiterals(source: string, predicate: string): string[] {
  const matches = source.matchAll(new RegExp(`${predicatePattern(predicate)}\\s+"((?:\\\\.|[^"\\\\])*)"`, 'g'))
  return Array.from(matches, (match) => unescapeTurtleLiteral(match[1] ?? ''))
}
