/**
 * LinX's file-writing tools (R6-C, spec §2).
 *
 * Tool calls the runtime raises for Pod files are executed here, through the Files draft layer:
 * - an existing file of the person's: an unconfirmed draft (keep / undo); with a grant covering the
 *   file (`planAutoJudge`) it is kept at once, still undoable and logged;
 * - a file LinX created in this chat: written directly;
 * - table cell / new row: written directly with an undo marker;
 * - new column: unconfirmed, or added at once under a grant.
 *
 * The returned text goes back to the model, so it must say plainly whether the change is live.
 *
 * Tool names / arguments (all `uri`-like arguments are Pod resource URIs):
 *   files_create      { uri, content, mime_type? }
 *   files_edit        { uri, content }            (alias: files_write)
 *   files_set_cell    { document, subject, predicate, previous_values?, values, row_added? }
 *   files_add_column  { document, predicate, label, value_type? }
 */
import { ODRL } from '@undefineds.co/models'
import {
  assessAutoJudgeConfidence,
  planAutoJudge,
  type AutoJudgeGrant,
  type AutoJudgeWindows,
} from '@linx/agent-runtime/auto-judge'

/** The slice of the Files module this needs (`@/modules/files` root exports). */
export interface PodFileToolFiles {
  stageAiDraft: (db: any, input: any) => Promise<{ state: string }>
  writeAiCellChange: (db: any, input: any) => Promise<unknown>
  stageAiColumnChange: (db: any, input: any) => Promise<{ delegated?: boolean }>
  readRawTextResource: (db: any, uri: string) => Promise<{ uri: string; mimeType: string; etag?: string | null; content: string }>
  saveRawTextResource: (db: any, resource: any, content: string) => Promise<unknown>
  createRawTextResource: (db: any, resource: { uri: string; mimeType: string }, content: string) => Promise<unknown>
}

export interface PodFileToolContext {
  db: unknown
  actorWebId: string
  agentWebId?: string | null
  podRootUri?: string | null
  /** Grants that apply to this assistant. */
  grants: readonly AutoJudgeGrant[]
  /** Files LinX created in this chat (direct writes). */
  createdByLinx: Set<string>
  files: PodFileToolFiles
}

const FILE_TOOLS = ['files_create', 'files_edit', 'files_write', 'files_set_cell', 'files_add_column'] as const

export function isPodFileTool(name: string): boolean {
  return (FILE_TOOLS as readonly string[]).includes(name)
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry))
  if (value === undefined || value === null) return []
  return [String(value)]
}

/** The file a call touches; the chat shows it as a file message (with keep / undo). */
export function podFileToolTarget(name: string, args: Record<string, unknown>): string | null {
  if (!isPodFileTool(name)) return null
  return str(name === 'files_set_cell' || name === 'files_add_column' ? args.document : args.uri) ?? null
}

/**
 * Whether LinX acts under a grant for this file: an active grant of this assistant covers editing it
 * (waits do not apply: the edit is undoable, so a covered edit is kept at once).
 */
export function isDelegatedFileEdit(
  grants: readonly AutoJudgeGrant[],
  target: string,
  podRootUri?: string | null,
  now: Date = new Date(),
): boolean {
  const noWait: AutoJudgeWindows = { high: 0, medium: 0, low: null }
  for (const action of [ODRL.term('modify'), ODRL.term('use')]) {
    const request = { target, action, risk: 'medium' }
    const plan = planAutoJudge({
      request,
      grants: [...grants],
      confidence: assessAutoJudgeConfidence({ request, podBaseUrl: podRootUri }),
      now,
      windows: noWait,
    })
    if (plan.mode === 'auto') return true
  }
  return false
}

export const DRAFT_PENDING_NOTICE = '已作为未确认草稿，等用户保留。文件现在还是原样，请不要当作已生效。'

export async function executePodFileTool(
  name: string,
  args: Record<string, unknown>,
  ctx: PodFileToolContext,
): Promise<string> {
  try {
    return await run(name, args, ctx)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return `没有写成：${reason}`
  }
}

async function run(name: string, args: Record<string, unknown>, ctx: PodFileToolContext): Promise<string> {
  const { db, files } = ctx
  const common = { actorWebId: ctx.actorWebId, agentWebId: ctx.agentWebId ?? null, podRootUri: ctx.podRootUri ?? null }

  if (name === 'files_create') {
    const uri = str(args.uri)
    if (!uri || typeof args.content !== 'string') return '没有写成：缺少文件地址或内容。'
    await files.createRawTextResource(db, { uri, mimeType: str(args.mime_type) ?? 'text/plain' }, args.content)
    ctx.createdByLinx.add(uri)
    return '文件已创建并写入（这是你在本次对话里新建的文件）。'
  }

  if (name === 'files_edit' || name === 'files_write') {
    const uri = str(args.uri)
    if (!uri || typeof args.content !== 'string') return '没有写成：缺少文件地址或内容。'
    if (ctx.createdByLinx.has(uri)) {
      const current = await files.readRawTextResource(db, uri)
      await files.saveRawTextResource(db, current, args.content)
      return '已写入（这是你在本次对话里新建的文件，直接生效）。'
    }
    const delegated = isDelegatedFileEdit(ctx.grants, uri, ctx.podRootUri)
    const draft = await files.stageAiDraft(db, {
      ...common,
      targetResourceUri: uri,
      draftContent: args.content,
      delegated,
      summary: str(args.summary),
    })
    if (draft.state === 'kept') return '已按用户的授权直接保留；用户随时可以撤销，操作已记录。'
    return DRAFT_PENDING_NOTICE
  }

  if (name === 'files_set_cell') {
    const documentUri = str(args.document)
    const subject = str(args.subject)
    const predicate = str(args.predicate)
    if (!documentUri || !subject || !predicate) return '没有写成：缺少表格、行或列。'
    await files.writeAiCellChange(db, {
      ...common,
      documentUri,
      subject,
      predicate,
      previousValues: strings(args.previous_values),
      nextValues: strings(args.values ?? args.value),
      rowAdded: args.row_added === true,
    })
    return args.row_added === true
      ? '已加入新的一行（直接生效，带撤销标记，用户可以撤销）。'
      : '已写入单元格（直接生效，带撤销标记，用户可以撤销）。'
  }

  if (name === 'files_add_column') {
    const documentUri = str(args.document)
    const predicate = str(args.predicate)
    const label = str(args.label)
    if (!documentUri || !predicate || !label) return '没有写成：缺少表格、列或列名。'
    const delegated = isDelegatedFileEdit(ctx.grants, documentUri, ctx.podRootUri)
    await files.stageAiColumnChange(db, {
      ...common,
      documentUri,
      predicate,
      label,
      valueType: str(args.value_type),
      delegated,
    })
    return delegated
      ? '新列已按用户的授权加入；用户随时可以撤销，操作已记录。'
      : '新列已加入，标为未确认，等用户确认。请不要当作已生效。'
  }

  return `不认识的文件工具：${name}`
}
