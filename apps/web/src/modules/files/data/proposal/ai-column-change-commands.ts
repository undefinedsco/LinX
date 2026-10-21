import { auditResource, type SolidDatabase } from '@undefineds.co/models'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { assertInsertValuesBelongToCurrentPod } from '@/lib/data/pod-write-guard'
import { createRawTextResource, readRawTextResource, saveRawTextResource } from '../pod-adapter'
import {
  aiColumnChangeLogUri,
  createAiColumnChange,
  parseAiColumnChangeLogTurtle,
  renderAiColumnChangeLogTurtle,
  type AiColumnChange,
  type AiColumnChangeState,
} from '../../domain/proposal/ai-column-change-model'
import { readAiCellChanges, undoAiCellChange } from './ai-cell-change-commands'

export const FILES_AI_COLUMN_POLICY_VERSION = 'files-ai-column-v1'
export const FILES_AI_COLUMN_TOOL_NAME = 'files.ai.column'

function isMissing(error: unknown) {
  return error instanceof Error && /HTTP 404/.test(error.message)
}

export async function readAiColumnChanges(
  db: SolidDatabase,
  documentUri: string,
  podRootUri?: string | null,
): Promise<AiColumnChange[]> {
  try {
    const log = await readRawTextResource(db, aiColumnChangeLogUri(documentUri, podRootUri ?? resolveCurrentPodBaseUrl(db)))
    return parseAiColumnChangeLogTurtle(log.content)
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
}

async function updateLog(
  db: SolidDatabase,
  documentUri: string,
  podRootUri: string | null | undefined,
  update: (changes: AiColumnChange[]) => AiColumnChange[],
) {
  const logUri = aiColumnChangeLogUri(documentUri, podRootUri ?? resolveCurrentPodBaseUrl(db))
  let existing: Awaited<ReturnType<typeof readRawTextResource>> | null = null
  try {
    existing = await readRawTextResource(db, logUri)
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  const next = renderAiColumnChangeLogTurtle(update(existing ? parseAiColumnChangeLogTurtle(existing.content) : []))
  if (existing) await saveRawTextResource(db, { ...existing, mimeType: 'text/turtle' }, next)
  else await createRawTextResource(db, { uri: logUri, mimeType: 'text/turtle' }, next)
}

async function recordAudit(db: SolidDatabase, input: { action: string; actorWebId: string; documentUri: string }) {
  const payload = {
    id: crypto.randomUUID(),
    action: input.action,
    actor: input.actorWebId,
    actorRole: 'human',
    entry: input.documentUri,
    toolName: FILES_AI_COLUMN_TOOL_NAME,
    policyVersion: FILES_AI_COLUMN_POLICY_VERSION,
    createdAt: new Date(),
  }
  assertInsertValuesBelongToCurrentPod(db, payload)
  await db.insert(auditResource).values(payload).execute()
}

/**
 * LinX adds a column. Without a grant it is an unconfirmed (dashed) column; with a grant
 * (`delegated`) it is added at once, still undoable, and logged so it can be reviewed later.
 */
export async function stageAiColumnChange(
  db: SolidDatabase,
  input: {
    actorWebId: string
    documentUri: string
    predicate: string
    label: string
    valueType?: string
    delegated?: boolean
    agentWebId?: string | null
    podRootUri?: string | null
  },
): Promise<AiColumnChange> {
  const change = createAiColumnChange(input)
  await updateLog(db, input.documentUri, input.podRootUri, (changes) => [...changes, change])
  if (change.delegated) {
    await recordAudit(db, { action: 'files.ai.column.added', actorWebId: input.actorWebId, documentUri: input.documentUri })
  }
  return change
}

async function setState(
  db: SolidDatabase,
  change: AiColumnChange,
  state: AiColumnChangeState,
  podRootUri?: string | null,
) {
  await updateLog(db, change.documentUri, podRootUri, (changes) => (
    changes.map((item) => (item.id === change.id ? { ...item, state } : item))
  ))
}

/** 保留这列: the column stays as an ordinary column. */
export async function keepAiColumnChange(
  db: SolidDatabase,
  input: { change: AiColumnChange; podRootUri?: string | null },
): Promise<void> {
  await setState(db, input.change, 'kept', input.podRootUri)
}

/**
 * 去掉这列 (unconfirmed) / 撤销 (added under a grant): the column goes, together with the cells
 * LinX wrote into it that nobody has touched since.
 */
export async function removeAiColumnChange(
  db: SolidDatabase,
  input: { actorWebId: string; change: AiColumnChange; podRootUri?: string | null },
): Promise<void> {
  const cells = await readAiCellChanges(db, input.change.documentUri, input.podRootUri)
  for (const cell of cells) {
    if (cell.state === 'active' && cell.predicate === input.change.predicate) {
      await undoAiCellChange(db, { actorWebId: input.actorWebId, change: cell, podRootUri: input.podRootUri })
    }
  }
  await setState(db, input.change, input.change.delegated ? 'undone' : 'removed', input.podRootUri)
}

/** The person has looked at it: the mark goes away. */
export async function markAiColumnChangeSeen(
  db: SolidDatabase,
  input: { change: AiColumnChange; podRootUri?: string | null },
): Promise<void> {
  await setState(db, input.change, 'seen', input.podRootUri)
}
