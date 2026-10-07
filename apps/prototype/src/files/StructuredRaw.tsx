import { getStructuredProjection, predicateLocalName } from './files-model'
import type { PredicateDefinition, TableSortMode } from './files-types'

const escapeLiteral = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const formatObject = (value: string) => {
  if (value === 'true' || value === 'false') return value
  if (/^https?:\/\//.test(value) || value.startsWith('../') || value.startsWith('#') || value.startsWith('/')) return `<${value}>`
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `"${value}"^^xsd:date`
  return `"${escapeLiteral(value)}"`
}

export function StructuredRaw({
  selectedClass,
  predicates,
  hiddenPredicateIds,
  cellOverrides,
  searchQuery,
  sortMode,
}: {
  selectedClass: string
  predicates: PredicateDefinition[]
  hiddenPredicateIds: string[]
  cellOverrides: Record<string, string>
  searchQuery: string
  sortMode: TableSortMode
}) {
  const projection = getStructuredProjection({
    selectedClass,
    predicates,
    hiddenPredicateIds,
    cellOverrides,
    searchQuery,
    sortMode,
  })
  const triples = projection.rows.map((row) => {
    const predicateLines = projection.predicates
      .map((predicate) => {
        const value = projection.cellValue(row.subject, predicate.id)
        if (!value) return null
        const objects = value.split(',').map((part) => part.trim()).filter(Boolean).map(formatObject).join(', ')
        return `  ${predicate.label} ${objects}`
      })
      .filter(Boolean)

    return [
      `<${row.subject}> a udfs:${row.className}`,
      ...predicateLines,
    ].map((line, index, lines) => `${line}${index === lines.length - 1 ? ' .' : ' ;'}`).join('\n')
  }).join('\n\n')

  return (
    <section className="raw-surface" data-class-scope={selectedClass} data-predicate-count={projection.predicates.length} data-subject-count={projection.rows.length}>
      <div className="structured-predicate-index" aria-hidden="true">
        {projection.predicates.map((predicate, index) => (
          <span data-projection-predicate={predicate.id} data-projection-predicate-index={index} key={predicate.id} />
        ))}
      </div>
      <pre data-raw-format="text/turtle">{`@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix schema: <https://schema.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix udfs: <https://vocab.xpod.dev/linx#> .

${triples || `# No subjects match class:${selectedClass}`}`}</pre>
    </section>
  )
}
