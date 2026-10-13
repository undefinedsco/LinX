import {
  filesDataResourceUri,
  filesProposalInstanceSuffix,
  resolveFilesPodRootUri,
} from '../resource/files-rdf-contract'

/**
 * R6 K10b: LinX writes table cells and rows directly. Each write leaves a small record next to the
 * table so the cell can show a purple dot (hover: what it said before, 撤销) until the person has
 * looked at it. Records live in one log resource per table.
 */
export type AiCellChangeState = 'active' | 'seen' | 'undone'

export interface AiCellChange {
  id: string
  documentUri: string
  /** Absolute subject IRI. */
  subject: string
  /** Absolute predicate IRI. */
  predicate: string
  /** Patch-ready tokens, as the structured cell writer expects them. */
  previousValues: string[]
  nextValues: string[]
  state: AiCellChangeState
  /** The whole row is new (LinX added it). */
  rowAdded: boolean
  agentWebId: string | null
  createdAt: string
}

export function aiCellChangeLogUri(documentUri: string, podRootUri?: string | null): string {
  const podRoot = resolveFilesPodRootUri(documentUri, { currentPodRootUri: podRootUri })
  return filesDataResourceUri(podRoot, `proposals/cell-ai/${filesProposalInstanceSuffix([documentUri])}.ttl`)
}

export function createAiCellChange(input: {
  documentUri: string
  subject: string
  predicate: string
  previousValues: string[]
  nextValues: string[]
  rowAdded?: boolean
  agentWebId?: string | null
  createdAt?: string
}): AiCellChange {
  const createdAt = input.createdAt ?? new Date().toISOString()
  return {
    id: `c-${filesProposalInstanceSuffix([createdAt, input.subject, input.predicate, input.nextValues])}`,
    documentUri: input.documentUri,
    subject: input.subject,
    predicate: input.predicate,
    previousValues: input.previousValues,
    nextValues: input.nextValues,
    state: 'active',
    rowAdded: !!input.rowAdded,
    agentWebId: input.agentWebId ?? null,
    createdAt,
  }
}

function turtleString(value: string) {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/"/g, '\\"')}"`
}

function unescape(value: string) {
  return value.replace(/\\(.)/g, (_all, char: string) => (
    char === 'n' ? '\n' : char === 'r' ? '\r' : char === 't' ? '\t' : char
  ))
}

function readAll(block: string, predicate: string): string[] {
  return Array.from(
    block.matchAll(new RegExp(`udfs:${predicate}\\s+"((?:\\\\.|[^"\\\\])*)"`, 'g')),
    (match) => unescape(match[1] ?? ''),
  )
}

export function renderAiCellChangeLogTurtle(changes: readonly AiCellChange[]): string {
  return [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '',
    ...changes.map((change) => [
      `<#${change.id}> a udfs:AiCellChange ;`,
      `  udfs:state ${turtleString(change.state)} ;`,
      `  udfs:sourceDocument <${change.documentUri}> ;`,
      `  udfs:subject ${turtleString(change.subject)} ;`,
      `  udfs:predicate ${turtleString(change.predicate)} ;`,
      ...change.previousValues.map((value) => `  udfs:previousValue ${turtleString(value)} ;`),
      ...change.nextValues.map((value) => `  udfs:nextValue ${turtleString(value)} ;`),
      `  udfs:rowAdded ${change.rowAdded ? 'true' : 'false'} ;`,
      ...(change.agentWebId ? [`  udfs:agent <${change.agentWebId}> ;`] : []),
      `  udfs:createdAt ${turtleString(change.createdAt)} .`,
      '',
    ].join('\n')),
  ].join('\n')
}

export function parseAiCellChangeLogTurtle(source: string): AiCellChange[] {
  return source
    .split(/\n(?=<#c-)/)
    .filter((block) => block.startsWith('<#c-'))
    .flatMap((block): AiCellChange[] => {
      const id = block.match(/^<#([^>]+)>/)?.[1]
      const documentUri = block.match(/udfs:sourceDocument\s+<([^>]+)>/)?.[1]
      const subject = readAll(block, 'subject')[0]
      const predicate = readAll(block, 'predicate')[0]
      const state = readAll(block, 'state')[0]
      if (!id || !documentUri || !subject || !predicate) return []
      return [{
        id,
        documentUri,
        subject,
        predicate,
        previousValues: readAll(block, 'previousValue'),
        nextValues: readAll(block, 'nextValue'),
        state: state === 'seen' || state === 'undone' ? state : 'active',
        rowAdded: /udfs:rowAdded\s+true/.test(block),
        agentWebId: block.match(/udfs:agent\s+<([^>]+)>/)?.[1] ?? null,
        createdAt: readAll(block, 'createdAt')[0] ?? '',
      }]
    })
}

/** Cells that still wear the purple dot, keyed by `subject|predicate` (latest change wins). */
export function projectAiCellDots(changes: readonly AiCellChange[]): Map<string, AiCellChange> {
  const dots = new Map<string, AiCellChange>()
  for (const change of changes) {
    const key = aiCellKey(change.subject, change.predicate)
    if (change.state === 'active') dots.set(key, change)
    else dots.delete(key)
  }
  return dots
}

export function aiCellKey(subjectIri: string, predicateIri: string) {
  return `${subjectIri}|${predicateIri}`
}

/** "LinX 改的 · 原来是 2" for the hover card. */
export function projectAiCellDotLabel(change: AiCellChange, displayPrevious: string): string {
  if (change.rowAdded) return 'LinX 加的'
  return displayPrevious ? `LinX 改的 · 原来是 ${displayPrevious}` : 'LinX 改的 · 原来是空的'
}
