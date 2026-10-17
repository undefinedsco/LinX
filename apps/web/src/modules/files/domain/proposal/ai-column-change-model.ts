import {
  filesDataResourceUri,
  filesProposalInstanceSuffix,
  resolveFilesPodRootUri,
} from '../resource/files-rdf-contract'

/**
 * R6 K6b / K10b: a column LinX adds to a table. Without a grant it is an unconfirmed column
 * (dashed header, 保留这列 / 去掉这列); with a grant it is added straight away, can still be
 * undone and is logged. Records live in one log resource per table, next to the cell log.
 */
export type AiColumnChangeState = 'unconfirmed' | 'added' | 'kept' | 'removed' | 'undone' | 'seen'

export interface AiColumnChange {
  id: string
  documentUri: string
  /** Absolute predicate IRI of the column. */
  predicate: string
  label: string
  valueType: string
  state: AiColumnChangeState
  /** Added without asking because the person handed the decision to LinX. */
  delegated: boolean
  agentWebId: string | null
  createdAt: string
}

export function aiColumnChangeLogUri(documentUri: string, podRootUri?: string | null): string {
  const podRoot = resolveFilesPodRootUri(documentUri, { currentPodRootUri: podRootUri })
  return filesDataResourceUri(podRoot, `proposals/column-ai/${filesProposalInstanceSuffix([documentUri])}.ttl`)
}

export function createAiColumnChange(input: {
  documentUri: string
  predicate: string
  label: string
  valueType?: string
  delegated?: boolean
  agentWebId?: string | null
  createdAt?: string
}): AiColumnChange {
  const createdAt = input.createdAt ?? new Date().toISOString()
  return {
    id: `k-${filesProposalInstanceSuffix([createdAt, input.documentUri, input.predicate])}`,
    documentUri: input.documentUri,
    predicate: input.predicate,
    label: input.label,
    valueType: input.valueType ?? 'text',
    state: input.delegated ? 'added' : 'unconfirmed',
    delegated: !!input.delegated,
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

function readFirst(block: string, predicate: string): string | undefined {
  const match = block.match(new RegExp(`udfs:${predicate}\\s+"((?:\\\\.|[^"\\\\])*)"`))
  if (!match) return undefined
  return (match[1] ?? '').replace(/\\(.)/g, (_all, char: string) => (
    char === 'n' ? '\n' : char === 'r' ? '\r' : char === 't' ? '\t' : char
  ))
}

const STATES: readonly AiColumnChangeState[] = ['unconfirmed', 'added', 'kept', 'removed', 'undone', 'seen']

export function renderAiColumnChangeLogTurtle(changes: readonly AiColumnChange[]): string {
  return [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '',
    ...changes.map((change) => [
      `<#${change.id}> a udfs:AiColumnChange ;`,
      `  udfs:state ${turtleString(change.state)} ;`,
      `  udfs:sourceDocument <${change.documentUri}> ;`,
      `  udfs:predicate ${turtleString(change.predicate)} ;`,
      `  udfs:label ${turtleString(change.label)} ;`,
      `  udfs:valueType ${turtleString(change.valueType)} ;`,
      `  udfs:delegated ${change.delegated ? 'true' : 'false'} ;`,
      ...(change.agentWebId ? [`  udfs:agent <${change.agentWebId}> ;`] : []),
      `  udfs:createdAt ${turtleString(change.createdAt)} .`,
      '',
    ].join('\n')),
  ].join('\n')
}

export function parseAiColumnChangeLogTurtle(source: string): AiColumnChange[] {
  return source
    .split(/\n(?=<#k-)/)
    .filter((block) => block.startsWith('<#k-'))
    .flatMap((block): AiColumnChange[] => {
      const id = block.match(/^<#([^>]+)>/)?.[1]
      const documentUri = block.match(/udfs:sourceDocument\s+<([^>]+)>/)?.[1]
      const predicate = readFirst(block, 'predicate')
      const state = readFirst(block, 'state') as AiColumnChangeState | undefined
      if (!id || !documentUri || !predicate || !state || !STATES.includes(state)) return []
      return [{
        id,
        documentUri,
        predicate,
        label: readFirst(block, 'label') ?? predicate,
        valueType: readFirst(block, 'valueType') ?? 'text',
        state,
        delegated: /udfs:delegated\s+true/.test(block),
        agentWebId: block.match(/udfs:agent\s+<([^>]+)>/)?.[1] ?? null,
        createdAt: readFirst(block, 'createdAt') ?? '',
      }]
    })
}

/** Columns that still wear the LinX mark (unconfirmed, or added under a grant and not yet seen), keyed by predicate. */
export function projectAiColumns(changes: readonly AiColumnChange[]): Map<string, AiColumnChange> {
  const columns = new Map<string, AiColumnChange>()
  for (const change of changes) {
    if (change.state === 'unconfirmed' || change.state === 'added') columns.set(change.predicate, change)
    else columns.delete(change.predicate)
  }
  return columns
}

/** The line shown above the table for a column LinX added under a grant. */
export function projectAiColumnNotice(change: AiColumnChange): string {
  return `LinX 整理时，给表格加了一列“${change.label}”`
}
