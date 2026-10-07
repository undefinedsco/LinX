import { projectStructuredResourceTable } from '../structured/structured-table'

export interface FileMetaPredicateValues {
  subject: string
  title: string
  titlePreviousValues: string[]
  tags: string[]
  tagsPreviousValues: string[]
  reviewStatus: string
  reviewStatusPreviousValues: string[]
  source: string
  sourcePreviousValues: string[]
}

function normalizeRdfDisplayValue(value: string) {
  if (value.length >= 2 && value.startsWith('<') && value.endsWith('>')) return value.slice(1, -1)
  if (value.length >= 2 && value.startsWith('"')) {
    const typedLiteralIndex = value.indexOf('"^^', 1)
    const languageLiteralIndex = value.indexOf('"@', 1)
    if (typedLiteralIndex > 0) return value.slice(1, typedLiteralIndex)
    if (languageLiteralIndex > 0) return value.slice(1, languageLiteralIndex)
    if (value.endsWith('"')) return value.slice(1, -1)
  }
  return value
}

function isMetaPredicate(predicate: string, localNames: string[]) {
  const normalized = predicate.toLowerCase()
  return localNames.some((name) => (
    normalized === name.toLowerCase()
    || normalized.endsWith(`:${name.toLowerCase()}`)
    || normalized.endsWith(`#${name.toLowerCase()}`)
    || normalized.endsWith(`/${name.toLowerCase()}`)
  ))
}

function collectFirstPredicateValue(
  rows: ReturnType<typeof projectStructuredResourceTable>['rows'],
  localNames: string[],
  normalizeValue: (value: string) => string = normalizeRdfDisplayValue,
) {
  for (const row of rows) {
    for (const cell of row.cells) {
      if (!isMetaPredicate(cell.predicate, localNames)) continue
      const value = cell.values.map(normalizeValue).find((candidate) => candidate.length > 0)
      if (value) return value
    }
  }
  return null
}

function normalizeWorkspaceRelationDisplayValue(value: string, metaUri: string) {
  const display = normalizeRdfDisplayValue(value)
  if (!display || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(display)) return display
  if (!display.startsWith('.') && !display.startsWith('/') && !display.startsWith('#')) return display
  try {
    return new URL(display, metaUri).href
  } catch {
    return display
  }
}

function resolveMetaOwnerSubject(metaUri: string) {
  try {
    const url = new URL(metaUri)
    if (url.pathname.endsWith('/.meta')) {
      url.pathname = url.pathname.slice(0, -'.meta'.length)
      return url.href
    }
    if (url.pathname.endsWith('.meta')) {
      url.pathname = url.pathname.slice(0, -'.meta'.length)
      return url.href
    }
  } catch {
    if (metaUri.endsWith('/.meta')) return metaUri.slice(0, -'.meta'.length)
    if (metaUri.endsWith('.meta')) return metaUri.slice(0, -'.meta'.length)
  }
  return null
}

function rowHasAnyPredicate(
  row: ReturnType<typeof projectStructuredResourceTable>['rows'][number],
  localNames: string[],
) {
  return row.cells.some((cell) => isMetaPredicate(cell.predicate, localNames) && cell.values.some((value) => normalizeRdfDisplayValue(value).length > 0))
}

function selectFileMetaPredicateRows(
  rows: ReturnType<typeof projectStructuredResourceTable>['rows'],
  metaUri: string,
) {
  const predicateNames = ['label', 'tags', 'reviewStatus', 'source']
  const ownerSubject = resolveMetaOwnerSubject(metaUri)
  const exactMetaRows = rows.filter((row) => row.subject === '#meta')
  if (exactMetaRows.some((row) => rowHasAnyPredicate(row, predicateNames))) {
    return { subject: '#meta', rows: exactMetaRows }
  }
  if (ownerSubject) {
    const ownerRows = rows.filter((row) => {
      const displaySubject = normalizeRdfDisplayValue(row.subject)
      if (displaySubject === ownerSubject) return true
      try {
        return new URL(displaySubject, metaUri).href === ownerSubject
      } catch {
        return false
      }
    })
    if (ownerRows.some((row) => rowHasAnyPredicate(row, predicateNames))) {
      return { subject: ownerRows[0]?.subject ?? ownerSubject, rows: ownerRows }
    }
  }
  return { subject: '#meta', rows: [] }
}

