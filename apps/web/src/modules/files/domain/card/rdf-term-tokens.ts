/**
 * Turns the tokens the Files Turtle projection keeps (`#frag`, `schema:name`,
 * `"text"^^xsd:integer`, bare absolute IRIs) into tokens that are safe inside a
 * SPARQL PATCH whose only BASE is the document itself.
 */

export const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
export const RDF_TYPE_IRI = `${RDF_NS}type`

const WELL_KNOWN_PREFIXES: Record<string, string> = {
  rdf: RDF_NS,
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  dcterms: 'http://purl.org/dc/terms/',
  dct: 'http://purl.org/dc/terms/',
  schema: 'http://schema.org/',
  as: 'https://www.w3.org/ns/activitystreams#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  vcard: 'http://www.w3.org/2006/vcard/ns#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  sioc: 'http://rdfs.org/sioc/ns#',
  udfs: 'https://undefineds.co/vocab/',
}

const ABSOLUTE_IRI_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//
const PREFIXED_NAME_PATTERN = /^([A-Za-z][\w-]*)?:([^\s<>"]*)$/
const TYPED_LITERAL_PATTERN = /^("(?:[^"\\]|\\.)*")\^\^(?:<([^>]+)>|([A-Za-z][\w.-]*:[\w.-]+))$/
const LANG_LITERAL_PATTERN = /^("(?:[^"\\]|\\.)*")@([A-Za-z-]+)$/

export type RdfPrefixes = Readonly<Record<string, string>>

function stripAngleBrackets(token: string) {
  const trimmed = token.trim()
  return trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1) : trimmed
}

/** Expands a projection IRI token (`#a`, `schema:name`, `<x>`, `x`) to an absolute IRI. */
export function expandRdfIri(token: string, documentUri: string, prefixes: RdfPrefixes = {}): string {
  const value = stripAngleBrackets(token)
  if (!value) return value
  if (ABSOLUTE_IRI_PATTERN.test(value) || value.startsWith('urn:') || value.startsWith('mailto:') || value.startsWith('tel:')) {
    return value
  }
  if (value.startsWith('#') || value.startsWith('./') || value.startsWith('../') || value.startsWith('/')) {
    try {
      return new URL(value, documentUri).href
    } catch {
      return value
    }
  }
  const prefixed = value.match(PREFIXED_NAME_PATTERN)
  if (prefixed) {
    const namespace = prefixes[prefixed[1] ?? ''] ?? WELL_KNOWN_PREFIXES[prefixed[1] ?? '']
    if (namespace) return `${namespace}${prefixed[2]}`
  }
  try {
    return new URL(value, documentUri).href
  } catch {
    return value
  }
}

export function isRdfLiteralToken(token: string) {
  return token.trim().startsWith('"')
}

/** A value token ready for a SPARQL PATCH: literals keep their quotes, resources become `<iri>`. */
export function toPatchValueToken(token: string, documentUri: string, prefixes: RdfPrefixes = {}): string {
  const trimmed = token.trim()
  if (!isRdfLiteralToken(trimmed)) return `<${expandRdfIri(trimmed, documentUri, prefixes)}>`
  const typed = trimmed.match(TYPED_LITERAL_PATTERN)
  if (typed) {
    const datatype = typed[2] ?? expandRdfIri(typed[3] ?? '', documentUri, prefixes)
    return `${typed[1]}^^<${datatype}>`
  }
  if (LANG_LITERAL_PATTERN.test(trimmed)) return trimmed
  return trimmed
}

export function rdfLiteralToken(value: string) {
  return JSON.stringify(value)
}

/** Human-readable text for a projection value token. */
export function displayRdfValue(token: string): string {
  const trimmed = token.trim()
  if (isRdfLiteralToken(trimmed)) {
    const typed = trimmed.match(TYPED_LITERAL_PATTERN)
    const lang = trimmed.match(LANG_LITERAL_PATTERN)
    const quoted = typed?.[1] ?? lang?.[1] ?? trimmed
    try {
      return JSON.parse(quoted) as string
    } catch {
      return quoted.replace(/^"|"$/g, '')
    }
  }
  return stripAngleBrackets(trimmed)
}

/** Last readable segment of an IRI, used when nothing better names a resource. */
export function localRdfName(iri: string): string {
  const value = stripAngleBrackets(iri)
  const hashIndex = value.lastIndexOf('#')
  if (hashIndex >= 0 && hashIndex < value.length - 1) return decodeSafely(value.slice(hashIndex + 1))
  const trimmed = value.endsWith('/') ? value.slice(0, -1) : value
  const slashIndex = trimmed.lastIndexOf('/')
  if (slashIndex >= 0 && slashIndex < trimmed.length - 1) return decodeSafely(trimmed.slice(slashIndex + 1))
  const colonIndex = trimmed.lastIndexOf(':')
  if (colonIndex >= 0 && colonIndex < trimmed.length - 1) return decodeSafely(trimmed.slice(colonIndex + 1))
  return decodeSafely(trimmed)
}

function decodeSafely(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
