import { diffLines } from 'diff'

import {
  filesDataResourceUri,
  filesProposalInstanceSuffix,
  resolveFilesPodRootUri,
} from '../resource/files-rdf-contract'
import { readProposalIri } from './proposal-rdf'

/**
 * R6 K10: when LinX changes a person's file the change is an unconfirmed draft laid over the
 * original. The file itself keeps the original content (so everyone else keeps seeing it)
 * until the person keeps the draft. With a grant the change is kept straight away, but the
 * original stays on record so it can still be undone.
 */
export type AiDraftState = 'draft' | 'kept' | 'undone'

export interface AiDraft {
  id: string
  resourceUri: string
  targetResourceUri: string
  state: AiDraftState
  /** The content before LinX touched the file. */
  baseContent: string
  /** What LinX wants the file to say. */
  draftContent: string
  agentWebId: string | null
  /** Kept without asking because the person handed the decision to LinX. */
  delegated: boolean
  summary: string
  createdAt: string
  updatedAt: string
}

export function aiDraftResourceUri(targetResourceUri: string, podRootUri?: string | null): string {
  const podRoot = resolveFilesPodRootUri(targetResourceUri, { currentPodRootUri: podRootUri })
  return filesDataResourceUri(podRoot, `proposals/draft/${filesProposalInstanceSuffix([targetResourceUri])}.ttl`)
}

export function createAiDraft(input: {
  targetResourceUri: string
  baseContent: string
  draftContent: string
  agentWebId?: string | null
  delegated?: boolean
  summary?: string
  podRootUri?: string | null
  now?: string
  /** An earlier draft of the same file: LinX keeps improving the same unconfirmed draft. */
  previous?: AiDraft | null
}): AiDraft {
  const now = input.now ?? new Date().toISOString()
  const resourceUri = aiDraftResourceUri(input.targetResourceUri, input.podRootUri)
  const previous = input.previous?.state === 'draft' ? input.previous : null
  return {
    id: `${resourceUri}#draft`,
    resourceUri,
    targetResourceUri: input.targetResourceUri,
    state: input.delegated ? 'kept' : 'draft',
    baseContent: previous ? previous.baseContent : input.baseContent,
    draftContent: input.draftContent,
    agentWebId: input.agentWebId ?? null,
    delegated: !!input.delegated,
    summary: input.summary?.trim() ?? '',
    createdAt: previous ? previous.createdAt : now,
    updatedAt: now,
  }
}

// ---------------------------------------------------------------------------
// Turtle
// ---------------------------------------------------------------------------

function turtleString(value: string) {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/"/g, '\\"')}"`
}

function readLiteral(source: string, predicate: string): string | null {
  const match = source.match(new RegExp(`udfs:${predicate}\\s+"((?:\\\\.|[^"\\\\])*)"`))
  if (!match) return null
  return (match[1] ?? '').replace(/\\(.)/g, (_all, char: string) => (
    char === 'n' ? '\n' : char === 'r' ? '\r' : char === 't' ? '\t' : char
  ))
}

export function renderAiDraftTurtle(draft: AiDraft) {
  return [
    '@prefix udfs: <https://undefineds.co/vocab/> .',
    '',
    '<#draft> a udfs:AiDraft ;',
    `  udfs:state ${turtleString(draft.state)} ;`,
    `  udfs:targetResource <${draft.targetResourceUri}> ;`,
    ...(draft.agentWebId ? [`  udfs:agent <${draft.agentWebId}> ;`] : []),
    `  udfs:delegated ${draft.delegated ? 'true' : 'false'} ;`,
    `  udfs:summary ${turtleString(draft.summary)} ;`,
    `  udfs:baseContent ${turtleString(draft.baseContent)} ;`,
    `  udfs:draftContent ${turtleString(draft.draftContent)} ;`,
    `  udfs:createdAt ${turtleString(draft.createdAt)} ;`,
    `  udfs:updatedAt ${turtleString(draft.updatedAt)} .`,
  ].join('\n')
}

