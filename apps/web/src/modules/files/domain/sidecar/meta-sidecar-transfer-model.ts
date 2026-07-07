import { getEntryName } from '../resource/resource-semantics'
import { projectStructuredResourceTable } from '../structured/structured-table'

export interface CopyableMetaTriples {
  prefixes: string[]
  triples: string[]
}

function replaceMetaSidecarOwnerSubject(content: string, sourceUri: string, destinationUri: string) {
  const replaceTokens = (value: string, from: string, to: string) => value.split(from).join(to)
  const sourceName = getEntryName(sourceUri)
  const destinationName = getEntryName(destinationUri)

  return [
    [`<${sourceUri}>`, `<${destinationUri}>`],
    [`<${encodeURI(sourceName)}>`, `<${encodeURI(destinationName)}>`],
    [`<${sourceName}>`, `<${destinationName}>`],
  ].reduce((current, [from, to]) => replaceTokens(current, from, to), content)
}

export function replaceMetaSidecarOwnerValue(value: string, sourceUri: string, destinationUri: string) {
  const sourceName = getEntryName(sourceUri)
  const destinationName = getEntryName(destinationUri)
  if (value === sourceUri) return destinationUri
  if (value === sourceName) return destinationName
  if (value === encodeURI(sourceName)) return encodeURI(destinationName)
  return replaceMetaSidecarOwnerSubject(value, sourceUri, destinationUri)
}

function renderSparqlTerm(value: string) {
  if (value.startsWith('"')) return value
  if (/^(?:true|false)$/i.test(value)) return value.toLowerCase()
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return value
  if (/^[A-Za-z][\w.-]*:[\w.-]+$/.test(value)) return value
  if (value.startsWith('#')) return `<${value}>`
  return `<${value}>`
}

function renderCopiedMetaSubject(subject: string, sourceUri: string, destinationUri: string) {
  return renderSparqlTerm(replaceMetaSidecarOwnerValue(subject, sourceUri, destinationUri))
}

function isSystemMetaPredicate(predicate: string) {
  const normalized = predicate.toLowerCase()
  return normalized === 'a'
    || normalized === 'rdf:type'
    || normalized.endsWith('#type')
    || normalized.endsWith('/type')
    || normalized.endsWith(':type')
    || normalized.endsWith('#modified')
    || normalized.endsWith('/modified')
    || normalized.endsWith(':modified')
    || normalized.endsWith('#mtime')
    || normalized.endsWith('/mtime')
    || normalized.endsWith(':mtime')
    || normalized.endsWith('#size')
    || normalized.endsWith('/size')
    || normalized.endsWith(':size')
    || normalized.endsWith('#format')
    || normalized.endsWith('/format')
    || normalized.endsWith(':format')
    || normalized.endsWith('#preferrednamespaceprefix')
    || normalized.endsWith('/preferrednamespaceprefix')
    || normalized.endsWith(':preferrednamespaceprefix')
}

export function renderCopyableMetaTriples(
  sourceMetaUri: string,
  sourceUri: string,
  destinationUri: string,
  content: string,
): CopyableMetaTriples {
  const projection = projectStructuredResourceTable({
    uri: sourceMetaUri,
    mimeType: 'text/turtle',
    source: content,
  })
  const triples: string[] = []

  for (const row of projection.rows) {
    const subject = renderCopiedMetaSubject(row.subject, sourceUri, destinationUri)
    for (const cell of row.cells) {
      if (isSystemMetaPredicate(cell.predicate)) continue
      const predicate = renderSparqlTerm(cell.predicate)
      for (const value of cell.values) {
        triples.push(
          `  ${subject} ${predicate} ${renderSparqlTerm(
            replaceMetaSidecarOwnerValue(value, sourceUri, destinationUri),
          )} .`,
        )
      }
    }
  }

  return {
    prefixes: Object.entries(projection.prefixes).map(([prefix, uri]) => `PREFIX ${prefix}: <${uri}>`),
    triples,
  }
}

export function buildMetaSidecarCopyPatch(
  sourceMetaUri: string,
  sourceUri: string,
  destinationMetaUri: string,
  destinationUri: string,
  content: string,
) {
  const { prefixes, triples } = renderCopyableMetaTriples(sourceMetaUri, sourceUri, destinationUri, content)
  if (triples.length === 0) return null

  return [
    `BASE <${destinationMetaUri}>`,
    ...prefixes,
    '',
    'INSERT DATA {',
    ...triples,
    '}',
  ].join('\n')
}
