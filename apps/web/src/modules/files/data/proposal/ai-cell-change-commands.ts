import type { SolidDatabase } from '@undefineds.co/models'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { createRawTextResource, readRawTextResource, saveRawTextResource } from '../pod-adapter'
import {
  aiCellChangeLogUri,
  createAiCellChange,
  parseAiCellChangeLogTurtle,
  renderAiCellChangeLogTurtle,
  type AiCellChange,
  type AiCellChangeState,
} from '../../domain/proposal/ai-cell-change-model'
import { writeOwnStructuredCellChange } from './structured-cell-approval-commands'

function isMissing(error: unknown) {
  return error instanceof Error && /HTTP 404/.test(error.message)
}

export async function readAiCellChanges(
  db: SolidDatabase,
  documentUri: string,
  podRootUri?: string | null,
): Promise<AiCellChange[]> {
  try {
    const log = await readRawTextResource(db, aiCellChangeLogUri(documentUri, podRootUri ?? resolveCurrentPodBaseUrl(db)))
    return parseAiCellChangeLogTurtle(log.content)
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
}

async function updateLog(
  db: SolidDatabase,
  documentUri: string,
  podRootUri: string | null | undefined,
  update: (changes: AiCellChange[]) => AiCellChange[],
) {
  const logUri = aiCellChangeLogUri(documentUri, podRootUri ?? resolveCurrentPodBaseUrl(db))
  let existing: Awaited<ReturnType<typeof readRawTextResource>> | null = null
  try {
    existing = await readRawTextResource(db, logUri)
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  const next = renderAiCellChangeLogTurtle(update(existing ? parseAiCellChangeLogTurtle(existing.content) : []))
  if (existing) await saveRawTextResource(db, { ...existing, mimeType: 'text/turtle' }, next)
  else await createRawTextResource(db, { uri: logUri, mimeType: 'text/turtle' }, next)
}

/** LinX fills in a cell (or a new row): written directly, with a record so the cell can show a dot and undo. */
export async function writeAiCellChange(
  db: SolidDatabase,
  input: {
    actorWebId: string
    documentUri: string
    subject: string
    predicate: string
    previousValues: string[]
    nextValues: string[]
    rowAdded?: boolean
    agentWebId?: string | null
    expectedEtag?: string | null
    podRootUri?: string | null
  },
): Promise<AiCellChange> {
  await writeOwnStructuredCellChange(db, input)
  const change = createAiCellChange(input)
  await updateLog(db, input.documentUri, input.podRootUri, (changes) => [...changes, change])
  return change
}

async function setState(db: SolidDatabase, change: AiCellChange, state: AiCellChangeState, podRootUri?: string | null) {
  await updateLog(db, change.documentUri, podRootUri, (changes) => (
    changes.map((item) => (item.id === change.id ? { ...item, state } : item))
  ))
}

/** 撤销: writes the old values back. */
export async function undoAiCellChange(
  db: SolidDatabase,
  input: { actorWebId: string; change: AiCellChange; podRootUri?: string | null },
): Promise<void> {
  const { change } = input
  await writeOwnStructuredCellChange(db, {
    actorWebId: input.actorWebId,
    documentUri: change.documentUri,
    subject: change.subject,
    predicate: change.predicate,
    previousValues: change.nextValues,
    nextValues: change.previousValues,
  })
  await setState(db, change, 'undone', input.podRootUri)
}

/** The person has looked at it: the dot goes away. */
export async function markAiCellChangeSeen(
  db: SolidDatabase,
  input: { change: AiCellChange; podRootUri?: string | null },
): Promise<void> {
  await setState(db, input.change, 'seen', input.podRootUri)
}