export function parseAiDraftTurtle(source: string, resourceUri: string): AiDraft {
  const targetResourceUri = readProposalIri(source, 'udfs:targetResource')
  const state = readLiteral(source, 'state')
  if (!targetResourceUri || (state !== 'draft' && state !== 'kept' && state !== 'undone')) {
    throw new Error('Invalid AI draft: missing required fields.')
  }
  const createdAt = readLiteral(source, 'createdAt') ?? new Date().toISOString()
  return {
    id: `${resourceUri}#draft`,
    resourceUri,
    targetResourceUri,
    state,
    baseContent: readLiteral(source, 'baseContent') ?? '',
    draftContent: readLiteral(source, 'draftContent') ?? '',
    agentWebId: readProposalIri(source, 'udfs:agent'),
    delegated: /udfs:delegated\s+true/.test(source),
    summary: readLiteral(source, 'summary') ?? '',
    createdAt,
    updatedAt: readLiteral(source, 'updatedAt') ?? createdAt,
  }
}

// ---------------------------------------------------------------------------
// Spots: the places LinX changed
// ---------------------------------------------------------------------------

export type AiDraftSegment =
  | { type: 'same'; text: string }
  | { type: 'change'; spot: number; baseText: string; draftText: string }

export function projectAiDraftSegments(baseContent: string, draftContent: string): AiDraftSegment[] {
  const segments: AiDraftSegment[] = []
  let spot = 0
  let pending: { baseText: string; draftText: string } | null = null
  const flush = () => {
    if (!pending) return
    segments.push({ type: 'change', spot, baseText: pending.baseText, draftText: pending.draftText })
    spot += 1
    pending = null
  }
  for (const part of diffLines(baseContent, draftContent)) {
    if (!part.added && !part.removed) {
      flush()
      segments.push({ type: 'same', text: part.value })
      continue
    }
    pending ??= { baseText: '', draftText: '' }
    if (part.removed) pending.baseText += part.value
    else pending.draftText += part.value
  }
  flush()
  return segments
}

export function countAiDraftSpots(baseContent: string, draftContent: string): number {
  return projectAiDraftSegments(baseContent, draftContent).filter((segment) => segment.type === 'change').length
}

/** The draft with one spot put back to the original wording. */
export function revertAiDraftSpot(baseContent: string, draftContent: string, spot: number): string {
  return projectAiDraftSegments(baseContent, draftContent)
    .map((segment) => {
      if (segment.type === 'same') return segment.text
      return segment.spot === spot ? segment.baseText : segment.draftText
    })
    .join('')
}

// ---------------------------------------------------------------------------
// Words on the top line (K10 / K10b)
// ---------------------------------------------------------------------------

export interface AiDraftBannerModel {
  tone: 'unconfirmed' | 'kept' | 'undone'
  text: string
  /** Buttons in order. */
  actions: Array<'undo' | 'keep' | 'redo'>
  spots: number
}

/**
 * `currentContent` is what the file says right now; a kept draft can only be undone while
 * nobody has changed the file since.
 */
export function projectAiDraftBanner(draft: AiDraft | null | undefined, currentContent?: string | null): AiDraftBannerModel | null {
  if (!draft) return null
  const spots = countAiDraftSpots(draft.baseContent, draft.draftContent)
  if (draft.state === 'draft') {
    if (spots === 0) return null
    return { tone: 'unconfirmed', text: `LinX 改了 ${spots} 处，还没确认`, actions: ['undo', 'keep'], spots }
  }
  if (draft.state === 'kept') {
    if (spots === 0) return null
    const untouched = currentContent == null || currentContent === draft.draftContent
    return {
      tone: 'kept',
      text: untouched ? `LinX 改了 ${spots} 处，已保留` : `你在改，LinX 的 ${spots} 处一起保留了`,
      actions: untouched ? ['undo'] : [],
      spots,
    }
  }
  return { tone: 'undone', text: '已回到原样', actions: spots > 0 ? ['redo'] : [], spots }
}

/** The one-line version shown under a file message in chat. */
export function projectAiDraftMessageBar(
  draft: AiDraft | null | undefined,
): { text: string; actions: Array<'undo' | 'keep'> } | null {
  const banner = projectAiDraftBanner(draft)
  if (!banner || banner.tone === 'undone') return null
  return {
    text: banner.tone === 'unconfirmed' ? `改了 ${banner.spots} 处 · 还没确认` : `改了 ${banner.spots} 处 · 已保留`,
    actions: banner.actions.filter((action): action is 'undo' | 'keep' => action !== 'redo'),
  }
}