function collectPredicateValues(
  rows: ReturnType<typeof projectStructuredResourceTable>['rows'],
  localNames: string[],
) {
  const values: string[] = []
  for (const row of rows) {
    for (const cell of row.cells) {
      if (!isMetaPredicate(cell.predicate, localNames)) continue
      for (const value of cell.values) {
        if (!normalizeRdfDisplayValue(value)) continue
        values.push(value)
      }
    }
  }
  return values
}

function firstDisplayValue(values: string[]) {
  return values.map(normalizeRdfDisplayValue).find((value) => value.length > 0) ?? ''
}

function displayValues(values: string[]) {
  return values.map(normalizeRdfDisplayValue).filter(Boolean)
}

function relationPreviousValues(values: string[]) {
  return values.map((value) => {
    if (value.length >= 2 && value.startsWith('<') && value.endsWith('>')) return value
    if (value.startsWith('"')) return value
    if (/^[A-Za-z][\w.-]*:[\w.-]+$/.test(value) && !/^https?:\/\//.test(value)) return value
    if (/^https?:\/\//.test(value) || value.startsWith('#') || value.startsWith('.') || value.startsWith('/')) {
      return `<${value}>`
    }
    return value
  })
}

function pushMetaRow(rows: [string, string][], label: string, value: string | null) {
  if (!value) return
  rows.push([label, value])
}

export function extractFileMetaPredicateValues(
  metaUri: string,
  mimeType: string | null | undefined,
  content: string | null | undefined,
): FileMetaPredicateValues {
  if (!content) {
    return {
      subject: '#meta',
      title: '',
      titlePreviousValues: [],
      tags: [],
      tagsPreviousValues: [],
      reviewStatus: '',
      reviewStatusPreviousValues: [],
      source: '',
      sourcePreviousValues: [],
    }
  }

  const projection = projectStructuredResourceTable({
    uri: metaUri,
    mimeType,
    source: content,
  })
  const selected = selectFileMetaPredicateRows(projection.rows, metaUri)
  const titlePreviousValues = collectPredicateValues(selected.rows, ['label'])
  const tagsPreviousValues = collectPredicateValues(selected.rows, ['tags'])
  const reviewStatusPreviousValues = collectPredicateValues(selected.rows, ['reviewStatus'])
  const sourcePreviousValues = collectPredicateValues(selected.rows, ['source'])

  return {
    subject: selected.subject,
    title: firstDisplayValue(titlePreviousValues),
    titlePreviousValues,
    tags: displayValues(tagsPreviousValues),
    tagsPreviousValues,
    reviewStatus: firstDisplayValue(reviewStatusPreviousValues),
    reviewStatusPreviousValues,
    source: firstDisplayValue(sourcePreviousValues),
    sourcePreviousValues: relationPreviousValues(sourcePreviousValues),
  }
}

export function summarizeMetaSidecarContent(
  metaUri: string,
  mimeType: string | null | undefined,
  content: string | null | undefined,
): [string, string][] {
  if (!content) return []

  const projection = projectStructuredResourceTable({
    uri: metaUri,
    mimeType,
    source: content,
  })
  const summary = new Map<string, Set<string>>([
    ['source', new Set()],
    ['links', new Set()],
    ['vocab/schema', new Set()],
    ['repository', new Set()],
    ['agent', new Set()],
    ['workspace', new Set()],
    ['branch', new Set()],
    ['runtime status', new Set()],
  ])
  const includeAgentRepositoryFacts = !isWorkspaceMetaSidecarUri(metaUri)

  for (const row of projection.rows) {
    for (const cell of row.cells) {
      const values = cell.values.map(normalizeRdfDisplayValue)
      if (isMetaPredicate(cell.predicate, ['source', 'url'])) {
        values.forEach((value) => summary.get('source')?.add(value))
        continue
      }
      if (isMetaPredicate(cell.predicate, ['seeAlso', 'sameAs', 'page', 'isReferencedBy'])) {
        values.forEach((value) => summary.get('links')?.add(value))
        continue
      }
      if (isMetaPredicate(cell.predicate, ['vocab', 'shape', 'schema', 'conformsTo'])) {
        values.forEach((value) => summary.get('vocab/schema')?.add(value))
        continue
      }
      if (includeAgentRepositoryFacts && isMetaPredicate(cell.predicate, ['repository', 'repositoryUri', 'repo', 'gitRepository'])) {
        cell.values
          .map((value) => normalizeWorkspaceRelationDisplayValue(value, metaUri))
          .forEach((value) => summary.get('repository')?.add(value))
        continue
      }
      if (includeAgentRepositoryFacts && isMetaPredicate(cell.predicate, ['agent', 'agentHome', 'ownerAgent'])) {
        cell.values
          .map((value) => normalizeWorkspaceRelationDisplayValue(value, metaUri))
          .forEach((value) => summary.get('agent')?.add(value))
        continue
      }
      if (includeAgentRepositoryFacts && isMetaPredicate(cell.predicate, ['workspace', 'workspaceUri'])) {
        cell.values
          .map((value) => normalizeWorkspaceRelationDisplayValue(value, metaUri))
          .forEach((value) => summary.get('workspace')?.add(value))
        continue
      }
      if (includeAgentRepositoryFacts && isMetaPredicate(cell.predicate, ['branchName', 'branch'])) {
        values.forEach((value) => summary.get('branch')?.add(value))
        continue
      }
      if (includeAgentRepositoryFacts && isMetaPredicate(cell.predicate, ['runtimeStatus', 'status'])) {
        values.forEach((value) => summary.get('runtime status')?.add(value))
      }
    }
  }

  return Array.from(summary.entries())
    .map<[string, string]>(([label, values]) => [label, Array.from(values).join(', ')])
    .filter(([, value]) => value.length > 0)
}

function isWorkspaceMetaSidecarUri(metaUri: string): boolean {
  try {
    const url = new URL(metaUri)
    return url.pathname.includes('/.data/workspaces/') && url.pathname.endsWith('/.meta')
  } catch {
    return false
  }
}

export function summarizeWorkspaceMetaSidecarContent(
  metaUri: string,
  mimeType: string | null | undefined,
  content: string | null | undefined,
): [string, string][] {
  if (!content) return []
  if (!isWorkspaceMetaSidecarUri(metaUri)) return []

  const projection = projectStructuredResourceTable({
    uri: metaUri,
    mimeType,
    source: content,
  })
  const rows: [string, string][] = []
  const repository = collectFirstPredicateValue(
    projection.rows,
    ['repository', 'repositoryUri', 'repo', 'gitRepository'],
    (value) => normalizeWorkspaceRelationDisplayValue(value, metaUri),
  )
  const localPath = collectFirstPredicateValue(projection.rows, ['localPath'])
  const cwd = collectFirstPredicateValue(projection.rows, ['cwd', 'workingDirectory'])
  const branchName = collectFirstPredicateValue(projection.rows, ['branchName', 'branch'])
  const branchRef = collectFirstPredicateValue(projection.rows, ['branchRef'])
  const startCommit = collectFirstPredicateValue(projection.rows, ['startCommit'])
  const currentCommit = collectFirstPredicateValue(projection.rows, ['currentCommit', 'headCommit'])
  const dirtyState = collectFirstPredicateValue(projection.rows, ['dirtyState', 'workingTreeState', 'isDirty'])
  const branch = branchName && branchRef ? `${branchName} (${branchRef})` : branchName ?? branchRef

  pushMetaRow(rows, 'repository', repository)
  pushMetaRow(rows, 'local path', localPath)
  pushMetaRow(rows, 'cwd', cwd)
  pushMetaRow(rows, 'branch', branch)
  pushMetaRow(rows, 'start commit', startCommit)
  pushMetaRow(rows, 'current commit', currentCommit)
  pushMetaRow(rows, 'dirty state', dirtyState)

  return rows
}
