import { auditResource, type SolidDatabase } from '@undefineds.co/models'
import { assertInsertValuesBelongToCurrentPod } from '@/lib/data/pod-write-guard'
import { createRawTextResource, listContainerResourceUris, readRawTextResource, saveRawTextResource } from '../pod-adapter'
import {
  aiDraftResourceUri,
  countAiDraftSpots,
  createAiDraft,
  parseAiDraftTurtle,
  renderAiDraftTurtle,
  revertAiDraftSpot,
  type AiDraft,
  type AiDraftState,
} from '../../domain/proposal/ai-draft-model'
import { isFilesReservedResourceUri } from '../../domain/resource/files-rdf-contract'

export const FILES_AI_DRAFT_POLICY_VERSION = 'files-ai-draft-v1'
export const FILES_AI_DRAFT_TOOL_NAME = 'files.ai.draft'

function isMissing(error: unknown) {
  return error instanceof Error && /HTTP 404/.test(error.message)
}

/** The unconfirmed draft (or the last kept / undone one) LinX left on a file; null when there is none. */
export async function readAiDraft(
  db: SolidDatabase,
  targetResourceUri: string,
  podRootUri?: string | null,
): Promise<AiDraft | null> {
  try {
    const resource = await readRawTextResource(db, aiDraftResourceUri(targetResourceUri, podRootUri))
    return parseAiDraftTurtle(resource.content, resource.uri)
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

/**
 * Which of these files carry an unconfirmed LinX draft (R6 K10 list dots). One listing of the
 * draft container and one read per draft that exists — never one request per row: a draft's
 * location is derived from its file, so the listing is matched against the expected locations.
 */
export async function listUnconfirmedAiDraftTargets(
  db: SolidDatabase,
  targetResourceUris: readonly string[],
  podRootUri?: string | null,
): Promise<Set<string>> {
  const targets = targetResourceUris.filter((uri) => !uri.endsWith('/'))
  if (targets.length === 0) return new Set()
  const expectedByDraftUri = new Map(targets.map((target) => [aiDraftResourceUri(target, podRootUri), target]))
  const containerUri = aiDraftResourceUri(targets[0]!, podRootUri).replace(/[^/]*$/, '')
  let listed: string[]
  try {
    listed = await listContainerResourceUris(db, containerUri)
  } catch (error) {
    if (isMissing(error)) return new Set()
    throw error
  }
  const existing = listed.filter((uri) => expectedByDraftUri.has(uri))
  const read = await Promise.all(existing.map(async (draftUri) => {
    try {
      const resource = await readRawTextResource(db, draftUri)
      const draft = parseAiDraftTurtle(resource.content, resource.uri)
      return draft.state === 'draft' && countAiDraftSpots(draft.baseContent, draft.draftContent) > 0
        ? expectedByDraftUri.get(draftUri) ?? null
        : null
    } catch {
      return null
    }
  }))
  return new Set(read.filter((target): target is string => !!target))
}

async function writeDraftRecord(db: SolidDatabase, draft: AiDraft): Promise<AiDraft> {
  const turtle = renderAiDraftTurtle(draft)
  try {
    const existing = await readRawTextResource(db, draft.resourceUri)
    await saveRawTextResource(db, { ...existing, mimeType: 'text/turtle' }, turtle)
  } catch (error) {
    if (!isMissing(error)) throw error
    await createRawTextResource(db, { uri: draft.resourceUri, mimeType: 'text/turtle' }, turtle)
  }
  return draft
}

async function writeTarget(db: SolidDatabase, targetResourceUri: string, content: string, expectedContent?: string) {
  const target = await readRawTextResource(db, targetResourceUri)
  if (expectedContent !== undefined && target.content !== expectedContent) {
    throw new Error('这个文件刚刚被改过，请刷新后再试。')
  }
  await saveRawTextResource(db, target, content)
}

async function recordAudit(
  db: SolidDatabase,
  input: { action: string; actorWebId: string; targetResourceUri: string },
) {
  const payload = {
    id: crypto.randomUUID(),
    action: input.action,
    actor: input.actorWebId,
    actorRole: 'human',
    entry: input.targetResourceUri,
    toolName: FILES_AI_DRAFT_TOOL_NAME,
    policyVersion: FILES_AI_DRAFT_POLICY_VERSION,
    createdAt: new Date(),
  }
  assertInsertValuesBelongToCurrentPod(db, payload)
  await db.insert(auditResource).values(payload).execute()
}

/**
 * LinX changes a file. Without a grant the change becomes an unconfirmed draft (the file itself
 * is untouched, so other people keep seeing the original); with a grant (`delegated`) it is kept
 * at once, still undoable and logged.
 */
export async function stageAiDraft(
  db: SolidDatabase,
  input: {
    actorWebId: string
    targetResourceUri: string
    draftContent: string
    agentWebId?: string | null
    delegated?: boolean
    summary?: string
    podRootUri?: string | null
  },
): Promise<AiDraft> {
  if (isFilesReservedResourceUri(input.targetResourceUri)) {
    throw new Error('Refusing to draft a change to a reserved Files resource.')
  }
  const target = await readRawTextResource(db, input.targetResourceUri)
  const previous = await readAiDraft(db, input.targetResourceUri, input.podRootUri)
  const baseContent = previous?.state === 'draft' ? previous.baseContent : target.content
  const draft = createAiDraft({
    targetResourceUri: input.targetResourceUri,
    baseContent,
    draftContent: input.draftContent,
    agentWebId: input.agentWebId,
    delegated: input.delegated,
    summary: input.summary,
    podRootUri: input.podRootUri,
    previous,
  })
  if (draft.baseContent === draft.draftContent) return draft
  if (draft.state === 'kept') {
    await saveRawTextResource(db, target, draft.draftContent)
    await writeDraftRecord(db, draft)
    await recordAudit(db, { action: 'files.ai.draft.kept', actorWebId: input.actorWebId, targetResourceUri: draft.targetResourceUri })
    return draft
  }
  return writeDraftRecord(db, draft)
}

async function transition(db: SolidDatabase, draft: AiDraft, state: AiDraftState, overrides: Partial<AiDraft> = {}) {
  return writeDraftRecord(db, { ...draft, ...overrides, state, updatedAt: new Date().toISOString() })
}

/** 保留: the draft becomes the file's content. */
export async function keepAiDraft(db: SolidDatabase, draft: AiDraft): Promise<AiDraft> {
  if (draft.state !== 'draft') return draft
  await writeTarget(db, draft.targetResourceUri, draft.draftContent)
  return transition(db, draft, 'kept')
}

/** 撤销: drops an unconfirmed draft, or rolls a kept one back to the original when nothing changed since. */
export async function undoAiDraft(db: SolidDatabase, draft: AiDraft): Promise<AiDraft> {
  if (draft.state === 'kept') {
    await writeTarget(db, draft.targetResourceUri, draft.baseContent, draft.draftContent)
  } else if (draft.state === 'undone') {
    return draft
  }
  return transition(db, draft, 'undone')
}

/** 撤销这处: puts one spot back to the original wording; the last one undoes the whole draft. */
export async function undoAiDraftSpot(db: SolidDatabase, draft: AiDraft, spot: number): Promise<AiDraft> {
  if (draft.state !== 'draft') return draft
  const draftContent = revertAiDraftSpot(draft.baseContent, draft.draftContent, spot)
  if (countAiDraftSpots(draft.baseContent, draftContent) === 0) return transition(db, draft, 'undone', { draftContent })
  return transition(db, draft, 'draft', { draftContent })
}

/** 重新应用: brings an undone draft back (kept again when LinX acts under a grant). */
export async function reapplyAiDraft(db: SolidDatabase, draft: AiDraft): Promise<AiDraft> {
  if (draft.state !== 'undone') return draft
  if (draft.delegated) {
    await writeTarget(db, draft.targetResourceUri, draft.draftContent, draft.baseContent)
    return transition(db, draft, 'kept')
  }
  return transition(db, draft, 'draft')
}
