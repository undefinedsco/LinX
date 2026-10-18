/**
 * What a grant made from an approval says (R6-D, spec §2).
 *
 * "以后这类交给 LinX 判断" copies the approval's action and target into a grant. For approvals
 * about editing a file that would never match a later edit: the Files-side checks (R6-C
 * `isDelegatedFileEdit`) look for ODRL `modify` (or `use`) on the file or its container, while a
 * proposal approval names the proposal resource and a runtime tool-call approval names the thread.
 * So a file-edit approval yields a `modify` grant on the file the change touches.
 */
import { ODRL } from '@undefineds.co/models'

/** Runtime tool names of LinX's file tools, and the Files proposal tool names. */
const FILE_EDIT_TOOL_NAMES = new Set([
  'files_create',
  'files_edit',
  'files_write',
  'files_set_cell',
  'files_add_column',
  'files.ai.change.proposal',
  'files.structured-cell.proposal',
])

/** Proposal vocab actions that are file edits (not access / source / vocab proposals). */
const FILE_EDIT_ACTIONS = new Set([
  'https://undefineds.co/vocab/reviewAiChangeProposal',
  'https://undefineds.co/vocab/approveStructuredCellChangeProposal',
])

const PROPOSAL_TARGET = /\/\.data\/proposals\/(?:ai|cell)\/[^#]+\.ttl(?:#proposal)?$/

export interface GrantShapeApproval {
  toolName?: string | null
  action?: string | null
  target?: string | null
}

export function isFileEditApproval(approval: GrantShapeApproval): boolean {
  return (approval.toolName ? FILE_EDIT_TOOL_NAMES.has(approval.toolName) : false)
    || (approval.action ? FILE_EDIT_ACTIONS.has(approval.action) : false)
}

/** The proposal resource to read for the file it touches, when the approval points at one. */
export function proposalResourceOfApproval(approval: GrantShapeApproval): string | null {
  const target = approval.target?.trim()
  if (!target || !PROPOSAL_TARGET.test(target)) return null
  return target.split('#', 1)[0]
}

/** The edited file / document named by a stored proposal (Turtle). */
export function readProposalFileTarget(turtle: string): string | null {
  const match = /udfs:targetResource\s+<([^>]+)>/.exec(turtle) ?? /udfs:sourceDocument\s+<([^>]+)>/.exec(turtle)
  return match?.[1] ?? null
}

/**
 * Action and target for the grant. `fileTarget` is the file the change touches when known
 * (otherwise a file-edit approval keeps its own target, which will not match file edits).
 */
export function grantShapeForApproval(
  approval: GrantShapeApproval & { action: string; target: string },
  fileTarget?: string | null,
): { action: string; target: string } {
  if (!isFileEditApproval(approval)) return { action: approval.action, target: approval.target }
  const resolved = fileTarget?.trim()
  return {
    action: ODRL.term('modify'),
    target: resolved || approval.target,
  }
}
